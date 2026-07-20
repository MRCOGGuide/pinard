-- ============================================================
-- PINARD — single active session per account (anti-sharing)
-- Paste into the Supabase SQL editor and Run (once).
--
-- Each sign-in records its session id here; a request whose session
-- id no longer matches is signed out (enforced in middleware).
-- ============================================================

alter table public.profiles
  add column if not exists active_session_id text;
