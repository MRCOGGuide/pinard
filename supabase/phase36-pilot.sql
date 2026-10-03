-- ============================================================
-- Phase 36 — the pilot cohort, and the people who are not ready yet.
--
-- Three small tables, for the three things phase 08 of the rebuild
-- plan needs and the schema has nowhere to put:
--
--   invite_codes  a way for ten colleagues to get in while public
--                 sign-ups are closed. Without this the pilot cannot
--                 start: the sign-up page refuses everyone until
--                 NEXT_PUBLIC_LAUNCHED is true, which is a switch that
--                 opens the door to the whole internet at once.
--
--   waitlist      somebody whose exam is in March, who will not
--                 subscribe today and should not be asked to. An email
--                 and a diet, so they can be told when it opens.
--
--   feedback      what the cohort says, from inside the product, where
--                 they are when they notice it.
--
-- Run in the Supabase SQL editor. The app tolerates their absence —
-- every read is wrapped and falls back to "no codes, no list, no
-- feedback" — so nothing breaks between deploying and running this.
-- ============================================================

-- ---------- invite codes ----------

create table if not exists public.invite_codes (
  code text primary key,
  note text,
  -- Null is unlimited. A code for one named colleague is 1; a code for
  -- a WhatsApp group of registrars is however many you trust it with.
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.invite_codes is
  'Codes that admit a pilot candidate while public sign-ups are closed. Checked and incremented server-side with the service role.';

-- Who used which, so a code can be traced to the people it let in and
-- a second sign-up on a one-use code can be refused.
create table if not exists public.invite_redemptions (
  code text not null references public.invite_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- ---------- waitlist ----------

create table if not exists public.waitlist (
  email text primary key,
  -- Which paper they are sitting, and when, so the mail that opens the
  -- door can go to the people it is open for rather than to everyone.
  exam text,
  exam_date date,
  created_at timestamptz not null default now()
);

comment on table public.waitlist is
  'People who asked to be told when Pinard opens, with the diet they are sitting. Written by an anonymous form, so inserts go through the service role and never through the anon key.';

-- ---------- feedback ----------

create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  -- Where they were when they said it. A sentence about a question is
  -- worth little without knowing which question.
  path text,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists feedback_unread_idx
  on public.feedback (created_at desc)
  where read_at is null;

-- ---------- policies ----------
--
-- None of these are readable or writable through the anon or
-- authenticated keys. Every path goes through a server action holding
-- the service role, which RLS does not apply to: a candidate must not
-- be able to list the invite codes, read the waitlist, or read anyone
-- else's feedback, and the only write any of them makes is through a
-- form the server validates first.

alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.waitlist enable row level security;
alter table public.feedback enable row level security;
