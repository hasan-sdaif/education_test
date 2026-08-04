-- ─────────────────────────────────────────────────────────────────
--  مخطط قاعدة بيانات Supabase للمنصة التعليمية
--  نسخ الملف بالكامل والصقه في SQL Editor في لوحة تحكم Supabase.
--  كل الجداول تستخدم Row Level Security (RLS) مع سياسة تمنع الوصول
--  العام — الوصول الوحيد يكون عبر مفتاح service_role من Netlify Functions.
-- ─────────────────────────────────────────────────────────────────

-- تعطيل RLS على كل الجداول مؤقتاً لتسهيل الإعداد الأولي
-- (يمكن تفعيله لاحقاً مع policies مناسبة)

-- ═══ 1. الجداول الرئيسية (key-value stores) ═══

-- جدول الإعدادات (يخزن كائن إعدادات واحد)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول meta (معلومات النظام)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 2. جداول المصادقة ═══

-- جدول الإدارة
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,          -- البريد الإلكتروني
  data JSONB NOT NULL,           -- {email, password_hash, created_at}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرس بريد الإدارة
CREATE TABLE IF NOT EXISTS admins_by_email (
  key TEXT PRIMARY KEY,          -- البريد الإلكتروني
  value JSONB NOT NULL,          -- {id}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,           -- كل بيانات المستخدم
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرس بريد المستخدمين
CREATE TABLE IF NOT EXISTS users_by_email (
  key TEXT PRIMARY KEY,          -- البريد الإلكتروني
  value JSONB NOT NULL,          -- {id}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 3. جداول المحتوى ═══

-- المواد الدراسية
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- الوسوم
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- التصنيفات الهرمية
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- المحتوى (المذكرات والملخصات والدروس)
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- خطط الاشتراك
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- الباقات
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 4. جداول المعاملات ═══

-- الطلبات
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- الاشتراكات
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- المشتريات الفردية
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 5. جداول التقييمات والأسئلة ═══

-- التقييمات الموثّقة (متعددة المحاور)
CREATE TABLE IF NOT EXISTS verified_reviews (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,           -- {rating, ratings:{content_quality,...}, content, helpful_count, ...}
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- آراء مختارة (تسويقية)
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- الأسئلة والأجوبة
CREATE TABLE IF NOT EXISTS qa (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 6. جداول البائعين ═══

-- البائعون
CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- الكوبونات
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- المدفوعات للبائعين
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- طلبات السحب
CREATE TABLE IF NOT EXISTS payout_requests (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 7. جداول النظام ═══

-- البثوث المباشرة
CREATE TABLE IF NOT EXISTS meets (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- سجلّ النشاط
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 8. تفعيل Row Level Security ═══
-- نُفعّل RLS على كل الجداول ونضيف policy تمنع الوصول العام.
-- الوصول الوحيد يكون عبر مفتاح service_role من Netlify Functions.

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins_by_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_by_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ═══ 9. إضافة policies ═══
-- سياسة افتراضية: منع كل الوصول لغير service_role
-- (مفتاح service_role يتخطى RLS تلقائياً)

-- لكل جدول، نضيف policy واحدة تمنع الوصول العام:
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'settings','meta','admins','admins_by_email','users','users_by_email',
    'subjects','tags','categories','materials','plans','bundles',
    'orders','subscriptions','purchases','verified_reviews','reviews','qa',
    'sellers','coupons','payouts','payout_requests','meets','notifications','activity_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "deny_all_on_%s" ON %I FOR ALL USING (false) WITH CHECK (false);', t, t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- السياسة موجودة مسبقاً
    END;
  END LOOP;
END $$;

-- ═══ 10. فهارس إضافية لتحسين الأداء ═══

-- فهرس على updated_at لكل جدول (للاستعلامات الأخيرة)
CREATE INDEX IF NOT EXISTS idx_materials_updated ON materials (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_updated ON orders (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_updated ON users (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_verified_reviews_updated ON verified_reviews (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_updated ON notifications (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_updated ON activity_log (updated_at DESC);

-- ═══ 11. Trigger لتحديث updated_at تلقائياً ═══

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'settings','meta','admins','admins_by_email','users','users_by_email',
    'subjects','tags','categories','materials','plans','bundles',
    'orders','subscriptions','purchases','verified_reviews','reviews','qa',
    'sellers','coupons','payouts','payout_requests','meets','notifications','activity_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('
        CREATE TRIGGER update_%s_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
      ', t, t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ═══ 12. التحقق ═══
SELECT 'تم إنشاء المخطط بنجاح!' AS status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
