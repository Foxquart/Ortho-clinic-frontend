# Backend changes for booking vitals, optional phone, and optional time

**Audience:** the API maintainers.
**Shipped with:** the frontend change in `docs/superpowers/specs/2026-11-17-booking-vitals-design.md`.
**Deploy order:** API first, then frontend. Until the API accepts the new
payloads, a booking without a phone or with vitals receives a `422`.

All new request fields are optional, and every field the API requires today is
still accepted, so old clients and old data keep working.

---

## 1. Appointment vitals

Vitals move from the prescription to the appointment. The pad no longer sends
`vitals_*`; the booking dialog does. Height does not exist anywhere in the API
today, so it is a new column.

### Columns

Add to the `appointments` table (all nullable):

| Column | Type | Bounds |
|---|---|---|
| `vitals_bp` | `VARCHAR(32)` | free text, e.g. `120/80`, qualifiers allowed |
| `vitals_spo2` | `SMALLINT` | 0–100 |
| `vitals_pulse_bpm` | `SMALLINT` | 20–300 |
| `vitals_height_cm` | `NUMERIC(5,2)` | 0–300 |
| `vitals_weight_kg` | `NUMERIC(6,2)` | 0–500 |

Migration (Postgres):

```sql
ALTER TABLE appointments
  ADD COLUMN vitals_bp          VARCHAR(32)  NULL,
  ADD COLUMN vitals_spo2        SMALLINT     NULL,
  ADD COLUMN vitals_pulse_bpm   SMALLINT     NULL,
  ADD COLUMN vitals_height_cm   NUMERIC(5,2) NULL,
  ADD COLUMN vitals_weight_kg   NUMERIC(6,2) NULL;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_vitals_spo2_range
    CHECK (vitals_spo2 IS NULL OR vitals_spo2 BETWEEN 0 AND 100),
  ADD CONSTRAINT appointments_vitals_pulse_range
    CHECK (vitals_pulse_bpm IS NULL OR vitals_pulse_bpm BETWEEN 20 AND 300),
  ADD CONSTRAINT appointments_vitals_height_range
    CHECK (vitals_height_cm IS NULL OR vitals_height_cm BETWEEN 0 AND 300),
  ADD CONSTRAINT appointments_vitals_weight_range
    CHECK (vitals_weight_kg IS NULL OR vitals_weight_kg BETWEEN 0 AND 500);
```

### API contract

`POST /appointments` (staff) and `POST /public/appointments` (patient) — add to
`AppointmentCreateRequest` and `AppointmentCreateByPatientRequest`:

```json
{
  "patient_id": "…",
  "appointment_date": "2026-11-20",
  "start_time": "16:00",
  "vitals_bp": "128/84",
  "vitals_spo2": 98,
  "vitals_pulse_bpm": 76,
  "vitals_height_cm": 170.5,
  "vitals_weight_kg": 72.5
}
```

Validation:

| Field | Type | Required | Rule |
|---|---|---|---|
| `vitals_bp` | string | no | ≤ 32 characters |
| `vitals_spo2` | integer | no | 0–100 |
| `vitals_pulse_bpm` | integer | no | 20–300 |
| `vitals_height_cm` | decimal | no | 0–300, at most 2 decimals |
| `vitals_weight_kg` | decimal | no | 0–500, at most 2 decimals |

Accept the decimal fields as either a JSON number or a numeric string; the
frontend sends numbers, and older integrations may send strings. Store
`NUMERIC`, return them as strings in JSON (the prescription schema already
returns `vitals_weight_kg` that way), and the frontend will accept either.

`AppointmentDetailResponse` — add the same five fields to every response that
returns an appointment (`POST /appointments`, `GET /appointments`,
`GET /appointments/{id}`, `PATCH /appointments/{id}`,
`PATCH /appointments/{id}/status`, `POST /public/appointments`):

```json
{
  "id": "…",
  "appointment_date": "2026-11-20",
  "start_time": "16:00:00",
  "end_time": "16:30:00",
  "vitals_bp": "128/84",
  "vitals_spo2": 98,
  "vitals_pulse_bpm": 76,
  "vitals_height_cm": "170.50",
  "vitals_weight_kg": "72.50"
}
```

