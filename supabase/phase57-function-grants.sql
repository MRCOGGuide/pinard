-- Phase 57: two service-only functions closed to the public key (pre-launch review, 18 November 2026).
--
-- take_ai_call (the site-wide daily AI ceiling) and spend_ask_allowance
-- (a candidate's Ask Pinard allowance) are meant for the server alone.
-- Phases 43 and 26 revoked them only "from public". On Supabase, functions
-- in the public schema are also granted to the anon and authenticated
-- roles directly, so that revoke left them callable with the public key:
-- anyone could use up the day's AI ceiling, or spend a named candidate's
-- allowance. Every other server-only function already revokes from all
-- three roles.
--
-- STEP 1, read only. Run this first; "true" in any column means the
-- function is open to that role now:
--
--   select
--     has_function_privilege('anon', 'public.take_ai_call(integer)', 'execute') as ai_anon,
--     has_function_privilege('authenticated', 'public.take_ai_call(integer)', 'execute') as ai_signed_in,
--     has_function_privilege('anon', 'public.spend_ask_allowance(uuid, text, integer)', 'execute') as ask_anon,
--     has_function_privilege('authenticated', 'public.spend_ask_allowance(uuid, text, integer)', 'execute') as ask_signed_in;
--
-- STEP 2, the fix (safe to run whatever step 1 shows; the server uses the
-- service role, which keeps its grant):

revoke all on function public.take_ai_call(integer) from public, anon, authenticated;
grant execute on function public.take_ai_call(integer) to service_role;

revoke all on function public.spend_ask_allowance(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.spend_ask_allowance(uuid, text, integer) to service_role;

-- STEP 3: run the query in step 1 again. Every column should now read false.
