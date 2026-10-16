/**
 * worker.js - Cloudflare Worker + D1 SQLite Backend for Theo Doi Com Trua
 */

const ALLOWED_ORIGINS = [
  'https://theo-doi-an-trua.beaniemeomeoo.workers.dev',
  'http://localhost:8787',
  'http://127.0.0.1:8787'
];

function getCorsHeaders(request) {
  const origin = request ? request.headers.get('Origin') : '';
  const isAllowed = !origin || ALLOWED_ORIGINS.includes(origin) || (origin && origin.endsWith('.workers.dev'));

  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || 'https://theo-doi-an-trua.beaniemeomeoo.workers.dev') : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function jsonResponse(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: getCorsHeaders(request)
  });
}

function errorResponse(message, status = 400, request = null) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: getCorsHeaders(request)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Handle Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    // 2. Serve API routes
    if (url.pathname.startsWith('/api/')) {
      // Chặn các request thay đổi dữ liệu từ các domain lạ (Chống CSRF)
      const origin = request.headers.get('Origin');
      if (origin && request.method !== 'GET' && request.method !== 'HEAD') {
        const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.workers.dev');
        if (!isAllowed) {
          return errorResponse('Forbidden: Yêu cầu cross-origin bị từ chối', 403, request);
        }
      }

      try {
        const res = await handleApi(request, env, url);
        // Đảm bảo security headers luôn được đính kèm đầy đủ
        const headers = new Headers(res.headers);
        const cors = getCorsHeaders(request);
        for (const [k, v] of Object.entries(cors)) {
          if (!headers.has(k)) headers.set(k, v);
        }
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers
        });
      } catch (err) {
        console.error('API Error:', err);
        return errorResponse(err.message || 'Internal Server Error', 500, request);
      }
    }

    // 3. Fallback to static assets với Security Headers
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      const headers = new Headers(assetRes.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers
      });
    }

    return new Response('Assets binding not found', { status: 404 });
  }
};

