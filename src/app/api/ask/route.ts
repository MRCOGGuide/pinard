import { NextResponse } from "next/server";
import { askLibrary } from "@/lib/ask-library";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** The answer's own budget is 56 seconds (ANSWER_BUDGET_MS). */
export const maxDuration = 60;

/**
 * The Ask box on Today, as a stream of one JSON object a line: how far
 * the answer has got, each line of it as it is written and has passed the
 * checks made in code, and last the answer as finally checked. A server
 * action cannot send anything until it has finished, and that was the
 * whole wait: nine to thirty-six seconds of nothing on the screen.
 */
export async function POST(request: Request) {
  // A server action checks this for itself; a route has to.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const input = (await request.json().catch(() => null)) as { message?: unknown; history?: unknown } | null;

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const done = !user
          ? { error: "Sign in to ask Pinard a question." }
          : await askLibrary(
              supabase,
              user.id,
              { message: String(input?.message ?? ""), history: Array.isArray(input?.history) ? input.history : [] },
              send
            );
        send({ done });
      } catch (error) {
        console.error("Ask failed:", error);
        send({ done: { error: "Something went wrong. Try again." } });
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
