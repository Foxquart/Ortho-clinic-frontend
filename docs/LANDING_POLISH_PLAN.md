# Landing Page Polish — Execution Plan

**Project:** Dr. Sankar Deb Roy — orthopaedic surgeon, Agartala (`/home/roy/programs/ortho-clinic-proto`)
**Scope:** The public landing page at `/` only — `src/features/landing/**`. Do NOT touch the app shell, `/site/*` public pages, or the CMS.
**Goal:** A landing page that reads as a top-tier agency build — premium, exclusive, editorial. Microanimations only (no spectacle), flawless mobile, and a reviews section powered by real Google review data **with reviewer profile photos**.

**How to use this file:** Each phase lists exact files, exact changes, and acceptance checks. Phases are ordered so each one is independently shippable. Work phase by phase, verify with the commands in §9 before moving on. Do not skip the Non-Negotiables (§2) — they override everything, including this plan.

---

## 1. Current state (verified against the code)

Landing composition (`src/features/landing/LandingPage.tsx`, render order):

| # | Section | File | Anchor |
|---|---------|------|--------|
| 1 | Floating pill nav + mobile overlay menu | `LandingNav.tsx` | `#top` |
| 2 | Hero (split text/portrait, facts `<dl>`, draft manifesto below fold) | `sections/HeroSection.tsx` | `#top` |
| 3 | Record (milestones spine, photo, YouTube embed, publication) | `sections/RecordSection.tsx` | `#record` |
| 4 | Life bento grid (all `[DRAFT]`, dev-only) | `sections/LifeGridSection.tsx` | `#life` |
| 5 | Reviews (GSAP marquee, hardcoded data, **no avatars**) | `sections/ReviewsSection.tsx` | `#reviews` |
| 6 | Booking (API-integrated appointment card) | `BookingSection.tsx` | `#book` |
| 7 | Footer (NAP `<address>`, nav, staff sign-in) | `sections/LandingFooter.tsx` | — |

Data/copy: `profile.ts` (all copy, reviews, rating). Imagery: `imagery.ts` (only real photo = hero portrait; rest is Unsplash stock). Styles: `landing.css` (tokens, type scale, marquee, grain). Motion: GSAP + Lenis, owned by `LandingPage.tsx`; sections only tag `data-reveal` / `data-hero-*`.

**Honest score (top-design rubric):** Typography 8, Composition 7, Motion 7, Color 8, Details 6 → **~7.2/10**. Strong editorial bones. The gap to 9+ is: reviews feel data-poor (no faces, assumed stars), mobile is "works" not "crafted", micro-interactions stop at magnetic buttons, and there is no signature moment.

### Known defects to fix along the way

- `BookingSection.tsx` lines ~80–116: `PURPOSES` copy still says *"Something about your teeth or your smile"*, *"crowded front teeth"*, *"aligners"* — dental-template leftovers. Rewrite for orthopaedics (fractures, joint pain, sports injuries, follow-up).
- `landing.css` line 2 header comment says "Dr. Arjun Mehta"; `LandingNav.tsx` `Monogram` comment references "the orthodontist this page used to be about". Clean up.
- `profile.ts` `Review.stars` values are **assumed, not observed** (see the long warning at lines 342–356). Phase 1 fixes this with real data.
- `PRESENCE.googleBusinessProfile.url` (profile.ts:473) is a Google *search* URL, not the place link. Replace with the real `maps.app.goo.gl` share link when the place ID is resolved (Phase 1).

---

## 2. Non-negotiables (project contracts — never break)

1. **Motion contract:** No element ever carries a CSS `opacity: 0` baseline. All reveal states are set by GSAP at runtime and only inside `gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', …)`. Reduced motion or no-JS must paint the final, legible state.
2. **GPU-only animation:** animate `transform` and `opacity` only. Never `width/height/top/left/margin`. 60fps or remove it.
3. **Easing:** never `ease`, `ease-in`, `ease-out`, `linear`. Use `expo.out` / `power3.out` (GSAP) or `cubic-bezier(0.22, 1, 0.36, 1)` (CSS). Existing durations: entrances 0.7–1.1s, micro-interactions 150–350ms.
4. **Tokens only:** colors come from the `.landing-root` tokens in `landing.css` (`--lp-accent: #0f5c56`, warm paper `#f6f4ed`, ink `#1c1b17`). No raw Tailwind palette colors, no pure `#000`/`#fff`, no gradients as decoration, no glow (the marquee edge *mask* and photo scrims are existing, intentional exceptions — keep them).
5. **Type:** Instrument Serif for display (`lp-display`, `lp-h2`, `lp-h3`, `lp-serif`), Inter for body. Nothing else. Self-hosted only — no Google Fonts CDN.
6. **Truthfulness:** This is a real, practising surgeon. No invented testimonials, no invented star counts, no invented facts. Everything factual traces to `profile.ts` with its `[SOURCED]/[DRAFT]/[CONFIRMED]` tags. `SHOW_DRAFTS` gating (`published()`) must keep working.
7. **Accessibility:** 44px touch targets, visible styled focus states, `prefers-reduced-motion` respected, WCAG 2.2.2 (pausable marquee) preserved, keyboard operability.
8. **The reviews section must keep the aggregate link:** the curated review selection is only defensible because the true aggregate (4.0 from 9) is stated and links to the live profile. Never remove the `GOOGLE_RATING` block or the outbound link.

