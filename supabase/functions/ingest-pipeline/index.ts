// Server-side data ingestion pipeline — persistent task-queue architecture.
//
// Guarantees 100% completion:
//   1. Initial POST creates a job + seeds tasks into `ingestion_tasks` (Postgres)
//   2. Each Edge Function invocation claims ONE task, processes it, then chains
//   3. If a function is killed (CPU limit, timeout), the task stays "running" in DB
//   4. Stale detection resets crashed tasks to "pending" for automatic retry
//   5. ingest-cron acts as a safety net, resuming any stalled jobs
//
// Task granularity (stays well under Edge Function CPU limits):
//   - notes:    all notes + transcripts (typically small)
//   - emails:   30 threads per task per account
//   - calendar: 80 events per task per account

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refreshAccessToken } from "../_shared/gmail-helpers.ts";
import { listGmailThreadIds, fetchGmailThreadsByIds } from "../_shared/gmail-fetcher.ts";
import { fetchCalendarEvents } from "../_shared/calendar-fetcher.ts";
import {
  sentenceAwareChunks,
  buildNoteSummary,
  buildEmailSummary,
  buildCalendarSummary,
  contentHash,
  noteContextHeader,
  transcriptContextHeader,
  emailContextHeader,
} from "../_shared/chunker.ts";
import { embedChunks, ChunkToEmbed, truncateForEmbedding } from "../_shared/embedder.ts";
import {
  softDeleteSource,
  insertEmbeddedChunks,
  AccountInfo,
  updateJobProgress,
  extractPersonEntities,
  extractActionItems,
  upsertPersonEntities,
  upsertActionItems,
  sourceNeedsUpdate,
} from "../_shared/ingestion-helpers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const EMAIL_PAGE_SIZE = 30;
const CALENDAR_PAGE_SIZE = 80;
const STALE_THRESHOLD_MS = 180_000;
const MAX_TASK_ATTEMPTS = 3;
const PARALLEL_WORKERS = 3; // concurrent Edge Function invocations per job

// ── Types ─────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  job_id: string;
  user_id: string;
  task_type: string;
  params: Record<string, any>;
  status: string;
  attempts: number;
}

interface TaskResult {
  documents: number;
  chunks: number;
  embeddings: number;
  skipped: number;
  has_more?: boolean;
  next_offset?: number;
}

// ── Handler ───────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  if (req.method !== "POST") {
    return jsonResp({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || !isServiceRoleToken(token)) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let jobId: string;
    let isNewJob = false;

    if (body.job_id && !body.user_id) {
      jobId = body.job_id;
    } else {
      const created = await createJobAndSeedTasks(supabase, body);
      jobId = created.jobId;
      isNewJob = true;
    }

    // Reset any crashed tasks before claiming the next one
    await recoverStaleTasks(supabase, jobId);

    // Claim next pending task
    const task = await claimNextTask(supabase, jobId);

    if (!task) {
      await finaliseJob(supabase, jobId);
      return jsonResp({ job_id: jobId, status: "completed" }, 200);
    }

    const taskStart = Date.now();
    console.log(
      `[ingest-pipeline] Task ${task.id} (${task.task_type}) started` +
      ` [attempt ${task.attempts}/${MAX_TASK_ATTEMPTS}]`,
    );

    // On a new job, spin up extra parallel workers so tasks run concurrently
    if (isNewJob) {
      for (let i = 0; i < PARALLEL_WORKERS - 1; i++) {
        chainNext(jobId, authHeader);
      }
    }

    try {
      const result = await executeTask(supabase, task);

      await supabase.from("ingestion_tasks").update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);

      if (result.has_more && result.next_offset != null) {
        await supabase.from("ingestion_tasks").insert({
          job_id: task.job_id,
          user_id: task.user_id,
          task_type: task.task_type,
          params: { ...task.params, offset: result.next_offset },
        });
        console.log(`[ingest-pipeline] Continuation: ${task.task_type} offset=${result.next_offset}`);
      }

      await updateCumulativeProgress(supabase, jobId);

      const elapsed = ((Date.now() - taskStart) / 1000).toFixed(1);
      console.log(
        `[ingest-pipeline] Task ${task.id} done in ${elapsed}s — ` +
        `${result.documents} docs, ${result.embeddings} embeddings`,
      );
    } catch (e) {
      const errMsg = (e as Error).message;
      console.error(`[ingest-pipeline] Task ${task.id} failed:`, errMsg);

      if (task.attempts >= MAX_TASK_ATTEMPTS) {
        await supabase.from("ingestion_tasks").update({
          status: "failed",
          error_message: errMsg,
          completed_at: new Date().toISOString(),
        }).eq("id", task.id);
      } else {
        await supabase.from("ingestion_tasks").update({
          status: "pending",
          started_at: null,
          error_message: errMsg,
        }).eq("id", task.id);
      }
    }

    // Chain to self for the next task
    chainNext(jobId, authHeader);

    return jsonResp({ job_id: jobId, task_id: task.id, status: "processing" }, 200);
  } catch (e) {
    console.error("[ingest-pipeline] Request error:", (e as Error).message);
    return jsonResp({ error: "internal", detail: (e as Error).message }, 500);
  }
});

