# Progress

## Status (2026-11-10)

**Phase 1 — Engine + movement library + tests: done.** (see git history / DECISIONS P1–P16)

**Phase 2 — Design system + core logging UI: done (first version).**
- Design system: `docs/DESIGN.md`, tokens in `src/ui/tokens.css`, components in `src/ui/components.tsx` (Button, Sheet, Stepper, RIR chips, Segmented, Toast, Waterline…), custom icon set, haptics.
- Data: Dexie DB (`src/data/db.ts`), live app data + actions (`src/data/store.ts`), persisted session draft (`src/app/draft.ts`).
- Screens (`src/screens/`): Onboarding (focus → frequency → comp date → calibration), Today (session preview, flags, deload evidence, skip with reasons, short-on-time), Logger (one-tap sets, RIR chips, edit sheet, rest timer, supersets, swaps today/block, WOD score + HR, notes, finish/partial), Summary (stats, e1RM PRs), History (sessions + skips, detail with notes), Progress (current e1RMs, hard sets per muscle last 7 days), Settings (track change now/next block, session length, warm-up style, equipment, bodyweight, JSON export).
- PWA: manifest, service worker (offline), iOS icons and launch screens.
- 142 tests (engine + draft model). Reviewed at 390×844 in the browser.
- Deployed via GitHub Pages: https://george-personal-prog.github.io/keel/
- GitHub CLI lives at `~/.local/bin/gh` (not on PATH; Homebrew isn't installed). Git pushes authenticate through it.

**Phase 3 — Analytics + badges: done (first version).**
- `src/analytics/` (pure, 16 tests): e1RM / best-make series, trends, rep records, weekly volume per muscle, adherence & streaks, HR training load, benchmark & interval histories, block summaries, body series; `badges.ts` replays records and badges from history.
- `src/ui/charts.tsx`: SVG line/bar charts and stat tiles with touch readouts.
- Progress tab: Overview (week strip, weak-point small multiples, main-lift trends, latest records, block summaries), Strength (lift picker, e1RM chart with PRs, rep records, sets per muscle vs 10–20 band, weekly volume), Engine (benchmarks with history charts, interval pace trends vs target, weekly HR load), Body (bodyweight chart, girths, shoulder:waist, private photos), Badges (31 badges, records feed).
- Session summary shows records and badges earned in that session.
- 158 tests total. Reviewed at 390×844 with 12 weeks of simulated data.

**Phase 4 — Polish, PWA install, deploy: done.**
- Offline precache of every build file, update detection with a reload pill, iPhone install hint.
- Screen wake lock during sessions; finish-ready cue; record/badge celebration on the summary.
- Code-split analytics screens; logger clocks isolated from the rest of the screen.
- Contrast fix (muted text ≥ 4.5:1), sheet focus handling, zero lint warnings.
- Fixed: same-day "ill" skip now counts; summary crash from promise-returning scrollTo; badge medals unstyled outside Progress.
- CI actions updated (checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5).
- 159 tests. Reviewed at 390×844; production build checked for offline precache.

## Next

1. **Owner test on iPhone**: install via Safari → Share → Add to Home Screen; run calibration week; collect feedback.
2. **Phase 5 — Firebase sync + import**: Google sign-in, Firestore with offline persistence, JSON import/restore, CSV export of sets/sessions. Needs owner to create a Firebase project (instructions at that point).

Known small gaps in phase 2:
- Progress photos are not in the JSON export (size); Firebase sync in phase 5 should decide whether to back them up.

## Open questions / ideas to revisit
- Use bodyweight (when logged) to make weighted pull-up/dip e1RMs meaningful for deload detection and analytics.
- HR-based training load (phase 3): transparent TRIMP-style calculation from avg HR × duration, explained in the UI.
- Possibly let the user pin a favourite accessory variant so rotation skips it out.
