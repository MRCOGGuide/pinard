import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// TEMPORARY, on a branch only, for a preview deployment: how long a function may run, and how deep it may call itself.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const seconds = Number(url.searchParams.get("s") ?? "0");
  const hop = Number(url.searchParams.get("hop") ?? "-1");
  const started = Date.now();
  if (seconds) await new Promise((done) => setTimeout(done, seconds * 1000));
  if (hop >= 0 && hop < 8) {
    const next = await fetch(`${url.origin}/api/reminders/probe?hop=${hop + 1}`).catch((e) => ({ status: 0, text: async () => String(e) }));
    const body = (await next.text()).slice(0, 300);
    return NextResponse.json({ hop, nextStatus: next.status, next: body });
  }
  return NextResponse.json({ ms: Date.now() - started, hop });
}
