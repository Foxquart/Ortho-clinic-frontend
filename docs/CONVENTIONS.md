# Frontend conventions

Binding rules for everyone working in this repo. `DESIGN.md` governs how things
look and move; this file governs how they are wired.

## Stack

Bun · Vite 8 · React 19 · TypeScript 6 (strict) · Tailwind CSS v4 · TanStack
Query v5 · React Router v7 · Radix primitives · `motion` · lucide-react.

## TypeScript rules that will bite you

- `verbatimModuleSyntax: true` — type-only imports **must** use
  `import type { X } from '...'`. A plain `import { SomeType }` fails the build.
- `erasableSyntaxOnly: true` — no `enum`, no `namespace`, no constructor
  parameter properties. Use `const` objects + string-literal unions.
- `noUnusedLocals` / `noUnusedParameters` — dead code fails the build. Prefix
  a deliberately unused parameter with `_`.
- `strict: true`.

## Imports

`@/` is aliased to `src/`. Always use it — no `../../..` chains.

## Layout

```
src/
  api/        http.ts (axios + CSRF), errors.ts, schema.ts (types), endpoints.ts
  app/        providers, router, app shell, layout chrome
  components/ ui/ — the shared primitive kit. Nothing domain-specific.
  features/   one folder per domain: patients/, prescriptions/, appointments/,
              medicines/, speech/, clinic/, users/, audit/, portfolio/, public/
              Each owns its hooks (queries/mutations), components, and screens.
  hooks/      cross-feature hooks only
  lib/        cn.ts, query.ts (queryClient + `qk` keys), permissions.ts, motion.ts
  routes/     route element modules, thin — they compose feature screens
  styles/     theme.css
```

A feature folder never imports from another feature's internals. If two
features need the same thing, it moves to `components/ui` or `lib`.

## Data access

- Never call `axios` directly. Use `apiGet` / `apiPost` / `apiPatch` /
  `apiDelete` from `@/api/http`. They return unwrapped data and throw
  `ApiError`.
- Never hardcode a path string. Use `@/api/endpoints`.
- Never invent a query key. Add it to `qk` in `@/lib/query` and use it, so
  invalidation after a write can't miss a screen.
- Every mutation invalidates the `qk` entries its write affects. Prefer
  invalidating the domain root (`qk.patients.all()`) over guessing.

```ts
const { data } = useQuery({
  queryKey: qk.patients.detail(id),
  queryFn: () => apiGet<PatientResponse>(endpoints.patients.byId(id)),
})
```

## Errors

- Catch nothing locally that the shared handler already covers. `ApiError`
  carries `code`, `status`, `details`, `correlationId`.
- **401** → the session is gone. Do not handle it in a screen; `http.ts`
  broadcasts it and the shell redirects to `/login`.
- **403** → hide the control. Never show a doctor a button that will 403.
  Gate with `useAuth().can('patients.write')`.
- **422** → map `error.fieldErrors()` onto the form with react-hook-form's
  `setError`. Do not show a toast for a validation error that belongs on a
  field.
- **409** → an explainable conflict (a double-booked slot, an illegal status
  transition). Say what conflicted and what to do instead.
- **502 `upstream_error`** → say plainly that a third-party service failed and
  that it is not the user's fault. Offer retry.
- Show `correlationId` in the detail of any unexpected error so a bug report
  can quote it.

## Permissions

`useAuth().can(capability)` — capabilities are declared in
`@/lib/permissions.ts`. The server remains the authority; this only stops us
rendering controls that would fail.

## Forms

react-hook-form + zod resolver. The zod schema **must** mirror the backend's
declared constraints (see `docs/API_NOTES.md`) so the user never sees a server
422 the form could have caught. Validate on blur, revalidate on change after
the first submit. Never block typing.

## Routes

| Path | Screen |
|---|---|
| `/login` | sign in |
| `/` | dashboard |
| `/patients` | patient list + search |
| `/patients/:id` | patient detail + history |
| `/prescriptions` | prescription list |
| `/prescriptions/new` | the prescription pad |
| `/prescriptions/:id` | prescription detail |
| `/appointments` | schedule |
| `/medicines` | formulary (admin writes) |
| `/speech` | voice capture + transcription lab |
| `/settings` | clinic settings, doctor profile, print templates |
| `/settings/users` | user management (admin) |
| `/settings/audit` | audit log (admin) |
| `/settings/site` | public-site CMS (admin) |
| `/site/*` | the public, unauthenticated patient site |

## Loading and empty states

- Under ~300 ms: render nothing. A spinner that flashes is worse than a beat of
  stillness.
- List/table/card loads: skeletons that match the real layout's dimensions, so
  nothing shifts when data arrives.
- Empty ≠ error ≠ unfiltered-empty. An empty search says "no matches for X"
  with a way to clear it; a genuinely empty collection says what to create and
  offers the button.

## Accessibility floor

Every icon-only button has an accessible name. Every input has a real
`<label>`. Validation summaries and the live speech transcript are
`aria-live="polite"`. Focus is never lost when a dialog closes.
