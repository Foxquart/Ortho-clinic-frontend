# Investigation catalogue — API contract

The pad's **Investigations** section is a searchable, grouped checklist backed
by a clinic-wide catalogue (`GET /investigations`). This file is the contract
the backend and the print template need to implement. The frontend side is
already in place and degrades to the old free-text behaviour when these
endpoints are absent.

## Endpoints

Mirror `advice-presets`.

| Method | Path | Body | Response | Access |
|---|---|---|---|---|
| `GET` | `/api/v1/investigations` | — | `InvestigationResponse[]` | any signed-in user |
| `GET` | `/api/v1/investigations?include_inactive=true` | — | `InvestigationResponse[]` | admin UIs |
| `POST` | `/api/v1/investigations` | `InvestigationCreate` | 201 `InvestigationResponse` | admin |
| `PATCH` | `/api/v1/investigations/{id}` | `InvestigationUpdate` | `InvestigationResponse` | admin |
| `DELETE` | `/api/v1/investigations/{id}` | — | `MessageResponse` | admin |

`DELETE` should be a soft delete (`is_active = false`) if prescriptions refer to
the row, so an old prescription keeps its label.

### Shapes

```jsonc
// InvestigationResponse
{
  "id": "uuid",
  "name": "CBC",                      // what prints; 1..128
  "category": "Blood",                // null = General; <= 64
  "sort_order": 0,
  "is_active": true,
  "created_at": "2026-11-06T10:00:00Z",
  "updated_at": "2026-11-06T10:00:00Z"
}

// InvestigationCreate
{ "name": "CBC", "category": "Blood", "sort_order": 0 }

// InvestigationUpdate (all optional)
{ "name": "CBC", "category": "Blood", "sort_order": 0, "is_active": true }
```

Suggested seed categories, in the order the paper reads them:

- **Blood** — CBC, HBsAg, HIV, FBS, LFT, Thyroid Profile, Lipid Profile,
  Blood Group, BTCT, HCV, HbA1c, PPBS, KFT, ESR
- **Radiology / Pathology** — X-ray, USG, MRI, CT Scan
- **Cardiovascular** — ECG, Echocardiography

## Prescription create / preview

The pad keeps the existing newline `investigations` text **and** adds catalogue
ids, so nothing that prints today stops printing.

```jsonc
// POST /api/v1/prescriptions
{
  "investigations": "CBC\nKFT",          // unchanged: human-readable lines
  "investigation_ids": ["uuid", "uuid"]  // NEW: catalogue rows for the same lines
}
```

```jsonc
// POST /api/v1/prescriptions/preview
{
  "investigations": "CBC\nKFT",
  "investigation_ids": ["uuid", "uuid"]
}
```

`investigation_ids` is omitted entirely when nothing was picked from the
catalogue (freehand lines, or the catalogue is unavailable). `investigations`
stays the fallback the template prints when it has no ids.

## Reading a prescription back

For "repeat last prescription" to restore structure, add the ids to
`PrescriptionResponse` / `PrescriptionDetailResponse`:

```jsonc
{
  "investigations": "CBC\nKFT",
  "investigation_ids": ["uuid", "uuid"]   // optional; older responses omit it
}
```

The pad also re-derives ids from the text against the catalogue, so this field
is an optimisation, not a requirement for correctness.

## Print template

The template can now tick an exact box:

```jinja
{% set selected = investigation_ids or [] %}
<input type="checkbox" {% if inv_id in selected %}checked{% endif %}>
```

and fall back to the text for legacy rows:

```jinja
{% for line in investigations.splitlines() if line.strip() %}
  <div>{{ line }}</div>
{% endfor %}
```

`EMPTY STOMACH` is an instruction, not a test; it should stay template artwork
or be modelled separately.

### Implemented: tick from the text (no schema change)

The API's `app/templates/prescription_print.html` now ticks the pre-printed
boxes from the `investigations` text, so this works before the catalogue or
`investigation_ids` exist. Each line is normalised (lower-case, whitespace
collapsed, commas/semicolons split) and matched against the printed label in
both `/print` and the live preview:

```jinja
{% set inv_selected = inv_lines | map('investigation_key') | list %}
<input type="checkbox"{% if 'cbc' in inv_selected %} checked{% endif %}>
```

The normaliser is `investigation_key` in `app/services/print.py`, registered as
a Jinja filter. A selection the paper has no box for (for example
`MRI lumbar spine`) prints under **Requested:** below the columns instead of
disappearing. `Eco-cardiography` / `echo-cardiography` are accepted as aliases
of `Echocardiography`.

Once `investigation_ids` is stored, prefer ids for the tick and keep the text
check as the fallback for freehand lines.



## Frontend behaviour while the endpoints are missing

- `GET /investigations` → **404**: the picker uses a built-in list
  (`src/features/investigations/catalog.ts`), writes text only, and sends no
  `investigation_ids`.
- The prescription save and preview continue to work unchanged; the call sites
  are `toApiRequest` / `toPreviewRequest` in
  `src/features/prescriptions/model.ts`.
- The picker is `src/features/prescriptions/RxInvestigationsPicker.tsx`; the
  catalogue fetch is `src/features/investigations/useInvestigations.ts`.
