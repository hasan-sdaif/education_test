// netlify/functions/_lib.mjs
// ─────────────────────────────────────────────────────────────────
//  مكتبة مشتركة — تمديد تراكمي:
//   - متجر بيانات ذكي: Supabase أولاً، ثم Netlify Blobs، ثم JSON محلي
//   - مصادقة HMAC (admin/user)
//   - هاش كلمة المرور
//   - بيانات أولية: الإدارة فقط (لا محتوى وهمي)
//   - سجلّ نشاط، إشعارات
//   - مساعدات: كوبونات، عمولات، تقييمات موثّقة متعددة المحاور، باقات، تصنيف هرمي
//   - Migration آمن: أي حقل جديد بقيمة افتراضية منطقية
// ─────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// ضمان بقاء fs, path, os متاحين للاستخدام لاحقاً في الملف

// ── نظام التخزين: Supabase → Blobs → JSON ──
let _storageMode = null; // 'supabase' | 'blobs' | 'json'
let _supabaseStore = null;
let blobsStore = null;
const JSON_PATH = process.env.NETLIFY_BLOBS_PATH || path.join(os.tmpdir(), 'platform_db.json');

async function detectStorage() {
  if (_storageMode) return _storageMode;
  // 1) جرّب Supabase أولاً
  try {
    const mod = await import('./supabase.mjs');
    if (mod.isSupabaseConfigured()) {
      _supabaseStore = mod.createSupabaseStore();
      _storageMode = 'supabase';
      console.log('[storage] Using Supabase');
      return _storageMode;
    }
  } catch (_) {}
  // 2) جرّب Netlify Blobs
  try {
    const mod = await import('@netlify/blobs');
    if (mod.getStore) {
      blobsStore = mod.getStore;
      _storageMode = 'blobs';
      console.log('[storage] Using Netlify Blobs');
      return _storageMode;
    }
  } catch (_) {}
  // ملاحظة: تم نقل منطق getStore الفعلي إلى دالة getStore() أدناه،
  // حيث نمرر siteID و token يدويًا إن كانا متوفرين كمتغيرات بيئة،
  // لأن الحقن التلقائي للسياق (automatic context) لا يعمل أحيانًا.
  // 3) Fallback إلى JSON محلي
  _storageMode = 'json';
  console.log('[storage] Using local JSON fallback');
  return _storageMode;
}

async function getStore(name) {
  const mode = await detectStorage();
  if (mode === 'supabase') return _supabaseStore;
  if (mode === 'blobs') {
    // إعداد يدوي احتياطي: بعض بيئات Netlify (خصوصًا الخطة المجانية أو
    // عند فشل الحقن التلقائي للسياق) لا توفر siteID/token تلقائيًا،
    // فتظهر رسالة الخطأ:
    // "The environment has not been configured to use Netlify Blobs..."
    // الحل: تمريرهما يدويًا من متغيرات البيئة إن كانا متوفرين.
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
    if (siteID && token) {
      return blobsStore({ name, siteID, token });
    }
    // إن لم تتوفر القيم اليدوية، جرّب السياق التلقائي (يعمل غالبًا فقط
    // داخل بيئة Netlify الرسمية عند اكتمال الإعداد التلقائي)
    return blobsStore(name);
  }
  // JSON fallback
  return {
    async get(key) { const db = readJson(); return db[name]?.[key] ? JSON.stringify(db[name][key]) : null; },
    async set(key, value) { const db = readJson(); db[name] = db[name] || {}; db[name][key] = JSON.parse(value); writeJson(db); },
    async list() { const db = readJson(); return Object.keys(db[name] || {}).map(k => ({ key: k })); },
    async delete(key) { const db = readJson(); if (db[name]) delete db[name][key]; writeJson(db); },
  };
}
function readJson() { try { return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8') || '{}'); } catch { return {}; } }
function writeJson(db) { try { fs.writeFileSync(JSON_PATH, JSON.stringify(db, null, 2)); } catch (_) {} }

export const Store = {
  async getJSON(s, k) { const st = await getStore(s); const v = await st.get(k); return v ? JSON.parse(v) : null; },
  async setJSON(s, k, v) { const st = await getStore(s); await st.set(k, JSON.stringify(v)); },
  async listAll(s) { const st = await getStore(s); const l = await st.list(); const out = []; for (const i of l) { const v = await st.get(i.key); if (v) out.push(JSON.parse(v)); } return out; },
  async delete(s, k) { const st = await getStore(s); await st.delete(k); },
};

export function getStorageMode() { return _storageMode || 'unknown'; }
export function isSupabase() { return _storageMode === 'supabase'; }

// في الإنتاج، استخدم متغير البيئة NETLIFY_AUTH_SECRET.
// في المعاينة المحلية، نستخدم ملف ثابت لتجنب تغير السر بين الطلبات.
const SECRET_FILE = path.join(os.tmpdir(), 'platform_secret.key');
function getDevSecret() {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    }
    const s = 'platform-dev-secret-' + crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, s);
    return s;
  } catch (_) {
    return 'platform-dev-secret-fallback-' + Math.random().toString(36).slice(2);
  }
}
const SECRET = process.env.NETLIFY_AUTH_SECRET || process.env.SECRET || getDevSecret();

