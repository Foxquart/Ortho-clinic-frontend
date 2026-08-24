# Backend handover — everything outstanding (2026-08-23)

This lives in the FRONTEND repo on purpose: it is the list of everything the
frontend is already built against that the backend still has to ship. Four
buckets: uncommitted code in the API repo's working tree, production env vars,
AWS IAM grants, and one optional validation.

## 1. Code sitting UNCOMMITTED in the API repo's working tree — review, commit, deploy

The per-medicine prescription defaults + advice library, already implemented at
`~/programs/ortho-clinic-api` (the frontend ships against this contract and
degrades gracefully until it lands):

| File | What |
|---|---|
| `app/models/medicine.py` | 5 nullable `default_*` columns (dosage, frequency, duration_days, food_timing, instructions) |
| `app/models/advice.py` + `app/models/__init__.py` | new `AdvicePreset` (label, category, sort_order, is_active) |
| `app/schemas/medicine.py` | defaults on Create/Update/Response; food timing as `Literal["before","after","with"]` |
| `app/schemas/advice.py` | Create/Update/Response |
| `app/routers/advice.py` + `app/api/api.py` | `GET/POST /advice-presets`, `PATCH/DELETE /{id}` (reads any signed-in, writes admin) |
| `alembic/versions/b7e1a9f3c2d4_…` | the migration (runs on deploy; `down_revision = cab24ca2d00a`) |
| `app/scripts/seed.py` | 13 ortho advice presets + example defaults on two seed medicines; idempotent |

`ruff check app/` passes; app imports clean. The migration has NOT run against
a real database yet — its first run is yours.

### The contract the frontend consumes

- `MedicineResponse` gains the 5 nullable `default_*` fields; the pad pre-fills
  a row from them with "default — verify" provenance when a medicine is picked.
- `GET /advice-presets` → array of `{id, label, category|null, sort_order,
  is_active, created_at, updated_at}`, ordered category → sort_order → label,
  `?include_inactive=true` for admin UIs. Reads: any signed-in user. Writes
  (`POST` `{label, category?, sort_order?}` / `PATCH` / `DELETE`): admin.
- Selected advice labels are joined client-side (one per line) into the
  existing free-text `advice` on `POST /prescriptions` — **no prescription
  endpoint changes**.
- Frontend degrade: 404 on `/advice-presets` hides the picker and shows a calm
  "needs the latest backend" state on the admin screen; absent `default_*`
  fields just leave pad fields blank. Frontend can deploy first.

## 2. Production environment variables to set/verify

| Var | Value | Why |
|---|---|---|
| `SESSION_COOKIE_DOMAIN` | `.foxquart.com` | Frontend on `ortho-fe.foxquart.com` must READ the JS-visible `ortho_csrf` cookie set by `clinic-api.foxquart.com`; host-only cookies make every write 403 (`csrf_failed`). The code that threads this is already committed — the var makes it live. |
| `SESSION_COOKIE_SECURE` | `true` | Production is HTTPS. |
| `CORS_ORIGINS` | include `https://ortho-fe.foxquart.com` (and any other FE origin) | Browser preflights. |
| `EXTRACTION_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` | The nano model mishandles spoken dose notation ("one zero one" lost the night dose in live tests). Prompt fix is committed; the bigger free model is the belt to those braces. |
| `OPENROUTER_API_KEY` | (already set — verified live) | Dictation → prescription extraction. |
| `STT_LANGUAGE_CODE` | `en-IN` (already live — verify it survives redeploys) | `bn-IN` transcribes English speech phonetically into Bengali script; unusable for drug names. |

## 3. AWS IAM grants (console, no deploy needed — evaluated per request)

User `DibbayajyotiRoy` currently holds only `transcribe:StartStreamTranscription`.

1. **`translate:TranslateText`** (attach managed `TranslateReadOnly`) — until
   granted, `POST /speech/translate` (English→Bengali transcripts) returns 502
   with the exact missing-action message.
2. *(Optional, accuracy)* `transcribe:CreateVocabulary` / `ListVocabularies` /
   `GetVocabulary` — enables a custom vocabulary of the formulary's brand names
   (Zerodol SP, Shelcal, …) via `STT_VOCABULARY_NAME`, the real fix for
   drug-name mishearing.

## 4. Optional server-side validation

Frontend now requires `brand_name` on medicine create/edit (this practice
prescribes by brand). Server still accepts null; if you want parity:
`brand_name: str = Field(min_length=1, max_length=128)` on
`MedicineCreateRequest`.

## Verify after deploy

