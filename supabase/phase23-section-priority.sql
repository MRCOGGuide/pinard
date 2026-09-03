-- ============================================================
-- PINARD — Phase 23: section priority
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Every section is part of exam preparation; they are not equally
-- examined. Documents already carry a priority tier — this gives
-- sections their own, so daily revision and question generation both
-- spend their effort in proportion to how much a topic is tested.
--
--   1  core syllabus      the clinical topics the exam is built on
--   2  supporting         TOG, impact and practice papers
--   3  background         everything else, still revised, never the focus
alter table public.sections
  add column if not exists priority int not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sections_priority_range'
  ) then
    alter table public.sections
      add constraint sections_priority_range check (priority between 1 and 3);
  end if;
end $$;

-- ------------------------------------------------------------
-- Starting tiers. Editable per section in Admin → Sections.
-- ------------------------------------------------------------

-- Everything begins as background, then the clinical syllabus and the
-- supporting papers are promoted over it.
update public.sections set priority = 3;

-- 1 — the clinical syllabus, parents and their sub-topics alike.
update public.sections s
set priority = 1
where s.title in ('Obstetrics', 'Gynaecology')
   or s.parent_id in (
     select id from public.sections where title in ('Obstetrics', 'Gynaecology')
   );

-- 2 — the supporting literature.
update public.sections
set priority = 2
where title in (
  'TOG Articles',
  'Scientific Impact Papers',
  'Best Practice Papers',
  'Good Practice Papers'
);

-- Check what you have:
--
-- select p.title as parent, s.title, s.priority
-- from public.sections s
-- left join public.sections p on p.id = s.parent_id
-- order by s.priority, p.title nulls first, s.sort_order;