export function uid(prefix='id') { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
export function hashPassword(p, salt='platform-static-salt') { return crypto.createHmac('sha256', SECRET).update(salt + ':' + p).digest('hex'); }
export function verifyPassword(p, h, salt='platform-static-salt') { return hashPassword(p, salt) === h; }

export function makeToken(userId, role='user') {
  const payload = { uid: userId, role, ts: Date.now() };
  const sig = crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');
  return Buffer.from(JSON.stringify(payload)).toString('base64') + '.' + sig;
}
export function parseToken(token) {
  if (!token) return null;
  try {
    const [p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64').toString());
    const expected = crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');
    if (s !== expected) return null;
    if (Date.now() - payload.ts > 30 * 86400000) return null;
    return payload;
  } catch (_) { return null; }
}

// ── بيانات دخول الإدارة: إجبارية عبر متغيرات البيئة، بدون أي قيمة احتياطية ──
export function requireAdminCredentials() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('يجب ضبط متغيرَي البيئة ADMIN_EMAIL و ADMIN_PASSWORD على Netlify (Site configuration → Environment variables) — لا توجد قيمة افتراضية بعد الآن.');
  }
  return { email: email.toLowerCase().trim(), password };
}

// ── Migration آمن للإعدادات: يضيف أي حقول جديدة بقيمها الافتراضية ──
export async function ensureSeed() {
  const existing = await Store.getJSON('meta', 'seeded');
  if (existing) {
    // Migration آمن: تحديث الإعدادات بأي حقول جديدة
    const cur = await Store.getJSON('settings', 'main') || {};
    const defaults = defaultSettings();
    let changed = false;
    for (const k of Object.keys(defaults)) {
      if (cur[k] === undefined) { cur[k] = defaults[k]; changed = true; }
    }
    if (changed) await Store.setJSON('settings', 'main', cur);
    return;
  }
  const settings = defaultSettings();
  await Store.setJSON('settings', 'main', settings);
  const { email: adminEmail, password: adminPassword } = requireAdminCredentials();
  await Store.setJSON('admins', adminEmail, { email: adminEmail, password_hash: hashPassword(adminPassword), created_at: new Date().toISOString() });
  await Store.setJSON('admins_by_email', adminEmail, { id: adminEmail });
  await Store.setJSON('meta', 'seeded', { at: new Date().toISOString() });
}

function defaultSettings() {
  return {
    site_name: '[اسم الموقع]',
    site_logo: '',
    site_logo_size: 40,
    hero_title: 'منصتك التعليمية — مذكرات وملخصات ودروس',
    hero_subtitle: 'مذكرات وملخصات ودروس وفيديوهات تعليمية، بعضها مجاني للجميع وبعضها حصري للمشتركين — بأسعار رمزية تناسب كل طالب وطالبة.',
    hero_image: '',
    teacher_name: 'المعلّم/ة',
    site_tagline: 'مذكرات · ملخصات · دروس · بثوث',
    site_description: 'منصة تعليمية لمشاركة المذكرات والملخصات والدروس.',
    theme_color: '#e7a93d',
    theme_mode: 'dark',
    whatsapp_number: '', instagram_url: '', tiktok_url: '', snapchat_url: '', youtube_url: '',
    payment_phone: '', payment_phone_owner: '',
    payment_method_benefit: true, payment_method_vodafone: false,
    currency: 'BHD',
    allow_individual_purchase: true, allow_subscription: true,
    marketplace_enabled: true,
    default_commission_rate: 0.20,
    min_payout_amount: 5.000,
    // جديد: سقف أقصى لخصم الكوبونات (للبائعين) لحماية عمولة المنصة
    max_seller_discount_percent: 30,
    announcement_text: '', announcement_active: false, announcement_color: '#e7a93d',
    maintenance_mode: false, footer_note: '', admin_email: '',
    show_features_section: true, show_steps_section: true, show_reviews_section: true,
    show_faq_section: true, show_plans_section: true, show_subjects_section: true,
    show_latest_section: true, show_sellers_section: true, show_stats_section: true,
    show_individual_section: true, // جديد: قسم الشراء الفردي
    show_bundles_section: true, // جديد: قسم الباقات
    // نظام الإحالة
    referral_enabled: true,
    referral_discount_percent: 10,
    referral_reward_percent: 5, // مكافأة المُحيل من عمولة المنصة
    custom_css: '',
  };
}

