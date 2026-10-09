## 1. Project Concept & Structure

Ignite 26 is an Event Management System with three layers:

1. Public Layer: Landing page, countdown, registration, gallery, hall of fame.
2. Participant Layer: Profile lookup, ticket PDF, shared records view.
3. Admin Layer: Dashboard, check-ins, media management, winners, event settings.

### Folder Structure (Current)

```text
/ignite-26
|-- /api
|   |-- index.js              # Vercel single entrypoint (dispatches to server/)
|-- /public
|   |-- logo.jpg
|-- /server
|   |-- router.js             # API dispatcher
|   |-- _db.js                # SQLite/libSQL schema + migrations
|   |-- _media-storage.js     # Local or Vercel Blob media storage
|   |-- event-settings.js     # Event settings API
|   |-- media.js              # Media upload + moderation
|   |-- ...
|-- /src
|   |-- /assets
|   |-- /components
|   |-- /lib
|   |   |-- eventSettings.ts
|   |   |-- useEventSettings.ts
|   |-- /pages
|   |   |-- admin
|   |   |   |-- Dashboard.tsx
|   |   |   |-- EventSettings.tsx
|   |   |   |-- MediaUpload.tsx
|   |   |   |-- MediaBulkImport.tsx
|   |   |   |-- WinnersManager.tsx
|   |   |   |-- ManagementTeamManager.tsx
|   |   |   |-- Login.tsx
|   |   |-- Home.tsx
|   |   |-- Register.tsx
|   |   |-- Gallery.tsx
|   |   |-- HallOfFame.tsx
|   |   |-- PublicMediaUpload.tsx
|   |   |-- PublicRegistrationsView.tsx
|   |   |-- ValidationHandler.tsx
|   |   |-- MyProfile.tsx
|-- /data                    # Local SQLite file in dev
|-- /database                # DB notes and scripts (if present)
```

---

## 2. Pages and Routes

| Route | Page | Access | Purpose |
| --- | --- | --- | --- |
| `/` | Home | Public | Hero, countdown, event details, day flow. |
| `/register` | Registration | Public | Registration form. |
| `/gallery` | Gallery | Public | Approved media gallery. |
| `/upload-media` | Public Upload | Public | Public media submissions (pending). |
| `/hall-of-fame` | Hall of Fame | Public | Winner showcase. |
| `/my-profile` | My Profile | Public | Registration lookup + ticket PDF. |
| `/records/:token` | Shared Records | Token | Admin-generated public share. |
| `/validate/:token` | Validation Handler | Token | Entry validation tools. |
| `/admin/login` | Admin Login | Admin | Admin authentication. |
| `/admin` | Admin Dashboard | Admin | Check-ins, stats, actions. |
| `/admin/upload` | Media Upload | Admin | Upload approved media. |
| `/admin/upload-bulk` | Media Bulk Import | Admin | Drive/CSV imports. |
| `/admin/winners` | Winners Manager | Admin | Manage hall of fame. |
| `/admin/management-team` | Management Team | Admin | Manage coordinators. |
| `/admin/event-settings` | Event Settings | Admin | Edit date/time/venue/countdown/dress code/day flow. |

---

## 3. Database & Authentication

SQLite is used by default with optional libSQL/Turso support.

Core tables include:

- `participants` (registrations, payment status, check-in)
- `media` (uploads + status)
- `winners` (hall of fame)
- `management_team`
- `activity_logs`
- `event_settings` (title, venue, display date/time, countdown, flow, support note)
- `auth_users` and `auth_sessions` (admin auth)

Authentication:

- Participant access is token or lookup-based.
- Admin access is email/password with session tokens.

---

## 4. Media Upload Storage

- Local dev: files are written to `public/uploads`.
- Vercel: uses Vercel Blob and requires `BLOB_READ_WRITE_TOKEN`.
- Public submissions are stored as `pending` until approved by admins.

---

## 5. Validation & Check-in Flow

- Admin dashboard supports search + check-in updates.
- Validation handler page validates QR or tokened records.
- Activity logs capture admin actions for auditing.
