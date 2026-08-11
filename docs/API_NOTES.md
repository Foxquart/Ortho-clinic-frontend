# API_NOTES — what the schema says that the prose doesn't

Source of truth: the live OpenAPI 3.1 document (`GET /openapi.json`, title
**OrthoClinic**, version 1.0.0 — 54 paths, 76 operations, 76 component schemas).
Everything below was read out of that document; a handful of runtime facts were
confirmed by probing `http://localhost:8000` and are labelled **(live)**.

Types generated from it: `src/api/schema.ts`, `src/api/endpoints.ts`.

---

## 1. Prose claims, checked against the schema

### ❌ "Every list endpoint takes `page` / `page_size` / `sort_by` / `sort_order`"

**False, and this is the biggest trap in the API.** Only **6 of 15** list-style
GETs are paginated. The other nine take *no query parameters at all* and return a
**bare JSON array**, not a `Paginated<T>` envelope. Two more take a completely
different param set.

| Endpoint | Query params | Response shape |
|---|---|---|
| `GET /patients` | page, page_size, sort_by, sort_order | `Page[PatientResponse]` |
| `GET /medicines` | page, page_size, sort_by, sort_order | `Page[MedicineResponse]` |
| `GET /users` | page, page_size, sort_by, sort_order | `Page[UserResponse]` |
| `GET /prescriptions` | **patient_id** + all four | `Page[PrescriptionResponse]` |
| `GET /appointments` | **status, from_date, to_date, patient_id** + all four | `Page[AppointmentDetailResponse]` |
| `GET /audit-logs` | **user_id, entity_type** + all four | `Page[AuditLogResponse]` |
| `GET /patients/search` | **q (required), limit** — no pagination | `PatientSearchResult[]` |
| `GET /medicines/search` | **q (required), limit** — no pagination | `MedicineResponse[]` |
| `GET /patients/{id}/prescriptions` | **none** | `PrescriptionResponse[]` |
| `GET /appointments/availability` | **none** | `WeeklyAvailabilityResponse[]` |
| `GET /clinic/templates` | **none** | `PrescriptionTemplateResponse[]` |
| `GET /portfolio/pages` | **none** | `PortfolioPageResponse[]` |
| `GET /portfolio/services` | **none** | `ServiceResponse[]` |
| `GET /portfolio/gallery` | **none** | `GalleryImageResponse[]` |
| `GET /portfolio/testimonials` | **none** | `TestimonialResponse[]` |
| `GET /public/portfolio` | **none** | untyped object with 4 arrays |
| `GET /public/availability` | **none** | `WeeklyAvailabilityResponse[]` |

Consequences for the UI:

- A shared `useList()` hook that always reads `res.items` will break on nine
  endpoints. Branch on the route, not on a convention.
- Patient search and medicine search cannot be paged. `limit` maxes at **100**;
  past that, results are silently truncated with no `total`.
- There is **no `q` / free-text filter on `GET /patients` or `GET /medicines`**.
  Text search only exists on the two dedicated `/search` routes.
- `sort_by` is a **nullable free string with no default and no enum of allowed
  columns**. The schema does not tell you which columns are sortable; a bad value
  is a runtime gamble.
- `sort_order` has `pattern: ^(asc|desc)$` and defaults to **`desc`**, so an
  unspecified list is newest-first, not oldest-first.

### ✅ "Prescription `dosage` and `frequency` are required with min_length 1"

**True** — but they live on `PrescriptionItemCreate` (each line item), not on
`PrescriptionCreateRequest`. The schema also adds upper bounds the prose omits:
`dosage` is **1..128** chars, `frequency` is **1..64** chars. The parent object
requires **only `items`**.

### ✅ "There is no DELETE for patients"

**True**, and it generalises further than the prose suggests. The API has exactly
**four** DELETE routes:

- `DELETE /appointments/availability/{availability_id}`
- `DELETE /portfolio/services/{service_id}`
- `DELETE /portfolio/gallery/{image_id}`
- `DELETE /portfolio/testimonials/{testimonial_id}`