export async function requireAdmin(p) {
  const parsed = parseToken(p?.token);
  if (!parsed || parsed.role !== 'admin') return null;
  const a = await Store.getJSON('admins', parsed.uid);
  return a || null;
}
export async function requireUser(p) {
  const parsed = parseToken(p?.token);
  if (!parsed || parsed.role !== 'user') return null;
  const u = await Store.getJSON('users', parsed.uid);
  return u || null;
}

// ── الوصول للمادة (يدعم البائع المالك) ──
export async function checkMaterialAccess(m, user) {
  if (!m.is_locked) return { granted: true, reason: 'free' };
  if (!user) return { granted: false, reason: 'login_required' };
  if (user.role === 'admin') return { granted: true, reason: 'admin' };
  if (m.seller_id) {
    const seller = await Store.getJSON('sellers', m.seller_id);
    if (seller && seller.user_id === user.id) return { granted: true, reason: 'owner' };
  }
  // اشتراك فعّال
  const subs = await Store.listAll('subscriptions');
  const sub = subs.find(s => s.user_id === user.id && s.status === 'active' && new Date(s.expires_at) > new Date());
  if (sub && (m.access === 'subscription' || m.access === 'both')) return { granted: true, reason: 'subscription' };
  // شراء فردي
  const purchases = await Store.listAll('purchases');
  const purchased = purchases.find(p => p.user_id === user.id && p.material_id === m.id);
  if (purchased && (m.access === 'subscription' || m.access === 'individual' || m.access === 'both')) return { granted: true, reason: 'purchase' };
  // باقة تحتوي هذه المادة
  const bundles = await Store.listAll('bundles');
  const bundlePurchases = purchases.filter(p => p.bundle_id);
  for (const bp of bundlePurchases) {
    if (bp.user_id !== user.id) continue;
    const b = bundles.find(x => x.id === bp.bundle_id);
    if (b && (b.materials || []).includes(m.id)) return { granted: true, reason: 'bundle' };
  }
  return { granted: false, reason: 'locked' };
}

export async function logActivity(action, meta = {}) {
  try {
    const entry = { id: uid('log'), action, ts: new Date().toISOString(), ...meta };
    await Store.setJSON('activity_log', entry.id, entry);
    const all = await Store.listAll('activity_log');
    if (all.length > 200) { const old = all.sort((a,b) => new Date(a.ts) - new Date(b.ts)).slice(0, all.length - 200); for (const o of old) await Store.delete('activity_log', o.id); }
  } catch (_) {}
}

// ── إشعارات ──
export async function notifyUser(userId, type, title, body, meta = {}) {
  const n = { id: uid('n'), user_id: userId, type, title, body, read: false, created_at: new Date().toISOString(), ...meta };
  await Store.setJSON('notifications', n.id, n);
  return n;
}

// ── الكوبونات (إدارية + بائع) ──
export async function validateCoupon(code, user, scope = {}) {
  if (!code) return null;
  const list = await Store.listAll('coupons');
  const c = list.find(c => c.code.toLowerCase() === code.toLowerCase().trim() && c.is_active);
  if (!c) return null;
  if (c.expires_at && new Date(c.expires_at) < new Date()) return null;
  if (c.max_uses && c.used_count >= c.max_uses) return null;
  // كوبون بائع: تحقق من النطاق
  if (c.seller_id) {
    // إن حدد مادة، يجب أن تكون من مواد البائع
    if (scope.material_id) {
      const mat = await Store.getJSON('materials', scope.material_id);
      if (!mat || mat.seller_id !== c.seller_id) return null;
    }
    if (scope.bundle_id) {
      const b = await Store.getJSON('bundles', scope.bundle_id);
      if (!b || b.seller_id !== c.seller_id) return null;
    }
  }
  return c;
}

export async function incrementCouponUsage(couponId) {
  const c = await Store.getJSON('coupons', couponId);
  if (c) { c.used_count = (c.used_count || 0) + 1; await Store.setJSON('coupons', c.id, c); }
}

