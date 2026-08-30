/**
 * OrthoClinic API — TypeScript mirror of `components.schemas` from the live
 * OpenAPI 3.1 document (`GET /openapi.json`, title "OrthoClinic", version 1.0.0).
 *
 * Hand-written but exhaustive: every one of the 76 component schemas has a
 * counterpart here, with `required` / nullability transcribed exactly.
 *
 * Conventions used throughout:
 *   - a property absent from the schema's `required` array gets `?`
 *   - a property whose schema is `anyOf [X, null]` gets `| null`
 *   - the two are independent: `foo?: string | null` means "may be omitted AND
 *     may be explicitly null"; `foo: string | null` means "always present,
 *     sometimes null"; `foo?: string` means "may be omitted, never null"
 *
 * Route wiring lives in `./endpoints`.
 */

/* -------------------------------------------------------------------------- */
/* Scalar format aliases                                                      */
/* -------------------------------------------------------------------------- */

/** `format: uuid` — canonical 36-char hyphenated UUID, e.g. `"8f14e45f-ceea-4d4b-9a1e-9f1c2d3e4f50"`. */
export type UUID = string;

/** `format: date` — calendar date, `YYYY-MM-DD`, e.g. `"2026-08-10"`. */
export type DateString = string;

/** `format: date-time` — RFC 3339 timestamp, e.g. `"2026-08-08T12:01:33.412Z"`. */
export type DateTimeString = string;

/** `format: time` — wall-clock time of day; the server emits `HH:MM:SS`, e.g. `"16:30:00"`, and accepts `HH:MM`. */
export type TimeString = string;

/** `format: email` — RFC 5322 address. Validated server-side; still just a string on the wire. */
export type EmailString = string;

/** A free-form JSON object (`type: object, additionalProperties: true`). The schema declares no inner shape. */
export type JsonObject = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Enumerations (string-literal unions + iterable const arrays)               */
/* -------------------------------------------------------------------------- */

/** `AppointmentStatus` — used by `AppointmentDetailResponse.status`, `AppointmentStatusUpdateRequest.status`, and the `status` query param of `GET /appointments`. */
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** All six `AppointmentStatus` values, in schema order. */
export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const satisfies readonly AppointmentStatus[];

/** `AuditAction` — used by `AuditLogResponse.action` (`GET /audit-logs`). */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'view'
  | 'void'
  | 'print'
  | 'status_change';

/** All nine `AuditAction` values, in schema order. */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'view',
  'void',
  'print',
  'status_change',
] as const satisfies readonly AuditAction[];

/** `DayOfWeek` — used by `WeeklyAvailabilityCreate/Response.day_of_week`. */
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** All seven `DayOfWeek` values, in schema order (Monday-first). */
export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const satisfies readonly DayOfWeek[];

/** `Gender` — used by `PatientCreateRequest`, `PatientUpdateRequest`, `PatientResponse`, `PatientSearchResult`. NOT used by `PatientUpsert` (see its note). */
export type Gender = 'male' | 'female' | 'other';

/** All three `Gender` values, in schema order. */
export const GENDERS = ['male', 'female', 'other'] as const satisfies readonly Gender[];

/** `MedicineDosageForm` — used by `MedicineCreateRequest` (default `"tablet"`), `MedicineUpdateRequest`, `MedicineResponse`. */
export type MedicineDosageForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'ointment'
  | 'cream'
  | 'gel'
  | 'drops'
  | 'inhaler'
  | 'powder'
  | 'other';

/** All eleven `MedicineDosageForm` values, in schema order. */
export const MEDICINE_DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'ointment',
  'cream',
  'gel',
  'drops',
  'inhaler',
  'powder',
  'other',
] as const satisfies readonly MedicineDosageForm[];

/** `PrescriptionStatus` — used by `PrescriptionResponse.status` / `PrescriptionDetailResponse.status`. */
export type PrescriptionStatus = 'active' | 'voided';

/** Both `PrescriptionStatus` values, in schema order. */
export const PRESCRIPTION_STATUSES = [
  'active',
  'voided',
] as const satisfies readonly PrescriptionStatus[];

/**
 * NOT an enum in the schema. `blood_group` is declared as a plain
 * `string` with `maxLength: 8` on `PatientCreateRequest` / `PatientUpdateRequest`
 * and as an unconstrained nullable string on `PatientResponse`.
 * This list is a **client-side convenience** for populating a `<select>`;
 * the server will accept any string of 8 characters or fewer.
 */
export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const satisfies readonly string[];

/** A conventional blood group, but any string of length <= 8 is accepted by the API. */
export type BloodGroup = (typeof BLOOD_GROUPS)[number] | (string & {});

/**
 * `AvailableSlotResponse.status` is declared as a bare `string` — the schema
 * enumerates nothing. `"available"` is what the live server returns for free
 * slots; `"booked"` is included as the observed complement. Unknown values
 * still typecheck.
 */
export type SlotStatus = 'available' | 'booked' | (string & {});

/** Sort direction accepted by every paginated list endpoint. Derived from the query param's `pattern: "^(asc|desc)$"`; default is `"desc"`. */
export type SortOrder = 'asc' | 'desc';

/** Both `SortOrder` values. */
export const SORT_ORDERS = ['asc', 'desc'] as const satisfies readonly SortOrder[];

/* -------------------------------------------------------------------------- */
/* Pagination envelope                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The generic `Page[T]` envelope. Verified against every
 * `Page_*_` component schema (`Page[PatientResponse]`, `Page[MedicineResponse]`,
 * `Page[PrescriptionResponse]`, `Page[AppointmentDetailResponse]`,
 * `Page[AuditLogResponse]`, `Page[UserResponse]`) — all six are identical and all
 * five fields are `required`. There is no `has_next` / `next_cursor` / `links`.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** `Page[PatientResponse]` — `GET /patients`. */
export type Page_PatientResponse_ = Paginated<PatientResponse>;
/** `Page[MedicineResponse]` — `GET /medicines`. */
export type Page_MedicineResponse_ = Paginated<MedicineResponse>;
/** `Page[PrescriptionResponse]` — `GET /prescriptions`. */
export type Page_PrescriptionResponse_ = Paginated<PrescriptionResponse>;
/** `Page[AppointmentDetailResponse]` — `GET /appointments`. */
export type Page_AppointmentDetailResponse_ = Paginated<AppointmentDetailResponse>;
/** `Page[AuditLogResponse]` — `GET /audit-logs`. */
export type Page_AuditLogResponse_ = Paginated<AuditLogResponse>;
/** `Page[UserResponse]` — `GET /users`. */
export type Page_UserResponse_ = Paginated<UserResponse>;

