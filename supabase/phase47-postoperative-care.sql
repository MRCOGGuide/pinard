-- Phase 47: questions for the Postoperative Care section (owner's request,
-- 10 October 2026).
--
-- Postoperative Care had no questions, and the RCOG lists no topics under
-- it, so no diagnostic could reach it. This links to it 19 approved
-- questions from the library whose subject is care after an operation,
-- obstetric and gynaecological:
--   SBAs   576  pelvic collection after caesarean (from Postpartum Care)
--          578  necrotising fasciitis after caesarean (from Postpartum Care)
--          1023 abdominal wall catheters for postoperative analgesia
--          1024 post-dural puncture headache after laparotomy
--          1049 enhanced recovery: same-day discharge after hysterectomy
--          1191 analgesia after caesarean on methadone maintenance
--          2068 intrathecal analgesia for caesarean (from Labour and Birth)
--   EMQ sets, moved whole:
--          1504-1506 thromboprophylaxis after gynaecological surgery
--          1507-1509 thromboprophylaxis for gynaecological surgery
--          1732-1734 acute colonic pseudo-obstruction after caesarean
--          1948-1950 complications after caesarean section
-- The others come from High-Impact Articles. Nothing is deleted: the
-- questions, their answers and every candidate's history are kept; only
-- the section they are filed under changes.
--
-- It also adds Postoperative Care to the free sample diagnostic (one SBA,
-- 1049), so the free diagnostic reaches every section.
--
-- Safe to run more than once. The undo is at the end, commented out.

begin;

update public.generated_questions
set section_id = 32
where id in (576, 578, 1023, 1024, 1049, 1191, 2068,
             1504, 1505, 1506, 1507, 1508, 1509,
             1732, 1733, 1734, 1948, 1949, 1950)
  and status = 'approved';

insert into public.free_diagnostic_items (position, question_id, section_id)
select coalesce(max(position), 0) + 1, 1049, 32 from public.free_diagnostic_items
where not exists (select 1 from public.free_diagnostic_items where question_id = 1049);

commit;

-- Undo (put each question back where it was, and take 1049 out of the
-- free diagnostic):
-- begin;
-- update public.generated_questions set section_id = 10 where id in (576, 578);
-- update public.generated_questions set section_id = 7 where id = 2068;
-- update public.generated_questions set section_id = 35
--   where id in (1023, 1024, 1049, 1191, 1504, 1505, 1506, 1507, 1508, 1509,
--                1732, 1733, 1734, 1948, 1949, 1950);
-- delete from public.free_diagnostic_items where question_id = 1049;
-- commit;
