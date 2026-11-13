# Pinard design direction: "the guideline page"

Proposed in Phase 9, step 2. Built on two screens only (the question and answer screen, and the landing page) for approval before it is rolled out.

## The idea in one sentence

Pinard should feel like a well-set clinical guideline or journal page that you can answer: calm paper, a serious reading typeface for the clinical writing, plain interface type for everything you tap, and one signature mark (the CTG trace) used sparingly.

The audience reads Green-top Guidelines, NICE and TOG for a living. The most trustworthy thing a revision product can look like is the material they already trust, not a software dashboard.

## What it replaces (the audit's main findings)

| Generic tell found on the current site | What the direction does instead |
|---|---|
| Inter everywhere (the most common default typeface on generated sites) plus a monospaced font for numbers and labels (263 uses) | Two distinct, deliberate faces: Newsreader for clinical reading and headings, Source Sans 3 for the interface. No monospace; numbers use aligned (tabular) figures. |
| An ALL-CAPS mono label above nearly every heading ("MRCOG PART 2", "REAL QUESTIONS FROM THE BANK", "SCENARIO 1 OF 3"); 75 all-caps labels | Headings carry the hierarchy on their own. Small labels are sentence case. |
| The same rounded card with the same soft shadow used for everything (358 rounded cards, 101 shadows), including cards inside cards | The question sits on the page like printed text. Only things you tap (answer options, buttons, inputs) have a box. |
| Landing page built from template blocks: stat strip with big number and small label, 2×2 grids of identical feature cards, drawn illustrations, a decorative vertical "journey" rail with icons in glowing circles | One real question in the opening screen, a single factual sentence instead of a stat strip, and the rest as plain rows of text separated by rules. Roughly half the length on a phone. |
| Nine sections fading in as you scroll | No scroll animation. Motion only answers what you do (choosing, checking, revealing). |
| Middle-dot meta strings ("3 scenarios · one option list"), arrows appended to links, typed symbols as icons (⚑ ✓ ✕) | Plain sentences, drawn icons where an icon is genuinely needed. |
| No custom 404, no error page, no loading skeletons | Designed in step 3, once the direction is approved. |

## Colour

A small palette: paper, ink, one green and one rose accent. Light and dark were both checked for contrast (WCAG AA).

| Role | Light | Dark | Use |
|---|---|---|---|
| Paper (page) | `#F7F8F5` | `#0E1715` | Everything sits on it. Neutral with a faint green cast, not cream. |
| Surface | `#FFFFFF` | `#16211E` | Only interactive things: options, inputs, the specimen. |
| Ink | `#1C2421` | `#DCE5DF` | Body text. |
| Theatre green | `#0F3D33` | `#EEF3EF` (as heading ink) | Headings and the primary button. The Green-top echo stays. |
| Greentop | `#2F6D5B` | `#6FBFA4` | Correct answers, links, focus. |
| Heartbeat rose (the one accent) | `#C23A55` / text `#A82944` | `#EC7A92` | The trace and incorrect answers. Nothing else. |
| Rule | `#DDE3DF` | `#26332F` | Hairlines between sections and rows. |

## Type

- **Newsreader** (Google Fonts, free): headings, and every clinical word a candidate reads: question stems, lead-ins and explanations. It is a newspaper and journal face with optical sizes, so it has character large and stays comfortable small. Reading size 18px with generous line spacing, kept under about 70 characters a line.
- **Source Sans 3** (Google Fonts, free): the interface, answer options, buttons, labels and figures. A humanist sans, clear at small sizes on a phone.
- Scale (px): 13, 15, 16, 18 (reading), 20, 26, 34, 46.

## Layout principles

1. Left aligned, one reading column. Nothing centred except where a page has a single message (the 404, an empty state).
2. Spend boldness in one place: the trace. It underlines a page's title and shows session progress on the question screen. No other decoration.
3. Boxes mean "you can press this". Information is not put in boxes.
4. Motion is 150 to 250 milliseconds, eased out, opacity and movement only, and switched off for anyone who asks their device for reduced motion.

## Copy

Written for MRCOG candidates: name the paper, the guidance and what actually happens, without slogans or claims nobody can check.

## What has changed since (11 and 12 November 2026)

The owner asked for the site to feel alive, interactive and expensively designed, approved a preview, and asked for it on every screen. The idea above still holds: paper, a journal face for the clinical writing, plain type for what you press. What moved:

- **The front door is a stage.** The landing page opens on one dark room with the Pinard horn in it as an object, drawn live, which can be turned. It is the one place the site spends its boldness; the screens a candidate works on stay calm, and nothing three-dimensional belongs on a question.
- **Interface face: Instrument Sans**, in place of Source Sans 3, chosen from a trial of five.
- **Headings are lighter and larger.** Regular weight at 28px and up, medium below, where everything was semibold. Page titles are fluid, 38 to 54px. Tracking tightens with size.
- **The top bar is dark green glass** on every page and in both themes.
- **Buttons are pills.** Fields and answer options keep 12px corners, so the shape still says which is which.
- **Shadows are tinted and longer**, so a card stands off the paper rather than being outlined on it.
- **Motion follows the reader.** On the landing page nothing runs on a timer: pictures follow the scroll or the hand through springs, so they stop when the reader stops and can be interrupted. The signed-in screens' section fades now do the same. The 150 to 250 millisecond rule above still governs what answers a press on the app's own screens; moving between pages takes about 400, because the title travels.
- **Every screen opens on the stage's band.** A page's title sits on dark green that runs up under the top bar, so a signed-in screen begins the way the front door does, and then the page itself is on paper beneath. Admin keeps plain headings.
- **Moving between pages is one movement.** The top bar holds, the title and its band carry across, the rest leaves and arrives. Loading placeholders carry the band, so it never drops out between pages.
- **The mark is the horn.** The logo is drawn from the same outline as the horn on the stage.
- **Figures have objects.** Today's four figures each have a small machined object beside it, made and lit as the horn is, that shows the figure: an hourglass, a ring filled to the readiness, discs on a spindle, a dial of the topics. The metal is anodised in the figure's own colour. Objects show a figure; they never decorate one, and they stay off the screens where a candidate answers questions.

The table of generic tells above is still the test for anything new.
