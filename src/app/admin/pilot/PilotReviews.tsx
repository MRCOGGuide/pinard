"use client";

import { useState, useTransition } from "react";
import { Button, Card, Chip, EmptyState, NONE, Table, Td, Th, Thead, Toast, Tr } from "@/components/ui";
import { REVIEW_AREAS, type ReviewAreaKey } from "@/lib/pilotReviewShared";
import type { StoredReview } from "@/lib/pilotReview";
import { publishReview, setPilotReviewOpen, unpublishReview } from "./actions";

/**
 * The pilot's closing review: the switch that asks for it, the average
 * score for every part of the site, and each assessor's review in full.
 *
 * Publishing is one click and only offered where the assessor ticked
 * the consent box. Nothing reaches the landing page without it, and a
 * published comment can be taken down again here.
 */
export function PilotReviews({
  open,
  reviews,
  averages,
  published,
}: {
  open: boolean;
  reviews: StoredReview[];
  averages: Record<ReviewAreaKey, { mean: number | null; n: number }>;
  /** The quotes already on the landing page. */
  published: string[];
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, done: string) {
    setMsg(null);
    startTransition(async () => {
      const result = await action();
      setMsg(result.error ? { ok: false, text: result.error } : { ok: true, text: done });
    });
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink-strong">Assessor reviews</h2>
        <span className="font-mono text-label text-ink/65">
          {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/80">
            {open
              ? "Open: every signed-in candidate who has not reviewed yet is asked on Today, and /pilot-review takes their scores."
              : "Closed. Open it at the end of the pilot and every signed-in candidate is asked to score each part of the site out of ten."}
          </p>
          <Button
            variant={open ? "secondary" : "primary"}
            disabled={pending}
            onClick={() =>
              run(() => setPilotReviewOpen(!open), open ? "Review closed." : "Review open: candidates will be asked on Today.")
            }
          >
            {open ? "Close the review" : "Open the review"}
          </Button>
        </div>
        {msg && <Toast tone={msg.ok ? "good" : "bad"} className="mt-3">{msg.text}</Toast>}
      </Card>

      {reviews.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No reviews yet">
            When the review is open, each assessor&rsquo;s scores and comments arrive here.
          </EmptyState>
        </div>
      ) : (
        <>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-medium text-ink-strong">Average score out of ten</h3>
            <Table minWidth={420}>
              <Thead>
                <Th>Part of the site</Th>
                <Th align="right">Average</Th>
                <Th align="right">Scored by</Th>
              </Thead>
              <tbody>
                {REVIEW_AREAS.map((a) => (
                  <Tr key={a.key}>
                    <Td>{a.label}</Td>
                    <Td align="right">{averages[a.key].mean ?? NONE}</Td>
                    <Td align="right">{averages[a.key].n}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="mt-3 space-y-3">
            {reviews.map((r) => {
              const isPublished = published.includes(r.publicComment);
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink-strong">{r.email ?? "Unknown assessor"}</p>
                    <span className="font-mono text-label text-ink/65">
                      {new Date(r.submittedAt).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {REVIEW_AREAS.map((a) => (
                      <li key={a.key}>
                        <Chip>
                          {a.label}: {r.scores[a.key] ?? "not used"}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                  {r.privateComment && (
                    <div className="mt-3">
                      <p className="font-ui text-[14px] font-semibold text-ink/65">To change</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink/85">{r.privateComment}</p>
                    </div>
                  )}
                  {r.publicComment && (
                    <div className="mt-3">
                      <p className="font-ui text-[14px] font-semibold text-ink/65">
                        For the website {r.consent ? "(consent given)" : "(no consent: cannot be published)"}
                      </p>
                      <blockquote className="mt-1 text-sm text-ink">&ldquo;{r.publicComment}&rdquo;</blockquote>
                      <p className="mt-1 font-mono text-label text-ink/65">
                        {r.displayName}
                        {r.displayDetail ? ` · ${r.displayDetail}` : ""}
                        {r.scores.overall ? ` · ${r.scores.overall}/10` : ""}
                      </p>
                      {r.consent && (
                        <div className="mt-2">
                          {isPublished ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              onClick={() => run(() => unpublishReview(r.id), "Taken off the website.")}
                            >
                              Remove from website
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() => run(() => publishReview(r.id), "Published on the landing page.")}
                            >
                              Publish on website
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
