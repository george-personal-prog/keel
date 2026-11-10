# Hybrid Training App — Project Brief

Personal-use training app replacing Functional Bodybuilding / Marchon-style apps for one user (the owner).
Hybrid CrossFit + bodybuilding. The user is an advanced lifter and exercise-science enthusiast: programming
must be evidence-based, coherent and explainable, not gimmicky.

**The builder has full creative and technical control.** No spec sign-off needed. Make sensible decisions,
record significant ones in `docs/DECISIONS.md`, and keep moving.

---

## 0. THE DESIGN BAR (non-negotiable)

"Personal use" describes the infrastructure and budget only. It does **not** lower the quality bar.
This app must look and feel as good as, or better than, the best commercial training apps
(Functional Bodybuilding, Marchon, Strong, Hevy, Whoop, Apple Fitness). The user opens it in the gym
several times a week for years, so it has to be a pleasure to use.

- **Distinctive, intentional visual identity.** A considered palette, type scale and spacing system
  defined as design tokens. No generic templates, default component-library looks, or "AI-generated
  dashboard" aesthetics. Use an original name and branding; do not copy any existing app's brand or assets.
- **Native-feeling on iPhone.** Full-screen standalone PWA, safe areas, bottom navigation within thumb reach,
  large tap targets (built for sweaty hands between sets), haptic-style micro-feedback where the web allows,
  smooth 60fps transitions, no layout jank, no browser chrome, proper app icon and splash screen.
- **Speed in the gym is the core UX metric.** Logging a set (weight, reps, RIR) should take one or two taps,
  pre-filled with the prescription. Today's session is one tap from launch. Nothing blocks logging.
- **Polish details matter:** empty states, loading states, satisfying PR/badge moments, celebratory but
  tasteful animations, beautiful charts with clear axes and annotations, consistent iconography,
  dark-mode-first with excellent contrast.
- **Information design:** the "why" behind each prescription is visible but unobtrusive. Analytics read
  like a good coach's report, not a spreadsheet.
- **Process:** before building screens, define the design system (tokens, components, motion rules).
  Review every screen at iPhone size (390×844) in the browser preview and iterate until it's genuinely
  excellent. If a `frontend-design` skill is available, use it.
- Treat visual and interaction quality as a feature equal in priority to the programming engine.
  Phase 4 (polish) is not optional and must not be squeezed.

---

## 1. Platform & constraints

- **Installable PWA** used on an **iPhone** (Safari "Add to Home Screen"). See section 0 for the design bar.
- **Budget: £0.** Free hosting (GitHub Pages or Cloudflare Pages) and free tiers only.
- **Local-first:** data in IndexedDB so it works without signal. Gym has internet, but offline-tolerance is cheap
  and makes the app resilient.
- **Cloud backup/sync (phase 2):** Firebase (Spark free tier, Google sign-in, Firestore with offline persistence)
  so data survives phone loss or iOS storage eviction. v1 must work fully without it.
- **Export/import:** full JSON backup + CSV export of all logged sets/sessions.
- **Long-term stability is a top priority.** Use a small, boring, well-supported dependency set. Version the data
  schema with migrations. No breaking data changes without a migration.
- **Complexity budget:** personal use. Skip anything that only exists to make it shippable (multi-user, auth
  beyond backup, payments, admin, i18n).
- Suggested stack (builder may change it): Vite + React + TypeScript, Dexie (IndexedDB), a lightweight chart
  library, Vitest for the programming engine.

## 2. Architecture rule

The **programming engine** is a pure, deterministic TypeScript module (no UI, no storage imports):
`(user profile, settings, training history, current track state) -> next session prescription`.
It must have thorough unit tests (progression, deload triggers, skips, track switches, rounding, restrictions).
The UI only renders prescriptions and records results.

## 3. User profile & hard constraints

- Fully equipped gym: barbells, DBs, cables, machines, rower, bike erg (Assault/Echo), ski erg, rig, rings, GHD, etc.
- **Plates (kg):** 1.25, 2.5, 5, 10, 15, 20, 25. Barbell 20 kg (make bar weight configurable per lift).
  All barbell targets round to loadable weights (smallest jump 2.5 kg total). DB and cable increments are
  configurable in settings (defaults: DB 2 kg steps, cable 2.5 kg steps).
- **HARD RESTRICTION: no steep overhead pressing for bodybuilding-style repeated sets.** Banned: strict press,
  seated/standing DB or machine shoulder press, Arnold press, push press as a hypertrophy accessory, any pressing
  at a 75–90° angle, handstands, HSPU, handstand walks.
  **Allowed:** Olympic lifts and their variants including jerks, thrusters, wall balls, overhead squats,
  DB/KB snatches, anything on a bar (pull-ups, T2B, muscle-ups), dips, ring work, incline pressing up to ~60°,
  landmine press, lateral raises and all variants (a favourite).
  Implement as a hard filter in the movement library: banned movements can never be programmed or offered as swaps.
- **Weak points to build disproportionately:** shoulders (side and rear delts especially), upper chest, lats.
- **Sessions ≤ 60 min** including warm-up. Warm-up is minimal: either a very short general prep or ramp/potentiation
  sets of the first movement only. Estimate session duration and keep within budget.
