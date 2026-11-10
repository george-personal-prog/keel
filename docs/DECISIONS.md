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
Original name: the keel is the backbone that keeps a boat steady and on course, which is what a coherent long-term programme should do. Placeholder mark only; real branding in phase 2/4.

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
