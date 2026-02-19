// Ingestion helpers — soft-delete old documents, insert new ones,
// track job progress, extract entities and action items.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmbeddedChunk } from "./embedder.ts";
import { CHUNKING_VERSION } from "./chunker.ts";

// ── Soft-delete stale documents ──────────────────────────────

export async function softDeleteSource(
  supabase: SupabaseClient,
  userId: string,
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("search_documents")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  if (error) {
    console.warn(`[ingestion-helpers] softDeleteSource failed for ${sourceType}:${sourceId}:`, error.message);
  }
}

export async function softDeleteSourceTypes(
  supabase: SupabaseClient,
  userId: string,
  sourceTypes: string[],
): Promise<void> {
  for (const st of sourceTypes) {
    const { error } = await supabase
      .from("search_documents")
      .delete()
      .eq("user_id", userId)
      .eq("source_type", st);

    if (error) {
      console.warn(`[ingestion-helpers] bulk delete ${st}:`, error.message);
    }
  }
}

// ── Insert embedded documents (two-table: search_documents + search_embeddings) ──

const INSERT_BATCH_SIZE = 25;

export interface AccountInfo {
  googleEmail: string | null;
  isPrimary: boolean | null;
}

export async function insertEmbeddedChunks(
  supabase: SupabaseClient,
  userId: string,
  chunks: EmbeddedChunk[],
  account?: AccountInfo,
): Promise<{ inserted: number; errors: number }> {
  if (chunks.length === 0) return { inserted: 0, errors: 0 };

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);

    // Build document rows for batch insert
    const docRows = batch.map((chunk) => {
      const isSummary = chunk.sourceType.endsWith("_summary");
      const row: Record<string, any> = {
        user_id: userId,
        source_type: chunk.sourceType,
        source_id: chunk.sourceId,
        title: chunk.title,
        content_hash: chunk.contentHash,
        metadata: chunk.metadata ?? {},
        is_deleted: false,
      };
      if (account?.googleEmail) row.google_email = account.googleEmail;
      if (account?.isPrimary != null) row.is_primary_account = account.isPrimary;
      if (isSummary) {
        row.summary_text = chunk.text;
      } else {
        row.chunk_text = chunk.text;
      }
      return row;
    });

    // Batch insert documents (ignore conflicts on content_hash)
    const { data: docs, error: docErr } = await supabase
      .from("search_documents")
      .insert(docRows)
      .select("id, content_hash");

    if (docErr) {
      // If batch insert fails (e.g. conflict), fall back to individual inserts
      console.warn(`[ingestion-helpers] batch insert failed, falling back to individual:`, docErr.message);
      for (let j = 0; j < batch.length; j++) {
        try {
          const result = await insertSingleChunk(supabase, userId, batch[j], account);
          if (result) inserted++;
          else errors++;
        } catch {
          errors++;
        }
      }
      continue;
    }

    if (!docs || docs.length === 0) {
      errors += batch.length;
      continue;
    }

    // Build content_hash → doc.id mapping
    const hashToId = new Map<string, string>();
    for (const doc of docs) {
      hashToId.set(doc.content_hash, doc.id);
    }

    // Batch insert embeddings
    const embRows = batch
      .map((chunk) => {
        const docId = hashToId.get(chunk.contentHash);
        if (!docId) return null;
        const row: Record<string, any> = {
          user_id: userId,
          document_id: docId,
          embedding: chunk.embeddingStr,
          embedding_model: "text-embedding-3-large",
          model_version: "2024-01",
        };
        if (account?.googleEmail) row.google_email = account.googleEmail;
        if (account?.isPrimary != null) row.is_primary_account = account.isPrimary;
        return row;
      })
      .filter(Boolean) as Record<string, any>[];

    if (embRows.length > 0) {
      const { error: embErr } = await supabase
        .from("search_embeddings")
        .upsert(embRows, { onConflict: "document_id,embedding_model,model_version" });

      if (embErr) {
        console.error(`[ingestion-helpers] embedding batch upsert failed:`, embErr.message);
        errors += embRows.length;
      } else {
        inserted += embRows.length;
      }
    }

    const missed = batch.length - embRows.length;
    if (missed > 0) errors += missed;
  }

  return { inserted, errors };
}

