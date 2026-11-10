# Decisions

Key programming and technical choices, with the reasoning. Newest decisions are added at the bottom of each section.

---

## Technical

### T1. Stack: Vite + React + TypeScript, Vitest, oxlint
Kept the suggested stack. Small, boring, well supported. Versions at scaffold time (Nov 2026): Vite 8, React 19, TypeScript 7, Vitest 5. No UI component library: the design system will be hand-built (CLAUDE.md §0).

### T2. The engine is a pure module: `src/engine/`
`prescribeNextSession({ settings, state, history, today, options }) → SessionPrescription`.
- No storage, DOM, `Date.now()` or `Math.random()`. `today` is passed in; randomness (WOD generation) uses a seeded PRNG (mulberry32) keyed on `state.seed + sessionNumber + dayId`. Same input → same output, which is tested.
- State changes are separate pure reducers in `state.ts`: `completeSession`, `changeTrack`, `swapExercise`, `declineDeload`.
- The UI imports only from `src/engine/index.ts`.

### T3. History is the source of truth; state is small
Most things are *derived* from the history on every call (e1RMs, training maxes, re-entry ramps, deload evidence, interval targets). `TrackState` only holds what can't be derived: queue cursor, block counter, calibration flag, swaps, pending track change, active deload, seed. Less state = fewer ways to drift out of sync, and history edits automatically flow through.

### T4. Schema versioning
`TrackState.schemaVersion = 1` with `migrateState()` as the single entry point for loading. Any future change adds a migration step; no breaking change without one. (The Dexie DB in phase 2 gets its own versioned schema.)

### T5. Deploy: GitHub Pages via Actions
`.github/workflows/deploy.yml` runs lint → tests → build → deploy on every push to `main`. A failing engine test blocks deployment. `BASE_PATH` is set to `/<repo-name>/` so the app works under the project-pages URL.

### T6. Name: **Keel**
Original name: the keel is the backbone that keeps a boat steady and on course, which is what a coherent long-term programme should do. The mark is a hull seen side-on with a signal-orange fin keel. Design system in `docs/DESIGN.md`.

### T7. Storage: Dexie (IndexedDB), versioned
`src/data/db.ts`, database `keel`, version 1: `meta` (settings, track state, profile), `sessions`, `skips`, `drafts`, `body`. Version blocks are append-only. All screens read through one live query (`useAppData`) and write through action functions in `src/data/store.ts`. Finishing a session (save log + advance queue + clear draft) is one transaction. `navigator.storage.persist()` is requested on launch to reduce iOS eviction risk; JSON export exists already as a safety net before Firebase (phase 5).

### T8. The in-progress session is a persisted "draft"
`src/app/draft.ts` (pure, unit-tested). Every tap writes the draft to IndexedDB, so iOS killing the PWA mid-workout loses nothing. Only completed sets are written to the session log; an unfinished session saves as `partial`.

### T9. Logging interaction model
One tap on the check logs a set exactly as prescribed (load, reps, target RIR); an RIR chip row (0–4+) then appears with the target pre-selected, so a different RIR is the second tap. Tapping load/reps opens big steppers with equipment-aware increments; a load change carries to the remaining sets of the same kind (calibration back-offs get 90%). Supersets alternate partners before the rest timer starts; the "current set" highlight follows that order. The rest timer is timestamp-based (survives backgrounding).

### T10. PWA without a plugin
Hand-written `public/manifest.webmanifest` and `public/sw.js` (network-first navigations with cached shell fallback; cache-first for content-hashed assets). iOS icons and launch screens are PNGs generated from the mark. Fewer dependencies, nothing magic to break.

### T10b. Offline precache from the build manifest (phase 4)
Vite writes `asset-manifest.json`; the service worker precaches every file in it on install (so lazily-loaded screens work offline on first launch), prunes assets the new build no longer references on activate, and the app calls `registration.update()` whenever it returns to the foreground. When a new version takes over, Today shows a one-tap "Keel was updated" reload pill rather than reloading under the user mid-session.

### T11. Fonts bundled locally
Archivo variable (width + weight axes) via `@fontsource-variable/archivo`, so the app looks the same offline. Condensed width for numbers/titles, normal for body.

---

## Programming engine

### P1. Sequence-based queue, block progress counted in sessions
The split is an ordered list of day types; `cursor` moves only when a session is completed. Skips never advance it. Block weeks = `floor(sessions completed in block / frequency) + 1`, so a slow week **stretches** a block rather than compressing it.
Exception: competition prep with a date. The date is fixed, so taper/peak/intensification are counted back from it on the calendar.

