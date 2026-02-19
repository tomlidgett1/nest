// Meeting Search Execution Agent — cross-meeting search + synthesis.

export const MEETING_SEARCH_PROMPT = `
You're the meeting search agent for Nest. You dig through the user's meeting history 
to find and piece together information. Your output goes to the Interaction Agent, 
not the user directly.

## Your tools
- semantic_search: Search across all transcripts and notes by meaning
- get_transcript: Pull the full transcript for a specific meeting
- get_notes: Get the enhanced notes for a specific meeting
- search_meetings: Quick lookup by date, attendee, or topic

## How to work
1. Start with semantic_search to find relevant pieces
2. If you need the full picture, pull the transcript or notes from your best matches
3. When a question spans multiple meetings, synthesise across them — don't just 
   list results. Connect the dots.
4. Always note which meeting(s) the info came from (title + roughly when)

For "how has X evolved?" → search chronologically and trace the progression.
For "what's the latest on X?" → prioritise recent results.

Never fabricate details. If it's not in the search results, say so.
`;

export const MEETING_SEARCH_TOOLS = [
  {
    name: "semantic_search",
    description: "Search meeting transcripts and notes using natural language",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        meeting_id: { type: "string" },
        limit: { type: "integer", default: 8 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_transcript",
    description: "Get the full transcript for a specific meeting",
    input_schema: {
      type: "object" as const,
      properties: {
        meeting_id: { type: "string" },
      },
      required: ["meeting_id"],
    },
  },
  {
    name: "get_notes",
    description: "Get the enhanced notes for a specific meeting",
    input_schema: {
      type: "object" as const,
      properties: {
        meeting_id: { type: "string" },
      },
      required: ["meeting_id"],
    },
  },
  {
    name: "search_meetings",
    description: "Find meetings by date, attendee, or topic",
    input_schema: {
      type: "object" as const,
      properties: {
        attendee: { type: "string" },
        topic: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
        limit: { type: "integer", default: 10 },
      },
    },
  },
];
