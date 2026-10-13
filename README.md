# Ignite 2.O

Frontend: React + TypeScript + Vite
Backend/API: Single Vercel entrypoint in `api/index.js` dispatching handlers in `server/` (SQLite-backed).

## Vercel Hobby Plan

- Keep only the single Vercel entrypoint in `api/index.js`.
- Add new backend handlers under `server/`, then register them in `server/router.js`.
- Do not add extra executable files under `api/`, or Vercel will count them as more Serverless Functions.

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+

## Setup

```bash
npm install
```

## Run Locally

Start frontend + local API server together:

```bash
npm run dev
```

By default:

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8787` (proxied from frontend as `/api`)

## Build for Production

```bash
npm run build
```

## Testing / Verification

No dedicated unit/integration test runner is configured (`test` script is not defined).
Suggested checks:

```bash
npm run lint
npm run build
```

## Environment Variables (API)

Required for local dev:

- `SQLITE_DB_PATH` (example: `./data/ignite26.db`)
- `ADMIN_CREDENTIALS_JSON` maps the three authorized admin emails to unique passwords (minimum 12 characters each). Only those three addresses are eligible. Keep this JSON in deployment secrets, not source control.

Firebase participant sign-in:

- Configure the Google provider and authorized domains in the Firebase Console.
- Set the `VITE_FIREBASE_*` values for the frontend build and `FIREBASE_WEB_API_KEY` for the API. The API uses Firebase to verify the signed-in user's ID token before returning a profile by email.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` remain available for provisioning one allowlisted account in older deployments; the email must be one of the three approved addresses and the password must be at least 12 characters.

Optional:

- `TURSO_DATABASE_URL` (remote libSQL/Turso)
- `TURSO_AUTH_TOKEN` (if using Turso)
- `API_BODY_LIMIT` (default 25mb)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (OTP + confirmation emails)
- `GOOGLE_SHEET_SYNC_URL` (sync pull from Google Sheet)
- `SHEET_SYNC_SECRET` (Apps Script webhook push secret)
- `VALIDATION_HANDLER_PASSWORD` (default password for `/validate/:token` handler page)
- `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, and `SUPABASE_SERVICE_ROLE_KEY` are prepared for the target Supabase project. Keep the service-role key server-only.

The current API database adapter still uses local SQLite or Turso (`server/_db.js`); setting these Supabase variables alone does not migrate data or switch application reads and writes. Apply the Supabase schema and data migration only after the target project's existing schema and credentials have been verified.

Media uploads on Vercel:

- `BLOB_READ_WRITE_TOKEN` is required to store uploaded media using Vercel Blob.
- Without this token on Vercel, uploads will fail because the filesystem is read-only.

## Event Settings

Admin page:

- `/admin/event-settings`

API:

- `GET /api/event-settings` (public)
- `PUT /api/event-settings` (admin only)

Settings include:

- Title, venue, display date/time
- Countdown datetime
- Dress codes
- Day flow timeline
- Support note

## Participant Uniqueness Rules

- `email` is unique.
- `roll_number` is allowed to repeat.
- `whatsapp_number` is allowed to repeat.

Registration behavior:

- A registration with an existing `email` is rejected.
- An existing participant may be updated only when both `roll_number` and `email` match.

## Event Pass (PNG) + QR

- Passes are generated as **PNG** from the SVG artwork at `/public/event-pass.svg`.
- Date, time and venue are read from event settings when the pass is created; missing values are printed as “To be announced”.
- QR code is rendered on the pass canvas via the `qrcode` library.

QR scan reliability:

- A **quiet zone** is included via `margin: 4`.
- QR colors use a scanner-friendly charcoal and light olive scheme.

Where this is implemented:

- `src/pages/MyProfile.tsx` (single participant download)
- `src/pages/admin/BulkPassDownload.tsx` (bulk ZIP generation)

## Admin: Bulk Pass Download

Page:

- `/admin/bulk-passes`

Behavior:

- Select one or more participants.
- Download all passes as a single ZIP (generated client-side via `jszip`).

## Payment / Check-in Handler (Validation Handler)

Page:

- `/validate/:token`

Behavior:

- After unlocking, the handler preloads participant data once and stores it in encrypted localStorage.
- Subsequent scans/searches use the local cache to avoid repeated server fetches.
- Cache can be refreshed manually from the page.

Security notes:

- Cache is encrypted using Web Crypto (`AES-GCM`) with a key derived from the handler password.
- Tampering results in decryption failure and forces a refetch.

Implementation:

- Client: `src/pages/ValidationHandler.tsx`
- API: `server/validation-handler.js`

## Admin Dashboard: Mobile Menu Positioning

Admin dashboard dropdowns (Quick Links / Data Tools / Access Options / Handler Options) clamp their position so menus stay inside the viewport on mobile.

## Media Upload Behavior

- Public uploads are stored with status `pending` and require admin approval.
- Admin uploads are stored with status `approved`.
- On local dev, uploads are written to `public/uploads`.
- On Vercel, uploads use Vercel Blob (requires `BLOB_READ_WRITE_TOKEN`).

## Google Sheet Sync

API route: `POST /api/sheet-sync`

- Admin-triggered pull sync:
  - Uses `GOOGLE_SHEET_SYNC_URL` from `.env`, or pass `{ "sheet_url": "..." }`.
- Webhook push sync (for Apps Script):
  - Send JSON with `{ "rows": [...] }` or `{ "row": {...} }`.
  - Include `X-Sheet-Sync-Secret: <SHEET_SYNC_SECRET>`.

Example Apps Script webhook call:

```javascript
function pushLatestRows(rows) {
  const url = 'https://your-domain.com/api/sheet-sync';
  const payload = JSON.stringify({
    sync_secret: 'YOUR_SECRET',
    rows: rows
  });
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: payload,
    muteHttpExceptions: true
  });
}
```

## Sync Google Form Responses to Database

```javascript
const API_URL = 'API_ENDPOINT'; // or your local tunnel URL
const SECRET = 'SECRET_KEY'; // same as .env SHEET_SYNC_SECRET
const SHEET_NAME = 'SHEET_NAME'; // change if needed

