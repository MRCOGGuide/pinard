import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";

export const dynamic = "force-dynamic";

export default function GatePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // No gate configured, no gate to show. Without this the page keeps
  // saying "Coming soon" to anyone whose tab, bookmark or address-bar
  // autocomplete still points at /gate — so turning the gate off looks
  // like it did nothing, which is exactly how it looked.
  if (!process.env.SITE_GATE_PASSWORD?.trim()) redirect("/");

  return (
    <div className="mx-auto max-w-sm">
      <TraceHeader
        title="Coming soon"
        lede="Pinard is being built. If you have an early-access code, enter it below."
      />
      <form
        action="/api/gate"
        method="post"
        className="rounded-card border border-hairline bg-porcelain p-6 shadow-card"
      >
        <label className="block text-sm font-medium">
          Access code
          <input
            type="password"
            name="password"
            autoComplete="off"
            autoFocus
            className="mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm"
          />
        </label>
        {searchParams.error && (
          <p className="mt-3 text-sm text-heartbeat">
            That code isn&rsquo;t right. Try again.
          </p>
        )}
        <button
          type="submit"
          className="mt-5 w-full rounded-card bg-theatre px-4 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