---

## 3. Phase 1 — Real Google reviews, free, with profile photos

**Problem:** Reviews are hand-transcribed in `profile.ts` (lines 381–400), stars are *assumed*, no reviewer photos, count goes stale. The user wants live Google reviews via a free API.

**Chosen approach — build-time fetch, no runtime key exposure (do this, not a runtime proxy):**
A script runs at build/deploy time, calls the Places API (New) once, normalizes the result, **downloads the reviewer profile photos into `public/reviews/`**, and writes `src/features/landing/googleReviews.json`. The page renders from that JSON, falling back to the hand-written `REVIEWS` when the JSON is absent. Zero runtime cost, zero key exposure, zero CORS, works offline, reviews never fail on a patient’s phone.

Why not a client-side or serverless runtime call: the Places API key must never ship to the browser; a proxy adds infra and a failure mode for zero benefit on data that changes weekly at most. Build-time is the correct shape.

### API facts (verified)

- **Places API (New)** — `GET https://places.googleapis.com/v1/places/{PLACE_ID}` with header `X-Goog-Api-Key` and field mask `rating,userRatingCount,reviews`. Free tier covers thousands of calls/month; we make one per deploy. Each review includes `authorAttribution.displayName`, `authorAttribution.photoUri` (the profile photo), `authorAttribution.uri` (reviewer’s Maps profile), `rating`, `text.text`, `relativePublishTimeDescription`, `publishTime`. **Limit: max 5 reviews returned**, most relevant first. That is acceptable — the section currently shows 8; we show 5 real ones + keep hardcoded extras as fallback filler only if they’re verified.
- **Google Business Profile API** — free, unlimited, returns ALL reviews with `reviewer.profilePhotoUrl`, but requires owning the GBP, OAuth2, and Google approval (days). **Not** Phase 1; note it as a future upgrade in the handover.
- The **place ID is currently unknown** — resolve it first.

### Tasks

1. **Resolve the place ID.** Use the Place ID finder (https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder) searching "Dr. Shanker Debroy Battala Agartala", or `curl` the Places API Text Search. Store it in `.env.example` and `.env.development` as `GOOGLE_PLACE_ID=`. Get an API key (Places API (New) enabled, key restricted to the Places API) into `GOOGLE_PLACES_API_KEY` — **server/build only, never `VITE_`-prefixed**.
2. **Create `scripts/fetch-google-reviews.ts`** (mirror the style of `scripts/seed-demo.ts`):
   - Reads `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` from env; exits 0 with a console note if unset (builds must not break without the key).
   - Fetches Place Details with field mask `rating,userRatingCount,reviews`.
   - Normalizes to:
     ```ts
     { fetchedAt: string; rating: number; count: number;
       reviews: Array<{ author: string; avatar: string; stars: number;
                        text?: string; when: string; publishTime: string;
                        profileUrl: string }> }
     ```
   - Downloads each `photoUri` (append `=s128-c` for a 128px crop) to `public/reviews/avatars/<slug>.jpg`; `avatar` in the JSON is the local `/reviews/avatars/<slug>.jpg` path. On download failure, `avatar: ""`.
   - Sorts reviews newest-first by `publishTime`, writes `src/features/landing/googleReviews.json` (pretty-printed; it is a reviewed, committable artifact — the human reviews it like any content change).