All four return `MessageResponse`. There is **no DELETE** for patients,
medicines, users, prescriptions, portfolio *pages*, or clinic templates.
Deactivation paths instead:

| Entity | How to "delete" |
|---|---|
| Patient | `PATCH /patients/{id}` with `is_active: false` |
| Medicine | `POST /medicines/{id}/deactivate` (and `/reactivate`) — dedicated routes, *and* `PATCH … {is_active}` also works |
| User | `PATCH /users/{id}` with `is_active: false` |
| Prescription | nothing at all — see §5 |
| Portfolio page | `PATCH /portfolio/pages/{id}` with `is_published: false` |
| Clinic template | `PATCH /clinic/templates/{id}` with `is_active: false` |

### ❓ "Appointment status transitions are scheduled→confirmed\|in_progress\|cancelled, …"

**The schema says nothing about this.** `AppointmentStatus` is a flat enum of six
values with no `x-` extensions, no state machine, no per-operation description,
and — critically — `PATCH /appointments/{id}/status` declares **only `200` and
`422`** responses. There is no documented `409 conflict` for an illegal
transition anywhere in the document.

So the prose transition table is **unverifiable from the schema**. Treat it as a
UI hint, not a contract: build the status control so that an unexpected
non-2xx is handled gracefully rather than assuming the client-side guard is
authoritative. Note in particular that the prose's `no_show → scheduled`
"un-terminal" edge, and the claim that `completed`/`cancelled` are terminal, have
zero support in the document.

Related trap: **status is not settable through `PATCH /appointments/{id}`**.
`AppointmentUpdateRequest` contains only `appointment_date`, `start_time`,
`reason`, `notes`. Status changes go through the separate
`PATCH /appointments/{id}/status` route with `AppointmentStatusUpdateRequest`.

---

## 2. Exact required-vs-optional field lists

`REQUIRED` = in the schema's `required` array. `nullable` = the schema is
`anyOf [X, null]`, i.e. you may send `null` explicitly. These are independent:
an optional field can be non-nullable (usually because it has a server default).

### `PatientCreateRequest` — `POST /patients`

| Required (3) | Optional + nullable (10) |
|---|---|
| `first_name`, `last_name`, `phone` | `date_of_birth`, `gender`, `email`, `address`, `city`, `blood_group`, `allergies`, `medical_history`, `emergency_contact` |

- `phone` is required — a patient with no phone number cannot be created.
- `email` is **not** required and carries `format: email`.
- `gender` is the `Gender` enum here (`male`/`female`/`other`).
- `allergies` is `string[]` with **no size bound and no per-item length bound**.
- `medical_history` and `emergency_contact` are **untyped free-form objects**
  (`additionalProperties: true`) — the schema models nothing inside them.
- There is **no `is_active`** on create (it exists only on update).

### `PrescriptionCreateRequest` — `POST /prescriptions`

| Required (1) | Optional + nullable (8) |
|---|---|
| `items` | `patient_id`, `patient`, `appointment_id`, `diagnosis`, `chief_complaint`, `advice`, `notes`, `follow_up_date` |

- **`items` is the only required field.** Everything else, including the patient,
  is optional as far as the schema is concerned.
- The description adds a rule the schema cannot express: *"`patient` may be
  omitted when the doctor already selected an existing patient via `patient_id`.
  If neither is given the request is rejected."* Your form must enforce
  "exactly one of `patient_id` / `patient`" itself — no type can catch it.
- `patient_id` and `appointment_id` are declared as plain **`string`, with no
  `format: uuid`** (unlike everywhere else in the API).
- `items` is bounded **1..50**.

#### `PrescriptionItemCreate` (the item schema)

| Required (3) | Optional + nullable (3) |
|---|---|
| `medicine_id`, `dosage`, `frequency` | `duration_days`, `quantity`, `instructions` |

`medicine_id` is again a bare `string` with no `format: uuid`.

### `AppointmentCreateRequest` — `POST /appointments` (staff)

| Required (2) | Optional + nullable (3) | Optional, non-nullable (1) |
|---|---|---|
| `appointment_date`, `start_time` | `patient_id`, `reason`, `notes` | `source` (default `"public"`) |

