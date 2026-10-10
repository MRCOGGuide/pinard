-- Phase 49: Postoperative Care moves from Governance to Gynaecology
-- (owner's decision, 10 October 2026).
--
-- It takes its alphabetical place in Gynaecology, after Pelvic: the
-- sections from Urogynaecology onwards move down one. Nothing else
-- changes: its 19 questions, every answer to them and every candidate's
-- history stay as they are, and the module's score now includes it.
--
-- Safe to run more than once: it does nothing if the move is done.

do $$
begin
  if exists (select 1 from public.sections where id = 32 and parent_id is distinct from 2) then
    update public.sections
       set sort_order = sort_order + 1
     where parent_id = 2 and sort_order >= 9;

    update public.sections
       set parent_id = 2, sort_order = 9
     where id = 32;
  end if;
end $$;

-- Undo:
-- begin;
-- update public.sections set parent_id = 3, sort_order = 9 where id = 32;
-- update public.sections set sort_order = sort_order - 1 where parent_id = 2 and sort_order >= 10;
-- commit;
