/**
 * Types for the responses the OpenAPI document declares as bare objects.
 *
 * A handful of endpoints are typed server-side as `dict[str, Any]`, so
 * `schema.ts` can only call them `JsonObject`. Their real shape is stable and
 * is read directly from the backend service layer — the source is cited on
 * each type so it can be re-checked when the API changes.
 *
 * These are contracts we assert, not contracts the server guarantees. Read
 * them defensively at the call site.
 */

import type {
  AppointmentStatus,
  DateString,
  DateTimeString,
  PatientResponse,
  TimeString,
  UUID,
} from './schema'

/* -------------------------------------------------------------------------- */
/*  GET /patients/{id}/summary                                                */
/*  Source: app/services/patient.py :: PatientService.get_patient_summary      */
/* -------------------------------------------------------------------------- */

export interface PatientSummaryPrescription {
  id: UUID
  prescription_number: string
  diagnosis: string | null
  created_at: DateTimeString
  items_count: number
}

export interface PatientSummaryAppointment {
  id: UUID
  appointment_date: DateString
  start_time: TimeString
  status: AppointmentStatus
  reason: string | null
}

/**
 * The patient card behind the prescription screen: the full patient record
 * plus their entire prescription and appointment history in one round trip.
 *
 * Note the field names — `prescriptions` and `appointments`, not
 * `recent_prescriptions`. The lists are complete, not truncated.
 */
export interface PatientSummaryCardResponse {
  patient: PatientResponse
  prescriptions: PatientSummaryPrescription[]
  appointments: PatientSummaryAppointment[]
  last_visit_date: DateString | null
}

/* -------------------------------------------------------------------------- */
/*  GET /dashboard/summary — the two `list[dict[str, Any]]` fields            */
/*  Source: app/services/dashboard.py :: DashboardService.get_summary          */
/* -------------------------------------------------------------------------- */

export interface DashboardRecentAppointment {
  id: UUID
  patient_name: string
  date: DateString
  /** Serialised with `.isoformat()`, so `HH:MM:SS`. */
  time: TimeString
  status: AppointmentStatus
}

export interface DashboardRecentPrescription {
  id: UUID
  prescription_number: string
  patient_name: string
  created_at: DateTimeString
}
