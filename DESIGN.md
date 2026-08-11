# OrthoClinic — design rules

The visual and interaction rulebook. `docs/CONVENTIONS.md` governs how things are
wired; this file governs how they look, feel and move. Where the two overlap,
this file wins on appearance and that one wins on architecture.

Read this before you build a screen. It is prescriptive on purpose — the point
of a design system is that you stop making these decisions individually.

**Who this is for.** One orthopaedic surgeon, in one clinic, running this eight
to eleven hours a day, six days a week, on a desktop with a tablet beside it.
Everything below follows from that: the interface is a tool, not a destination.
It should be fast, quiet, dense, and utterly predictable. Nothing here is
decorative.

---

## 1. Tokens

Defined in `src/styles/theme.css`. Use the utility, not the hex. There are no
raw hues in this system — if you find yourself reaching for `blue-600`, the role
you want either exists or needs to be added to the token file.

**The accent is indigo ink, not the generic UI blue.** Two reasons, both
practical rather than romantic: it is the colour of the pen a prescription gets
signed with, and it is the one cool hue *not* already spoken for — `info` and
`heard` own azure, `success` owns green. A button therefore cannot be mistaken
for a status, and the "heard" provenance rail cannot be mistaken for a link.

### Colour roles

| Token | Utility | Use it for |
|---|---|---|
| `--color-bg` | `bg-bg` | The app ground. The thing cards sit on. |
| `--color-bg-sunken` | `bg-bg-sunken` | Wells, sticky table headers, inset panels, code blocks. |
| `--color-surface` | `bg-surface` | Cards, panels, the prescription sheet. The default "paper". |
| `--color-surface-raised` | `bg-surface-raised` | Menus, popovers, dialogs, command palette. Anything floating. |
| `--color-surface-hover` | `bg-surface-hover` | Row / list-item / menu-item hover. |
| `--color-surface-active` | `bg-surface-active` | Row pressed, or row selected. |
| `--color-overlay` | `bg-overlay` | The scrim behind a dialog or sheet. Nothing else. |
| `--color-border` | `border-border` | The decorative hairline: card edges, table rules, separators. 1.3:1 — it is a seam, not a boundary. **Never on a form control.** |
| `--color-border-field` | `border-border-field` | The resting boundary of an input, select, combobox or secondary button. 3.4:1 light / 3.8:1 dark, because a field on a white card is identified by nothing else (WCAG 1.4.11). |
| `--color-border-strong` | `border-border-strong` | Hovered control, switch track, scrollbar thumb, a divider that must actually read. 3.7:1 / 4.7:1. |
| `--color-text` | `text-text` | Primary content. Inherited from `<body>` — you rarely name it. |
| `--color-text-muted` | `text-text-muted` | Labels, secondary content, table meta, placeholder-adjacent. |
| `--color-text-subtle` | `text-text-subtle` | Timestamps, hints, counts, footnotes, column headers. Still 7.9:1 — "subtle" here means *smaller and lighter in weight*, never *harder to read*. |
| `--color-accent` | `bg-accent` / `text-accent` | The primary action, the active nav item, links. |
| `--color-accent-hover` | `bg-accent-hover` | The hover of a solid accent fill. **Always use this, never `bg-accent/90`** — an alpha composites toward the page, so on a light ground the button gets *lighter* on hover and its white label loses contrast exactly when the pointer arrives. |
| `--color-danger-hover` | `bg-danger-hover` | Same, for the destructive button. |
| `--color-accent-fg` | `text-accent-fg` | Ink **on** a solid accent fill. Never assume white — in dark mode it is near-black. |
| `--color-accent-muted` | `bg-accent-muted` | Accent tint: selected nav row, active filter chip, text selection. |
| `--color-accent-muted-fg` | `text-accent-muted-fg` | Ink on the accent tint. |
| `--color-focus` | `outline-focus` / `ring-focus` | The focus ring. Only ever the focus ring. |

`text-muted` and `text-subtle` are aliases of `text-text-muted` / `text-text-subtle`.
Pick the canonical `text-text-*` spelling for consistency with the existing kit.

### Status roles

Four tokens each, no more. `success` · `warning` · `danger` · `info` · `allergy`.

| Suffix | Utility example | Means |
|---|---|---|
| *(none)* | `bg-danger` | The solid fill, or strong ink on a plain surface. |
| `-fg` | `text-danger-fg` | Ink **on** that solid fill. |
| `-muted` | `bg-danger-muted` | The tinted background. |
| `-muted-fg` | `text-danger-muted-fg` | Ink **on** the tint. |

A hairline on a tint is `border-danger/25`. That is safe — opacity modifiers
resolve at runtime in this setup (see §12).

| Role | When |
|---|---|
| `success` | A write landed. A prescription was signed. An appointment confirmed. Never as decoration on a neutral state. |
| `warning` | Something needs attention but nothing is broken: stock low, follow-up overdue, an unverified default. |
| `danger` | **UI** danger. Destructive buttons, delete confirmations, failed requests, field-level validation errors. May be a tint. |
| `info` | A neutral notice the user did not ask for. "Last visit 8 months ago." Rare — most info belongs in the layout, not a banner. |
| `allergy` | **Patient** danger. See §7. Never a tint. |

**Ink on a tint is `-muted-fg`, not the bare role.** `bg-success-muted text-success`
lands at 4.7:1; `bg-success-muted text-success-muted-fg` lands at 7.1:1. The bare
role is tuned to carry *white on top of itself*, which is a different job.