3. **Wire into build:** add `"fetch:reviews": "bun scripts/fetch-google-reviews.ts"` to `package.json` and call it from the `build` script (`"build": "bun run fetch:reviews && vite build"` — check the current build script first and preserve any existing steps; if CI/Vercel runs `vite build` directly, add it as a `prebuild`). If the key is unset the script is a no-op and the page uses the fallback — that path must be tested.
4. **Extend the data layer** in `profile.ts`:
   - Add `avatar?: string` and `profileUrl?: string` to the `Review` interface.
   - Export `LIVE_REVIEWS`: if `googleReviews.json` exists (import it statically — Vite supports JSON imports), map it into `Review[]`, merge/fill with `REVIEWS` up to 8 entries, and override `GOOGLE_RATING` from the live `rating`/`count`. Keep the hand-written `REVIEWS` untouched as the fallback and as the provenance record.
   - Update `GOOGLE_RATING`’s comment: the "assumed stars" warning is resolved for live-sourced entries.
5. **Update `PRESENCE.googleBusinessProfile.url`** with the real place link (construct `https://www.google.com/maps/place/?q=place_id:{PLACE_ID}` if the short link isn’t available).

**Acceptance:** with env vars set, `bun run fetch:reviews` writes the JSON + avatars; `bun run build` succeeds with and without the key; the rendered section shows real stars, real relative dates, and real profile photos; `profile.ts` fallback still works when the JSON is deleted.

---

## 4. Phase 2 — Reviews section redesign (the centerpiece)

**File:** `src/features/landing/sections/ReviewsSection.tsx`. Keep the marquee concept — the rationale in the file header (a queue of people, not a sparse grid) is sound and the WCAG pause behavior is already correct. Elevate it to the page’s **signature moment**.

### 4.1 Editorial header redesign

Replace the current plain `h2` + link header with an editorial split: left = `h2` "What people have said."; right = the aggregate as a designed object — the rating numeral in Instrument Serif at display scale (`lp-serif`, `clamp(3rem, 6vw, 5rem)`, `lp-numeral` for tabular figures), a row of stars beside it, and "from N verified Google reviews" + the outbound link below. Faces sell: add an overlapping avatar stack (5 avatars, `-space-x-3`, 2px `--color-bg` ring, `size-10`) above the numeral. The whole right block is the link to the Google profile.

### 4.2 Card redesign

Both card shapes get: avatar (40px circle, `object-cover`, `ring-1 ring-border`; fallback = initial letter on `lp-accent-tint` ground in Instrument Serif), author name linked to `profileUrl` when present (`rel="noreferrer"`, hover underline offset animation), a small Google "G" glyph (inline SVG, multi-color, 14px, `aria-label="Google review"`) top-right for authenticity. Written-review cards keep the Quote icon but drop it to `size-5` and let the quote text lead. Rating-only cards center the stars vertically with the avatar — they currently read as empty.

Card chrome: keep `rounded-3xl border bg-surface`, add a hover state — `transform: translateY(-4px)` + `border-color: var(--color-border-strong)`, 250ms `cubic-bezier(0.22,1,0.36,1)`, `@media (hover: hover)` only. No shadow-stacking; hairline border is the elevation language.

Marquee masks: the 6rem edge fade eats too much on mobile — make the fade `clamp(1.5rem, 6vw, 6rem)` in `.lp-marquee`.

### 4.3 Microanimation: scroll-velocity marquee (the signature moment)

The marquee’s drift direction/speed reacts to scroll: Lenis `velocity` drives `tween.timeScale()` — scroll down accelerates, scroll up reverses slightly, at rest it settles to base speed. Implementation sketch (inside the existing `useGSAP`, reduced-motion gated):

```ts
const lenis = /* the active Lenis instance via smoothScroll.ts — export a getter if needed */;
lenis?.on('scroll', ({ velocity }) => {
  gsap.to(tween.current, { timeScale: 1 + gsap.utils.clamp(-3, 3, velocity / 8), overwrite: true });
});
```

Keep pause-on-hover/focus exactly as-is (multiply timeScale to 0 via the existing pause/resume, don’t fight it). Cap `timeScale` so text stays readable. This one detail — a reviews wall that leans into your scroll — is the screenshot moment.

### 4.4 Entrance choreography

Stars on the visible cards fill with a 60ms stagger when the section enters (page-level `data-reveal-group` already exists — the section tags items; add a `data-stars` hook if needed). Section header uses existing `data-reveal`.

**Acceptance:** real avatars render; missing-avatar fallback looks intentional; hover states on cards; marquee reacts to scroll velocity and still pauses on hover/focus; reduced-motion path unchanged (static scroll-snap region, no velocity effect); the aggregate numeral matches `GOOGLE_RATING`.

---

## 5. Phase 3 — Mobile experience overhaul (390px and 768px first)

