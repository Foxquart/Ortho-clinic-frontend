# Ortho-clinic-frontend

A digital prescription system for a single orthopaedic clinic. One doctor,writing prescriptions, mostly by voice.

The API lives in a separate repository. This app talks to it over a cookie
session; it stores nothing itself.

## What it does

- **Dictate a prescription.** Speak English; the transcript is read into
  prescription rows — drug, dose, `1-0-1` timing, duration, food timing — which
  you check and sign.
- **Prescribe for a walk-in in three fields.** First name, last name, phone.
  The patient record is created as a side effect of prescribing; the rest can be
  filled in later.
- **Blank means blank.** A field you never spoke and never typed renders
  visibly empty and *blocks printing*. Nothing is invented on your behalf.

## The safety model

Every value on the pad carries its provenance, because these are not equally
trustworthy and the difference must never be invisible:

| State | Meaning |
|---|---|
| **Heard** | transcribed from what you said |
| **Carried over** | from a past visit or a default — verify it |
| **Typed** | you entered it (the baseline; no marker) |
| **Blank** | never set. Renders hatched, and blocks printing |

Two readers produce those rows:

1. A **local parser** (83 tests) — instant, offline, understands common
   notations (`1-0-1`, `BD`, `TDS`, `HS`, "twice daily", "for five days").
2. An **extraction model** (NVIDIA Nemotron 3 via OpenRouter) — reads dictation
   the parser cannot: out of order, mixed with narrative, self-corrected.

The model must **quote the transcript span** justifying every value it returns.
The server verifies that quote actually occurs in the transcript and discards
anything that fails, listing it on screen. An invented drug name is dropped
outright. The screen always states which reader produced the rows.

If the model is unconfigured or unreachable, the parser result simply stays.

## Stack

Bun · Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · TanStack Query
· React Router · Radix primitives · `motion` · lucide-react.

## Running it

```bash
bun install
bun run dev          # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:8000`, which keeps the
session cookie first-party and sidesteps the `localhost` vs `127.0.0.1`
`SameSite` trap entirely. Point elsewhere with `VITE_API_URL`.

```bash
bun run typecheck
bun test src/features/speech/parser.test.ts
bun run build
```

## Documentation

| File | What's in it |
|---|---|
| `DESIGN.md` | tokens, motion, density, the accessibility floor |
| `docs/CONVENTIONS.md` | architecture, data access, error handling, routes |
| `docs/API_NOTES.md` | where the API's real schema differs from its prose |
| `docs/BACKEND_NOTES.md` | auth, CSRF, speech, translation, extraction |

## Known gaps

The backend does not yet store structured doses, per-field provenance, or a
genuinely blank dose — `dosage` and `frequency` are required free-text strings.
That structure lives in the client (`features/prescriptions/model.ts`) and is
flattened at submission. `toApiItem` is the one function that changes when the
API grows real fields.

Investigations, PRN and max-per-day likewise have no backend fields and are
folded into `instructions` and `notes` under headings.