/* -------------------------------------------------------------------------- */
/* Error envelope                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Error codes the API emits in `ApiErrorBody.error.code`.
 * `(string & {})` keeps unknown/future codes assignable while preserving
 * autocomplete for the known ones.
 */
export type ApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'csrf_failed'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'bad_request'
  | 'upstream_error'
  | (string & {});

/** One field-level problem inside a `validation_error`. `location` is a dotted path such as `"body.username"` or `"query.q"`. */
export interface ApiErrorDetail {
  location: string;
  message: string;
}

/**
 * The uniform error body returned for EVERY non-2xx response.
 *
 * Note: the OpenAPI document advertises `HTTPValidationError` for 422s (FastAPI's
 * default), but the running server wraps all errors — 401/403/404/409/422/429 —
 * in this envelope. Confirmed live:
 * `{"error":{"code":"validation_error","message":"The provided data failed validation.",
 *   "details":[{"location":"body.username","message":"Field required"}]}}`
 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}

/** `ValidationError` — the documented (but not actually emitted) FastAPI 422 item. Kept for completeness. */
export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

/** `HTTPValidationError` — the documented 422 body for every operation. Superseded at runtime by `ApiErrorBody`. */
export interface HTTPValidationError {
  detail?: ValidationError[];
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

/** `LoginRequest` — body of `POST /auth/login`. */
export interface LoginRequest {
  /** 1..64 chars. */
  username: string;
  /** 1..128 chars. */
  password: string;
}

/** `LoginResponse` — 200 body of `POST /auth/login`. Session cookie is set alongside. */
export interface LoginResponse {
  /**
   * A bare `UserResponse`: the login body deliberately carries NO `permissions`
   * and NO `is_superadmin`. Fetch `GET /auth/me` for {@link CurrentUserResponse}
   * before gating anything on them.
   */
  user: UserResponse;
  /** Defaults to `"Login successful."` server-side; may be absent from the payload. */
  message?: string;
}

/** `ChangePasswordRequest` — body of `POST /auth/change-password` (any signed-in user, own password). */
export interface ChangePasswordRequest {
  /** 1..128 chars. */
  current_password: string;
  /** 8..128 chars. */
  new_password: string;
}

/** `CsrfResponse` — 200 body of `GET /auth/csrf`. The same token is also set as a cookie; echo it in `X-CSRF-Token`. */
export interface CsrfResponse {
  csrf_token: string;
}

/** `MessageResponse` — uniform body for simple success messages; returned by every DELETE and by `POST /users/{user_id}/reset-password`. */
export interface MessageResponse {
  message: string;
}

/**
 * Inline (not a component schema): the `{ [k: string]: string }` body returned by
 * `POST /auth/logout`, `POST /auth/change-password` and `GET /public/csrf`.
 * `GET /public/csrf` in practice carries a `csrf_token` key.
 */
export type StringMapResponse = Record<string, string>;

/**
 * `HealthResponse` — 200 body of `GET /health` (503 when `degraded`).
 * Unauthenticated, and now nothing but the verdict: `app`, `version`,
 * `environment` and `database` moved to `GET /system/status`, which is
 * superadmin-only, so a load balancer probe cannot fingerprint the deployment.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
}

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The role as embedded in a user record (`UserResponse.role`).
 *
 * `level` and `permissions` are independent and neither implies the other:
 * `level` ranks roles for management authority only (an actor may act on an
 * account strictly below their own level), while permissions decide what the
 * holder may do. Gate the UI on permissions, never on `key` or `level`.
 */
export interface RoleSummary {
  id: UUID;
  /** Stable machine name, e.g. `doctor`, `reception`. Immutable once created. */
  key: string;
  /** Display label. A clinic may rename its roles, so there is no client-side label map. */
  name: string;
  /** 1..100. 100 is the vendor's superadmin and is never assignable. */
  level: number;
}

/** `RoleResponse` — `GET /roles`, `GET /roles/assignable`, `GET /roles/{role_id}`, `POST /roles`, `PATCH /roles/{role_id}`. */
export interface RoleResponse {
  id: UUID;
  key: string;
  name: string;
  description: string | null;
  level: number;
  /** Empty for `superadmin`, which bypasses the check rather than enumerating it. */
  permissions: string[];
  /** A seeded role. Its permissions are still editable — tightening `staff` is the normal way a clinic tunes the front desk — but its level, activation and existence are not. */
  is_system: boolean;
  is_active: boolean;
  created_at: DateTimeString;
}

/** `RoleCreateRequest` — body of `POST /roles`. */
export interface RoleCreateRequest {
  /** `^[a-z][a-z0-9_]{1,31}$`, immutable afterwards. A duplicate is a 409 on the key field. */
  key: string;
  name: string;
  description?: string | null;
  /** 1..99 — 100 is reserved for the superadmin and answers 422. */
  level: number;
  /** Reserved keys (`role.manage`, `system.monitor`) are refused with 422; render them disabled rather than hidden. */
  permissions?: string[];
}

/** `RoleUpdateRequest` — body of `PATCH /roles/{role_id}`. No `key`: it is immutable. */
export interface RoleUpdateRequest {
  name?: string | null;
  description?: string | null;
  /** 409 when the role is `is_system`. */
  level?: number | null;
  permissions?: string[] | null;
  /** 409 when the role is `is_system`. */
  is_active?: boolean | null;
}

/** One grantable capability, as listed by `GET /roles/permissions`. */
export interface PermissionInfo {
  key: string;
  /** The server's own wording for the checkbox, e.g. `"Edit the medicine catalogue"`. */
  label: string;
  /** Superadmin-only and ungrantable. Show it disabled: a superadmin who cannot see why a box is missing will file a bug. */
  reserved: boolean;
}

/**
 * `PermissionGroup` — `GET /roles/permissions`, the catalogue grouped for the
 * role editor. Build the editor from this response, not from a hardcoded list,
 * so a new backend capability appears without a frontend release.
 */
export interface PermissionGroup {
  group: string;
  permissions: PermissionInfo[];
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

/** `UserResponse` — `GET /users/{user_id}`, items of `GET /users`, `POST /users`, `PATCH /users/{user_id}`, and `LoginResponse.user`. `GET /auth/me` returns the wider {@link CurrentUserResponse}. */
export interface UserResponse {
  id: UUID;
  username: string;
  email: EmailString;
  full_name: string;
  /** An object since roles became rows. Display `role.name`; decide anything on permissions. */
  role: RoleSummary;
  is_active: boolean;
  last_login_at: DateTimeString | null;
  created_at: DateTimeString;
}

/**
 * `CurrentUserResponse` — 200 body of `GET /auth/me`, and the only shape that
 * answers "may this user do X". Re-fetch it after any change to the signed-in
 * user's own role: there is no push channel, so a revoked permission is
 * otherwise discovered on the next 403.
 */
export interface CurrentUserResponse extends UserResponse {
  /** Flat permission keys the role grants. Empty for a superadmin, which bypasses the check entirely — test `is_superadmin` first. */
  permissions: string[];
  is_superadmin: boolean;
}

/** `UserCreateRequest` — body of `POST /users`. */
export interface UserCreateRequest {
  /** 3..64 chars, must match `^[a-zA-Z0-9_.-]+$`. */
  username: string;
  /** `format: email`. */
  email: EmailString;
  /** 1..128 chars. */
  full_name: string;
  /** 8..128 chars. */
  password: string;
  /** From `GET /roles/assignable`. Required, and deliberately without a default: the old `"staff"` fallback decided authority on the caller's behalf. Omitting it is a 422. */
  role_id: UUID;
}

/** `UserUpdateRequest` — body of `PATCH /users/{user_id}`. Every field optional; note there is no `username` and no `password` here. */
export interface UserUpdateRequest {
  email?: EmailString | null;
  /** 1..128 chars. */
  full_name?: string | null;
  /** Reassignment is refused with 403 when the target is not strictly below the actor's level, and when the target is the actor themselves. */
  role_id?: UUID | null;
  is_active?: boolean | null;
}

/** `UserPasswordResetRequest` — body of `POST /users/{user_id}/reset-password`. */
export interface UserPasswordResetRequest {
  /** 8..128 chars. */
  new_password: string;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

/** `DashboardSummaryResponse` — 200 body of `GET /dashboard/summary`. */
export interface DashboardSummaryResponse {
  total_patients: number;
  total_medicines: number;
  appointments_today: number;
  appointments_upcoming: number;
  prescriptions_today: number;
  /** Untyped in the schema: `array of object(additionalProperties: true)`. Narrow at the call site. */
  recent_appointments: JsonObject[];
  /** Untyped in the schema: `array of object(additionalProperties: true)`. Narrow at the call site. */
  recent_prescriptions: JsonObject[];
}

/** Convenience alias for `DashboardSummaryResponse`. */
export type DashboardSummary = DashboardSummaryResponse;

/* -------------------------------------------------------------------------- */
/* Patients                                                                   */
/* -------------------------------------------------------------------------- */

/** `PatientResponse` — `GET /patients/{patient_id}`, `POST /patients`, `PATCH /patients/{patient_id}`, items of `GET /patients`. */
export interface PatientResponse {
  id: UUID;
  first_name: string;
  last_name: string;
  date_of_birth: DateString | null;
  gender: Gender | null;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  blood_group: string | null;
  allergies: string[] | null;
  medical_history: JsonObject | null;
  emergency_contact: JsonObject | null;
  is_active: boolean;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

/** `PatientSearchResult` — items of `GET /patients/search`. `PatientResponse` plus two extras that are NOT in `required`. */
export interface PatientSearchResult extends PatientResponse {
  /** Not in `required`: may be absent entirely, or present and null. */
  last_visit_date?: DateString | null;
  /** Not in `required`; server default is `0`. Never null. */
  prescription_count?: number;
}

/** `PatientSummary` — the embedded patient stub on `AppointmentDetailResponse.patient` and `PrescriptionDetailResponse.patient`. */
export interface PatientSummary {
  id: UUID;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
}

/** `PatientCreateRequest` — body of `POST /patients`. Only `first_name`, `last_name`, `phone` are required. */
export interface PatientCreateRequest {
  /** 1..64 chars. */
  first_name: string;
  /** 1..64 chars. */
  last_name: string;
  /** 6..20 chars. */
  phone: string;
  date_of_birth?: DateString | null;
  gender?: Gender | null;
  /** `format: email`. */
  email?: EmailString | null;
  /** max 512 chars. */
  address?: string | null;
  /** max 128 chars. */
  city?: string | null;
  /** max 8 chars. Free-form string, not an enum — see `BLOOD_GROUPS`. */
  blood_group?: BloodGroup | null;
  /** Array of free-form strings; no size or length bounds declared. */
  allergies?: string[] | null;
  medical_history?: JsonObject | null;
  emergency_contact?: JsonObject | null;
}

/** Convenience alias for `PatientCreateRequest`. */
export type PatientCreate = PatientCreateRequest;

/** `PatientUpdateRequest` — body of `PATCH /patients/{patient_id}`. All fields optional and nullable; adds `is_active` (the only way to "delete" a patient). */
export interface PatientUpdateRequest {
  /** 1..64 chars. */
  first_name?: string | null;
  /** 1..64 chars. */
  last_name?: string | null;
  date_of_birth?: DateString | null;
  gender?: Gender | null;
  /** 6..20 chars. */
  phone?: string | null;
  /** `format: email`. */
  email?: EmailString | null;
  /** max 512 chars. */
  address?: string | null;
  /** max 128 chars. */
  city?: string | null;
  /** max 8 chars. */
  blood_group?: BloodGroup | null;
  allergies?: string[] | null;
  medical_history?: JsonObject | null;
  emergency_contact?: JsonObject | null;
  /** Set to `false` for a soft delete. There is no `DELETE /patients/{id}`. */
  is_active?: boolean | null;
}

/**
 * `PatientUpsert` — the inline patient payload nested in
 * `PrescriptionCreateRequest.patient`, used to create a patient on the fly.
 *
 * Careful: this is a *different* shape from `PatientCreateRequest`.
 * `gender` here is a free string (max 10) rather than the `Gender` enum, `email`
 * is a plain string (max 255) with no `format: email`, and the address / city /
 * blood group / allergies / medical history / emergency contact fields do not exist.
 */
export interface PatientUpsert {
  /** 1..64 chars. */
  first_name: string;
  /** 1..64 chars. */
  last_name: string;
  /** 6..20 chars. */
  phone: string;
  date_of_birth?: DateString | null;
  /** max 10 chars. Free string here — NOT the `Gender` enum. */
  gender?: string | null;
  /** max 255 chars. No email-format validation on this one. */
  email?: string | null;
}

/**
 * Inline (not a component schema): the 200 body of
 * `GET /patients/{patient_id}/summary`, declared only as
 * `object(additionalProperties: true)`. The endpoint description says it returns
 * "details, prescriptions and appointment history" — the schema does not model it.
 */
export type PatientSummaryCard = JsonObject;

/* -------------------------------------------------------------------------- */
/* Medicines                                                                  */
/* -------------------------------------------------------------------------- */

/** `MedicineResponse` — `GET /medicines/{medicine_id}`, items of `GET /medicines` and `GET /medicines/search`, and `PrescriptionItemResponse.medicine`. */
export interface MedicineResponse {
  id: UUID;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  dosage_form: MedicineDosageForm;
  strength: string | null;
  category: string | null;
  manufacturer: string | null;
  description: string | null;
  /**
   * Prescription defaults, set once on the medicine so the pad can pre-fill
   * the whole row. All nullable; absent on backends that predate them.
   */
  default_dosage?: string | null;
  default_frequency?: string | null;
  default_duration_days?: number | null;
  default_food_timing?: 'before' | 'after' | 'with' | null;
  default_instructions?: string | null;
  is_active: boolean;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

/** `MedicineCreateRequest` — body of `POST /medicines`. Only `name` is required. */
export interface MedicineCreateRequest {
  /** 1..128 chars. */
  name: string;
  /** max 128 chars. */
  generic_name?: string | null;
  /** max 128 chars. */
  brand_name?: string | null;
  /** Defaults to `"tablet"`. Not nullable on create. */
  dosage_form?: MedicineDosageForm;
  /** max 32 chars. */
  strength?: string | null;
  /** max 64 chars. */
  category?: string | null;
  /** max 128 chars. */
  manufacturer?: string | null;
  /** max 2000 chars. */
  description?: string | null;
  /** max 128 chars. Prescription default: dose per intake, e.g. `"1 tab"`. */
  default_dosage?: string | null;
  /** max 64 chars. Prescription default: e.g. `"1-0-1"` or `"SOS"`. */
  default_frequency?: string | null;
  /** Integer 1..365. Prescription default: course length in days. */
  default_duration_days?: number | null;
  /** Prescription default: when to take it relative to food. */
  default_food_timing?: 'before' | 'after' | 'with' | null;
  /** max 1000 chars. Prescription default: per-medicine instructions. */
  default_instructions?: string | null;
}

/** Convenience alias for `MedicineCreateRequest`. */
export type MedicineCreate = MedicineCreateRequest;

/** `MedicineUpdateRequest` — body of `PATCH /medicines/{medicine_id}`. */
export interface MedicineUpdateRequest {
  /** 1..128 chars. */
  name?: string | null;
  /** max 128 chars. */
  generic_name?: string | null;
  /** max 128 chars. */
  brand_name?: string | null;
  /** Nullable here, unlike on create. */
  dosage_form?: MedicineDosageForm | null;
  /** max 32 chars. */
  strength?: string | null;
  /** max 64 chars. */
  category?: string | null;
  /** max 128 chars. */
  manufacturer?: string | null;
  /** max 2000 chars. */
  description?: string | null;
  /** max 128 chars. `null` clears the stored default. */
  default_dosage?: string | null;
  /** max 64 chars. `null` clears the stored default. */
  default_frequency?: string | null;
  /** Integer 1..365. `null` clears the stored default. */
  default_duration_days?: number | null;
  /** `null` clears the stored default. */
  default_food_timing?: 'before' | 'after' | 'with' | null;
  /** max 1000 chars. `null` clears the stored default. */
  default_instructions?: string | null;
  /** Also togglable via the dedicated deactivate/reactivate endpoints. */
  is_active?: boolean | null;
}

/* -------------------------------------------------------------------------- */
/* Prescriptions                                                              */
/* -------------------------------------------------------------------------- */

/** `PrescriptionItemCreate` — one line of `PrescriptionCreateRequest.items`. */
export interface PrescriptionItemCreate {
  /** Declared as a plain `string` — no `format: uuid` — but a medicine UUID in practice. */
  medicine_id: UUID;
  /** REQUIRED. 1..128 chars. */
  dosage: string;
  /** REQUIRED. 1..64 chars. */
  frequency: string;
  /** Integer 1..3650. */
  duration_days?: number | null;
  /** Integer 1..10000. */
  quantity?: number | null;
  /** max 2000 chars. */
  instructions?: string | null;
}

/** `PrescriptionItemResponse` — items of `PrescriptionResponse.items` / `PrescriptionDetailResponse.items`. */
export interface PrescriptionItemResponse {
  id: UUID;
  dosage: string;
  frequency: string;
  duration_days: number | null;
  quantity: number | null;
  instructions: string | null;
  sort_order: number;
  medicine: MedicineResponse;
}

/**
 * `PrescriptionCreateRequest` — body of `POST /prescriptions`.
 *
 * `items` is the ONLY required field. Supply either `patient_id` (existing
 * patient) or `patient` (inline upsert); the request is rejected if neither is
 * given, but the schema cannot express that so both are typed optional.
 * The backend also auto-creates the visit and marks a linked appointment completed.
 */
export interface PrescriptionCreateRequest {
  /** Plain `string` in the schema (no `format: uuid`). */
  patient_id?: UUID | null;
  patient?: PatientUpsert | null;
  /** Plain `string` in the schema (no `format: uuid`). */
  appointment_id?: UUID | null;
  /** max 512 chars. */
  diagnosis?: string | null;
  /** max 512 chars. */
  chief_complaint?: string | null;
  /** max 4000 chars. */
  advice?: string | null;
  /** max 4000 chars. */
  notes?: string | null;
  follow_up_date?: DateString | null;
  /** 1..50 entries. */
  items: PrescriptionItemCreate[];
}

/** Convenience alias for `PrescriptionCreateRequest`. */
export type PrescriptionCreate = PrescriptionCreateRequest;

/** `PrescriptionResponse` — items of `GET /prescriptions` and of `GET /patients/{patient_id}/prescriptions`. */
export interface PrescriptionResponse {
  id: UUID;
  prescription_number: string;
  version: number;
  patient_id: UUID;
  /** Not in `required`; server default is `""`. */
  patient_name?: string;
  doctor_id: UUID;
  appointment_id: UUID | null;
  diagnosis: string | null;
  chief_complaint: string | null;
  advice: string | null;
  notes: string | null;
  follow_up_date: DateString | null;
  status: PrescriptionStatus;
  created_at: DateTimeString;
  items: PrescriptionItemResponse[];
}

/** `PrescriptionDetailResponse` — `POST /prescriptions` (201) and `GET /prescriptions/{prescription_id}`. */
export interface PrescriptionDetailResponse {
  id: UUID;
  prescription_number: string;
  version: number;
  patient_id: UUID;
  /** Not in `required`; server default is `""`. */
  patient_name?: string;
  doctor_id: UUID;
  appointment_id: UUID | null;
  diagnosis: string | null;
  chief_complaint: string | null;
  advice: string | null;
  notes: string | null;
  follow_up_date: DateString | null;
  status: PrescriptionStatus;
  created_at: DateTimeString;
  items: PrescriptionItemResponse[];
  /** Not in `required`. */
  patient?: PatientSummary | null;
  /** Not in `required`; server default is `""`. */
  doctor_full_name?: string;
  /** Not in `required`. */
  doctor_qualifications?: string | null;
}

/** `PrescriptionPrintResponse` — 200 body of `GET /prescriptions/{prescription_id}/print`. Self-contained A4 HTML. */
export interface PrescriptionPrintResponse {
  /** Plain `string` in the schema (no `format: uuid`). */
  prescription_id: UUID;
  html: string;
}

/* -------------------------------------------------------------------------- */
/* Appointments & availability                                                */
/* -------------------------------------------------------------------------- */

/** `AppointmentDetailResponse` — `GET/POST /appointments`, `GET/PATCH /appointments/{id}`, `PATCH /appointments/{id}/status`, `POST /public/appointments`. */
export interface AppointmentDetailResponse {
  id: UUID;
  patient_id: UUID;
  doctor_id: UUID;
  appointment_date: DateString;
  start_time: TimeString;
  end_time: TimeString;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  /** Free-form origin marker, e.g. `"public"`. Not an enum. */
  source: string;
  created_at: DateTimeString;
  patient: PatientSummary;
}

/** `AppointmentCreateRequest` — body of `POST /appointments` (staff-side booking). */
export interface AppointmentCreateRequest {
  /** Plain `string` in the schema (no `format: uuid`). Optional and nullable. */
  patient_id?: UUID | null;
  appointment_date: DateString;
  start_time: TimeString;
  /** max 512 chars. */
  reason?: string | null;
  /** max 1024 chars. */
  notes?: string | null;
  /** Defaults to `"public"` — yes, even on the staff endpoint. Free string, no max length. */
  source?: string;
}

/** Convenience alias for `AppointmentCreateRequest`. */
export type AppointmentCreate = AppointmentCreateRequest;

/** `AppointmentCreateByPatientRequest` — body of `POST /public/appointments` (unauthenticated public booking form). */
export interface AppointmentCreateByPatientRequest {
  /** 1..64 chars. */
  patient_first_name: string;
  /** 1..64 chars. */
  patient_last_name: string;
  /** 6..20 chars. */
  patient_phone: string;
  appointment_date: DateString;
  start_time: TimeString;
  /** max 512 chars. */
  reason?: string | null;
}

/** `AppointmentUpdateRequest` — body of `PATCH /appointments/{appointment_id}`. Reschedule / annotate only; status is a separate endpoint. */
export interface AppointmentUpdateRequest {
  appointment_date?: DateString | null;
  start_time?: TimeString | null;
  /** max 512 chars. */
  reason?: string | null;
  /** max 1024 chars. */
  notes?: string | null;
}

/** `AppointmentStatusUpdateRequest` — body of `PATCH /appointments/{appointment_id}/status`. */
export interface AppointmentStatusUpdateRequest {
  status: AppointmentStatus;
}

/** `AvailableSlotResponse` — items of `GET /appointments/slots` and `GET /public/slots`. */
export interface AvailableSlotResponse {
  date: DateString;
  start_time: TimeString;
  end_time: TimeString;
  /** Bare `string` in the schema; the live server emits `"available"`. */
  status: SlotStatus;
}

/** `WeeklyAvailabilityResponse` — `GET/POST/PATCH /appointments/availability*` and `GET /public/availability`. */
export interface WeeklyAvailabilityResponse {
  id: UUID;
  day_of_week: DayOfWeek;
  start_time: TimeString;
  end_time: TimeString;
  is_active: boolean;
}

/** `WeeklyAvailabilityCreate` — body of `POST /appointments/availability`. All three fields required. */
export interface WeeklyAvailabilityCreate {
  day_of_week: DayOfWeek;
  start_time: TimeString;
  end_time: TimeString;
}

/** `WeeklyAvailabilityUpdate` — body of `PATCH /appointments/availability/{availability_id}`. Note: `day_of_week` is NOT updatable. */
export interface WeeklyAvailabilityUpdate {
  start_time?: TimeString | null;
  end_time?: TimeString | null;
  is_active?: boolean | null;
}

/* -------------------------------------------------------------------------- */
/* Audit logs                                                                 */
/* -------------------------------------------------------------------------- */

/** `AuditLogResponse` — items of `GET /audit-logs`. */
export interface AuditLogResponse {
  id: UUID;
  user_id: UUID | null;
  action: AuditAction;
  /** Free-form entity name, e.g. `"patient"`. Not an enum; filterable via the `entity_type` query param (max 64 chars). */
  entity_type: string;
  entity_id: UUID | null;
  summary: string | null;
  changes: JsonObject | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: DateTimeString;
}

/* -------------------------------------------------------------------------- */
/* Clinic settings, doctor profile, prescription templates                    */
/* -------------------------------------------------------------------------- */

/** `ClinicSettingsResponse` — `GET/PATCH /clinic/settings` and `GET /public/clinic`. Every field is `required`; most are nullable. */
export interface ClinicSettingsResponse {
  clinic_name: string;
  tagline: string | null;
  phone: string | null;
  alternate_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  website_url: string | null;
  logo_url: string | null;
  /** Untyped free-form object in the schema. */
  working_hours: JsonObject | null;
  footer_text: string | null;
  /** Non-nullable; the live server returns a currency symbol such as `"₹"`. */
  currency: string;
  registration_number: string | null;
  google_maps_url: string | null;
  updated_at: DateTimeString;
}

/** `ClinicSettingsUpdate` — body of `PATCH /clinic/settings`. Note `updated_at` is not settable. */
export interface ClinicSettingsUpdate {
  /** 1..128 chars. */
  clinic_name?: string | null;
  /** max 255 chars. */
  tagline?: string | null;
  /** max 20 chars. */
  phone?: string | null;
  /** max 20 chars. */
  alternate_phone?: string | null;
  /** max 255 chars. No email-format validation. */
  email?: string | null;
  /** max 512 chars. */
  address?: string | null;
  /** max 128 chars. */
  city?: string | null;
  /** max 16 chars. */
  postal_code?: string | null;
  /** max 255 chars. */
  website_url?: string | null;
  /** max 512 chars. */
  logo_url?: string | null;
  working_hours?: JsonObject | null;
  /** max 2000 chars. */
  footer_text?: string | null;
  /** max 8 chars. */
  currency?: string | null;
  /** max 64 chars. */
  registration_number?: string | null;
  /** max 512 chars. */
  google_maps_url?: string | null;
}

/** `DoctorProfileResponse` — `GET/PATCH /clinic/doctor-profile` and `GET /public/doctor`. Every field is `required`. */
export interface DoctorProfileResponse {
  full_name: string;
  specialization: string | null;
  qualifications: string | null;
  registration_number: string | null;
  experience_years: number | null;
  bio: string | null;
  photo_url: string | null;
  signature_image_url: string | null;
}

/** `DoctorProfileUpdate` — body of `PATCH /clinic/doctor-profile`. */
export interface DoctorProfileUpdate {
  /** 1..128 chars. */
  full_name?: string | null;
  /** max 128 chars. */
  specialization?: string | null;
  /** max 255 chars. */
  qualifications?: string | null;
  /** max 64 chars. */
  registration_number?: string | null;
  /** Integer 0..100. */
  experience_years?: number | null;
  /** max 4000 chars. */
  bio?: string | null;
  /** max 512 chars. */
  photo_url?: string | null;
  /** max 512 chars. */
  signature_image_url?: string | null;
}

/** `PrescriptionTemplateResponse` — `GET/POST /clinic/templates`, `GET/PATCH /clinic/templates/{template_id}`. */
export interface PrescriptionTemplateResponse {
  id: UUID;
  name: string;
  description: string | null;
  header_html: string | null;
  footer_html: string | null;
  is_default: boolean;
  is_active: boolean;
}

/** `PrescriptionTemplateCreate` — body of `POST /clinic/templates`. Only `name` is required. */
export interface PrescriptionTemplateCreate {
  /** 1..128 chars. */
  name: string;
  /** max 2000 chars. */
  description?: string | null;
  /** No length bound declared. */
  header_html?: string | null;
  /** No length bound declared. */
  footer_html?: string | null;
  /** Defaults to `false`. */
  is_default?: boolean;
}

/** `PrescriptionTemplateUpdate` — body of `PATCH /clinic/templates/{template_id}`. */
export interface PrescriptionTemplateUpdate {
  /** 1..128 chars. */
  name?: string | null;
  /** max 2000 chars. */
  description?: string | null;
  header_html?: string | null;
  footer_html?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
}

/* -------------------------------------------------------------------------- */
/* Portfolio CMS                                                              */
/* -------------------------------------------------------------------------- */

/** `PortfolioPageResponse` — `GET/POST /portfolio/pages`, `PATCH /portfolio/pages/{page_id}`. */
export interface PortfolioPageResponse {
  id: UUID;
  slug: string;
  title: string;
  subtitle: string | null;
  /** Untyped free-form object in the schema — the page body / block tree. */
  content: JsonObject | null;
  hero_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  is_published: boolean;
  sort_order: number;
  updated_at: DateTimeString;
}

/** `PortfolioPageCreate` — body of `POST /portfolio/pages`. */
export interface PortfolioPageCreate {
  /** 1..64 chars, must match `^[a-z0-9-]+$` (lowercase letters, digits, hyphens only). */
  slug: string;
  /** 1..128 chars. */
  title: string;
  /** max 255 chars. */
  subtitle?: string | null;
  content?: JsonObject | null;
  /** max 512 chars. */
  hero_image_url?: string | null;
  /** max 160 chars. */
  meta_title?: string | null;
  /** max 255 chars. */
  meta_description?: string | null;
  /** Defaults to `true`. */
  is_published?: boolean;
  /** Defaults to `0`. */
  sort_order?: number;
}

/** `PortfolioPageUpdate` — body of `PATCH /portfolio/pages/{page_id}`. Note: `slug` is absent, i.e. immutable after creation. */
export interface PortfolioPageUpdate {
  /** 1..128 chars. */
  title?: string | null;
  /** max 255 chars. */
  subtitle?: string | null;
  content?: JsonObject | null;
  /** max 512 chars. */
  hero_image_url?: string | null;
  /** max 160 chars. */
  meta_title?: string | null;
  /** max 255 chars. */
  meta_description?: string | null;
  is_published?: boolean | null;
  sort_order?: number | null;
}

/** `ServiceResponse` — `GET/POST /portfolio/services`, `PATCH /portfolio/services/{service_id}`. */
export interface ServiceResponse {
  id: UUID;
  title: string;
  description: string | null;
  icon_name: string | null;
  is_active: boolean;
  sort_order: number;
}

/** `ServiceCreate` — body of `POST /portfolio/services`. Only `title` is required. */
export interface ServiceCreate {
  /** 1..128 chars. */
  title: string;
  /** max 4000 chars. */
  description?: string | null;
  /** max 64 chars. */
  icon_name?: string | null;
  /** Defaults to `true`. */
  is_active?: boolean;
  /** Defaults to `0`. */
  sort_order?: number;
}

/** `ServiceUpdate` — body of `PATCH /portfolio/services/{service_id}`. */
export interface ServiceUpdate {
  /** 1..128 chars. */
  title?: string | null;
  /** max 4000 chars. */
  description?: string | null;
  /** max 64 chars. */
  icon_name?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
}

/** `GalleryImageResponse` — `GET/POST /portfolio/gallery`, `PATCH /portfolio/gallery/{image_id}`. */
export interface GalleryImageResponse {
  id: UUID;
  image_url: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  is_published: boolean;
}

/** `GalleryImageCreate` — body of `POST /portfolio/gallery`. Only `image_url` is required. */
export interface GalleryImageCreate {
  /** 1..512 chars. */
  image_url: string;
  /** max 255 chars. */
  caption?: string | null;
  /** max 255 chars. */
  alt_text?: string | null;
  /** Defaults to `0`. */
  sort_order?: number;
  /** Defaults to `true`. */
  is_published?: boolean;
}

/** `GalleryImageUpdate` — body of `PATCH /portfolio/gallery/{image_id}`. */
export interface GalleryImageUpdate {
  /** 1..512 chars. */
  image_url?: string | null;
  /** max 255 chars. */
  caption?: string | null;
  /** max 255 chars. */
  alt_text?: string | null;
  sort_order?: number | null;
  is_published?: boolean | null;
}

/** `TestimonialResponse` — `GET/POST /portfolio/testimonials`, `PATCH /portfolio/testimonials/{testimonial_id}`. */
export interface TestimonialResponse {
  id: UUID;
  author_name: string;
  author_role: string | null;
  content: string;
  rating: number;
  is_published: boolean;
  sort_order: number;
}

/** `TestimonialCreate` — body of `POST /portfolio/testimonials`. */
export interface TestimonialCreate {
  /** 1..128 chars. */
  author_name: string;
  /** 1..4000 chars. */
  content: string;
  /** max 128 chars. */
  author_role?: string | null;
  /** Integer 1..5, defaults to `5`. */
  rating?: number;
  /** Defaults to `true`. */
  is_published?: boolean;
  /** Defaults to `0`. */
  sort_order?: number;
}

/** `TestimonialUpdate` — body of `PATCH /portfolio/testimonials/{testimonial_id}`. */
export interface TestimonialUpdate {
  /** 1..128 chars. */
  author_name?: string | null;
  /** max 128 chars. */
  author_role?: string | null;
  /** 1..4000 chars. */
  content?: string | null;
  /** Integer 1..5. */
  rating?: number | null;
  is_published?: boolean | null;
  sort_order?: number | null;
}

/**
 * Inline (not a component schema): the 200 body of `GET /public/portfolio`,
 * declared only as `object(additionalProperties: true)`. The live server returns
 * the four published collections in one call.
 */
export interface PublicPortfolioResponse {
  pages: PortfolioPageResponse[];
  services: ServiceResponse[];
  gallery: GalleryImageResponse[];
  testimonials: TestimonialResponse[];
  [key: string]: unknown;
}

/**
 * Inline (not a component schema): the 200 body of `GET /public/pages/{slug}`,
 * declared only as `object(additionalProperties: true)`. Shaped like a
 * `PortfolioPageResponse` in practice, but unverified by the schema.
 */
export type PublicPageResponse = JsonObject;

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

/** `Body_upload_file_api_v1_uploads_post` — `multipart/form-data` body of `POST /uploads`. */
export interface UploadFileBody {
  /** Form field name is `file`. Binary (`contentMediaType: application/octet-stream`). No size or MIME constraint in the schema. */
  file: File | Blob;
}

/** Schema-name alias for {@link UploadFileBody}. */
export type Body_upload_file_api_v1_uploads_post = UploadFileBody;

/** `UploadResponse` — 200 body of `POST /uploads`. Returns the public URL of the stored asset. */
export interface UploadResponse {
  url: string;
}

/* -------------------------------------------------------------------------- */
/* Speech / transcription                                                     */
/* -------------------------------------------------------------------------- */

/** `SpeechConfigResponse` — 200 body of `GET /speech/config`. "What the client needs to record audio the provider will accept." */
export interface SpeechConfigResponse {
  provider: string;
  sample_rate_hz: number;
  media_encoding: string;
  language_code: string | null;
  identify_multiple_languages: boolean;
  language_options: string[];
  vocabulary_name: string | null;
  /** Path of the streaming transcription WebSocket. Not present as a REST path in `paths`. */
  websocket_path: string;
  /** Not in `required`; server default is `1`. */
  channels?: number;
  /** Not in `required`; server default is `16`. */
  bits_per_sample?: number;
  /**
   * Whether this deployment can translate a transcript at all. Reports
   * configuration only — a provider can be present here and still be refused by
   * IAM on the first call, which surfaces as a 502 `upstream_error`.
   * Not in `required`; server default is `false`.
   */
  translation_available?: boolean;
  /**
   * ISO 639-1 targets the client may request, e.g. `["bn"]`. Note these are not
   * the locale codes Transcribe uses: `bn`, not `bn-IN`.
   * Not in `required`; server default is `[]`.
   */
  translation_target_languages?: string[];
  /**
   * Whether dictation can be analysed into a prescription draft by the model.
   * Configuration only — a key can be present and still be rejected on the
   * first call, which surfaces as a 502 `upstream_error`.
   * Not in `required`; server default is `false`.
   */
  extraction_available?: boolean;
  /** e.g. `nvidia/nemotron-3-nano-30b-a3b:free`. Null when unavailable. */
  extraction_model?: string | null;
}

/**
 * One value the model read, with the transcript span justifying it.
 *
 * `evidence` has already been checked against the transcript server-side;
 * anything that failed that check never reaches us.
 */
export interface ExtractedValue<T = unknown> {
  value: T;
  evidence: string | null;
}

/** `ExtractedRow` — one medicine the model found in the dictation. */
export interface ExtractedRow {
  spoken_name: string;
  dosage?: ExtractedValue<string> | null;
  /**
   * `{ m, a, n }` counts. Absent means frequency was never stated — which is
   * NOT the same as every slot being zero.
   */
  schedule?: ExtractedValue<{ m: number | null; a: number | null; n: number | null }> | null;
  duration_days?: ExtractedValue<number> | null;
  food?: ExtractedValue<'before' | 'after' | 'with'> | null;
  instructions?: ExtractedValue<string> | null;
  prn?: boolean;
  source_text?: string;
}

/** `ExtractionRequest` — body of `POST /speech/extract`. */
export interface ExtractionRequest {
  /** 1–20000 characters. */
  transcript: string;
  /** Costs latency. Worth it when a dictation came back wrong. */
  reasoning?: boolean | null;
}

/** `ExtractionResponse` — 200 body of `POST /speech/extract`. */
export interface ExtractionResponse {
  rows: ExtractedRow[];
  diagnosis?: ExtractedValue<string> | null;
  chief_complaint?: ExtractedValue<string> | null;
  advice?: ExtractedValue<string> | null;
  investigations?: ExtractedValue<string> | null;
  follow_up_days?: ExtractedValue<number> | null;
  unparsed: string[];
  /**
   * Values the model produced whose evidence was not found in the transcript,
   * and were therefore dropped. Shown rather than hidden — a model that
   * invents things is something the doctor should see.
   */
  rejected: string[];
  provider: string;
  model: string;
  duration_ms: number;
}

/** `TranslationRequest` — body of `POST /speech/translate`. */
export interface TranslationRequest {
  /** 1–5000 characters. */
  text: string;
  /** ISO 639-1. Server default is `en`. AWS also accepts `auto`. */
  source_language_code?: string;
  /** ISO 639-1, e.g. `bn`. */
  target_language_code: string;
}

/** `TranslationResponse` — 200 body of `POST /speech/translate`. */
export interface TranslationResponse {
  provider: string;
  /** Echo of the submitted text. */
  text: string;
  translated_text: string;
  /** What the provider resolved — differs from the request when `auto` was sent. */
  source_language_code: string;
  target_language_code: string;
}

/** `Body_transcribe_file_api_v1_speech_transcribe_post` — `multipart/form-data` body of `POST /speech/transcribe`. */
export interface TranscribeFileBody {
  /** Form field name is `audio`. "Mono 16-bit WAV, or raw PCM". */
  audio: File | Blob;
}

/** Schema-name alias for {@link TranscribeFileBody}. */
export type Body_transcribe_file_api_v1_speech_transcribe_post = TranscribeFileBody;

/** `TranscriptChunkResponse` — one transcript update, as sent over the WebSocket and inside `TranscriptionResponse.chunks`. */
export interface TranscriptChunkResponse {
  text: string;
  is_final: boolean;
  confidence?: number | null;
  language_code?: string | null;
  /** Seconds offset (a number), NOT a `format: time` string. */
  start_time?: number | null;
  /** Seconds offset (a number), NOT a `format: time` string. */
  end_time?: number | null;
}

/** `TranscriptionResponse` — 200 body of `POST /speech/transcribe`. Result of transcribing a complete audio file. */
export interface TranscriptionResponse {
  provider: string;
  /** All final chunks joined in order. */
  transcript: string;
  chunks: TranscriptChunkResponse[];
  language_code?: string | null;
  duration_seconds?: number | null;
}


/** `AdvicePresetResponse` — one line of the doctor's advice library. */
export interface AdvicePresetResponse {
  id: UUID;
  label: string;
  /** The condition it belongs to, e.g. `Knee pain`. Null means general. */
  category: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: DateTimeString;
  updated_at: DateTimeString;
}

/** Body of `POST /advice-presets`. [admin] */
export interface AdvicePresetCreate {
  /** 1..256 */
  label: string;
  /** <=64 */
  category?: string | null;
  sort_order?: number;
}

/** Body of `PATCH /advice-presets/{id}`. [admin] */
export interface AdvicePresetUpdate {
  label?: string;
  category?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Monitoring                                                                 */
/* -------------------------------------------------------------------------- */

/** The rolling window every monitoring aggregate is computed over. Default `"24h"`. */
export type MonitoringWindow = '1h' | '24h' | '7d' | '30d';

/** All four `MonitoringWindow` values, shortest first — the order the window picker renders in. */
export const MONITORING_WINDOWS = [
  '1h',
  '24h',
  '7d',
  '30d',
] as const satisfies readonly MonitoringWindow[];

/**
 * One external dependency's reachability. `ok` is TRI-state: `true` reachable,
 * `false` broken, `null` not configured or not checked. Render `null` grey with
 * its `detail` — a disabled feature is not a failure and must never read red.
 */
export interface DependencyStatusResponse {
  name: string;
  ok: boolean | null;
  detail: string | null;
}

/** `SystemStatusResponse` — `GET /system/status`. The "is it up right now" strip; safe to poll every ~15s. */
export interface SystemStatusResponse {
  /** Colour the whole strip from this. */
  status: 'ok' | 'degraded';
  app: string;
  version: string;
  environment: string;
  instance_id: string;
  process_started_at: DateTimeString;
  process_uptime_seconds: number;
  database_ok: boolean;
  /** A serverless Postgres includes cold-start here: a first reading in the high hundreds is normal, a sustained one is not. */
  database_latency_ms: number | null;
  pool_size: number | null;
  pool_in_use: number | null;
  pool_overflow: number | null;
  dependencies: DependencyStatusResponse[];
  /** When `false`, uptime and metrics have no new samples coming. Say so rather than drawing an empty chart. */
  monitoring_enabled: boolean;
  monitoring_interval_seconds: number;
}

/** One stretch of unavailability inside an uptime window. `gap` means samples stopped arriving, which is not the same as a confirmed outage. */
export interface IncidentResponse {
  started_at: DateTimeString;
  ended_at: DateTimeString;
  kind: 'unhealthy' | 'gap';
  detail: string;
  seconds: number;
}

/** A process restart observed inside the window; a new `instance_id` is how a restart is detected at all. */
export interface RestartResponse {
  at: DateTimeString;
  instance_id: string;
}

/** `UptimeResponse` — `GET /system/uptime`. */
export interface UptimeResponse {
  window: MonitoringWindow;
  window_start: DateTimeString;
  window_end: DateTimeString;
  /** Sampling may have begun after `window_start`; everything before this is unknown, not up. */
  coverage_start: DateTimeString;
  /** 0..1, not a percentage. */
  availability: number;
  downtime_seconds: number;
  sample_count: number;
  incidents: IncidentResponse[];
  restarts: RestartResponse[];
  /** The figure was interpolated between samples rather than measured continuously. */
  inferred: boolean;
  /** The server's own wording for what the number does not prove. Show it beside the figure. */
  caveat: string;
}

/** One route's slice of a metrics window, for the busiest / slowest / failing tables. */
export interface RouteMetricsResponse {
  route: string;
  requests: number;
  errors: number;
  p95_ms: number | null;
}

/** One sample in the metrics sparkline series. */
export interface MetricsPoint {
  observed_at: DateTimeString;
  requests_total: number;
  requests_5xx: number;
  latency_p95_ms: number | null;
  db_latency_ms: number | null;
  db_ok: boolean;
}

/** `MetricsResponse` — `GET /system/metrics`. Volume, error rate, latency, the three route tables and the series behind the sparkline. */
export interface MetricsResponse {
  window: MonitoringWindow;
  window_start: DateTimeString;
  window_end: DateTimeString;
  requests_total: number;
  requests_4xx: number;
  requests_5xx: number;
  /** 0..1, not a percentage. */
  error_rate: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  busiest_routes: RouteMetricsResponse[];
  slowest_routes: RouteMetricsResponse[];
  failing_routes: RouteMetricsResponse[];
  series: MetricsPoint[];
}

/** `ErrorEventResponse` — one entry of the recent 5xx feed, `GET /system/errors`. `correlation_id` is what a user's bug report will quote. */
export interface ErrorEventResponse {
  id: UUID;
  occurred_at: DateTimeString;
  correlation_id: string | null;
  method: string;
  path: string;
  status_code: number;
  exception_type: string | null;
  message: string | null;
  user_id: UUID | null;
  ip_address: string | null;
}

/** `SecurityOverviewResponse` — `GET /system/security`. Sessions, logins and the head-count per role. */
export interface SecurityOverviewResponse {
  active_sessions: number;
  sessions_last_24h: number;
  failed_logins_24h: number;
  successful_logins_24h: number;
  active_users: number;
  inactive_users: number;
  /** Keyed by role name, which the clinic can rename — treat the keys as labels, not identifiers. */
  users_by_role: Record<string, number>;
}

/** One table's footprint. `estimated_rows` comes from the planner's statistics, so it is an estimate, not a count. */
export interface TableStat {
  table: string;
  /**
   * The planner's estimate from `pg_stat_user_tables`, not `COUNT(*)`.
   * There is deliberately no per-table size here — `size_bytes` / `size_pretty`
   * on `DatabaseOverviewResponse` describe the database as a whole.
   */
  estimated_rows: number;
}

/** `DatabaseOverviewResponse` — `GET /system/database`. */
export interface DatabaseOverviewResponse {
  database: string;
  size_bytes: number;
  size_pretty: string;
  connections: number;
  max_connections: number;
  tables: TableStat[];
  /** How far back the health history actually reaches; null when nothing has been sampled yet. */
  oldest_health_sample: DateTimeString | null;
  health_sample_rows: number;
}
