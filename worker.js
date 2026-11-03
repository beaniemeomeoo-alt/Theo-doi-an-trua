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
  const isAllowed = !origin || ALLOWED_ORIGINS.includes(origin);

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
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const isAllowed = Boolean(origin && ALLOWED_ORIGINS.includes(origin));
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
        return errorResponse(err.status ? err.message : 'Không thể xử lý yêu cầu. Vui lòng thử lại.', err.status || 500, request);
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

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getAuthConfig(env) {
  const username = String(env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD || '');
  const secret = String(env.AUTH_SECRET || '');
  if (!/^[a-z0-9_-]+$/.test(username) || password.length < 12 || secret.length < 32) {
    throw Object.assign(new Error('Chưa cấu hình đăng nhập an toàn. Cần ADMIN_PASSWORD (ít nhất 12 ký tự) và AUTH_SECRET (ít nhất 32 ký tự).'), { status: 503 });
  }
  return { username, password, secret };
}

async function hmacSign(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getTokenSecret(env) {
  return getAuthConfig(env).secret;
}

async function createAuthToken(username, env) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${username}.${exp}`;
  const sig = await hmacSign(payload, getTokenSecret(env));
  return `${payload}.${sig}`;
}

async function verifyAuthRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [username, expStr, sig] = parts;
  const exp = Number(expStr);
  if (username !== getAuthConfig(env).username || !Number.isSafeInteger(exp) || Date.now() >= exp || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(getTokenSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(sig.match(/.{2}/g), byte => parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', key, signature, enc.encode(`${username}.${expStr}`));
}

async function updatePayment(db, yearMonth, memberId, transform) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await db.prepare('SELECT paid, history_json FROM payments WHERE year_month = ? AND member_id = ?')
      .bind(yearMonth, memberId).first();
    let history;
    try {
      history = JSON.parse(existing?.history_json || '[]');
      if (!Array.isArray(history)) throw new Error('Invalid payment history');
    } catch {
      throw Object.assign(new Error('Lịch sử thu tiền không hợp lệ; cần kiểm tra dữ liệu trước khi chỉnh sửa.'), { status: 409 });
    }
    if (history.length === 0 && existing?.paid > 0) {
      history = [{ id: `pay_legacy_${memberId}`, amount: Number(existing.paid), method: 'bank', note: 'Đã nộp trước đó', date: `${yearMonth}-01` }];
    }
    history = transform(history);
    const paid = history.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const historyJson = JSON.stringify(history);
    const result = existing
      ? await db.prepare(`UPDATE payments SET paid = ?, history_json = ?, updated_at = datetime('now', '+7 hours')
          WHERE year_month = ? AND member_id = ? AND paid IS ? AND history_json IS ?`)
        .bind(paid, historyJson, yearMonth, memberId, existing.paid, existing.history_json).run()
      : await db.prepare(`INSERT INTO payments (year_month, member_id, paid, history_json, updated_at)
          VALUES (?, ?, ?, ?, datetime('now', '+7 hours')) ON CONFLICT(year_month, member_id) DO NOTHING`)
        .bind(yearMonth, memberId, paid, historyJson).run();
    if (result.meta?.changes === 1) return { paid, history };
  }
  throw Object.assign(new Error('Có người khác đang cập nhật khoản thu này. Vui lòng thử lại.'), { status: 409 });
}

async function handleApi(request, env, url) {
  const db = env.DB;
  if (!db) {
    return errorResponse('D1 Database binding (DB) not configured', 500, request);
  }

  const authConfig = getAuthConfig(env);
  const path = url.pathname;
  const method = request.method;

  // 0. AUTH LOGIN: POST /api/auth/login
  if (path === '/api/auth/login' && method === 'POST') {
    const body = await request.json();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (username !== authConfig.username || password !== authConfig.password) {
      return errorResponse('Sai tài khoản hoặc mật khẩu!', 401, request);
    }

    const token = await createAuthToken(username, env);
    return jsonResponse({ success: true, token, username }, 200, request);
  }

  // Require valid Bearer token for all other /api/* endpoints
  const isAuthed = await verifyAuthRequest(request, env);
  if (!isAuthed) {
    return errorResponse('Unauthorized: Vui lòng đăng nhập để tiếp tục', 401, request);
  }

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
      if (history.length === 0 && p.paid > 0) history = [{ id: `pay_legacy_${p.member_id}`, amount: Number(p.paid), method: 'bank', note: 'Đã nộp trước đó', date: `${month}-01` }];
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
    }, 200, request);
  }

  // 2. MEMBERS CRUD
  // GET /api/members
  if (path === '/api/members' && method === 'GET') {
    const res = await db.prepare('SELECT * FROM members ORDER BY name ASC').all();
    return jsonResponse({ success: true, members: res.results || [] }, 200, request);
  }

  // POST /api/members (Create or Update)
  if (path === '/api/members' && method === 'POST') {
    const body = await request.json();
    let id = body.id ? String(body.id).trim().slice(0, 50) : ('m_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return errorResponse('ID thành viên không hợp lệ', 400, request);
    }

    const name = (body.name || '').trim().slice(0, 100);
    if (!name) return errorResponse('Tên thành viên không được để trống', 400, request);

    const phone = (body.phone || '').trim().slice(0, 30);
    const note = (body.note || '').trim().slice(0, 255);
    const active = (body.active === false || body.active === 0) ? 0 : 1;

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

    return jsonResponse({ success: true, member: { id, name, phone, note, active: active === 1 } }, 200, request);
  }

  // DELETE /api/members/:id
  if (path.startsWith('/api/members/') && method === 'DELETE') {
    const id = path.split('/')[3];
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return errorResponse('ID thành viên không hợp lệ', 400, request);
    }

    await db.batch([
      db.prepare('DELETE FROM members WHERE id = ?').bind(id),
      db.prepare('DELETE FROM meal_records WHERE member_id = ?').bind(id),
      db.prepare('DELETE FROM payments WHERE member_id = ?').bind(id)
    ]);

    return jsonResponse({ success: true, deletedId: id }, 200, request);
  }

  // 3. RECORDS CRUD
  // POST /api/records (Single update)
  if (path === '/api/records' && method === 'POST') {
    const body = await request.json();
    const { date, memberId, count, note, price } = body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorResponse('Định dạng ngày không hợp lệ (YYYY-MM-DD)', 400, request);
    }
    if (!memberId || !/^[a-zA-Z0-9_-]+$/.test(memberId)) {
      return errorResponse('ID thành viên không hợp lệ', 400, request);
    }

    const numCount = Math.max(0, Math.min(50, Math.floor(Number(count) || 0)));
    const cleanNote = (note || '').trim().slice(0, 255);
    const numPrice = (price !== undefined && price !== null && price !== '')
      ? Math.max(0, Math.min(5000000, Math.floor(Number(price) || 0)))
      : null;

    if (body.clear === true || count === null || count === undefined || Number(count) < 0) {
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
      `).bind(date, memberId, numCount, cleanNote, numPrice).run();
    }

    return jsonResponse({ success: true }, 200, request);
  }

  // POST /api/records/batch (Multiple updates at once - for drag & drop painting)
  if (path === '/api/records/batch' && method === 'POST') {
    const body = await request.json();
    const rawUpdates = body.updates || [];
    if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) {
      return jsonResponse({ success: true, count: 0 }, 200, request);
    }

    // Giới hạn số lượng bản ghi trong 1 lần cập nhật (tối đa 150)
    if (rawUpdates.length > 150) return errorResponse('Mỗi lần chỉ được cập nhật tối đa 150 ô.', 400, request);
    const updates = rawUpdates;
    const statements = [];

    for (const item of updates) {
      if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
      if (!item.memberId || !/^[a-zA-Z0-9_-]+$/.test(item.memberId)) continue;

      const numCount = Math.max(0, Math.min(50, Math.floor(Number(item.count) || 0)));
      const cleanNote = (item.note || '').trim().slice(0, 255);
      const numPrice = (item.price !== undefined && item.price !== null && item.price !== '')
        ? Math.max(0, Math.min(5000000, Math.floor(Number(item.price) || 0)))
        : null;

      if (item.clear === true || item.count === null || item.count === undefined || Number(item.count) < 0) {
        statements.push(db.prepare('DELETE FROM meal_records WHERE date = ? AND member_id = ?').bind(item.date, item.memberId));
      } else {
        statements.push(db.prepare(`
          INSERT INTO meal_records (date, member_id, count, note, price, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now', '+7 hours'))
          ON CONFLICT(date, member_id) DO UPDATE SET
            count = excluded.count,
            note = excluded.note,
            price = excluded.price,
            updated_at = excluded.updated_at
        `).bind(item.date, item.memberId, numCount, cleanNote, numPrice));
      }
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }
    return jsonResponse({ success: true, count: statements.length }, 200, request);
  }

  // 4. PAYMENTS CRUD
  // POST /api/payments
  if (path === '/api/payments' && method === 'POST') {
    const body = await request.json();
    const { yearMonth, memberId, amount, method: payMethod, note, date } = body;
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return errorResponse('Định dạng tháng không hợp lệ (YYYY-MM)', 400, request);
    }
    if (!memberId || !/^[a-zA-Z0-9_-]+$/.test(memberId)) {
      return errorResponse('ID thành viên không hợp lệ', 400, request);
    }

    const paidAmount = Math.max(0, Math.min(50000000, Math.floor(Number(amount) || 0)));
    const cleanMethod = ['bank', 'cash'].includes(payMethod) ? payMethod : 'bank';
    const cleanNote = (note || '').trim().slice(0, 255);
    const cleanDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : new Date().toISOString().slice(0, 10);

    const paymentId = body.id || `pay_${crypto.randomUUID()}`;
    if (typeof paymentId !== 'string' || !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(paymentId)) {
      return errorResponse('ID giao dịch không hợp lệ', 400, request);
    }
    const item = { id: paymentId, amount: paidAmount, method: cleanMethod, note: cleanNote, date: cleanDate, createdAt: new Date().toISOString() };
    const payment = await updatePayment(db, yearMonth, memberId, history => {
      const previous = history.find(h => h.id === paymentId);
      if (previous) {
        if (['amount', 'method', 'note', 'date'].some(key => previous[key] !== item[key])) {
          throw Object.assign(new Error('Mã giao dịch đã được dùng cho khoản thu khác.'), { status: 409 });
        }
        return history;
      }
      return [...history, item];
    });
    return jsonResponse({ success: true, ...payment }, 200, request);
  }

  // DELETE /api/payments/:yearMonth/:memberId (or /:historyId)
  if (path.startsWith('/api/payments/') && method === 'DELETE') {
    const parts = path.split('/');
    const yearMonth = parts[3];
    const memberId = parts[4];
    const historyId = parts[5];

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth) || !memberId || !/^[a-zA-Z0-9_-]+$/.test(memberId)) {
      return errorResponse('Tham số tháng hoặc thành viên không hợp lệ', 400, request);
    }

    if (historyId && !/^[a-zA-Z0-9_-]+$/.test(historyId)) {
      return errorResponse('ID giao dịch không hợp lệ', 400, request);
    }
    const payment = await updatePayment(db, yearMonth, memberId,
      history => historyId ? history.filter(h => h.id !== historyId) : []);
    return jsonResponse({ success: true, ...payment }, 200, request);
  }

  // 5. SETTINGS
  // POST /api/settings
  if (path === '/api/settings' && method === 'POST') {
    const body = await request.json();
    const statements = [];

    if (body.mealPrice !== undefined) {
      const mealPrice = Math.max(1000, Math.min(2000000, Math.floor(Number(body.mealPrice) || 40000)));
      statements.push(db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('mealPrice', ?)").bind(String(mealPrice)));
    }
    if (body.theme) {
      const safeTheme = body.theme === 'dark' ? 'dark' : 'light';
      statements.push(db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)").bind(safeTheme));
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return jsonResponse({ success: true }, 200, request);
  }

  return errorResponse('API endpoint not found', 404, request);
}
