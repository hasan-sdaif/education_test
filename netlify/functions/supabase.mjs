// netlify/functions/supabase.mjs
// ─────────────────────────────────────────────────────────────────
//  طبقة مساعدة للاتصال بـ Supabase من داخل Netlify Functions.
//  تستخدم fetch الأصلي (متوفر في Node 18+) — لا حاجة لأي npm package.
//  الوصول عبر مفتاح service_role السرّي الذي يبقى على الخادم.
//
//  الاستراتيجية:
//  - في الإنتاج (Netlify): تستخدم Supabase إذا ضُبطت متغيرات البيئة.
//  - في المعاينة المحلية: fallback إلى ملف JSON مؤقت (عبر _lib.mjs Store).
//  - هذا يسمح بتشغيل الموقع محلياً بدون Supabase، والإنتاج يستخدم Supabase.
// ─────────────────────────────────────────────────────────────────

class ConfigError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ConfigError';
    this.code = 'server_not_configured';
  }
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url || !serviceKey) {
    throw new ConfigError(
      'SUPABASE_URL أو SUPABASE_SERVICE_KEY غير مضبوطين في Netlify. ' +
      'راجع دليل الإعداد في README.md. سيتم استخدام التخزين المحلي البديل.'
    );
  }

  try { new URL(url); } catch (_) {
    throw new ConfigError('SUPABASE_URL ليس رابطاً صالحاً.');
  }

  return { url, serviceKey, anonKey };
}

export function isSupabaseConfigured() {
  try {
    getConfig();
    return true;
  } catch (_) {
    return false;
  }
}

async function request(path, options = {}) {
  const { url, serviceKey } = getConfig();

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json; charset=utf-8',
    'Prefer': options.prefer || 'return=representation',
    ...options.headers,
  };

  const fullUrl = `${url}/rest/v1/${path}`;

  let res;
  try {
    res = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkErr) {
    const err = new Error('تعذّر الاتصال بـ Supabase. تحقق من SUPABASE_URL ومن اتصال الإنترنت.');
    err.code = 'db_unreachable';
    err.cause = networkErr;
    throw err;
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error('مفتاح Supabase السرّي غير صالح أو لا يملك صلاحيات.');
    err.code = 'auth_error';
    err.status = res.status;
    throw err;
  }

  if (res.status === 409) {
    const err = new Error('تضارب في البيانات — قد يكون السجل موجوداً مسبقاً.');
    err.code = 'duplicate';
    err.status = 409;
    throw err;
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (_) {}
    const err = new Error(`خطأ من Supabase (HTTP ${res.status}): ${detail.slice(0, 300)}`);
    err.code = 'db_error';
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  if (res.status === 204) return [];

  let json;
  try { json = await res.json(); } catch (_) { json = []; }
  return json;
}

// ─────────────────────────────────────────────────────────────────
//  دوال مساعدة (تشبه واجهة Store في _lib.mjs)
// ─────────────────────────────────────────────────────────────────

/**
 * جلب كل صفوف جدول بترتيب اختياري.
 */
export async function sbSelectAll(table, opts = {}) {
  let path = encodeURIComponent(table);
  const params = [];
  if (opts.order) params.push(`order=${encodeURIComponent(opts.order)}`);
  if (opts.limit) params.push(`limit=${parseInt(opts.limit, 10)}`);
  else params.push('limit=100000');
  if (opts.select) params.push(`select=${encodeURIComponent(opts.select)}`);
  if (params.length) path += '?' + params.join('&');
  return await request(path, { method: 'GET' });
}

/**
 * جلب صف واحد بمعرّفه.
 */
export async function sbSelectOne(table, id, idField = 'id') {
  const path = `${encodeURIComponent(table)}?${idField}=eq.${encodeURIComponent(id)}&limit=1`;
  const rows = await request(path, { method: 'GET' });
  return rows[0] || null;
}

/**
 * إضافة صف جديد.
 */
export async function sbInsert(table, record) {
  const path = encodeURIComponent(table);
  return await request(path, {
    method: 'POST',
    prefer: 'return=representation',
    body: record,
  });
}

/**
 * تحديث صف بمعرّفه.
 */
export async function sbUpdate(table, id, values, idField = 'id') {
  const path = `${encodeURIComponent(table)}?${idField}=eq.${encodeURIComponent(id)}`;
  const rows = await request(path, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: values,
  });
  return rows[0] || null;
}

/**
 * حذف صف بمعرّفه.
 */