function onFormSubmit(e) {
  const row = e && e.namedValues ? namedValuesToRow(e.namedValues) : null;
  if (!row) return;
  pushRows([row]);
}

function syncAllRowsNow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${SHEET_NAME}`);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map(h => String(h || '').trim());
  const allRows = values.slice(1).map(r => rowArrayToObject(headers, r));

  // CHUNK CONFIGURATION
  const chunkSize = 1; // Try 50 rows at a time
  for (let i = 0; i < allRows.length; i += chunkSize) {
    const chunk = allRows.slice(i, i + chunkSize);
    Logger.log(`Syncing rows ${i + 1} of ${allRows.length}...`);
    pushRows(chunk);
  }
}

function pushRows(rows) {
  Logger.log(rows);
  const res = UrlFetchApp.fetch(API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Sheet-Sync-Secret': SECRET },
    payload: JSON.stringify({ rows }),
    muteHttpExceptions: true
  });

  Logger.log(`Sync status: ${res.getResponseCode()}`);
  Logger.log(res.getContentText());
}

function namedValuesToRow(namedValues) {
  const out = {};
  Object.keys(namedValues).forEach(k => {
    const val = namedValues[k];
    out[k] = Array.isArray(val) ? val.join(', ') : String(val || '');
  });
  return out;
}

function rowArrayToObject(headers, row) {
  const out = {};
  headers.forEach((h, i) => {
    out[h] = row[i] == null ? '' : String(row[i]);
  });
  return out;
}
```

## Super Admin Policy (Strict Role Rules)

- **Exactly Two Super Admins**:
  - `j74117204@gmail.com`
  - `pragatiie0601@gmail.com`
  Nobody else can ever be a super admin.
- **Source of Truth**: The server environment variable `SUPER_ADMIN_EMAILS` (comma-separated, trimmed, case-insensitive) set to exactly these two addresses:
  ```env
  SUPER_ADMIN_EMAILS=j74117204@gmail.com,pragatiie0601@gmail.com
  ```
- **Fail-Closed Design**: If `SUPER_ADMIN_EMAILS` is missing or empty, the server fails closed: nobody receives super admin rights.
- **Immutable Role Derivation**: The `super_admin` role is derived **exclusively** from `SUPER_ADMIN_EMAILS`, never from a database field that a client request can alter. No UI or API may create, promote, or demote a `super_admin`. Role-change endpoints can only switch between `admin` and no access (`suspended` / `unapproved`), never to `super_admin`.
- **Full Governance Control**: Super admins have complete master authority: access to all data, approve/reject admin access requests, make any approved account an admin, revoke admins, view audit logs.
- **Auto-Approval**: Super admins are auto-approved upon login and cannot be rejected, revoked, suspended, or demoted through the app. Changing the super admin roster strictly requires updating the server environment variable and redeploying.
- **Regular Admins**: Any other email (including legacy allowlist addresses like `sharvilm112@gmail.com`, `adityabhai01@gmail.com`, `harsh188200@gmail.com`) is a regular admin only if approved by a super admin (or migrated as approved in the database). They never possess super admin rights.
- **Server Enforcement**: All role checks and authorization barriers are enforced on the server on every request against the database and environment variables. No client-side email checks or hard-coded allowlists exist in the frontend.
- **Security Audit Logs**: Any unauthorized attempt to call `/api/super-admin/*` or `/api/control/*` endpoints, or any attempt to set `role=super_admin` through any API, fails with HTTP `403 Forbidden` and is immediately written to `activity_logs`.

## Status

- Build passed (`tsc -b && vite build` 0 errors).
- Super Admin policy and governance controls operational.
#   I g n i t e - 2 . 0  
 
