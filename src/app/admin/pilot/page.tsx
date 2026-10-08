import { TraceHeader } from "@/components/TraceHeader";
import { requireAdmin } from "@/lib/auth";
import { listFeedback, listInviteCodes, listWaitlist, pilotTablesReady } from "@/lib/pilot";
import { Table, Th, Thead, Tr, Td, EmptyState, Chip, NONE } from "@/components/ui";
import { InviteCodes } from "./InviteCodes";
import { FeedbackList } from "./FeedbackList";
import { Testimonials } from "./Testimonials";
import { getTestimonials } from "@/lib/offer";
import { averages, isReviewOpen, listReviews } from "@/lib/pilotReview";
import { PilotReviews } from "./PilotReviews";
import { PilotAccess } from "./PilotAccess";
import { getPilotWindow, longDate, pilotPhase, ukToday } from "@/lib/pilotDates";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The pilot, in one place: who can get in, who is waiting, what they say.
 *
 * Three tables that arrive with phase36-pilot.sql. Until that is run
 * every list here is empty rather than broken, which is the honest
 * state: there are no codes because there is nowhere to keep them.
 */
export default async function PilotPage() {
  await requireAdmin();

  const [codes, waiting, feedback, quotes, reviewOpen, reviews, pilotWindow, invited, tablesReady] = await Promise.all([
    listInviteCodes(),
    listWaitlist(),
    listFeedback(),
    getTestimonials(),
    isReviewOpen(),
    listReviews(),
    getPilotWindow(),
    createAdminClient()
      .from("invite_redemptions")
      .select("user_id", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
    pilotTablesReady(),
  ]);

  /* Said here, where today's UK date is known, rather than in the form. */
  const phase = pilotPhase(pilotWindow);
  const today = ukToday();
  const daysLeft = pilotWindow.until
    ? Math.round((Date.parse(pilotWindow.until) - Date.parse(today)) / 86400000)
    : null;
  const pilotStatus =
    phase === "before"
      ? `Not started: begins on ${longDate(pilotWindow.from!)}.`
      : phase === "after"
        ? `Ended on ${longDate(pilotWindow.until!)}. Invited candidates are back on the free tier.`
        : pilotWindow.until
          ? `Running: ends on ${longDate(pilotWindow.until)} (${daysLeft === 0 ? "today is the last day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}).`
          : "Running, with no end date set.";

  const unread = feedback.filter((f) => !f.readAt).length;

  return (
    <>
      <TraceHeader
        title="Pilot"
        eyebrow="Owner area"
        lede="Codes for the people you want in before everyone else, the people waiting for their diet, and what the cohort has told you."
      />

      <InviteCodes codes={codes} ready={tablesReady} />

      <PilotAccess
        from={pilotWindow.from}
        until={pilotWindow.until}
        status={pilotStatus}
        invited={invited}
      />

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink-strong">
            Waiting
          </h2>
          <span className="font-mono text-label text-ink/65">
            {waiting.length} {waiting.length === 1 ? "person" : "people"}
          </span>
        </div>
        {waiting.length === 0 ? (
          <EmptyState title="Nobody on the list yet">
            The sign-up page offers it to anyone arriving without a code.
          </EmptyState>
        ) : (
          <div className="rounded-card border border-line bg-surface p-4 shadow-card">
            <Table minWidth={520}>
              <Thead>
                <Th>Email</Th>
                <Th>Paper</Th>
                <Th>Exam date</Th>
                <Th align="right">Asked</Th>
              </Thead>
              <tbody>
                {waiting.map((w) => (
                  <Tr key={w.email}>
                    <Td>{w.email}</Td>
                    <Td>{w.exam ? `MRCOG ${w.exam.replace("part", "Part ")}` : NONE}</Td>
                    <Td>{w.examDate ?? NONE}</Td>
                    <Td align="right">{w.createdAt.slice(0, 10)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink-strong">
            What they said
          </h2>
          {unread > 0 && <Chip tone="accent">{unread} unread</Chip>}
        </div>
        <FeedbackList items={feedback} />
      </section>

      <PilotReviews
        open={reviewOpen}
        reviews={reviews}
        averages={averages(reviews)}
        published={quotes.map((q) => q.quote)}
      />

      <Testimonials initial={quotes} />
    </>
  );
}
