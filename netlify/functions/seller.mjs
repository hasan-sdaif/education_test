// netlify/functions/seller.mjs
// وظائف البائع: مواد + باقات + كوبونات + بثوث + سحب
// محايد للجنس: الرسائل تتكيف مع user.gender
import { Store, requireUser, uid, logActivity, notifyUser, calculateCommission, getSellerRating, genderTerm, sellerRoleLabel, handler as wrapHandler } from './_lib.mjs';

export const handler = wrapHandler(async (body) => {
  const action = body.action;
  const user = await requireUser(body);
  if (!user) throw new Error('يرجى تسجيل الدخول.');

  const sellers = await Store.listAll('sellers');
  const seller = sellers.find(s => s.user_id === user.id);
  if (!seller) throw new Error(genderTerm(user.gender, 'لا تملك حساب بائع.', 'لا تملك حساب بائع.', 'لا تملك حساب بائع.'));
  if (seller.status === 'pending') throw new Error('طلبك قيد المراجعة من الإدارة.');
  if (seller.status === 'rejected') throw new Error('لم تتم الموافقة على طلبك.');
  if (seller.status === 'blocked') throw new Error(genderTerm(user.gender, 'تم تعطيل حسابك كبائعة.', 'تم تعطيل حسابك كبائع.', 'تم تعطيل حسابك كبائع.'));

  // ── إحصائيات ──
  if (action === 'stats') {
    const [materials, orders, bundles, coupons, meets] = await Promise.all([
      Store.listAll('materials'), Store.listAll('orders'), Store.listAll('bundles'),
      Store.listAll('coupons'), Store.listAll('meets'),
    ]);
    const myMaterials = materials.filter(m => m.seller_id === seller.id);
    const myBundles = bundles.filter(b => b.seller_id === seller.id);
    const myCoupons = coupons.filter(c => c.seller_id === seller.id);
    const myMeets = meets.filter(m => m.seller_id === seller.id);
    const myOrders = orders.filter(o => o.seller_id === seller.id);
    const approvedOrders = myOrders.filter(o => o.status === 'approved');
    const rating = await getSellerRating(seller.id);
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const ds = new Date(Date.now() - i * 86400000);
      const dStart = new Date(ds.getFullYear(), ds.getMonth(), ds.getDate()).getTime();
      const dEnd = dStart + 86400000;
      const dO = approvedOrders.filter(o => { const t = new Date(o.decided_at || o.created_at).getTime(); return t >= dStart && t < dEnd; });
      last7.push({ date: dStart, label: new Date(dStart).toLocaleDateString('ar-BH', { weekday: 'short', day: 'numeric' }), count: dO.length, revenue: dO.reduce((a, o) => a + Number(o.seller_payout || 0), 0) });
    }
    return {
      stats: {
        materials_total: myMaterials.length,
        materials_approved: myMaterials.filter(m => m.seller_status === 'approved' && m.is_published !== false).length,
        materials_pending: myMaterials.filter(m => m.seller_status === 'pending').length,
        bundles_total: myBundles.length,
        bundles_approved: myBundles.filter(b => b.seller_status === 'approved' && b.is_published !== false).length,
        coupons_total: myCoupons.length,
        meets_total: myMeets.length,
        meets_approved: myMeets.filter(m => m.seller_status === 'approved' && m.is_published !== false).length,
        orders_total: myOrders.length,
        orders_pending: myOrders.filter(o => o.status === 'pending').length,
        orders_approved: approvedOrders.length,
        total_earnings: seller.total_earnings || 0,
        pending_payout: seller.pending_payout || 0,
        paid_out: seller.paid_out || 0,
        commission_rate: seller.commission_rate,
        rating: rating.avg, rating_count: rating.count,
        verified_badge: seller.verified_badge,
      },
      revenue_last7: last7,
      seller: { id: seller.id, display_name: seller.display_name, bio: seller.bio, profile_image: seller.profile_image, subjects: seller.subjects, role: seller.role, commission_rate: seller.commission_rate, created_at: seller.created_at, credential_tags: seller.credential_tags || [], verified_badge: seller.verified_badge },
    };
  }

  // ── مواد البائع ──
  if (action === 'my-materials') {
    const materials = await Store.listAll('materials');
    const orders = await Store.listAll('orders');
    const myMaterials = materials.filter(m => m.seller_id === seller.id).sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    return {
      materials: myMaterials.map(m => ({
        ...m,
        orders_count: orders.filter(o => o.material_id === m.id).length,
        sales_count: orders.filter(o => o.material_id === m.id && o.status === 'approved').length,
      })),
    };
  }

  if (action === 'save-material') {
    const item = body.item;
    if (!item) throw new Error('العنصر مفقود.');
    if (!item.title?.trim()) throw new Error('يرجى إدخال العنوان.');
    if (!item.file_url?.trim()) throw new Error('يرجى إدخال رابط الملف.');
    item.seller_id = seller.id;
    item.seller_status = 'pending';
    item.is_published = true;
    item.is_locked = true;
    if (!item.access) item.access = 'individual';
    if (!item.individual_price || item.individual_price <= 0) item.individual_price = 1;
    if (!item.currency) item.currency = 'BHD';
    if (item.id) {
      const existing = await Store.getJSON('materials', item.id);
      if (!existing || existing.seller_id !== seller.id) throw new Error('لا تملك صلاحية.');
      const updated = { ...existing, ...item, seller_status: 'pending' };
      await Store.setJSON('materials', item.id, updated);
      await logActivity('seller_material_updated', { material_id: item.id, seller_id: seller.id });
      return { item: updated };
    } else {
      item.id = uid('m');
      const base = String(item.title).trim().replace(/[^\u0600-\u06FF\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 40);
      item.slug = base + '-' + item.id.slice(-4);
      item.view_count = 0;
      item.created_at = new Date().toISOString();
      await Store.setJSON('materials', item.id, item);
      await logActivity('seller_material_created', { material_id: item.id, seller_id: seller.id });
      return { item };
    }
  }

  if (action === 'delete-material') {
    const m = await Store.getJSON('materials', body.id);
    if (!m || m.seller_id !== seller.id) throw new Error('المادة غير موجودة أو لا تملك صلاحية.');
    await Store.delete('materials', body.id);
    return { ok: true };
  }

  // ── باقات البائع ──
  if (action === 'my-bundles') {
    const bundles = await Store.listAll('bundles');
    const orders = await Store.listAll('orders');
    const myBundles = bundles.filter(b => b.seller_id === seller.id).sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    return {
      bundles: myBundles.map(b => ({
        ...b,
        sales_count: orders.filter(o => o.bundle_id === b.id && o.status === 'approved').length,
      })),
    };
  }

  if (action === 'save-bundle') {
    const item = body.item;
    if (!item) throw new Error('الباقة مفقودة.');
    if (!item.title?.trim()) throw new Error('يرجى إدخال عنوان الباقة.');
    if (!item.materials || !Array.isArray(item.materials) || item.materials.length < 2) throw new Error('الباقة يجب أن تحتوي على مادتين على الأقل.');
    // تحقق أن كل المواد للبائع
    for (const mid of item.materials) {
      const m = await Store.getJSON('materials', mid);
      if (!m || m.seller_id !== seller.id) throw new Error('إحدى المواد لا تملك صلاحية عليها.');
    }
    item.seller_id = seller.id;
    item.seller_status = 'pending';
    item.is_published = true;
    if (item.id) {
      const existing = await Store.getJSON('bundles', item.id);
      if (!existing || existing.seller_id !== seller.id) throw new Error('لا تملك صلاحية.');
      const updated = { ...existing, ...item, seller_status: 'pending' };
      await Store.setJSON('bundles', item.id, updated);
      await logActivity('seller_bundle_updated', { bundle_id: item.id, seller_id: seller.id });
      return { item: updated };
    } else {
      item.id = uid('bdl');
      item.created_at = new Date().toISOString();
      await Store.setJSON('bundles', item.id, item);
      await logActivity('seller_bundle_created', { bundle_id: item.id, seller_id: seller.id });
      return { item };
    }
  }

  if (action === 'delete-bundle') {
    const b = await Store.getJSON('bundles', body.id);
    if (!b || b.seller_id !== seller.id) throw new Error('الباقة غير موجودة أو لا تملك صلاحية.');
    await Store.delete('bundles', body.id);
    return { ok: true };
  }

  // ── كوبونات البائع ──
  if (action === 'my-coupons') {
    const coupons = await Store.listAll('coupons');
    const myCoupons = coupons.filter(c => c.seller_id === seller.id).sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    return { coupons: myCoupons };
  }

  if (action === 'save-coupon') {
    const settings = await Store.getJSON('settings', 'main');
    const maxDiscount = settings?.max_seller_discount_percent || 30;
    const item = body.item;
    if (!item) throw new Error('الكوبون مفقود.');
    if (!item.code?.trim()) throw new Error('يرجى إدخال كود الكوبون.');
    // سقف الخصم
    if (item.discount_type === 'percent' && Number(item.discount_value) > maxDiscount) {
      throw new Error(`الحد الأقصى للخصم المتاح لك هو ${maxDiscount}%.`);
    }
    // تحقق من عدم تكرار الكود
    const allCoupons = await Store.listAll('coupons');
    if (allCoupons.find(c => c.code.toLowerCase() === item.code.toLowerCase().trim() && c.id !== item.id)) {
      throw new Error('هذا الكود مستخدم بالفعل.');
    }
    item.seller_id = seller.id;
    item.code = item.code.trim().toUpperCase();
    if (item.id) {
      const existing = await Store.getJSON('coupons', item.id);
      if (!existing || existing.seller_id !== seller.id) throw new Error('لا تملك صلاحية.');
      const updated = { ...existing, ...item };
      await Store.setJSON('coupons', item.id, updated);
      return { item: updated };
    } else {
      item.id = uid('cpn');
      item.used_count = 0;
      item.is_active = item.is_active !== false;
      item.created_at = new Date().toISOString();
      await Store.setJSON('coupons', item.id, item);
      await logActivity('seller_coupon_created', { coupon_id: item.id, seller_id: seller.id });
      return { item };
    }
  }

  if (action === 'delete-coupon') {
    const c = await Store.getJSON('coupons', body.id);
    if (!c || c.seller_id !== seller.id) throw new Error('لا تملك صلاحية.');
    await Store.delete('coupons', body.id);
    return { ok: true };
  }

  // ── بثوث البائع ──
  if (action === 'my-meets') {
    const meets = await Store.listAll('meets');
    const myMeets = meets.filter(m => m.seller_id === seller.id).sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    return { meets: myMeets };
  }

  if (action === 'save-meet') {
    const item = body.item;
    if (!item) throw new Error('البث مفقود.');
    if (!item.title?.trim()) throw new Error('يرجى إدخال عنوان البث.');
    if (!item.url?.trim()) throw new Error('يرجى إدخال رابط البث.');
    item.seller_id = seller.id;
    item.seller_status = 'pending';
    item.is_published = true;
    // girls_only مستقلة عن جنس البائع
    if (item.girls_only === undefined) item.girls_only = false;
    if (item.id) {
      const existing = await Store.getJSON('meets', item.id);
      if (!existing || existing.seller_id !== seller.id) throw new Error('لا تملك صلاحية.');
      const updated = { ...existing, ...item, seller_status: 'pending' };
      await Store.setJSON('meets', item.id, updated);
      return { item: updated };
    } else {
      item.id = uid('mt');
      item.created_at = new Date().toISOString();
      await Store.setJSON('meets', item.id, item);
      await logActivity('seller_meet_created', { meet_id: item.id, seller_id: seller.id });
      return { item };
    }
  }

  if (action === 'delete-meet') {
    const m = await Store.getJSON('meets', body.id);
    if (!m || m.seller_id !== seller.id) throw new Error('لا تملك صلاحية.');
    await Store.delete('meets', body.id);
    return { ok: true };
  }

  // ── طلبات البائع ──
  if (action === 'my-orders') {
    const orders = await Store.listAll('orders');
    const myOrders = orders.filter(o => o.seller_id === seller.id).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(o => { const s = { ...o }; delete s.receipt_image_data; return s; });
    return { orders: myOrders };
  }

  // ── طلب سحب الرصيد ──
  if (action === 'request-payout') {
    const settings = await Store.getJSON('settings', 'main');
    const minPayout = settings?.min_payout_amount || 5;
    if (seller.pending_payout < minPayout) throw new Error(`الحد الأدنى للسحب هو ${minPayout} دنانير.`);
    const req = { id: uid('pr'), seller_id: seller.id, amount: seller.pending_payout, status: 'pending', created_at: new Date().toISOString() };
    await Store.setJSON('payout_requests', req.id, req);
    await logActivity('payout_requested', { seller_id: seller.id, amount: seller.pending_payout });
    return { request: req };
  }

  throw new Error('إجراء غير معروف: ' + action);
});