- No outdoor or external training to account for.
- Heart rate: Polar H10 recorded in Polar's own app. User enters **avg HR, max HR, and optionally time-in-zones**
  manually per WOD or session. No Bluetooth integration.

## 4. Track system

Two variables, switchable at any time:
- **Frequency:** 3, 4, 5 or 6 sessions/week.
- **Focus:**
  - **Competition:** biased toward CrossFit competition prep: WODs, Olympic lifting, strength, targeted
    conditioning and gymnastics. Asks for a **competition date** and periodises backwards from it
    (accumulation -> intensification -> peak/taper). Falls back to rolling blocks if there's no date.
  - **Off-season:** balanced hypertrophy-led training with a conditioning/WOD/circuit element. Functional
    bodybuilding style: tempo work, supersets, unilateral work, quality movement.
- **Weak-point bias** (shoulders, upper chest, lats) applies in both modes, more strongly in Off-season.
  Builder decides the method: permanent extra volume, rotating specialisation blocks, or a hybrid.
- **Track switching:** exercises map to movement patterns and e1RMs carry over, so no recalibration is needed.
  Builder decides whether a switch applies immediately or at the next block boundary (or offers both).
- **Sequence-based schedule:** sessions are an ordered queue, not fixed calendar days. Skipping never loses
  the plan's structure.
- **Exercise rotation:** core lifts stay stable; accessories rotate between blocks.
- **Session formats:** straight sets, supersets/giant sets, tempo prescriptions, EMOM/E2MOM, AMRAP, for time,
  intervals, chippers, and intensity techniques (myo-reps, lengthened partials, drop sets) used sparingly.

## 5. Logging

- Per set: **weight, reps, RIR** (RIR only, never RPE). Make RIR quick to enter (e.g. tap chips 0–4+).
- WOD scores: time, rounds + reps, load, calories, metres, Rx/scaled, plus avg/max HR and optional zones.
- Benchmark workouts (named CrossFit benchmarks and girls/hero WODs where they suit the restrictions) plus
  generated/random WODs built from sensible templates. Lift tests and erg tests as benchmarks too.
- Body data: bodyweight, girths (shoulders, chest, arms, waist etc.), optional progress photos stored locally.
- Session notes.
- **Calibration week** at the start: establishes working weights / e1RMs and conditioning baselines.

## 6. Progression (builder designs it; must be comprehensive, adaptive, and driven by real performance)

Use the right model for each training type, all driven by logged load × reps × RIR, for example:
- Hypertrophy: double progression within a rep range against RIR targets.
- Strength: top set plus backoffs, or wave/% based from a rolling e1RM.
- Olympic lifts: % of best lift, technique-gated, progressed more conservatively.
- Conditioning: pace/density targets and periodic benchmark retests.
- Missed reps or high effort lead to hold or reduce; easy sets lead to bigger jumps. Always explainable:
  every prescription should be able to show a one-line "why".

## 7. Skips, partial sessions, deloads

- **Skip reasons:** "not feeling it/low motivation", "busy/no time", "ill", "away/holiday".
  Each changes what comes next differently, e.g. ill → return lighter; long gap → re-entry ramp scaled to
  time off; repeated motivation skips → consider a volume reduction or flag accumulated fatigue.
  (No injury reason needed.)
- **Partial session:** "short on time" mode that keeps the high-priority work and drops/compresses the rest.
- **Deloads only when justified:** triggered by plateau/regression detection (e1RM stall, rising RIR at a
  given load, missed targets across exercises), with a long ceiling (e.g. no deload for ~8 weeks forces a
  review, not an automatic deload). Show the user the evidence that triggered it.

## 8. Manual control (keep it simple)

Prescriptive by default. Allow: swapping an exercise for an equivalent from the same pattern (history stays
linked; banned movements excluded), editing a target weight on the day, and adding a note. Nothing more complex.

## 9. Analytics & motivation

Creative but interpretable. No opaque proprietary scores. Ideas:
e1RM trends per lift, rep-PR tables, weekly hard sets per muscle (showing weak-point bias is actually
happening), volume/intensity over time, adherence and skip patterns, conditioning trends (benchmark
history, erg paces, HR-based training load explained transparently), bodyweight/girth trends,
block-by-block summaries. Badges for real achievements: e1RM PRs, rep PRs, benchmark PRs, consistency
streaks, block completions, weak-point milestones.

## 10. Working method

- Build in phases, committing working increments:
  1. Engine + movement library + tests
  2. Core logging UI
  3. Analytics + badges
  4. Polish, PWA install, deploy
  5. Firebase sync + export
- Deploy early so the user can test on his iPhone.
- The user is not a developer. When he needs to do something (create a repo, approve a GitHub login, set up
  Firebase), give exact click-by-click instructions. GitHub Pages on a free account requires a public repo:
  that's fine because the code holds no personal data (training data lives on the device / in Firebase).
  Never commit secrets or personal data.
- Keep `docs/DECISIONS.md` (key programming and technical choices) and `docs/PROGRESS.md` (what's done,
  what's next) updated, so any new session can resume after a usage-limit break.
- Before ending a session, update PROGRESS.md and commit.