Also add the five fields to `AppointmentUpdateRequest` (all nullable) so a
mistyped reading can be corrected without deleting the appointment.

### What happens to the prescription columns

Keep `prescriptions.vitals_*` for historical rows — do not drop them. New
prescriptions will send `null`. The pad no longer shows the fields and
`POST /prescriptions` / `POST /prescriptions/preview` no longer send them.
Leave the fields in `PrescriptionCreateRequest` so older clients still work.

### Print template

Remove the vitals line from the printed HTML (`GET /prescriptions/{id}/print`
and the preview). Old prescriptions may still have values; the request is that
the page no longer show them. If the template hides the line when all four are
null, that is not enough — new prescriptions will all be null and old ones
would still print. Remove the block.

---

## 2. Optional phone

### `PatientUpsert.phone`

The staff booking dialog creates a walk-in inline. Phone must become optional so
a patient can be booked without one.

- `PatientUpsert.phone`: `str | None`, `min_length=6`, `max_length=20` **when
  present**.
- The frontend omits the key when blank. Do not accept `""`: treat an empty
  string as absent, or reject it with the normal 6–20 message.

### `PatientCreateRequest.phone` and the database

The patient table's `phone` is currently required and unique. If a patient with
no phone is created through the inline path, the row needs a place to go.

Recommended:

```sql
ALTER TABLE patients ALTER COLUMN phone DROP NOT NULL;
```

If uniqueness is enforced by a unique index on `phone`, make it partial so
multiple patients without a number can exist:

```sql
DROP INDEX IF EXISTS ix_patients_phone;
CREATE UNIQUE INDEX ix_patients_phone
  ON patients (phone)
  WHERE phone IS NOT NULL AND phone <> '';
```

`PatientCreateRequest` itself can stay strict (the dedicated "add patient"
form still asks for a phone). Only the inline `PatientUpsert` becomes lenient.

### Find-or-create rules

The server currently finds-or-creates by normalised phone. With no phone:

1. If a phone is present, match on it exactly as today.
2. If no phone but a `date_of_birth` is present, match on
   `lower(first_name), lower(last_name), date_of_birth`.
3. Otherwise create a new patient.

Do not match on name alone; common names would merge unrelated people. Record
in the audit log when step 2 was used, so a duplicate is explainable.

### Public booking

`AppointmentCreateByPatientRequest.patient_phone` becomes optional, with the
same 6–20 rule when present. The public form now omits it. Apply the same
find-or-create rules, and make the confirmation copy ("we will call you") not
depend on a phone that may not exist.

---

## 3. Time (optional for the API, not required by this frontend)

The staff dialog no longer shows a time picker. It sends the clicked slot when
the doctor opened the dialog from one, otherwise the earliest free slot for the
day, so **the current API keeps working unchanged**.

If you prefer the server to own the choice:

- Make `start_time` optional on `AppointmentCreateRequest`.
- When absent, assign the first free half hour inside the day's clinic hours.
- Return `409 conflict` with the usual shape when the day is full.
- Always return the assigned `start_time` and `end_time`.

Keep `start_time` required for `POST /public/appointments`: the public form
still chooses a slot.

---

## 4. Patient "last vitals"

`PatientDetailScreen` shows the most recent measurements. It reads the latest
prescription first, then `patient.medical_history.vitals`. Once new
prescriptions stop carrying vitals, a visit's readings live on the appointment
and the screen will fall back to stale patient-record values.

Recommended follow-up (not blocking this frontend change): include the latest
non-null appointment vitals in `GET /patients/{patient_id}/summary`, or expose
a `GET /patients/{patient_id}/vitals` that merges appointment readings, so the
patient header stays correct.

---

## 5. Compatibility and tests

- Old payloads that send `patient_phone`, `phone`, `start_time`, and
  `vitals_*` on prescriptions must still be accepted.
- New payloads omit optional keys; a `422` for a missing key is a regression.
- Add tests for:
  - booking with all five vitals, then reading them back;
  - booking with no vitals (all null);
  - each vitals bound (0/100, 20/300, 0/300, 0/500) and one over each;
  - inline patient with no phone, with a phone, and with a duplicate phone;
  - no-phone dedupe by name + date of birth;
  - public booking with and without `patient_phone`;
  - print HTML with no vitals block.