Test at 360, 390, 768, 1024, 1440. Use the Playwright/webapp-testing tooling to screenshot each breakpoint before and after. Mobile is the majority device for "orthopedic doctor agartala" — it is the real product.

### 5.1 Global mobile pass

- **Sticky mobile booking CTA:** a bottom bar (`lg:hidden`, `position: fixed`, safe-area-inset padding, appears after scrolling past the hero, hides when `#book` is in view — IntersectionObserver) with one `Book an appointment` button (`tone="primary"`, full-width, 48px). This is the single highest-value mobile change: the booking form is 4 sections down.
- **Tap targets audit:** every interactive element ≥ 44px — check nav hamburger, footer links (currently `text-caption` links are likely too small), review card links, marquee cards (pause is on the wrapper, fine).
- **Horizontal overflow:** `.landing-root` has `overflow-x: clip`; verify nothing is silently clipped that should be visible (check the marquee mask and Record section spine).
- **Section rhythm:** `--section-pad: clamp(5.5rem, 11vw, 10rem)` gives 88px on a 390px screen — correct; verify sections don’t add extra `py` on top.

### 5.2 Per-section mobile fixes

- **Hero (`HeroSection.tsx`):** facts `<dl>` is `grid-cols-2` — at 360px, `Trained at / RIMS Imphal, 2004` and `Consults in / Bengali, Hindi, English` will wrap awkwardly; reduce to `gap-y-5`, set `dd` to `text-[0.95rem]` on <sm. Portrait is `max-w-sm mx-auto` below `lg` — good; add `mt-2` breathing room before it and confirm the caption scrim text stays legible. CTA row: `flex-col items-stretch` below `sm` so both buttons are full-width (48px).
- **Nav (`LandingNav.tsx`):** verify the overlay menu links are `min-h-11` (44px); the pill nav shouldn’t overlap the hero kicker at 360px — check `pt-[calc(var(--nav-h)+2.5rem)]` holds. Add hide-on-scroll-down / show-on-scroll-up to the pill nav (transform only, 300ms, `expo.out` equivalent; disabled when the mobile menu is open).
- **Record (`RecordSection.tsx`):** verify the milestone spine and the YouTube embed at 390px — the embed must be `aspect-video w-full` with no fixed pixel width; the feature photo must not exceed viewport.
- **Reviews:** card widths are fine (`13rem`/`19rem`); apply the mask fix from §4.2; ensure the aggregate header stacks cleanly (numeral block under the `h2`, `mt-8`).
- **Booking (`BookingSection.tsx`):** 896 lines — audit at 390px specifically: date/slot grids must not overflow, the compact ClinicPanel strip (`md:hidden`, ~line 776) must be readable, all form controls ≥ 44px, the dental copy from §1 rewritten.
- **Footer (`LandingFooter.tsx`):** NAP `<address>` and nav stack; increase link line-height to 44px-effective touch rows on mobile.

**Acceptance:** no horizontal scrollbar at any test width; every tap target ≥ 44px; sticky CTA appears/hides correctly; booking flow completable one-handed at 390px; before/after screenshots at 5 widths committed to a `docs/mobile-audit/` folder.

---

## 6. Phase 4 — Premium micro-interactions & craft pass (desktop-led, all viewports)

Microanimations only — nothing that blocks, loops (except the existing marquee), or decorates without purpose. All reduced-motion gated.

1. **Branded `::selection`** — `background: var(--lp-accent); color: var(--lp-accent-fg)` in `landing.css`.
2. **Link underline draw** on all inline text links (footer, review links, record section links): `background-image: linear-gradient(currentColor, currentColor)`, `background-size: 0% 1px → 100% 1px` on hover, 250ms. (Flat color, not a decorative gradient — craft R1 compliant.)
3. **Magnetic buttons** already exist (`useMagnetic` in `primitives.tsx`) — extend to the secondary "The record" button and the nav pill CTA. Keep the fine-pointer gate.
4. **Button arrow nudge:** `ArrowRight`/`ArrowUpRight` translate +2px on hover (pattern already used in ReviewsSection:83–86 — generalize into `primitives.tsx` so all CTAs share it).
5. **Count-up numerals:** the hero facts (`22+`, `2004`) and the reviews aggregate animate count-up on first reveal (`gsap.from` on a textContent tween, `snap: 1`, 0.9s, `power3.out`). Reduced-motion: final value only.
6. **Image reveal:** the Record feature photo and LifeGrid tiles reveal with `clip-path: inset(0 0 100% 0) → inset(0)` (transform-adjacent, GPU-safe) instead of plain fade — AREA 17-style. One `data-reveal-clip` hook, handled by the page-level GSAP.
7. **Nav pill scroll state:** confirm the pill gains its surface/shadow state after 24px of scroll (exists per `.lp-nav-pill` — verify it fires and polish the timing).
8. **Focus-visible states:** audit every interactive element on the landing for a styled, on-brand focus ring (2px `var(--lp-accent)` offset 2px) — never bare `outline: none`.
9. **Footer:** hover states on every link; the staff sign-in link stays quiet but gets the underline draw.
10. **Copy hygiene:** fix the dental leftovers and stale comments from §1.

