/**
 * OrthoClinic API — route table and query-parameter types.
 *
 * Derived mechanically from the live OpenAPI 3.1 document; all 54 paths / 76
 * operations are represented.
 *
 * ## Base URL
 * Every leaf below is relative to the `/api/v1` prefix — prepend it (or point
 * your client's `baseURL` at it). `/openapi.json` and `/docs` sit outside it.
 *
 * ## Auth
 * Server-side sessions via an HttpOnly cookie. Send `credentials: 'include'` on
 * every request. There is NO `securitySchemes` block in the document and no
 * per-operation `security` — the schema encodes no auth metadata at all, so
 * which routes need a session was determined by probing the live server.
 * Confirmed: everything except `system.health` and the `public.*` group returns
 * `401 {"error":{"code":"unauthorized",...}}` when unauthenticated — including
 * `GET /speech/config`, and including reads of nonexistent resources (a
 * `GET /patients/{unknown-id}` answers 401, not 404, when signed out).
 *
 * ## CSRF
 * Marked `[WRITE]` below. Every non-GET request must carry the double-submit
 * token in the `X-CSRF-Token` header:
 *   - authenticated app: fetch it from `auth.csrf` (`GET /auth/csrf`)
 *   - public website: fetch it from `public.csrf` (`GET /public/csrf`) before the
 *     first POST, so the browser stores the cookie, then echo the value
 * Skipping it yields `403 {"error":{"code":"csrf_failed",...}}` (verified live).
 *
 * ## Roles
 * The schema states NO role requirements anywhere: no `security` block, and not
 * one operation `description` mentions admin/doctor/staff. `UserRole`
 * (`admin | doctor | staff`) exists as a data field only. Any role gate you
 * apply in the UI is a guess — the notes below flag the routes that are
 * plausibly privileged, but they are marked as unverified for that reason.
 */

import type {
  AppointmentStatus,
  DateString,
  SortOrder,
  UUID,
} from './schema';

/* -------------------------------------------------------------------------- */
/* Base                                                                       */
/* -------------------------------------------------------------------------- */

/** The versioned API prefix. Paths in `endpoints` do NOT include it. */
export const API_BASE = '/api/v1';

/** Header name for the double-submit CSRF token required on every write. */
export const CSRF_HEADER = 'X-CSRF-Token';

/* -------------------------------------------------------------------------- */
/* Query parameter types                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The four pagination/sort params, as declared on the endpoints that have them.
 * Do NOT spread this onto every list endpoint — several lists accept no query
 * params at all (see `NO_QUERY_PARAM_LISTS`).
 *
 * - `page`: integer >= 1, default 1
 * - `page_size`: integer 1..200, default 20
 * - `sort_by`: nullable string, NO default and NO enum of allowed columns
 * - `sort_order`: string matching `^(asc|desc)$`, default `"desc"`
 */
export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort_by?: string | null;
  sort_order?: SortOrder;
}

/** `GET /patients` — pagination only, no `q`/`is_active`/`city` filter. */
export type ListPatientsParams = PaginationParams;

/** `GET /medicines` — pagination only, no `is_active`/`category`/`dosage_form` filter. */
export type ListMedicinesParams = PaginationParams;

/** `GET /users` — pagination only, no `role`/`is_active` filter. */
export type ListUsersParams = PaginationParams;

/**
 * The shared shape of `GET /patients/search` and `GET /medicines/search`.
 * Neither takes pagination — they take `limit` and return a bare array.
 *
 * - `q`: REQUIRED, 1..100 chars ("Name or phone" / "Medicine name prefix")
 * - `limit`: integer 1..100, default 20
 */
export interface SearchParams {
  q: string;
  limit?: number;
}

/** `GET /patients/search` — `q` is required (1..100 chars, matches name or phone). */
export type SearchPatientsParams = SearchParams;

/** `GET /medicines/search` — `q` is required (1..100 chars, medicine name prefix). */
export type SearchMedicinesParams = SearchParams;

