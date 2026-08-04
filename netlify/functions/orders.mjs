// netlify/functions/orders.mjs
// إنشاء الطلبات + الكوبونات (إدارية + بائع) + الباقات + الإحالات
import { Store, requireUser, uid, logActivity, notifyUser, validateCoupon, incrementCouponUsage, calculateCommission, handler as wrapHandler } from './_lib.mjs';

export const handler = wrapHandler(async (body) => {
  const action = body.action;

  if (action === 'create') {
    const user = await requireUser(body);
    if (!user) throw new Error('يرجى تسجيل الدخول.');

    let amount = 0, currency = 'BHD', plan_id = null, material_id = null, bundle_id = null, type = '';
    let seller_id = null, commission_amount = 0, seller_payout = 0;
    let originalAmount = 0;

    if (body.plan_id) {
      const plan = await Store.getJSON('plans', body.plan_id);
      if (!plan) throw new Error('الخطة غير موجودة.');
      if (plan.is_active === false) throw new Error('هذه الخطة غير متاحة.');
      amount = Number(plan.price) || 0; currency = plan.currency || 'BHD';
      plan_id = plan.id; type = 'subscription';
      originalAmount = amount;
    } else if (body.material_id) {
      const list = await Store.listAll('materials');
      const m = list.find(x => x.id === body.material_id);
      if (!m) throw new Error('المحتوى غير موجود.');
      if (!m.is_locked) throw new Error('هذا المحتوى مجاني.');
      amount = Number(m.individual_price) || 0; currency = m.currency || 'BHD';
      material_id = m.id; type = 'purchase';
      originalAmount = amount;
      if (m.seller_id) {
        const seller = await Store.getJSON('sellers', m.seller_id);
        if (seller && seller.status === 'approved') {
          seller_id = seller.id;
          const rate = seller.commission_rate != null ? seller.commission_rate : 0.20;
          const c = calculateCommission(amount, rate);
          commission_amount = c.commission;
          seller_payout = c.payout;
        }
      }
    } else if (body.bundle_id) {
      // شراء باقة بائع
      const bundles = await Store.listAll('bundles');
      const b = bundles.find(x => x.id === body.bundle_id);
      if (!b) throw new Error('الباقة غير موجودة.');
      amount = Number(b.price) || 0; currency = b.currency || 'BHD';
      bundle_id = b.id; type = 'bundle_purchase';
      originalAmount = amount;
      if (b.seller_id) {
        const seller = await Store.getJSON('sellers', b.seller_id);
        if (seller && seller.status === 'approved') {
          seller_id = seller.id;
          const rate = seller.commission_rate != null ? seller.commission_rate : 0.20;
          const c = calculateCommission(amount, rate);
          commission_amount = c.commission;
          seller_payout = c.payout;
        }
      }
    } else throw new Error('يجب تحديد خطة أو ملف أو باقة.');

    // تطبيق الكوبون
    let coupon_id = null, discount_amount = 0, coupon_owner = null; // 'platform' | 'seller'
    if (body.coupon_code) {
      const coupon = await validateCoupon(body.coupon_code, user, { material_id, bundle_id });
      if (!coupon) throw new Error('كود الخصم غير صحيح أو لا ينطبق.');
      coupon_id = coupon.id;
      coupon_owner = coupon.seller_id ? 'seller' : 'platform';
      if (coupon.discount_type === 'percent') {
        discount_amount = Math.round(amount * coupon.discount_value / 100 * 1000) / 1000;
      } else {
        discount_amount = Math.min(amount, Number(coupon.discount_value));
      }
      amount = Math.max(0, amount - discount_amount);
      // إعادة حساب العمولة على المبلغ بعد الخصم
      if (seller_id) {
        const seller = await Store.getJSON('sellers', seller_id);
        const rate = seller.commission_rate != null ? seller.commission_rate : 0.20;
        const c = calculateCommission(amount, rate);
        commission_amount = c.commission;
        seller_payout = c.payout;
      }
    }

    const existingOrders = await Store.listAll('orders');
    const dupKey = type === 'subscription' ? plan_id : (type === 'purchase' ? material_id : bundle_id);
    const dup = existingOrders.find(o => o.user_id === user.id && o.status === 'pending' && o.type === type && (
      (type === 'subscription' && o.plan_id === plan_id) ||
      (type === 'purchase' && o.material_id === material_id) ||
      (type === 'bundle_purchase' && o.bundle_id === bundle_id)
    ));
    if (dup) throw new Error('لديك طلب معلّق لنفس العنصر.');

    let receipt_image_data = body.receipt_image_data || '';
    if (receipt_image_data && receipt_image_data.length > 1_500_000) throw new Error('حجم صورة الإيصال كبير جداً.');
    const paymentMethod = body.payment_method || '';
    if (!paymentMethod) throw new Error('يرجى اختيار طريقة الدفع.');

    const order = {
      id: uid('o'), user_id: user.id, user_name: user.name, user_email: user.email, user_gender: user.gender,
      type, plan_id, material_id, bundle_id, seller_id, commission_amount, seller_payout,
      amount, currency, original_amount: originalAmount, discount_amount, coupon_id, coupon_owner,
      payment_method: paymentMethod, receipt_image_data, receipt_text: (body.receipt_text || '').slice(0, 500),
      // الإحالة
      referrer_id: user.referred_by || null, referrer_reward: 0,
      status: 'pending', created_at: new Date().toISOString(),
    };
    await Store.setJSON('orders', order.id, order);
    if (coupon_id) await incrementCouponUsage(coupon_id);
    await logActivity('order_created', { order_id: order.id, user_id: user.id, type, amount });
    const safe = { ...order }; delete safe.receipt_image_data;
    return { order: safe };
  }

  if (action === 'my-orders') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const orders = await Store.listAll('orders');
    const mine = orders.filter(o => o.user_id === user.id).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(o => { const s = { ...o }; delete s.receipt_image_data; return s; });
    return { orders: mine };
  }

  if (action === 'cancel') {
    const user = await requireUser(body);
    if (!user) throw new Error('سجّل الدخول.');
    const o = await Store.getJSON('orders', body.id);
    if (!o || o.user_id !== user.id) throw new Error('الطلب غير موجود.');
    if (o.status !== 'pending') throw new Error('لا يمكن إلغاء طلب تمت مراجعته.');
    o.status = 'cancelled'; o.cancelled_at = new Date().toISOString();
    await Store.setJSON('orders', o.id, o);
    await logActivity('order_cancelled', { order_id: o.id, user_id: user.id });
    return { ok: true };
  }

  throw new Error('إجراء غير معروف: ' + action);
});
