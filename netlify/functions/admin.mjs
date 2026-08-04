// netlify/functions/admin.mjs
// كل دوال الإدارة: CRUD + stats + sellers + coupons + payouts + export/import/reset
import { Store, hashPassword, verifyPassword, makeToken, requireAdmin, uid, logActivity, notifyUser, calculateCommission, getStorageMode, isSupabase, requireAdminCredentials, handler as wrapHandler } from './_lib.mjs';

export const handler = wrapHandler(async (body) => {
  const action = body.action;

  // ── فحص حالة النظام (عام، لا يحتاج مصادقة) ──
  if (action === 'system-status') {
    return {
      storage_mode: getStorageMode(),
      is_supabase: isSupabase(),
      supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      version: '4.0.0',
    };
  }

  if (action === 'logout') {
    // لا حالة على الخادم لإبطالها (توكن HMAC عديم الحالة) — نُرجع نجاحاً فقط
    // ليتوافق مع استدعاء الواجهة الأمامية Site.adminLogout().
    return { ok: true };
  }

  if (action === 'login') {
    const { email, password } = body;
    if (!email || !password) throw new Error('يرجى إدخال البريد وكلمة المرور.');
    const en = email.toLowerCase().trim();
    const admin = await Store.getJSON('admins', en);
    if (!admin || !verifyPassword(password, admin.password_hash)) throw new Error('بيانات الإدارة غير صحيحة.');
    const token = makeToken(en, 'admin');
    await logActivity('admin_login', { email: en });
    return { token, admin: { email: admin.email } };
  }

  if (action === 'me') {
    const admin = await requireAdmin(body);
    if (!admin) throw new Error('انتهت الجلسة.');
    return { admin: { email: admin.email } };
  }

  const admin = await requireAdmin(body);
  if (!admin) throw new Error('ممنوع. يجب تسجيل دخول الإدارة.');

  if (action === 'stats') {
    const [users, materials, orders, reviews, subs, purchases, meets, plans, subjects, tags, activity, sellers, coupons, payouts, bundles, vreviews, qa, categories, pendingSellerMeets, pendingSellerBundles] = await Promise.all([
      Store.listAll('users'), Store.listAll('materials'), Store.listAll('orders'), Store.listAll('reviews'),
      Store.listAll('subscriptions'), Store.listAll('purchases'), Store.listAll('meets'), Store.listAll('plans'),
      Store.listAll('subjects'), Store.listAll('tags'), Store.listAll('activity_log'),
      Store.listAll('sellers'), Store.listAll('coupons'), Store.listAll('payouts'),
      Store.listAll('bundles'), Store.listAll('verified_reviews'), Store.listAll('qa'),
      Store.listAll('categories'),
      Store.listAll('meets').then(ms => ms.filter(m => m.seller_id && m.seller_status === 'pending')),
      Store.listAll('bundles').then(bs => bs.filter(b => b.seller_status === 'pending')),
    ]);
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const approvedOrders = orders.filter(o => o.status === 'approved');
    const activeSubs = subs.filter(s => s.status === 'active' && new Date(s.expires_at) > new Date());
    const expiringSoon = activeSubs.filter(s => new Date(s.expires_at) < new Date(Date.now() + 7 * 86400000));
    const approvedSellers = sellers.filter(s => s.status === 'approved');
    const pendingSellers = sellers.filter(s => s.status === 'pending');
    const pendingSellerMaterials = materials.filter(m => m.seller_status === 'pending');
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const dayOrders = approvedOrders.filter(o => { const t = new Date(o.decided_at || o.created_at).getTime(); return t >= dayStart && t < dayEnd; });
      last7.push({ date: dayStart, label: new Date(dayStart).toLocaleDateString('ar-BH', { weekday: 'short', day: 'numeric' }), count: dayOrders.length, revenue: dayOrders.reduce((a, o) => a + Number(o.amount || 0), 0), commission: dayOrders.reduce((a, o) => a + Number(o.commission_amount || 0), 0) });
    }
    const recent = orders.slice().sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
    const safeRecent = recent.map(o => { const s = { ...o }; delete s.receipt_image_data; return s; });
    const recentActivity = activity.slice().sort((a,b) => new Date(b.ts) - new Date(a.ts)).slice(0, 12);
    return {
      stats: {
        users: users.length, users_female: users.filter(u => u.gender === 'female').length, users_male: users.filter(u => u.gender === 'male').length,
        users_blocked: users.filter(u => u.status === 'blocked').length,
        materials: materials.length, materials_published: materials.filter(m => m.is_published !== false).length,
        pending_seller_materials: pendingSellerMaterials.length,
        pending_seller_meets: pendingSellerMeets.length,
        pending_seller_bundles: pendingSellerBundles.length,
        subjects: subjects.length, tags: tags.length, categories: categories.length, plans: plans.length,
        bundles: bundles.length, bundles_published: bundles.filter(b => b.is_published !== false).length,
        orders_pending: pendingOrders.length, orders_total: orders.length, orders_approved: approvedOrders.length,
        reviews: reviews.length, reviews_visible: reviews.filter(r => r.is_visible).length,
        verified_reviews: vreviews.length, verified_reviews_visible: vreviews.filter(r => r.status === 'visible').length,
        qa_pending: qa.filter(q => q.status === 'pending').length,
        subscriptions_active: activeSubs.length, subscriptions_expiring: expiringSoon.length,
        purchases: purchases.length, meets_upcoming: meets.filter(m => !m.scheduled_at || new Date(m.scheduled_at) > new Date()).length,
        revenue: approvedOrders.reduce((a, o) => a + Number(o.amount || 0), 0),
        revenue_pending: pendingOrders.reduce((a, o) => a + Number(o.amount || 0), 0),
        total_commission: approvedOrders.reduce((a, o) => a + Number(o.commission_amount || 0), 0),
        sellers_total: sellers.length, sellers_approved: approvedSellers.length, sellers_pending: pendingSellers.length,
        sellers_verified: sellers.filter(s => s.verified_badge).length,
        coupons: coupons.length, coupons_active: coupons.filter(c => c.is_active).length,
        pending_payouts: sellers.reduce((a, s) => a + Number(s.pending_payout || 0), 0),
      },
      revenue_last7: last7,
      top_materials: [...materials].sort((a,b) => (b.view_count||0) - (a.view_count||0)).slice(0, 5).map(m => ({ id: m.id, title: m.title, views: m.view_count || 0, type: m.type, seller_id: m.seller_id })),
      recent_orders: safeRecent, recent_activity: recentActivity,
    };
  }

  if (action === 'list') {
    const what = body.what;
    let items = await Store.listAll(what);
    if (what === 'orders') items = items.map(o => { const s = { ...o }; delete s.receipt_image_data; return s; });
    if (what === 'users') items = items.map(u => { const s = { ...u }; delete s.password_hash; return s; });
    if (what === 'settings') { const s = await Store.getJSON('settings', 'main'); return { items: s || {} }; }
    return { items };
  }

  if (action === 'save') {
    const what = body.what;
    const item = body.item;
    if (!item) throw new Error('العنصر مفقود.');
    if (what === 'settings') {
      const cur = await Store.getJSON('settings', 'main') || {};
      const merged = { ...cur, ...(body.settings || item) };
      await Store.setJSON('settings', 'main', merged);
      await logActivity('settings_updated', { by: admin.email });
      return { settings: merged };
    }
    if (item.id) {
      const existing = await Store.getJSON(what, item.id);
      await Store.setJSON(what, item.id, { ...(existing || {}), ...item });
      await logActivity('item_updated', { store: what, id: item.id, by: admin.email });
    } else {
      const prefixes = { materials:'m', subjects:'s', plans:'p', reviews:'r', meets:'mt', tags:'t', coupons:'c' };
      const prefix = prefixes[what] || 'i';
      item.id = uid(prefix);
      if (what === 'materials' && !item.slug) {
        const base = String(item.title || 'content').trim().replace(/[^\u0600-\u06FF\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 40);
        item.slug = base + '-' + item.id.slice(-4);
      }
      if (what === 'subjects' && !item.slug) item.slug = String(item.name || 'subject').trim().replace(/\s+/g, '-').toLowerCase() + '-' + item.id.slice(-4);
      if (what === 'tags' && !item.slug) item.slug = String(item.name || 'tag').trim().replace(/\s+/g, '-').toLowerCase() + '-' + item.id.slice(-4);
      if (what === 'coupons' && !item.code) item.code = String(item.code || '').toUpperCase();
      if (!item.created_at) item.created_at = new Date().toISOString();
      if (what === 'materials') { item.view_count = 0; if (item.is_published === undefined) item.is_published = true; }
      if (what === 'coupons') { item.used_count = 0; if (item.is_active === undefined) item.is_active = true; }
      await Store.setJSON(what, item.id, item);
      await logActivity('item_created', { store: what, id: item.id, by: admin.email });
    }
    return { item };
  }

  if (action === 'delete') {
    await Store.delete(body.what, body.id);
    await logActivity('item_deleted', { store: body.what, id: body.id, by: admin.email });
    return { ok: true };
  }

  if (action === 'reorder') {
    const what = body.what;
    const orderedIds = body.ids || [];
    for (let i = 0; i < orderedIds.length; i++) {
      const item = await Store.getJSON(what, orderedIds[i]);
      if (item) { item.sort_order = i + 1; await Store.setJSON(what, item.id, item); }
    }
    return { ok: true };
  }

  if (action === 'get-order') {
    const o = await Store.getJSON('orders', body.id);
    if (!o) throw new Error('الطلب غير موجود.');
    return { order: o };
  }

  if (action === 'order-decide') {
    const o = await Store.getJSON('orders', body.id);
    if (!o) throw new Error('الطلب غير موجود.');
    if (o.status !== 'pending') throw new Error('تمت مراجعة هذا الطلب مسبقاً.');
    o.status = body.decision; o.decided_at = new Date().toISOString(); o.decided_by = admin.email;
    o.admin_notes = (body.notes || '').slice(0, 500);
    await Store.setJSON('orders', o.id, o);
    if (body.decision === 'approved') {
      if (o.type === 'subscription') {
        const plan = await Store.getJSON('plans', o.plan_id);
        const expires = new Date(Date.now() + (plan?.duration_days || 30) * 86400000).toISOString();
        const subs = await Store.listAll('subscriptions');
        const existing = subs.find(s => s.user_id === o.user_id);
        const sub = { user_id: o.user_id, plan_id: o.plan_id, started_at: new Date().toISOString(), expires_at: expires, status: 'active', order_id: o.id };
        if (existing?.id) { sub.id = existing.id; await Store.setJSON('subscriptions', sub.id, sub); }
        else { sub.id = uid('sub'); await Store.setJSON('subscriptions', sub.id, sub); }
      } else if (o.type === 'purchase') {
        const purchases = await Store.listAll('purchases');
        if (!purchases.find(p => p.user_id === o.user_id && p.material_id === o.material_id)) {
          const p = { id: uid('pur'), user_id: o.user_id, material_id: o.material_id, order_id: o.id, purchased_at: new Date().toISOString() };
          await Store.setJSON('purchases', p.id, p);
        }
      }
      // إن كان طلب شراء لمادة بائع، أضف المبلغ لحسابه
      if (o.seller_id && o.seller_payout > 0) {
        const seller = await Store.getJSON('sellers', o.seller_id);
        if (seller) {
          seller.pending_payout = (seller.pending_payout || 0) + o.seller_payout;
          seller.total_earnings = (seller.total_earnings || 0) + o.seller_payout;
          await Store.setJSON('sellers', seller.id, seller);
          await notifyUser(seller.user_id, 'order_approved', 'تم قبول طلب على مادتكِ', `طلب جديد بقيمة ${o.seller_payout} ${o.currency} — سيُضاف لرصيدك القابل للسحب.`, { seller_id: seller.id, amount: o.seller_payout });
        }
      }
      // إشعار العميل
      await notifyUser(o.user_id, 'order_approved', 'تم تفعيل طلبك', o.type === 'subscription' ? 'تم تفعيل اشتراكك بنجاح. يمكنك الآن الوصول لكل المحتوى الخاص.' : 'تم تأكيد شرائك. المحتوى مفتوح بحسابك.', { order_id: o.id });
      await logActivity('order_approved', { order_id: o.id, amount: o.amount, by: admin.email });
    } else if (body.decision === 'rejected') {
      await notifyUser(o.user_id, 'order_rejected', 'تم رفض طلبك', `للأسف تم رفض طلبك. ${body.notes ? 'السبب: ' + body.notes : 'تواصل مع الإدارة لمزيد من التفاصيل.'}`, { order_id: o.id });
      await logActivity('order_rejected', { order_id: o.id, by: admin.email });
    }
    return { order: { ...o, receipt_image_data: undefined } };
  }

  if (action === 'toggle-user-status') {
    const u = await Store.getJSON('users', body.id);
    if (!u) throw new Error('المستخدم غير موجود.');
    u.status = u.status === 'blocked' ? 'active' : 'blocked';
    await Store.setJSON('users', u.id, u);
    await logActivity('user_status_changed', { user_id: u.id, status: u.status, by: admin.email });
    const safe = { ...u }; delete safe.password_hash;
    return { user: safe };
  }

  if (action === 'extend-subscription') {
    const subs = await Store.listAll('subscriptions');
    let sub = subs.find(s => s.user_id === body.user_id);
    const days = parseInt(body.days, 10);
    if (!days || days <= 0) throw new Error('عدد الأيام غير صحيح.');
    const baseFrom = sub && sub.status === 'active' && new Date(sub.expires_at) > new Date() ? new Date(sub.expires_at) : new Date();
    const expires = new Date(baseFrom.getTime() + days * 86400000).toISOString();
    const newSub = { user_id: body.user_id, plan_id: body.plan_id, started_at: sub?.started_at || new Date().toISOString(), expires_at: expires, status: 'active', manual: true };
    if (sub?.id) newSub.id = sub.id; else newSub.id = uid('sub');
    await Store.setJSON('subscriptions', newSub.id, newSub);
    await logActivity('subscription_extended', { user_id: body.user_id, days, by: admin.email });
    return { subscription: newSub };
  }

  if (action === 'save-settings') {
    const cur = await Store.getJSON('settings', 'main') || {};
    const merged = { ...cur, ...body.settings };
    if (body.settings?.admin_email) {
      const newEmail = body.settings.admin_email.toLowerCase().trim();
      const oldEmail = cur.admin_email || requireAdminCredentials().email;
      const oldAdmin = await Store.getJSON('admins', oldEmail);
      if (oldAdmin) {
        if (body.settings.admin_password && body.settings.admin_password.length >= 6) oldAdmin.password_hash = hashPassword(body.settings.admin_password);
        oldAdmin.email = newEmail;
        await Store.setJSON('admins', newEmail, oldAdmin);
        await Store.setJSON('admins_by_email', newEmail, { id: newEmail });
        if (oldEmail !== newEmail) { await Store.delete('admins', oldEmail); await Store.delete('admins_by_email', oldEmail); }
      }
      merged.admin_email = newEmail;
      delete merged.admin_password;
    }
    await Store.setJSON('settings', 'main', merged);
    await logActivity('settings_saved', { by: admin.email });
    return { settings: merged };
  }

  // ── إدارة البائعين ──
  if (action === 'decide-seller') {
    const s = await Store.getJSON('sellers', body.id);
    if (!s) throw new Error('البائع غير موجود.');
    s.status = body.decision;
    if (body.decision === 'approved') {
      s.approved_at = new Date().toISOString();
      if (s.commission_rate == null) {
        const settings = await Store.getJSON('settings', 'main');
        s.commission_rate = settings?.default_commission_rate ?? 0.20;
      }
      if (body.commission_rate != null) s.commission_rate = body.commission_rate;
      await notifyUser(s.user_id, 'seller_approved', 'تمت الموافقة على طلبك كبائعة', `أهلاً بك في فريق البائعين! نسبة العمولة: ${Math.round(s.commission_rate * 100)}%. يمكنك الآن إضافة محتواكِ من صفحة "لوحة البائع".`, { seller_id: s.id });
    } else if (body.decision === 'rejected') {
      s.rejected_at = new Date().toISOString();
      s.rejection_reason = body.reason || '';
      await notifyUser(s.user_id, 'seller_rejected', 'تحديث طلب البائع', `للأسف لم تتم الموافقة على طلبك. ${body.reason ? 'السبب: ' + body.reason : ''}`, { seller_id: s.id });
    } else if (body.decision === 'blocked') {
      s.blocked_at = new Date().toISOString();
    }
    await Store.setJSON('sellers', s.id, s);
    await logActivity('seller_decided', { seller_id: s.id, decision: body.decision, by: admin.email });
    return { seller: s };
  }

  if (action === 'update-seller-commission') {
    const s = await Store.getJSON('sellers', body.id);
    if (!s) throw new Error('البائع غير موجود.');
    s.commission_rate = parseFloat(body.commission_rate);
    await Store.setJSON('sellers', s.id, s);
    return { seller: s };
  }

  // ── الموافقة على محتوى البائعين ──
  if (action === 'decide-seller-material') {
    const m = await Store.getJSON('materials', body.id);
    if (!m) throw new Error('المادة غير موجودة.');
    m.seller_status = body.decision; // approved / rejected
    if (body.decision === 'approved' && m.is_published === undefined) m.is_published = true;
    if (body.decision === 'rejected') m.rejection_reason = body.reason || '';
    await Store.setJSON('materials', m.id, m);
    if (m.seller_id) {
      const seller = await Store.getJSON('sellers', m.seller_id);
      if (seller) {
        await notifyUser(seller.user_id, body.decision === 'approved' ? 'material_approved' : 'material_rejected',
          body.decision === 'approved' ? 'تمت الموافقة على مادتكِ' : 'تم رفض مادتكِ',
          body.decision === 'approved' ? `تمت الموافقة على "${m.title}" وهي الآن منشورة.` : `للأسف لم تتم الموافقة على "${m.title}". ${body.reason ? 'السبب: ' + body.reason : ''}`,
          { material_id: m.id });
      }
    }
    await logActivity('seller_material_decided', { material_id: m.id, decision: body.decision, by: admin.email });
    return { material: m };
  }

  // ── المدفوعات للبائعين ──
  if (action === 'mark-payout-paid') {
    const s = await Store.getJSON('sellers', body.id);
    if (!s) throw new Error('البائع غير موجود.');
    const amount = Number(body.amount) || s.pending_payout;
    s.paid_out = (s.paid_out || 0) + amount;
    s.pending_payout = Math.max(0, (s.pending_payout || 0) - amount);
    s.last_payout_at = new Date().toISOString();
    await Store.setJSON('sellers', s.id, s);
    const payout = { id: uid('pyo'), seller_id: s.id, amount, status: 'paid', created_at: new Date().toISOString(), paid_at: new Date().toISOString(), by: admin.email };
    await Store.setJSON('payouts', payout.id, payout);
    await notifyUser(s.user_id, 'payout_paid', 'تم تحويل دفعتك', `تم تحويل ${amount} ${body.currency || 'BHD'} لحسابك. شكراً لك!`, { payout_id: payout.id, amount });
    await logActivity('payout_paid', { seller_id: s.id, amount, by: admin.email });
    return { seller: s, payout };
  }

  // ── منح شارة "موثّق" للبائع ──
  if (action === 'toggle-seller-verified') {
    const s = await Store.getJSON('sellers', body.id);
    if (!s) throw new Error('البائع غير موجود.');
    s.verified_badge = !s.verified_badge;
    if (s.verified_badge && !s.verified_at) s.verified_at = new Date().toISOString();
    await Store.setJSON('sellers', s.id, s);
    await notifyUser(s.user_id, s.verified_badge ? 'verified_granted' : 'verified_removed', s.verified_badge ? 'حصلت على شارة موثّق' : 'تمت إزالة شارة الموثّق', s.verified_badge ? 'منحتكِ الإدارة شارة "موثّق" لملفك.' : 'أزالت الإدارة شارة الموثّق من ملفك.');
    await logActivity('seller_verified_toggled', { seller_id: s.id, verified: s.verified_badge, by: admin.email });
    return { seller: s };
  }

  // ── اعتماد/رفض باقة بائع ──
  if (action === 'decide-seller-bundle') {
    const b = await Store.getJSON('bundles', body.id);
    if (!b) throw new Error('الباقة غير موجودة.');
    b.seller_status = body.decision;
    if (body.decision === 'rejected') b.rejection_reason = body.reason || '';
    await Store.setJSON('bundles', b.id, b);
    if (b.seller_id) {
      const seller = await Store.getJSON('sellers', b.seller_id);
      if (seller) {
        await notifyUser(seller.user_id, body.decision === 'approved' ? 'bundle_approved' : 'bundle_rejected',
          body.decision === 'approved' ? 'تمت الموافقة على باقتك' : 'تم رفض باقتك',
          body.decision === 'approved' ? `تمت الموافقة على "${b.title}".` : `للأسف لم تتم الموافقة على "${b.title}". ${body.reason ? 'السبب: ' + body.reason : ''}`);
      }
    }
    await logActivity('seller_bundle_decided', { bundle_id: b.id, decision: body.decision, by: admin.email });
    return { bundle: b };
  }

  // ── اعتماد/رفض بث بائع ──
  if (action === 'decide-seller-meet') {
    const m = await Store.getJSON('meets', body.id);
    if (!m) throw new Error('البث غير موجود.');
    m.seller_status = body.decision;
    if (body.decision === 'rejected') m.rejection_reason = body.reason || '';
    await Store.setJSON('meets', m.id, m);
    if (m.seller_id) {
      const seller = await Store.getJSON('sellers', m.seller_id);
      if (seller) {
        await notifyUser(seller.user_id, body.decision === 'approved' ? 'meet_approved' : 'meet_rejected',
          body.decision === 'approved' ? 'تمت الموافقة على بثك' : 'تم رفض بثك',
          body.decision === 'approved' ? `تمت الموافقة على "${m.title}".` : `للأسف لم تتم الموافقة على "${m.title}". ${body.reason ? 'السبب: ' + body.reason : ''}`);
      }
    }
    await logActivity('seller_meet_decided', { meet_id: m.id, decision: body.decision, by: admin.email });
    return { meet: m };
  }

  // ── إدارة التقييمات الموثّقة ──
  if (action === 'list-verified-reviews') {
    const reviews = await Store.listAll('verified_reviews');
    let list = reviews.slice();
    if (body.status) list = list.filter(r => r.status === body.status);
    if (body.material_id) list = list.filter(r => r.material_id === body.material_id);
    if (body.seller_id) list = list.filter(r => r.seller_id === body.seller_id);
    list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return { reviews: list };
  }
  if (action === 'moderate-review') {
    const r = await Store.getJSON('verified_reviews', body.id);
    if (!r) throw new Error('التقييم غير موجود.');
    r.status = body.status; // visible | hidden | flagged
    if (body.moderation_note) r.moderation_note = body.moderation_note;
    await Store.setJSON('verified_reviews', r.id, r);
    await logActivity('review_moderated', { review_id: r.id, status: body.status, by: admin.email });
    return { review: r };
  }

  // ── إدارة الأسئلة والأجوبة ──
  if (action === 'list-qa') {
    const qas = await Store.listAll('qa');
    let list = qas.slice();
    if (body.status) list = list.filter(q => q.status === body.status);
    list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return { qa: list };
  }
  if (action === 'answer-qa') {
    const q = await Store.getJSON('qa', body.id);
    if (!q) throw new Error('السؤال غير موجود.');
    q.answer = (body.answer || '').trim();
    q.status = q.answer ? 'answered' : 'pending';
    q.answered_at = new Date().toISOString();
    q.answered_by = admin.email;
    await Store.setJSON('qa', q.id, q);
    if (q.user_id) await notifyUser(q.user_id, 'qa_answered', 'تم الرد على سؤالك', `تم الرد على سؤالك في "${q.material_id}".`);
    return { qa: q };
  }

  // ── دمج/إعادة تسمية/أرشفة الوسوم ──
  if (action === 'merge-tags') {
    const { source_id, target_id } = body;
    if (!source_id || !target_id || source_id === target_id) throw new Error('معرّفات غير صحيحة.');
    const materials = await Store.listAll('materials');
    for (const m of materials) {
      if ((m.tags || []).includes(source_id)) {
        m.tags = (m.tags || []).filter(t => t !== source_id);
        if (!m.tags.includes(target_id)) m.tags.push(target_id);
        await Store.setJSON('materials', m.id, m);
      }
    }
    // حذف الوسم المصدر
    await Store.delete('tags', source_id);
    await logActivity('tags_merged', { source_id, target_id, by: admin.email });
    return { ok: true };
  }

  // ── تصنيفات هرمية (categories) ──
  if (action === 'save-category') {
    const item = body.item;
    if (!item.name?.trim()) throw new Error('الاسم مطلوب.');
    if (!item.id) {
      item.id = uid('cat');
      item.created_at = new Date().toISOString();
    }
    await Store.setJSON('categories', item.id, item);
    return { item };
  }

  if (action === 'export-data') {
    const stores = ['users','subjects','tags','categories','materials','plans','bundles','orders','subscriptions','purchases','reviews','verified_reviews','qa','meets','sellers','coupons','payouts','payout_requests','notifications','settings','activity_log'];
    const out = { _exported_at: new Date().toISOString(), _version: 4 };
    for (const s of stores) { if (s === 'settings') out.settings = await Store.getJSON('settings', 'main'); else out[s] = await Store.listAll(s); }
    return { data: out };
  }

  if (action === 'import-data') {
    const data = body.data;
    if (!data || typeof data !== 'object') throw new Error('بيانات الاستيراد غير صحيحة.');
    const stores = ['users','subjects','tags','categories','materials','plans','bundles','orders','subscriptions','purchases','reviews','verified_reviews','qa','meets','sellers','coupons','payouts','payout_requests','notifications'];
    const counts = {};
    for (const s of stores) {
      if (Array.isArray(data[s])) {
        const existing = await Store.listAll(s);
        for (const it of existing) await Store.delete(s, it.id || it.key);
        for (const it of data[s]) { if (it.id) await Store.setJSON(s, it.id, it); }
        counts[s] = data[s].length;
      }
    }
    if (data.settings) { await Store.setJSON('settings', 'main', data.settings); counts.settings = 1; }
    await logActivity('data_imported', { counts, by: admin.email });
    return { ok: true, counts };
  }

  if (action === 'reset-all') {
    const stores = ['users','users_by_email','subjects','tags','categories','materials','plans','bundles','orders','subscriptions','purchases','reviews','verified_reviews','qa','meets','sellers','coupons','payouts','payout_requests','notifications','activity_log','admins_by_email'];
    for (const store of stores) { const items = await Store.listAll(store); for (const it of items) await Store.delete(store, it.id || it.key); }
    await Store.delete('meta', 'seeded');
    const { email: adminEmail, password: adminPassword } = requireAdminCredentials();
    await Store.setJSON('admins', adminEmail, { email: adminEmail, password_hash: hashPassword(adminPassword), created_at: new Date().toISOString() });
    await Store.setJSON('admins_by_email', adminEmail, { id: adminEmail });
    await Store.setJSON('meta', 'seeded', { at: new Date().toISOString(), reset: true });
    return { ok: true };
  }

  throw new Error('إجراء إدارة غير معروف: ' + action);
});
