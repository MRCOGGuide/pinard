import { after, NextResponse } from "next/server";
import { carriesCronSecret } from "@/lib/cron-auth";
import { STALLED_MS, callNextStep, readSearch, startSearch, stepSearch, writeSearch, type AidSearch } from "@/lib/decision-aid-extract";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A search for the decision aids in one source. The owner's button and
 * the end of ingestion start it; after that each step does one thing,
 * answers, and calls the next, so no single run has to outlast the time
 * limit. A step that fails records why, and the button carries on from
 * there.
 *
 * Authorised by an admin session, or by the cron secret between steps.
 */
async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

const stalled = (s: AidSearch) => s.state === "running" && Date.now() - Date.parse(s.updated_at) > STALLED_MS;

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const documentId = Number(new URL(request.url).searchParams.get("documentId"));
  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  const search = await readSearch(documentId);
  return NextResponse.json({ search: search && stalled(search) ? { ...search, state: "stopped", message: "This search stopped part way. Press Find decision aids to carry on." } : search });
}

export async function POST(request: Request) {
  const machine = carriesCronSecret(request);
  if (!machine && !(await isAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { documentId?: number; search?: AidSearch } | null;
  const documentId = Number(body?.documentId);
  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

  const { data: doc } = await createAdminClient().from("content_documents").select("id,title,source_reference,file_url").eq("id", documentId).single();
  if (!doc?.file_url?.endsWith(".pdf")) return NextResponse.json({ error: "Only a PDF can be searched" }, { status: 400 });

  let search = machine && body?.search ? body.search : await readSearch(documentId);
  if (machine) {
    // Ingestion starts a search that has never run; a step carries on one that is running.
    if (search && search.state !== "running") return NextResponse.json({ search });
  } else if (search?.state === "running" && !stalled(search)) {
    return NextResponse.json({ search });
  }
  if (!search || search.state === "done") {
    search = await startSearch(doc);
    await writeSearch(documentId, search);
    if (search.state === "done") return NextResponse.json({ search });
  }
  search.state = "running";

  const running = search;
  const origin = new URL(request.url).origin;
  after(async () => {
    await stepSearch(doc, running);
    await writeSearch(documentId, running);
    if (running.state === "running" && !(await callNextStep(origin, documentId, running))) {
      running.state = "stopped";
      running.message = "The next step could not be started. Press Find decision aids to carry on.";
      await writeSearch(documentId, running);
    }
  });
  return NextResponse.json({ search: running }, { status: 202 });
}