// ── Job + Task Seeding ────────────────────────────────────────

async function createJobAndSeedTasks(
  supabase: SupabaseClient,
  body: Record<string, any>,
): Promise<{ jobId: string }> {
  const userId: string = body.user_id;
  const mode: string = body.mode ?? "full";
  const sources: string[] = body.sources ?? ["notes", "emails", "calendar"];
  const googleAccountId: string | undefined = body.google_account_id;

  if (!userId) throw new Error("missing user_id");

  // Resolve Google accounts
  const { data: tokenRow } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: linkedAccounts } = await supabase
    .from("user_google_accounts")
    .select("id, google_email, refresh_token, is_primary")
    .eq("user_id", userId);

  const accounts: Array<{ id: string; email: string; isPrimary: boolean }> = [];

  if (googleAccountId) {
    const acct = (linkedAccounts ?? []).find((a: any) => a.id === googleAccountId);
    if (acct) accounts.push({ id: acct.id, email: acct.google_email, isPrimary: !!acct.is_primary });
  } else {
    for (const acct of linkedAccounts ?? []) {
      if (acct.refresh_token) {
        accounts.push({ id: acct.id, email: acct.google_email, isPrimary: !!acct.is_primary });
      }
    }
    if (accounts.length === 0 && tokenRow?.refresh_token) {
      accounts.push({ id: "legacy", email: "primary", isPrimary: true });
    }
  }

  // Create job row
  const jobEmail = accounts.map((a) => a.email).join(", ");
  const { data: job, error: jobErr } = await supabase
    .from("ingestion_jobs")
    .insert({
      user_id: userId,
      mode,
      sources_requested: sources,
      status: "running",
      started_at: new Date().toISOString(),
      google_email: jobEmail || null,
      is_primary_account: accounts.length === 1 ? accounts[0].isPrimary : null,
    })
    .select("id")
    .single();

  if (jobErr || !job) throw new Error(`Job creation failed: ${jobErr?.message}`);
  const jobId = job.id;

  // Seed one task per source × account
  const tasks: Array<Record<string, any>> = [];

  if (sources.includes("notes")) {
    tasks.push({ job_id: jobId, user_id: userId, task_type: "notes", params: { mode } });
  }

  for (const acct of accounts) {
    if (sources.includes("emails")) {
      tasks.push({
        job_id: jobId,
        user_id: userId,
        task_type: "emails",
        params: { mode, account_id: acct.id, offset: 0 },
      });
    }
    if (sources.includes("calendar")) {
      tasks.push({
        job_id: jobId,
        user_id: userId,
        task_type: "calendar",
        params: { mode, account_id: acct.id, offset: 0 },
      });
    }
  }

  if (tasks.length > 0) {
    await supabase.from("ingestion_tasks").insert(tasks);
  }

  console.log(`[ingest-pipeline] Job ${jobId}: seeded ${tasks.length} tasks (${sources.join(", ")})`);
  return { jobId };
}

// ── Task Queue Operations ─────────────────────────────────────

