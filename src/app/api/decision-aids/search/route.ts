import { after, NextResponse } from "next/server";
import { carriesCronSecret } from "@/lib/cron-auth";
import { STALLED_MS, STEPS_BUDGET_MS, justWorkedOn, readSearch, startSearch, stepSearch, writeSearch, type AidSearch } from "@/lib/decision-aid-extract";
import { clearSearching, markSearching, searchingDocumentIds } from "@/lib/decision-aid-searched";
import { searchedTwin } from "@/lib/source-twins";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A search for the decision aids in one source. The owner's button and
 * the end of ingestion start it. A run takes as many steps as fit in its
 * time, and the background workflow starts the next (see lib/queue-run for
 * why a run never starts it itself). A step that fails records why, and
 * the button carries on from there.
 *
 * Authorised by an admin session, or by the cron secret.
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

/** The source the background workflow should carry on with, or 0. */
async function nextToCarryOn(): Promise<number> {
  for (const id of await searchingDocumentIds()) {
    const search = await readSearch(id);
    if (search?.state !== "running") await clearSearching(id);
    else if (!justWorkedOn(search.updated_at)) return id;
  }
  return 0;
}

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

  const body = (await request.json().catch(() => null)) as { documentId?: number; continue?: boolean; force?: boolean } | null;
  const carryingOn = machine && Boolean(body?.continue);
  const documentId = carryingOn ? await nextToCarryOn() : Number(body?.documentId);
  if (!documentId) return carryingOn ? NextResponse.json({ search: null }) : NextResponse.json({ error: "documentId is required" }, { status: 400 });

  const { data: doc } = await createAdminClient().from("content_documents").select("id,title,source_reference,file_url").eq("id", documentId).single();
  if (!doc?.file_url?.endsWith(".pdf")) return NextResponse.json({ error: "Only a PDF can be searched" }, { status: 400 });

  let search = await readSearch(documentId);
  if (machine) {
    // Ingestion starts a search that has never run; the workflow carries on one that is running.
    if (search && search.state !== "running") return NextResponse.json({ search });
  } else if (search?.state === "running" && !stalled(search)) {
    return NextResponse.json({ search });
  }
  if (!search || search.state === "done") {
    // Before anything is paid for: this document may already be in the library.
    const twin = !machine && body?.force ? null : await searchedTwin(documentId);
    if (twin) {
      if (machine) return NextResponse.json({ search: null, twin });
      const found = twin.aids === 0 ? "was searched and has none" : `already has ${twin.aids === 1 ? "1 decision aid" : `${twin.aids} decision aids`}`;
      return NextResponse.json({ error: `This looks like the same document as "${twin.title}", which ${found}. Searching here would pay for that again.`, twin }, { status: 409 });
    }
    search = await startSearch(doc);
    await writeSearch(documentId, search);
    if (search.state === "done") return NextResponse.json({ search });
  }
  search.state = "running";
  await markSearching(documentId);

  const running = search;
  after(async () => {
    const stop = Date.now() + STEPS_BUDGET_MS;
    while (running.state === "running" && Date.now() < stop) {
      await stepSearch(doc, running);
      await writeSearch(documentId, running);
    }
    if (running.state !== "running") await clearSearching(documentId);
  });
  return NextResponse.json({ search: running }, { status: 202 });
}
