// netlify/functions/content.mjs
// قراءة عامة: settings/subjects/tags/categories/plans/reviews/list/get/meets/sellers/coupons/bundles/verified-reviews
import { Store, requireUser, checkMaterialAccess, getMaterialRating, getSellerRating, uid, handler as wrapHandler } from './_lib.mjs';

export const handler = wrapHandler(async (body) => {
  const action = body.action;

  if (action === 'settings') {
    const s = await Store.getJSON('settings', 'main');
    const safe = { ...(s || {}) };
    delete safe.admin_email;
    return { settings: safe };
  }

  if (action === 'subjects') {
    const list = await Store.listAll('subjects');
    list.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    return { subjects: list };
  }

  // ── تصنيف هرمي: مادة → فصل/وحدة ──
  if (action === 'categories') {
    const list = await Store.listAll('categories');
    return { categories: list };
  }

  if (action === 'tags') {
    const list = await Store.listAll('tags');
    list.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    return { tags: list };
  }

  if (action === 'plans') {
    const list = await Store.listAll('plans');
    list.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    return { plans: list };
  }

  // ── آراء مختارة (تسويقية — قديمة) ──
  if (action === 'reviews') {
    const list = await Store.listAll('reviews');
    const visible = list.filter(r => r.is_visible).sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 12);
    return { reviews: visible };
  }

  // ── تقييمات موثّقة (Verified Reviews) — مع إخفاء voted_by ──
  if (action === 'verified-reviews') {
    const list = await Store.listAll('verified_reviews');
    let filtered = list.filter(r => r.status === 'visible');
    if (body.material_id) filtered = filtered.filter(r => r.material_id === body.material_id);
    if (body.seller_id) filtered = filtered.filter(r => r.seller_id === body.seller_id);
    // الفرز: الأحدث أولاً، أو الأكثر فائدة
    const sortBy = body.sort || 'newest';
    if (sortBy === 'helpful') {
      filtered.sort((a,b) => (b.helpful_count||0) - (a.helpful_count||0));
    } else if (sortBy === 'rating_high') {
      filtered.sort((a,b) => (b.rating||0) - (a.rating||0));
    } else if (sortBy === 'rating_low') {
      filtered.sort((a,b) => (a.rating||0) - (b.rating||0));
    } else {
      filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    }
    // إخفاء voted_by إلا تصويت المستخدم الحالي
    const user = await requireUser(body);
    const safe = filtered.map(r => {
      const my_vote = (user && r.voted_by && r.voted_by[user.id]) ? r.voted_by[user.id] : 'none';
      return { ...r, voted_by: undefined, my_vote };
    });
    return { reviews: safe };
  }

  // ── ملخص التقييمات لمادة (مع توزيع المحاور) ──
  if (action === 'review-summary') {
    const list = await Store.listAll('verified_reviews');
    const matReviews = list.filter(r => r.material_id === body.material_id && r.status === 'visible');
    if (!matReviews.length) return { summary: null };
    const summary = {
      total: matReviews.length,
      avg_rating: Math.round((matReviews.reduce((a, r) => a + (r.rating||0), 0) / matReviews.length) * 10) / 10,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      axes: { content_quality: { sum: 0, count: 0 }, writing_quality: { sum: 0, count: 0 }, value_for_money: { sum: 0, count: 0 }, delivery_speed: { sum: 0, count: 0 } },
      total_helpful: matReviews.reduce((a, r) => a + (r.helpful_count||0), 0),
    };
    for (const r of matReviews) {
      summary.distribution[r.rating] = (summary.distribution[r.rating] || 0) + 1;
      if (r.ratings) {
        for (const axis of Object.keys(summary.axes)) {
          if (r.ratings[axis] !== undefined) {
            summary.axes[axis].sum += r.ratings[axis];
            summary.axes[axis].count += 1;
          }
        }
      }
    }
    // متوسط كل محور
    for (const axis of Object.keys(summary.axes)) {
      const a = summary.axes[axis];
      a.avg = a.count ? Math.round((a.sum / a.count) * 10) / 10 : 0;
    }
    return { summary };
  }

  // ── قائمة الباقات ──
  if (action === 'bundles') {
    let list = await Store.listAll('bundles');
    if (body.seller_id) list = list.filter(b => b.seller_id === body.seller_id);
    const sellers = await Store.listAll('sellers');
    const approvedSellerIds = new Set(sellers.filter(s => s.status === 'approved').map(s => s.id));
    const user = await requireUser(body);
    if (!user || user.role !== 'admin') {
      list = list.filter(b => b.is_published !== false && b.seller_status !== 'pending' && approvedSellerIds.has(b.seller_id));
    }
    list.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    // إرفاق معلومات البائع
    const sellersMap = {};
    sellers.forEach(s => sellersMap[s.id] = { id: s.id, display_name: s.display_name, profile_image: s.profile_image });
    list = list.map(b => ({ ...b, seller: b.seller_id ? sellersMap[b.seller_id] : null }));
    return { bundles: list };
  }

  if (action === 'list') {
    let list = await Store.listAll('materials');
    // فلترة
    if (body.subject) {
      const subjects = await Store.listAll('subjects');
      const s = subjects.find(s => s.slug === body.subject);
      if (s) list = list.filter(m => m.subject_id === s.id);
    }
    if (body.category) list = list.filter(m => m.category_id === body.category);
    if (body.type) list = list.filter(m => m.type === body.type);
    if (body.seller_id) list = list.filter(m => m.seller_id === body.seller_id);

    // ── فلترة متعددة الوسوم (AND/OR) ──
    if (body.tags && Array.isArray(body.tags) && body.tags.length) {
      const mode = body.tag_mode || 'and'; // and | or
      list = list.filter(m => {
        const mTags = m.tags || [];
        if (mode === 'and') return body.tags.every(t => mTags.includes(t));
        return body.tags.some(t => mTags.includes(t));
      });
    } else if (body.tag) {
      list = list.filter(m => (m.tags || []).includes(body.tag));
    }

    // ── فلترة طريقة الحصول (individual / subscription / both) ──
    if (body.access_mode) {
      if (body.access_mode === 'free') list = list.filter(m => !m.is_locked);
      else if (body.access_mode === 'individual') list = list.filter(m => m.is_locked && (m.access === 'individual' || m.access === 'both'));
      else if (body.access_mode === 'subscription') list = list.filter(m => m.is_locked && (m.access === 'subscription' || m.access === 'both'));
    }

    if (body.q) {
      const q = String(body.q).toLowerCase();
      list = list.filter(m => (m.title||'').toLowerCase().includes(q) || (m.description||'').toLowerCase().includes(q) || (m.search_tags||'').toLowerCase().includes(q));
    }

    const user = await requireUser(body);
    if (!user || user.gender !== 'female') list = list.filter(m => !m.girls_only);

    // إخفاء محتوى البائعين غير المعتمد + المسودات
    const sellers = await Store.listAll('sellers');
    const approvedSellerIds = new Set(sellers.filter(s => s.status === 'approved').map(s => s.id));
    if (!user || user.role !== 'admin') {
      list = list.filter(m => {
        if (m.is_published === false) return false;
        if (m.seller_id) {
          if (!approvedSellerIds.has(m.seller_id)) return false;
          if (m.seller_status !== 'approved') return false;
        }
        return true;
      });
    }

    // ── الفرز ──
    const sortBy = body.sort || 'newest';
    if (sortBy === 'newest') list.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    else if (sortBy === 'oldest') list.sort((a,b) => new Date(a.created_at||0) - new Date(b.created_at||0));
    else if (sortBy === 'price_low') list.sort((a,b) => (Number(a.individual_price)||0) - (Number(b.individual_price)||0));
    else if (sortBy === 'price_high') list.sort((a,b) => (Number(b.individual_price)||0) - (Number(a.individual_price)||0));
    else if (sortBy === 'views') list.sort((a,b) => (b.view_count||0) - (a.view_count||0));
    else if (sortBy === 'rating') {
      // سنفرز بعد إرفاق التقييمات
    }

    // إرفاق معلومات البائع + التقييم
    const sellersMap = {};
    sellers.forEach(s => sellersMap[s.id] = { id: s.id, display_name: s.display_name, profile_image: s.profile_image, role: s.role, verified_badge: s.verified_badge });
    const allReviews = await Store.listAll('verified_reviews');
    const allOrders = await Store.listAll('orders');

    list = await Promise.all(list.map(async m => {
      const seller = m.seller_id ? sellersMap[m.seller_id] : null;
      const matReviews = allReviews.filter(r => r.material_id === m.id && r.status === 'visible');
      const ratingSum = matReviews.reduce((a, r) => a + (r.rating||0), 0);
      const rating = matReviews.length ? Math.round((ratingSum / matReviews.length) * 10) / 10 : 0;
      const salesCount = allOrders.filter(o => o.material_id === m.id && o.status === 'approved').length;
      return {
        ...m, seller,
        rating, rating_count: matReviews.length,
        sales_count: salesCount,
        is_bestseller: salesCount >= 10, // شارة "الأكثر مبيعاً"
        is_new: (Date.now() - new Date(m.created_at || 0).getTime()) < 7 * 86400000, // شارة "الأحدث" (آخر 7 أيام)
      };
    }));

    // فرز حسب التقييم (بعد إرفاقه)
    if (sortBy === 'rating') list.sort((a,b) => (b.rating||0) - (a.rating||0));

    return { materials: list };
  }

  if (action === 'get') {
    const list = await Store.listAll('materials');
    const m = list.find(x => x.slug === body.slug || x.id === body.id);
    if (!m) throw new Error('المحتوى غير موجود.');
    if (m.is_published === false) {
      const user = await requireUser(body);
      if (!user || user.role !== 'admin') throw new Error('هذا المحتوى غير منشور.');
    }
    const user = await requireUser(body);
    const access = await checkMaterialAccess(m, user);
    const subjects = await Store.listAll('subjects');
    const tags = await Store.listAll('tags');
    const subject = subjects.find(s => s.id === m.subject_id);
    const materialTags = (m.tags || []).map(tid => tags.find(t => t.id === tid)).filter(Boolean);
    let seller = null;
    if (m.seller_id) {
      const s = await Store.getJSON('sellers', m.seller_id);
      if (s) {
        const sellerRating = await getSellerRating(s.id);
        seller = { id: s.id, display_name: s.display_name, profile_image: s.profile_image, bio: s.bio, role: s.role, verified_badge: s.verified_badge, credential_tags: s.credential_tags || [], rating: sellerRating.avg, rating_count: sellerRating.count };
      }
    }
    // محتوى ذو صلة
    const related = list.filter(x => x.id !== m.id && x.subject_id === m.subject_id && x.is_published !== false && (!x.seller_id || x.seller_status === 'approved')).slice(0, 4).map(x => ({ id: x.id, title: x.title, slug: x.slug, type: x.type, cover_image_url: x.cover_image_url, is_locked: x.is_locked, individual_price: x.individual_price, currency: x.currency }));
    // تقييمات المادة
    const allReviews = await Store.listAll('verified_reviews');
    const matReviews = allReviews.filter(r => r.material_id === m.id && r.status === 'visible').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const ratingSum = matReviews.reduce((a, r) => a + (r.rating||0), 0);
    const rating = matReviews.length ? Math.round((ratingSum / matReviews.length) * 10) / 10 : 0;
    // أسئلة وأجوبة
    const qas = await Store.listAll('qa');
    const materialQAs = qas.filter(q => q.material_id === m.id && q.status === 'answered').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const safe = { ...m };
    if (!access.granted) { safe.file_url = ''; safe.extra_attachments = []; }
    m.view_count = (m.view_count || 0) + 1;
    await Store.setJSON('materials', m.id, m);
    return {
      material: safe, subject, tags: materialTags, access, seller, related,
      reviews: matReviews, rating, rating_count: matReviews.length,
      qa: materialQAs,
    };
  }

  if (action === 'meets') {
    const list = await Store.listAll('meets');
    const user = await requireUser(body);
    const visible = list.filter(m => m.girls_only ? user?.gender === 'female' : true).filter(m => m.is_published !== false && m.seller_status !== 'pending').filter(m => !m.scheduled_at || new Date(m.scheduled_at) > new Date(Date.now() - 86400000)).sort((a,b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));
    // إرفاق البائع
    const sellers = await Store.listAll('sellers');
    const sm = {};
    sellers.forEach(s => sm[s.id] = { id: s.id, display_name: s.display_name, profile_image: s.profile_image });
    const out = visible.map(m => ({ ...m, seller: m.seller_id ? sm[m.seller_id] : null }));
    return { meets: out };
  }

  if (action === 'sellers') {
    const list = await Store.listAll('sellers');
    const materials = await Store.listAll('materials');
    const approved = list.filter(s => s.status === 'approved').map(async s => {
      const rating = await getSellerRating(s.id);
      return {
        id: s.id, display_name: s.display_name, bio: s.bio, profile_image: s.profile_image,
        subjects: s.subjects, role: s.role, verified_badge: s.verified_badge,
        credential_tags: s.credential_tags || [],
        materials_count: materials.filter(m => m.seller_id === s.id && m.is_published !== false && m.seller_status === 'approved').length,
        rating: rating.avg, rating_count: rating.count,
        created_at: s.created_at,
      };
    });
    return { sellers: await Promise.all(approved) };
  }

  if (action === 'seller-profile') {
    const sellers = await Store.listAll('sellers');
    const s = sellers.find(x => x.id === body.id || x.display_name === body.name);
    if (!s || s.status !== 'approved') throw new Error('البائع غير موجود.');
    const materials = await Store.listAll('materials');
    const bundles = await Store.listAll('bundles');
    const meets = await Store.listAll('meets');
    const sellerMaterials = materials.filter(m => m.seller_id === s.id && m.is_published !== false && m.seller_status === 'approved').sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    const sellerBundles = bundles.filter(b => b.seller_id === s.id && b.is_published !== false && b.seller_status === 'approved');
    const sellerMeets = meets.filter(m => m.seller_id === s.id && m.is_published !== false && m.seller_status === 'approved' && (!m.scheduled_at || new Date(m.scheduled_at) > new Date(Date.now() - 86400000)));
    const rating = await getSellerRating(s.id);
    return {
      seller: { id: s.id, display_name: s.display_name, bio: s.bio, profile_image: s.profile_image, subjects: s.subjects, role: s.role, verified_badge: s.verified_badge, credential_tags: s.credential_tags || [], rating: rating.avg, rating_count: rating.count, created_at: s.created_at, total_sales: materials.filter(m => m.seller_id === s.id).reduce((a, m) => a + (m.sales_count || 0), 0) },
      materials: sellerMaterials, bundles: sellerBundles, meets: sellerMeets,
    };
  }

  if (action === 'public-stats') {
    const [materials, subjects, reviews, users, sellers, plans, bundles, vreviews] = await Promise.all([
      Store.listAll('materials'), Store.listAll('subjects'), Store.listAll('reviews'),
      Store.listAll('users'), Store.listAll('sellers'), Store.listAll('plans'),
      Store.listAll('bundles'), Store.listAll('verified_reviews'),
    ]);
    const approvedSellers = sellers.filter(s => s.status === 'approved');
    return {
      stats: {
        materials: materials.filter(m => m.is_published !== false && !m.girls_only && (!m.seller_id || m.seller_status === 'approved')).length,
        subjects: subjects.length, reviews: reviews.filter(r => r.is_visible).length,
        students: users.length, sellers: approvedSellers.length, plans: plans.length,
        bundles: bundles.filter(b => b.is_published !== false).length,
        verified_reviews: vreviews.filter(r => r.status === 'visible').length,
      }
    };
  }

  if (action === 'validate-coupon') {
    const code = body.code;
    if (!code) return { valid: false, error: 'أدخل كود الخصم.' };
    const list = await Store.listAll('coupons');
    const c = list.find(c => c.code.toLowerCase() === code.toLowerCase().trim() && c.is_active);
    if (!c) return { valid: false, error: 'كود غير صحيح.' };
    if (c.expires_at && new Date(c.expires_at) < new Date()) return { valid: false, error: 'انتهت صلاحية الكود.' };
    if (c.max_uses && c.used_count >= c.max_uses) return { valid: false, error: 'استُنفد هذا الكود.' };
    // إن كان كوبون بائع، تحقق من النطاق
    if (c.seller_id) {
      if (body.material_id) {
        const mat = await Store.getJSON('materials', body.material_id);
        if (!mat || mat.seller_id !== c.seller_id) return { valid: false, error: 'هذا الكود لا ينطبق على هذه المادة.' };
      }
      if (body.bundle_id) {
        const b = await Store.getJSON('bundles', body.bundle_id);
        if (!b || b.seller_id !== c.seller_id) return { valid: false, error: 'هذا الكود لا ينطبق على هذه الباقة.' };
      }
    }
    return { valid: true, coupon: { id: c.id, code: c.code, discount_type: c.discount_type, discount_value: c.discount_value, seller_id: c.seller_id || null } };
  }

  // ── أسئلة وأجوبة ──
  if (action === 'ask-question') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const { material_id, question } = body;
    if (!material_id || !question?.trim()) throw new Error('السؤال مطلوب.');
    const qa = { id: uid('qa'), material_id, user_id: user.id, user_name: user.name, question: question.trim(), answer: '', status: 'pending', created_at: new Date().toISOString() };
    await Store.setJSON('qa', qa.id, qa);
    return { qa };
  }

  throw new Error('إجراء غير معروف: ' + action);
});
