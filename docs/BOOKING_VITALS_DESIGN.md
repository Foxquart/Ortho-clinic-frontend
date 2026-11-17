# Booking vitals, optional phone, no time picker, D/M/Y dates

**Date:** 2026-11-17
**Status:** approved (scope agreed in conversation; backend ships separately)

## Intent

Move the per-visit measurements from the prescription pad to the appointment
booking dialog, let a patient be booked without a phone number, stop asking for
a time in the staff booking dialog, and make every date field show and accept
`DD/MM/YYYY` regardless of the machine's locale.

## Goals

- Staff booking dialog: phone optional for a new patient; BP, SpO₂, height and
  weight fields; no time picker; date as `DD/MM/YYYY`.
- Prescription pad: no vitals block, no vitals sent.
- One date control, used everywhere, that always reads and writes `DD/MM/YYYY`.
- The booking dialog and drawers scroll on browsers without `dvh` support.
- A short backend guide describing every API change the frontend depends on.

## Non-goals

- Changing the appointment day/week views' layout.
- Moving the patient record's own vitals block (`medical_history.vitals`).
- Redesigning the public landing page.

## Decisions

1. **Vitals belong to the appointment.** The prescription keeps its historical
   columns for old records, but the pad stops sending them. New appointments
   carry `vitals_bp`, `vitals_spo2`, `vitals_height_cm`, `vitals_weight_kg`.
   Height is new; nothing in the API has it today.
2. **HR moves with the rest.** The pad currently shows BP, SpO₂, HR, weight. A
   lone HR left behind would be orphaned, so HR is added to the booking form
   too (`vitals_pulse_bpm`), even though the request listed only four fields.
3. **Phone is optional only where a booking creates a patient.** Existing
   patients already book without a phone. A blank phone is omitted from the
   payload. If the server cannot identify a patient without a phone, it should
   match on name + date of birth, else create a new record.
4. **No time picker, but a time is still assigned.** The dialog hides the slot
   grid. If the doctor opened the dialog by clicking a free slot, that time is
   sent as before. Otherwise the dialog still fetches the day's free slots and
   sends the earliest one. This works against today's API and keeps the booking
   deterministic; the backend guide proposes moving the choice server-side.
5. **One `DateField` for the whole app.** A text input with a `DD/MM/YYYY` mask
   and a popover calendar. Native `<input type="date">` is removed: its display
   format follows the OS locale and cannot be overridden. Radix Popover and
   date-fns are already dependencies.
6. **`dvh` gets a `vh` fallback, everywhere it bounds a scroll area.** The
   value is kept under a `supports-[height:100dvh]` variant so older
   Chrome/Edge get a bounded surface that scrolls instead of one taller than
   the screen. This covers the dialog and drawer, the app shells (`AppShell`,
   `SuperadminShell`), the route error page and `body`'s minimum height.

   The shells matter as much as the dialog: every screen sizes itself from the
   shell's one-viewport height, so a dropped `h-dvh` leaves the page
   auto-height and the prescription preview pane — the one thing that must
   scroll inside a fixed box — measures its own content instead of the
   viewport and stops scrolling. That is the reported client-PC symptom.

## Backend contract (summary; full guide in `docs/BACKEND_BOOKING_VITALS.md`)

- `POST /appointments`: accept optional `vitals_bp` (≤32 chars),
  `vitals_spo2` (0–100), `vitals_height_cm` (0–300, ≤2 dp),
  `vitals_pulse_bpm` (20–300), `vitals_weight_kg` (0–500, ≤2 dp). Echo them in
  the appointment response.
- `POST /appointments` / `PatientUpsert`: `phone` optional; `start_time`
  optional (server assigns the first free slot, 409 when the day is full).
- `POST /public/appointments`: `patient_phone` optional.
- Print template: remove the vitals line.
- Old clients keep working (all new fields optional, old required fields still
  accepted).

## Risks

- Appointment vitals are lost silently until the API accepts them.
- Deploying the frontend before the backend makes time-less bookings fail with
  422; ship the backend first or together.
- A new patient with no phone and no date of birth cannot be deduplicated; the
  server will create a fresh record each time.