export async function sbDelete(table, id, idField = 'id') {
  const path = `${encodeURIComponent(table)}?${idField}=eq.${encodeURIComponent(id)}`;
  return await request(path, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
}

/**
 * حذف كل صفوف الجدول.
 */
export async function sbDeleteAll(table) {
  const path = `${encodeURIComponent(table)}?id=gte.0`;
  return await request(path, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
}

/**
 * اختبار الاتصال.
 */
export async function sbPing() {
  const path = `${encodeURIComponent('settings')}?select=key&limit=1`;
  await request(path, { method: 'GET' });
  return true;
}

// ─────────────────────────────────────────────────────────────────
//  طبقة متوافقة مع واجهة Store في _lib.mjs
//  تحوّل كل جدول Supabase إلى "store" بنفس واجهة getJSON/setJSON/listAll/delete
//  هذا يسمح باستبدال Netlify Blobs بـ Supabase بدون تغيير _lib.mjs
// ─────────────────────────────────────────────────────────────────

// خريطة بين أسماء الـ stores وأسماء جداول Supabase
const TABLE_MAP = {
  'users': 'users',
  'users_by_email': 'users_by_email',
  'admins': 'admins',
  'admins_by_email': 'admins_by_email',
  'subjects': 'subjects',
  'tags': 'tags',
  'categories': 'categories',
  'materials': 'materials',
  'plans': 'plans',
  'bundles': 'bundles',
  'orders': 'orders',
  'subscriptions': 'subscriptions',
  'purchases': 'purchases',
  'reviews': 'reviews',
  'verified_reviews': 'verified_reviews',
  'qa': 'qa',
  'meets': 'meets',
  'sellers': 'sellers',
  'coupons': 'coupons',
  'payouts': 'payouts',
  'payout_requests': 'payout_requests',
  'notifications': 'notifications',
  'activity_log': 'activity_log',
  'settings': 'settings',
  'meta': 'meta',
};

/**
 * إنشاء كائن Store متوافق مع _lib.mjs لكن يستخدم Supabase.
 */
export function createSupabaseStore() {
  return {
    async getJSON(store, key) {
      const table = TABLE_MAP[store];
      if (!table) throw new Error(`Unknown store: ${store}`);
      // للجداول التي تستخدم مفتاحاً غير id (settings, meta)
      if (store === 'settings') {
        const row = await sbSelectOne(table, key, 'key');
        return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
      }
      if (store === 'meta') {
        const row = await sbSelectOne(table, key, 'key');
        return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
      }
      if (store === 'users_by_email' || store === 'admins_by_email') {
        const row = await sbSelectOne(table, key, 'key');
        return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
      }
      // للبقية: المفتاح هو id
      const row = await sbSelectOne(table, key, 'id');
      return row ? row.data : null;
    },

    async setJSON(store, key, value) {
      const table = TABLE_MAP[store];
      if (!table) throw new Error(`Unknown store: ${store}`);
      const strValue = JSON.stringify(value);

      if (store === 'settings' || store === 'meta' || store === 'users_by_email' || store === 'admins_by_email') {
        // upsert by key
        const existing = await sbSelectOne(table, key, 'key');
        if (existing) {
          await sbUpdate(table, key, { key, value: strValue }, 'key');
        } else {
          await sbInsert(table, { key, value: strValue });
        }
        return;
      }

      // للبقية: upsert by id
      const existing = await sbSelectOne(table, key, 'id');
      if (existing) {
        await sbUpdate(table, key, { id: key, data: strValue }, 'id');
      } else {
        await sbInsert(table, { id: key, data: strValue });
      }
    },

    async listAll(store) {
      const table = TABLE_MAP[store];
      if (!table) throw new Error(`Unknown store: ${store}`);

      if (store === 'settings' || store === 'meta' || store === 'users_by_email' || store === 'admins_by_email') {
        const rows = await sbSelectAll(table, { order: 'key.asc' });
        return rows.map(r => {
          const value = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
          return { key: r.key, value };
        }).filter(r => r.value !== null);
      }

      const rows = await sbSelectAll(table, { order: 'id.asc' });
      return rows.map(r => {
        try {
          return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        } catch (_) {
          return null;
        }
      }).filter(Boolean);
    },

    async delete(store, key) {
      const table = TABLE_MAP[store];
      if (!table) throw new Error(`Unknown store: ${store}`);

      if (store === 'settings' || store === 'meta' || store === 'users_by_email' || store === 'admins_by_email') {
        await sbDelete(table, key, 'key');
        return;
      }
      await sbDelete(table, key, 'id');
    },
  };
}
