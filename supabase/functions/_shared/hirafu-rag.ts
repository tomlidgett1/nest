// hirafu-rag.ts — Server-side RAG pipeline for Hirafu.
//
// Reuses the same search_documents / semantic_chunks tables as Nest
// since indexed content is user-scoped. This module re-exports the
// existing RAG functions with Hirafu-specific logging prefixes.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  serverSideRAG as _serverSideRAG,
  targetedRAG as _targetedRAG,
  calendarOnlyRAG as _calendarOnlyRAG,
} from "./server-rag.ts";

export async function serverSideRAG(
  message: string,
  recentChat: Array<{ role: string; content: string }>,
  userId: string,
  supabase: SupabaseClient,
  timezone = "UTC",
): Promise<string> {
  console.log(`[hirafu-rag] Running full pipeline for user ${userId}`);
  return _serverSideRAG(message, recentChat, userId, supabase, timezone);
}

export async function targetedRAG(
  message: string,
  recentChat: Array<{ role: string; content: string }>,
  userId: string,
  supabase: SupabaseClient,
  searchQueries: string[],
  sourceFilters: string[] | null,
  timezone = "UTC",
): Promise<string> {
  console.log(`[hirafu-rag] Targeted retrieval for user ${userId}`);
  return _targetedRAG(message, recentChat, userId, supabase, searchQueries, sourceFilters, timezone);
}

export async function calendarOnlyRAG(
  message: string,
  userId: string,
  supabase: SupabaseClient,
  timezone = "UTC",
): Promise<string> {
  console.log(`[hirafu-rag] Calendar-only retrieval for user ${userId}`);
  return _calendarOnlyRAG(message, userId, supabase, timezone);
}