#### Why these hues sit where they do

The statuses are a **luminance ladder**, not five pretty hues. Roughly 8% of men
cannot separate red from amber by hue at all, and hue cannot fix that — under
deuteranopia red and amber collapse onto the same axis and only lightness
survives. So severity is encoded as darkness on white:

```
allergy 8.4:1   danger 7.5:1   info 6.1:1   success 5.4:1   warning 4.7:1
  darkest = most severe ─────────────────────────────► lightest
```

Dark mode inverts the ladder (warning is the *brightest* at 10.7:1, danger sits
at 5.2:1), which is the same rule seen from the other side.

What that buys, measured (ΔE under simulated dichromacy; greyscale = pure
luminance contrast, which is also what the clinic's B&W laser prints):

| Pair | Deuteranopia | Protanopia | Greyscale | Was (deut / grey) |
|---|---|---|---|---|
| `danger` vs `warning` | ΔE 18 | ΔE 33 | 1.59:1 | **ΔE 8 / 1.14:1 — collapsed** |
| `allergy` vs `warning` | ΔE 20 | ΔE 35 | 1.78:1 | **ΔE 5 / 1.29:1 — collapsed** |
| `danger` vs `success` | ΔE 25 | ΔE 19 | 1.39:1 | ΔE 30 / 1.10:1 |
| `warning` vs `success` | ΔE 40 | ΔE 28 | 1.14:1 | ΔE 38 / 1.03:1 |
| `accent` vs `info` | ΔE 16 | ΔE 18 | 1.32:1 | ΔE 42 / 1.09:1 |

Two of these are deliberate, documented trades:

- **`warning` vs `success` stays weak in greyscale (1.14:1).** Five roles cannot
  all be spread across the narrow 4.5–7.5:1 window that AA leaves on white; the
  ladder spends its room on the pairs that separate *stop* from *caution*. These
  two are separated by hue (ΔE 40/28 — the strongest pair in the table) and by
  the mandatory icon.
- **`accent` vs `info` got closer (ΔE 42 → 16)** when the accent moved from
  generic blue to indigo. This is a cosmetic pair, not a safety one — a button
  fill and a labelled badge are never in the same comparison set — and it bought
  the two safety rows above. Pushing the accent further toward violet makes it
  *worse*, not better: dichromats lose violet's red component and it collapses
  back toward blue (measured: ΔE 16 → 9 at hue 275).

**None of this licenses hue-only meaning.** The ladder is a safety net for when
colour is misread, not a substitute for the second channel. Every status still
ships an icon, a label or a shape.

### Clinical safety roles

| Token | Meaning |
|---|---|
| `--color-allergy` / `-fg` / `-muted` / `-muted-fg` | Allergy and contraindication. Solid fill only. See §7. |
| `--color-provenance-heard` (+ `-muted`) | The doctor said it and we transcribed it. |
| `--color-provenance-defaulted` (+ `-muted`) | We filled it from a clinic default or template. Verify. |
| `--color-provenance-blank` (+ `-muted`) | Nothing yet. Blocks signing. **Not** an error, **not** decoration. |

### Type

| Token | Utility | Size / weight | Use |
|---|---|---|---|
| `--text-display` | `text-display` | 32px / 640 | At most one per screen. Patient name on the detail header. |
| `--text-title` | `text-title` | 24px / 620 | Page title. |
| `--text-heading` | `text-heading` | 18px / 600 | Card and section headings. |
| `--text-body` | `text-body` | 15px / 400 | Default. Set once on `<body>`; restate only when overriding something smaller. |
| `--text-label` | `text-label` | 13px / 500 | Form labels, table cells, button labels, menu items. |
| `--text-caption` | `text-caption` | 12px / 500 | Helper text, timestamps, badge text. |
| `--text-micro` | `text-micro` | 11px / 600, +0.06em | UPPERCASE column headers and eyebrows **only**. Never a sentence. |

Tracking is baked into each step and **tightens as size grows** — the one
typographic rule here that is not a matter of taste. Do not add `tracking-*` on
top unless you are setting a caps eyebrow by hand (`tracking-caps`).

Leading moves the other way: large type gets tight leading because the line is
short, small dense type gets *more*. Everything below 15px was loosened
(`label` and `caption` 1.35 → 1.42, `body` 1.47 → 1.53) because 12–13px rows
stacked tightly turn into a grey block that has to be read twice.

**Measure.** `max-w-prose` (64ch, was 68) on anything read in sentences — advice,
instructions, notes, error bodies. `max-w-note` (52ch) for the free-text fields
the doctor writes into and re-reads. Never let a paragraph run the full width of
a 1440px screen.

**Numbers.** Anything compared down a column, read out digit by digit, or checked
against a box of tablets gets tabular, slashed-zero figures:

| Utility | Use |
|---|---|
| `data-numeric` | Already wired in `index.css`. Put it on any element holding a figure that changes. |
| `numeric` | Tabular + slashed zero + 0.01em. For counts, IDs, quantities. |
| `dose` | The above, monospaced, +0.02em. **Doses only.** |

`1-0-1` is a glyph sequence, not a word: the fixed advance of `dose` is what
makes the three slots read *as* three slots, and the extra tracking is what keeps
the hyphens from closing up. The slashed zero is what stops the middle `0` being
read as `O`. **Never render a dose below `text-caption` (12px)** — at 11px the
decimal point in `0.5` is one antialiased pixel on a bad panel.

Fonts: `font-sans` (default), `font-display` (32px and up only), `font-mono`.
Use `font-mono` for anything read digit by digit: MRNs, prescription IDs,
doses, correlation IDs, times in a schedule column. `index.css` already applies
`tabular-nums` to `table`, `time` and `[data-numeric]` — put `data-numeric` on
any element holding a figure that changes.

No webfonts, no CDN, no `<link>` to Google Fonts. The clinic's connection drops;
the app must not change shape when it does.

### Shape, elevation, motion, density

| Group | Tokens |
|---|---|
| Radius | `rounded-xs` 3 · `rounded-sm` 5 · `rounded-md` 7 · `rounded-lg` 10 · `rounded-xl` 14 |
| Elevation | `shadow-xs` · `shadow-sm` · `shadow-md` · `shadow-lg` · `shadow-overlay` |
| Duration | `duration-instant` 60ms · `duration-fast` 120 · `duration-base` 180 · `duration-slow` 260 |
| Easing | `ease-out-quint` · `ease-out-expo` · `ease-standard` · `ease-sheet` · `ease-spring` · `ease-spring-snap` |
| Magnitudes | `--motion-rise` 6px · `--motion-scale-from` .97 · `--motion-press` .97 |
| Row height | `h-row-compact` 28 · `h-row` 32 · `h-row-roomy` 40 |
| Control height | `h-control-sm` 26 · `h-control` 32 · `h-control-lg` 40 |
| Layout | `w-sidebar` 224 · `w-sidebar-collapsed` 52 · `h-topbar` 48 · `min-h-tap` 44 |
| Width | `max-w-form` 640 · `max-w-content` 1152 · `max-w-prose` 68ch |
| Z-index | `z-sticky` 10 · `z-dropdown` 30 · `z-overlay` 40 · `z-dialog` 50 · `z-toast` 60 · `z-tooltip` 70 |

**Nested radius rule:** the outer radius equals the inner radius plus the
padding. A `rounded-md` (7px) card with 4px padding holds `rounded-xs` (3px)
children. Concentric corners are one of the details nobody sees and everybody
feels.

**Elevation is a ladder, not a palette.** `shadow-sm` = resting card.
`shadow-md` = dropdown/popover. `shadow-lg` = sheet/palette. `shadow-overlay` =
modal dialog, and only modal dialogs. In dark mode these stop being drop shadows
and become border luminance automatically — do not add a `dark:` override.

---

## 2. Layout, spacing, density

**Grid.** 4px base (`--spacing`). Every gap, pad and offset is a multiple:
`gap-1` 4 · `gap-1.5` 6 · `gap-2` 8 · `gap-3` 12 · `gap-4` 16 · `gap-6` 24 ·
`gap-8` 32. Nothing between them. If a layout needs 7px, the layout is wrong.

**Shell.** Fixed 224px sidebar (`w-sidebar`), 48px topbar (`h-topbar`), scrolling
content region. The sidebar and topbar never scroll. The content region owns the
only vertical scrollbar on the page — nested scroll areas are for sheets, menus
and the transcript pane, nowhere else.

**Page padding.** 24px horizontal, 20px top, 32px bottom. Content is capped at
`max-w-content` (1152px) and left-aligned in the region, not centred — a 27"
monitor should not push the patient list into the middle distance.

**Column widths.**
- Forms: `max-w-form` (640px), single column. Two-column forms are permitted only
  for genuinely paired fields (from/to dates, systolic/diastolic).
- Reading text (clinical notes, settings explanations): `max-w-prose`.
- Tables: full width of the content region.

**Density.** Compact is the default, not an option the user has to find.
- Table rows: `h-row` (32px). `h-row-compact` (28px) for the formulary, audit log
  and any picker list. `h-row-roomy` (40px) only if the user opts in.
- Vertical rhythm inside a card: 12px between related rows, 20px between groups,
  a 1px `border-border` rule between sections that are genuinely distinct.
- Card padding: 16px. 12px for a card inside a card.
- Do not use whitespace to create hierarchy where a type step or a rule would do
  it in less space.

**Never** animate layout on load, and never reserve space with a `min-height`
guess. Skeletons must match the real element's box exactly (§4).

---

## 3. Components

### Buttons

Sizes (`h-*` from the control scale, `text-label`, `rounded-sm`):

| Size | Height | Padding | Use |
|---|---|---|---|
| `sm` | 26px | 10px | Table row actions, toolbar, inside a popover. |
| `md` | 32px | 12px | **Default.** Everything else. |
| `lg` | 40px | 16px | The single submit on a full-page form; login. |
| `icon` / `icon-sm` | square | — | Icon-only. Requires `aria-label`. Always. |

Variants:

| Variant | Looks like | Use |
|---|---|---|
| `primary` | `bg-accent text-accent-fg` | **One per view.** The thing the screen exists to do. If two things look primary, neither is. |
| `secondary` | surface + `border-border` + `shadow-sm` | The default button. Cancel, Back, secondary actions. |
| `ghost` | transparent, `text-text-muted`, hover fills | Toolbar and row actions where a border would add noise. |
| `subtle` | filled, borderless | Segmented groups, filter pills. |
| `danger` | `bg-danger text-danger-fg` | Confirming a destructive action inside a dialog. **Never** the trigger that opens the dialog — that one is `ghost` with `text-danger`. |
| `link` | accent, underline on hover | Inline in a sentence. Not as a fake button. |

Rules:
- Icon before label, 6px gap. Icons are 14px at `sm`, 16px at `md`/`lg`.
- Loading state keeps the label in place and swaps the icon slot for a spinner.
  The button **must not** change width mid-click.
- Disabled buttons keep their shape and drop to ~50% opacity. If the user cannot
  do the thing because of permissions, hide the button instead (see CONVENTIONS
  §Errors, 403).
- Press feedback is required: `scale(0.97)` on `:active`, `duration-fast`. Use
  `pressable` from `@/lib/motion` on `motion` components, or the CSS
  `--motion-press` token.
- No hover *scale*. Hover changes colour only. Hover-grow in a dense table is
  noise, and touch devices fire hover on tap.

### Inputs

- Height `h-control` (32px), `rounded-sm`, **`border-border-field`**,
  `bg-surface`, `text-body`, 8px horizontal padding.
- **Never `border-border` on a control.** That is a 1.3:1 decorative hairline; on
  a white card it is not a visible boundary, and a text field is identified by
  nothing else. `border-border-field` is the 3:1 boundary WCAG 1.4.11 asks for.
  This is the single change that most affects whether a dense form looks
  finished.
- Hover: `border-border-strong`. Focus: the ring (§9) plus `border-accent` and a
  `ring-accent/35` halo.
- Disabled fills to `bg-bg-sunken` at reduced opacity — never to
  `bg-surface-raised`, which is pure white in the light theme and therefore no
  change at all. A disabled field must be legible *as* inert, and must never be
  confusable with a blank provenance field (§7).
- Every input has a real `<label>` above it in `text-label text-text-muted`,
  4px gap. Placeholder is **never** the label — it disappears exactly when the
  user needs it.
- Helper text sits below in `text-caption text-text-subtle`. Error text replaces
  it in `text-caption text-danger` and the field border becomes `border-danger`.
  The layout must not shift when this happens — reserve the line.
- `aria-invalid` and `aria-describedby` on every errored field. Validation
  summaries are `aria-live="polite"`.
- Numeric inputs (dose, quantity, age) get `font-mono` and `inputMode="numeric"`.
- Select and combobox match input height exactly. A row of controls must have
  one shared baseline and one shared height.

### Cards / surfaces

- `bg-surface` + `border-border` + `rounded-md` + `shadow-sm`. That is the card.
- A card has a heading (`text-heading`) or it does not need to be a card.
- Cards do not have hover states unless the whole card is a link. If it is, the
  hover is `bg-surface-hover`, not a lift and not a shadow change.
- Nested card: drop the shadow, keep the border, use `bg-bg-sunken`.

### Tables and rows

- Header row: `bg-bg-sunken`, `text-micro` uppercase `text-text-subtle`, sticky,
  32px, with a bottom `border-border`.
- Body rows: `h-row`, `border-b border-border`, `text-label`.
- Hover `bg-surface-hover`; selected `bg-surface-active` **plus** a 2px
  `bg-accent` left rail. Colour alone must never be the only selection signal.
- Right-align numbers and dates; left-align text; never centre either.
- Row actions live in a trailing column, `ghost` `icon-sm`, revealed on
  row-hover **and** on row-focus, and always present (not `display:none`) for
  screen readers — use `opacity` so they stay in the tab order.
- Full-row click targets need `cursor-pointer` and a real `<a>` or `role="row"`
  with keyboard activation. Do not put a click handler on a bare `<tr>`.
- More than ~50 rows: virtualise or paginate. Never render 800 rows and hope.

### Badges / chips

`rounded-full`, `text-caption`, 8px horizontal, 2px vertical, tinted background
+ **`-muted-fg` role ink** + `/30` role border. Use for lifecycle state (Draft,
Signed, Dispensed) and for counts. Not for actions — a chip that does something
is a button.

**The `dot` is a shape, not just a colour.** A round dot that only changes hue
puts the whole status in the one channel ~8% of men cannot read. Each tone has
its own silhouette, so the badge survives dichromacy, a greyscale print-out and
a washed-out monitor:

| Tone | Mark | Why |
|---|---|---|
| `danger` | ◆ diamond | The hazard sign, and the only tilted mark here. |
| `warning` | ▲ triangle | The caution sign. |
| `success` | ● disc | Closed, complete. |
| `info` | ○ ring | Open, informational. |
| `accent` | ■ square | |
| `neutral` | □ hollow square | |

These are 6px marks. Anything more detailed turns to mush, and anything relying
on stroke weight alone disappears at 1×. This does not replace the label — a
badge always says what it means in words too.

### Empty states

Three distinct cases, three distinct treatments. Getting this wrong is the most
common way an app feels careless.

| Case | Treatment |
|---|---|
| Nothing exists yet | Centered in the region: one line of `text-heading`, one line of `text-caption text-text-subtle` explaining what goes here, and a `primary` button that creates the first one. |
| A filter or search returned nothing | Left-aligned, in place, no illustration: "No patients matching *sharma*." plus a `link` button to clear the filter. Never offer "create" here — they were looking, not authoring. |
| A permission blocks it | Say so plainly in `text-caption text-text-subtle`. No button. |

No illustrations, no mascots, no "Oops!".

### Loading

**The rule:** if the wait is under 300ms, render nothing at all. A spinner that
flashes for 120ms is worse than a beat of stillness — it reads as a glitch.

| Situation | Treatment |
|---|---|
| < 300ms expected | Nothing. Keep the previous content on screen. |
| A list, table, or card grid | Skeletons matching the real layout's exact dimensions and count. Zero layout shift when data lands. |
| A whole route | Skeleton of the shell (sidebar and topbar are already there and never re-render). |
| An action the user just triggered (save, sign, upload) | In-place spinner in the button, label unchanged, button width unchanged. |
| Refetching data already on screen | Nothing visible, or a 2px `bg-accent` progress line under the topbar. Never blank out content the user is reading. |

Skeleton = `bg-bg-sunken`, matching radius, with a slow CSS shimmer. The shimmer
is CSS (off the main thread), not `motion`. Under `prefers-reduced-motion` it
goes static automatically.

### Toasts

Sonner, bottom-right, `shadow-md`, `rounded-md`, `bg-surface-raised`.

- Success: auto-dismiss at 3s. Error: persists until dismissed.
- One line of `text-label`, optional second line of `text-caption`. No titles
  like "Success!" — say what happened: "Prescription signed."
- Max 3 stacked. Enters and exits from the same edge so swipe-to-dismiss feels
  physical (`springSoft`, then `springDrag` on release).
- A toast is never the only place a result appears. If a save failed, the form
  shows it too.
- Never toast a validation error. That belongs on the field.

### Dialogs

Radix Dialog. Centred, `max-w-form` or narrower, `bg-surface-raised`,
`rounded-lg`, `shadow-overlay`, `z-dialog`, scrim `bg-overlay` at `z-overlay`.

- Motion: `dialogPop` + `overlayFade`. Centre origin, no travel — a dialog is
  not anchored to anything, so it must not imply a direction.
- Title is `text-heading`. Body is `text-body`. Actions bottom-right, primary
  last, 8px gap.
- Focus moves to the first interactive element (or the title if the dialog is
  informational) on open, and returns to the trigger on close.
- Destructive dialogs: the confirm button is `danger`, and it is **not**
  auto-focused. Cancel is.
- Dialogs are for decisions that block. If the user can keep working, use a
  sheet or a toast.

### Sheets

Right-hand side panel for detail that has context (patient quick-view,
prescription detail, audit entry). `bg-surface`, `shadow-lg`, full height,
420–560px wide, `z-dialog`.

- Motion: `sheetSlide` — travels its own width using `ease-sheet`. Enter
  `duration-slow`, exit `duration-base`.
- Scrim only if the sheet is modal. A non-modal sheet lets the list behind stay
  interactive and gets no scrim.
- `Esc` closes. So does clicking the scrim. So does the ✕ in the top-right,
  which needs an `aria-label`.

### Command palette

`⌘K` / `Ctrl+K`. cmdk, centred, 560px, `bg-surface-raised`, `shadow-lg`,
`rounded-lg`.

**It does not animate.** Not on open, not on close. It is opened dozens of times
a day from the keyboard, and any transition on a keyboard-triggered surface
reads as lag. This is the single most important motion rule in the app.

---

## 4. Motion

### What animates

| Class | Example | Preset | Budget |
|---|---|---|---|
| Press feedback | Any button, row, chip | `pressable` / `scale(.97)` | 120ms, starts on `pointerdown` |
| Hover | Row, menu item, button | colour only | 60ms |
| Anchored surface | Dropdown, popover, tooltip, select | `scaleIn` | 180ms |
| In-place content | Card appearing, inline detail expanding | `fadeSlideUp` | 180ms |
| Arriving on its own | Toast, transcript line, background save | `springSoft` | ~340ms visual |
| Modal | Dialog + scrim | `dialogPop` / `overlayFade` | 260ms |
| Sheet | Side panel | `sheetSlide` | 260ms in, 180ms out |
| First paint of a list | Up to ~10 rows | `listStagger` + `listItem` | 24ms between rows |

### What must NOT animate

- **Anything triggered by the keyboard.** Command palette, `/` search focus,
  `g d` navigation, `Esc`. These happen hundreds of times a day; motion turns
  them into lag.
- Tab switches within a screen. Cross-fading panels of data reads as flicker.
- Table rows on sort, filter or paginate. The data changed; the furniture did not.
- Numbers. No count-up tickers on doses, counts, or vitals. A number that is
  animating is a number that is briefly wrong.
- Route changes. The shell stays; only the content region swaps, with no
  transition.
- Anything on initial page load. The app appears; it does not perform.

### Timing rules

- **Anything the user triggered must respond within 100ms.** Not "complete
  within" — *start* within. If the network is involved, change the control's
  state immediately (pressed, spinner, optimistic value) and let the data catch up.
- Nothing exceeds 260ms. If it needs longer, it is the wrong animation.
- **Exits are always faster than entrances.** The user has already decided.
- Never `ease-in` on a UI element — it delays the first frame, which is the one
  the user is watching. `ease-out-quint` unless you have a reason.
- Never `transition: all`. Name the properties.
- Only animate `transform`, `opacity`, `filter` and `clip-path`. Animating
  height, width, margin or top forces layout every frame.
- Never enter from `scale(0)` or `opacity: 0` alone at a large offset. Start from
  `--motion-scale-from` (0.97) and `--motion-rise` (6px). Nothing in the real
  world appears from nothing.
- Anchored surfaces scale from their trigger:
  `transform-origin: var(--radix-popover-content-transform-origin)`. Dialogs are
  the exception — centre origin.
- Springs for anything interruptible (drag, a value being retargeted mid-flight);
  tweens for everything else. Springs carry velocity through an interruption;
  tweens restart from zero.

### Reduced motion

`<MotionConfig reducedMotion="user">` at the app root, and the CSS block in
`theme.css` collapses every duration and zeroes `--motion-rise` /
`--motion-scale-from`. Opacity and colour transitions survive because they carry
meaning; distance and scale do not.

Use `useReducedMotionSafe()` only when the *decision* changes — disabling a drag
gesture, skipping a stagger, choosing `fadeOnly` over `sheetSlide`.

Put `data-motion-keep` on the rare element whose animation *is* the information:
an indeterminate progress bar, the live audio level meter during dictation.

---

## 5. Focus and keyboard

This app is used by one person who will learn every shortcut. Keyboard is the
primary interface; the mouse is the fallback.

### Focus ring

```
outline: 2px solid var(--color-focus);
outline-offset: 2px;
border-radius: var(--radius-sm);
```

Applied globally to `:focus-visible` in `index.css`. Do not restyle it per
component, and never remove it. If a component clips its own ring, give the
wrapper `overflow: visible` — do not shrink the offset.

Focus must be visible on `bg`, `surface` and `surface-raised`, in both themes.
It already is; do not introduce a surface colour that breaks it.

### Tab order

- DOM order is tab order. Do not use positive `tabindex`.
- Skip link to main content is the first focusable element on every page.
- Sheets and dialogs trap focus; menus and popovers do not (they close on blur).
- Focus is never lost. Closing a dialog returns focus to its trigger; deleting a
  row moves focus to the next row, or to the table header if it was the last.
- A row's hover-revealed actions stay in the tab order — reveal with `opacity`,
  not `display: none`.

### Reserved shortcuts

Do not bind these to anything else, anywhere.

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `/` | Focus the search field on the current screen |
| `Esc` | Close the topmost layer: menu → popover → sheet → dialog. If nothing is open, clear the current search/filter. Never navigates. |
| `⌘Enter` / `Ctrl+Enter` | Submit the form you are in |
| `⌘S` / `Ctrl+S` | Save (prevent the browser default) |
| `?` | Shortcut cheat sheet |
| `g` then `d` | Go to dashboard |
| `g` then `p` | Go to patients |
| `g` then `r` | Go to prescriptions |
| `g` then `a` | Go to appointments |
| `g` then `m` | Go to medicines |
| `n` | New — context-dependent (new patient on `/patients`, new prescription on `/prescriptions`) |
| `↑` `↓` | Move through the focused list or table |
| `Enter` | Open the focused row |
| `⌘\` / `Ctrl+\` | Collapse / expand the sidebar |

`g`-chords have a 1000ms window and are ignored while a text input has focus.
Every shortcut is discoverable: shown in the command palette next to its action,
and in the `?` sheet.

---

## 6. Accessibility floor

Not aspirations. Requirements.

### Contrast, measured

The target is **7:1 for anything read as prose or scanned in a column**, and a
hard floor of 4.5:1 for all text and 3:1 for non-text that carries meaning
(control boundaries, focus rings, icons that are the only label).

Every foreground/background pairing this system can actually produce — 72 of
them per theme, including ink on every tint and every hover ground — is checked
mechanically rather than by eye. **All 144 pass.** Do not add an ink or a ground
without re-running that check.

The ink ladder, and what it was:

| Pairing | Light before | Light after | Dark before | Dark after |
|---|---|---|---|---|
| `text` on `surface` | 18.9 | **19.0** | 15.3 | **15.3** |
| `text-muted` on `surface` | 7.5 | **10.2** | 7.5 | **9.5** |
| `text-muted` on `bg` | 6.9 ✗ | **9.4** | 8.1 | **10.3** |
| `text-muted` on `surface-raised` | 7.5 | **10.2** | 6.9 ✗ | **8.7** |
| `text-subtle` on `surface` | 5.2 ✗ | **7.9** | 4.7 ✗ | **8.0** |
| `text-subtle` on `bg` | 4.8 ✗ | **7.3** | 5.0 ✗ | **8.7** |
| `text-subtle` on `surface-raised` | 5.2 ✗ | **7.9** | 4.3 ✗ | **7.3** |
| `text-subtle` on `surface-hover` | 4.7 | **7.0** | 4.2 ✗ | **7.2** |
| `text-subtle` on `bg-sunken` | 4.4 ✗ | **6.6** | 5.2 | **9.0** |

Non-text, which was the worst of it:

| Pairing | Before | After | Why it matters |
|---|---|---|---|
| `border-strong` on `surface` (light) | 1.7 ✗ | **3.4** | It was being used as an input boundary. |
| `border-strong` on `bg` (light) | 1.6 ✗ | **3.1** | |
| `border-strong` on `surface` (dark) | 1.7 ✗ | **4.7** | |
| control boundary at rest | 1.3 ✗ | **3.4 / 3.8** | Was `border-border`, a decorative hairline. New `border-border-field`. |
| `allergy` ink on `surface` (dark) | 3.8 ✗ | **8.9** | Now via `allergy-muted-fg`; see §7. |

`text-subtle` on `bg-sunken` sits at 6.6:1 — the one pairing short of 7:1, and
only because the sunken ground exists to be darker. It is comfortably over the
floor and is not used for prose.

Two notes on things that look like failures and are not:

- **The focus ring against its own button** computes as 1.0:1, because
  `--color-focus` *is* `--color-accent`. `index.css` draws the ring at
  `outline-offset: 2px`, so its neighbours on both sides are the page ground
  (5.4:1), and the 2px gap is the light half of a two-tone ring. This is the
  geometry, not an oversight.
- **`allergy` in dark mode cannot be both.** Ink on a dark surface needs
  luminance ≥ 0.229; carrying white ink needs ≤ 0.183. No red satisfies both.
  `--color-allergy` is therefore the **fill** (white on it, 4.9:1) and
  `--color-allergy-muted-fg` is the **ink** (8.9:1). Since the allergy rule is
  already "always a solid fill, never a tint", the fill is the common case.

### The rest of the floor
- **Never colour alone.** Status = colour + icon + text. Selection = colour +
  rail. Provenance = colour + rail style. Roughly 8% of men have a colour vision
  deficiency, and this app has exactly one user whose vision may change.
- **Hit targets.** 32px minimum on desktop; 44px (`min-h-tap`) for anything
  reachable on the tablet. A 26px `sm` button needs 44px of padded hit area
  around it on touch.
- **Every icon-only button has an `aria-label`.** No exceptions, including the
  sheet close ✕ and the row overflow ⋯.
- **Every input has a real `<label>`.** `aria-label` is a fallback for when there
  is genuinely no room, not a shortcut.
- **`aria-live="polite"`** on: validation summaries, the live speech transcript,
  save/sign confirmations, and the "N results" count after filtering.
- **`aria-live="assertive"`** on exactly one thing: the allergy conflict banner
  when a prescribed medicine matches a recorded allergy. Nothing else earns it.
- **`prefers-reduced-motion`** is respected globally. See §4.
- Text zooms to 200% without clipping. Do not set `overflow: hidden` on a text
  container to make a layout work.
- Do not disable browser zoom or set `user-scalable=no`.

---

## 7. Clinical safety patterns

These two are not styling decisions. Treat changes to them as changes to
clinical behaviour.

### Allergy and contraindication

When a prescribed medicine conflicts with a recorded allergy:

- A **solid** `bg-allergy text-allergy-fg` banner, full width of the
  prescription pad, directly above the medicine list. Never a tint, never a
  badge, never a tooltip.
- Icon (`TriangleAlert`, 16px) + the word "Allergy" + the specific conflict:
  "Diclofenac — patient is allergic to NSAIDs (recorded 12 Mar 2024)."
- Not dismissible. Not collapsible. Not truncated. It disappears only when the
  conflict does.
- `role="alert"` and `aria-live="assertive"`.
- The offending medicine row also carries an `allergy`-toned marker so the
  banner and the cause are visually linked.
- Signing is blocked until the doctor either removes the medicine or records an
  explicit override with a reason. The override control is a `danger` button in
  a dialog, never a checkbox.

This practice prescribes NSAIDs constantly. An allergy missed once is a real
injury, so this pattern is allowed to be louder than everything else in the app —
and it is the only thing that is.

### Field provenance

Every field on the prescription pad shows where its value came from. Apply the
utility to the field wrapper and mirror it in a `data-provenance` attribute.

**The shape is the signal; the hue is the echo.** Two rails and a box — three
different silhouettes, so the triad is readable before any colour is:

| State | Utility | Treatment | Meaning |
|---|---|---|---|
| Heard | `prov-heard` | **3px solid** azure left rail | The doctor said it; we transcribed it. |
| Defaulted | `prov-defaulted` | **3px dotted** ochre left rail | Filled from a clinic default or a past visit. Verify before signing. |
| Blank | `prov-blank` | **Dashed graphite box** + faint diagonal hatch, em-dash placeholder | Not said yet. Blocks signing. |

The rails are 3px, not 2px. At 2px a dotted border renders as a near-solid line
on a 1× display, which collapsed `defaulted` into `heard` — the exact failure
the shape channel exists to prevent. Both rails keep the same 11px total left
inset, so field text does not shift when provenance changes under it.

The hues deliberately echo `info` and `warning`: "the system heard you" *is*
informational and "the system guessed" *is* a soft caution. Reusing the family
keeps the palette small. What stops them reading as decoration is the geometry
plus the always-present `ProvenanceTag`.

Rules:
- Blank is **not** `danger`. Nothing is wrong — the doctor simply has not said it
  yet. Colouring it red trains the eye to ignore red, which is where real errors
  live. It is graphite, high-contrast (8.0:1 in both themes), and it blocks the
  Sign action. That is its whole job.
- Blank is **not** decoration either. Do not soften it to a placeholder grey,
  do not tint it, do not let it look like an ordinary empty input.
- **Blank must never read as *disabled*.** These are opposite meanings — one is
  "waiting for you", the other is "not for you — go away". They are kept apart on
  two axes: a disabled control is *dimmed* (50% opacity) and *flat*; a blank
  field is at *full* contrast and visibly *hatched*. Dimming is the only thing in
  this system allowed to mean "switched off", which is why nothing else may be
  dimmed, and the hatch is the only thing allowed to mean "reserved". Never dim a
  blank field, and never hatch a disabled one.
- Once the doctor edits a field by hand, it stops being `heard` or `defaulted`
  and shows no rail at all — an edited field is authored, and authored is the
  baseline.
- The Sign button is disabled while any `[data-provenance="blank"]` remains, with
  a `text-caption text-text-subtle` line naming what is still missing.
- The rails are defined once in `theme.css`. Do not hand-roll them and do not
  vary them per screen.

---

## 8. Things that make this feel cheap — do not do

- Emoji as icons. Use lucide-react at 14/16px.
- The default browser focus outline, or `outline: none` with no replacement.
- Unlabelled icon buttons.
- Layout shift on load. Skeletons match the real box or there is no skeleton.
- A spinner for a wait under 300ms.
- Purple-to-blue gradients, "AI sparkles", glow effects, glassmorphism.
- Animating the command palette, or anything else opened by keyboard.
- More than one `primary` button in a view.
- `transition: all`.
- Entering from `scale(0)`.
- Popovers that scale from their own centre instead of their trigger.
- Hover-grow on rows or cards.
- Drop shadows in dark mode. Elevation there is border luminance, and the tokens
  already handle it.
- Raw Tailwind palette colours (`bg-blue-500`, `text-gray-400`). Every colour in
  this app is a role.
- **`bg-surface-raised` as a *fill*.** It is pure white in the light theme, so on
  a white card it is not a fill at all — it is how buttons, key caps, chips and
  row hovers ended up invisible in one theme while looking fine in the other. It
  is for *floating* things (menus, popovers, dialogs) that sit above the page and
  earn their edge from elevation. For a neutral fill on a card use
  `bg-bg-sunken`; for a hover use `bg-surface-hover`.
- **Hovering a solid fill with an alpha** (`hover:bg-accent/90`). It composites
  toward whatever is behind, so on a light ground the fill gets *weaker* on hover
  and its white label loses contrast at the exact moment the pointer is on it.
  Use `bg-accent-hover` / `bg-danger-hover`.
- **Ink that is the bare role on its own tint** (`bg-danger-muted text-danger`).
  That is the fill colour doing an ink's job. Use `-muted-fg`.
- Toasts for validation errors.
- `text-center` on anything except an empty state.
- Placeholder text used as a label.
- Titles like "Oops!", "Success!", "Whoops, something went wrong".
- Sentences in `text-micro` uppercase.
- Two different greys for the same job. If you need a new neutral, you need a new
  token, and probably you don't.
- Justified text, italic body copy, or letter-spacing on body text.
- Any external font, image, script or CDN. This app works offline.

---

## 9. Motion primitives

Import from `@/lib/motion`. Do not hand-roll a transition at a call site — five
slightly different 200ms fades is exactly what makes software feel cheap.

| Export | Use |
|---|---|
| `springSnappy` | Anything the user directly triggered. No bounce. |
| `springSoft` | Anything arriving on its own. Slight bounce. |
| `springDrag` | Gesture release only — velocity carries through the interruption. |
| `tweenInstant` / `tweenFast` / `tweenBase` / `tweenSlow` | Fixed-duration equivalents of the CSS duration tokens. |
| `tweenExit` | The exit half of anything. Always faster than the entrance. |
| `easeOutQuint` / `easeOutExpo` / `easeStandard` / `easeSheet` | Bezier tuples matching the CSS easings. |
| `fadeSlideUp` | Default entrance for in-place content. |
| `scaleIn` | Menus, popovers, comboboxes. |
| `dialogPop` + `overlayFade` | Modal dialogs. |
| `sheetSlide` | Side sheets. |
| `listStagger` + `listItem` | First paint of a short list. |
| `fadeOnly` | The reduced-motion substitute for any of the above. |
| `pressable` | Spread onto a pressable `motion` component. |
| `useReducedMotionSafe()` | `boolean`, never `null`. |
| `motionSafeVariants(reduced, variants)` | Swaps in `fadeOnly`. |

Always-on or looping motion (skeleton shimmer, the dictation level meter)
belongs in CSS, not `motion`: CSS animations run off the main thread and hold
their frame rate while React renders a 400-row table.

---

## 10. Theming

Three states, and the CSS handles all of them:

- explicit light → `<html data-theme="light">`
- explicit dark → `<html data-theme="dark">`
- system → **no attribute at all**

`index.html` resolves this before first paint, so there is never a light flash on
a dark machine. `ThemeProvider` owns the choice.

Dark mode is designed, not inverted: a cool near-black ground that is never
`#000`, surfaces that step *up* in luminance, ink that stops short of pure white,
accents re-picked for a dark ground, and elevation expressed as border luminance
rather than shadow. The one thing that does not go pastel is `allergy` — it keeps
a saturated fill and white ink, because it is the only red left that still reads
as a warning light.

You should almost never need Tailwind's `dark:` variant. The tokens flip on their
own. Reach for `dark:` only when an entire treatment changes, never to restate a
colour.

---

## 11. Print

The prescription print view is served as its own document by the API. For
in-app print (patient summary, schedule), put `data-print-hide` on chrome —
sidebar, topbar, action bars, toasts. `index.css` handles the rest.

---

## 12. Tailwind v4 notes that will bite you

- **There is no `tailwind.config.js` and there must never be one.** Tokens live
  in `@theme` in `src/styles/theme.css`.
- Theme values in this project point at runtime variables
  (`--color-danger: var(--c-danger)`). That indirection is load-bearing: it is
  what makes `bg-accent/10`, `border-danger/25` and `shadow-md` flip with the
  theme instead of baking the light-mode value at build time. **If you add a
  colour or a shadow token, follow the same pattern** — declare the raw value as
  `--c-*` / `--elev-*` in all three palette blocks, then map it in `@theme`.
- The light palette, both dark palettes, and the `@theme` map are four separate
  blocks. A new colour needs an entry in all four.
- Tailwind only emits the `--color-*` variables it sees used. If you reference
  one from hand-written CSS it is detected and kept — but if you build a token
  nothing uses, do not be surprised when it is absent from the output.
- `text-*` on a colour token means *ink*; `text-*` on a size token means *type*.
  `text-danger` is a colour, `text-body` is a size. They coexist because the
  names never collide — keep it that way when adding tokens.
