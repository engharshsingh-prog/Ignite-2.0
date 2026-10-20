import db, { toParticipant } from './_db.js';
import { requireSuperAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';
import { ensureEventSettingsColumns } from './event-settings.js';

let tableEnsured = false;

export async function ensureRegistrationLocksTable() {
  if (tableEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS registration_locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        roll_number TEXT NOT NULL,
        year TEXT NOT NULL,
        participant_id INTEGER,
        is_locked INTEGER NOT NULL DEFAULT 1,
        locked_at TEXT NOT NULL DEFAULT (datetime('now')),
        locked_by TEXT NOT NULL DEFAULT 'system',
        lock_reason TEXT DEFAULT NULL,
        unlocked_at TEXT DEFAULT NULL,
        unlocked_by TEXT DEFAULT NULL,
        unlock_reason TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (email, year)
      )
    `).run();

    // Ensure columns exist on participants table
    try {
      await db.prepare('SELECT is_locked FROM participants LIMIT 1').get();
    } catch {
      const cols = [
        { name: 'is_locked', type: 'INTEGER NOT NULL DEFAULT 1' },
        { name: 'locked_at', type: "TEXT DEFAULT (datetime('now'))" },
        { name: 'unlocked_at', type: 'TEXT DEFAULT NULL' },
        { name: 'unlocked_by', type: 'TEXT DEFAULT NULL' },
        { name: 'unlock_reason', type: 'TEXT DEFAULT NULL' },
        { name: 'locked_by', type: "TEXT DEFAULT 'system'" },
        { name: 'lock_reason', type: 'TEXT DEFAULT NULL' },
      ];
      for (const c of cols) {
        try {
          await db.prepare(`ALTER TABLE participants ADD COLUMN ${c.name} ${c.type}`).run();
        } catch (_) {}
      }
    }

    tableEnsured = true;
  } catch (err) {
    console.warn('[registration_locks] Warning during ensureRegistrationLocksTable:', err?.message || err);
  }
}

// 1. GET /api/registration-locks/status - Public check for student email/roll_number
export async function handleGetRegistrationLockStatus(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  await ensureRegistrationLocksTable();

  const rawEmail = String(req.query?.email || '').trim().toLowerCase();
  const rawRoll = String(req.query?.roll_number || '').trim().toLowerCase();

  if (!rawEmail) {
    return res.status(200).json({
      email: '',
      first_year: { locked: false, status: null, registration_id: null, unlocked: false, message: null },
      second_year: { locked: false, status: null, registration_id: null, unlocked: false, message: null },
    });
  }

  try {
    const years = ['1st Year', '2nd Year'];
    const results = {};

    for (const yr of years) {
      // Find participant record
      let pRow = null;
      if (rawRoll) {
        pRow = await db.prepare(
          'SELECT * FROM participants WHERE (lower(trim(email)) = ? OR lower(trim(roll_number)) = ?) AND year = ? ORDER BY id DESC LIMIT 1'
        ).get(rawEmail, rawRoll, yr);
      } else {
        pRow = await db.prepare(
          'SELECT * FROM participants WHERE lower(trim(email)) = ? AND year = ? ORDER BY id DESC LIMIT 1'
        ).get(rawEmail, yr);
      }

      // Find lock record
      let lockRow = await db.prepare(
        'SELECT * FROM registration_locks WHERE lower(trim(email)) = ? AND year = ? LIMIT 1'
      ).get(rawEmail, yr);

      if (!lockRow && pRow) {
        lockRow = {
          is_locked: pRow.is_locked !== undefined && pRow.is_locked !== null ? pRow.is_locked : 1,
          locked_at: pRow.locked_at || pRow.registered_at,
          unlocked_at: pRow.unlocked_at,
          unlocked_by: pRow.unlocked_by,
          unlock_reason: pRow.unlock_reason,
        };
      }

      let isLocked = false;
      let status = pRow?.approval_status || null;
      let regId = pRow?.registration_id || (pRow?.id ? `IGN26-${String(pRow.id).padStart(4, '0')}` : null);
      let message = null;
      let unlocked = false;

      if (lockRow) {
        isLocked = Boolean(lockRow.is_locked);
        unlocked = !isLocked && Boolean(lockRow.unlocked_at);
      } else if (pRow) {
        isLocked = pRow.is_locked !== undefined ? Boolean(pRow.is_locked) : true;
        unlocked = !isLocked && Boolean(pRow.unlocked_at);
      }

      if (isLocked) {
        if (pRow) {
          if (pRow.approval_status === 'approved' && pRow.payment_id) {
            message = `Your ${yr} registration is completed and approved.`;
          } else if (pRow.approval_status === 'approved' && !pRow.payment_id) {
            message = `Your ${yr} registration is approved. Please complete payment.`;
          } else if (pRow.approval_status === 'pending_approval') {
            message = `Your ${yr} registration is submitted and awaiting admin approval.`;
          } else if (pRow.approval_status === 'rejected') {
            message = `Your ${yr} registration was rejected and is locked. Contact Super Admin if you need to re-register.`;
          } else {
            message = `Your ${yr} registration has already been submitted and is locked.`;
          }
        } else {
          message = `Your ${yr} registration is locked for this account.`;
        }
      } else if (unlocked) {
        message = `Your ${yr} registration has been unlocked by Super Admin. You can update or submit your registration.`;
      }

      const key = yr === '1st Year' ? 'first_year' : 'second_year';
      results[key] = {
        locked: isLocked,
        status,
        registration_id: regId,
        payment_status: pRow?.payment_status || null,
        has_paid: Boolean(pRow?.payment_id),
        unlocked,
        unlocked_at: lockRow?.unlocked_at || pRow?.unlocked_at || null,
        message,
      };
    }

    return res.status(200).json({
      email: rawEmail,
      first_year: results.first_year,
      second_year: results.second_year,
    });
  } catch (err) {
    console.error('handleGetRegistrationLockStatus error:', err);
    return res.status(500).json({ error: 'Failed to retrieve registration lock status' });
  }
}

// 2. GET /api/super-admin/registration-locks - Super Admin: search and list all student locks
export async function handleSuperAdminGetLocks(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  await ensureRegistrationLocksTable();

  try {
    const search = String(req.query?.search || '').trim().toLowerCase();
    const yearFilter = String(req.query?.year || 'all').trim();
    const statusFilter = String(req.query?.status || 'all').trim(); // 'all', 'locked', 'unlocked'

    // Combine participants and registration_locks to get complete list of registrations
    let query = `
      SELECT
        p.id as participant_id,
        p.registration_id,
        p.full_name,
        COALESCE(p.email, l.email) as email,
        COALESCE(p.roll_number, l.roll_number) as roll_number,
        COALESCE(p.branch, 'N/A') as branch,
        COALESCE(p.year, l.year) as year,
        COALESCE(p.approval_status, 'pending_approval') as approval_status,
        COALESCE(p.payment_status, 'pending_verification') as payment_status,
        p.payment_verified,
        p.payment_id,
        p.payment_amount,
        p.account_holder_name,
        p.registered_at,
        COALESCE(l.is_locked, p.is_locked, 1) as is_locked,
        COALESCE(l.locked_at, p.locked_at, p.registered_at) as locked_at,
        COALESCE(l.locked_by, p.locked_by, 'system') as locked_by,
        COALESCE(l.lock_reason, p.lock_reason) as lock_reason,
        COALESCE(l.unlocked_at, p.unlocked_at) as unlocked_at,
        COALESCE(l.unlocked_by, p.unlocked_by) as unlocked_by,
        COALESCE(l.unlock_reason, p.unlock_reason) as unlock_reason
      FROM participants p
      LEFT JOIN registration_locks l ON lower(trim(p.email)) = lower(trim(l.email)) AND p.year = l.year
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      query += ` AND (
        lower(p.full_name) LIKE ? OR
        lower(p.email) LIKE ? OR
        lower(p.roll_number) LIKE ? OR
        lower(p.registration_id) LIKE ? OR
        lower(l.email) LIKE ? OR
        lower(l.roll_number) LIKE ? OR
        CAST(p.id AS TEXT) = ?
      )`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, search);
    }

    if (yearFilter && yearFilter !== 'all') {
      query += ` AND p.year = ?`;
      params.push(yearFilter);
    }

    if (statusFilter === 'locked') {
      query += ` AND COALESCE(l.is_locked, p.is_locked, 1) = 1`;
    } else if (statusFilter === 'unlocked') {
      query += ` AND COALESCE(l.is_locked, p.is_locked, 1) = 0`;
    }

    query += ` ORDER BY p.registered_at DESC`;

    const rows = await db.prepare(query).all(...params);

    const formatted = rows.map(r => ({
      participant_id: r.participant_id,
      registration_id: r.registration_id || `IGN26-${String(r.participant_id).padStart(4, '0')}`,
      full_name: r.full_name || 'N/A',
      email: r.email,
      roll_number: r.roll_number,
      branch: r.branch,
      year: r.year,
      approval_status: r.approval_status,
      payment_status: r.payment_status,
      payment_verified: Boolean(r.payment_verified),
      payment_id: r.payment_id,
      payment_amount: r.payment_amount != null ? Number(r.payment_amount) : (r.year === '2nd Year' ? 699 : 599),
      account_holder_name: r.account_holder_name,
      registered_at: r.registered_at,
      is_locked: Boolean(r.is_locked),
      locked_at: r.locked_at,
      locked_by: r.locked_by,
      lock_reason: r.lock_reason,
      unlocked_at: r.unlocked_at,
      unlocked_by: r.unlocked_by,
      unlock_reason: r.unlock_reason,
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('handleSuperAdminGetLocks error:', err);
    return res.status(500).json({ error: 'Failed to fetch registration locks' });
  }
}

// 3. POST /api/super-admin/registration-locks/toggle - Super Admin: lock or unlock a registration
export async function handleSuperAdminToggleLock(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  await ensureRegistrationLocksTable();

  const { email, year, action, reason, participant_id } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedYear = String(year || '').trim();
  const cleanReason = String(reason || '').trim();

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Student email is required.' });
  }

  if (!['1st Year', '2nd Year'].includes(normalizedYear)) {
    return res.status(400).json({ error: 'Valid academic year (1st Year or 2nd Year) is required.' });
  }

  if (action !== 'unlock' && action !== 'lock') {
    return res.status(400).json({ error: 'Action must be "unlock" or "lock".' });
  }

  try {
    const isLocking = action === 'lock';
    const newLockValue = isLocking ? 1 : 0;
    const nowIso = new Date().toISOString();

    // Look up participant row
    let pRow = null;
    if (participant_id) {
      pRow = await db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id);
    }
    if (!pRow) {
      pRow = await db.prepare('SELECT * FROM participants WHERE lower(trim(email)) = ? AND year = ? LIMIT 1').get(normalizedEmail, normalizedYear);
    }

    const rollNumber = pRow?.roll_number || 'N/A';
    const pId = pRow?.id || null;

    if (isLocking) {
      // Re-lock
      await db.prepare(`
        INSERT INTO registration_locks (
          email, roll_number, year, participant_id, is_locked, locked_at, locked_by, lock_reason, updated_at
        )
        VALUES (?, ?, ?, ?, 1, datetime('now'), ?, ?, datetime('now'))
        ON CONFLICT (email, year) DO UPDATE SET
          is_locked = 1,
          locked_at = datetime('now'),
          locked_by = excluded.locked_by,
          lock_reason = excluded.lock_reason,
          unlocked_at = NULL,
          unlocked_by = NULL,
          unlock_reason = NULL,
          updated_at = datetime('now')
      `).run(normalizedEmail, rollNumber, normalizedYear, pId, superAdmin.email, cleanReason || 'Locked by Super Admin');

      if (pId) {
        await db.prepare(`
          UPDATE participants
          SET is_locked = 1,
              locked_at = datetime('now'),
              locked_by = ?,
              lock_reason = ?,
              unlocked_at = NULL,
              unlocked_by = NULL,
              unlock_reason = NULL
          WHERE id = ?
        `).run(superAdmin.email, cleanReason || 'Locked by Super Admin', pId);
      }

      await writeActivity({
        entity_type: 'registration_lock',
        entity_id: pId || 0,
        action: 'registration_year_locked',
        actor_email: superAdmin.email,
        details: {
          email: normalizedEmail,
          roll_number: rollNumber,
          year: normalizedYear,
          registration_id: pRow?.registration_id || null,
          reason: cleanReason || 'Locked by Super Admin',
          locked_by: superAdmin.email,
          timestamp: nowIso,
        },
      });

      return res.status(200).json({
        success: true,
        message: `Successfully locked ${normalizedYear} registration for ${normalizedEmail}.`,
        is_locked: true,
        year: normalizedYear,
      });
    } else {
      // Unlock
      await db.prepare(`
        INSERT INTO registration_locks (
          email, roll_number, year, participant_id, is_locked, unlocked_at, unlocked_by, unlock_reason, updated_at
        )
        VALUES (?, ?, ?, ?, 0, datetime('now'), ?, ?, datetime('now'))
        ON CONFLICT (email, year) DO UPDATE SET
          is_locked = 0,
          unlocked_at = datetime('now'),
          unlocked_by = excluded.unlocked_by,
          unlock_reason = excluded.unlock_reason,
          updated_at = datetime('now')
      `).run(normalizedEmail, rollNumber, normalizedYear, pId, superAdmin.email, cleanReason || 'Unlocked by Super Admin');

      if (pId) {
        await db.prepare(`
          UPDATE participants
          SET is_locked = 0,
              unlocked_at = datetime('now'),
              unlocked_by = ?,
              unlock_reason = ?
          WHERE id = ?
        `).run(superAdmin.email, cleanReason || 'Unlocked by Super Admin', pId);
      }

      await writeActivity({
        entity_type: 'registration_lock',
        entity_id: pId || 0,
        action: 'registration_year_unlocked',
        actor_email: superAdmin.email,
        details: {
          email: normalizedEmail,
          roll_number: rollNumber,
          year: normalizedYear,
          registration_id: pRow?.registration_id || null,
          reason: cleanReason || 'Unlocked by Super Admin',
          unlocked_by: superAdmin.email,
          timestamp: nowIso,
        },
      });

      return res.status(200).json({
        success: true,
        message: `Successfully unlocked ${normalizedYear} registration for ${normalizedEmail}.`,
        is_locked: false,
        year: normalizedYear,
      });
    }
  } catch (err) {
    console.error('handleSuperAdminToggleLock error:', err);
    return res.status(500).json({ error: 'Failed to update registration lock: ' + (err?.message || err) });
  }
}

