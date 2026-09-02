-- ============================================================
-- PINARD — setup verification
-- Paste into the Supabase SQL editor and Run.
-- READ-ONLY: this changes nothing. Safe to run any time.
--
-- Checks that every table, column and function created by the
-- migrations in supabase/ actually exists in the live database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema check — anything marked MISSING means that phase's
--    SQL file was never run (or was only partly run).
-- ------------------------------------------------------------
with expected_tables(name) as (values
  ('profiles'),('sections'),('content_documents'),('content_chunks'),
  ('key_facts'),('example_questions'),('generated_questions'),
  ('user_answers'),('user_topic_performance'),('study_plans'),
  ('chat_messages'),('subscriptions'),('notifications_log'),
  ('generation_failures'),('exam_availability'),('billing_prices'),
  ('user_question_flags'),('superseded_reviews')
),
expected_columns(tbl, col) as (values
  ('example_questions','lead_in'),            -- phase2b
  ('example_questions','emq_group_id'),       -- phase2b
  ('generated_questions','lead_in'),          -- phase2b
  ('generated_questions','emq_group_id'),     -- phase2b
  ('generated_questions','source_document_ids'), -- phase9
  ('generated_questions','priority'),         -- phase13
  ('generated_questions','explanation'),      -- phase16
  ('profiles','diagnostic_completed_at'),     -- phase5
  ('profiles','stripe_customer_id'),          -- phase7
  ('profiles','active_session_id'),           -- single-session
  ('subscriptions','stripe_subscription_id'), -- phase7
  ('subscriptions','founding_member'),        -- phase7
  ('subscriptions','updated_at'),             -- phase7
  ('content_documents','tog_year'),           -- phase10
  ('content_documents','tog_issue'),          -- phase10
  ('content_documents','tog_category'),       -- phase10
  ('content_documents','facts_extracted_at'), -- phase11
  ('content_documents','priority'),           -- phase13
  ('key_facts','similar_excluded'),           -- phase18
  ('key_facts','similar_reviewed_at')         -- phase18
),
expected_functions(name) as (values
  ('match_chunks'),          -- phase3
  ('document_ingest_stats'), -- phase3
  ('handle_new_user'),       -- schema
  ('is_admin')               -- schema
)
select 'extension: vector' as item,
       case when exists (select 1 from pg_extension where extname = 'vector')
            then 'OK' else 'MISSING' end as status
union all
select 'table: ' || name,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = name
       ) then 'OK' else 'MISSING' end
from expected_tables
union all
select 'column: ' || tbl || '.' || col,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = tbl and column_name = col
       ) then 'OK' else 'MISSING' end
from expected_columns
union all
select 'function: ' || name,
       case when exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = name
       ) then 'OK' else 'MISSING' end
from expected_functions
order by 2, 1;   -- MISSING rows sort to the top


-- ------------------------------------------------------------
-- 2. Row-level security — every table below should say true.
--    Run this separately.
-- ------------------------------------------------------------
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
-- order by rowsecurity, tablename;


-- ------------------------------------------------------------
-- 3. Data health — how much content the database actually holds.
--    Run this separately.
-- ------------------------------------------------------------
-- select
--   (select count(*) from public.sections)             as sections,
--   (select count(*) from public.content_documents)    as documents,
--   (select count(*) from public.content_chunks)       as chunks,
--   (select count(*) from public.key_facts)            as key_facts,
--   (select count(*) from public.example_questions)    as examples,
--   (select count(*) from public.generated_questions)  as questions_total,
--   (select count(*) from public.generated_questions
--      where status = 'approved')                      as questions_approved,
--   (select count(*) from public.generated_questions
--      where status = 'pending')                       as questions_pending,
--   (select count(*) from public.profiles)             as users;