```bash
curl -s <base>/api/v1/medicines?page_size=1 | jq '.items[0]|keys|map(select(startswith("default")))'
curl -s -b <session> <base>/api/v1/advice-presets | jq length        # 13 on fresh seed
# from the browser on ortho-fe.foxquart.com after login:
#   document.cookie  → must show ortho_csrf=…  (else writes will 403)
```

---

## 5. Prescription pad — new clinical fields (frontend is being built against this)

Source of truth: the doctor's own handwritten pad (photo supplied 2026-08-24).
Its field order is **Patient + vitals → C/O → Clinical note → Diagnosis →
Instructions (1–4) → Medications (1–8) → Procedure → Consult → Follow up →
Signature**.

Six of those already exist on `Prescription`: `chief_complaint`, `notes`,
`diagnosis`, `advice`, `items`, `follow_up_date`. **Four things do not exist
anywhere** — not as columns, not in `PrescriptionCreateRequest`, not in
`app/templates/prescription_print.html`:

| Pad field | Status | Proposed column |
|---|---|---|
| BP, SpO₂, heart rate, weight (top-right block) | missing | `vitals_bp`, `vitals_spo2`, `vitals_pulse_bpm`, `vitals_weight_kg` |
| Procedure | missing | `procedure` |
| Consult | missing | `consult` |
| Investigations | **already collected by the frontend**, no column — currently folded into `notes` under an "Investigations:" heading (`model.ts:446–450`) | `investigations` |

### 5.1 Why prescription-level and not patient-level

A `Vitals` shape already exists client-side (`src/features/patients/vitals.ts`)
and is stored inside `PatientResponse.medical_history.vitals`. That is the
patient's *latest known* vitals. It is the wrong home for this: a printed
prescription must show what was measured **at that visit**, and it must not
change retroactively when the patient is weighed again next month. A
prescription is an immutable clinical document — the vitals belong on it.

### 5.2 Model — `app/models/prescription.py`

Add beside `follow_up_date` (line ~53):

```python
    vitals_bp: Mapped[str | None] = mapped_column(String(16), nullable=True)
    vitals_spo2: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    vitals_pulse_bpm: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    vitals_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    procedure: Mapped[str | None] = mapped_column(Text, nullable=True)
    consult: Mapped[str | None] = mapped_column(Text, nullable=True)
    investigations: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`vitals_bp` is a **string**, not two integers: it is written and read as
`120/80`, and a doctor may legitimately record `140/90 (right arm)`. Do not
parse it. The other three are numeric so they can be charted later.

### 5.3 Schemas — `app/schemas/prescription.py`

On `PrescriptionCreateRequest` and `PrescriptionResponse`:

```python
    vitals_bp: str | None = Field(default=None, max_length=16)
    vitals_spo2: int | None = Field(default=None, ge=0, le=100)
    vitals_pulse_bpm: int | None = Field(default=None, ge=20, le=300)
    vitals_weight_kg: Decimal | None = Field(default=None, ge=0, le=500, decimal_places=2)
    procedure: str | None = Field(default=None, max_length=2000)
    consult: str | None = Field(default=None, max_length=2000)
    investigations: str | None = Field(default=None, max_length=4000)
```

All optional — the pad routinely leaves Procedure as "NA" and vitals blank.

### 5.4 Migration

New Alembic revision after `b7e1a9f3c2d4`. Seven nullable columns, no backfill,
no data migration. Reversible with a plain `drop_column` each.

### 5.5 Print template — `app/templates/prescription_print.html`

Two changes:

1. **Vitals block, top right.** The handwritten pad puts `BP · SpO₂ · HR · Wt`
   on the same line as the patient, hard right. Add to `.patient-box`'s second
   `<div>`, or a third `<div>` — render only the values that are present, and
   omit the block entirely when all four are null. Suggested rendering:
   `BP 120/80 · SpO₂ 98% · HR 72 · 68 kg`.
2. **Procedure / Consult / Investigations** as `.clinical` sections, in the pad's
   order: Investigations after Diagnosis; Procedure and Consult after the
   medicines table, before Follow-up.

Also worth fixing while there: **`advice` should print as a numbered list.** The
pad writes Instructions as `(1) (2) (3) (4)`. `advice` is a single `Text` blob;
the frontend sends it newline-delimited. Split on newlines and render `<ol>`
rather than one `<p>`. No schema change needed.

### 5.6 Until the columns exist

The frontend collects all seven fields **now** and folds them into `notes`
under headings on submit, the same way `investigations` already works — so no
clinical data is lost while the backend catches up. Once these columns ship,
delete that fold in `src/features/prescriptions/model.ts` (`toApiRequest`) and
send the real fields. Grep for `FOLDED_INTO_NOTES` to find every place.
