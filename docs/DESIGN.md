# Keel design system

Dark-first, built for a sweaty thumb in a gym between sets. All tokens live in `src/ui/tokens.css`.

## Identity
- **Name & mark:** KEEL with a signal-orange full stop. The mark is a keel profile (hull line + fin) drawn in one stroke.
- **Signal orange** (`--signal`, international orange from marine safety gear) is the single action colour: primary buttons, the current set, progress. Used sparingly so it always means "do this".
- **Sea** (`--sea`) marks conditioning. **Brass** (`--brass`) is reserved for achievements/PRs. Nothing else is coloured.
- **Typography:** one variable family, Archivo, bundled locally (works offline). Numbers and titles use its condensed width (`font-stretch: 72%`) at heavy weights, which gives the "scoreboard" feel and fits big numbers into narrow columns. Body text is normal width at 450. Tabular numerals everywhere numbers line up.
- **Motif:** the *waterline*: hairline dividers and a thin progress line in signal orange. Labels (A, B1, B2) sit in small uppercase tracked capsules.

## Tokens
| Group | Tokens |
|---|---|
| Surfaces | `--bg` #0C0D0F · `--bg-raised` #15171A · `--surface` #1C1F23 · `--surface-hi` #262A2F |
| Text | `--text` #F3F1EA · `--text-2` #A6ABB1 · `--text-3` #6B7178 (AA on `--bg` for `--text-2`) |
| Accent | `--signal` #FF6A2B · `--sea` #3CC6B3 · `--brass` #E7C36A · `--danger` #FF5A5F · `--ok` #79D38A |
| RIR scale | 0 red → 1 orange → 2 amber → 3 green → 4+ sea |
| Space | 4-pt: `--s1` 4 … `--s10` 40 |
| Radius | `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-xl` 28 |
| Type | `--fs-xs` 12 · `--fs-sm` 13 · `--fs-md` 15 · `--fs-lg` 17 · `--fs-xl` 20 · `--fs-2xl` 26 · `--fs-3xl` 34 · `--fs-hero` 56 |
| Motion | `--ease-out` (.2,.8,.2,1) · `--ease-spring` (.34,1.56,.64,1) · `--t-fast` 120ms · `--t-med` 220ms · `--t-slow` 360ms |

## Rules
- **Tap targets ≥ 48 px**; the set-log button and RIR chips are 52–56 px.
- **Thumb zone:** primary actions live in the bottom third (bottom bar, sheet buttons, floating rest timer).
- **Motion:** animate only `transform`/`opacity`. Sheets slide up with `--ease-out`; logged sets "pop" with `--ease-spring`. Everything respects `prefers-reduced-motion`.
- **Haptics:** a light tick on set logged, chip selected and timer done (iOS 18+ via the switch-input technique; vibration API elsewhere).
- **Safe areas:** every fixed element pads with `env(safe-area-inset-*)`.
- **The "why":** every prescription shows its reason in `--text-3` beneath the sets. Visible, never shouting.
- **Empty and loading states** are designed, not blank: an illustration-free sentence plus the next action.