// 4. GET /api/super-admin/registration-locks/audit-logs - Super Admin: view lock audit trail
export async function handleSuperAdminGetLockAuditLogs(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    const rows = await db.prepare(`
      SELECT * FROM activity_logs
      WHERE action IN ('registration_year_unlocked', 'registration_year_locked')
         OR entity_type = 'registration_lock'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    const formatted = rows.map(r => {
      let parsed = {};
      try {
        parsed = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {});
      } catch (_) {}
      return {
        id: r.id,
        action: r.action,
        actor_email: r.actor_email,
        created_at: r.created_at,
        details: parsed,
      };
    });

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('handleSuperAdminGetLockAuditLogs error:', err);
    return res.status(500).json({ error: 'Failed to load lock audit logs' });
  }
}

// 5. GET /api/super-admin/year-registration-control - Super Admin: get status of academic year registration gateways
export async function handleSuperAdminGetYearRegistrationControl(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    await ensureEventSettingsColumns();
    const row = await db.prepare('SELECT registration_1st_year_enabled, registration_2nd_year_enabled, registration_updated_by, updated_at FROM event_settings WHERE id = 1').get();
    return res.status(200).json({
      enabled_1st_year: row?.registration_1st_year_enabled !== undefined && row?.registration_1st_year_enabled !== null ? Boolean(row.registration_1st_year_enabled) : true,
      enabled_2nd_year: row?.registration_2nd_year_enabled !== undefined && row?.registration_2nd_year_enabled !== null ? Boolean(row.registration_2nd_year_enabled) : true,
      updated_at: row?.updated_at || null,
      updated_by: row?.registration_updated_by || null,
    });
  } catch (err) {
    console.error('handleSuperAdminGetYearRegistrationControl error:', err);
    return res.status(500).json({ error: 'Failed to fetch registration gateway status' });
  }
}

// 6. PUT /api/super-admin/year-registration-control - Super Admin: enable or disable year registrations
export async function handleSuperAdminSetYearRegistrationControl(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    await ensureEventSettingsColumns();
    const { year, enabled } = req.body || {};
    if (year !== '1st Year' && year !== '2nd Year') {
      return res.status(400).json({ error: 'year must be "1st Year" or "2nd Year"' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const nowIso = new Date().toISOString();
    const colName = year === '2nd Year' ? 'registration_2nd_year_enabled' : 'registration_1st_year_enabled';

    await db.prepare(`
      UPDATE event_settings
      SET ${colName} = ?, registration_updated_by = ?, updated_at = ?
      WHERE id = 1
    `).run(enabled ? 1 : 0, superAdmin.email, nowIso);

    await writeActivity({
      entity_type: 'registration_gateway',
      entity_id: year === '2nd Year' ? 2 : 1,
      action: enabled ? `${year.toLowerCase().replace(' ', '_')}_registration_enabled` : `${year.toLowerCase().replace(' ', '_')}_registration_disabled`,
      actor_email: superAdmin.email,
      details: {
        year,
        enabled,
        updated_by: superAdmin.email,
        timestamp: nowIso,
      },
    });

    const updatedRow = await db.prepare('SELECT registration_1st_year_enabled, registration_2nd_year_enabled, registration_updated_by, updated_at FROM event_settings WHERE id = 1').get();

    return res.status(200).json({
      success: true,
      message: `${year} registration is now ${enabled ? 'OPEN' : 'PAUSED'} by Super Admin.`,
      enabled_1st_year: updatedRow?.registration_1st_year_enabled !== undefined && updatedRow?.registration_1st_year_enabled !== null ? Boolean(updatedRow.registration_1st_year_enabled) : true,
      enabled_2nd_year: updatedRow?.registration_2nd_year_enabled !== undefined && updatedRow?.registration_2nd_year_enabled !== null ? Boolean(updatedRow.registration_2nd_year_enabled) : true,
      updated_at: nowIso,
      updated_by: superAdmin.email,
    });
  } catch (err) {
    console.error('handleSuperAdminSetYearRegistrationControl error:', err);
    return res.status(500).json({ error: 'Failed to update registration gateway: ' + (err?.message || err) });
  }
}