- **`patient_id` is optional** even on the staff booking route.
- There is no `end_time` in the request — the server derives it (responses do
  carry `end_time`).
- `source` defaults to `"public"` **even on the authenticated staff endpoint**.
  If you want staff bookings distinguishable in the audit trail, send `source`
  explicitly. It is a free string with no `maxLength` and no enum.

### `MedicineCreateRequest` — `POST /medicines`

| Required (1) | Optional + nullable (7) | Optional, non-nullable (1) |
|---|---|---|
| `name` | `generic_name`, `brand_name`, `strength`, `category`, `manufacturer`, `description` | `dosage_form` (default `"tablet"`) |

`dosage_form` is **not nullable on create** but **is nullable on update** — send
a valid enum value or omit the key entirely; `null` will 422 on `POST`.

### `UserCreateRequest` — `POST /users`

| Required (4) | Optional, non-nullable (1) |
|---|---|
| `username`, `email`, `full_name`, `password` | `role` (default `"staff"`) |

`UserUpdateRequest` has **no `username` and no `password`** — usernames are
immutable and password changes go through `POST /users/{id}/reset-password`
(admin) or `POST /auth/change-password` (self).

### `AppointmentCreateByPatientRequest` — `POST /public/appointments` (the public booking payload)

| Required (5) | Optional + nullable (1) |
|---|---|
| `patient_first_name`, `patient_last_name`, `patient_phone`, `appointment_date`, `start_time` | `reason` |

- Field names are **prefixed with `patient_`** — they do NOT match
  `PatientCreateRequest`'s `first_name` / `last_name` / `phone`.
- **No `email` field.** A public booker cannot supply an email address.
- **No `notes` field** (staff-side `AppointmentCreateRequest` has one).
- Returns a full `AppointmentDetailResponse` — including the patient's `id` and
  the clinic's `doctor_id` — to an unauthenticated caller.
- Requires the double-submit CSRF token from `GET /public/csrf` first **(live:
  omitting it returns `403 csrf_failed`)**.

---

## 3. Every declared validation constraint

Mirror these in the form layer so a 422 is never the first time the user hears
about a problem. `min`/`max` are numeric bounds; lengths are character counts.

### Request bodies

