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

## Next

1. **Owner test on iPhone**: install via Safari → Share → Add to Home Screen; run calibration week; collect feedback.
2. **Phase 3 — analytics + badges**: e1RM trend charts, rep-PR tables, weekly sets per muscle over time, adherence/skip patterns, conditioning trends (benchmarks, erg paces, HR load), bodyweight/girths, block summaries, badges.
3. Phase 4 — polish (light mode?, motion pass, empty/edge states, a11y), phase 5 — Firebase sync + import.

Known small gaps in phase 2:
- A skip logged on the same day as a completed session doesn't trigger the "ill" return modifier (readiness compares skip date > last session date).
- Body data (bodyweight log, girths, photos) has a DB table but no screen yet: planned for phase 3.
- Lint warnings remain for React "set-state-in-effect" in sheets/steppers (harmless; tidy in phase 4).

## Open questions / ideas to revisit
- Use bodyweight (when logged) to make weighted pull-up/dip e1RMs meaningful for deload detection and analytics.
- HR-based training load (phase 3): transparent TRIMP-style calculation from avg HR × duration, explained in the UI.
- Possibly let the user pin a favourite accessory variant so rotation skips it out.