// ── العمولات (تأخذ الخصم بعين الاعتبار) ──
// القاعدة: العمولة تُحسب على المبلغ المدفوع بعد الخصم.
// للكوبون الإداري: المنصة تتحمل الخصم كاملاً (البائع يحصل على حصته من المبلغ بعد الخصم).
// لكوبون البائع: البائع يتحمل الخصم كاملاً (المنصة تأخذ عمولتها من المبلغ الأصلي).
export function calculateCommission(amount, rate, discountType = 'none', discountSource = 'platform') {
  // amount = المبلغ بعد الخصم
  const commission = Math.round(amount * rate * 1000) / 1000;
  const payout = Math.round((amount - commission) * 1000) / 1000;
  return { commission, payout };
}

// ── مساعدة: متوسط تقييم البائع (مع المحاور) ──
export async function getSellerRating(sellerId) {
  const reviews = await Store.listAll('verified_reviews');
  const sellerReviews = reviews.filter(r => r.seller_id === sellerId && r.status === 'visible');
  if (!sellerReviews.length) return { avg: 0, count: 0, axes: {} };
  const sum = sellerReviews.reduce((a, r) => a + (r.rating || 0), 0);
  const axes = { content_quality: { sum: 0, count: 0 }, writing_quality: { sum: 0, count: 0 }, value_for_money: { sum: 0, count: 0 }, delivery_speed: { sum: 0, count: 0 } };
  for (const r of sellerReviews) {
    if (r.ratings) {
      for (const axis of Object.keys(axes)) {
        if (r.ratings[axis] !== undefined) {
          axes[axis].sum += r.ratings[axis];
          axes[axis].count += 1;
        }
      }
    }
  }
  const axesAvg = {};
  for (const axis of Object.keys(axes)) {
    axesAvg[axis] = axes[axis].count ? Math.round((axes[axis].sum / axes[axis].count) * 10) / 10 : 0;
  }
  return { avg: Math.round((sum / sellerReviews.length) * 10) / 10, count: sellerReviews.length, axes: axesAvg };
}

// ── مساعدة: متوسط تقييم مادة (مع المحاور) ──
export async function getMaterialRating(materialId) {
  const reviews = await Store.listAll('verified_reviews');
  const matReviews = reviews.filter(r => r.material_id === materialId && r.status === 'visible');
  if (!matReviews.length) return { avg: 0, count: 0, axes: {}, distribution: {} };
  const sum = matReviews.reduce((a, r) => a + (r.rating || 0), 0);
  const axes = { content_quality: { sum: 0, count: 0 }, writing_quality: { sum: 0, count: 0 }, value_for_money: { sum: 0, count: 0 }, delivery_speed: { sum: 0, count: 0 } };
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of matReviews) {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    if (r.ratings) {
      for (const axis of Object.keys(axes)) {
        if (r.ratings[axis] !== undefined) {
          axes[axis].sum += r.ratings[axis];
          axes[axis].count += 1;
        }
      }
    }
  }
  const axesAvg = {};
  for (const axis of Object.keys(axes)) {
    axesAvg[axis] = axes[axis].count ? Math.round((axes[axis].sum / axes[axis].count) * 10) / 10 : 0;
  }
  return { avg: Math.round((sum / matReviews.length) * 10) / 10, count: matReviews.length, axes: axesAvg, distribution };
}

// ── مساعدة: التحقق من شراء موثّق ──
export async function isVerifiedBuyer(userId, materialId) {
  const orders = await Store.listAll('orders');
  return orders.some(o => o.user_id === userId && o.material_id === materialId && o.status === 'approved');
}

// ── معالج عام ──
export function handler(fn) {
  return async (event) => {
    try {
      await ensureSeed();
      let body = {};
      if (event.body) { try { body = JSON.parse(event.body); } catch (_) { body = {}; } }
      const result = await fn(body, event);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) };
    } catch (err) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message || 'حدث خطأ غير متوقع.' }) };
    }
  };
}

// ── مساعدة: نص محايد للجنس ──
export function genderTerm(gender, femaleForm, maleForm, neutralForm) {
  if (gender === 'female') return femaleForm;
  if (gender === 'male') return maleForm;
  return neutralForm || femaleForm;
}

// ── مساعدة: صفة البائع ──
export function sellerRoleLabel(seller) {
  if (!seller || !seller.role) return 'بائع';
  const map = {
    'student_female': 'طالبة',
    'student_male': 'طالب',
    'teacher_female': 'معلمة',
    'teacher_male': 'معلم',
  };
  return map[seller.role] || 'بائع';
}
