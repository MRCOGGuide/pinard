"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Chip,
  EmptyState,
  Field,
  FIELD_CLASS,
  Table,
  Td,
  Th,
  Thead,
  Toast,
  Tr,
  NONE,
} from "@/components/ui";
import type { InviteCode } from "@/lib/pilot";
import { makeInviteCode } from "./actions";

/**
 * Codes to hand out, one per colleague or one per group.
 *
 * The code is generated rather than chosen: a code somebody picks is a
 * code somebody guesses, and this one has to hold the door shut
 * against the open internet while standing in a WhatsApp message.
 * Letters that are mistaken for each other over a phone are left out
 * of the alphabet entirely.
 */
export function InviteCodes({ codes, ready }: { codes: InviteCode[]; ready: boolean }) {
  const [note, setNote] = useState("");
  const [uses, setUses] = useState("1");
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    setMade(null);
    startTransition(async () => {
      const limit = uses.trim() === "" ? null : Number(uses);
      const result = await makeInviteCode({
        note,
        maxUses: limit === null || !Number.isFinite(limit) ? null : limit,
      });
      if (result.error) setError(result.error);
      else {
        setMade(result.code ?? null);
        setNote("");
      }
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      /* Some browsers refuse; the code is on screen to read either way. */
      setCopied(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">
        Invite codes
      </h2>
      <p className="mb-3 text-sm text-ink/60">
        While public sign-ups are closed, a code is the only way in. Give
        one to each person you want in the pilot, or one to a group with
        the number of places on it.
      </p>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="grid gap-3 sm:grid-cols-[1fr,8rem,auto] sm:items-end">
          <Field label="Who it is for" hint="For your own records">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sara, ST6 at Leeds"
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
          <Field label="Places" hint="Empty for unlimited">
            <input
              type="number"
              min={1}
              value={uses}
              onChange={(e) => setUses(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
          <Button onClick={create} disabled={pending} className="sm:mb-[1.1rem]">
            {pending ? "Making…" : "Make a code"}
          </Button>
        </div>

        {error && (
          <Toast tone="bad" className="mt-3">
            {error}
          </Toast>
        )}
        {made && (
          <div className="mt-4 rounded-card border border-good/40 bg-sunk p-4">
            <p className="font-mono text-label uppercase tracking-wide text-good">
              Give them this
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="font-mono text-2xl tracking-widest text-ink-strong">
                {made}
              </span>
              <Button size="sm" variant="secondary" onClick={() => copy(made)}>
                {copied === made ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        {codes.length === 0 ? (
          <EmptyState title={ready ? "No codes yet" : "Pilot tables not set up"}>
            {ready
              ? "Make one above and send it to an assessor: they enter it on the sign-up page, and it lets them in while sign-ups are closed."
              : "Run phase36-pilot.sql in the Supabase SQL editor. Until then there is nowhere to keep codes, and any you make will not be saved."}
          </EmptyState>
        ) : (
          <div className="rounded-card border border-line bg-surface p-4 shadow-card">
            <Table minWidth={520}>
              <Thead>
                <Th>Code</Th>
                <Th>For</Th>
                <Th align="right">Used</Th>
                <Th align="right">State</Th>
              </Thead>
              <tbody>
                {codes.map((c) => (
                  <Tr key={c.code}>
                    <Td>
                      <span className="font-mono tracking-widest text-ink-strong">
                        {c.code}
                      </span>
                    </Td>
                    <Td>{c.note ?? NONE}</Td>
                    <Td align="right">
                      {c.usedCount}
                      {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                    </Td>
                    <Td align="right">
                      <Chip tone={c.live ? "good" : "neutral"}>
                        {c.live ? "live" : "spent"}
                      </Chip>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
