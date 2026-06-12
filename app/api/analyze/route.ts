import Anthropic from "@anthropic-ai/sdk";
import { KB } from "@/lib/kb";
import { buildAnalysisSystem } from "@/lib/prompts";

export const maxDuration = 300; // allow long Fable 5 deliberations (Vercel caps by plan)

const ALLOWED_MODELS = ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6"];

export async function POST(req: Request) {
  const { idea, model } = await req.json();

  if (!idea || typeof idea !== "string" || idea.trim().length < 30) {
    return Response.json(
      { error: "Describe your idea in at least a few sentences." },
      { status: 400 }
    );
  }
  if (idea.length > 12000) {
    return Response.json({ error: "Brief is too long — trim to ~12,000 characters." }, { status: 400 });
  }

  const chosenModel = ALLOWED_MODELS.includes(model) ? model : "claude-fable-5";
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const stream = client.messages.stream({
    model: chosenModel,
    max_tokens: 8000,
    // Prompt caching: the ~10K-token KB system prompt is cached between runs,
    // cutting cost ~90% and latency substantially on repeat analyses.
    system: [
      {
        type: "text",
        text: buildAnalysisSystem(KB),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Founder's idea:\n\n${idea.trim()}\n\nReturn the structured JSON analysis as specified.`,
      },
    ],
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