**Acceptance:** every animation answers "why does this move"; nothing animates layout properties; `prefers-reduced-motion` produces a fully static, complete page; no new color or font introduced; Lighthouse a11y stays ≥ 95.

---

## 7. Phase 5 — Performance & verification

1. Avatar images: 128px, optimized (the fetch script should re-encode to ~80% quality JPEG/WebP if trivially available; otherwise accept Google’s), `loading="lazy"`, `decoding="async"`, explicit `width`/`height` (40px rendered) — zero CLS.
2. Hero portrait is already `fetchPriority="high"` + srcset — keep.
3. Marquee: `will-change: transform` on `.lp-marquee-track` only while animating (add via GSAP, remove on pause is optional — measure first).
4. Run `bun run build` and check bundle delta is < 10KB gzip for all of this (it should be ~zero — no new dependencies allowed).
5. Lighthouse (mobile, throttled): Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO 100.

---

## 8. Explicitly out of scope

- No custom cursor (opt-in only, not requested).
- No dark mode for the landing (theme-locked light by design).
- No new fonts, no WebGL/Three.js, no page transitions.
- No changes to `/site/*`, the app, the CMS, or the API client.
- No Google Business Profile API integration (approval-gated; note as future work in `docs/API_NOTES.md` if Phase 1 lands).
- No real content changes beyond the dental-copy fix — all facts still come from `profile.ts` and its provenance rules. The draft-gated sections (LifeGrid, manifesto) stay draft-gated.

---

## 9. Verification commands

```bash
bun run dev                      # eyeball all phases at 390/768/1440
bun run fetch:reviews            # Phase 1: writes googleReviews.json + avatars
bun run build                    # must pass with and without GOOGLE_PLACES_API_KEY
bunx tsc --noEmit -p tsconfig.app.json   # types
bunx oxlint                      # lint (project uses .oxlintrc.json)
```

Plus: reduced-motion test (DevTools → Rendering → emulate `prefers-reduced-motion: reduce`) — page must be fully painted, marquee becomes a manual scroll region, no velocity effect. Keyboard walk of the whole page (Tab through nav, marquee pauses on focus, booking form, footer). Mobile screenshots before/after into `docs/mobile-audit/`.

---

## 10. File touch-list (summary for the executing agent)

| File | Phase | Change |
|------|-------|--------|
| `scripts/fetch-google-reviews.ts` | 1 | **new** — build-time Places fetch + avatar download |
| `src/features/landing/googleReviews.json` | 1 | **new** (generated, committed) |
| `public/reviews/avatars/` | 1 | **new** (generated) |
| `.env.example`, `.env.development` | 1 | add `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` (no `VITE_` prefix) |
| `package.json` | 1 | `fetch:reviews` script + build wiring |
| `src/features/landing/profile.ts` | 1, 2 | `Review.avatar/profileUrl`, `LIVE_REVIEWS`, rating override, GBP URL |
| `src/features/landing/sections/ReviewsSection.tsx` | 2 | header redesign, avatar cards, G glyph, velocity marquee |
| `src/features/landing/landing.css` | 2, 4, 5 | mask clamp, `::selection`, underline draw, will-change; fix header comment |
| `src/features/landing/primitives.tsx` | 4 | shared arrow-nudge, magnetic extension |
| `src/features/landing/LandingPage.tsx` | 4 | `data-reveal-clip` hook, count-up hook |
| `src/features/landing/LandingNav.tsx` | 3, 4 | hide-on-scroll, tap targets, comment cleanup |
| `src/features/landing/sections/HeroSection.tsx` | 3 | mobile facts/CTA layout |
| `src/features/landing/BookingSection.tsx` | 3 | 390px audit + dental copy rewrite |
| `src/features/landing/sections/LandingFooter.tsx` | 3, 4 | touch rows, link hovers |
| `src/features/landing/sections/RecordSection.tsx` | 3 | embed/photo 390px check |
| `docs/API_NOTES.md` | 1 | note the reviews pipeline + future GBP API upgrade |
