import Link from "next/link";
import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { validUnsubscribe } from "@/lib/unsubscribe";

export const metadata: Metadata = {
  title: "Stop reminder emails: Pinard",
  robots: { index: false, follow: false },
};

/**
 * Where the link at the foot of a reminder email lands. Asks for one
 * press rather than acting on arrival, because mail systems open links
 * to scan them, and a scan must not unsubscribe anyone (lib/unsubscribe).
 */
export default async function UnsubscribePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ u?: string; s?: string; done?: string; failed?: string; invalid?: string }>;
}) {
  const sp = await searchParamsPromise;
  const body = "font-ui text-[16px] leading-relaxed text-ink/85";
  const link = "font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good";

  if (sp.done) {
    return (
      <>
        <TraceHeader title="Reminders stopped" />
        <p className={body}>
          You will not get any more reminder emails. You can turn them back on at any time from your{" "}
          <Link href="/account" className={link}>account</Link>.
        </p>
      </>
    );
  }
  if (sp.failed) {
    return (
      <>
        <TraceHeader title="That did not work" />
        <p className={body}>
          Your reminders could not be turned off just now. Try the link again, or turn them off from your{" "}
          <Link href="/account" className={link}>account</Link>.
        </p>
      </>
    );
  }
  if (sp.invalid || !(await validUnsubscribe(sp.u, sp.s))) {
    return (
      <>
        <TraceHeader title="This link has not worked" />
        <p className={body}>
          The link may have been cut short by your email app. You can turn reminders off from your{" "}
          <Link href="/account" className={link}>account</Link> instead.
        </p>
      </>
    );
  }

  return (
    <>
      <TraceHeader title="Stop reminder emails" />
      <p className={body}>Press the button to stop Pinard&rsquo;s daily reminder emails. Your account and progress are not affected.</p>
      <form action="/api/unsubscribe" method="post" className="mt-6">
        <input type="hidden" name="u" value={sp.u} />
        <input type="hidden" name="s" value={sp.s} />
        <button
          type="submit"
          className="btn-motion inline-flex h-11 items-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
        >
          Stop reminder emails
        </button>
      </form>
    </>
  );
}
