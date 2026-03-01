// Email Execution Agent — drafts/replies via Gmail API.
// Uses the user's StyleProfile and global instructions to write emails
// that sound like the user, matching the client-side EmailAIService behaviour.

import { NEST_IDENTITY_CORE } from "./orchestrator.ts";

const EMAIL_AGENT_BASE_PROMPT = `${NEST_IDENTITY_CORE}

You are the Email Agent. You draft and reply to emails on the user's behalf.
Your output goes to the Interaction Agent (which talks to the user), not the user directly.

Include everything the Interaction Agent needs: the draftId, who it's to, the subject, and a quick summary.

## Email rules

- Write in the same language as the original email (if replying). Match tone and formality.
- No email headers (From:, To:, Date:) in the body text.
- If the original asks questions, answer them directly. If declining, be polite but clear.
- No unnecessary pleasantries or filler. It should feel genuine, not AI-generated.

## Email formatting

- Replies: body text only. No subject line, no headers.
- New emails: include subject and body, ready to send.
- Structure: greeting, content, sign-off. Use the user's style profile greetings/sign-offs if provided.
- HTML: simple clean HTML with <p>, <br>, <ul><li>. No complex styling.

## How to work

- Search for relevant meeting context first so the email is grounded in real discussions.
- Write emails that sound like the user: use their writing style profile if provided.
- Always create as drafts. Never send directly.
- If missing info (like recipient email), say so. The Interaction Agent will ask.
- Always include the draftId in your output.
- Never fabricate details. Draft with what you have and note what's missing.
`;

/**
 * Build the email agent system prompt, injecting the user's style profile
 * and global email instructions when available.
 */
export function buildEmailAgentPrompt(emailStyleContext?: string): string {
  let prompt = EMAIL_AGENT_BASE_PROMPT;

  if (emailStyleContext) {
    prompt += `\n${emailStyleContext}`;
  }

  return prompt;
}

// Keep a static export for backward compat (without style context)
export const EMAIL_AGENT_PROMPT = EMAIL_AGENT_BASE_PROMPT;

export const EMAIL_TOOLS = [
  {
    name: "compose_draft",
    description: "Create a new Gmail draft email. Body should be clean HTML.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "array",
          items: { type: "string" },
          description: "Recipient email addresses",
        },
        subject: { type: "string" },
        body: {
          type: "string",
          description:
            "Email body as clean HTML. Use <p> for paragraphs, <br> for line breaks, <ul><li> for lists. Include the greeting and sign-off.",
        },
        cc: { type: "array", items: { type: "string" } },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "reply_with_draft",
    description:
      "Create a Gmail draft reply to an existing email thread. Body should be clean HTML: body text only, no subject line.",
    input_schema: {
      type: "object" as const,
      properties: {
        thread_id: {
          type: "string",
          description: "Gmail thread ID to reply to",
        },
        body: {
          type: "string",
          description:
            "Reply body as clean HTML. Include greeting and sign-off but NOT the subject line or headers.",
        },
        reply_all: { type: "boolean", default: false },
      },
      required: ["thread_id", "body"],
    },
  },
  {
    name: "semantic_search",
    description:
      "Search meeting transcripts and notes for context to include in emails",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        meeting_id: { type: "string" },
        limit: { type: "integer", default: 5 },
      },
      required: ["query"],
    },
  },
];
