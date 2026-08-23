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