| Schema | Field | Req? | Constraints |
|---|---|:--:|---|
| `AppointmentCreateByPatientRequest` | `patient_first_name` | ✔ | 1..64 |
| | `patient_last_name` | ✔ | 1..64 |
| | `patient_phone` | ✔ | 6..20 |
| | `appointment_date` | ✔ | `format: date` |
| | `start_time` | ✔ | `format: time` |
| | `reason` | | ≤512 |
| `AppointmentCreateRequest` | `appointment_date` | ✔ | `format: date` |
| | `start_time` | ✔ | `format: time` |
| | `reason` | | ≤512 |
| | `notes` | | ≤1024 |
| `AppointmentUpdateRequest` | `appointment_date` | | `format: date` |
| | `start_time` | | `format: time` |
| | `reason` | | ≤512 |
| | `notes` | | ≤1024 |
| `ChangePasswordRequest` | `current_password` | ✔ | 1..128 |
| | `new_password` | ✔ | **8**..128 |
| `ClinicSettingsUpdate` | `clinic_name` | | 1..128 |
| | `tagline` | | ≤255 |
| | `phone` / `alternate_phone` | | ≤20 |
| | `email` | | ≤255 (**no `format: email`**) |
| | `address` | | ≤512 |
| | `city` | | ≤128 |
| | `postal_code` | | ≤16 |
| | `website_url` | | ≤255 |
| | `logo_url` / `google_maps_url` | | ≤512 |
| | `footer_text` | | ≤2000 |
| | `currency` | | ≤8 |
| | `registration_number` | | ≤64 |
| `DoctorProfileUpdate` | `full_name` | | 1..128 |
| | `specialization` | | ≤128 |
| | `qualifications` | | ≤255 |
| | `registration_number` | | ≤64 |
| | `experience_years` | | integer **0..100** |
| | `bio` | | ≤4000 |
| | `photo_url` / `signature_image_url` | | ≤512 |
| `GalleryImageCreate` / `…Update` | `image_url` | ✔ / — | 1..512 |
| | `caption` / `alt_text` | | ≤255 |
| `LoginRequest` | `username` | ✔ | 1..64 |
| | `password` | ✔ | 1..128 |
| `MedicineCreateRequest` / `…Update` | `name` | ✔ / — | 1..128 |
| | `generic_name` / `brand_name` / `manufacturer` | | ≤128 |
| | `strength` | | ≤32 |
| | `category` | | ≤64 |
| | `description` | | ≤2000 |
| `PatientCreateRequest` / `…Update` | `first_name` / `last_name` | ✔ / — | 1..64 |
| | `phone` | ✔ / — | **6**..20 |
| | `email` | | `format: email` |
| | `date_of_birth` | | `format: date` |
| | `address` | | ≤512 |
| | `city` | | ≤128 |
| | `blood_group` | | ≤8 |
| | `allergies` | | `string[]`, **no bounds** |
| `PatientUpsert` | `first_name` / `last_name` | ✔ | 1..64 |
| | `phone` | ✔ | 6..20 |
| | `gender` | | ≤10 (**free string, not the enum**) |
| | `email` | | ≤255 (**no `format: email`**) |
| `PortfolioPageCreate` | `slug` | ✔ | 1..64, pattern `^[a-z0-9-]+$` |
| | `title` | ✔ | 1..128 |
| | `subtitle` / `meta_description` | | ≤255 |
| | `meta_title` | | ≤160 |
| | `hero_image_url` | | ≤512 |
| `PortfolioPageUpdate` | same as create | | **but `slug` is absent — immutable** |
| `PrescriptionCreateRequest` | `items` | ✔ | array, **1..50 entries** |
| | `diagnosis` / `chief_complaint` | | ≤512 |
| | `advice` / `notes` | | ≤4000 |
| | `follow_up_date` | | `format: date` |
| `PrescriptionItemCreate` | `medicine_id` | ✔ | plain string, no format |
| | `dosage` | ✔ | **1**..128 |
| | `frequency` | ✔ | **1**..64 |
| | `duration_days` | | integer **1..3650** |
| | `quantity` | | integer **1..10000** |
| | `instructions` | | ≤2000 |
| `PrescriptionTemplateCreate` / `…Update` | `name` | ✔ / — | 1..128 |
| | `description` | | ≤2000 |
| | `header_html` / `footer_html` | | **no length bound** |
| `ServiceCreate` / `ServiceUpdate` | `title` | ✔ / — | 1..128 |
| | `description` | | ≤4000 |
| | `icon_name` | | ≤64 |
| `TestimonialCreate` / `…Update` | `author_name` | ✔ / — | 1..128 |
| | `author_role` | | ≤128 |
| | `content` | ✔ / — | 1..4000 |
| | `rating` | | integer **1..5** (default 5) |
| `UserCreateRequest` | `username` | ✔ | **3**..64, pattern `^[a-zA-Z0-9_.-]+$` |
| | `email` | ✔ | `format: email` |
| | `full_name` | ✔ | 1..128 |
| | `password` | ✔ | **8**..128 |
| `UserPasswordResetRequest` | `new_password` | ✔ | **8**..128 |
| `UserUpdateRequest` | `email` | | `format: email` |
| | `full_name` | | 1..128 |
| `WeeklyAvailabilityCreate` | `day_of_week` | ✔ | `DayOfWeek` enum |
| | `start_time` / `end_time` | ✔ | `format: time` |
| `WeeklyAvailabilityUpdate` | `start_time` / `end_time` | | `format: time` (**`day_of_week` absent — immutable**) |

Password rules worth calling out: minimum **8**, maximum **128**, and **no
character-class pattern**. There is no complexity requirement in the schema.
`LoginRequest.password` has `minLength: 1` — do not reuse the 8-char rule on the
login form or you will block legacy accounts.

### Query parameters