### P2. Splits (day types per focus × frequency)
- **Off-season** (FBB-style hypertrophy + conditioning): 3× full body; 4× upper-press / lower-squat / upper-pull / lower-hinge; 5× adds an "Engine · Shoulders" day; 6× adds "Gymnastics · Arms".
- **Competition**: Snatch+Squat, C&J+Press, Pull+Engine, Front Squat+Long WOD; 5× adds Oly positions/barbell cycling; 6× adds Gymnastics+Aerobic.
Every session ends with a conditioning piece whose emphasis is set by the day (short-intense, mixed, erg intervals, aerobic, gymnastics, barbell cycling, long mixed).

### P3. Periodisation
- **Off-season**: rolling 6-week hypertrophy blocks. RIR target 3,3,2,2,1,1 for compounds; isolations go one closer in the last two weeks (down to 0).
- **Competition with a date**: ≤1 week out taper; 2–4 peak; 5–8 intensification; further out, rolling 4-week accumulation blocks.
- **Competition without a date** (or date passed): alternating 4-week accumulation / intensification blocks.
- Strength doses per phase: off-season top 6 + 2×8 @85%; accumulation top 5 + 3×5 @90%; intensification top 3→2 + 3×3; peak doubles → singles; taper one top double + one back-off.

### P4. Progression models (all driven by logged load × reps × RIR)
- **e1RM**: Epley on reps-to-failure, `load × (1 + (reps + RIR)/30)`. RIR "4+" stored as 4 (conservative). Sets with reps+RIR > 15 are ignored for e1RM.
- **Rolling e1RM**: best-set e1RM of the last 3 exposures weighted 50/30/20.
- **Strength (top set + back-offs)**: target load = e1RM → reps@RIR, then checked against the last top set:
  - hit target at or above target RIR → at least +1 loadable step; bigger if the e1RM says so (capped at +10%);
  - exactly 1 RIR harder than planned → treated as on target (RIR ratings are ±1 accurate), move at most one step;
  - ≥2 RIR harder → hold; missed 1 rep → hold; missed ≥2 → −5%.
- **Hypertrophy**: double progression within a rep range (defaults: compounds 8–12 / primaries 6–10, isolations 10–15, delts & calves 12–20, core 10–20). All sets at the top of range at target RIR → +1 step, reps reset; ≥2 RIR to spare → double jump; inside range → +1 rep per set; much harder than planned → repeat; below the range floor → drop a step. Rounding never turns an increase into a hold. Bodyweight work progresses reps then tempo; weighted bodyweight adds belt load at the top of range.
- **Olympic lifts**: sets × reps @ % of a training max (TM). TM is *replayed from history*: starts from the first clean make, +1% after each clean session at ≥74% TM (+2% if every set was rated RIR ≥3), −3% after two consecutive sessions with misses or technique flagged as poor. Per-session: a miss → hold load; two in a row → reset 5%. More conservative than barbell strength by design.
- **Conditioning**: erg intervals target a pace from the last erg test (e.g. 500 m repeats at 2k pace −3 s). Every rep on target → 1 s faster; faded > 2 s → ease 1 s; close → hold. Calorie intervals +1 cal when every round hits.
- Every exercise carries a one-line `why`.

### P5. Movement-pattern e1RM carry-over (track switches, rotations)
Each movement may have an `anchor` (e.g. front squat ≈ 0.80 × back squat). A movement with no history estimates its e1RM/TM through the anchor chain, conservatively. So switching tracks or rotating accessories never needs a recalibration for compounds; isolations without anchors get a one-off "pick a load for X–Y reps @ RIR n".

### P6. Track switching: both options offered
`changeTrack(state, track, 'now' | 'next-block')`. 'now' starts the new split at day 1 in a fresh block; 'next-block' queues it and applies at the next block boundary. Changing only the competition date keeps the queue position.

### P7. Hard restriction is attribute-based, not a name list
`checkRestriction()` bans anything inverted, any `vertical-press` pattern, and any upper-body press steeper than **60°**. Leg-driven ballistic overhead work (jerks, thrusters, wall balls, snatches), overhead support (OHS) and hanging work are allowed. The library is filtered once at module load; swaps, templates and WODs only ever see the filtered list. Banned movements are deliberately *defined* in the raw library (strict press, push press, DB/machine shoulder press, Arnold, Z-press, 75° incline, HSPU, handstand walk, wall walk, pike push-up) so tests prove the filter rejects them. Push press is banned outright (not just as an accessory) to keep the rule simple and safe. Benchmarks containing banned or unavailable movements (Diane, Mary, Fight Gone Bad, Helen: running) drop out automatically.

