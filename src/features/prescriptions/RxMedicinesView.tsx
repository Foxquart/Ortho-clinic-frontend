import { Table, TD, TH, THead, TR } from '@/components/ui/Table'
import { humanizeEnum } from '@/lib/format'
import { RxScheduleView } from './RxScheduleView'
import type { PrescriptionItemResponse } from '@/api/schema'

/**
 * The medicine lines, read the way a prescription is read: one row per drug,
 * strength next to the name, timing as a visual triple, everything else in a
 * fixed column so the eye can run straight down it.
 *
 * Read-only by construction — prescriptions are append-only over HTTP.
 */
export function RxMedicinesView({ items }: { items: PrescriptionItemResponse[] }) {
  // `sort_order` is the doctor's own ordering; the array order is not promised.
  const rows = [...items].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Table>
      <THead>
        <TH width="2.5rem" align="right">
          #
        </TH>
        <TH>Medicine</TH>
        <TH width="9rem">Dose</TH>
        <TH width="7.5rem">Timing (M-A-N)</TH>
        <TH width="6rem" align="right">
          Duration
        </TH>
        <TH width="4.5rem" align="right">
          Qty
        </TH>
        <TH>Instructions</TH>
      </THead>
      <tbody>
        {rows.map((item, index) => (
          <TR key={item.id} className="align-top">
            <TD align="right" numeric className="text-caption text-text-subtle pt-2.5">
              {index + 1}
            </TD>
            <TD className="pt-2">
              <span className="text-body text-text font-medium">{item.medicine.name}</span>
              {item.medicine.strength && (
                <span className="text-label text-text-muted ml-1.5">{item.medicine.strength}</span>
              )}
              <span className="text-caption text-text-subtle mt-0.5 block">
                {[item.medicine.generic_name, humanizeEnum(item.medicine.dosage_form)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </TD>
            <TD className="text-label text-text pt-2.5">{item.dosage}</TD>
            <TD className="pt-2">
              <RxScheduleView frequency={item.frequency} />
            </TD>
            <TD align="right" className="text-label text-text pt-2.5 whitespace-nowrap">
              {item.duration_days == null ? (
                <span className="text-text-subtle">—</span>
              ) : (
                <span data-numeric>
                  {item.duration_days} {item.duration_days === 1 ? 'day' : 'days'}
                </span>
              )}
            </TD>
            <TD align="right" numeric className="text-label text-text pt-2.5">
              {item.quantity ?? <span className="text-text-subtle">—</span>}
            </TD>
            <TD className="text-caption text-text-muted pt-2.5">
              {item.instructions ?? <span className="text-text-subtle">—</span>}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  )
}