async function insertSingleChunk(
  supabase: SupabaseClient,
  userId: string,
  chunk: EmbeddedChunk,
  account?: AccountInfo,
): Promise<boolean> {
  const isSummary = chunk.sourceType.endsWith("_summary");
  const docRow: Record<string, any> = {
    user_id: userId,
    source_type: chunk.sourceType,
    source_id: chunk.sourceId,
    title: chunk.title,
    content_hash: chunk.contentHash,
    metadata: chunk.metadata ?? {},
    is_deleted: false,
  };
  if (account?.googleEmail) docRow.google_email = account.googleEmail;
  if (account?.isPrimary != null) docRow.is_primary_account = account.isPrimary;
  if (isSummary) docRow.summary_text = chunk.text;
  else docRow.chunk_text = chunk.text;

  const { data: existing } = await supabase
    .from("search_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("content_hash", chunk.contentHash)
    .maybeSingle();

  let docId: string;
  if (existing) {
    await supabase.from("search_documents").update(docRow).eq("id", existing.id);
    docId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("search_documents")
      .insert(docRow)
      .select("id")
      .single();
    if (error || !created) return false;
    docId = created.id;
  }

  const embRow: Record<string, any> = {
    user_id: userId,
    document_id: docId,
    embedding: chunk.embeddingStr,
    embedding_model: "text-embedding-3-large",
    model_version: "2024-01",
  };
  if (account?.googleEmail) embRow.google_email = account.googleEmail;
  if (account?.isPrimary != null) embRow.is_primary_account = account.isPrimary;

  const { error: embErr } = await supabase
    .from("search_embeddings")
    .upsert(embRow, { onConflict: "document_id,embedding_model,model_version" });

  return !embErr;
}

// ── Job progress tracking ────────────────────────────────────

export async function updateJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  updates: {
    progress?: Record<string, any>;
    total_documents?: number;
    total_chunks?: number;
    total_embeddings?: number;
    status?: string;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("ingestion_jobs")
    .update(updates)
    .eq("id", jobId);

  if (error) {
    console.error(`[ingestion-helpers] updateJobProgress failed for ${jobId}:`, error.message);
  }
}

// ── Entity extraction (lightweight) ──────────────────────────
// Extracts person names and email addresses from text
// without LLM — pure regex/heuristic for zero cost.

interface ExtractedEntity {
  name: string;
  emails: string[];
}

export function extractPersonEntities(
  text: string,
  knownEmails: string[] = [],
): ExtractedEntity[] {
  const entities = new Map<string, Set<string>>();

  // Extract "Name <email>" patterns
  const emailHeaderPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*<([^>]+@[^>]+)>/g;
  let match;
  while ((match = emailHeaderPattern.exec(text)) !== null) {
    const name = match[1].trim();
    const email = match[2].toLowerCase();
    if (!entities.has(name)) entities.set(name, new Set());
    entities.get(name)!.add(email);
  }

  // Extract "From: display name" patterns
  const fromPattern = /From:\s*"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)"?\s*/g;
  while ((match = fromPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (!entities.has(name)) entities.set(name, new Set());
  }

  return [...entities.entries()].map(([name, emails]) => ({
    name,
    emails: [...emails],
  }));
}

// ── Action item extraction (heuristic) ───────────────────────
// Extracts action items from notes/emails without LLM.

export interface ExtractedAction {
  assignee: string | null;
  description: string;
  dueDate: string | null;
}

export function extractActionItems(text: string): ExtractedAction[] {
  const actions: ExtractedAction[] = [];
  const lines = text.split("\n");

  const actionPatterns = [
    /(?:action item|TODO|to-do|follow[- ]up|next step|task):\s*(.+)/i,
    /^\s*[-*]\s*\[[ x]\]\s*(.+)/i,
    /^\s*\d+\.\s*(?:action|follow[- ]up|TODO):\s*(.+)/i,
    /(?:@|assigned to)\s*(\w+(?:\s+\w+)?)\s*[-:]\s*(.+)/i,
  ];

  for (const line of lines) {
    for (const pattern of actionPatterns) {
      const match = line.match(pattern);
      if (match) {
        const description = (match[2] ?? match[1]).trim();
        if (description.length > 5 && description.length < 500) {
          actions.push({
            assignee: match[2] ? match[1].trim() : null,
            description,
            dueDate: null,
          });
        }
        break;
      }
    }
  }

  return actions;
}

// ── Upsert person entities ───────────────────────────────────

export async function upsertPersonEntities(
  supabase: SupabaseClient,
  userId: string,
  entities: ExtractedEntity[],
): Promise<void> {
  for (const entity of entities) {
    const { data: existing } = await supabase
      .from("person_entities")
      .select("id, aliases, email_addresses, mention_count")
      .eq("user_id", userId)
      .eq("canonical_name", entity.name)
      .maybeSingle();

    if (existing) {
      const allEmails = new Set([...(existing.email_addresses ?? []), ...entity.emails]);
      await supabase
        .from("person_entities")
        .update({
          email_addresses: [...allEmails],
          mention_count: (existing.mention_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("person_entities")
        .insert({
          user_id: userId,
          canonical_name: entity.name,
          email_addresses: entity.emails,
          mention_count: 1,
          last_seen_at: new Date().toISOString(),
        });
    }
  }
}

// ── Upsert action items ─────────────────────────────────────

export async function upsertActionItems(
  supabase: SupabaseClient,
  userId: string,
  sourceType: string,
  sourceId: string,
  actions: ExtractedAction[],
): Promise<void> {
  if (actions.length === 0) return;

  // Delete old actions for this source to avoid duplicates
  await supabase
    .from("action_items")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  const rows = actions.map((a) => ({
    user_id: userId,
    source_type: sourceType,
    source_id: sourceId,
    assignee: a.assignee,
    description: a.description,
    due_date: a.dueDate,
  }));

  const { error } = await supabase.from("action_items").insert(rows);
  if (error) {
    console.warn(`[ingestion-helpers] action items insert failed:`, error.message);
  }
}

// ── Check if source has changed (skip-if-unchanged) ─────────

export async function sourceNeedsUpdate(
  supabase: SupabaseClient,
  userId: string,
  sourceType: string,
  sourceId: string,
  newContentHash: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("search_documents")
    .select("content_hash")
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("chunk_index", 0)
    .maybeSingle();

  if (!data) return true;
  return data.content_hash !== newContentHash;
}