async function handleApi(request, env, url) {
  const db = env.DB;
  if (!db) {
    return errorResponse('D1 Database binding (DB) not configured', 500);
  }

  const path = url.pathname;
  const method = request.method;

  // 1. BOOTSTRAP: Get all data for active month in 1 fast round-trip
  // GET /api/bootstrap?month=YYYY-MM
  if (path === '/api/bootstrap' && method === 'GET') {
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    
    // Batch queries in D1
    const [settingsRes, membersRes, recordsRes, paymentsRes] = await db.batch([
      db.prepare('SELECT key, value FROM settings'),
      db.prepare('SELECT id, name, phone, note, active, created_at FROM members ORDER BY name ASC'),
      db.prepare("SELECT date, member_id, count, note, price FROM meal_records WHERE date LIKE ?").bind(`${month}-%`),
      db.prepare('SELECT member_id, paid, history_json FROM payments WHERE year_month = ?').bind(month)
    ]);

    // Parse settings
    const settings = {
      mealPrice: 30000,
      bankInfo: { bankCode: 'MB', accountNumber: '7700113959999', accountName: 'TRUONG THI BICH PHUONG' },
      workdays: [1, 2, 3, 4, 5],
      theme: 'light'
    };
    (settingsRes.results || []).forEach(row => {
      if (row.key === 'mealPrice') settings.mealPrice = Number(row.value) || 30000;
      else if (row.key === 'workdays') {
        try { settings.workdays = JSON.parse(row.value); } catch(e){}
      }
      else if (row.key === 'theme') settings.theme = row.value;
    });

    // Parse records into map: date -> { member_id -> { count, note, price } }
    const records = {};
    (recordsRes.results || []).forEach(r => {
      if (!records[r.date]) records[r.date] = {};
      records[r.date][r.member_id] = {
        count: r.count,
        note: r.note || '',
        price: (r.price !== undefined && r.price !== null) ? Number(r.price) : null
      };
    });

    // Parse payments into map: member_id -> { paid, history }
    const payments = {};
    (paymentsRes.results || []).forEach(p => {
      let history = [];
      try { history = JSON.parse(p.history_json || '[]'); } catch(e){}
      payments[p.member_id] = {
        paid: p.paid || 0,
        history: history
      };
    });

    return jsonResponse({
      success: true,
      month,
      settings,
      members: membersRes.results || [],
      records,
      payments
    });
  }

  // 2. MEMBERS CRUD
  // GET /api/members
  if (path === '/api/members' && method === 'GET') {
    const res = await db.prepare('SELECT * FROM members ORDER BY name ASC').all();
    return jsonResponse({ success: true, members: res.results || [] });
  }

  // POST /api/members (Create or Update)
  if (path === '/api/members' && method === 'POST') {
    const body = await request.json();
    const id = body.id || 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const name = (body.name || '').trim();
    if (!name) return errorResponse('Tên thành viên không được để trống');

    const phone = (body.phone || '').trim();
    const note = (body.note || '').trim();
    const active = body.active === false ? 0 : 1;

    await db.prepare(`
      INSERT INTO members (id, name, phone, note, active, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+7 hours'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        note = excluded.note,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).bind(id, name, phone, note, active).run();

    return jsonResponse({ success: true, member: { id, name, phone, note, active: active === 1 } });
  }

  // DELETE /api/members/:id
  if (path.startsWith('/api/members/') && method === 'DELETE') {
    const id = path.split('/')[3];
    if (!id) return errorResponse('Missing member ID');

    await db.batch([
      db.prepare('DELETE FROM members WHERE id = ?').bind(id),
      db.prepare('DELETE FROM meal_records WHERE member_id = ?').bind(id),
      db.prepare('DELETE FROM payments WHERE member_id = ?').bind(id)
    ]);

    return jsonResponse({ success: true, deletedId: id });
  }

  // 3. RECORDS CRUD
  // POST /api/records (Single update)
  if (path === '/api/records' && method === 'POST') {
    const body = await request.json();
    const { date, memberId, count, note, price } = body;
    if (!date || !memberId) return errorResponse('Missing date or memberId');

    const numCount = Number(count) || 0;
    const numPrice = (price !== undefined && price !== null && price !== '') ? Number(price) : null;
    if (numCount <= 0) {
      await db.prepare('DELETE FROM meal_records WHERE date = ? AND member_id = ?').bind(date, memberId).run();
    } else {
      await db.prepare(`
        INSERT INTO meal_records (date, member_id, count, note, price, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', '+7 hours'))
        ON CONFLICT(date, member_id) DO UPDATE SET
          count = excluded.count,
          note = excluded.note,
          price = excluded.price,
          updated_at = excluded.updated_at
      `).bind(date, memberId, numCount, (note || '').trim(), numPrice).run();
    }

    return jsonResponse({ success: true });
  }

  // POST /api/records/batch (Multiple updates at once - for drag & drop painting)
  if (path === '/api/records/batch' && method === 'POST') {
    const body = await request.json();
    const updates = body.updates || [];
    if (!Array.isArray(updates) || updates.length === 0) {
      return jsonResponse({ success: true, count: 0 });
    }

    const statements = updates.map(item => {
      const numCount = Number(item.count) || 0;
      const numPrice = (item.price !== undefined && item.price !== null && item.price !== '') ? Number(item.price) : null;
      if (numCount <= 0) {
        return db.prepare('DELETE FROM meal_records WHERE date = ? AND member_id = ?').bind(item.date, item.memberId);
      } else {
        return db.prepare(`
          INSERT INTO meal_records (date, member_id, count, note, price, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now', '+7 hours'))
          ON CONFLICT(date, member_id) DO UPDATE SET
            count = excluded.count,
            note = excluded.note,
            price = excluded.price,
            updated_at = excluded.updated_at
        `).bind(item.date, item.memberId, numCount, (item.note || '').trim(), numPrice);
      }
    });

    await db.batch(statements);
    return jsonResponse({ success: true, count: updates.length });
  }

  // 4. PAYMENTS CRUD
  // POST /api/payments
  if (path === '/api/payments' && method === 'POST') {
    const body = await request.json();
    const { yearMonth, memberId, amount, method: payMethod, note, date } = body;
    if (!yearMonth || !memberId) return errorResponse('Missing yearMonth or memberId');

    const paidAmount = Math.max(0, Number(amount) || 0);

    // Get existing history
    const existing = await db.prepare('SELECT paid, history_json FROM payments WHERE year_month = ? AND member_id = ?')
      .bind(yearMonth, memberId).first();

    let history = [];
    if (existing && existing.history_json) {
      try { history = JSON.parse(existing.history_json); } catch(e){}
    }
    if ((!history || history.length === 0) && existing && existing.paid > 0) {
      history = [{
        id: 'pay_legacy_' + Date.now(),
        amount: Number(existing.paid) || 0,
        method: 'bank',
        note: 'Đã nộp trước đó',
        date: `${yearMonth}-01`,
        createdAt: new Date().toISOString()
      }];
    }

    history.push({
      id: 'pay_' + Date.now(),
      amount: paidAmount,
      method: payMethod || 'bank',
      note: (note || '').trim(),
      date: date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    });

    const newTotalPaid = history.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

    await db.prepare(`
      INSERT INTO payments (year_month, member_id, paid, history_json, updated_at)
      VALUES (?, ?, ?, ?, datetime('now', '+7 hours'))
      ON CONFLICT(year_month, member_id) DO UPDATE SET
        paid = excluded.paid,
        history_json = excluded.history_json,
        updated_at = excluded.updated_at
    `).bind(yearMonth, memberId, newTotalPaid, JSON.stringify(history)).run();

    return jsonResponse({ success: true, paid: newTotalPaid, history });
  }

  // DELETE /api/payments/:yearMonth/:memberId (or /:historyId)
  if (path.startsWith('/api/payments/') && method === 'DELETE') {
    const parts = path.split('/');
    const yearMonth = parts[3];
    const memberId = parts[4];
    const historyId = parts[5];

    if (!yearMonth || !memberId) {
      return errorResponse('Missing yearMonth or memberId');
    }

    if (historyId) {
      const existing = await db.prepare('SELECT history_json FROM payments WHERE year_month = ? AND member_id = ?')
        .bind(yearMonth, memberId).first();

      let history = [];
      if (existing && existing.history_json) {
        try { history = JSON.parse(existing.history_json); } catch(e){}
      }

      history = history.filter(h => h.id !== historyId);
      const newPaid = history.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

      await db.prepare(`
        UPDATE payments SET paid = ?, history_json = ?, updated_at = datetime('now', '+7 hours')
        WHERE year_month = ? AND member_id = ?
      `).bind(newPaid, JSON.stringify(history), yearMonth, memberId).run();

      return jsonResponse({ success: true, paid: newPaid, history });
    } else {
      await db.prepare('DELETE FROM payments WHERE year_month = ? AND member_id = ?')
        .bind(yearMonth, memberId).run();

      return jsonResponse({ success: true, paid: 0, history: [] });
    }
  }

  // 5. SETTINGS
  // POST /api/settings
  if (path === '/api/settings' && method === 'POST') {
    const body = await request.json();
    const statements = [];

    if (body.mealPrice !== undefined) {
      statements.push(db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('mealPrice', ?)").bind(String(body.mealPrice)));
    }
    if (body.theme) {
      statements.push(db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)").bind(body.theme));
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return jsonResponse({ success: true }, 200, request);
  }

  return errorResponse('API endpoint not found', 404, request);
}
