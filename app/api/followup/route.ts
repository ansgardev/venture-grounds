import Anthropic from "@anthropic-ai/sdk";
import { KB } from "@/lib/kb";
import { buildFollowupSystem } from "@/lib/prompts";

export const maxDuration = 120;

const ALLOWED_MODELS = ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6"];

type ThreadTurn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const { idea, analysis, thread, question, model } = await req.json();

  if (!question || typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  const chosenModel = ALLOWED_MODELS.includes(model) ? model : "claude-fable-5";
  const client = new Anthropic();

  const priorThread: ThreadTurn[] = Array.isArray(thread)
    ? thread
        .filter(
          (t: any) =>
            t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
        )
        .slice(-12) // keep the thread bounded
    : [];

  const contextBlock = `FOUNDER'S ORIGINAL IDEA:\n${String(idea || "").slice(0, 12000)}\n\nYOUR PRIOR ANALYSIS (JSON):\n${JSON.stringify(analysis ?? {}).slice(0, 20000)}`;

  const messages: ThreadTurn[] = [
    { role: "user", content: contextBlock },
    {
      role: "assistant",
      content:
        "Understood. I have the founder's idea and my prior corpus-grounded analysis in front of me. Ready for follow-up questions.",
    },
    ...priorThread,
    { role: "user", content: question.trim().slice(0, 4000) },
  ];

  const stream = client.messages.stream({
    model: chosenModel,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: buildFollowupSystem(KB),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
