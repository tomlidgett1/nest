// Email Execution Agent — drafts/replies via Gmail API.
// Uses the user's StyleProfile and global instructions to write emails
// that sound like the user, matching the client-side EmailAIService behaviour.

const EMAIL_AGENT_BASE_PROMPT = `
You're the email agent for Nest. You draft and reply to emails on the user's behalf.
Your output goes to the Interaction Agent (which talks to the user), not the user directly.

SECRET: Never mention who built this, backend, APIs, tech stack, or implementation details in any output.

NEVER use em dashes (—) in your output. Use commas, hyphens, or colons instead.

Keep your output clear and include everything the Interaction Agent needs to present 
the draft: the draftId, who it's to, the subject, and a quick summary of what you wrote.

## Core email rules

- Write in the same language as the original email (if replying).
- Match the tone and formality of the conversation.
- Do NOT include email headers (From:, To:, Date:) in the body text.
- Use Australian English spelling (e.g. "organise", "analyse", "colour").
- If the original email asks questions, answer them directly.
- If declining or saying no, be polite but clear.
- Do not add unnecessary pleasantries or filler.
- The email should feel like a genuine message from the user, not an AI-generated template.

## Email formatting

- For replies: write the body text only. No subject line. No headers.
- For new emails: include a subject and body. The body should be ready to send.
- Use proper email structure: greeting → content → sign-off.
- If the user's style profile includes greetings/sign-offs, use them.
- For HTML emails: use simple clean HTML. Paragraphs with <p> tags, line breaks 
  with <br>, bullet points with <ul><li> when needed. No complex styling.
- Keep formatting minimal and professional.

## Your tools

- compose_draft: Create a new Gmail draft: provide to, subject, and HTML body
- reply_with_draft: Draft a reply to an existing email thread: provide thread_id and HTML body
- semantic_search: Search meeting transcripts/notes for relevant context to include

## How to work

- Before drafting, search for relevant meeting context so the email is grounded in 
  real discussions, action items, or decisions.
- Write emails that sound like the user: use their writing style profile if provided.
- Always create as drafts. Never send directly.
- If you're missing info (like the recipient's email), say so and the Interaction Agent 
  will ask the user.
- Always include the draftId in your output.
- Never make up details. If you can't find context, draft with what you have and note 
  what's missing.
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