| Param | Where | Req? | Constraints |
|---|---|:--:|---|
| `page` | 6 paginated lists | | integer, **min 1**, default 1 |
| `page_size` | 6 paginated lists | | integer, **1..200**, default 20 |
| `sort_by` | 6 paginated lists | | nullable string, **no default, no enum** |
| `sort_order` | 6 paginated lists | | pattern `^(asc\|desc)$`, **default `desc`** |
| `q` | `/patients/search`, `/medicines/search` | **✔** | **1..100** chars |
| `limit` | `/patients/search`, `/medicines/search` | | integer, **1..100**, default 20 |
| `date` | `/appointments/slots`, `/public/slots` | **✔** | `format: date` |
| `status` | `/appointments` | | `AppointmentStatus` or null |
| `from_date`, `to_date` | `/appointments` | | `format: date` or null |
| `patient_id` | `/appointments`, `/prescriptions` | | `format: uuid` or null |
| `user_id` | `/audit-logs` | | `format: uuid` or null |
| `entity_type` | `/audit-logs` | | string **≤64**, nullable, **no enum of values** |
| `language_code` | `POST /speech/transcribe` | | string or null, e.g. `"en-IN"` |
| `identify_multiple_languages` | `POST /speech/transcribe` | | boolean or null |

`page_size` capping at **200** and `limit` at **100** are different ceilings for
the same conceptual thing — don't share one constant.

---

## 4. All enum values, verbatim

```
AppointmentStatus   scheduled | confirmed | in_progress | completed | cancelled | no_show
AuditAction         create | update | delete | login | logout | view | void | print | status_change
DayOfWeek           monday | tuesday | wednesday | thursday | friday | saturday | sunday
Gender              male | female | other
MedicineDosageForm  tablet | capsule | syrup | injection | ointment | cream | gel | drops |
                    inhaler | powder | other
PrescriptionStatus  active | voided
UserRole            admin | doctor | staff
```

Seven enums total. Things that **look** like enums but are **not**:

| Field | Actual schema |
|---|---|
| `blood_group` (patient) | plain `string`, `maxLength: 8` — no enumeration anywhere |
| `PatientUpsert.gender` | plain `string`, `maxLength: 10` — **not** the `Gender` enum |
| `AppointmentDetailResponse.source` / `AppointmentCreateRequest.source` | plain `string`, no bound, default `"public"` |
| `AvailableSlotResponse.status` | plain `string` (**live**: emits `"available"`) |
| `AuditLogResponse.entity_type` | plain `string` |
| `HealthResponse.status` / `.environment` / `.database` | plain `string` |
| `SpeechConfigResponse.provider` / `.media_encoding` | plain `string` |

---

## 5. In the schema, absent from the prose

**Error envelope is undocumented.** The document declares only `200`, `201` and
`422` across all 76 operations, and types 422 as FastAPI's `HTTPValidationError`
(`{detail: [{loc, msg, type}]}`). **(live)** The server actually returns a
completely different, uniform envelope for *every* error, 422 included:

```json
{"error":{"code":"validation_error","message":"The provided data failed validation.",
 "details":[{"location":"body.username","message":"Field required"}]}}
```

Codes observed live: `validation_error`, `unauthorized`, `csrf_failed`. A client
written against `HTTPValidationError` will read `err.detail` and get `undefined`.
Use `ApiErrorBody` from `src/api/schema.ts`.

**No security metadata at all.** There is no `components.securitySchemes`, no
top-level `security`, and no per-operation `security`. Nothing in the document
distinguishes an authenticated route from a public one, and **not one operation
description mentions `admin`, `doctor` or `staff`.** Role gating in the UI is
therefore guesswork; `endpoints.ts` marks the plausibly-privileged groups
(`users`, `audit-logs`, `clinic`) as unverified rather than asserting a rule.
**(live)** Everything except `/health` and `/public/*` 401s when signed out —
including `GET /speech/config`.

**404s masquerade as 401s when signed out. (live)** `GET /patients/<random-uuid>`
returns `401 unauthorized`, not `404`, for an anonymous caller. Auth is checked
before existence, so a "not found" screen must not be driven by status code alone.

