# Progress

## Status (2026-11-10)

**Phase 1 — Engine + movement library + tests: done.**

- Project scaffolded: Vite 8 + React 19 + TypeScript 7 + Vitest 5 + oxlint.
- `src/engine/` — pure, deterministic programming engine:
  - `movements/` — ~150-movement library with muscle weights, anchors, and the attribute-based overhead-press restriction filter.
  - `templates.ts` — day types and splits for off-season / competition × 3–6 sessions.
  - `periodisation.ts` — blocks, phases, RIR waves, competition-date back-planning, weak-point spotlight.
  - `progression.ts` — strength (top set + back-offs), hypertrophy (double progression), Olympic (technique-gated TM).
  - `conditioning.ts` — benchmarks, erg tests, generated WODs, erg intervals with pace targets.
  - `readiness.ts` — gap ramps and skip-reason handling. `deload.ts` — evidence-based deloads.
  - `session-time.ts` — duration estimates, warm-ups, budget fitting / short-on-time.
  - `generate.ts` — `prescribeNextSession()`. `state.ts` — reducers. `volume.ts` — hard sets per muscle.
- 132 unit tests (`npm test`, < 1 s), including multi-week simulations of a virtual athlete across all 8 track combinations.
- Phase-1 holding page (`src/App.tsx`) previews a week of sessions per track.
- GitHub Pages workflow ready (`.github/workflows/deploy.yml`) — **repo not created yet**.

## Next

1. **Create the GitHub repo + enable Pages** (owner action, instructions given in chat) and push.
2. **Phase 2 — design system + core logging UI**
   - Design tokens (palette, type scale, spacing, radii, motion), components, dark-first. Review every screen at 390×844.
   - Dexie DB (versioned) for history, track state, settings, body data.
   - Screens: Today (one tap from launch), session logger (pre-filled sets, RIR chips 0–4+, one/two-tap logging, rest timer), WOD score entry with HR, skip flow with reasons, short-on-time, swap sheet, edit target weight, notes, track settings, onboarding/calibration.
   - PWA manifest, icons, safe areas.
3. Phase 3 — analytics + badges. Phase 4 — polish/PWA install. Phase 5 — Firebase sync + export.

## Open questions / ideas to revisit
- Use bodyweight (when logged) to make weighted pull-up/dip e1RMs meaningful for deload detection and analytics.
- HR-based training load (phase 3): transparent TRIMP-style calculation from avg HR × duration, explained in the UI.
- Possibly let the user pin a favourite accessory variant so rotation skips it out.
