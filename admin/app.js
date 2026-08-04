/* ═══════════════ ADMIN APP ═══════════════ */
const App = (() => {
  let state = {
    currentSection: 'dashboard',
    materials: [], subjects: [], tags: [], plans: [], orders: [], users: [], meets: [], reviews: [], subscriptions: [], allOrders: [],
    sellers: [], sellerMaterials: [], coupons: [],
    settings: {},
    ordersFilter: 'pending', sellerFilter: '', userSearch: '', materialSearch: '',
    materialFilterSubject: '', materialFilterType: '',
  };

  function go(section) {
    state.currentSection = section;
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById(`sec-${section}`);
    if (sec) sec.classList.add('active');
    document.querySelectorAll('.admin-side nav button[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === section));
    document.getElementById('adminSide').classList.remove('open');
    document.getElementById('backdrop').classList.remove('open');
    loadSectionData(section);
    history.replaceState(null, '', `#${section}`);
    window.scrollTo(0, 0);
  }

  async function loadSectionData(section) {
    try {
      switch (section) {
        case 'dashboard': await loadDashboard(); break;
        case 'content': await loadMaterials(); break;
        case 'subjects': await loadSubjects(); break;
        case 'categories': await loadCategories(); break;
        case 'tags': await loadTags(); break;
        case 'plans': await loadPlans(); break;
        case 'orders': await loadOrders(); break;
        case 'sellers': await loadSellers(); break;
        case 'seller-materials': await loadSellerMaterials(); break;
        case 'seller-meets': await loadSellerMeets(); break;
        case 'coupons': await loadCoupons(); break;
        case 'reviews-moderation': await loadVerifiedReviews(); break;
        case 'qa': await loadQa(); break;
        case 'testimonials': await loadTestimonials(); break;
        case 'users': await loadUsers(); break;
        case 'meets': await loadMeets(); break;
        case 'reviews': await loadReviews(); break;
        case 'settings': await loadSettingsIntoForm(); break;
        case 'data': await loadSystemStatus(); break;
      }
    } catch (err) {
      // رفض صريح من السيرفر (توكن غير صالح فعلاً) أثناء التنقل بين الأقسام
      // → طرد فعلي لصفحة الدخول. أي خطأ آخر (شبكة، سيرفر مؤقت) → تنبيه فقط،
      // بدون طرد، حتى لا تُفقد جلسة صالحة بسبب عطل عابر.
      const msg = err.message || '';
      if (msg.includes('انتهت الجلسة') || msg.includes('ممنوع')) {
        Site.clearAdminToken();
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`login.html?next=${next}`);
        return;
      }
      Site.toast(msg, 'error');
    }
  }

  async function loadSystemStatus() {
    try {
      const status = await Site.call('admin', { action: 'system-status' });
      const modeMap = { supabase: 'Supabase', blobs: 'Netlify Blobs', json: 'JSON محلي', unknown: 'غير معروف' };
      const modeEl = document.getElementById('ssStorageMode');
      const ssEl = document.getElementById('ssSupabaseStatus');
      const verEl = document.getElementById('ssVersion');
      if (modeEl) modeEl.textContent = modeMap[status.storage_mode] || status.storage_mode;
      if (ssEl) {
        const isConfigured = status.supabase_configured;
        const isUsing = status.is_supabase;
        ssEl.innerHTML = isUsing
          ? '<span style="color:var(--success);">● مفعّل ومستخدم</span>'
          : isConfigured
            ? '<span style="color:var(--honey);">● مُعد لكن غير مستخدم</span>'
            : '<span style="color:var(--text-on-dark-dim);">○ غير مُعد</span>';
      }
      if (verEl) verEl.textContent = status.version || '—';
    } catch (err) {
      const modeEl = document.getElementById('ssStorageMode');
      if (modeEl) modeEl.textContent = 'تعذّر التحميل';
    }
  }

  function refreshPreviewModeUI() {
    const on = Site.isPreviewMode();
    const ind = document.getElementById('previewModeIndicator');
    const btn = document.getElementById('previewModeToggle');
    if (ind) { ind.textContent = on ? 'مفعّل' : 'معطّل'; ind.style.color = on ? 'var(--success)' : ''; }
    if (btn) btn.innerHTML = on ? '<i class="fa-solid fa-eye-slash"></i> إيقاف' : '<i class="fa-solid fa-eye"></i> تبديل';
  }

  async function init() {
    document.getElementById('year').textContent = new Date().getFullYear();
    document.getElementById('demoModeIndicator').textContent = Site.isDemoMode() ? 'مفعّل' : 'معطّل';
    refreshPreviewModeUI();
    document.getElementById('previewModeToggle')?.addEventListener('click', () => {
      Site.setPreviewMode(!Site.isPreviewMode());
      refreshPreviewModeUI();
      Site.toast(Site.isPreviewMode() ? 'تم تفعيل وضع معاينة الموقع — افتحي الصفحة الرئيسية لرؤيتها بأرقام وأشكال تجريبية.' : 'تم إيقاف وضع معاينة الموقع.', 'success');
    });
    document.querySelectorAll('.admin-side nav button[data-section]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.section)));
    document.getElementById('adminLogout').addEventListener('click', async () => { if (!confirm('متأكدة من الخروج؟')) return; await Site.adminLogout(); });
    document.getElementById('mobileToggle').addEventListener('click', () => { document.getElementById('adminSide').classList.toggle('open'); document.getElementById('backdrop').classList.toggle('open'); });
    document.getElementById('backdrop').addEventListener('click', () => { document.getElementById('adminSide').classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); });
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
    document.getElementById('matSearch')?.addEventListener('input', Site.debounce((e) => { state.materialSearch = e.target.value.toLowerCase(); renderMaterialsTable(); }, 250));
    document.getElementById('matFilterSubject')?.addEventListener('change', (e) => { state.materialFilterSubject = e.target.value; renderMaterialsTable(); });
    document.getElementById('matFilterType')?.addEventListener('change', (e) => { state.materialFilterType = e.target.value; renderMaterialsTable(); });
    document.getElementById('ordersFilter')?.addEventListener('change', (e) => { state.ordersFilter = e.target.value; renderOrdersTable(); });
    document.getElementById('sellerFilter')?.addEventListener('change', (e) => { state.sellerFilter = e.target.value; renderSellersList(); });
    document.getElementById('userSearch')?.addEventListener('input', () => { state.userSearch = document.getElementById('userSearch').value.toLowerCase(); renderUsersTable(); });
    document.getElementById('settingsForm')?.addEventListener('submit', async (e) => { e.preventDefault(); await saveSettings(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    await Site.loadSettings();
    const hash = window.location.hash.slice(1);
    go(hash && ['dashboard','content','subjects','tags','plans','orders','sellers','seller-materials','coupons','users','meets','reviews','settings','data'].includes(hash) ? hash : 'dashboard');
    refreshPendingCount();
  }

  // ── Dashboard ──
  async function loadDashboard() {
    const d = await Site.call('admin', { action: 'stats' });
    const s = d.stats;
    // stat-grid (dynamically rendered)
    const statGrid = document.getElementById('statGrid');
    statGrid.innerHTML = [
      ['fa-users','المستخدمون',s.users, s.users_blocked>0?`<i class="fa-solid fa-ban"></i> ${s.users_blocked} محظور`:''],
      ['fa-book','المحتوى',s.materials, s.materials_published<s.materials?`<i class="fa-solid fa-eye"></i> ${s.materials_published} منشور`:''],
      ['fa-crown','اشتراكات فعّالة',s.subscriptions_active, s.subscriptions_expiring>0?`<i class="fa-solid fa-clock"></i> ${s.subscriptions_expiring} تنتهي قريباً`:''],
      ['fa-receipt','طلبات معلّقة',s.orders_pending, s.orders_pending>0?'<i class="fa-solid fa-arrow-left"></i> بحاجة لمراجعة':''],
      ['fa-coins','إجمالي الدخل',Site.formatMoney(s.revenue), s.revenue_pending>0?`<i class="fa-solid fa-clock"></i> ${Site.formatMoney(s.revenue_pending)} معلّق`:''],
      ['fa-percent','عمولات البائعين',Site.formatMoney(s.total_commission), s.sellers_pending>0?`<i class="fa-solid fa-store"></i> ${s.sellers_pending} طلب بائع`:''],
    ].map(([icon,label,val,delta])=>`<div class="stat-box"><div class="label"><i class="fa-solid ${icon}"></i> ${label}</div><div class="value">${val}</div>${delta?`<div class="delta${delta.includes('تنتهي')?' warn':''}">${delta}</div>`:''}</div>`).join('');
    // mini stats
    const ms = document.getElementById('miniStats');
    ms.innerHTML = [
      ['female','fa-venus',s.users_female,'طالبات'],
      ['male','fa-mars',s.users_male,'طلاب'],
      ['seller','fa-store',s.sellers_approved,'بائعون'],
      ['pending','fa-clock',s.orders_pending,'طلبات بانتظار'],
      ['approved','fa-money-bill-transfer',Site.formatMoney(s.pending_payouts),'مستحقات للبائعين'],
    ].map(([cls,ic,val,lbl])=>`<div class="stat-mini"><div class="icn ${cls}"><i class="fa-solid ${ic}"></i></div><div><div class="val">${val}</div><div class="lbl">${lbl}</div></div></div>`).join('');
    renderRevenueChart(d.revenue_last7 || []);
    const tbody = document.getElementById('recentOrdersBody');
    if (!d.recent_orders.length) tbody.innerHTML = `<tr><td colspan="6" class="empty-row">لا توجد طلبات بعد.</td></tr>`;
    else tbody.innerHTML = d.recent_orders.map(o => `<tr><td>${o.type==='subscription'?'اشتراك':'شراء'}${o.type==='bundle_purchase'?' باقة':''}</td><td>${Site.escapeHtml(o.user_name||'—')}</td><td class="mono">${Site.formatMoney(o.amount,o.currency)}</td><td>${orderBadge(o.status)}</td><td>${Site.formatDate(o.created_at)}</td><td><button class="btn-icon" onclick="App.go('orders');setTimeout(()=>App.viewOrder('${o.id}'),200)"><i class="fa-solid fa-eye"></i></button></td></tr>`).join('');
    const actList = document.getElementById('activityList');
    if (!d.recent_activity.length) actList.innerHTML = `<div class="empty-row">لا توجد أنشطة.</div>`;
    else actList.innerHTML = d.recent_activity.map(a => `<div class="activity-item"><div class="ic">${activityIcon(a.action)}</div><div class="body"><div class="what">${Site.escapeHtml(activityLabel(a.action,a))}</div><div class="when">${Site.timeAgo(a.ts)}</div></div></div>`).join('');
    // عدّادات السايدبار
    const setBadge = (id,count) => { const el=document.getElementById(id); if(count>0){el.textContent=count;el.style.display='';}else el.style.display='none'; };
    setBadge('pendingCount', s.orders_pending);
    setBadge('pendingSellersCount', s.sellers_pending);
    setBadge('pendingSellerMatsCount', s.pending_seller_materials);
    setBadge('pendingSellerMeetsCount', s.pending_seller_meets);
    setBadge('pendingReviewsCount', 0); // يُحدّث من قسم التقييمات
    setBadge('pendingQaCount', s.qa_pending);
  }

  function renderRevenueChart(data) {
    const host = document.getElementById('revenueChart');
    if (!data.length) { host.innerHTML = '<div class="empty-row" style="grid-column:1/-1">لا توجد بيانات.</div>'; return; }
    const max = Math.max(...data.map(d => d.revenue), 1);
    host.innerHTML = data.map(d => { const h = Math.max(4, (d.revenue / max) * 100); return `<div class="chart-bar"><div class="bar" style="height:${h}%" data-val="${Site.formatMoney(d.revenue)} — ${d.count} طلب"></div><div class="lbl">${d.label}</div></div>`; }).join('');
  }

  function activityIcon(action) {
    if (action.includes('login')) return '<i class="fa-solid fa-right-to-bracket"></i>';
    if (action.includes('order')) return '<i class="fa-solid fa-receipt"></i>';
    if (action.includes('user') || action.includes('seller')) return '<i class="fa-solid fa-user"></i>';
    if (action.includes('item') || action.includes('material')) return '<i class="fa-solid fa-pen"></i>';
    if (action.includes('payout')) return '<i class="fa-solid fa-money-bill-transfer"></i>';
    if (action.includes('settings')) return '<i class="fa-solid fa-gear"></i>';
    return '<i class="fa-solid fa-circle"></i>';
  }
  function activityLabel(action, a) {
    const map = {
      'admin_login': `دخول الإدارة (${a.email||''})`,
      'user_registered': `تسجيل مستخدم (${a.email||''})`,
      'user_login': `دخول مستخدم`,
      'order_created': `طلب جديد — ${a.type||''} ${a.amount?Site.formatMoney(a.amount):''}`,
      'order_approved': `قبول طلب`,
      'order_rejected': `رفض طلب`,
      'order_cancelled': `إلغاء طلب`,
      'item_created': `إضافة في ${a.store||''}`,
      'item_updated': `تعديل في ${a.store||''}`,
      'item_deleted': `حذف من ${a.store||''}`,
      'settings_updated': `تحديث الإعدادات`,
      'subscription_extended': `تمديد اشتراك (+${a.days||0})`,
      'seller_applied': `طلب بائع جديد`,
      'seller_decided': `قرار طلب بائع`,
      'seller_material_created': `مادة بائع جديدة`,
      'seller_material_decided': `قرار مادة بائع`,
      'payout_paid': `تحويل دفعة لبائع`,
      'payout_requested': `طلب سحب رصيد`,
    };
    return map[action] || action;
  }

  // ── Materials ──
  async function loadMaterials() {
    const [matsRes, subsRes, tagsRes] = await Promise.all([
      Site.call('admin', { action: 'list', what: 'materials' }),
      Site.call('admin', { action: 'list', what: 'subjects' }),
      Site.call('admin', { action: 'list', what: 'tags' }),
    ]);
    state.materials = matsRes.items || [];
    state.subjects = subsRes.items || [];
    state.tags = tagsRes.items || [];
    const sf = document.getElementById('matFilterSubject');
    sf.innerHTML = '<option value="">كل المواد</option>' + state.subjects.map(s => `<option value="${s.id}">${Site.escapeHtml(s.name)}</option>`).join('');
    renderMaterialsTable();
  }

  function renderMaterialsTable() {
    let list = state.materials.slice();
    if (state.materialSearch) list = list.filter(m => (m.title||'').toLowerCase().includes(state.materialSearch));
    if (state.materialFilterSubject) list = list.filter(m => m.subject_id === state.materialFilterSubject);
    if (state.materialFilterType) list = list.filter(m => m.type === state.materialFilterType);
    list.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    const tbody = document.getElementById('materialsTableBody');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-row"><div style="padding:24px;"><i class="fa-solid fa-book" style="font-size:28px;color:var(--honey);opacity:.5;margin-bottom:8px;"></i><p style="margin:0 0 12px;">لا يوجد محتوى.</p><button class="btn btn-primary btn-sm" onclick="App.openMaterialEditor()"><i class="fa-solid fa-plus"></i> أضف أول محتوى</button></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(m => {
      const subject = state.subjects.find(s => s.id === m.subject_id);
      const sellerBadge = m.seller_id ? '<span class="chip seller"><i class="fa-solid fa-store"></i> بائع</span>' : '';
      return `<tr><td><div style="display:flex;align-items:center;gap:8px;"><span style="width:4px;height:28px;border-radius:2px;background:${Site.typeColorVar(m.type)};"></span><div><div style="font-weight:600;font-size:12.5px;">${Site.escapeHtml(m.title)}</div>${m.girls_only?'<small style="color:var(--purple);"><i class="fa-solid fa-venus"></i></small>':''}</div></div></td><td><span class="chip">${Site.escapeHtml(m.type)}</span></td><td>${subject?Site.escapeHtml(subject.name):'—'}</td><td>${sellerBadge}</td><td>${m.is_locked?`<span class="chip">${m.access==='subscription'?'مشتركين':'شراء'}</span>`:'<span class="chip active">مجاني</span>'}</td><td class="mono">${m.is_locked&&m.individual_price?Site.formatMoney(m.individual_price,m.currency):'—'}</td><td class="mono">${m.view_count||0}</td><td>${m.is_published===false?'<span class="chip inactive">مسودة</span>':'<span class="chip active">منشور</span>'}</td><td style="white-space:nowrap;"><button class="btn-icon" onclick="App.openMaterialEditor('${m.id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('materials','${m.id}','${Site.escapeHtml(m.title).replace(/'/g,'')}')" title="حذف"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    }).join('');
  }

  function openMaterialEditor(id) {
    const m = id ? state.materials.find(x => x.id === id) : null;
    const isNew = !m;
    const data = m || { title: '', description: '', preview_content: '', type: 'مذكرة', subject_id: state.subjects[0]?.id || '', tags: [], is_locked: false, access: 'subscription', individual_price: 0, currency: 'BHD', file_type: 'drive', file_url: '', extra_attachments: [], cover_image_url: '', girls_only: false, is_published: true, search_tags: '' };
    const tagsPicker = (state.tags||[]).map(t => `<div class="tp-chip ${data.tags?.includes(t.id)?'selected':''}" data-id="${t.id}"><span class="sw" style="background:${t.color||'var(--honey)'}"></span> ${Site.escapeHtml(t.name)}</div>`).join('') || '<p class="muted" style="font-size:11px;margin:0;">لا توجد وسوم بعد.</p>';
    const extraAttHtml = (data.extra_attachments||[]).map((a,i) => `<div class="attachment-row" data-i="${i}"><select class="att-type"><option value="drive" ${a.type==='drive'?'selected':''}>Drive</option><option value="youtube" ${a.type==='youtube'?'selected':''}>YouTube</option><option value="pdf" ${a.type==='pdf'?'selected':''}>PDF</option><option value="image" ${a.type==='image'?'selected':''}>صورة</option><option value="video" ${a.type==='video'?'selected':''}>فيديو</option><option value="audio" ${a.type==='audio'?'selected':''}>صوت</option><option value="link" ${a.type==='link'?'selected':''}>رابط</option></select><input type="url" class="att-url" dir="ltr" value="${Site.escapeHtml(a.url||'')}" placeholder="https://..."><input type="text" class="att-title" value="${Site.escapeHtml(a.title||'')}" placeholder="عنوان"><button type="button" class="btn-icon danger" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
    openModal(`
      <h3>${isNew?'إضافة محتوى جديد':'تعديل: '+(data.title||'')}</h3>
      <p class="muted" style="font-size:12px;margin:0 0 16px;">أدخل تفاصيل المحتوى.</p>
      <form id="materialForm">
        <div class="editor-grid">
          <div class="field full"><label>العنوان *</label><input type="text" id="m-title" required value="${Site.escapeHtml(data.title)}"></div>
          <div class="field full"><label>الوصف القصير</label><textarea id="m-description" rows="2">${Site.escapeHtml(data.description||'')}</textarea></div>
          <div class="field"><label>النوع</label><select id="m-type"><option value="مذكرة" ${data.type==='مذكرة'?'selected':''}>مذكرة</option><option value="ملخص" ${data.type==='ملخص'?'selected':''}>ملخص</option><option value="درس" ${data.type==='درس'?'selected':''}>درس</option><option value="بث" ${data.type==='بث'?'selected':''}>بث مسجّل</option><option value="أخرى" ${data.type==='أخرى'?'selected':''}>أخرى</option></select></div>
          <div class="field"><label>المادة</label><select id="m-subject_id">${state.subjects.length?state.subjects.map(s=>`<option value="${s.id}" ${data.subject_id===s.id?'selected':''}>${Site.escapeHtml(s.name)}</option>`).join(''):'<option value="">— أضف مواد أولاً —</option>'}</select></div>
          <div class="field full"><label>الوسوم (Tags)</label><div class="tag-picker" id="tagsPicker">${tagsPicker}</div><div class="hint">انقري لإضافة/إزالة.</div></div>
          <div class="field full"><label>كلمات بحث مفتاحية</label><input type="text" id="m-search_tags" value="${Site.escapeHtml(data.search_tags||'')}" placeholder="فصل أول، مراجعة..."></div>
        </div>
        <div class="form-section" style="padding:14px;margin:12px 0;">
          <h3 style="font-size:14px;margin:0 0 12px;"><i class="fa-solid fa-file"></i> الملف الرئيسي</h3>
          <div class="editor-grid">
            <div class="field"><label>نوع الملف</label><select id="m-file_type"><option value="drive" ${data.file_type==='drive'?'selected':''}>Google Drive</option><option value="youtube" ${data.file_type==='youtube'?'selected':''}>YouTube</option><option value="pdf" ${data.file_type==='pdf'?'selected':''}>PDF</option><option value="image" ${data.file_type==='image'?'selected':''}>صورة</option><option value="video" ${data.file_type==='video'?'selected':''}>فيديو</option><option value="audio" ${data.file_type==='audio'?'selected':''}>صوت</option><option value="link" ${data.file_type==='link'?'selected':''}>رابط</option><option value="iframe" ${data.file_type==='iframe'?'selected':''}>Embed</option></select></div>
            <div class="field"><label>رابط الملف</label><input type="url" id="m-file_url" dir="ltr" value="${Site.escapeHtml(data.file_url||'')}" placeholder="https://..."></div>
          </div>
          <div class="field"><label>رابط صورة الغلاف</label><input type="url" id="m-cover_image_url" dir="ltr" value="${Site.escapeHtml(data.cover_image_url||'')}" placeholder="https://..."></div>
        </div>
        <div class="form-section" style="padding:14px;margin:12px 0;">
          <h3 style="font-size:14px;margin:0 0 12px;"><i class="fa-solid fa-paperclip"></i> ملفات إضافية</h3>
          <div class="attachment-editor" id="extraAttachments">${extraAttHtml}</div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="App.addAttachmentRow()"><i class="fa-solid fa-plus"></i> إضافة ملف</button>
        </div>
        <div class="field full"><label>معاينة</label><textarea id="m-preview_content" rows="3">${Site.escapeHtml(data.preview_content||'')}</textarea></div>
        <div class="toggle-row"><div class="info"><h4>محتوى مفتوح للجميع (مجاني)</h4></div><label class="toggle"><input type="checkbox" id="m-is_locked" ${data.is_locked?'':'checked'}><span class="slider"></span></label></div>
        <div id="lockedOptions" style="display:none;">
          <div class="editor-grid">
            <div class="field"><label>نوع الوصول</label><select id="m-access"><option value="subscription" ${data.access==='subscription'?'selected':''}>للمشتركين</option><option value="individual" ${data.access==='individual'?'selected':''}>شراء فردي</option><option value="both" ${data.access==='both'?'selected':''}>كلاهما</option></select></div>
            <div class="field"><label>سعر الشراء الفردي</label><input type="number" id="m-individual_price" step="0.001" min="0" value="${data.individual_price||0}"></div>
          </div>
        </div>
        <div class="form-section" style="padding:14px;margin:12px 0;background:linear-gradient(135deg,rgba(179,157,219,.10),rgba(231,169,61,.06));border:1px solid rgba(179,157,219,.35);border-radius:var(--radius-m);">
          <div class="toggle-row" style="margin:0;">
            <div class="info">
              <h4 style="display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-venus" style="color:var(--purple);"></i> محتوى حصري للطالبات فقط</h4>
              <p style="font-size:11.5px;color:var(--text-on-dark-dim);margin:4px 0 0;line-height:1.6;">موصى به للمعلمات والطالبات اللاتي يرغبن بخصوصية أصواتهنّ أو صورهنّ في الفيديوهات والتسجيلات الصوتية والبثوث. سيظهر المحتوى فقط للمستخدمات المسجّلات كـ"طالبة".</p>
            </div>
            <label class="toggle"><input type="checkbox" id="m-girls_only" ${data.girls_only?'checked':''}><span class="slider"></span></label>
          </div>
          <div id="girlsOnlyHint" style="display:${data.girls_only?'block':'none'};margin-top:10px;padding:8px 10px;background:rgba(179,157,219,.10);border-radius:var(--radius-s);font-size:11px;color:var(--purple);border:1px solid rgba(179,157,219,.3);">
            <i class="fa-solid fa-circle-info"></i> هذا المحتوى سيظهر فقط للمستخدمات الإناث المسجّلات في المنصة. الذكور لن يتمكنوا من رؤيته أو شرائه.
          </div>
        </div>
        <div class="toggle-row"><div class="info"><h4>منشور</h4></div><label class="toggle"><input type="checkbox" id="m-is_published" ${data.is_published!==false?'checked':''}><span class="slider"></span></label></div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'إضافة':'حفظ'}</button>
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button>
        </div>
      </form>
    `);
    const lockChk = document.getElementById('m-is_locked');
    const lockedOpts = document.getElementById('lockedOptions');
    function syncLock() { lockedOpts.style.display = lockChk.checked ? 'none' : ''; }
    lockChk.addEventListener('change', syncLock);
    syncLock();
    // معالج تبديل تلميح "حصري للطالبات"
    const girlsChk = document.getElementById('m-girls_only');
    const girlsHint = document.getElementById('girlsOnlyHint');
    if (girlsChk && girlsHint) girlsChk.addEventListener('change', () => girlsHint.style.display = girlsChk.checked ? 'block' : 'none');
    document.querySelectorAll('#tagsPicker .tp-chip').forEach(c => c.addEventListener('click', () => c.classList.toggle('selected')));
    document.getElementById('materialForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tags = Array.from(document.querySelectorAll('#tagsPicker .tp-chip.selected')).map(c => c.dataset.id);
      const extraAttachments = Array.from(document.querySelectorAll('#extraAttachments .attachment-row')).map(row => ({ type: row.querySelector('.att-type').value, url: row.querySelector('.att-url').value.trim(), title: row.querySelector('.att-title').value.trim() })).filter(a => a.url);
      const item = {
        ...(m || {}),
        title: document.getElementById('m-title').value.trim(),
        description: document.getElementById('m-description').value.trim(),
        type: document.getElementById('m-type').value,
        subject_id: document.getElementById('m-subject_id').value,
        tags, search_tags: document.getElementById('m-search_tags').value.trim(),
        file_type: document.getElementById('m-file_type').value,
        file_url: document.getElementById('m-file_url').value.trim(),
        cover_image_url: document.getElementById('m-cover_image_url').value.trim(),
        extra_attachments: extraAttachments,
        preview_content: document.getElementById('m-preview_content').value.trim(),
        is_locked: !document.getElementById('m-is_locked').checked,
        access: document.getElementById('m-access')?.value || 'subscription',
        individual_price: parseFloat(document.getElementById('m-individual_price')?.value || 0),
        currency: 'BHD', girls_only: document.getElementById('m-girls_only').checked,
        is_published: document.getElementById('m-is_published').checked,
      };
      if (m) item.id = m.id;
      try {
        await Site.call('admin', { action: 'save', what: 'materials', item });
        Site.toast(isNew?'تمت الإضافة.':'تم الحفظ.', 'success');
        closeModal(); await loadMaterials();
      } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  function addAttachmentRow() {
    const host = document.getElementById('extraAttachments');
    const row = document.createElement('div');
    row.className = 'attachment-row';
    row.innerHTML = `<select class="att-type"><option value="drive">Drive</option><option value="youtube">YouTube</option><option value="pdf">PDF</option><option value="image">صورة</option><option value="video">فيديو</option><option value="audio">صوت</option><option value="link">رابط</option></select><input type="url" class="att-url" dir="ltr" placeholder="https://..."><input type="text" class="att-title" placeholder="عنوان"><button type="button" class="btn-icon danger" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
    host.appendChild(row);
  }

  // ── Subjects ──
  async function loadSubjects() {
    const res = await Site.call('admin', { action: 'list', what: 'subjects' });
    state.subjects = (res.items || []).slice().sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    renderSubjectsList();
  }
  function renderSubjectsList() {
    const host = document.getElementById('subjectsList');
    if (!state.subjects.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-folder"></i></div><h3>لا توجد مواد</h3><p>أضف أول مادة.</p><button class="btn btn-primary" onclick="App.openSubjectEditor()"><i class="fa-solid fa-plus"></i> إضافة</button></div>`; return; }
    host.innerHTML = state.subjects.map(s => `<div class="sortable-item" data-id="${s.id}" draggable="true"><i class="fa-solid fa-grip-vertical grip"></i><span class="sw" style="width:14px;height:14px;border-radius:50%;background:${s.color||'var(--honey)'};flex-shrink:0;"></span><div class="meta"><h4>${Site.escapeHtml(s.name)}</h4><small>${Site.escapeHtml(s.slug||'')}</small></div><button class="btn-icon" onclick="App.openSubjectEditor('${s.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('subjects','${s.id}','${Site.escapeHtml(s.name).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div>`).join('');
    enableDragSort('subjectsList', 'subjects');
  }
  function openSubjectEditor(id) {
    const s = id ? state.subjects.find(x => x.id === id) : null;
    const isNew = !s;
    const data = s || { name: '', slug: '', color: '#e7a93d', sort_order: state.subjects.length + 1 };
    openModal(`<h3>${isNew?'إضافة مادة':'تعديل: '+(data.name||'')}</h3><form id="subjectForm"><div class="field"><label>اسم المادة *</label><input type="text" id="s-name" required value="${Site.escapeHtml(data.name)}" placeholder="فيزياء"></div><div class="field"><label>المعرّف (slug)</label><input type="text" id="s-slug" dir="ltr" value="${Site.escapeHtml(data.slug||'')}" placeholder="math"><div class="hint">يُولّد تلقائياً.</div></div><div class="field"><label>اللون</label><div class="color-input"><input type="color" id="s-color" value="${data.color||'#e7a93d'}"><input type="text" id="s-color-text" value="${data.color||'#e7a93d'}"></div></div><div style="display:flex;gap:10px;margin-top:14px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'إضافة':'حفظ'}</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('s-color').addEventListener('input', (e) => document.getElementById('s-color-text').value = e.target.value);
    document.getElementById('s-color-text').addEventListener('input', (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) document.getElementById('s-color').value = e.target.value; });
    document.getElementById('subjectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const item = { ...(s || {}), name: document.getElementById('s-name').value.trim(), slug: document.getElementById('s-slug').value.trim(), color: document.getElementById('s-color').value, sort_order: data.sort_order };
      if (s) item.id = s.id;
      try { await Site.call('admin', { action: 'save', what: 'subjects', item }); Site.toast(isNew?'تمت الإضافة.':'تم الحفظ.', 'success'); closeModal(); await loadSubjects(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Tags ──
  async function loadTags() {
    const res = await Site.call('admin', { action: 'list', what: 'tags' });
    state.tags = (res.items || []).slice().sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    renderTagsList();
  }
  function renderTagsList() {
    const host = document.getElementById('tagsList');
    if (!state.tags.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-tags"></i></div><h3>لا توجد وسوم</h3><p>أنشئ وسوماً مثل: فصل أول، مراجعة...</p><button class="btn btn-primary" onclick="App.openTagEditor()"><i class="fa-solid fa-plus"></i> إضافة</button></div>`; return; }
    host.innerHTML = state.tags.map(t => {
      const count = state.materials.filter(m => (m.tags||[]).includes(t.id)).length;
      return `<div class="sortable-item" data-id="${t.id}" draggable="true"><i class="fa-solid fa-grip-vertical grip"></i><span class="sw" style="width:14px;height:14px;border-radius:50%;background:${t.color||'var(--honey)'};flex-shrink:0;"></span><div class="meta"><h4>${Site.escapeHtml(t.name)}</h4><small>${Site.escapeHtml(t.slug||'')} · ${count} محتوى</small></div><button class="btn-icon" onclick="App.openTagEditor('${t.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('tags','${t.id}','${Site.escapeHtml(t.name).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div>`;
    }).join('');
    enableDragSort('tagsList', 'tags');
  }
  function openTagEditor(id) {
    const t = id ? state.tags.find(x => x.id === id) : null;
    const isNew = !t;
    const data = t || { name: '', slug: '', color: '#6fcf97', description: '', sort_order: state.tags.length + 1, is_active: true };
    openModal(`<h3>${isNew?'إضافة وسم':'تعديل: '+(data.name||'')}</h3><form id="tagForm"><div class="field"><label>اسم الوسم *</label><input type="text" id="t-name" required value="${Site.escapeHtml(data.name)}" placeholder="مراجعة نهائية"></div><div class="field"><label>المعرّف</label><input type="text" id="t-slug" dir="ltr" value="${Site.escapeHtml(data.slug||'')}" placeholder="final-review"></div><div class="field"><label>اللون</label><div class="color-input"><input type="color" id="t-color" value="${data.color||'#6fcf97'}"><input type="text" id="t-color-text" value="${data.color||'#6fcf97'}"></div></div><div class="field"><label>وصف</label><textarea id="t-description" rows="2">${Site.escapeHtml(data.description||'')}</textarea></div><div style="display:flex;gap:10px;margin-top:14px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'إضافة':'حفظ'}</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('t-color').addEventListener('input', (e) => document.getElementById('t-color-text').value = e.target.value);
    document.getElementById('t-color-text').addEventListener('input', (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) document.getElementById('t-color').value = e.target.value; });
    document.getElementById('tagForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const item = { ...(t || {}), name: document.getElementById('t-name').value.trim(), slug: document.getElementById('t-slug').value.trim(), color: document.getElementById('t-color').value, description: document.getElementById('t-description').value.trim(), sort_order: data.sort_order, is_active: data.is_active };
      if (t) item.id = t.id;
      try { await Site.call('admin', { action: 'save', what: 'tags', item }); Site.toast(isNew?'تمت الإضافة.':'تم الحفظ.', 'success'); closeModal(); await loadTags(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Plans ──
  async function loadPlans() {
    const res = await Site.call('admin', { action: 'list', what: 'plans' });
    state.plans = (res.items || []).slice().sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    renderPlansList();
  }
  function renderPlansList() {
    const host = document.getElementById('plansList');
    if (!state.plans.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-crown"></i></div><h3>لا توجد خطط</h3><p>أضف خطة.</p><button class="btn btn-primary" onclick="App.openPlanEditor()"><i class="fa-solid fa-plus"></i> إضافة</button></div>`; return; }
    host.innerHTML = state.plans.map(p => `<div class="sortable-item" data-id="${p.id}" draggable="true"><i class="fa-solid fa-grip-vertical grip"></i><div class="meta"><h4>${Site.escapeHtml(p.name)} ${p.is_featured?'<span class="chip featured">مميّزة</span>':''} ${p.is_active===false?'<span class="chip inactive">معطّلة</span>':''}</h4><small class="mono">${Site.formatMoney(p.price,p.currency)} — ${p.duration_days?p.duration_days+' يوم':'مدى الحياة'}</small></div><button class="btn-icon" onclick="App.openPlanEditor('${p.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('plans','${p.id}','${Site.escapeHtml(p.name).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div>`).join('');
    enableDragSort('plansList', 'plans');
  }
  function openPlanEditor(id) {
    const p = id ? state.plans.find(x => x.id === id) : null;
    const isNew = !p;
    const data = p || { name: '', price: 0, currency: 'BHD', duration_days: 90, description: '', features: [], is_featured: false, is_active: true, sort_order: state.plans.length + 1 };
    openModal(`<h3>${isNew?'إضافة خطة':'تعديل: '+(data.name||'')}</h3><form id="planForm"><div class="editor-grid"><div class="field full"><label>اسم الخطة *</label><input type="text" id="p-name" required value="${Site.escapeHtml(data.name)}" placeholder="الخطة الفصلية"></div><div class="field"><label>السعر *</label><input type="number" id="p-price" step="0.001" min="0" required value="${data.price||0}"></div><div class="field"><label>العملة</label><select id="p-currency"><option value="BHD" ${data.currency==='BHD'?'selected':''}>BHD</option><option value="SAR" ${data.currency==='SAR'?'selected':''}>SAR</option><option value="EGP" ${data.currency==='EGP'?'selected':''}>EGP</option><option value="USD" ${data.currency==='USD'?'selected':''}>USD</option></select></div><div class="field"><label>المدة (أيام)</label><input type="number" id="p-duration_days" min="0" value="${data.duration_days||0}"><div class="hint">0 = مدى الحياة</div></div><div class="field"><label>الترتيب</label><input type="number" id="p-sort_order" min="1" value="${data.sort_order||1}"></div><div class="field full"><label>الوصف</label><textarea id="p-description" rows="2">${Site.escapeHtml(data.description||'')}</textarea></div><div class="field full"><label>المزايا (سطر لكل ميزة)</label><textarea id="p-features" rows="4">${Site.escapeHtml((data.features||[]).join('\\n'))}</textarea></div></div><div class="toggle-row"><div class="info"><h4>خطة مميّزة</h4></div><label class="toggle"><input type="checkbox" id="p-is_featured" ${data.is_featured?'checked':''}><span class="slider"></span></label></div><div class="toggle-row"><div class="info"><h4>مفعّلة</h4></div><label class="toggle"><input type="checkbox" id="p-is_active" ${data.is_active!==false?'checked':''}><span class="slider"></span></label></div><div style="display:flex;gap:10px;margin-top:14px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'إضافة':'حفظ'}</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('planForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const features = document.getElementById('p-features').value.split('\\n').map(f => f.trim()).filter(Boolean);
      const item = { ...(p || {}), name: document.getElementById('p-name').value.trim(), price: parseFloat(document.getElementById('p-price').value), currency: document.getElementById('p-currency').value, duration_days: parseInt(document.getElementById('p-duration_days').value, 10), sort_order: parseInt(document.getElementById('p-sort_order').value, 10), description: document.getElementById('p-description').value.trim(), features, is_featured: document.getElementById('p-is_featured').checked, is_active: document.getElementById('p-is_active').checked };
      if (p) item.id = p.id;
      try { await Site.call('admin', { action: 'save', what: 'plans', item }); Site.toast(isNew?'تمت الإضافة.':'تم الحفظ.', 'success'); closeModal(); await loadPlans(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Orders ──
  async function loadOrders() {
    const res = await Site.call('admin', { action: 'list', what: 'orders' });
    state.orders = (res.items || []).slice().sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    renderOrdersTable();
  }
  function renderOrdersTable() {
    let list = state.orders.slice();
    if (state.ordersFilter) list = list.filter(o => o.status === state.ordersFilter);
    const tbody = document.getElementById('ordersTableBody');
    if (!list.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty-row"><div style="padding:24px;"><i class="fa-solid fa-receipt" style="font-size:28px;color:var(--honey);opacity:.5;margin-bottom:8px;"></i><p style="margin:0;">لا توجد طلبات ${state.ordersFilter?'بهذه الحالة':'بعد'}.</p></div></td></tr>`; return; }
    tbody.innerHTML = list.map(o => `<tr><td><div style="font-weight:600;font-size:12px;">${Site.escapeHtml(o.user_name||'—')}</div><small class="muted">${Site.escapeHtml(o.user_email||'')}</small></td><td>${o.type==='subscription'?'اشتراك':'شراء'}${o.seller_id?'<br><small class="chip seller">بائع</small>':''}</td><td class="mono">${Site.formatMoney(o.amount,o.currency)}${o.discount_amount?'<br><small style="color:var(--success);">-'+Site.formatMoney(o.discount_amount,o.currency)+'</small>':''}</td><td>${o.payment_method==='benefit'?'<span class="benefit-badge">بنفت</span>':'فودافون'}</td><td>${o.receipt_image_data?`<img class="receipt-thumb" src="${o.receipt_image_data}" onclick="App.viewReceipt('${o.id}')">`:(o.receipt_text?`<code style="font-family:var(--font-mono);font-size:10px;">${Site.escapeHtml(o.receipt_text)}</code>`:'—')}</td><td>${orderBadge(o.status)}</td><td>${Site.formatDate(o.created_at)}</td><td style="white-space:nowrap;"><button class="btn-icon" onclick="App.viewOrder('${o.id}')"><i class="fa-solid fa-eye"></i></button>${o.status==='pending'?`<button class="btn-icon success" onclick="App.decideOrder('${o.id}','approved')"><i class="fa-solid fa-check"></i></button><button class="btn-icon danger" onclick="App.decideOrder('${o.id}','rejected')"><i class="fa-solid fa-xmark"></i></button>`:''}</td></tr>`).join('');
  }
  async function viewOrder(id) {
    const o = state.orders.find(x => x.id === id);
    if (!o) return;
    let receiptImg = '';
    if (o.receipt_image_data) { try { const res = await Site.call('admin', { action: 'get-order', id }); receiptImg = res.order?.receipt_image_data || ''; } catch (_) {} }
    openModal(`<h3>تفاصيل الطلب</h3><p class="muted" style="font-size:11.5px;margin:0 0 14px;">${o.id}</p><div class="editor-grid"><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">العميل</h5><div style="font-size:12.5px;">${Site.escapeHtml(o.user_name||'—')}</div><div style="font-size:10.5px;color:var(--text-on-dark-dim);margin-top:3px;">${Site.escapeHtml(o.user_email||'')}</div></div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">المبلغ</h5><div class="mono" style="font-size:13px;">${Site.formatMoney(o.amount,o.currency)}${o.discount_amount?'<br><small style="color:var(--success);">خصم: -'+Site.formatMoney(o.discount_amount,o.currency)+'</small>':''}</div></div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">طريقة الدفع</h5><div style="font-size:12.5px;">${o.payment_method==='benefit'?'بنفت':'فودافون'}</div></div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">الحالة</h5>${orderBadge(o.status)}</div></div>${o.seller_id&&o.seller_payout?`<div class="alert info" style="margin-top:12px;"><i class="fa-solid fa-store"></i><div>طلب على مادة بائع — عمولة المنصة: ${Site.formatMoney(o.commission_amount,o.currency)} · حصة البائع: ${Site.formatMoney(o.seller_payout,o.currency)}</div></div>`:''}${receiptImg?`<div class="form-section" style="padding:12px;margin-top:12px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 8px;">صورة الإيصال</h5><div class="receipt-img-wrap"><img src="${receiptImg}" style="max-width:100%;border-radius:var(--radius-s);"></div></div>`:''}${o.status==='pending'?`<div class="field" style="margin-top:12px;"><label>ملاحظات</label><textarea id="o-notes" rows="2" placeholder="مثال: تم القبول" style="width:100%;padding:11px;border-radius:var(--radius-s);border:1px solid var(--ink-700);background:var(--ink-900);color:var(--text-on-dark);font-size:12.5px;resize:vertical;"></textarea></div><div style="display:flex;gap:8px;"><button class="btn btn-success" onclick="App.decideOrder('${o.id}','approved')"><i class="fa-solid fa-check"></i> قبول</button><button class="btn btn-danger" onclick="App.decideOrder('${o.id}','rejected')"><i class="fa-solid fa-xmark"></i> رفض</button><button class="btn btn-ghost" onclick="App.closeModal()">إغلاق</button></div>`:'<button class="btn btn-ghost" style="margin-top:12px;" onclick="App.closeModal()">إغلاق</button>'}`);
  }
  async function viewReceipt(id) {
    const o = state.orders.find(x => x.id === id);
    if (!o) return;
    let receiptImg = o.receipt_image_data;
    if (!receiptImg) { try { const res = await Site.call('admin', { action: 'get-order', id }); receiptImg = res.order?.receipt_image_data; } catch (_) {} }
    if (!receiptImg) { Site.toast('لا توجد صورة.', 'error'); return; }
    openModal(`<h3>صورة الإيصال</h3><p class="muted" style="font-size:11.5px;margin:0 0 12px;">${Site.escapeHtml(o.user_name||'')} — ${Site.formatMoney(o.amount,o.currency)}</p><div class="receipt-img-wrap"><img src="${receiptImg}" style="max-width:100%;"></div><button class="btn btn-ghost" style="margin-top:12px;" onclick="App.closeModal()">إغلاق</button>`);
  }
  async function decideOrder(id, decision) {
    const notes = document.getElementById('o-notes')?.value || '';
    if (decision === 'rejected' && !notes) { if (!confirm('رفض بدون ملاحظات؟')) return; }
    try {
      await Site.call('admin', { action: 'order-decide', id, decision, notes });
      Site.toast(decision === 'approved' ? 'تم القبول.' : 'تم الرفض.', 'success');
      closeModal(); await loadOrders(); refreshPendingCount();
      if (state.currentSection === 'dashboard') await loadDashboard();
    } catch (err) { Site.toast(err.message, 'error'); }
  }

  // ── Sellers ──
  async function loadSellers() {
    const res = await Site.call('admin', { action: 'list', what: 'sellers' });
    state.sellers = res.items || [];
    const orders = await Site.call('admin', { action: 'list', what: 'orders' });
    state.allOrders = orders.items || [];
    renderSellersList();
  }
  function renderSellersList() {
    const host = document.getElementById('sellersList');
    let list = state.sellers.slice().sort((a,b) => new Date(b.applied_at||b.created_at||0) - new Date(a.applied_at||a.created_at||0));
    if (state.sellerFilter) list = list.filter(s => s.status === state.sellerFilter);
    if (!list.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-store"></i></div><h3>لا يوجد بائعون</h3><p>عندما تقدّم طالبة لتصبح بائعة، سيظهر هنا.</p></div>`; return; }
    host.innerHTML = list.map(s => {
      const sellerOrders = state.allOrders.filter(o => o.seller_id === s.id);
      const statusBadge = s.status==='approved'?'<span class="chip active">معتمدة</span>':s.status==='pending'?'<span class="badge pending">قيد المراجعة</span>':s.status==='rejected'?'<span class="badge rejected">مرفوضة</span>':'<span class="chip inactive">محظورة</span>';
      return `<div class="seller-row">
        ${s.profile_image?`<img class="avatar" src="${Site.escapeHtml(s.profile_image)}" alt="">`:`<div class="avatar">${Site.escapeHtml(s.display_name.charAt(0))}</div>`}
        <div class="info"><h4>${Site.escapeHtml(s.display_name)} ${statusBadge}</h4><small>${Site.escapeHtml(s.user_name||'')} · ${Site.escapeHtml(s.user_email||'')}</small></div>
        <div class="stats"><span><i class="fa-solid fa-receipt"></i> ${sellerOrders.length} طلب</span><span><i class="fa-solid fa-coins"></i> ${Site.formatMoney(s.total_earnings||0)}</span><span><i class="fa-solid fa-wallet"></i> ${Site.formatMoney(s.pending_payout||0)} مستحق</span></div>
        <div class="actions">
          <button class="btn-icon" onclick="App.viewSeller('${s.id}')" title="عرض"><i class="fa-solid fa-eye"></i></button>
          ${s.status==='pending'?`<button class="btn-icon success" onclick="App.decideSeller('${s.id}','approved')" title="موافقة"><i class="fa-solid fa-check"></i></button><button class="btn-icon danger" onclick="App.decideSeller('${s.id}','rejected')" title="رفض"><i class="fa-solid fa-xmark"></i></button>`:''}
          ${s.status==='approved'?`<button class="btn-icon warn" onclick="App.updateCommission('${s.id}')" title="العمولة"><i class="fa-solid fa-percent"></i></button><button class="btn-icon success" onclick="App.paySeller('${s.id}')" title="سداد" ${s.pending_payout<=0?'disabled style="opacity:.4;"':''}><i class="fa-solid fa-money-bill-transfer"></i></button><button class="btn-icon danger" onclick="App.decideSeller('${s.id}','blocked')" title="حظر"><i class="fa-solid fa-ban"></i></button>`:''}
          ${s.status==='blocked'?`<button class="btn-icon success" onclick="App.decideSeller('${s.id}','approved')" title="إعادة تفعيل"><i class="fa-solid fa-unlock"></i></button>`:''}
        </div>
      </div>`;
    }).join('');
  }
  function viewSeller(id) {
    const s = state.sellers.find(x => x.id === id);
    if (!s) return;
    const sellerOrders = state.allOrders.filter(o => o.seller_id === s.id);
    openModal(`<h3>بيانات البائعة</h3><div class="editor-grid"><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">الاسم المعروض</h5><div style="font-size:13px;">${Site.escapeHtml(s.display_name)}</div></div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">العمولة</h5><div style="font-size:13px;">${Math.round((s.commission_rate||0)*100)}%</div></div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">إجمالي الأرباح</h5><div class="mono" style="font-size:13px;color:var(--success);">${Site.formatMoney(s.total_earnings||0)}</div></div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">مستحق للسحب</h5><div class="mono" style="font-size:13px;color:var(--honey);">${Site.formatMoney(s.pending_payout||0)}</div></div></div><div class="form-section" style="padding:14px;margin-top:12px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">نبذة</h5><p style="font-size:12.5px;margin:0;">${Site.escapeHtml(s.bio||'')}</p>${s.subjects?`<h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:10px 0 4px;">المواد</h5><p style="font-size:12px;margin:0;">${Site.escapeHtml(s.subjects)}</p>`:''}</div>${sellerOrders.length?`<h4 style="font-family:var(--font-display);font-size:15px;margin:14px 0 8px;">الطلبات (${sellerOrders.length})</h4><div class="table-wrap" style="max-height:200px;overflow-y:auto;"><table class="data-table"><thead><tr><th>المبلغ</th><th>حصة البائعة</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${sellerOrders.map(o=>`<tr><td class="mono">${Site.formatMoney(o.amount,o.currency)}</td><td class="mono" style="color:var(--success);">${Site.formatMoney(o.seller_payout,o.currency)}</td><td>${orderBadge(o.status)}</td><td>${Site.formatDate(o.created_at)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="font-size:12px;margin-top:12px;">لا توجد طلبات.</p>'}<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">${s.status==='pending'?`<button class="btn btn-success" onclick="App.decideSeller('${s.id}','approved')"><i class="fa-solid fa-check"></i> موافقة</button><button class="btn btn-danger" onclick="App.decideSeller('${s.id}','rejected')"><i class="fa-solid fa-xmark"></i> رفض</button>`:''}${s.status==='approved'&&s.pending_payout>0?`<button class="btn btn-success" onclick="App.paySeller('${s.id}')"><i class="fa-solid fa-money-bill-transfer"></i> سداد ${Site.formatMoney(s.pending_payout)}</button>`:''}<button class="btn btn-ghost" onclick="App.closeModal()">إغلاق</button></div>`);
  }
  async function decideSeller(id, decision) {
    let commissionRate = null;
    let reason = '';
    if (decision === 'approved') {
      const cur = state.sellers.find(x => x.id === id);
      if (cur && cur.commission_rate == null) {
        const input = prompt('نسبة العمولة (%) — افتراضي 20:', '20');
        if (input === null) return;
        commissionRate = (parseFloat(input) || 20) / 100;
      }
    } else if (decision === 'rejected') {
      reason = prompt('سبب الرفض (اختياري):') || '';
    }
    if (decision !== 'approved' && decision !== 'rejected' && decision !== 'blocked') return;
    if (!confirm(`متأكدة من ${decision==='approved'?'الموافقة':decision==='rejected'?'الرفض':'الحظر'}؟`)) return;
    try {
      const payload = { action: 'decide-seller', id, decision };
      if (commissionRate !== null) payload.commission_rate = commissionRate;
      if (reason) payload.reason = reason;
      await Site.call('admin', payload);
      Site.toast('تم التحديث.', 'success');
      await loadSellers(); closeModal();
      if (state.currentSection === 'dashboard') await loadDashboard();
    } catch (err) { Site.toast(err.message, 'error'); }
  }
  async function updateCommission(id) {
    const s = state.sellers.find(x => x.id === id);
    const input = prompt(`نسبة العمولة لـ "${s.display_name}" (حالياً ${Math.round((s.commission_rate||0)*100)}%):`, String(Math.round((s.commission_rate||0)*100)));
    if (input === null) return;
    const rate = (parseFloat(input) || 0) / 100;
    try { await Site.call('admin', { action: 'update-seller-commission', id, commission_rate: rate }); Site.toast('تم تحديث العمولة.', 'success'); await loadSellers(); } catch (err) { Site.toast(err.message, 'error'); }
  }
  async function paySeller(id) {
    const s = state.sellers.find(x => x.id === id);
    if (!s || s.pending_payout <= 0) return;
    if (!confirm(`تأكيد سداد ${Site.formatMoney(s.pending_payout)} لـ "${s.display_name}"؟`)) return;
    try { await Site.call('admin', { action: 'mark-payout-paid', id, amount: s.pending_payout, currency: 'BHD' }); Site.toast('تم تسجيل السداد.', 'success'); await loadSellers(); closeModal(); } catch (err) { Site.toast(err.message, 'error'); }
  }

  // ── Seller Materials Review ──
  async function loadSellerMaterials() {
    const res = await Site.call('admin', { action: 'list', what: 'materials' });
    state.sellerMaterials = (res.items || []).filter(m => m.seller_id && m.seller_status === 'pending');
    const sellersRes = await Site.call('admin', { action: 'list', what: 'sellers' });
    state.sellers = sellersRes.items || [];
    renderSellerMaterialsList();
  }
  function renderSellerMaterialsList() {
    const host = document.getElementById('sellerMaterialsList');
    if (!state.sellerMaterials.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-clipboard-check"></i></div><h3>لا توجد مواد بانتظار المراجعة</h3><p>عندما ترفع بائعة مادة جديدة، ستظهر هنا للموافقة.</p></div>`; return; }
    host.innerHTML = state.sellerMaterials.map(m => {
      const seller = state.sellers.find(s => s.id === m.seller_id);
      return `<div class="seller-row">
        <div class="info"><h4>${Site.escapeHtml(m.title)}</h4><small>${Site.escapeHtml(m.type)} · ${seller?Site.escapeHtml(seller.display_name):'بائع'}</small>${m.description?`<p style="margin:6px 0 0;font-size:11.5px;color:var(--text-on-dark-dim);">${Site.escapeHtml(m.description)}</p>`:''}</div>
        <div class="stats"><span><i class="fa-solid fa-tag"></i> ${Site.fileTypeLabel(m.file_type)}</span>${m.individual_price?`<span><i class="fa-solid fa-coins"></i> ${Site.formatMoney(m.individual_price,m.currency)}</span>`:''}</div>
        <div class="actions">
          <button class="btn-icon" onclick="App.viewSellerMaterial('${m.id}')" title="عرض"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icon success" onclick="App.decideSellerMaterial('${m.id}','approved')" title="موافقة"><i class="fa-solid fa-check"></i></button>
          <button class="btn-icon danger" onclick="App.decideSellerMaterial('${m.id}','rejected')" title="رفض"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }).join('');
  }
  function viewSellerMaterial(id) {
    const m = state.sellerMaterials.find(x => x.id === id);
    if (!m) return;
    const seller = state.sellers.find(s => s.id === m.seller_id);
    openModal(`<h3>${Site.escapeHtml(m.title)}</h3><p class="muted" style="font-size:12px;margin:0 0 14px;">بواسطة: ${seller?Site.escapeHtml(seller.display_name):'بائع'}</p>
      <div class="editor-grid">
        <div class="form-section" style="padding:12px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">النوع</h5>${Site.escapeHtml(m.type)}</div>
        <div class="form-section" style="padding:12px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">السعر</h5>${m.individual_price?Site.formatMoney(m.individual_price,m.currency):'مجاني'}</div>
        <div class="form-section" style="padding:12px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">نوع الملف</h5>${Site.fileTypeLabel(m.file_type)}</div>
        <div class="form-section" style="padding:12px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">الوصول</h5>${m.is_locked?(m.access==='subscription'?'مشتركين':'شراء فردي'):'مجاني'}</div>
      </div>
      ${m.description?`<div class="form-section" style="padding:12px;margin-top:10px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">الوصف</h5><p style="font-size:12.5px;margin:0;">${Site.escapeHtml(m.description)}</p></div>`:''}
      ${m.preview_content?`<div class="form-section" style="padding:12px;margin-top:10px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">معاينة</h5><p style="font-size:12px;margin:0;">${Site.escapeHtml(m.preview_content)}</p></div>`:''}
      <div class="form-section" style="padding:12px;margin-top:10px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 4px;">رابط الملف</h5><a href="${Site.escapeHtml(m.file_url||'')}" target="_blank" rel="noopener" style="font-size:11.5px;color:var(--honey);word-break:break-all;">${Site.escapeHtml(m.file_url||'')}</a></div>
      <div class="field" style="margin-top:12px;"><label>سبب الرفض (إن وُجد)</label><textarea id="sm-reason" rows="2" placeholder="مثال: الملف غير واضح" style="width:100%;padding:11px;border-radius:var(--radius-s);border:1px solid var(--ink-700);background:var(--ink-900);color:var(--text-on-dark);font-size:12.5px;resize:vertical;"></textarea></div>
      <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-success" onclick="App.decideSellerMaterial('${m.id}','approved')"><i class="fa-solid fa-check"></i> موافقة ونشر</button><button class="btn btn-danger" onclick="App.decideSellerMaterial('${m.id}','rejected')"><i class="fa-solid fa-xmark"></i> رفض</button><button class="btn btn-ghost" onclick="App.closeModal()">إغلاق</button></div>`);
  }
  async function decideSellerMaterial(id, decision) {
    const reason = document.getElementById('sm-reason')?.value || '';
    if (decision === 'rejected' && !reason) { if (!confirm('رفض بدون سبب؟')) return; }
    try {
      await Site.call('admin', { action: 'decide-seller-material', id, decision, reason });
      Site.toast(decision === 'approved' ? 'تمت الموافقة والنشر.' : 'تم الرفض.', 'success');
      closeModal(); await loadSellerMaterials();
      if (state.currentSection === 'dashboard') await loadDashboard();
    } catch (err) { Site.toast(err.message, 'error'); }
  }

  // ── Coupons ──
  async function loadCoupons() {
    const res = await Site.call('admin', { action: 'list', what: 'coupons' });
    state.coupons = res.items || [];
    renderCouponsTable();
  }
  function renderCouponsTable() {
    const tbody = document.getElementById('couponsTableBody');
    if (!state.coupons.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty-row"><div style="padding:24px;"><i class="fa-solid fa-ticket" style="font-size:28px;color:var(--honey);opacity:.5;margin-bottom:8px;"></i><p style="margin:0 0 12px;">لا توجد كوبونات.</p><button class="btn btn-primary btn-sm" onclick="App.openCouponEditor()"><i class="fa-solid fa-plus"></i> إضافة كوبون</button></div></td></tr>`; return; }
    tbody.innerHTML = state.coupons.map(c => `<tr><td><code style="font-family:var(--font-mono);font-weight:700;color:var(--honey);">${Site.escapeHtml(c.code)}</code></td><td>${c.discount_type==='percent'?'نسبة %':'مبلغ ثابت'}</td><td class="mono">${c.discount_type==='percent'?c.discount_value+'%':Site.formatMoney(c.discount_value)}</td><td>${c.used_count||0}${c.max_uses?'/ '+c.max_uses:''}</td><td>${c.expires_at?Site.formatDate(c.expires_at):'—'}</td><td>${c.is_active?'<span class="chip active">مفعّل</span>':'<span class="chip inactive">معطّل</span>'}</td><td><button class="btn-icon" onclick="App.openCouponEditor('${c.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('coupons','${c.id}','${Site.escapeHtml(c.code)}')"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
  }
  function openCouponEditor(id) {
    const c = id ? state.coupons.find(x => x.id === id) : null;
    const isNew = !c;
    const data = c || { code: '', discount_type: 'percent', discount_value: 10, max_uses: '', expires_at: '', is_active: true };
    openModal(`<h3>${isNew?'إضافة كوبون':'تعديل: '+(data.code||'')}</h3><form id="couponForm"><div class="editor-grid"><div class="field"><label>الكود *</label><input type="text" id="c-code" required value="${Site.escapeHtml(data.code)}" placeholder="SAVE20" style="text-transform:uppercase;"></div><div class="field"><label>نوع الخصم</label><select id="c-discount_type"><option value="percent" ${data.discount_type==='percent'?'selected':''}>نسبة مئوية %</option><option value="fixed" ${data.discount_type==='fixed'?'selected':''}>مبلغ ثابت</option></select></div><div class="field"><label>القيمة</label><input type="number" id="c-discount_value" step="0.001" min="0" required value="${data.discount_value||0}"><div class="hint">إن كانت نسبة: 20 = 20%. إن كانت مبلغ: 5 = 5 دنانير.</div></div><div class="field"><label>أقصى استخدام</label><input type="number" id="c-max_uses" min="0" value="${data.max_uses||''}" placeholder="فارغ = غير محدود"></div><div class="field full"><label>تاريخ الانتهاء</label><input type="date" id="c-expires_at" value="${data.expires_at?data.expires_at.slice(0,10):''}"></div></div><div class="toggle-row"><div class="info"><h4>مفعّل</h4></div><label class="toggle"><input type="checkbox" id="c-is_active" ${data.is_active!==false?'checked':''}><span class="slider"></span></label></div><div style="display:flex;gap:10px;margin-top:14px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'إضافة':'حفظ'}</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('couponForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const item = { ...(c || {}), code: document.getElementById('c-code').value.trim().toUpperCase(), discount_type: document.getElementById('c-discount_type').value, discount_value: parseFloat(document.getElementById('c-discount_value').value), max_uses: document.getElementById('c-max_uses').value ? parseInt(document.getElementById('c-max_uses').value, 10) : null, expires_at: document.getElementById('c-expires_at').value ? new Date(document.getElementById('c-expires_at').value).toISOString() : null, is_active: document.getElementById('c-is_active').checked };
      if (c) item.id = c.id;
      try { await Site.call('admin', { action: 'save', what: 'coupons', item }); Site.toast(isNew?'تمت الإضافة.':'تم الحفظ.', 'success'); closeModal(); await loadCoupons(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Users ──
  async function loadUsers() {
    const res = await Site.call('admin', { action: 'list', what: 'users' });
    state.users = res.items || [];
    const [subsRes, ordersRes] = await Promise.all([Site.call('admin', { action: 'list', what: 'subscriptions' }), Site.call('admin', { action: 'list', what: 'orders' })]);
    state.subscriptions = subsRes.items || [];
    state.allOrders = ordersRes.items || [];
    renderUsersTable();
  }
  function renderUsersTable() {
    let list = state.users.slice();
    if (state.userSearch) list = list.filter(u => (u.name||'').toLowerCase().includes(state.userSearch) || (u.email||'').toLowerCase().includes(state.userSearch));
    list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const tbody = document.getElementById('usersTableBody');
    if (!list.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty-row"><div style="padding:24px;"><i class="fa-solid fa-users" style="font-size:28px;color:var(--honey);opacity:.5;margin-bottom:8px;"></i><p style="margin:0;">${state.userSearch?'لا نتائج.':'لا يوجد مستخدمون بعد.'}</p></div></td></tr>`; return; }
    tbody.innerHTML = list.map(u => {
      const sub = state.subscriptions?.find(s => s.user_id === u.id && s.status === 'active' && new Date(s.expires_at) > new Date());
      const userOrders = state.allOrders?.filter(o => o.user_id === u.id) || [];
      const daysLeft = sub ? Math.ceil((new Date(sub.expires_at) - new Date()) / 86400000) : 0;
      const isSeller = state.sellers?.some(s => s.user_id === u.id && s.status === 'approved');
      return `<tr><td><div style="display:flex;align-items:center;gap:8px;"><div class="user-avatar">${Site.escapeHtml(u.name?.charAt(0)||'م')}</div><div><div style="font-weight:600;font-size:12px;">${Site.escapeHtml(u.name)}</div><small class="muted">${Site.escapeHtml(u.email)}</small></div></div></td><td>${u.gender==='female'?'<span style="color:var(--purple);"><i class="fa-solid fa-venus"></i></span>':'<span style="color:var(--info);"><i class="fa-solid fa-mars"></i></span>'}</td><td>${u.grade?Site.escapeHtml(gradeLabel(u.grade)):'—'}</td><td>${sub?`<span class="chip active">${daysLeft} يوم</span>`:'<span class="chip inactive">لا</span>'}</td><td class="mono">${userOrders.length}</td><td>${Site.formatDate(u.created_at)}</td><td>${u.status==='blocked'?'<span class="chip inactive">محظور</span>':(isSeller?'<span class="chip seller">بائعة</span>':'<span class="chip active">فعّال</span>')}</td><td style="white-space:nowrap;"><button class="btn-icon" onclick="App.viewUser('${u.id}')"><i class="fa-solid fa-eye"></i></button><button class="btn-icon ${u.status==='blocked'?'success':'warn'}" onclick="App.toggleUserStatus('${u.id}')"><i class="fa-solid fa-${u.status==='blocked'?'unlock':'ban'}"></i></button>${sub?`<button class="btn-icon success" onclick="App.extendSubscription('${u.id}')"><i class="fa-solid fa-clock"></i></button>`:''}</td></tr>`;
    }).join('');
  }
  function viewUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    const sub = state.subscriptions?.find(s => s.user_id === u.id && s.status === 'active' && new Date(s.expires_at) > new Date());
    const plan = sub ? state.plans.find(p => p.id === sub.plan_id) : null;
    const userOrders = state.allOrders?.filter(o => o.user_id === u.id) || [];
    const daysLeft = sub ? Math.ceil((new Date(sub.expires_at) - new Date()) / 86400000) : 0;
    const seller = state.sellers?.find(s => s.user_id === u.id);
    openModal(`<h3>بيانات المستخدم</h3><div class="editor-grid"><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">الاسم</h5>${Site.escapeHtml(u.name)}</div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">البريد</h5>${Site.escapeHtml(u.email)}</div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">الجنس</h5>${u.gender==='female'?'طالبة':'طالب'}</div><div class="form-section" style="padding:14px;margin:0;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">الحالة</h5>${u.status==='blocked'?'<span class="chip inactive">محظور</span>':'<span class="chip active">فعّال</span>'}</div></div>${sub?`<div class="form-section" style="background:rgba(76,175,125,.08);border-color:rgba(76,175,125,.3);margin-top:12px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">الاشتراك</h5>${Site.escapeHtml(plan?.name||'—')} — ${daysLeft} يوم</div>`:'<div class="alert info" style="margin-top:12px;"><i class="fa-solid fa-info"></i><div>لا يوجد اشتراك.</div></div>'}${seller?`<div class="form-section" style="background:rgba(179,157,219,.08);border-color:rgba(179,157,219,.3);margin-top:12px;"><h5 style="font-size:11px;color:var(--text-on-dark-dim);margin:0 0 6px;">بائعة ${seller.status==='approved'?'معتمدة':seller.status}</h5>${Site.escapeHtml(seller.display_name)} · عمولة ${Math.round((seller.commission_rate||0)*100)}%</div>`:''}<h4 style="font-family:var(--font-display);font-size:15px;margin:14px 0 8px;">الطلبات (${userOrders.length})</h4>${userOrders.length?`<div class="table-wrap" style="max-height:180px;overflow-y:auto;"><table class="data-table"><thead><tr><th>النوع</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${userOrders.map(o=>`<tr><td>${o.type==='subscription'?'اشتراك':'شراء'}</td><td class="mono">${Site.formatMoney(o.amount,o.currency)}</td><td>${orderBadge(o.status)}</td><td>${Site.formatDate(o.created_at)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="font-size:12px;">لا توجد طلبات.</p>'}<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">${sub?`<button class="btn btn-success" onclick="App.extendSubscription('${u.id}')"><i class="fa-solid fa-clock"></i> تمديد</button>`:''}<button class="btn ${u.status==='blocked'?'btn-success':'btn-danger'}" onclick="App.toggleUserStatus('${u.id}')"><i class="fa-solid fa-${u.status==='blocked'?'unlock':'ban'}"></i> ${u.status==='blocked'?'تفعيل':'حظر'}</button><button class="btn btn-ghost" onclick="App.closeModal()">إغلاق</button></div>`);
  }
  async function toggleUserStatus(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    if (!confirm(u.status === 'blocked' ? 'تفعيل؟' : 'حظر؟')) return;
    try { await Site.call('admin', { action: 'toggle-user-status', id }); Site.toast('تم التحديث.', 'success'); await loadUsers(); closeModal(); } catch (err) { Site.toast(err.message, 'error'); }
  }
  function extendSubscription(userId) {
    const sub = state.subscriptions?.find(s => s.user_id === userId);
    openModal(`<h3>تمديد الاشتراك</h3><form id="extendForm"><div class="field"><label>الخطة</label><select id="ext-plan_id">${state.plans.map(p=>`<option value="${p.id}" ${sub?.plan_id===p.id?'selected':''}>${Site.escapeHtml(p.name)}</option>`).join('')}</select></div><div class="field"><label>عدد الأيام</label><input type="number" id="ext-days" min="1" value="30" required></div><div style="display:flex;gap:8px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-plus"></i> تمديد</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('extendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const planId = document.getElementById('ext-plan_id').value;
      const days = parseInt(document.getElementById('ext-days').value, 10);
      try { await Site.call('admin', { action: 'extend-subscription', user_id: userId, plan_id: planId, days }); Site.toast('تم التمديد.', 'success'); closeModal(); await loadUsers(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Meets ──
  async function loadMeets() {
    const res = await Site.call('admin', { action: 'list', what: 'meets' });
    state.meets = (res.items || []).slice().sort((a,b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));
    renderMeetsList();
  }
  function renderMeetsList() {
    const host = document.getElementById('meetsList');
    if (!state.meets.length) { host.innerHTML = `<div class="admin-empty" style="grid-column:1/-1"><div class="icon"><i class="fa-solid fa-video"></i></div><h3>لا توجد بثوث</h3><p>أضف بثاً.</p><button class="btn btn-primary" onclick="App.openMeetEditor()"><i class="fa-solid fa-plus"></i> جدولة</button></div>`; return; }
    host.innerHTML = state.meets.map(m => `<div class="meet-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;"><span class="badge meet">${Site.escapeHtml(m.platform||'بث')}</span>${m.girls_only?'<span class="girls-tag"><i class="fa-solid fa-venus"></i></span>':''}${m.is_published===false?'<span class="chip inactive">مسودة</span>':''}</div><h4 style="margin-top:8px;">${Site.escapeHtml(m.title)}</h4>${m.scheduled_at?`<div class="when"><i class="fa-solid fa-calendar"></i> ${Site.formatDateTime(m.scheduled_at)}</div>`:''}${m.description?`<p>${Site.escapeHtml(m.description)}</p>`:''}<div style="display:flex;gap:6px;margin-top:8px;"><button class="btn-icon" onclick="App.openMeetEditor('${m.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('meets','${m.id}','${Site.escapeHtml(m.title).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div></div>`).join('');
  }
  function openMeetEditor(id) {
    const m = id ? state.meets.find(x => x.id === id) : null;
    const isNew = !m;
    const data = m || { title: '', description: '', platform: 'Google Meet', url: '', scheduled_at: '', girls_only: true, capacity: 50, notes: '', is_published: true };
    const localDate = data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : '';
    openModal(`<h3>${isNew?'جدولة بث':'تعديل: '+(data.title||'')}</h3><form id="meetForm"><div class="editor-grid"><div class="field full"><label>عنوان البث *</label><input type="text" id="mt-title" required value="${Site.escapeHtml(data.title)}" placeholder="مراجعة الفيزياء"></div><div class="field"><label>المنصّة</label><select id="mt-platform"><option value="Google Meet" ${data.platform==='Google Meet'?'selected':''}>Google Meet</option><option value="Zoom" ${data.platform==='Zoom'?'selected':''}>Zoom</option><option value="YouTube Live" ${data.platform==='YouTube Live'?'selected':''}>YouTube Live</option><option value="أخرى" ${data.platform==='أخرى'?'selected':''}>أخرى</option></select></div><div class="field"><label>موعد البث</label><input type="datetime-local" id="mt-scheduled_at" value="${localDate}"></div><div class="field full"><label>رابط البث *</label><input type="url" id="mt-url" dir="ltr" required value="${Site.escapeHtml(data.url||'')}" placeholder="https://meet.google.com/..."></div><div class="field"><label>السعة القصوى</label><input type="number" id="mt-capacity" min="1" value="${data.capacity||50}"></div><div class="field full"><label>الوصف</label><textarea id="mt-description" rows="2">${Site.escapeHtml(data.description||'')}</textarea></div></div><div class="form-section" style="padding:14px;margin:12px 0;background:linear-gradient(135deg,rgba(179,157,219,.10),rgba(231,169,61,.06));border:1px solid rgba(179,157,219,.35);border-radius:var(--radius-m);"><div class="toggle-row" style="margin:0;"><div class="info"><h4 style="display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-venus" style="color:var(--purple);"></i> بث حصري للطالبات فقط</h4><p style="font-size:11.5px;color:var(--text-on-dark-dim);margin:4px 0 0;line-height:1.6;">موصى به للمعلمات اللاتي يرغبن بخصوصية أصواتهنّ أو صورهنّ أثناء البثوث المباشرة على Meet/Zoom.</p></div><label class="toggle"><input type="checkbox" id="mt-girls_only" ${data.girls_only?'checked':''}><span class="slider"></span></label></div></div><div class="toggle-row"><div class="info"><h4>منشور</h4></div><label class="toggle"><input type="checkbox" id="mt-is_published" ${data.is_published!==false?'checked':''}><span class="slider"></span></label></div><div style="display:flex;gap:8px;margin-top:14px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'جدولة':'حفظ'}</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('meetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const item = { ...(m || {}), title: document.getElementById('mt-title').value.trim(), platform: document.getElementById('mt-platform').value, scheduled_at: document.getElementById('mt-scheduled_at').value ? new Date(document.getElementById('mt-scheduled_at').value).toISOString() : '', url: document.getElementById('mt-url').value.trim(), capacity: parseInt(document.getElementById('mt-capacity').value, 10), description: document.getElementById('mt-description').value.trim(), girls_only: document.getElementById('mt-girls_only').checked, is_published: document.getElementById('mt-is_published').checked };
      if (m) item.id = m.id;
      try { await Site.call('admin', { action: 'save', what: 'meets', item }); Site.toast(isNew?'تمت الجدولة.':'تم الحفظ.', 'success'); closeModal(); await loadMeets(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Reviews ──
  async function loadReviews() {
    const res = await Site.call('admin', { action: 'list', what: 'reviews' });
    state.reviews = (res.items || []).slice().sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderReviewsList();
  }
  function renderReviewsList() {
    const host = document.getElementById('reviewsList');
    if (!state.reviews.length) { host.innerHTML = `<div class="admin-empty" style="grid-column:1/-1"><div class="icon"><i class="fa-solid fa-star"></i></div><h3>لا توجد تقييمات</h3><p>أضف تقييمات.</p><button class="btn btn-primary" onclick="App.openReviewEditor()"><i class="fa-solid fa-plus"></i> إضافة</button></div>`; return; }
    host.innerHTML = state.reviews.map(r => `<div class="review-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;"><div class="stars">${Site.stars(r.rating)}</div>${r.is_visible?'<span class="chip active">ظاهر</span>':'<span class="chip inactive">مخفي</span>'}</div><p>"${Site.escapeHtml(r.content)}"</p><div style="display:flex;justify-content:space-between;align-items:center;"><div class="who">${Site.escapeHtml(r.customer_name)}</div><div style="display:flex;gap:6px;"><button class="btn-icon" onclick="App.openReviewEditor('${r.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('reviews','${r.id}','${Site.escapeHtml(r.customer_name).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div></div></div>`).join('');
  }
  function openReviewEditor(id) {
    const r = id ? state.reviews.find(x => x.id === id) : null;
    const isNew = !r;
    const data = r || { customer_name: '', rating: 5, content: '', is_visible: true };
    openModal(`<h3>${isNew?'إضافة تقييم':'تعديل تقييم'}</h3><form id="reviewForm"><div class="field"><label>اسم العميل</label><input type="text" id="r-customer_name" required value="${Site.escapeHtml(data.customer_name)}" placeholder="طالبة ثانوية"></div><div class="field"><label>التقييم</label><select id="r-rating"><option value="5" ${data.rating===5?'selected':''}>★★★★★ ممتاز</option><option value="4" ${data.rating===4?'selected':''}>★★★★☆ جيد جداً</option><option value="3" ${data.rating===3?'selected':''}>★★★☆☆ جيد</option><option value="2" ${data.rating===2?'selected':''}>★★☆☆☆ مقبول</option><option value="1" ${data.rating===1?'selected':''}>★☆☆☆☆ ضعيف</option></select></div><div class="field"><label>نص التقييم</label><textarea id="r-content" rows="3" required>${Site.escapeHtml(data.content||'')}</textarea></div><div class="toggle-row"><div class="info"><h4>ظاهر في الموقع</h4></div><label class="toggle"><input type="checkbox" id="r-is_visible" ${data.is_visible?'checked':''}><span class="slider"></span></label></div><div style="display:flex;gap:8px;margin-top:14px;"><button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> ${isNew?'إضافة':'حفظ'}</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('reviewForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const item = { ...(r || {}), customer_name: document.getElementById('r-customer_name').value.trim(), rating: parseInt(document.getElementById('r-rating').value, 10), content: document.getElementById('r-content').value.trim(), is_visible: document.getElementById('r-is_visible').checked };
      if (r) item.id = r.id;
      try { await Site.call('admin', { action: 'save', what: 'reviews', item }); Site.toast(isNew?'تمت الإضافة.':'تم الحفظ.', 'success'); closeModal(); await loadReviews(); } catch (err) { Site.toast(err.message, 'error'); }
    });
  }

  // ── Testimonials (آراء مختارة) — renamed from reviews ──
  async function loadTestimonials() {
    const res = await Site.call('admin', { action: 'list', what: 'reviews' });
    state.reviews = (res.items || []).slice().sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const host = document.getElementById('reviewsRowList');
    if (!state.reviews.length) { host.innerHTML = `<div class="admin-empty" style="grid-column:1/-1"><div class="icon"><i class="fa-solid fa-quote-right"></i></div><h3>لا توجد آراء مختارة</h3><p>أضف شهادات تسويقية.</p><button class="btn btn-primary" onclick="App.openReviewEditor()"><i class="fa-solid fa-plus"></i> إضافة</button></div>`; return; }
    host.innerHTML = state.reviews.map(r => `<div class="review-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;"><div class="stars">${Site.stars(r.rating)}</div>${r.is_visible?'<span class="chip active">ظاهر</span>':'<span class="chip inactive">مخفي</span>'}</div><p>"${Site.escapeHtml(r.content)}"</p><div style="display:flex;justify-content:space-between;align-items:center;"><div class="who">${Site.escapeHtml(r.customer_name)}</div><div style="display:flex;gap:6px;"><button class="btn-icon" onclick="App.openReviewEditor('${r.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('reviews','${r.id}','${Site.escapeHtml(r.customer_name).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div></div></div>`).join('');
  }

  // ── Categories (هرمي) ──
  async function loadCategories() {
    const res = await Site.call('admin', { action: 'list', what: 'categories' });
    state.categories = res.items || [];
    const host = document.getElementById('categoriesList');
    if (!state.categories.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-sitemap"></i></div><h3>لا توجد تصنيفات</h3><p>أنشئ تصنيفات هرمية (مادة → فصل → نوع).</p><button class="btn btn-primary" onclick="App.openCategoryEditor()"><i class="fa-solid fa-plus"></i> إضافة</button></div>`; return; }
    host.innerHTML = state.categories.map(c => `<div class="seller-row"><div class="info"><h4>${Site.escapeHtml(c.name)}</h4><small>${c.parent_id?('تحت: '+(state.categories.find(p=>p.id===c.parent_id)?.name||'—')):'تصنيف رئيسي'} · ${c.type||'عام'}</small></div><button class="btn-icon" onclick="App.openCategoryEditor('${c.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" onclick="App.deleteItem('categories','${c.id}','${Site.escapeHtml(c.name).replace(/'/g,'')}')"><i class="fa-solid fa-trash"></i></button></div>`).join('');
  }
  function openCategoryEditor(id) {
    const c = id ? state.categories?.find(x => x.id === id) : null;
    const isNew = !c;
    const data = c || { name: '', parent_id: '', type: 'general' };
    const parentOpts = '<option value="">— تصنيف رئيسي —</option>' + (state.categories||[]).filter(x=>x.id!==id).map(p=>`<option value="${p.id}" ${data.parent_id===p.id?'selected':''}>${Site.escapeHtml(p.name)}</option>`).join('');
    openModal(`<h3>${isNew?'إضافة تصنيف':'تعديل'}</h3><form id="catForm"><div class="field"><label>الاسم *</label><input type="text" id="c-name" required value="${Site.escapeHtml(data.name)}"></div><div class="field"><label>التصنيف الأب</label><select id="c-parent_id">${parentOpts}</select></div><div class="field"><label>النوع</label><select id="c-type"><option value="general" ${data.type==='general'?'selected':''}>عام</option><option value="subject" ${data.type==='subject'?'selected':''}>مادة</option><option value="unit" ${data.type==='unit'?'selected':''}>فصل/وحدة</option><option value="content_type" ${data.type==='content_type'?'selected':''}>نوع محتوى</option></select></div><div style="display:flex;gap:10px;margin-top:14px;"><button type="submit" class="btn btn-primary">حفظ</button><button type="button" class="btn btn-ghost" onclick="App.closeModal()">إلغاء</button></div></form>`);
    document.getElementById('catForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const item = { ...(c || {}), name: document.getElementById('c-name').value.trim(), parent_id: document.getElementById('c-parent_id').value, type: document.getElementById('c-type').value };
      if (c) item.id = c.id;
      try { await Site.call('admin', { action: 'save-category', item }); Site.toast('تم الحفظ.','success'); closeModal(); await loadCategories(); } catch (err) { Site.toast(err.message,'error'); }
    });
  }

  // ── Seller Meets Review ──
  async function loadSellerMeets() {
    const res = await Site.call('admin', { action: 'list', what: 'meets' });
    state.sellerMeets = (res.items || []).filter(m => m.seller_id && m.seller_status === 'pending');
    const sellersRes = await Site.call('admin', { action: 'list', what: 'sellers' });
    state.sellers = sellersRes.items || [];
    const host = document.getElementById('sellerMeetsList');
    if (!state.sellerMeets.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-video"></i></div><h3>لا توجد بثوث بانتظار المراجعة</h3></div>`; return; }
    host.innerHTML = state.sellerMeets.map(m => {
      const seller = state.sellers.find(s => s.id === m.seller_id);
      return `<div class="seller-row"><div class="info"><h4>${Site.escapeHtml(m.title)}</h4><small>${Site.escapeHtml(m.platform||'بث')} · ${seller?Site.escapeHtml(seller.display_name):'بائع'}${m.girls_only?' · <span style="color:var(--purple);">للطالبات</span>':''}</small></div><div class="actions"><button class="btn-icon" onclick="App.viewSellerMeet('${m.id}')" title="عرض"><i class="fa-solid fa-eye"></i></button><button class="btn-icon success" onclick="App.decideSellerMeet('${m.id}','approved')" title="موافقة"><i class="fa-solid fa-check"></i></button><button class="btn-icon danger" onclick="App.decideSellerMeet('${m.id}','rejected')" title="رفض"><i class="fa-solid fa-xmark"></i></button></div></div>`;
    }).join('');
  }
  async function decideSellerMeet(id, decision) {
    const reason = decision === 'rejected' ? (prompt('سبب الرفض (اختياري):') || '') : '';
    try { await Site.call('admin', { action: 'decide-seller-meet', id, decision, reason }); Site.toast(decision==='approved'?'تمت الموافقة.':'تم الرفض.','success'); await loadSellerMeets(); } catch (err) { Site.toast(err.message,'error'); }
  }
  function viewSellerMeet(id) {
    const m = state.sellerMeets?.find(x => x.id === id);
    if (!m) return;
    openModal(`<h3>${Site.escapeHtml(m.title)}</h3><p class="muted" style="font-size:12px;margin:0 0 12px;">${Site.escapeHtml(m.platform||'بث')}${m.scheduled_at?' · '+Site.formatDateTime(m.scheduled_at):''}</p>${m.description?`<p style="font-size:12.5px;margin:0 0 12px;">${Site.escapeHtml(m.description)}</p>`:''}<div class="form-section" style="padding:12px;"><h5 style="font-size:11px;margin:0 0 4px;">الرابط</h5><a href="${Site.escapeHtml(m.url||'')}" target="_blank" style="font-size:11.5px;color:var(--honey);word-break:break-all;">${Site.escapeHtml(m.url||'')}</a></div><div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-success" onclick="App.decideSellerMeet('${m.id}','approved')"><i class="fa-solid fa-check"></i> موافقة</button><button class="btn btn-danger" onclick="App.decideSellerMeet('${m.id}','rejected')"><i class="fa-solid fa-xmark"></i> رفض</button><button class="btn btn-ghost" onclick="App.closeModal()">إغلاق</button></div>`);
  }

  // ── Verified Reviews Moderation ──
  async function loadVerifiedReviews() {
    const res = await Site.call('admin', { action: 'list-verified-reviews' });
    state.verifiedReviews = res.reviews || [];
    const host = document.getElementById('reviewsList');
    if (!state.verifiedReviews.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-star-half-stroke"></i></div><h3>لا توجد تقييمات موثّقة</h3><p>تقييمات المشترين الحقيقيين ستظهر هنا.</p></div>`; return; }
    host.innerHTML = state.verifiedReviews.map(r => {
      const hideBtn = r.status==='visible' ? `<button class="btn-icon warn" onclick="App.moderateReview('${r.id}','hidden')"><i class="fa-solid fa-eye-slash"></i></button>` : `<button class="btn-icon success" onclick="App.moderateReview('${r.id}','visible')"><i class="fa-solid fa-eye"></i></button>`;
      return `<div class="verified-review-item"><div class="rv-head"><div class="rv-user"><div class="avatar">${Site.escapeHtml(r.user_name?.charAt(0)||'م')}</div><div class="meta"><h5>${Site.escapeHtml(r.user_name)} <span class="verified-badge"><i class="fa-solid fa-circle-check"></i> مشترٍ موثّق</span></h5><small>${Site.formatDate(r.created_at)}</small></div></div><div class="rv-stars">${Site.stars(r.rating)}</div></div><div class="rv-content">${Site.escapeHtml(r.content)}</div><div class="rv-actions">${hideBtn}<button class="btn-icon danger" onclick="App.moderateReview('${r.id}','flagged')"><i class="fa-solid fa-flag"></i></button></div></div>`;
    }).join('');
  }
  async function moderateReview(id, status) {
    try { await Site.call('admin', { action: 'moderate-review', id, status }); Site.toast('تم التحديث.','success'); await loadVerifiedReviews(); } catch (err) { Site.toast(err.message,'error'); }
  }

  // ── Q&A ──
  async function loadQa() {
    const res = await Site.call('admin', { action: 'list-qa' });
    state.qa = res.qa || [];
    const host = document.getElementById('qaList');
    if (!state.qa.length) { host.innerHTML = `<div class="admin-empty"><div class="icon"><i class="fa-solid fa-question"></i></div><h3>لا توجد أسئلة</h3></div>`; return; }
    host.innerHTML = state.qa.map(q => {
      const answerHtml = q.answer ? `<p class="qa-a">${Site.escapeHtml(q.answer)}</p>` : `<div style="margin-top:8px;"><textarea class="qa-answer-input" data-id="${q.id}" rows="2" placeholder="اكتب الرد..." style="width:100%;padding:10px;border-radius:var(--radius-s);border:1px solid var(--ink-700);background:var(--ink-900);color:var(--text-on-dark);font-size:12.5px;resize:vertical;"></textarea><button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="App.answerQa('${q.id}')"><i class="fa-solid fa-reply"></i> رد</button></div>`;
      return `<div class="qa-item"><p class="qa-q">${Site.escapeHtml(q.question)}</p><p class="qa-meta">${Site.escapeHtml(q.user_name)} · ${Site.formatDate(q.created_at)}${q.status==='pending'?' · <span class="badge pending">بانتظار الرد</span>':' · <span class="badge approved">تم الرد</span>'}</p>${answerHtml}</div>`;
    }).join('');
  }
  async function answerQa(id) {
    const ta = document.querySelector(`.qa-answer-input[data-id="${id}"]`);
    if (!ta) return;
    const answer = ta.value.trim();
    if (!answer) { Site.toast('اكتب الرد أولاً.','error'); return; }
    try { await Site.call('admin', { action: 'answer-qa', id, answer }); Site.toast('تم الرد.','success'); await loadQa(); } catch (err) { Site.toast(err.message,'error'); }
  }

  // ── Delete ──
  async function deleteItem(what, id, name) {
    if (!confirm(`متأكدة من حذف "${name}"؟`)) return;
    try { await Site.call('admin', { action: 'delete', what, id }); Site.toast('تم الحذف.', 'success'); await loadSectionData(state.currentSection); } catch (err) { Site.toast(err.message, 'error'); }
  }

  // ── Settings ──
  async function loadSettingsIntoForm() {
    try {
      const res = await Site.call('admin', { action: 'list', what: 'settings' });
      state.settings = res.items || {};
      const s = state.settings;
      const fields = ['site_name','site_logo','teacher_name','hero_title','hero_subtitle','site_tagline','site_description','payment_phone','payment_phone_owner','whatsapp_number','instagram_url','tiktok_url','youtube_url','snapchat_url','announcement_text','footer_note','admin_email','custom_css'];
      fields.forEach(f => { const el = document.getElementById(`set-${f}`); if (el) el.value = s[f] || ''; });
      document.getElementById('set-site_logo_size').value = s.site_logo_size || 40;
      const selects = ['currency','theme_mode'];
      selects.forEach(f => { const el = document.getElementById(`set-${f}`); if (el) el.value = s[f] || (f==='currency'?'BHD':'dark'); });
      const colorFields = ['theme_color','announcement_color'];
      colorFields.forEach(f => { const el = document.getElementById(`set-${f}`); const txt = document.getElementById(`set-${f}_text`); if (el) el.value = s[f] || '#e7a93d'; if (txt) txt.value = s[f] || '#e7a93d'; });
      const numFields = ['default_commission_rate','min_payout_amount','max_seller_discount_percent','referral_discount_percent','referral_reward_percent'];
      numFields.forEach(f => { const el = document.getElementById(`set-${f}`); if (el) { const defaults = {'default_commission_rate':20,'min_payout_amount':5,'max_seller_discount_percent':30,'referral_discount_percent':10,'referral_reward_percent':5}; const isPercent = f!=='min_payout_amount'; const val = s[f]!=null ? (isPercent?Math.round(s[f]*100):s[f]) : defaults[f]; el.value = val; } });
      const checks = ['payment_method_benefit','payment_method_vodafone','allow_individual_purchase','allow_subscription','marketplace_enabled','referral_enabled','announcement_active','show_stats_section','show_subjects_section','show_latest_section','show_plans_section','show_sellers_section','show_reviews_section','show_faq_section','show_individual_section','show_bundles_section'];
      checks.forEach(f => { const el = document.getElementById(`set-${f}`); if (el) el.checked = s[f] !== false; });
    } catch (err) { Site.toast(err.message, 'error'); }
  }
  async function saveSettings() {
    const settings = {
      site_name: document.getElementById('set-site_name').value.trim(),
      site_logo: document.getElementById('set-site_logo').value.trim(),
      site_logo_size: parseInt(document.getElementById('set-site_logo_size').value, 10) || 40,
      teacher_name: document.getElementById('set-teacher_name').value.trim(),
      hero_title: document.getElementById('set-hero_title').value.trim(),
      hero_subtitle: document.getElementById('set-hero_subtitle').value.trim(),
      site_tagline: document.getElementById('set-site_tagline').value.trim(),
      site_description: document.getElementById('set-site_description').value.trim(),
      theme_color: document.getElementById('set-theme_color').value,
      theme_mode: document.getElementById('set-theme_mode').value,
      custom_css: document.getElementById('set-custom_css').value,
      payment_phone: document.getElementById('set-payment_phone').value.trim(),
      payment_phone_owner: document.getElementById('set-payment_phone_owner').value.trim(),
      currency: document.getElementById('set-currency').value,
      payment_method_benefit: document.getElementById('set-payment_method_benefit').checked,
      payment_method_vodafone: document.getElementById('set-payment_method_vodafone').checked,
      allow_individual_purchase: document.getElementById('set-allow_individual_purchase').checked,
      allow_subscription: document.getElementById('set-allow_subscription').checked,
      marketplace_enabled: document.getElementById('set-marketplace_enabled').checked,
      default_commission_rate: (parseFloat(document.getElementById('set-default_commission_rate').value) || 20) / 100,
      min_payout_amount: parseFloat(document.getElementById('set-min_payout_amount').value) || 5,
      max_seller_discount_percent: parseFloat(document.getElementById('set-max_seller_discount_percent').value) || 30,
      referral_enabled: document.getElementById('set-referral_enabled').checked,
      referral_discount_percent: parseFloat(document.getElementById('set-referral_discount_percent').value) || 10,
      referral_reward_percent: parseFloat(document.getElementById('set-referral_reward_percent').value) || 5,
      announcement_active: document.getElementById('set-announcement_active').checked,
      announcement_text: document.getElementById('set-announcement_text').value.trim(),
      announcement_color: document.getElementById('set-announcement_color').value,
      whatsapp_number: document.getElementById('set-whatsapp_number').value.trim(),
      instagram_url: document.getElementById('set-instagram_url').value.trim(),
      tiktok_url: document.getElementById('set-tiktok_url').value.trim(),
      youtube_url: document.getElementById('set-youtube_url').value.trim(),
      snapchat_url: document.getElementById('set-snapchat_url').value.trim(),
      footer_note: document.getElementById('set-footer_note').value.trim(),
      show_stats_section: document.getElementById('set-show_stats_section').checked,
      show_subjects_section: document.getElementById('set-show_subjects_section').checked,
      show_latest_section: document.getElementById('set-show_latest_section').checked,
      show_plans_section: document.getElementById('set-show_plans_section').checked,
      show_sellers_section: document.getElementById('set-show_sellers_section').checked,
      show_reviews_section: document.getElementById('set-show_reviews_section').checked,
      show_faq_section: document.getElementById('set-show_faq_section').checked,
      show_individual_section: document.getElementById('set-show_individual_section').checked,
      show_bundles_section: document.getElementById('set-show_bundles_section').checked,
      admin_email: document.getElementById('set-admin_email').value.trim(),
    };
    const newPass = document.getElementById('set-admin_password').value;
    if (newPass) settings.admin_password = newPass;
    try { await Site.call('admin', { action: 'save-settings', settings }); Site.toast('تم حفظ الإعدادات.', 'success'); } catch (err) { Site.toast(err.message, 'error'); }
  }

  // ── Data ──
  async function exportData() {
    try {
      const res = await Site.call('admin', { action: 'export-data' });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `platform-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      Site.toast('تم التصدير.', 'success');
    } catch (err) { Site.toast(err.message, 'error'); }
  }
  async function importData() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files || !fileInput.files[0]) { Site.toast('اختر ملفاً.', 'error'); return; }
    if (!confirm('سيتم استبدال كل البيانات. متأكدة؟')) return;
    try { const text = await fileInput.files[0].text(); const data = JSON.parse(text); await Site.call('admin', { action: 'import-data', data }); Site.toast('تم الاستيراد.', 'success'); await loadSectionData(state.currentSection); } catch (err) { Site.toast(err.message || 'ملف غير صحيح.', 'error'); }
  }
  async function resetAll() {
    if (!confirm('تحذير: سيتم حذف كل البيانات. متأكدة؟')) return;
    if (!confirm('تأكيد أخير — لا يمكن التراجع.')) return;
    try { await Site.call('admin', { action: 'reset-all' }); Site.toast('تمت إعادة التعيين.', 'success'); setTimeout(() => window.location.href = 'login.html', 1500); } catch (err) { Site.toast(err.message, 'error'); }
  }

  // ── Pending count ──
  async function refreshPendingCount() {
    try {
      const res = await Site.call('admin', { action: 'list', what: 'orders' });
      const pending = (res.items || []).filter(o => o.status === 'pending').length;
      const el = document.getElementById('pendingCount');
      if (pending > 0) { el.textContent = pending; el.style.display = ''; } else { el.style.display = 'none'; }
    } catch (_) {}
  }

  // ── Drag sort ──
  function enableDragSort(hostId, storeName) {
    const host = document.getElementById(hostId);
    if (!host) return;
    let dragSrc = null;
    host.querySelectorAll('.sortable-item').forEach(item => {
      item.addEventListener('dragstart', (e) => { dragSrc = item; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        const newOrder = Array.from(host.querySelectorAll('.sortable-item')).map(el => el.dataset.id);
        Site.call('admin', { action: 'reorder', what: storeName, ids: newOrder }).then(() => Site.toast('تم التحديث.', 'success', 1500)).catch(() => {});
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!dragSrc || dragSrc === item) return;
        const rect = item.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        if (after) item.after(dragSrc); else item.before(dragSrc);
      });
    });
  }

  // ── Modal ──
  function openModal(html) { document.getElementById('modalContent').innerHTML = html; document.getElementById('modalOverlay').classList.add('open'); }
  function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); document.getElementById('modalContent').innerHTML = ''; }

  // ── Helpers ──
  function orderBadge(s) {
    if (s === 'pending') return '<span class="badge pending">قيد المراجعة</span>';
    if (s === 'approved') return '<span class="badge approved">مقبول</span>';
    if (s === 'rejected') return '<span class="badge rejected">مرفوض</span>';
    if (s === 'cancelled') return '<span class="badge cancelled">ملغى</span>';
    return `<span class="badge">${s}</span>`;
  }
  function gradeLabel(g) { return 'الصف ' + {'7':'السابع','8':'الثامن','9':'التاسع','10':'العاشر','11':'الحادي عشر','12':'الثاني عشر','uni':'جامعة','other':'أخرى'}[g] || g; }
  async function reload() { await loadSectionData(state.currentSection); await refreshPendingCount(); Site.toast('تم التحديث.', 'success', 1500); }

  return {
    init, go, reload,
    openMaterialEditor, openSubjectEditor, openCategoryEditor, openTagEditor, openPlanEditor, openMeetEditor, openReviewEditor, openCouponEditor,
    viewOrder, viewReceipt, decideOrder,
    viewSeller, decideSeller, updateCommission, paySeller,
    viewSellerMaterial, decideSellerMaterial,
    viewSellerMeet, decideSellerMeet,
    viewUser, toggleUserStatus, extendSubscription,
    moderateReview, answerQa,
    deleteItem, addAttachmentRow,
    loadSettingsIntoForm, saveSettings,
    exportData, importData, resetAll,
    closeModal,
  };
})();
window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  ['theme_color','announcement_color'].forEach(f => {
    const c = document.getElementById(`set-${f}`); const t = document.getElementById(`set-${f}_text`);
    if (c && t) {
      c.addEventListener('input', () => t.value = c.value);
      t.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; });
    }
  });
});

// رسائل السيرفر التي تعني فعلاً "التوكن غير صالح/منتهي" — أي خطأ آخر
// (شبكة بطيئة، انقطاع مؤقت، خطأ 500 عابر...) لا يجب أن يطرد المستخدم.
function isSessionRejection(err) {
  const msg = (err && err.message) || '';
  return msg.includes('انتهت الجلسة') || msg.includes('ممنوع');
}

document.addEventListener('DOMContentLoaded', async () => {
  // التحقق من تسجيل الدخول أولاً
  if (!Site.isAdminLoggedIn()) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`login.html?next=${next}`);
    return;
  }
  // التحقق من صحة الجلسة عبر الخادم — مع محاولة ثانية قبل الطرد، لأن أول
  // طلب بعد الدخول قد يصادف بطء شبكة أو "cold start" عابر في السيرفر،
  // وهذا لا يعني أن الجلسة فعلاً غير صالحة.
  let sessionOk = false;
  let lastErr = null;
  for (let attempt = 0; attempt < 2 && !sessionOk; attempt++) {
    try {
      await Site.call('admin', { action: 'me' });
      sessionOk = true;
    } catch (e) {
      lastErr = e;
      // رفض صريح من السيرفر (توكن غير صالح فعلاً) → لا داعي لإعادة المحاولة
      if (isSessionRejection(e)) break;
      // خطأ عام (شبكة/سيرفر مؤقت) → انتظر لحظة وحاول مرة أخرى
      if (attempt === 0) await new Promise(r => setTimeout(r, 800));
    }
  }
  if (!sessionOk) {
    if (isSessionRejection(lastErr)) {
      // الجلسة غير صالحة فعلاً - مسح وإعادة توجيه
      Site.clearAdminToken();
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`login.html?next=${next}`);
      return;
    }
    // فشل عام متكرر (مثلاً لا اتصال بالإنترنت) — لا نمسح التوكن ولا نطرد؛
    // نعرض رسالة وزر إعادة محاولة بدل حذف الجلسة الصالحة بلا داعٍ.
    const gate = document.getElementById('authGate');
    if (gate) {
      gate.innerHTML = `
        <div style="color:var(--text-on-dark-dim);text-align:center;padding:0 20px;max-width:320px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:28px;color:var(--honey);margin-bottom:10px;"></i>
          <p style="margin:0 0 14px;">تعذّر الاتصال بالخادم للتحقق من الجلسة. تأكدي من الاتصال بالإنترنت.</p>
          <button class="btn btn-primary btn-sm" onclick="window.location.reload()"><i class="fa-solid fa-rotate"></i> إعادة المحاولة</button>
        </div>`;
    }
    return;
  }
  // إخفاء شاشة التحقق وإظهار المحتوى
  const gate = document.getElementById('authGate');
  const shell = document.getElementById('adminShell');
  if (gate) gate.remove();
  if (shell) shell.style.visibility = 'visible';
  App.init();
});