**No `servers` block.** The document has no `servers` array, so the `/api/v1`
prefix is only discoverable from the path strings themselves.

**An entire speech/transcription subsystem.**
`GET /speech/config` returns recording parameters (`sample_rate_hz`,
`media_encoding`, `channels` default 1, `bits_per_sample` default 16,
`language_options`, `vocabulary_name`) plus a **`websocket_path`** for streaming
transcription — a WebSocket that exists in the response but **has no entry in
`paths`**. `POST /speech/transcribe` takes `multipart/form-data` with an `audio`
field ("Mono 16-bit WAV, or raw PCM") and per-request `language_code` /
`identify_multiple_languages` overrides passed as **query** params.

**An untagged upload endpoint.** `POST /uploads` is the *only* operation with no
`tags` array, so it is invisible in any tag-grouped docs UI. It takes
`multipart/form-data` with a `file` field and returns `{ url }` — **200, not
201** — with no declared size or MIME restriction.

**`PrescriptionStatus` has a `voided` value with no way to reach it.** There is
no `POST /prescriptions/{id}/void`, no PATCH, no DELETE. Prescriptions are
append-only over HTTP. Relatedly, `PrescriptionResponse.version` exists (an
integer) but nothing in the API produces a second version.

**`AuditAction` includes `void` and `print`** — actions with no corresponding
mutation endpoint (`print` is a GET; `void` has none at all).

**Two print routes, different content types.**
`GET /prescriptions/{id}/print` → JSON `{prescription_id, html}`.
`GET /prescriptions/{id}/print/view` → raw **`text/html`**. The second is the
only non-JSON success response in the API; don't send it through a JSON parser.

**Fields present in a response schema but not in its `required` list** — these
are genuinely optional and will be `undefined`, not `null`:

| Schema | Non-required fields | Server default |
|---|---|---|
| `PatientSearchResult` | `last_visit_date`, `prescription_count` | — / `0` |
| `PrescriptionResponse` | `patient_name` | `""` |
| `PrescriptionDetailResponse` | `patient_name`, `patient`, `doctor_full_name`, `doctor_qualifications` | `""` / — / `""` / — |
| `SpeechConfigResponse` | `channels`, `bits_per_sample` | `1` / `16` |
| `LoginResponse` | `message` | `"Login successful."` |
| `HTTPValidationError` | `detail` | — |

**Three response bodies are entirely untyped** (`object, additionalProperties: true`):
`GET /patients/{id}/summary`, `GET /public/portfolio`, `GET /public/pages/{slug}`.
Inside `DashboardSummaryResponse`, `recent_appointments` and
`recent_prescriptions` are `object[]` with no item shape. **(live)**
`/public/portfolio` returns `{pages, services, gallery, testimonials}`.

**`GET /public/csrf` does not return `CsrfResponse`.** It returns an untyped
`{[k: string]: string}` map, unlike `GET /auth/csrf` which returns the proper
`CsrfResponse` schema. Same for `POST /auth/logout` and
`POST /auth/change-password` — both return bare string maps, not `MessageResponse`.

**The public read endpoints return the *full* admin objects.**
`GET /public/clinic` → `ClinicSettingsResponse` and `GET /public/doctor` →
`DoctorProfileResponse`, i.e. the identical schemas served to authenticated
staff, with no field stripping. Anything you put in `registration_number` or
`footer_text` is world-readable.

**Immutable-after-create fields**, inferable only by diffing create vs. update
schemas: `PortfolioPage.slug`, `WeeklyAvailability.day_of_week`,
`User.username`, `ClinicSettings.updated_at`.

**UUID formatting is inconsistent.** Most ID fields carry `format: uuid`, but
`PrescriptionCreateRequest.patient_id`, `.appointment_id`,
`PrescriptionItemCreate.medicine_id`, `AppointmentCreateRequest.patient_id` and
`PrescriptionPrintResponse.prescription_id` are declared as bare `string`. They
are UUIDs in practice; the schema just doesn't say so.

**Time format. (live)** `format: time` values come back as `HH:MM:SS`
(`"16:30:00"`), not `HH:MM`. Compare and display accordingly.
