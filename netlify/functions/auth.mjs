// netlify/functions/auth.mjs
// مصادقة العملاء + بيانات البائع + الإشعارات + قائمة الأمنيات + التقييمات الموثّقة + الإحالات
import { Store, hashPassword, verifyPassword, makeToken, requireUser, uid, logActivity, notifyUser, isVerifiedBuyer, getMaterialRating, getSellerRating, genderTerm, sellerRoleLabel, handler as wrapHandler } from './_lib.mjs';

export const handler = wrapHandler(async (body) => {
  const action = body.action;

  if (action === 'register') {
    const { name, email, password, gender, grade, referral_code } = body;
    if (!name?.trim()) throw new Error('يرجى إدخال الاسم.');
    if (!email?.trim()) throw new Error('يرجى إدخال البريد.');
    if (!password) throw new Error('يرجى إدخال كلمة المرور.');
    if (!gender || !['female','male'].includes(gender)) throw new Error('يرجى اختيار الجنس.');
    if (password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل.');
    const en = email.toLowerCase().trim();
    if (await Store.getJSON('users_by_email', en)) throw new Error('البريد مسجّل بالفعل.');

    // معالجة كود الإحالة
    let referredBy = null;
    if (referral_code) {
      const users = await Store.listAll('users');
      const referrer = users.find(u => u.referral_code === referral_code.toUpperCase().trim());
      if (referrer) referredBy = referrer.id;
    }

    // توليد كود إحالة فريد للمستخدم الجديد
    const newRefCode = await generateUniqueReferralCode(name);

    const user = {
      id: uid('u'), name: name.trim(), email: en, password_hash: hashPassword(password),
      gender, grade: grade || '', role: 'member', status: 'active', wishlist: [],
      referral_code: newRefCode, referred_by: referredBy,
      referral_earnings: 0, referral_count: 0,
      created_at: new Date().toISOString(),
    };
    await Store.setJSON('users', user.id, user);
    await Store.setJSON('users_by_email', en, { id: user.id });
    await logActivity('user_registered', { user_id: user.id, email: en, referred_by: referredBy });

    // إن وُجد مُحيل، سجّله
    if (referredBy) {
      const referrer = await Store.getJSON('users', referredBy);
      if (referrer) {
        referrer.referral_count = (referrer.referral_count || 0) + 1;
        await Store.setJSON('users', referrer.id, referrer);
        await notifyUser(referredBy, 'referral_joined', 'انضم مُحال جديد', `${name} سجّل باستخدام كود الإحالة الخاص بك. ستحصل على مكافأة عند أول عملية شراء يقوم بها.`);
      }
    }

    const token = makeToken(user.id, 'user');
    const safe = { ...user }; delete safe.password_hash;
    return { token, customer: safe };
  }

  if (action === 'login') {
    const { email, password } = body;
    if (!email || !password) throw new Error('يرجى إدخال البريد وكلمة المرور.');
    const en = email.toLowerCase().trim();
    const em = await Store.getJSON('users_by_email', en);
    if (!em) throw new Error('بيانات الدخول غير صحيحة.');
    const user = await Store.getJSON('users', em.id);
    if (!user || !verifyPassword(password, user.password_hash)) throw new Error('بيانات الدخول غير صحيحة.');
    if (user.status === 'blocked') throw new Error('تم تعطيل هذا الحساب.');
    const token = makeToken(user.id, 'user');
    await logActivity('user_login', { user_id: user.id });
    const safe = { ...user }; delete safe.password_hash;
    return { token, customer: safe };
  }

  if (action === 'me') {
    const user = await requireUser(body);
    if (!user) throw new Error('انتهت الجلسة.');
    const safe = { ...user }; delete safe.password_hash;
    const subs = await Store.listAll('subscriptions');
    const sub = subs.find(s => s.user_id === user.id && s.status === 'active' && new Date(s.expires_at) > new Date());
    const sellers = await Store.listAll('sellers');
    const seller = sellers.find(s => s.user_id === user.id);
    const notifs = await Store.listAll('notifications');
    const unread = notifs.filter(n => n.user_id === user.id && !n.read).length;
    return {
      customer: safe,
      subscription: sub || null,
      seller: seller ? { id: seller.id, status: seller.status, display_name: seller.display_name, role: seller.role } : null,
      unread_notifications: unread,
    };
  }

  if (action === 'account-summary') {
    const user = await requireUser(body);
    if (!user) throw new Error('انتهت الجلسة.');
    const [orders, subs, purchases, meets, materials, plans, sellers, notifs, bundles, vreviews, activity] = await Promise.all([
      Store.listAll('orders'), Store.listAll('subscriptions'), Store.listAll('purchases'),
      Store.listAll('meets'), Store.listAll('materials'), Store.listAll('plans'),
      Store.listAll('sellers'), Store.listAll('notifications'), Store.listAll('bundles'),
      Store.listAll('verified_reviews'), Store.listAll('activity_log'),
    ]);
    const myOrders = orders.filter(o => o.user_id === user.id).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(o => { const s = { ...o }; delete s.receipt_image_data; return s; });
    const sub = subs.find(s => s.user_id === user.id && s.status === 'active' && new Date(s.expires_at) > new Date());
    const myPurchases = purchases.filter(p => p.user_id === user.id).map(p => ({ ...p, material: materials.find(m => m.id === p.material_id), bundle: bundles.find(b => b.id === p.bundle_id) }));
    const myMeets = meets.filter(m => m.girls_only ? user.gender === 'female' : true).filter(m => !m.scheduled_at || new Date(m.scheduled_at) > new Date(Date.now() - 86400000)).sort((a,b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));
    const seller = sellers.find(s => s.user_id === user.id);
    const myNotifs = notifs.filter(n => n.user_id === user.id).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
    const wishlist = (user.wishlist || []).map(id => materials.find(m => m.id === id)).filter(Boolean);
    // تقييماتي
    const myReviews = vreviews.filter(r => r.user_id === user.id);
    // سجلّ النشاط الشخصي
    const myActivity = activity.filter(a => a.user_id === user.id || (a.user_email === user.email)).sort((a,b) => new Date(b.ts) - new Date(a.ts)).slice(0, 30);
    // تنبيه انتهاء الاشتراك
    let renewalAlert = null;
    if (sub) {
      const daysLeft = Math.ceil((new Date(sub.expires_at) - new Date()) / 86400000);
      if (daysLeft <= 7) renewalAlert = { days_left: daysLeft, plan_id: sub.plan_id, expires_at: sub.expires_at };
    }
    return {
      orders: myOrders, subscription: sub || null, subscription_plan: sub ? plans.find(p => p.id === sub.plan_id) : null,
      purchases: myPurchases, meets: myMeets, notifications: myNotifs, wishlist,
      seller: seller || null,
      my_reviews: myReviews, activity: myActivity, renewal_alert: renewalAlert,
      customer: { ...user, password_hash: undefined },
    };
  }

  if (action === 'update-profile') {
    const user = await requireUser(body);
    if (!user) throw new Error('انتهت الجلسة.');
    if (body.name?.trim()) user.name = body.name.trim();
    if (body.grade !== undefined) user.grade = body.grade;
    if (body.current_password && body.new_password) {
      if (!verifyPassword(body.current_password, user.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة.');
      if (body.new_password.length < 6) throw new Error('كلمة المرور الجديدة قصيرة جداً.');
      user.password_hash = hashPassword(body.new_password);
    }
    await Store.setJSON('users', user.id, user);
    const safe = { ...user }; delete safe.password_hash;
    return { customer: safe };
  }

  // ── قائمة الأمنيات ──
  if (action === 'toggle-wishlist') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    user.wishlist = user.wishlist || [];
    const idx = user.wishlist.indexOf(body.material_id);
    if (idx >= 0) user.wishlist.splice(idx, 1);
    else user.wishlist.push(body.material_id);
    await Store.setJSON('users', user.id, user);
    return { wishlist: user.wishlist, added: idx < 0 };
  }

  // ── الإشعارات ──
  if (action === 'mark-notification-read') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const n = await Store.getJSON('notifications', body.id);
    if (n && n.user_id === user.id) { n.read = true; await Store.setJSON('notifications', n.id, n); }
    return { ok: true };
  }
  if (action === 'mark-all-notifications-read') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const notifs = await Store.listAll('notifications');
    for (const n of notifs) { if (n.user_id === user.id && !n.read) { n.read = true; await Store.setJSON('notifications', n.id, n); } }
    return { ok: true };
  }

  // ── التقييمات الموثّقة (Verified Reviews) — نظام متعدد المحاور ──
  if (action === 'add-review') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const { material_id, rating, content, ratings } = body;
    // ratings: محاور متعددة (اختياري) - {content_quality, writing_quality, value_for_money, delivery_speed}
    if (!material_id) throw new Error('المادة مطلوبة.');
    // التقييم العام مطلوب
    const generalRating = parseInt(rating, 10);
    if (!generalRating || generalRating < 1 || generalRating > 5) throw new Error('التقييم العام يجب أن يكون 1-5.');
    // التحقق من المحاور إن وُجدت
    const validAxes = ['content_quality', 'writing_quality', 'value_for_money', 'delivery_speed'];
    const multiRatings = {};
    if (ratings && typeof ratings === 'object') {
      for (const axis of validAxes) {
        if (ratings[axis] !== undefined && ratings[axis] !== null) {
          const v = parseInt(ratings[axis], 10);
          if (isNaN(v) || v < 1 || v > 5) throw new Error(`تقييم "${axis}" يجب أن يكون 1-5.`);
          multiRatings[axis] = v;
        }
      }
    }
    // المحتوى النصي اختياري الآن (كان إلزامياً)
    const reviewContent = (content || '').trim();
    if (reviewContent.length > 1000) throw new Error('التعليق طويل جداً (الحد 1000 حرف).');
    // تحقق من شراء موثّق
    const verified = await isVerifiedBuyer(user.id, material_id);
    if (!verified) throw new Error('يمكن التقييم فقط بعد إتمام شراء المادة.');
    // منع التكرار - مستخدم واحد = تقييم واحد لكل مادة
    const existing = await Store.listAll('verified_reviews');
    const existingReview = existing.find(r => r.user_id === user.id && r.material_id === material_id);
    if (existingReview) throw new Error('قيمت هذه المادة من قبل. يمكنك تعديل تقييمك.');
    const mat = await Store.getJSON('materials', material_id);
    const orders = await Store.listAll('orders');
    const order = orders.find(o => o.user_id === user.id && o.material_id === material_id && o.status === 'approved');
    const review = {
      id: uid('vr'), user_id: user.id, user_name: user.name, user_gender: user.gender,
      material_id, seller_id: mat?.seller_id || null, order_id: order?.id || null,
      rating: generalRating, // التقييم العام
      ratings: multiRatings, // محاور متعددة (قد تكون فارغة)
      content: reviewContent,
      helpful_count: 0, unhelpful_count: 0, voted_by: {},
      is_edited: false, edit_count: 0,
      status: 'visible', // visible | hidden | flagged
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await Store.setJSON('verified_reviews', review.id, review);
    await logActivity('review_added', { user_id: user.id, material_id, rating: generalRating, review_id: review.id });
    // إشعار البائع إن وُجد
    if (mat?.seller_id) {
      const seller = await Store.getJSON('sellers', mat.seller_id);
      if (seller) {
        await notifyUser(seller.user_id, 'new_review', 'تقييم جديد على مادتك', `حصلت على تقييم ${generalRating} نجوم على "${mat.title}".`, { material_id, review_id: review.id, rating: generalRating });
      }
    }
    return { review: { ...review, voted_by: undefined } };
  }

  // ── تعديل التقييم ──
  if (action === 'edit-review') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const { review_id, rating, content, ratings } = body;
    const review = await Store.getJSON('verified_reviews', review_id);
    if (!review) throw new Error('التقييم غير موجود.');
    if (review.user_id !== user.id) throw new Error('لا تملك صلاحية تعديل هذا التقييم.');
    // منع التعديل بعد 30 يوم
    const daysSinceCreated = (Date.now() - new Date(review.created_at).getTime()) / 86400000;
    if (daysSinceCreated > 30) throw new Error('انتهت فترة التعديل (30 يوم).');
    if (rating) {
      const r = parseInt(rating, 10);
      if (r < 1 || r > 5) throw new Error('التقييم يجب أن يكون 1-5.');
      review.rating = r;
    }
    if (content !== undefined) {
      review.content = content.trim().slice(0, 1000);
    }
    if (ratings && typeof ratings === 'object') {
      const validAxes = ['content_quality', 'writing_quality', 'value_for_money', 'delivery_speed'];
      review.ratings = review.ratings || {};
      for (const axis of validAxes) {
        if (ratings[axis] !== undefined) {
          const v = parseInt(ratings[axis], 10);
          if (!isNaN(v) && v >= 1 && v <= 5) review.ratings[axis] = v;
        }
      }
    }
    review.is_edited = true;
    review.edit_count = (review.edit_count || 0) + 1;
    review.updated_at = new Date().toISOString();
    await Store.setJSON('verified_reviews', review.id, review);
    return { review: { ...review, voted_by: undefined } };
  }

  // ── حذف التقييم ──
  if (action === 'delete-review') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const review = await Store.getJSON('verified_reviews', body.review_id);
    if (!review) throw new Error('التقييم غير موجود.');
    if (review.user_id !== user.id) throw new Error('لا تملك صلاحية حذف هذا التقييم.');
    await Store.delete('verified_reviews', review.id);
    await logActivity('review_deleted', { user_id: user.id, review_id: review.id, material_id: review.material_id });
    return { ok: true };
  }

  // ── التصويت على التقييم (مفيد/غير مفيد) ──
  if (action === 'vote-review') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const { review_id, vote } = body; // vote: 'helpful' | 'unhelpful' | 'none'
    if (!review_id) throw new Error('التقييم مطلوب.');
    if (!['helpful', 'unhelpful', 'none'].includes(vote)) throw new Error('تصويت غير صالح.');
    const review = await Store.getJSON('verified_reviews', review_id);
    if (!review) throw new Error('التقييم غير موجود.');
    if (review.user_id === user.id) throw new Error('لا يمكنك التصويت على تقييمك.');
    review.voted_by = review.voted_by || {};
    // إزالة التصويت السابق
    const prevVote = review.voted_by[user.id];
    if (prevVote === 'helpful') review.helpful_count = Math.max(0, (review.helpful_count || 0) - 1);
    if (prevVote === 'unhelpful') review.unhelpful_count = Math.max(0, (review.unhelpful_count || 0) - 1);
    // تصويت جديد
    if (vote === 'helpful') { review.helpful_count = (review.helpful_count || 0) + 1; review.voted_by[user.id] = 'helpful'; }
    else if (vote === 'unhelpful') { review.unhelpful_count = (review.unhelpful_count || 0) + 1; review.voted_by[user.id] = 'unhelpful'; }
    else { delete review.voted_by[user.id]; }
    await Store.setJSON('verified_reviews', review.id, review);
    return { helpful_count: review.helpful_count, unhelpful_count: review.unhelpful_count, my_vote: review.voted_by[user.id] || 'none' };
  }

  if (action === 'my-reviews') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const reviews = await Store.listAll('verified_reviews');
    return { reviews: reviews.filter(r => r.user_id === user.id).map(r => ({ ...r, voted_by: undefined })) };
  }

  if (action === 'logout') return { ok: true };

  // ── التقديم كبائع (محايد للجنس) ──
  if (action === 'apply-seller') {
    const user = await requireUser(body);
    if (!user) throw new Error('يرجى تسجيل الدخول.');
    const sellers = await Store.listAll('sellers');
    const existing = sellers.find(s => s.user_id === user.id);
    if (existing && existing.status === 'approved') throw new Error('أنتَ/ـِ بائع معتمد بالفعل.');
    if (existing && existing.status === 'pending') throw new Error('طلبك قيد المراجعة.');
    const { display_name, bio, role, subjects, profile_image, sample_url, credential_tags } = body;
    if (!display_name?.trim()) throw new Error('يرجى إدخال اسم العرض.');
    if (!bio?.trim()) throw new Error('يرجى إدخال نبذة تعريفية.');
    if (!role || !['student_female','student_male','teacher_female','teacher_male'].includes(role)) throw new Error('يرجى تحديد الصفة (طالب/طالبة/معلم/معلمة).');
    const seller = {
      id: existing?.id || uid('slr'),
      user_id: user.id, user_email: user.email, user_name: user.name, user_gender: user.gender,
      display_name: display_name.trim(), bio: bio.trim(), role,
      subjects: subjects || '', profile_image: profile_image || '', sample_url: sample_url || '',
      credential_tags: credential_tags || [], // وسوم تخصص/مؤهلات منفصلة
      status: 'pending', commission_rate: null,
      total_earnings: 0, pending_payout: 0, paid_out: 0,
      verified_badge: false, // شارة "موثّق" تمنحها الإدارة يدوياً
      created_at: existing?.created_at || new Date().toISOString(),
      applied_at: new Date().toISOString(),
    };
    await Store.setJSON('sellers', seller.id, seller);
    await logActivity('seller_applied', { seller_id: seller.id, user_id: user.id, role });
    return { seller };
  }

  throw new Error('إجراء غير معروف: ' + action);
});

// ── توليد كود إحالة فريد ──
async function generateUniqueReferralCode(name) {
  const users = await Store.listAll('users');
  const existing = new Set(users.map(u => u.referral_code).filter(Boolean));
  const base = (name || 'USER').replace(/[^a-zA-Z\u0600-\u06FF]/g, '').slice(0, 4).toUpperCase() || 'USER';
  for (let i = 0; i < 100; i++) {
    const code = base + Math.random().toString(36).slice(2, 6).toUpperCase();
    if (!existing.has(code)) return code;
  }
  return 'REF' + Date.now().toString(36).toUpperCase();
}