### P8. Weak-point bias: hybrid (permanent volume + rotating spotlight)
- **Permanent**: weak-point slots (side/rear delts, upper chest, lats) appear in almost every session in off-season, and in every competition session, ranked above generic accessories when time is trimmed. Off-season volume on weak-point slots ramps +1 set from week 3.
- **Spotlight** (off-season only): each block spotlights one weak point in rotation shoulders → upper chest → lats. The spotlight gets +1 set per weak-point slot and unlocks an extra spotlight-only slot. Max 4 sets per exercise; extra volume goes into extra exercises.
- Tested: in off-season, side delts + rear delts + upper chest + lats receive more weekly hard sets than chest + biceps + triceps + upper back; competition still trains them but less.

### P9. Accessory rotation
Core lifts (`rotate: false`) never change. Accessory slots cycle through candidate lists by block number, with a per-slot offset so variants differ between days. Block-level swaps clear at block rollover.

### P10. Skips and re-entry (derived from history)
- **Gap ramp** (any reason): <8 days none; 8–13 → 1 session at 92.5%; 14–27 → 2 sessions from 88%; 28–55 → 3 sessions from 82% (+1 RIR); 56+ → 4 sessions from 75% (+1 RIR). One fewer set during the first half of the ramp.
- **Ill**: first session back ≤90% loads, −1 set, +1 RIR, easy aerobic conditioning, regardless of gap.
- **Away**: gap ramp only.
- **Busy**: no penalty; suggests "short on time".
- **Motivation**: one skip is ignored; ≥2 in 21 days → next session's accessory volume ×0.8 with an explanation; ≥3 in 21 days counts as deload evidence.

### P11. Deloads only on evidence
Per core movement (≥4 recent exposures, Olympic and bodyweight lifts excluded): e1RM regression (last 2 < 97% of prior best), stall (no progress across 6 exposures), effort creep (same load/reps ≥2 RIR harder). Session-level: missed rep targets on ≥40% of exercises in the last 2 sessions (for hypertrophy only falling *below the rep range* counts), ≥3 motivation skips in 21 days.
Trigger when: ≥2 lifts regressing/creeping and ≥25% of assessed lifts affected; or a plateau across ≥50% of lifts (≥3); or a regression corroborated by missed targets or motivation skips. Never within 3 weeks of the last deload; declining suppresses it for 14 days. After 8 weeks with no evidence the user gets a **review** prompt, not a deload.
A deload lasts one session-week: strength 3×5 at ~75% e1RM, hypertrophy half the sets at the same load and RIR 4, easy aerobic conditioning. It then starts a fresh block. The evidence is shown to the user.

### P12. Session budget and "short on time"
Duration is estimated from reps × tempo, rest by scheme/role (supersets share rest), setup per exercise, calibration build-up sets, warm-up and WOD overhead. Sessions are trimmed to the budget (default 60 min) in this order: accessory sets → shorten a non-key WOD → drop accessories → weak-point/secondary sets → drop a non-key WOD → drop priority-2 work → primary back-offs. "Short on time" is the same algorithm with a smaller budget; the user is told exactly what was cut.

### P13. Warm-up
Default: ramp sets of the first lift only (empty bar ×8, then ~40/60/75/85% of the first working load), ~5–7 min. Alternative setting: a 5-minute general prep.

### P14. Calibration week
The first pass through the split. Strength: work up to a top set @ RIR 2, then 2 back-offs at ~90%. Hypertrophy: find a load for the range @ RIR 2. Olympic: build to a crisp heavy single. Conditioning slots become baseline tests (2 km row, Fran, 10-min air bike, 1 km ski, Grace, Cindy). Nothing is a true max test.

### P15. Benchmarks and retests
In the last week of every block, the first metcon day runs the least-recently-done benchmark and the first erg day runs an erg test. Previous score becomes the target.

### P16. WOD loads are personal
Barbell loads in generated WODs and benchmarks are capped at ~60% of the user's own estimated max for that lift, never above Rx; when scaled, the Rx is shown.

---

## Analytics & motivation (phase 3)

### A1. Analytics are pure functions over history
`src/analytics/` (unit-tested). Nothing is stored, so numbers can never drift from the log, and changing a formula re-computes all history.

### A2. Metrics, all explainable
- **Strength:** best-set e1RM per session (Epley on reps + RIR), PRs = > 0.5% above all previous; 8-week trend = least-squares slope in kg/week. Olympic lifts chart the heaviest *clean make* instead (no rep extrapolation for skill lifts).
- **Rep records:** heaviest load per rep count, keeping only the frontier (a lighter load at fewer reps is not shown).
- **Volume:** hard sets per muscle per week, prime mover = 1, synergist = ½; shown against a 10–20 sets/week reference band.
- **Adherence:** sessions per week vs your frequency; streak = consecutive full weeks on target; 12-week rate excludes the current week.
- **Conditioning load:** Edwards' TRIMP = Σ minutes in zone × zone number. If only average HR is logged, the whole piece counts in that average's zone (% of your highest logged max HR, fallback 190). Shown with this explanation in the UI.
- **Benchmarks:** best and last per benchmark/test; only Rx results can be PRs. Time scores chart inverted so up = better.

