# Backend integration notes — verified against the live API

Captured **2026-08-08** against `http://localhost:8000` (base `http://localhost:8000/api/v1`),
backend repo `/home/roy/programs/ortho-clinic-api`, running in Docker
(`ortho-clinic-api-1` + `postgres:17-alpine` + `redis:7-alpine`), `APP_ENV=development`.

Everything in fenced blocks below is **real captured output** unless explicitly marked
`UNVERIFIED`. Where the shipped docs (`docs/api_reference.md`, `docs/frontend_spec.md`,
`docs/speech.md`) contradict the running server, the server wins and the discrepancy is
called out.

> **Read [§8 Gotchas](#8-gotchas) first.** Three of them will silently cost you an hour each.

---

## 0. TL;DR for the client implementer

| Thing | Value |
|---|---|
| Base URL | `http://localhost:8000/api/v1` |
| Auth | Cookie session, `credentials: "include"` on **every** fetch |
| Session cookie | `ortho_session` — HttpOnly, unreadable from JS |
| CSRF token source | **the `ortho_csrf` cookie value, read with `document.cookie`** |
| CSRF header | `X-CSRF-Token` |
| CSRF applies to | every non-GET/HEAD/OPTIONS/TRACE request under `/api/`, except `POST /api/v1/auth/login` |
| Error envelope | `{"error":{"code":…,"message":…,"details"?:…}}` |
| Pagination envelope | `{"items":[],"total":n,"page":n,"page_size":n,"pages":n}` |
| CORS origins allowed | `http://localhost:3000`, `http://localhost:5173`, `http://localhost:8000` |
| Speech WS | `ws://localhost:8000/api/v1/speech/stream` |

---

## 1. Auth & cookies

### 1.1 Cookie inventory

Both cookies are set **only** by `POST /auth/login` (and `ortho_csrf` additionally by
`GET /public/csrf`). Real `Set-Cookie` headers, verbatim:

```
set-cookie: ortho_session=26N7Vk8a_t39w2YCvsYC8m5n45sh9aTwkgaHfiBN1hk; HttpOnly; Max-Age=43200; Path=/; SameSite=lax
set-cookie: ortho_csrf=TIyjyq5BxZ-Z_J8I6ya3KwnngYlIWiBvhMwXLDQb76U; Max-Age=43200; Path=/; SameSite=lax
```

| Cookie | HttpOnly | SameSite | Secure | Path | Max-Age | Readable from JS |
|---|---|---|---|---|---|---|
| `ortho_session` | **yes** | `lax` | **no** (dev) | `/` | `43200` (12 h) | no |
| `ortho_csrf` | no | `lax` | **no** (dev) | `/` | `43200` (12 h) | **yes** |

Values are `secrets.token_urlsafe(32)` (43-char URL-safe base64, no padding).
Cookie names, `Secure` and `SameSite` are all configurable
(`SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `SESSION_COOKIE_SECURE`,
`SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_MAX_AGE_SECONDS`) — in this dev deployment
`SESSION_COOKIE_SECURE=false` and `SESSION_COOKIE_SAMESITE=lax`.

**`SameSite=lax` + no `Secure` means `localhost` and `127.0.0.1` are different sites.**
If the SPA is served from `http://127.0.0.1:5173` and hits the API at
`http://localhost:8000`, the browser silently drops the session cookie: login returns
200 and every subsequent request 401s. Both reference harnesses guard against this
explicitly by re-checking `/auth/me` after a successful login. Do the same.

There is **no server-side session sliding on read** in practice for the SQL store — a
`touch()` method exists on the store but nothing in the request path calls it, so the
12 h expiry is absolute from login. (Source: `app/security/session.py`, no caller of
`touch` outside the store itself.)

### 1.2 Login

```bash
curl -i -c c.txt -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:5173' \
  -d '{"username":"admin","password":"00"}'
```

Request body is JSON (not form-encoded): `username` (1–64 chars), `password` (1–128).
No CSRF header required. Response `200`:

```json
{
  "user": {
    "id": "df56031a-6127-423a-99df-f1a943a95bb0",
    "username": "admin",
    "email": "admin@orthoclinic.com",
    "full_name": "Administrator",
    "role": "admin",
    "is_active": true,
    "last_login_at": "2026-08-08T06:50:56.047911Z",
    "created_at": "2026-08-05T19:36:18.918737Z"
  },
  "message": "Login successful."
}
```

Bad credentials → `401`, and **no cookies are set or cleared**:

```json
{"error":{"code":"unauthorized","message":"Invalid username or password."}}
```

Seeded users (both share whatever `ADMIN_PASSWORD` is set to in `.env.docker`):
`admin` / role `admin`, `doctor` / role `doctor`. Role enum: `admin | doctor | staff`.

### 1.3 `GET /auth/me`

Returns the bare user object (**not** wrapped in `{"user": …}` the way login is):

```json
{"id":"df56031a-6127-423a-99df-f1a943a95bb0","username":"admin","email":"admin@orthoclinic.com","full_name":"Administrator","role":"admin","is_active":true,"last_login_at":"2026-08-08T06:50:56.047911Z","created_at":"2026-08-05T19:36:18.918737Z"}
```

Use it as the "am I logged in?" probe on app boot — it is a GET, so it needs no CSRF header.

### 1.4 401 behaviour

Status `401`, JSON envelope, **`Content-Type: application/json`**, and critically
**no `Set-Cookie` header — the server never clears cookies on 401**. The client must
clear its own in-memory auth state and (optionally) expire `ortho_csrf` itself.

Three distinct messages, all `code: "unauthorized"`:

```bash
# no cookie at all
$ curl -i http://localhost:8000/api/v1/auth/me
HTTP/1.1 401 Unauthorized
content-type: application/json

{"error":{"code":"unauthorized","message":"Not authenticated."}}
```

```bash
# cookie present but unknown / expired / revoked (this is what you get after logout too)
$ curl -i -H 'Cookie: ortho_session=garbage' http://localhost:8000/api/v1/auth/me
HTTP/1.1 401 Unauthorized

{"error":{"code":"unauthorized","message":"Session is invalid or has expired."}}
```

Third variant (source `app/dependencies/auth.py:57`, not reproduced live because I did
not deactivate a user): `{"error":{"code":"unauthorized","message":"Account is no longer active."}}`.

### 1.5 `GET /auth/csrf` vs `GET /public/csrf`

**These are not interchangeable, and `/auth/csrf` is a trap — see §2.2.**

| | `GET /auth/csrf` | `GET /public/csrf` |
|---|---|---|
| Requires a session | **yes** (401 otherwise) | no |
| Sets a cookie | **NO** | **yes** — `Set-Cookie: ortho_csrf=…` |
| Body | `{"csrf_token": "<64-hex SHA-256 hash>"}` | `{"csrf_token": "<43-char urlsafe token>"}` |
| Usable as `X-CSRF-Token` | **NO — always 403** | yes |
| When you need it | **never** | before the first public (logged-out) write, e.g. booking |

```bash
$ curl -i -b c.txt http://localhost:8000/api/v1/auth/csrf
HTTP/1.1 200 OK
content-type: application/json
# (note: NO set-cookie header)

{"csrf_token":"487bc9f13913b5cb92faeddc082ad127c05e38e10ac82ce8be6743011ed96e1c"}
```

```bash
$ curl -i http://localhost:8000/api/v1/public/csrf
HTTP/1.1 200 OK
set-cookie: ortho_csrf=S_laJHXKb0DBIbROi_vnDxsBuNm_oMKP_4xnayBCmFA; Max-Age=43200; Path=/; SameSite=lax

{"csrf_token":"S_laJHXKb0DBIbROi_vnDxsBuNm_oMKP_4xnayBCmFA"}
```

`docs/frontend_spec.md:177` describes `/auth/csrf` as "refresh the CSRF cookie". **It does
not set any cookie.** Verified above.

### 1.6 Logout

`POST /auth/logout` — needs both the session cookie and a valid `X-CSRF-Token`.
It revokes the server-side session **and** expires both cookies:

```
HTTP/1.1 200 OK
set-cookie: ortho_session=""; expires=Sat, 08 Aug 2026 07:52:59 GMT; Max-Age=0; Path=/; SameSite=lax
set-cookie: ortho_csrf=""; expires=Sat, 08 Aug 2026 07:52:59 GMT; Max-Age=0; Path=/; SameSite=lax

{"message":"Logged out successfully."}
```

---

## 2. CSRF

### 2.1 Exactly what is enforced

From `app/middleware/csrf.py` (read, not assumed):

- Header name: **`X-CSRF-Token`** (`CSRF_HEADER = "X-CSRF-Token"`, case-insensitive on the wire).
- Skipped when `request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}`.
- Skipped when `not request.url.path.startswith("/api/")` — so `/static/*`, `/uploads/*`,
  `/docs`, `/openapi.json` are outside CSRF entirely.
- Exempt paths: `EXEMPT_PATHS = {"/api/v1/auth/login"}` — compared after `.rstrip("/")`.
  **`POST /api/v1/auth/login` is genuinely the only exempt write.** Confirmed.
- Everything else that mutates — including **`POST /api/v1/public/appointments`**,
  **`POST /api/v1/uploads`**, **`POST /api/v1/speech/transcribe`**, and
  `POST /api/v1/auth/logout` — requires the header. All four verified live.

Validation logic, in order:
1. If neither `ortho_session` nor `ortho_csrf` cookie is present → reject.
2. If a session cookie resolves to a live session → accept the submitted header if it
   either (a) hashes to the session's stored CSRF hash, **or** (b) equals the current
   `ortho_csrf` cookie verbatim.
3. Otherwise → the header must equal the `ortho_csrf` cookie verbatim (double-submit).

A `PUT`/`DELETE` is treated exactly like a `POST`/`PATCH` (anything not in `SAFE_METHODS`).

`CSRF_ENABLED=true` exists in `.env` and in `Settings`, but **nothing reads it** —
`grep -rn csrf_enabled app/` matches only its declaration in `app/core/config.py:53`.
CSRF cannot be turned off by configuration.

### 2.2 The value you must send

**Read the `ortho_csrf` cookie. Never use the body of `GET /auth/csrf`.**

`/auth/csrf` returns `session.csrf_token_hash` (the SHA-256 hex digest stored in the DB),
not the raw token. The middleware compares `hash_token(submitted)` against that hash, so
submitting the hash hashes it a second time and never matches.

`docs/api_reference.md:8` says *"must send the CSRF token obtained from
`GET /api/v1/auth/csrf`"*. **That is wrong and produces a guaranteed 403.** All three
reference harnesses (`playground.html:350`, `site.html:341`, `speech.html:236`) ignore
`/auth/csrf` and read the cookie:

```js
function csrfToken() {
  const m = document.cookie.split("; ").find(c => c.startsWith("ortho_csrf="));
  return m ? m.split("=")[1] : null;
}
```

### 2.3 Succeeding sequence (real)

```bash
curl -s -c c.txt -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"00"}'

TOK=$(grep ortho_csrf c.txt | awk '{print $7}')      # the COOKIE value

curl -i -b c.txt -X POST http://localhost:8000/api/v1/patients \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $TOK" \
  -d '{"first_name":"ZZDisposable","last_name":"ProtoTest","phone":"9990001111","gender":"male","date_of_birth":"1990-01-01"}'
```

```
HTTP/1.1 201 Created
content-type: application/json

{"id":"612a3a43-c5c4-482c-9f4b-27c6adb1f54a","first_name":"ZZDisposable","last_name":"ProtoTest","date_of_birth":"1990-01-01","gender":"male","phone":"9990001111","email":null,"address":null,"city":null,"blood_group":null,"allergies":null,"medical_history":null,"emergency_contact":null,"is_active":true,"created_at":"2026-08-08T07:25:58.944992Z","updated_at":"2026-08-08T07:25:58.944992Z"}
```

### 2.4 Failing sequences (real)

```bash
# (a) header omitted entirely
curl -i -b c.txt -X POST http://localhost:8000/api/v1/patients \
  -H "Content-Type: application/json" -d '{"first_name":"x"}'
```
```
HTTP/1.1 403 Forbidden
content-type: application/json

{"error":{"code":"csrf_failed","message":"CSRF validation failed."}}
```

```bash
# (b) header set to the body of GET /auth/csrf  <-- the trap
AUTH_CSRF=$(curl -s -b c.txt http://localhost:8000/api/v1/auth/csrf | python3 -c "import json,sys;print(json.load(sys.stdin)['csrf_token'])")
curl -i -b c.txt -X POST http://localhost:8000/api/v1/patients \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $AUTH_CSRF" -d '{"first_name":"x"}'
```
```
HTTP/1.1 403 Forbidden
content-type: application/json

{"error":{"code":"csrf_failed","message":"CSRF validation failed."}}
```

Note the CSRF rejection happens **in middleware, before routing and before body
validation** — a 403 `csrf_failed` tells you nothing about whether your payload was valid.
It also short-circuits the 405 handler: a bad method on a bad path still gets CSRF-checked first.

### 2.5 Public (logged-out) writes

```bash
PUB=$(curl -s -c p.txt http://localhost:8000/api/v1/public/csrf | python3 -c "import json,sys;print(json.load(sys.stdin)['csrf_token'])")
curl -i -b p.txt -X POST http://localhost:8000/api/v1/public/appointments \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $PUB" -d '{...}'
```

Without the header the same call returns `403 csrf_failed` (verified). Call
`GET /public/csrf` once on public-page boot if `document.cookie` has no `ortho_csrf`.

---

## 3. Errors

### 3.1 Envelope

```
{"error": {"code": "<machine_code>", "message": "<human sentence>", "details"?: <any>}}
```

**`details` is present only when the raiser supplied it.** In practice it appears on
`validation_error` (422) and nowhere else in anything I could produce. Treat it as optional.

Codes seen live: `unauthorized`, `forbidden`, `csrf_failed`, `not_found`, `conflict`,
`bad_request`, `validation_error`. Declared in source but not reproduced here:
`rate_limited` (429), `upstream_error` (502), `database_error` (500), `internal_error` (500).

### 3.2 Real bodies

**401** (see §1.4):
```json
{"error":{"code":"unauthorized","message":"Not authenticated."}}
{"error":{"code":"unauthorized","message":"Session is invalid or has expired."}}
{"error":{"code":"unauthorized","message":"Invalid username or password."}}
```

**403 — role forbidden** (captured while logged in as the seeded `doctor` user hitting an
admin-only route; `GET /users`, `POST /users` and `GET /audit-logs` all produced it):
```json
{"error":{"code":"forbidden","message":"Administrator privileges are required."}}
```
Other `forbidden` messages exist in source: `"Doctor privileges are required."`
(`require_doctor`, i.e. role `staff` hitting speech/prescription/patient-write routes) and
`"You do not have permission to perform this action."` (generic `require_role`) —
**UNVERIFIED live**, no `staff` user is seeded.

**403 — CSRF** (note: *different* `code`, same status; branch on `code`, not status):
```json
{"error":{"code":"csrf_failed","message":"CSRF validation failed."}}
```

**404**:
```json
{"error":{"code":"not_found","message":"Patient with id 00000000-0000-0000-0000-000000000000 was not found."}}
{"error":{"code":"not_found","message":"Page with slug 'nope' was not found."}}
```

**409** — two flavours. Service-raised conflicts carry a useful message:
```json
{"error":{"code":"conflict","message":"A patient with phone 9990001111 already exists (id: 612a3a43-c5c4-482c-9f4b-27c6adb1f54a)."}}
{"error":{"code":"conflict","message":"The requested time slot is already booked."}}
```
…while a DB `IntegrityError` leaking through the global handler gives you nothing:
```json
{"error":{"code":"conflict","message":"Database integrity constraint violated."}}
```
That second form is how a *missing required field* surfaces on some creates — see §8.4.
Do not render it to users as "already exists".

**422** — `details` is an array of `{location, message}`. `location` is the pydantic `loc`
tuple joined with `.`, prefixed by `body` / `query` / `path`:
```json
{"error":{"code":"validation_error","message":"The provided data failed validation.","details":[{"location":"body.first_name","message":"Field required"},{"location":"body.last_name","message":"Field required"}]}}
{"error":{"code":"validation_error","message":"The provided data failed validation.","details":[{"location":"path.patient_id","message":"Input should be a valid UUID, invalid character: found `n` at 1"}]}}
{"error":{"code":"validation_error","message":"The provided data failed validation.","details":[{"location":"query.page_size","message":"Input should be less than or equal to 200"}]}}
```

**400** — `bad_request`, no `details`:
```json
{"error":{"code":"bad_request","message":"File type '.txt' is not allowed."}}
{"error":{"code":"bad_request","message":"Audio is 44100 Hz but the stream is configured for 16000 Hz. Resample it or set STT_SAMPLE_RATE_HZ."}}
{"error":{"code":"bad_request","message":"The requested time is outside the clinic's availability."}}
```

**405 — the one endpoint shape that is NOT enveloped.** FastAPI's built-in handler is not
overridden, so you get raw `{"detail": …}`:
```
$ curl -i -b c.txt -X DELETE -H "X-CSRF-Token: $TOK" \
    http://localhost:8000/api/v1/patients/00000000-0000-0000-0000-000000000000
HTTP/1.1 405 Method Not Allowed
allow: GET
content-type: application/json

{"detail":"Method Not Allowed"}
```
Your error-normalising layer must handle `body.error` being `undefined`. Same applies to
any other Starlette-level `HTTPException` (there is no `@app.exception_handler(HTTPException)`).

### 3.3 `X-Correlation-Id` — **it is never returned**

`docs/frontend_spec.md:164` claims *"`X-Correlation-Id` is returned on every response"*.
**It is not.** `grep -rn Correlation app/ --include=*.py` yields exactly two hits:

- `app/main.py:76` — `expose_headers=["X-Correlation-Id"]` on the CORS middleware
- `app/middleware/request_log.py:25` — `request.headers.get("X-Correlation-Id") or str(uuid.uuid4())`

The middleware **reads** it from the request (or invents one), stashes it on
`request.state`, logs it, and never writes it to the response. Live proof:

```
$ curl -D- -o /dev/null -b c.txt -H 'X-Correlation-Id: my-test-id' http://localhost:8000/api/v1/health
HTTP/1.1 200 OK
date: Sat, 08 Aug 2026 07:18:07 GMT
server: uvicorn
content-length: 97
content-type: application/json
```

Header casing when *sending* is `X-Correlation-Id` (that is the exact string the middleware
looks up; HTTP header lookup is case-insensitive in Starlette so any casing works).
**Practical advice: generate the id client-side and send it on every request** — it will be
honoured in the server logs (`{"correlation_id": "..."}` in the JSON log line), which is
the only place it ever appears. Do not try to read it off the response.

### 3.4 CORS, verified

Allowed origins in this deployment: `http://localhost:3000`, `http://localhost:5173`,
`http://localhost:8000`. `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`.

```
$ curl -i -X OPTIONS http://localhost:8000/api/v1/patients \
    -H 'Origin: http://localhost:5173' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type,x-csrf-token'
HTTP/1.1 200 OK
vary: Origin
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-max-age: 600
access-control-allow-credentials: true
access-control-allow-origin: http://localhost:5173
access-control-allow-headers: content-type,x-csrf-token
```

A disallowed origin gets `400 Bad Request` on preflight with **no** `access-control-allow-origin`.
Simple GETs from a disallowed origin still return 200 with no `ACAO`, so the browser blocks
the read. Vite dev on `:5173` and `:3000` both work out of the box.

---

## 4. Speech

### 4.1 `GET /speech/config`

Requires an authenticated `admin` or `doctor` (`require_doctor`); `staff` gets 403.
Real response:

```json
{"provider":"aws","sample_rate_hz":16000,"media_encoding":"pcm","channels":1,"bits_per_sample":16,"language_code":"bn-IN","identify_multiple_languages":false,"language_options":["bn-IN","en-IN"],"vocabulary_name":null,"websocket_path":"/api/v1/speech/stream"}
```

Field notes (`app/schemas/speech.py`, `app/routers/speech.py:63`):
- `channels` (always `1`) and `bits_per_sample` (always `16`) are schema constants, not settings.
- `language_code` is `null` when `identify_multiple_languages` is `true` — the router
  deliberately nulls it. Render "detect among `language_options`" in that case.
- `websocket_path` is a hardcoded constant `"/api/v1/speech/stream"` — it is a *path*, not
  a URL. Build the socket URL yourself (§4.2).
- `vocabulary_name` is `null` here, meaning drug brand names are unassisted.

Read this **before** creating the `AudioContext` and use `sample_rate_hz` as the context's
`sampleRate`. The server validates rather than resamples (§4.7).

### 4.2 WebSocket: URL, auth, close codes

URL: swap the scheme on your API base and append `/speech/stream`. The reference does exactly
this (`speech.html:361`):

```js
const url = absoluteBase().replace(/^http/, "ws") + "/speech/stream";
// -> ws://localhost:8000/api/v1/speech/stream
```

**Authentication is the `ortho_session` cookie on the handshake, and nothing else.**
The handshake is a plain GET, so the CSRF middleware skips it and **no `X-CSRF-Token` is
needed or possible** (the browser `WebSocket` constructor cannot set headers anyway).
Because it rides on cookies, the socket only authenticates if the page origin can send
`ortho_session` — i.e. the same `localhost`-vs-`127.0.0.1` rule as §1.1 applies.

The server resolves the cookie *before* `accept()` (`app/routers/speech.py:176`) so no
transcription is ever billed for an anonymous caller.

#### The failure mode is **not** 1008 — this contradicts `docs/speech.md`

`docs/speech.md:26` says an unauthenticated socket "is closed with 1008 **before** the
socket is accepted". The code does call `await websocket.close(code=1008)` before accept —
but calling `close()` before `accept()` makes ASGI/uvicorn reject the **HTTP handshake**
instead of sending a WebSocket close frame. There is no WebSocket connection, so there is
no 1008. Real capture with the `websockets` client:

```
[NO-COOKIE]  handshake HTTP failure: server rejected WebSocket connection: HTTP 403
[BAD-COOKIE] handshake HTTP failure: server rejected WebSocket connection: HTTP 403
[AUTHED]     CONNECTED (handshake accepted)
[AUTHED]     first server message: {"type":"ready","provider":"aws","sample_rate_hz":16000,"media_encoding":"pcm"}
[AUTHED]     <- {"type":"closed"}
[AUTHED]     closed code=1000 reason=''
```

**Consequence for a browser client:** an unauthenticated socket fires `onerror` and then
`onclose` with **`code === 1006`** (abnormal closure) and `wasClean === false`. The browser
never sees the 403 status — the WebSocket API does not expose handshake status codes.

`speech.html:367` has `ev.code === 1008 ? "Auth rejected" : "Mic idle"` — **that branch can
never fire.** Do not copy it. Detect auth failure as: socket closed with `code === 1006`
and we never received a `ready` message. (The 1006-in-browser claim follows from the
verified HTTP-403 handshake rejection plus the WebSocket spec; I verified the 403 with a
non-browser client, so the specific browser code is marked **UNVERIFIED-in-browser**.)

Close codes actually observed:

| Situation | Observed |
|---|---|
| Unauthenticated / bad session cookie | HTTP `403` on handshake (browser: `onclose` 1006) |
| Normal completion after `{"type":"stop"}` | server sends `{"type":"closed"}`, then closes with **`1000`** |
| Provider error | server sends `{"type":"error","message":…}`, then closes (finally-block `close()`) |

### 4.3 Message types, both directions

Taken from `app/routers/speech.py` and `app/services/speech/base.py`.

**Client → server** (exactly two kinds):

| Kind | Payload |
|---|---|
| binary frame | raw little-endian 16-bit mono PCM at `sample_rate_hz`. Any frame size. |
| text frame | `{"type":"stop"}` — the **only** text message the server understands |

Any other text is JSON-parsed and ignored; malformed JSON is swallowed
(`contextlib.suppress(json.JSONDecodeError)`). There is no ping/keepalive protocol and no
per-socket language override — the socket always uses the server's configured default.
(`speech.html` says this explicitly in its UI copy.) The server queues frames with
`asyncio.Queue(maxsize=256)`, so if you flood it, `await frames.put(data)` applies
backpressure rather than dropping.

**Server → client** (all JSON text frames):

| `type` | Full field set | When |
|---|---|---|
| `ready` | `type`, `provider`, `sample_rate_hz`, `media_encoding` | immediately after `accept()`, before any audio |
| `transcript` | `type`, `text`, `is_final`, `confidence`, `language_code`, `start_time`, `end_time` | per provider chunk |
| `error` | `type`, `message` | on `SpeechProviderError` (e.g. AWS/IAM failure) |
| `closed` | `type` (only) | provider stream ended cleanly |

Verbatim `ready` frame captured live:
```json
{"type":"ready","provider":"aws","sample_rate_hz":16000,"media_encoding":"pcm"}
```

The `transcript` frame is `{"type": "transcript", **chunk.as_dict()}` where `as_dict()` is
(`app/services/speech/base.py:36`):

```python
def as_dict(self) -> dict[str, object]:
    return {
        "text": self.text,
        "is_final": self.is_final,
        "confidence": self.confidence,
        "language_code": self.language_code,
        "start_time": self.start_time,
        "end_time": self.end_time,
    }
```

All six keys are **always present**; `confidence`, `language_code`, `start_time`,
`end_time` may be `null`. `start_time` / `end_time` are floats in seconds.

**Only `is_final: true` chunks are stable.** Partials are hypotheses that get replaced —
render them in a separate, visually-distinct element and remove that element when the next
final arrives (that is exactly what `renderPartial` / `renderFinal` do in the reference).

> I could not capture a non-empty `transcript` frame: no TTS is available in this
> environment and a synthesised sine tone yields zero chunks. The field set above is read
> straight from the source and is exact; **sample transcript *values* are UNVERIFIED**.
> AWS credentials do work — a 1 s tone streamed end-to-end returned `closed` with no error.

### 4.4 The audio pipeline, verbatim from `speech.html`

The reference uses **`AudioWorklet` as the primary path** with a **`ScriptProcessor`
fallback** in a `try`/`catch` (`speech.html:398-408`). Copy both.

**AudioContext** — created at the *server's* rate, not the hardware default:

```js
let targetRate = 16000;          // overwritten from GET /speech/config
targetRate = cfg.data.sample_rate_hz || 16000;

mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
});

audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: targetRate });
const source = audioCtx.createMediaStreamSource(mediaStream);
```

**Worklet source** (verbatim, `speech.html:324-333`) — it is a template string turned into
a Blob URL, so there is no separate `.js` file to serve:

```js
const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(new Float32Array(ch));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;
```

**Wiring, including the fallback** (verbatim, `speech.html:398-408`):

```js
try {
  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
  await audioCtx.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);
  workletNode = new AudioWorkletNode(audioCtx, "pcm-tap");
  workletNode.port.onmessage = e => pushFrame(e.data);
} catch {
  // Older browsers: ScriptProcessor is deprecated but still works everywhere.
  workletNode = audioCtx.createScriptProcessor(4096, 1, 1);
  workletNode.onaudioprocess = e => pushFrame(e.inputBuffer.getChannelData(0));
}
```

**The zero-gain routing trick** (verbatim, `speech.html:411-416`) — without connecting the
graph to `destination`, the worklet is never pulled and you get silence; without the muted
gain node, the doctor hears their own voice echoed:

```js
// Route through a muted gain node: the graph must reach the destination for
// the tap to be pulled, but we must not play the mic back as an echo.
const mute = audioCtx.createGain();
mute.gain.value = 0;
source.connect(workletNode);
workletNode.connect(mute);
mute.connect(audioCtx.destination);
```

**Float32 → Int16 conversion** (verbatim, `speech.html:301-308`) — note the asymmetric
`0x8000` / `0x7fff` scaling, which is the correct full-scale mapping:

```js
function floatTo16BitPCM(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
```

**Defensive resample** (verbatim, `speech.html:311-322`) — some browsers ignore the
requested `sampleRate` and hand you 48 kHz anyway; this linear resampler is the safety net.
It is a no-op when the rates match:

```js
// Linear resample, used only when the browser refuses the requested rate.
function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = (input[idx] || 0) * (1 - frac) + (input[idx + 1] || 0) * frac;
  }
  return out;
}
```

**Send path** (verbatim, `speech.html:385-396`; the level meter is RMS of the raw frame):

```js
const pushFrame = f32 => {
  let sum = 0;
  for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
  $("level").style.width = Math.min(100, Math.sqrt(sum / f32.length) * 320) + "%";

  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const pcm = floatTo16BitPCM(resample(f32, audioCtx.sampleRate, targetRate));
  socket.send(pcm.buffer);
  sentBytes += pcm.buffer.byteLength;
};
```

Also set `socket.binaryType = "arraybuffer"` (`speech.html:363`) and **open the socket
before starting to push frames**.

#### Frame / chunk sizes

| Path | Frame size | Bytes on the wire | Duration @ 16 kHz |
|---|---|---|---|
| `AudioWorklet` (`pcm-tap`) | **128 samples** — fixed by the Web Audio spec (`RENDER_QUANTUM_SIZE`); the worklet forwards one render quantum per `process()` call | 256 B | **8 ms** |
| `ScriptProcessor` fallback | **4096 samples** — the literal in `createScriptProcessor(4096, 1, 1)` | 8192 B | **256 ms** |
| `POST /speech/transcribe` server-side chunking | 8192 bytes = 4096 samples (`iter_frames(pcm, chunk_bytes=8192)`) | 8192 B | 256 ms |

The worklet path therefore sends **one WebSocket message every 8 ms** (~125 msg/s, ~32 kB/s).
That works but is chatty; if you want fewer sends, buffer worklet frames client-side to
~1024–4096 samples before calling `socket.send`. The server imposes no minimum frame size
(`await frames.put(data)` for any non-empty binary payload).

**Stopping** (`speech.html:422-433`) — send the stop message, then give the provider time to
flush finals before closing:

```js
if (socket && socket.readyState === WebSocket.OPEN) {
  socket.send(JSON.stringify({ type: "stop" }));
  if (!fromSocket) setTimeout(() => socket && socket.close(), 1500);
}
if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
```

`getUserMedia` only works on `https://` or on `localhost` — over a LAN IP the browser blocks
the mic outright. That is another reason to use `localhost` everywhere.

### 4.5 `POST /speech/transcribe`

- Multipart field name: **`audio`** (not `file`). Verified: sending `file=` returns
  `422` with `{"location":"body.audio","message":"Field required"}`.
- Requires session + **`X-CSRF-Token`** (it is a POST). Without it: `403 csrf_failed`.
- Requires role `admin` or `doctor`.
- Query overrides: `language_code` (string, e.g. `en-IN`) and
  `identify_multiple_languages` (bool). Passing `language_code` **forces**
  `identify_multiple_languages = false` (`app/routers/speech.py:105-106`), so the two are
  mutually exclusive with `language_code` winning.

Accepted formats:
- RIFF/WAVE, **mono, 16-bit, exactly `sample_rate_hz`** — parsed with the stdlib `wave`
  module, no ffmpeg in the image.
- Anything not starting with `RIFF` is passed through as **raw little-endian 16-bit PCM**
  with no validation at all. Verified: a headerless `.pcm` was accepted and reported
  `duration_seconds: 1.0`.

Real success response (1 s 16 kHz mono tone — no speech, hence empty transcript; the
*shape* is real):

```bash
curl -b c.txt -H "X-CSRF-Token: $TOK" -F "audio=@ok16k.wav" \
  http://localhost:8000/api/v1/speech/transcribe
```
```json
{"provider":"aws","transcript":"","chunks":[],"language_code":null,"duration_seconds":1.0}
```

`transcript` is `" ".join(text of final chunks).strip()`; `chunks` contains **both partials
and finals** with the same six fields as the WebSocket `transcript` message; `language_code`
is the first non-null `language_code` among the finals; `duration_seconds` is computed
as `len(pcm) / (sample_rate_hz * 2)` rounded to 2 dp.

Real error responses:

```json
{"error":{"code":"bad_request","message":"The uploaded audio is empty."}}
{"error":{"code":"bad_request","message":"Audio must be mono; this file has 2 channels. Re-record or downmix before uploading."}}
{"error":{"code":"bad_request","message":"Audio is 44100 Hz but the stream is configured for 16000 Hz. Resample it or set STT_SAMPLE_RATE_HZ."}}
```

Source also produces (**UNVERIFIED live**):
`"Audio must be 16-bit PCM; this file is 8-bit."`,
`"Could not read the WAV file: <wave.Error>"`, and a length guard
`"Recording is Ns; the limit is 300s. Use the streaming endpoint for longer audio."`
(`STT_MAX_UPLOAD_SECONDS=300`). AWS failures map to `502 upstream_error` carrying AWS's
own message.

Handy conversion for the T1–T10 set:
`ffmpeg -i in.m4a -ac 1 -ar 16000 -sample_fmt s16 t1.wav`

### 4.6 Sample-rate mismatch behaviour

**The backend validates; it never resamples.** For a WAV upload, `pcm_from_upload`
(`app/services/speech/registry.py:94`) compares `wav.getframerate()` against
`options.sample_rate_hz` and raises → **`400 bad_request`** with the actual rate in the
message (captured above). Rationale in the source comment: *"Transcribe silently produces
garbage rather than erroring when the declared sample rate is wrong."*

**For the WebSocket and for raw PCM uploads there is no rate check at all** — the server
cannot see a header. If your `AudioContext` gave you 48 kHz and you stream it unresampled,
you get no error and no useful transcript, just pitch-shifted garbage. This is exactly why
`speech.html` carries the `resample()` helper and always calls
`resample(f32, audioCtx.sampleRate, targetRate)` rather than trusting the requested rate.
**Always compare `audioCtx.sampleRate` against `sample_rate_hz` at runtime.**

---

## 5. Printing

Two endpoints over the same rendered document. Both are `GET`, both require a login
(`require_login` — any role, including `staff`), both are CSRF-free.

| | `GET /prescriptions/{id}/print` | `GET /prescriptions/{id}/print/view` |
|---|---|---|
| `content-type` | `application/json` | `text/html; charset=utf-8` |
| Body | `{"prescription_id": "<uuid>", "html": "<!DOCTYPE html>…"}` | the raw HTML document |
| Size (same Rx) | 4660 B (JSON-escaped) | 4413 B |
| Use for | embedding / preview inside the SPA | opening in a tab to print |

```
$ curl -i -b c.txt http://localhost:8000/api/v1/prescriptions/15c11126-.../print
HTTP/1.1 200 OK
content-length: 4660
content-type: application/json

{"prescription_id":"15c11126-f62f-491e-a9de-7dfebeb4300f","html":"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n …"}
```

```
$ curl -i -b c.txt http://localhost:8000/api/v1/prescriptions/15c11126-.../print/view
HTTP/1.1 200 OK
content-length: 4413
content-type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
…
```

The HTML is **fully self-contained** — one inline `<style>` block, no external CSS, no JS,
no remote fonts. It is A4-sized (`width: 210mm; min-height: 297mm`) and carries a print
media query that strips the shadow and page chrome:

```css
@media print {
  body { background: #fff; }
  .page { box-shadow: none; width: auto; min-height: auto; padding: 0; }
  @page { size: A4; margin: 12mm 14mm; }
}
```

Content is rendered server-side from clinic settings + doctor profile + patient + items
(Jinja2, `app/templates/prescription_print.html`), including the `Rx` masthead, the item
table, the signature block and the footer. There is **no PDF endpoint** — "Save as PDF"
means the browser's print dialog.

### Recommended SPA trigger

Use `/print/view` and `window.open`, exactly as `playground.html:705` does:

```js
window.open(`${BASE}/prescriptions/${id}/print/view`, "_blank");
```

This works because the request is a top-level GET navigation and `SameSite=lax` **does**
send the session cookie on top-level GETs. The user then hits Ctrl-P / Cmd-P.

If you want the print dialog to open automatically, fetch `/print` and write the `html`
into a hidden same-origin iframe, then call `iframe.contentWindow.print()`. Do **not**
point an iframe `src` at `/print/view` and call `print()` immediately — you will race the
load. **UNVERIFIED**: I did not exercise the iframe path in a browser.

---

## 6. Uploads

`POST /api/v1/uploads`

- Multipart field name: **`file`**. (Note: `/speech/transcribe` uses `audio` — they differ.)
  Wrong field name → `422` with `{"location":"body.file","message":"Field required"}`.
- **No authentication is required.** The route has no `Depends(require_…)`
  (`app/routers/system.py:15`). Verified live: uploaded successfully with **only** a
  `ortho_csrf` cookie from `/public/csrf`, no session at all.
- **CSRF is required** (it is a POST under `/api/`).
- Allowed extensions (by filename suffix, lowercased — **content is never sniffed**):
  `.png .jpg .jpeg .gif .webp .svg .pdf`
- Size limit: **5 MB** (`MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024`). Enforced via
  `upload.size`, which Starlette may leave `None` for chunked uploads — in that case the
  check is skipped. Treat the limit as advisory and validate client-side too.
- Returns `200` (not 201).

```bash
curl -i -b p.txt -X POST http://localhost:8000/api/v1/uploads \
  -H "X-CSRF-Token: $PUB" -F "file=@tiny.png"
```
```
HTTP/1.1 200 OK
content-type: application/json

{"url":"http://localhost:8000/uploads/14/5fbdf34483a64770970acf7e12c77b4d.png"}
```

Bad extension:
```json
{"error":{"code":"bad_request","message":"File type '.txt' is not allowed."}}
```

### Building the display URL

**`url` is already absolute — do not prefix it.** It is built as
`f"{PUBLIC_BASE_URL.rstrip('/')}/uploads/{dir}/{filename}"` with
`PUBLIC_BASE_URL=http://localhost:8000`. Files are served by a `StaticFiles` mount at
`/uploads` (i.e. **not** under `/api/v1`), which is outside CSRF and needs no auth.

Two traps:
1. In any deployment where `PUBLIC_BASE_URL` does not match the browser's view of the API
   (container behind a proxy, LAN IP, etc.) the returned absolute URL is wrong. If you hit
   that, keep only the path portion and re-prefix with your own API origin.
2. The path segment that *looks* like a year is not one. `app/storage/service.py:33` is
   `year = str(uuid.uuid4().int)[:2]` — the first two digits of a random UUID integer.
   It is a random 1–2 character shard directory. Never parse meaning out of it; always use
   the returned `url` verbatim.

---

## 7. Public site

All of these are unauthenticated. Only the booking POST needs CSRF.

### `GET /public/portfolio` — one aggregate call for the whole site

Returns `{"pages": [...], "services": [...], "gallery": [...], "testimonials": [...]}`,
all filtered to published/active. Real element shapes:

```json
{
  "id": "b97baf48-cd9e-4643-821f-d508858a5c8a",
  "slug": "home",
  "title": "Welcome to OrthoClinic",
  "subtitle": "Expert orthopedic care for every age",
  "content": { "sections": [ { "heading": "Compassionate care, proven results", "body": "..." },
                             { "heading": "Why choose us", "body": "..." } ] },
  "hero_image_url": null,
  "meta_title": null,
  "meta_description": null,
  "is_published": true,
  "sort_order": 1,
  "updated_at": "2026-08-05T19:36:18.918737Z"
}
```

```json
{
  "id": "dbcea9f3-3864-4ec6-aba1-4275c852989c",
  "title": "Joint Replacement Surgery",
  "description": "Knee, hip and shoulder replacement with modern techniques.",
  "icon_name": "bone",
  "is_active": true,
  "sort_order": 1
}
```

```json
{
  "id": "2504f795-46cc-4bc1-a7cb-aaa534652695",
  "author_name": "Ramesh Kumar",
  "author_role": "Patient",
  "content": "Recovered from a knee replacement within months. Excellent care!",
  "rating": 5,
  "is_published": true,
  "sort_order": 1
}
```

`gallery` was **empty (`[]`)** in the seed. Its element shape is therefore **UNVERIFIED**;
`site.html:480` reads `g.image_url` and `g.caption`, so assume at least
`{id, image_url, caption, is_published, sort_order}`.

`content` is free-form JSONB — the seed uses `{"sections":[{"heading","body"}]}` but the
schema is `dict[str, Any]`. Render defensively.

`sort_order` exists on pages / services / gallery / testimonials — **sort by it yourself**;
the aggregate does not guarantee ordering beyond the repository default.

### `GET /public/pages/{slug}`

Same shape as a `pages` element. Unknown slug → `404`:
```json
{"error":{"code":"not_found","message":"Page with slug 'nope' was not found."}}
```
Seeded slugs: `home`, `about`, `services`.

### `GET /public/clinic`

```json
{"clinic_name":"OrthoClinic","tagline":"Expert Orthopedic Care","phone":"+91 98765 43210","alternate_phone":null,"email":"contact@orthoclinic.com","address":"12 MG Road, Indiranagar","city":"Bengaluru","postal_code":"560038","website_url":"https://orthoclinic.example.com","logo_url":null,"working_hours":null,"footer_text":null,"currency":"₹","registration_number":null,"google_maps_url":null,"updated_at":"2026-08-05T19:36:18.918737Z"}
```

Note there is **no `hours_display` field** — `site.html:504` reads `c.hours_display` and
always renders empty. Use `working_hours` (JSON, `null` in the seed) or derive the display
string from `/public/availability`.

### `GET /public/doctor`

```json
{"full_name":"Dr. John Carter","specialization":"Orthopedic Surgery","qualifications":"MBBS, MS (Ortho), Fellowship in Joint Replacement","registration_number":"KMC-123456","experience_years":15,"bio":"Board-certified orthopedic surgeon with 15 years of experience...","photo_url":null,"signature_image_url":null}
```

No `id` field. It is a singleton (`get_or_create_doctor_profile`), so it never 404s.

### `GET /public/availability`

Bare array (no pagination envelope), **active blocks only**:

```json
[{"id":"19df0880-196a-4245-90df-2b02f9ca171f","day_of_week":"monday","start_time":"16:00:00","end_time":"20:00:00","is_active":true},{"id":"00344b48-238f-44e9-9817-7db09e0bfbfd","day_of_week":"saturday","start_time":"17:00:00","end_time":"21:00:00","is_active":true},{"id":"5a524534-808d-4ae8-92e5-8368ae941fc0","day_of_week":"wednesday","start_time":"10:00:00","end_time":"13:00:00","is_active":true}]
```

`day_of_week` is a lowercase string enum: `monday … sunday`. Times are `HH:MM:SS` strings
with **no timezone and no date** — clinic-local wall clock. The array is **not** in weekday
order (monday, saturday, wednesday above); sort it yourself.

### `GET /public/slots?date=YYYY-MM-DD`

`date` is **required**. Bare array of 30-minute slots derived from that weekday's
availability, **excluding already-booked ones**:

```json
[{"date":"2026-08-10","start_time":"16:00:00","end_time":"16:30:00","status":"available"}, …]
```

A day with no availability returns `[]` (not 404). Missing/invalid `date` → `422`:
```json
{"error":{"code":"validation_error","message":"The provided data failed validation.","details":[{"location":"query.date","message":"Field required"}]}}
{"error":{"code":"validation_error","message":"The provided data failed validation.","details":[{"location":"query.date","message":"Input should be a valid date or datetime, input is too short"}]}}
```

Slot length is fixed at 30 minutes in this deployment (observed across every block).

### `POST /public/appointments`

Schema `AppointmentCreateByPatientRequest` (`app/schemas/appointment.py:66`):

| Field | Type | Required | Constraint |
|---|---|---|---|
| `patient_first_name` | string | **yes** | 1–64 chars |
| `patient_last_name` | string | **yes** | 1–64 chars |
| `patient_phone` | string | **yes** | 6–20 chars |
| `appointment_date` | `YYYY-MM-DD` | **yes** | — |
| `start_time` | `HH:MM:SS` | **yes** | — |
| `reason` | string \| null | no | ≤ 512 chars |

There is **no** `email`, no `notes`, no `patient_id`, no `source`. `end_time` is computed
server-side (+30 min). The patient is find-or-created by normalised phone, and the doctor is
resolved as the oldest active `doctor`-or-`admin` user.

Real 201:

```bash
curl -b p.txt -X POST http://localhost:8000/api/v1/public/appointments \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $PUB" \
  -d '{"patient_first_name":"ZZBooking","patient_last_name":"ProtoTest","patient_phone":"9990003333","appointment_date":"2026-08-10","start_time":"16:00:00","reason":"ZZ disposable booking test"}'
```
```json
{"id":"671f5de2-a301-47bb-81de-6e804aa50972","patient_id":"8b4f7da3-b253-471c-ac6b-5974d713ffb8","doctor_id":"df56031a-6127-423a-99df-f1a943a95bb0","appointment_date":"2026-08-10","start_time":"16:00:00","end_time":"16:30:00","status":"scheduled","reason":"ZZ disposable booking test","notes":null,"source":"public","created_at":"2026-08-08T07:44:44.427055Z","patient":{"id":"8b4f7da3-b253-471c-ac6b-5974d713ffb8","first_name":"ZZBooking","last_name":"ProtoTest","phone":"9990003333","email":null}}
```

Note `start_time` accepts `"16:00:00"`; `"16:00"` also parses. `status` is always
`scheduled` for public bookings; `source` is always `"public"`.

Failure modes, all real:

```json
// same slot twice
{"error":{"code":"conflict","message":"The requested time slot is already booked."}}
// time not inside that weekday's availability
{"error":{"code":"bad_request","message":"The requested time is outside the clinic's availability."}}
// missing fields
{"error":{"code":"validation_error","message":"The provided data failed validation.","details":[{"location":"body.patient_first_name","message":"Field required"},{"location":"body.patient_last_name","message":"Field required"},{"location":"body.patient_phone","message":"Field required"},{"location":"body.appointment_date","message":"Field required"},{"location":"body.start_time","message":"Field required"}]}}
```

**There is no past-date validation.** `2020-01-01` at `10:00:00` (a Wednesday, inside the
Wed 10:00–13:00 block) was accepted and created a real appointment. The date picker must
enforce "today or later" client-side.

The reference booking payload (`site.html:522`) is exactly:

```js
body: JSON.stringify({
  patient_first_name: first, patient_last_name: last, patient_phone: phone,
  appointment_date: $("b-date").value, start_time: selectedSlot,
  reason: $("b-reason").value.trim() || null,
})
```

---

## 8. Gotchas

### 8.1 `total` is wrong (always `1`) on unfiltered `/appointments` and `/audit-logs` — **hard blocker for pagination UI**

`AppointmentRepository.list_by_filters` and `AuditLogRepository.list_recent` both build the
count as `select(func.count()).where(*conditions)` **without `.select_from(Model)`**. When
`conditions` is empty, SQLAlchemy emits `SELECT count(*)` with no `FROM`, which PostgreSQL
answers with `1` for the implicit single-row scan. Proof, against a database with 13
appointments and 46 audit logs:

```
GET /api/v1/appointments?page_size=50                      -> items 13  total 1   pages 1
GET /api/v1/appointments?page_size=50&from_date=2000-01-01 -> items 13  total 13  pages 1
GET /api/v1/audit-logs?page_size=50                        -> items 46  total 1   pages 1
GET /api/v1/audit-logs?page_size=50&entity_type=user       -> items 33  total 33  pages 1
```

And with an empty appointments table: `{"items":[],"total":1,"page":1,"page_size":20,"pages":1}`
— a phantom page with nothing in it.

**Workarounds, pick one:**
- Always pass a harmless filter so `conditions` is non-empty:
  `/appointments?from_date=1970-01-01`, `/audit-logs?entity_type=<known>`. This makes the
  count correct (verified).
- Or ignore `total`/`pages` on these two endpoints and drive "has more" from
  `items.length === page_size`.

`/patients`, `/medicines`, `/prescriptions`, `/users` all go through
`BaseRepository.paginate`, which uses `select(func.count()).select_from(query.subquery())`
and is **correct** (`patients` reported `items 5 total 10 pages 2`; `medicines`
`items 5 total 15 pages 3`).

### 8.2 `X-Correlation-Id` is never on the response

Documented as present on every response; verified absent. See §3.3. Generate one client-side
and send it — that is the only way to correlate with server logs.

### 8.3 `GET /auth/csrf` returns a value that always 403s

See §2.2. `docs/api_reference.md:8` tells you to use it. Use the `ortho_csrf` cookie instead.

### 8.4 Pydantic schema defaults are dropped on create → confusing `409`

`BaseRepository.create` does `schema.model_dump(exclude_unset=True)`, so any field you omit
is never sent to the ORM **even if the pydantic schema declares a default**. When the column
is `NOT NULL` with no server default, you get a `NOT NULL` violation, which the global
`IntegrityError` handler renders as an unhelpful conflict:

```bash
# omitting dosage_form, which the schema defaults to "tablet"
$ curl -X POST .../medicines -d '{"name":"ZZDisposableMed","strength":"500mg"}'
{"error":{"code":"conflict","message":"Database integrity constraint violated."}}

# same call with the field spelled out
$ curl -X POST .../medicines -d '{"name":"ZZDisposableMed","dosage_form":"tablet","strength":"500mg"}'
{"id":"5aa0580e-…","name":"ZZDisposableMed","dosage_form":"tablet", …}
```

**Rule: always send every field on POST, including ones with schema defaults.**
Also note the field is `dosage_form`, not `form`, and unknown keys are silently ignored
(pydantic default `extra="ignore"`), so a typo becomes a mystery 409 rather than a 422.

### 8.5 Patient create uses `first_name` / `last_name`, never `full_name`

`POST /patients` requires `first_name` + `last_name` + `phone`. Responses expose both parts
separately; `PrescriptionResponse` adds a computed `patient_name` (`"First Last"`), and
`PatientSummary` (nested in appointments/prescriptions) exposes only
`{id, first_name, last_name, phone, email}`. There is no `full_name` anywhere on a patient.
`gender` is the enum `male | female | other`, `date_of_birth` is `YYYY-MM-DD` — there is no
`age` field, compute it client-side.

### 8.6 `POST /uploads` is completely unauthenticated

Anyone who can obtain an `ortho_csrf` cookie from the public `GET /public/csrf` can write
files to disk. Verified live with no session. Do not build any client feature that assumes
the returned URL is private, and do not treat "upload succeeded" as evidence of a session.

### 8.7 `POST /prescriptions` silently creates an appointment

Creating a prescription for a patient with no linked appointment auto-creates a
`completed`, `source: "walkin"` appointment for **today** and returns its id as
`appointment_id`:

```json
{"id":"22e953c0-…","appointment_date":"2026-08-08","start_time":"09:00:00","end_time":"09:30:00","status":"completed","reason":"Walk-in visit linked to prescription","source":"walkin", …}
```

So your appointments list will grow rows you never explicitly booked, and `source` can be
`"walkin"` — a value **not** in `AppointmentCreateRequest`'s allowed set
(`public | admin | dashboard`). Do not build a client-side enum from the *request* schema.

### 8.8 Timezone handling

- All `created_at` / `updated_at` / `last_login_at` are UTC ISO-8601 with a literal `Z`:
  `"2026-08-08T07:36:26.950157Z"`. Microsecond precision. Safe for `new Date(...)`.
- `appointment_date` is a bare `YYYY-MM-DD`; `start_time` / `end_time` are bare `HH:MM:SS`.
  **No timezone, no offset.** They are clinic-local wall clock. Never build a `Date` by
  concatenating them with a `Z`, and never round-trip them through `Date` for display —
  format the strings directly.
- The server computes "today" with `date.today()` in the container's timezone (UTC here),
  so "appointments today" on the dashboard can disagree with the user's local day.

### 8.9 405 and other Starlette errors are not enveloped

`{"detail":"Method Not Allowed"}` — no `error` object. See §3.2. Your `parseError`
helper needs a fallback for `body.error === undefined`, or every method mistake becomes a
`Cannot read property 'code' of undefined`.

### 8.10 Trailing slashes cause a 307

`GET /api/v1/patients/` → `307 Temporary Redirect` with
`location: http://localhost:8000/api/v1/patients`. The redirect target is built from
`PUBLIC_BASE_URL`/host, so behind a proxy it can point somewhere unreachable, and a
redirected cross-origin POST is a second preflight. **Never emit trailing slashes.**

### 8.11 `page_size` bounds, and `sort_by` fails open

`page` ≥ 1, `page_size` 1–200 (default 20) — outside that you get a `422`, not a clamp.
`sort_order` must match `^(asc|desc)$` (default `desc`) or `422`.
But `sort_by` is resolved with `getattr(Model, sort_by, None)` and **silently falls back to
the default sort** when the column does not exist — `?sort_by=nonexistent` returns 200 with
default ordering. You will never learn that your sort key was wrong.

### 8.12 No rate limiting anywhere

Six consecutive bad-password logins all returned plain `401` with no backoff, no lockout and
no `429`:

```
401 401 401 401 401 401
```

`RateLimitError` / `rate_limited` exists in `app/core/exceptions.py:67` but nothing raises it
(`grep` finds no callers). Do not build retry/backoff UI around a 429 that will never arrive.

### 8.13 `GET /medicines` hides deactivated rows

`MedicineRepository` defaults to `active_only=True` (`Medicine.is_active.is_(True)`), and the
router exposes no override. A medicine you deactivated via
`POST /medicines/{id}/deactivate` vanishes from the list but is still referenced by existing
prescriptions. `POST /medicines/{id}/reactivate` brings it back. There is no medicine DELETE.

Similarly `GET /patients/search` filters to active patients only, while
`GET /patients` (the paginated list) does **not** — so a deactivated patient appears in the
list but is unfindable by search. `search` also returns a *richer* object than the list
does: `PatientSearchResult` = `PatientResponse` + `last_visit_date` + `prescription_count`.
It computes those with two extra queries per result row (a plain N+1), so keep `limit` small.

### 8.14 Empty states are `[]` / `{"items":[],"total":0,…}`, never 404

Verified: `/public/slots` for a closed day → `[]`; `/patients/search?q=z` with no match →
`[]`; empty paginated collections → `{"items":[],"total":0,"page":1,"page_size":N,"pages":0}`.
Note `pages` is `0` (not 1) when `total` is 0 — a naive `page > pages` guard will consider
page 1 out of range on an empty list.

### 8.15 Endpoints that do not exist (do not build UI for them)

There is **no** `DELETE` for patients, medicines, prescriptions or appointments — only
portfolio services/gallery/testimonials and appointment availability have `DELETE`.
Patients and medicines are soft-deactivated via `PATCH`/`deactivate`. Prescriptions have a
`status` of `active | voided` but the OpenAPI schema exposes no route to void one.
There is no `PUT` anywhere — every update is a `PATCH`.

### 8.16 Query-param inventory (from the live OpenAPI)

```
GET /api/v1/appointments        status, from_date, to_date, patient_id, page, page_size, sort_by, sort_order
GET /api/v1/appointments/slots  date (REQUIRED)
GET /api/v1/audit-logs          user_id, entity_type, page, page_size, sort_by, sort_order
GET /api/v1/patients            page, page_size, sort_by, sort_order
GET /api/v1/patients/search     q (REQUIRED, 1-100), limit (1-100, default 20)
GET /api/v1/prescriptions       patient_id, page, page_size, sort_by, sort_order
GET /api/v1/medicines           page, page_size, sort_by, sort_order
POST /api/v1/speech/transcribe  language_code, identify_multiple_languages
```

`/audit-logs` supports `from_date`/`to_date` in the repository but they are **not exposed**
as route parameters — passing them is silently ignored.

### 8.17 Enums (source of truth, `app/models/enums.py`)

```
UserRole            admin | doctor | staff
Gender              male | female | other
AppointmentStatus   scheduled | confirmed | in_progress | completed | cancelled | no_show
PrescriptionStatus  active | voided
DayOfWeek           monday | tuesday | wednesday | thursday | friday | saturday | sunday
MedicineDosageForm  tablet | capsule | syrup | injection | ointment | cream | gel | drops | inhaler | powder | other
```
Appointment status transitions are constrained server-side by `AppointmentStatusFlow`
(e.g. `scheduled → {confirmed, cancelled, in_progress}`); an illegal
`PATCH /appointments/{id}/status` will be rejected. **UNVERIFIED** — I did not exercise an
illegal transition.

### 8.18 Environment observation

While I was capturing, another process was concurrently seeding data and logging in as
`admin` (patient count went 0 → 10, medicines 0 → 15 mid-session, and `last_login_at` moved
without my doing it). Session revocation is global-per-token, not per-user, so this did not
affect correctness of anything above — but if you see your session die unexpectedly in this
shared dev environment, that is why, not a backend bug.

---

## Appendix — disposable data I created

Left in the dev database (there are no DELETE endpoints for most of these). All are
obviously named and safe to ignore or clean up. **No seeded data was modified or deleted,
and no new users were created.**

| Entity | Identifier |
|---|---|
| Patient | `ZZDisposable ProtoTest`, phone `9990001111`, id `612a3a43-c5c4-482c-9f4b-27c6adb1f54a` |
| Patient | `ZZBooking ProtoTest`, phone `9990003333`, id `8b4f7da3-b253-471c-ac6b-5974d713ffb8` |
| Medicine | `ZZDisposableMed`, id `5aa0580e-f8e8-4bbd-9e65-52ac68c6c92a` |
| Prescription | `RX-000001`, id `15c11126-f62f-491e-a9de-7dfebeb4300f` (+ auto-created walk-in appointment `22e953c0-…`) |
| Appointments | public bookings `671f5de2-…` (2026-08-10 16:00) and `f054e9d8-…` (2020-01-01 10:00, the past-date probe) |
| Upload | `http://localhost:8000/uploads/14/5fbdf34483a64770970acf7e12c77b4d.png` (8-byte PNG stub) |

The seeded `doctor` account was logged in once (to capture a real 403) and then logged out.

---

# Translation (English → Bengali)

## Why this is a second step, not an ASR setting

Amazon Transcribe returns **one** transcript in **one** language. It cannot
emit two languages for the same audio — `identify_multiple_languages` picks a
language per segment, it does not produce parallel outputs. `language_code` and
`identify_multiple_languages` are mutually exclusive server-side
(`app/services/speech/base.py:51`).

So the Voice screen's two columns are **recognise once, translate that result**,
not two recognitions. The one exception is the comparison lab, which genuinely
does run ASR twice — and the second pass is *transliteration*, not translation.

## The distinction the UI must preserve

| | "one tablet twice daily" becomes |
|---|---|
| `bn-IN` ASR on English speech | `ওয়ান ট্যাবলেট টুয়াইস ডেইলি` — Bengali letters, English words, meaning not carried |
| `POST /speech/translate` | `দিনে দুইবার একটি ট্যাবলেট` — actual Bengali |

Both are Bengali script. Only the second is Bengali *language*. Labelling them
interchangeably would be actively misleading on a prescription screen.

## Current state: works, but IAM-blocked

`translate:TranslateText` is **not** granted to the AWS user these credentials
belong to. Verified live:

```
HTTP 502
{"error":{"code":"upstream_error","message":"Amazon Translate refused the request:
the AWS credentials lack the translate:TranslateText permission. Attach the
TranslateReadOnly policy (or an equivalent statement) to the IAM user. AWS said:
User: arn:aws:iam::<ACCOUNT_ID>:user/<IAM_USER> is not authorized to perform:
translate:TranslateText ..."}}
```

Everything else is verified working. Attaching the `TranslateReadOnly` managed
policy is the only remaining step; no restart is needed, because permission is
evaluated per request.

## `GET /speech/config` — two new fields

```jsonc
"translation_available": true,           // configuration only, NOT permission
"translation_target_languages": ["bn"]   // ISO 639-1 — "bn", not "bn-IN"
```

`translation_available` stays `true` while IAM still refuses. That is
deliberate: the capability is offered, and the actual refusal is reported when a
call is made, in AWS's own words, because that message names the exact action to
grant. **Do not** treat `true` as a promise that a translate call will succeed.

## `POST /speech/translate`

```jsonc
// request                                    (doctor/admin, needs CSRF)
{ "text": "One tablet twice daily", "source_language_code": "en", "target_language_code": "bn" }
// 200
{ "provider": "aws", "text": "…", "translated_text": "…",
  "source_language_code": "en", "target_language_code": "bn" }
```

`text` is 1–5000 characters. Every failure — unconfigured, IAM refusal,
unsupported pair, throttling — is **502 `upstream_error`**, never 503.

## `WS /speech/stream` — query parameters

Previously the socket always used the server default (`bn-IN`), so a client
could not ask for English without an env change and a restart. Now:

| Parameter | Effect |
|---|---|
| `language_code=en-IN` | Pin this connection's language |
| `identify_multiple_languages=true` | Detect instead (mutually exclusive with the above) |
| `translate_to=bn` | Translate every **final** chunk |

Verified live against the running server:

```
?language_code=en-IN&translate_to=bn
  ready: {"language_code": "en-IN", "identify_multiple_languages": false, "translate_to": "bn"}
?identify_multiple_languages=true
  ready: {"language_code": null, "identify_multiple_languages": true, "translate_to": null}
(no query)
  ready: {"language_code": "bn-IN", "identify_multiple_languages": false, "translate_to": null}
(no session cookie)
  rejected: HTTP 403, before the socket is accepted
```

`ready.translate_to` is the authoritative confirmation that translation is
active — it comes back `null` when you asked for it but no provider exists.

## New `translation` message

Sent **after** the final it belongs to, with a delay, and possibly never:

```jsonc
{ "type": "translation", "sequence": 3, "text": "…", "source_text": "…",
  "source_language_code": "en", "target_language_code": "bn" }
```

`sequence` counts every final chunk **including empty ones**. It is the key that
ties a Bengali line to its English original — array position is not, because
translations resolve out of order.

## Scoped errors

```jsonc
{ "type": "error", "scope": "translation", "sequence": 3, "message": "…" }
```

A `scope: "translation"` error means that one line failed and **the transcript
stream is still alive**. An `error` with **no** `scope` is the old, fatal kind.
A scoped error with no `sequence` arrives once after `ready` when translation
was requested but is unavailable.

On stop, the server waits up to 10s for in-flight translations before sending
`closed` — so late Bengali lines can still arrive after the user presses Stop.
Do not clear pending rows the moment recording ends.

## Bengali rendering

`--font-sans` carries Noto Sans Devanagari, which is a *different script*.
Bengali set in the app font renders as tofu on most machines. Bengali cells use
their own system-font stack (`src/features/speech/translation.ts`), appended to
the app stack, with no webfont and no CDN — the clinic's line drops.

---

# Dictation analysis (NVIDIA Nemotron 3 via OpenRouter)

## Why a model as well as a parser

The client-side parser (`features/speech/parser.ts`, 83 tests) handles the
notations it was written for. It cannot handle a doctor dictating out of order,
mixing narrative with drugs, or correcting themselves mid-sentence. The model
reads that. The parser stays as the **offline fallback**, not the primary path.

Both produce the same `ParsedDictation` shape, so the pad consumes one contract
regardless of which read the transcript.

## The hallucination guard

The model must quote the transcript span justifying **every** value it returns.
The server checks that quote occurs in the transcript (case/punctuation
insensitive) and **discards any value that fails**, listing it in `rejected`.
A row whose `spoken_name` is not in the transcript is dropped entirely — an
invented drug must never reach a prescription.

`rejected` is shown in the UI rather than hidden: a model that invents things is
something the doctor needs to see.

## `POST /speech/extract`

```jsonc
// request                                        (doctor/admin, needs CSRF)
{ "transcript": "tab dolo 650 TDS for 3 days after food", "reasoning": false }
// 200
{ "rows": [{ "spoken_name": "dolo 650",
             "schedule": { "value": {"m":1,"a":1,"n":1}, "evidence": "TDS" },
             "duration_days": { "value": 3, "evidence": "for 3 days" },
             "food": { "value": "after", "evidence": "after food" },
             "dosage": null, "instructions": null, "prn": false,
             "source_text": "tab dolo 650 TDS for 3 days after food" }],
  "diagnosis": null, "advice": null, "follow_up_days": null,
  "unparsed": [], "rejected": [],
  "provider": "openrouter", "model": "nvidia/nemotron-3-nano-30b-a3b:free",
  "duration_ms": 2140 }
```

**502 `upstream_error`** means *fall back to the parser*, not "the dictation was
bad". The client does exactly that, silently but visibly.

`GET /speech/config` gains `extraction_available` and `extraction_model`.

## Client behaviour

`useDictationAnalysis(transcript, { available, enabled })`:

- The **local parse renders instantly** as a preview.
- The **model runs once recording stops** (`enabled: !isRecording`) — analysing a
  half-finished sentence wastes a call and produces rows the doctor is about to
  contradict.
- The model result **supersedes** the preview when it lands; a stale answer for
  an older transcript is discarded via an `analysedRef` guard.
- The source is **always stated on screen** ("Read by nemotron-3-nano-30b" vs
  "Pattern matching only"). The two are not equally trustworthy and that
  difference must never be invisible.
- "Read it again, more carefully" re-runs with `reasoning: true`.

## Configuration

| Variable | Default |
|---|---|
| `EXTRACTION_ENABLED` | `true` |
| `OPENROUTER_API_KEY` | *(empty — set this)* |
| `EXTRACTION_MODEL` | `nvidia/nemotron-3-nano-30b-a3b:free` |
| `EXTRACTION_TIMEOUT_SECONDS` | `25.0` |
| `EXTRACTION_REASONING` | `false` |

Free reasoning models confirmed live on OpenRouter: `nemotron-3-nano-30b-a3b`
(3B active, fastest), `nemotron-3-super-120b-a12b`, `nemotron-3-ultra-550b-a55b`
(1M context), `openai/gpt-oss-20b`. All `:free`.

**Privacy:** the transcript leaves the machine. It contains patient names, phone
numbers and diagnoses, and free-tier endpoints may retain or train on submitted
prompts. Acceptable for a prototype; review before real patients.