/**
 * `GET /appointments` — the only list with real filters, and it takes all four
 * pagination params too.
 */
export interface ListAppointmentsParams extends PaginationParams {
  status?: AppointmentStatus | null;
  from_date?: DateString | null;
  to_date?: DateString | null;
  patient_id?: UUID | null;
}

/** `GET /prescriptions` — one filter plus all four pagination params. */
export interface ListPrescriptionsParams extends PaginationParams {
  patient_id?: UUID | null;
}

/** `GET /audit-logs` — two filters plus all four pagination params. There is no `action` or date-range filter. */
export interface ListAuditLogsParams extends PaginationParams {
  user_id?: UUID | null;
  /** max 64 chars. Free-form entity name; the schema enumerates no values. */
  entity_type?: string | null;
}

/** `GET /appointments/slots` — `date` is REQUIRED. */
export interface AvailableSlotsParams {
  date: DateString;
}

/** `GET /public/slots` — `date` is REQUIRED. Same shape as the staff variant, minus the param description. */
export type PublicSlotsParams = AvailableSlotsParams;

/** `POST /speech/transcribe` — optional per-request overrides, sent as QUERY params (the audio itself is the multipart body). */
export interface TranscribeParams {
  /** Override the configured language for this request, e.g. `"en-IN"`. */
  language_code?: string | null;
  /** Detect among the configured language options instead of pinning one. */
  identify_multiple_languages?: boolean | null;
}

/**
 * Every list-style GET that accepts NO query parameters whatsoever. Sending
 * `?page=1` to these is silently ignored, and they return a bare array (or a
 * single object), never a `Paginated<T>` envelope.
 */
export const NO_QUERY_PARAM_LISTS = [
  '/patients/{patient_id}/prescriptions',
  '/appointments/availability',
  '/portfolio/pages',
  '/portfolio/services',
  '/portfolio/gallery',
  '/portfolio/testimonials',
  '/clinic/templates',
  '/public/portfolio',
  '/public/availability',
] as const;

/* -------------------------------------------------------------------------- */
/* Route table                                                                */
/* -------------------------------------------------------------------------- */

