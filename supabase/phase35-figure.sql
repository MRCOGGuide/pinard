-- ============================================================
-- PINARD — Phase 35: the figure a question is read from
-- Paste into the Supabase SQL editor and Run (once).
--
-- Some questions are read rather than recalled. A urodynamic trace is
-- the clearest case: the diagnosis is in the shape of three pressure
-- lines and where the leaks sit against the coughs, and a candidate who
-- has only met "urodynamic stress incontinence is leakage in the
-- presence of raised abdominal pressure without a detrusor contraction"
-- as a sentence has never had to find it on a trace — which is the only
-- form the clinic ever shows them.
--
-- So a question may carry a figure, described rather than drawn: the
-- app holds one renderer per kind, so the figure carries the theme,
-- scales to a phone, reads aloud to a screen reader, and can be checked
-- against the passages the question cites. No images are stored.
--
-- "placement" says where it belongs. A figure the question is asked
-- FROM goes in the stem, where the candidate sees it before answering;
-- a figure that teaches goes under the explanation, after.
--
-- Shape, for kind "cystometrogram":
--   {
--     "placement": "stem",
--     "kind": "cystometrogram",
--     "caption": "Filling cystometry",
--     "capacity": 480,
--     "coughs": [100, 200, 300, 400],
--     "sensations": {"fd": 180, "nd": 300, "sd": 450},
--     "detrusor": {"kind": "stable"},
--     "leaks": [{"at": 300, "during": "cough"}]
--   }
--
-- detrusor.kind is one of:
--   {"kind": "stable"}
--   {"kind": "phasic", "rises": [{"at": 150, "amplitude": 22}]}
--   {"kind": "low-compliance", "endPressure": 42}
-- ============================================================

alter table public.generated_questions
  add column if not exists figure jsonb;

comment on column public.generated_questions.figure is
  'Optional figure the question is read from or taught with: {placement: "stem"|"explanation", kind, ...}. Described, not drawn — the app renders it. See src/lib/cystometrogram.ts.';