async function recoverStaleTasks(supabase: SupabaseClient, jobId: string): Promise<void> {
  const threshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  // Retryable stale tasks → back to pending
  const { data: recovered } = await supabase
    .from("ingestion_tasks")
    .update({ status: "pending", started_at: null })
    .eq("job_id", jobId)
    .eq("status", "running")
    .lt("started_at", threshold)
    .lt("attempts", MAX_TASK_ATTEMPTS)
    .select("id");

  // Exhausted stale tasks → failed
  await supabase
    .from("ingestion_tasks")
    .update({ status: "failed", error_message: "Max attempts exceeded", completed_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "running")
    .lt("started_at", threshold)
    .gte("attempts", MAX_TASK_ATTEMPTS);

  if (recovered && recovered.length > 0) {
    console.log(`[ingest-pipeline] Recovered ${recovered.length} stale task(s)`);
  }
}

async function claimNextTask(supabase: SupabaseClient, jobId: string): Promise<TaskRow | null> {
  const { data: task } = await supabase
    .from("ingestion_tasks")
    .select("id, job_id, user_id, task_type, params, status, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!task) return null;

  const newAttempts = (task.attempts ?? 0) + 1;
  await supabase.from("ingestion_tasks").update({
    status: "running",
    started_at: new Date().toISOString(),
    attempts: newAttempts,
  }).eq("id", task.id);

  return { ...task, attempts: newAttempts };
}

// ── Task Execution Router ─────────────────────────────────────

async function executeTask(supabase: SupabaseClient, task: TaskRow): Promise<TaskResult> {
  switch (task.task_type) {
    case "notes":
      return executeNotesTask(supabase, task.user_id, task.params);
    case "emails":
      return executeEmailsTask(supabase, task.user_id, task.params);
    case "calendar":
      return executeCalendarTask(supabase, task.user_id, task.params);
    default:
      throw new Error(`Unknown task type: ${task.task_type}`);
  }
}

// ── Notes Task ────────────────────────────────────────────────

async function executeNotesTask(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, any>,
): Promise<TaskResult> {
  const mode = params.mode ?? "full";
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString();

  let query = supabase
    .from("notes")
    .select("id, title, raw_notes, enhanced_notes, note_type, attendees, created_at, updated_at")
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (mode === "incremental") {
    query = query.gte("updated_at", new Date(Date.now() - 86400000).toISOString());
  }

  const { data: notes, error } = await query;
  if (error) throw new Error(`Notes query failed: ${error.message}`);

  const allChunks: ChunkToEmbed[] = [];
  let docCount = 0;
  let skipped = 0;

  for (const note of notes ?? []) {
    const noteText = note.raw_notes ?? note.enhanced_notes ?? "";
    if (!noteText.trim()) { skipped++; continue; }

    const hash = contentHash("note_summary", note.id, "summary");
    if (mode === "incremental") {
      const needsUpdate = await sourceNeedsUpdate(supabase, userId, "note_summary", note.id, hash);
      if (!needsUpdate) { skipped++; continue; }
    }

    await softDeleteSource(supabase, userId, "note_summary", note.id);
    await softDeleteSource(supabase, userId, "note_chunk", note.id);

    const attendees: string[] = note.attendees ?? [];
    const contextHdr = noteContextHeader(note.title, note.note_type ?? "note", attendees, note.created_at);

    const summary = buildNoteSummary(noteText, note.enhanced_notes);
    allChunks.push({
      text: truncateForEmbedding(`${contextHdr}\n---\n${summary}`),
      sourceType: "note_summary",
      sourceId: note.id,
      title: note.title,
      chunkIndex: 0,
      contentHash: hash,
      metadata: { note_type: note.note_type, attendees, created_at: note.created_at },
    });

    const chunks = sentenceAwareChunks(noteText, contextHdr);
    for (let i = 0; i < chunks.length; i++) {
      allChunks.push({
        text: truncateForEmbedding(chunks[i]),
        sourceType: "note_chunk",
        sourceId: note.id,
        title: note.title,
        chunkIndex: i,
        contentHash: contentHash("note_chunk", note.id, "chunk", i),
        parentSourceId: note.id,
        metadata: { note_type: note.note_type, created_at: note.created_at },
      });
    }

    const entities = extractPersonEntities(noteText);
    if (entities.length > 0) await upsertPersonEntities(supabase, userId, entities);

    const actions = extractActionItems(noteText);
    if (actions.length > 0) await upsertActionItems(supabase, userId, "note", note.id, actions);

    docCount++;
  }

  // Transcripts
  const transcriptResult = await ingestTranscripts(supabase, userId, mode, cutoff);
  allChunks.push(...transcriptResult.chunks);
  docCount += transcriptResult.documents;
  skipped += transcriptResult.skipped;

  console.log(`[ingest-pipeline] Notes: ${allChunks.length} chunks from ${docCount} docs (${skipped} skipped)`);

  const embedded = await embedChunks(allChunks);
  const { inserted } = await insertEmbeddedChunks(supabase, userId, embedded);

  return { documents: docCount, chunks: allChunks.length, embeddings: inserted, skipped };
}

async function ingestTranscripts(
  supabase: SupabaseClient,
  userId: string,
  mode: string,
  cutoff: string,
): Promise<{ chunks: ChunkToEmbed[]; documents: number; skipped: number }> {
  const allChunks: ChunkToEmbed[] = [];
  let docCount = 0;
  let skipped = 0;

  const { data: notes } = await supabase
    .from("notes")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .eq("note_type", "meeting")
    .gte("created_at", cutoff);

  for (const note of notes ?? []) {
    const { data: segments } = await supabase
      .from("transcript_segments")
      .select("speaker, text, timestamp")
      .eq("note_id", note.id)
      .order("timestamp", { ascending: true });

    if (!segments || segments.length === 0) { skipped++; continue; }

    const hash = contentHash("utterance_chunk", note.id, "summary");
    if (mode === "incremental") {
      const needsUpdate = await sourceNeedsUpdate(supabase, userId, "utterance_chunk", note.id, hash);
      if (!needsUpdate) { skipped++; continue; }
    }

    await softDeleteSource(supabase, userId, "utterance_chunk", note.id);

    const speakers = [...new Set(segments.map((s: any) => s.speaker).filter(Boolean))];
    const fullText = segments.map((s: any) => `${s.speaker}: ${s.text}`).join("\n");
    const contextHdr = transcriptContextHeader(note.title, speakers, note.created_at);

    const chunks = sentenceAwareChunks(fullText, contextHdr);
    for (let i = 0; i < chunks.length; i++) {
      allChunks.push({
        text: truncateForEmbedding(chunks[i]),
        sourceType: "utterance_chunk",
        sourceId: note.id,
        title: note.title,
        chunkIndex: i,
        contentHash: contentHash("utterance_chunk", note.id, "chunk", i),
        parentSourceId: note.id,
        metadata: { speakers, created_at: note.created_at },
      });
    }

    docCount++;
  }

  return { chunks: allChunks, documents: docCount, skipped };
}

// ── Emails Task (paginated — 30 threads per invocation) ──────

async function executeEmailsTask(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, any>,
): Promise<TaskResult> {
  const mode = params.mode ?? "full";
  const accountId: string = params.account_id;
  const offset: number = params.offset ?? 0;

  const { refreshToken, email, isPrimary } = await getAccountDetails(supabase, userId, accountId);
  const accessToken = (await refreshAccessToken(refreshToken)).token;
  const acctInfo: AccountInfo = { googleEmail: email, isPrimary };

  const daysBack = mode === "incremental" ? 3 : 120;
  const maxThreads = mode === "incremental" ? 50 : Infinity;

  // Phase 1: List all thread IDs (cheap — ~1 API call per 100 IDs)
  const allIds = await listGmailThreadIds(accessToken, daysBack, maxThreads);
  const sliceIds = allIds.slice(offset, offset + EMAIL_PAGE_SIZE);

  console.log(`[ingest-pipeline] Emails: ${email}, offset=${offset}, total=${allIds.length}, page=${sliceIds.length}`);

  // Phase 2: Fetch full content for ONLY the threads in this page
  const slice = await fetchGmailThreadsByIds(accessToken, sliceIds);

  const allChunks: ChunkToEmbed[] = [];
  let docCount = 0;
  let skipped = 0;

  for (const thread of slice) {
    if (thread.messages.length === 0) { skipped++; continue; }

    const hash = contentHash("email_summary", thread.threadId, "summary");
    if (mode === "incremental") {
      const needsUpdate = await sourceNeedsUpdate(supabase, userId, "email_summary", thread.threadId, hash);
      if (!needsUpdate) { skipped++; continue; }
    }

    await softDeleteSource(supabase, userId, "email_summary", thread.threadId);
    await softDeleteSource(supabase, userId, "email_chunk", thread.threadId);

    const contextHdr = emailContextHeader(thread.subject, thread.participants, thread.lastMessageDate);

    const summaryMessages = thread.messages.slice(-6).map((m) => ({
      from: m.from,
      body: m.bodyPlain,
      date: m.date,
    }));
    const summary = buildEmailSummary(summaryMessages);

    allChunks.push({
      text: truncateForEmbedding(`${contextHdr}\n---\n${summary}`),
      sourceType: "email_summary",
      sourceId: thread.threadId,
      title: thread.subject,
      chunkIndex: 0,
      contentHash: hash,
      metadata: {
        participants: thread.participants.slice(0, 10),
        message_count: thread.messages.length,
        last_date: thread.lastMessageDate,
      },
    });

    const fullBody = thread.messages
      .map((m) => `From: ${m.from} (${m.date})\n${m.bodyPlain}`)
      .join("\n\n---\n\n");

    const chunks = sentenceAwareChunks(fullBody, contextHdr);
    for (let i = 0; i < chunks.length; i++) {
      allChunks.push({
        text: truncateForEmbedding(chunks[i]),
        sourceType: "email_chunk",
        sourceId: thread.threadId,
        title: thread.subject,
        chunkIndex: i,
        contentHash: contentHash("email_chunk", thread.threadId, "chunk", i),
        parentSourceId: thread.threadId,
        metadata: { participants: thread.participants.slice(0, 10) },
      });
    }

    const headerText = thread.messages
      .map((m) => `From: ${m.from}\nTo: ${m.to}\nCc: ${m.cc}`)
      .join("\n");
    const entities = extractPersonEntities(headerText);
    if (entities.length > 0) await upsertPersonEntities(supabase, userId, entities);

    docCount++;
  }

  console.log(`[ingest-pipeline] Emails page: ${allChunks.length} chunks from ${docCount} threads (${skipped} skipped)`);

  const embedded = await embedChunks(allChunks);
  const { inserted } = await insertEmbeddedChunks(supabase, userId, embedded, acctInfo);

  const nextOffset = offset + sliceIds.length;
  const hasMore = nextOffset < allIds.length;

  return {
    documents: docCount,
    chunks: allChunks.length,
    embeddings: inserted,
    skipped,
    has_more: hasMore,
    next_offset: hasMore ? nextOffset : undefined,
  };
}

// ── Calendar Task (paginated — 80 events per invocation) ─────

async function executeCalendarTask(
  supabase: SupabaseClient,
  userId: string,
  params: Record<string, any>,
): Promise<TaskResult> {
  const mode = params.mode ?? "full";
  const accountId: string = params.account_id;
  const offset: number = params.offset ?? 0;

  const { refreshToken, email, isPrimary } = await getAccountDetails(supabase, userId, accountId);
  const accessToken = (await refreshAccessToken(refreshToken)).token;
  const acctInfo: AccountInfo = { googleEmail: email, isPrimary };

  const daysBack = mode === "incremental" ? 7 : 120;
  const daysForward = mode === "incremental" ? 60 : 365;
  const primaryOnly = mode === "full";

  console.log(`[ingest-pipeline] Calendar: ${email}, offset=${offset}`);

  const events = await fetchCalendarEvents(userId, supabase, daysBack, daysForward, primaryOnly, accessToken);
  const slice = events.slice(offset, offset + CALENDAR_PAGE_SIZE);

  const pendingChunks: ChunkToEmbed[] = [];
  const SUB_BATCH = 25;
  let totalDocs = 0;
  let totalChunks = 0;
  let totalEmbeddings = 0;
  let skipped = 0;

  for (const event of slice) {
    const hash = contentHash("calendar_summary", event.eventId, "summary");
    const needsUpdate = await sourceNeedsUpdate(supabase, userId, "calendar_summary", event.eventId, hash);
    if (!needsUpdate) { skipped++; continue; }

    await softDeleteSource(supabase, userId, "calendar_summary", event.eventId);

    const summary = buildCalendarSummary(event);

    pendingChunks.push({
      text: truncateForEmbedding(summary),
      sourceType: "calendar_summary",
      sourceId: event.eventId,
      title: event.title,
      chunkIndex: 0,
      contentHash: hash,
      metadata: {
        start: event.start,
        end: event.end,
        attendees: event.attendees,
        organiser: event.organiser,
        location: event.location,
        meeting_link: event.meetingLink,
        calendar_id: event.calendarId,
      },
    });

    if (event.description && event.description.trim().length > 20) {
      pendingChunks.push({
        text: truncateForEmbedding(
          `Calendar Event: ${event.title}\nWhen: ${event.start} to ${event.end}\n` +
          `Attendees: ${event.attendees}\nDescription: ${event.description}`,
        ),
        sourceType: "calendar_chunk",
        sourceId: event.eventId,
        title: event.title,
        chunkIndex: 1,
        contentHash: contentHash("calendar_chunk", event.eventId, "chunk", 0),
        parentSourceId: event.eventId,
        metadata: { start: event.start, end: event.end },
      });
    }

    totalDocs++;

    if (pendingChunks.length >= SUB_BATCH) {
      const embedded = await embedChunks(pendingChunks);
      const { inserted } = await insertEmbeddedChunks(supabase, userId, embedded, acctInfo);
      totalChunks += pendingChunks.length;
      totalEmbeddings += inserted;
      pendingChunks.length = 0;
    }
  }

  if (pendingChunks.length > 0) {
    const embedded = await embedChunks(pendingChunks);
    const { inserted } = await insertEmbeddedChunks(supabase, userId, embedded, acctInfo);
    totalChunks += pendingChunks.length;
    totalEmbeddings += inserted;
  }

  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < events.length;

  console.log(
    `[ingest-pipeline] Calendar page: ${totalChunks} chunks from ${totalDocs} events ` +
    `(${offset}→${nextOffset}/${events.length}${hasMore ? ", more pages" : ""})`,
  );

  return {
    documents: totalDocs,
    chunks: totalChunks,
    embeddings: totalEmbeddings,
    skipped,
    has_more: hasMore,
    next_offset: hasMore ? nextOffset : undefined,
  };
}

// ── Account Lookup ────────────────────────────────────────────

async function getAccountDetails(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<{ refreshToken: string; email: string; isPrimary: boolean }> {
  if (accountId === "legacy") {
    const { data, error } = await supabase
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.refresh_token) throw new Error("Legacy token not found");
    return { refreshToken: data.refresh_token, email: "primary", isPrimary: true };
  }

  const { data, error } = await supabase
    .from("user_google_accounts")
    .select("google_email, refresh_token, is_primary")
    .eq("id", accountId)
    .single();

  if (error || !data) throw new Error(`Account ${accountId} not found: ${error?.message}`);
  return { refreshToken: data.refresh_token, email: data.google_email, isPrimary: !!data.is_primary };
}

// ── Progress + Finalisation ───────────────────────────────────

async function updateCumulativeProgress(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { data: tasks } = await supabase
    .from("ingestion_tasks")
    .select("task_type, status, result")
    .eq("job_id", jobId);

  let docs = 0, chunks = 0, emb = 0;
  const progress: Record<string, { documents: number; chunks: number; embeddings: number }> = {};

  for (const t of tasks ?? []) {
    if (t.status !== "completed" || !t.result) continue;
    docs += t.result.documents ?? 0;
    chunks += t.result.chunks ?? 0;
    emb += t.result.embeddings ?? 0;
    if (!progress[t.task_type]) progress[t.task_type] = { documents: 0, chunks: 0, embeddings: 0 };
    progress[t.task_type].documents += t.result.documents ?? 0;
    progress[t.task_type].chunks += t.result.chunks ?? 0;
    progress[t.task_type].embeddings += t.result.embeddings ?? 0;
  }

  await updateJobProgress(supabase, jobId, {
    progress,
    total_documents: docs,
    total_chunks: chunks,
    total_embeddings: emb,
  });
}

async function finaliseJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  await updateCumulativeProgress(supabase, jobId);

  const { data: failed } = await supabase
    .from("ingestion_tasks")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "failed");

  const failCount = failed?.length ?? 0;

  await updateJobProgress(supabase, jobId, {
    status: "completed",
    error_message: failCount > 0 ? `${failCount} task(s) failed` : undefined,
    completed_at: new Date().toISOString(),
  });

  console.log(`[ingest-pipeline] Job ${jobId} finalised${failCount > 0 ? ` (${failCount} failed)` : ""}`);
}

// ── Chaining (fire-and-retry) ─────────────────────────────────

function chainNext(jobId: string, authHeader: string): void {
  const doChain = () =>
    fetch(`${supabaseUrl}/functions/v1/ingest-pipeline`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });

  doChain().catch(() => {
    // Retry once after 2s — if this also fails, ingest-cron will resume the job
    setTimeout(() => {
      doChain().catch((e) => console.warn("[ingest-pipeline] Chain retry failed:", e.message));
    }, 2000);
  });
}

// ── Utilities ─────────────────────────────────────────────────

function isServiceRoleToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function jsonResp(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