export const endpoints = {
  /** Tag `authentication`. Session cookie + CSRF plumbing. */
  auth: {
    /** POST — log in. Body `LoginRequest` -> `LoginResponse`. Unauthenticated. [WRITE: needs CSRF] */
    login: '/auth/login',
    /** POST — log out. No body -> `Record<string, string>`. [WRITE: needs CSRF] */
    logout: '/auth/logout',
    /** GET — current user -> `UserResponse`. Any signed-in role. */
    me: '/auth/me',
    /** GET — CSRF token for the current session -> `CsrfResponse` (also set as a cookie). */
    csrf: '/auth/csrf',
    /** POST — change own password. Body `ChangePasswordRequest` -> `Record<string, string>`. Any signed-in role. [WRITE: needs CSRF] */
    changePassword: '/auth/change-password',
  },

  /** Tag `dashboard`. */
  dashboard: {
    /** GET — no query params -> `DashboardSummaryResponse`. */
    summary: '/dashboard/summary',
  },

  /** Tag `patients`. Note: no DELETE route exists — soft-delete via `PATCH` with `is_active: false`. */
  patients: {
    /** GET (`ListPatientsParams`) -> `Paginated<PatientResponse>` · POST (`PatientCreateRequest`) -> 201 `PatientResponse` [WRITE: needs CSRF] */
    list: '/patients',
    /** POST — same path as `list`; 201 `PatientResponse`. [WRITE: needs CSRF] */
    create: '/patients',
    /** GET (`SearchPatientsParams`, `q` required) -> `PatientSearchResult[]` — a bare array, NOT paginated. */
    search: '/patients/search',
    /** GET -> `PatientResponse` · PATCH (`PatientUpdateRequest`) -> `PatientResponse` [WRITE: needs CSRF] */
    byId: (id: UUID) => `/patients/${id}`,
    /** GET — no query params -> `PrescriptionResponse[]`, a bare array with no pagination. */
    prescriptions: (id: UUID) => `/patients/${id}/prescriptions`,
    /** GET -> untyped `object` (`PatientSummaryCard`): "details, prescriptions and appointment history". */
    summary: (id: UUID) => `/patients/${id}/summary`,
  },

  /** Tag `medicines`. No DELETE route — use `deactivate` / `reactivate`. */
  medicines: {
    /** GET (`ListMedicinesParams`) -> `Paginated<MedicineResponse>` · POST (`MedicineCreateRequest`) -> 201 `MedicineResponse` [WRITE: needs CSRF] */
    list: '/medicines',
    /** POST — same path as `list`; 201 `MedicineResponse`. [WRITE: needs CSRF] */
    create: '/medicines',
    /** GET (`SearchMedicinesParams`, `q` required) -> `MedicineResponse[]` — type-ahead, bare array. */
    search: '/medicines/search',
    /** GET -> `MedicineResponse` · PATCH (`MedicineUpdateRequest`) -> `MedicineResponse` [WRITE: needs CSRF] */
    byId: (id: UUID) => `/medicines/${id}`,
    /** POST — soft delete, empty body -> `MedicineResponse`. [WRITE: needs CSRF] */
    deactivate: (id: UUID) => `/medicines/${id}/deactivate`,
    /** POST — empty body -> `MedicineResponse`. [WRITE: needs CSRF] */
    reactivate: (id: UUID) => `/medicines/${id}/reactivate`,
  },

  /** Tag `prescriptions`. Create-and-read only: no PATCH, no DELETE, no void endpoint despite `PrescriptionStatus` having a `"voided"` value. */
  prescriptions: {
    /** GET (`ListPrescriptionsParams`) -> `Paginated<PrescriptionResponse>` · POST (`PrescriptionCreateRequest`) -> 201 `PrescriptionDetailResponse` [WRITE: needs CSRF] */
    list: '/prescriptions',
    /** POST — same path as `list`. Auto-creates the patient/visit and completes any linked appointment. [WRITE: needs CSRF] */
    create: '/prescriptions',
    /** GET -> `PrescriptionDetailResponse`. */
    byId: (id: UUID) => `/prescriptions/${id}`,
    /** GET -> `PrescriptionPrintResponse` — self-contained A4 HTML as a JSON string field. */
    print: (id: UUID) => `/prescriptions/${id}/print`,
    /** GET -> `text/html` (NOT JSON) — open directly in a tab for the browser print dialog. */
    printView: (id: UUID) => `/prescriptions/${id}/print/view`,
  },

  /** Tag `appointments`. */
  appointments: {
    /** GET (`ListAppointmentsParams`) -> `Paginated<AppointmentDetailResponse>` · POST (`AppointmentCreateRequest`) -> 201 `AppointmentDetailResponse` [WRITE: needs CSRF] */
    list: '/appointments',
    /** POST — same path as `list`; 201 `AppointmentDetailResponse`. [WRITE: needs CSRF] */
    create: '/appointments',
    /** GET -> `AppointmentDetailResponse` · PATCH (`AppointmentUpdateRequest`, reschedule/notes only) -> `AppointmentDetailResponse` [WRITE: needs CSRF] */
    byId: (id: UUID) => `/appointments/${id}`,
    /** PATCH (`AppointmentStatusUpdateRequest`) -> `AppointmentDetailResponse`. Separate from `byId` — status cannot be changed through the general update. [WRITE: needs CSRF] */
    status: (id: UUID) => `/appointments/${id}/status`,
    /** GET — no query params -> `WeeklyAvailabilityResponse[]` · POST (`WeeklyAvailabilityCreate`) -> 201 `WeeklyAvailabilityResponse` [WRITE: needs CSRF] */
    availability: '/appointments/availability',
    /** PATCH (`WeeklyAvailabilityUpdate`; `day_of_week` is immutable) -> `WeeklyAvailabilityResponse` · DELETE -> `MessageResponse` [WRITE: needs CSRF] */
    availabilityById: (id: UUID) => `/appointments/availability/${id}`,
    /** GET (`AvailableSlotsParams`, `date` REQUIRED) -> `AvailableSlotResponse[]`. */
    slots: '/appointments/slots',
  },

  /** Tag `clinic-settings`. Plausibly admin-only, but the schema states no role. */
  clinic: {
    /** GET -> `ClinicSettingsResponse` · PATCH (`ClinicSettingsUpdate`) -> `ClinicSettingsResponse` [WRITE: needs CSRF] */
    settings: '/clinic/settings',
    /** GET -> `DoctorProfileResponse` · PATCH (`DoctorProfileUpdate`) -> `DoctorProfileResponse` [WRITE: needs CSRF] */
    doctorProfile: '/clinic/doctor-profile',
    /** GET — no query params -> `PrescriptionTemplateResponse[]` · POST (`PrescriptionTemplateCreate`) -> 201 `PrescriptionTemplateResponse` [WRITE: needs CSRF] */
    templates: '/clinic/templates',
    /** GET -> `PrescriptionTemplateResponse` · PATCH (`PrescriptionTemplateUpdate`) -> `PrescriptionTemplateResponse`. No DELETE — deactivate via `is_active: false`. [WRITE: needs CSRF] */
    templateById: (id: UUID) => `/clinic/templates/${id}`,
  },

  /** Tag `users`. Plausibly admin-only, but the schema states no role. */
  users: {
    /** GET (`ListUsersParams`) -> `Paginated<UserResponse>` · POST (`UserCreateRequest`) -> 201 `UserResponse` [WRITE: needs CSRF] */
    list: '/users',
    /** POST — same path as `list`; 201 `UserResponse`. [WRITE: needs CSRF] */
    create: '/users',
    /** GET -> `UserResponse` · PATCH (`UserUpdateRequest`; no `username`, no `password`) -> `UserResponse`. No DELETE — deactivate via `is_active: false`. [WRITE: needs CSRF] */
    byId: (id: UUID) => `/users/${id}`,
    /** POST (`UserPasswordResetRequest`) -> `MessageResponse`. [WRITE: needs CSRF] */
    resetPassword: (id: UUID) => `/users/${id}/reset-password`,
  },

  /** Tag `audit-logs`. Read-only; plausibly admin-only, but the schema states no role. */
  auditLogs: {
    /** GET (`ListAuditLogsParams`) -> `Paginated<AuditLogResponse>`. The only route under this tag. */
    list: '/audit-logs',
  },

  /** Tag `portfolio-cms`. The only group with real DELETE routes (services, gallery, testimonials — but NOT pages). */
  portfolio: {
    /** GET — no query params -> `PortfolioPageResponse[]` · POST (`PortfolioPageCreate`) -> 201 `PortfolioPageResponse` [WRITE: needs CSRF] */
    pages: '/portfolio/pages',
    /** PATCH (`PortfolioPageUpdate`; `slug` is immutable) -> `PortfolioPageResponse`. No DELETE for pages — unpublish via `is_published: false`. [WRITE: needs CSRF] */
    pageById: (id: UUID) => `/portfolio/pages/${id}`,
    /** GET — no query params -> `ServiceResponse[]` · POST (`ServiceCreate`) -> 201 `ServiceResponse` [WRITE: needs CSRF] */
    services: '/portfolio/services',
    /** PATCH (`ServiceUpdate`) -> `ServiceResponse` · DELETE -> `MessageResponse` (hard delete) [WRITE: needs CSRF] */
    serviceById: (id: UUID) => `/portfolio/services/${id}`,
    /** GET — no query params -> `GalleryImageResponse[]` · POST (`GalleryImageCreate`) -> 201 `GalleryImageResponse` [WRITE: needs CSRF] */
    gallery: '/portfolio/gallery',
    /** PATCH (`GalleryImageUpdate`) -> `GalleryImageResponse` · DELETE -> `MessageResponse` (hard delete) [WRITE: needs CSRF] */
    galleryById: (id: UUID) => `/portfolio/gallery/${id}`,
    /** GET — no query params -> `TestimonialResponse[]` · POST (`TestimonialCreate`) -> 201 `TestimonialResponse` [WRITE: needs CSRF] */
    testimonials: '/portfolio/testimonials',
    /** PATCH (`TestimonialUpdate`) -> `TestimonialResponse` · DELETE -> `MessageResponse` (hard delete) [WRITE: needs CSRF] */
    testimonialById: (id: UUID) => `/portfolio/testimonials/${id}`,
  },

  /** No tag in the schema — a bare operation. */
  uploads: {
    /** POST `multipart/form-data` (`UploadFileBody`, field name `file`) -> 200 (not 201) `UploadResponse`. [WRITE: needs CSRF] */
    upload: '/uploads',
  },

  /** Tag `speech`. Requires a session — `GET /speech/config` returns 401 when signed out. */
  speech: {
    /** GET -> `SpeechConfigResponse`. Read `websocket_path` from the response for streaming; it is not a REST path in the document. */
    config: '/speech/config',
    /** POST `multipart/form-data` (`TranscribeFileBody`, field name `audio`) + `TranscribeParams` as QUERY params -> `TranscriptionResponse`. [WRITE: needs CSRF] */
    transcribe: '/speech/transcribe',
    /**
     * POST `TranslationRequest` -> `TranslationResponse`. [WRITE: needs CSRF]
     *
     * Separate from transcription because ASR returns one transcript in one
     * language; an English *and* a Bengali version means recognising once and
     * translating that result. Returns 502 `upstream_error` when the server has
     * no translation provider or the vendor refuses.
     */
    translate: '/speech/translate',
    /**
     * POST `ExtractionRequest` -> `ExtractionResponse`. [WRITE: needs CSRF]
     *
     * Reads a prescription draft out of a dictated transcript. Returns 502
     * `upstream_error` when no model is configured or the provider refuses —
     * on which the caller falls back to the local parser rather than failing.
     */
    extract: '/speech/extract',
  },

  /** Tag `public-website`. Unauthenticated. `csrf` must be fetched before the booking POST. */
  public: {
    /** GET -> `PublicPortfolioResponse` — `{ pages, services, gallery, testimonials }`, untyped in the schema. */
    portfolio: '/public/portfolio',
    /** GET -> untyped `object` (`PublicPageResponse`). `slug` is a plain string path param, not a UUID. */
    pageBySlug: (slug: string) => `/public/pages/${slug}`,
    /** GET -> `ClinicSettingsResponse` — the same full object as the authenticated route, no field stripping. */
    clinic: '/public/clinic',
    /** GET -> `DoctorProfileResponse` — the same full object as the authenticated route. */
    doctor: '/public/doctor',
    /** GET — no query params -> `WeeklyAvailabilityResponse[]`. */
    availability: '/public/availability',
    /** GET (`PublicSlotsParams`, `date` REQUIRED) -> `AvailableSlotResponse[]`. */
    slots: '/public/slots',
    /** POST (`AppointmentCreateByPatientRequest`) -> 201 `AppointmentDetailResponse`. [WRITE: needs CSRF from `public.csrf`] */
    appointments: '/public/appointments',
    /** GET -> `Record<string, string>` (NOT `CsrfResponse`) and sets the double-submit cookie. Call before the first public POST. */
    csrf: '/public/csrf',
  },

  /** Tag `system`. Unauthenticated. */
  system: {
    /** GET -> `HealthResponse`. */
    health: '/health',
  },
} as const;

/** Standalone alias for the `public-website` group, for destructuring where `public` is awkward as a binding name. */
export const publicEndpoints = endpoints.public;

export default endpoints;