### A3. Achievements are replayed, never stored
`computeAchievements(history, frequency)`: records (e1RM PRs on main lifts after 2 exposures, rep PRs on compound lifts at 1–12 reps after the first exposure, benchmark PRs) and one-off badges (session counts, calibration, 4–52-week streaks, blocks completed, 250/500/1000 hard sets per weak-point muscle, benchmarks). Calibration and first exposures can't produce PRs, so the feed stays meaningful.

### A4. Charts are hand-built SVG
No chart dependency. One y-axis, 2px lines, markers with a surface ring, recessive grid, text in text colours, brass for PR markers, sea for conditioning, small multiples instead of a multi-colour chart for the four weak points. Every plot has a tap/drag readout.

### A5. Body data and photos
One body entry per day (merging). Progress photos are stored as blobs in IndexedDB (schema v2 adds a `photos` table) with a small thumbnail; they never leave the phone and are not included in the JSON export (size).

---

## Polish (phase 4)

### Q1. Performance
- The logger's clocks (elapsed time, rest timer) tick inside their own small components, so logging a set never competes with a whole-screen re-render every second.
- History, Progress, Settings and Summary are code-split (`React.lazy`); the main bundle holds only what's needed to open Today and log a session.

### Q2. Gym ergonomics
- The screen stays awake during a session (Screen Wake Lock API, re-acquired when the app returns to the foreground).
- When the last set is logged, the view scrolls to "Finish session" and the button pulses twice.
- iPhone users in Safari (not installed) see a dismissible "Share → Add to Home Screen" hint.

### Q3. Accessibility
- `--text-3` raised to #808790 so every text token is ≥ 4.5:1 on the background and cards.
- Sheets move focus into themselves when opened, close on Escape, and return focus to the control that opened them. All animations respect `prefers-reduced-motion`.

### Q4. Celebration, but tasteful
Records and badges on the session summary get one slow brass sheen across the card, a staggered spring-in for medals and a success haptic. No confetti.

### Q5. Robustness
- Effects never use expression bodies: modern browsers make `window.scrollTo` return a promise, which React treats as an invalid cleanup (this crashed the summary screen during review).
- Sheets keep their last content while sliding out, and editable sheets initialise from props via a remount key rather than syncing state in effects (no lint warnings remain).

---

## Backup & sync (phase 5)

### S1. The phone stays the source of truth
IndexedDB remains primary; the app never waits on the network. Firebase is a backup and a way to move to a new phone, not a server the app depends on.

### S2. Firestore layout and merge rules
`users/{uid}/sessions/{id}`, `skips/{date}_{reason}`, `body/{date}`, `meta/{settings|trackState|profile}`. Deterministic ids mean the same record from two devices lands on the same document. A sync pulls everything, merges (union by id, local wins on the same id; the training state that has progressed furthest wins, then the newest; other settings newest-wins; body girths merge per day), then pushes only documents whose content hash changed (`src/sync/model.ts`, pure and tested). Meta rows now carry `savedAt`.

### S3. When sync runs
On sign-in, 3 s after any data change, on returning to the foreground, and on regaining connection. A sync in progress queues one follow-up rather than running twice.

### S4. Security
Firestore rules (`firestore.rules`) allow a signed-in user to read/write only `users/{their uid}` and only the four known collections. The web config is committed: it identifies the project but grants nothing on its own.

### S5. Hosting for sign-in
Google sign-in from an installed iPhone web app needs the app on the same domain as the auth handler (Safari storage partitioning breaks cross-domain redirects; popups don't work in standalone mode). So the app is also hosted on Firebase Hosting (free) and installed from `<project>.firebaseapp.com`; GitHub Pages stays as a mirror. Standalone mode uses redirect sign-in, browsers use a popup. CI deploys to Firebase Hosting once a service-account secret exists; until then Claude deploys with the Firebase CLI.

### S6. Firebase is lazy-loaded
The SDK (~170 kB gzipped) is a separate chunk loaded only once cloud backup is switched on. `@grpc/grpc-js` is overridden to a patched version: the advisories concern Node.js servers, not the browser build, but this keeps `npm audit` clean.

### S7. Export / import
JSON backup (everything except photos) with strict validation before restore (`parseBackup`), restore = replace-all in one transaction. CSV exports: one row per set, one row per conditioning piece.
