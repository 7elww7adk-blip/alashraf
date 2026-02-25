/* ================================
   خصومات العروض (من عمود الشيت)
   - اكتب السعر بعد الخصم في عمود واحد (مثلاً: offer_price)
   - دعم أسماء أعمدة متعددة (عربي/إنجليزي) لتجنب الأعطال
   ================================ */

function normalizeDigits(str) {
  return (str || '').toString()
    .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[٫٬]/g, '.');
}

function toNumber(val) {
  const s = normalizeDigits(val).replace(/[^\d.]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function getDiscountAfterPrice(p) {
  const keys = [
    'offer_price','offerPrice',
    'discount_price','discountPrice',
    'after_discount','afterDiscount',
    'after_price','afterPrice',
    'price_after','priceAfter',
    'new_price','newPrice',
    'سعر بعد الخصم','بعد الخصم','سعر_بعد_الخصم','سعر بعد-الخصم'
  ];

  for (const k of keys) {
    if (p && Object.prototype.hasOwnProperty.call(p, k)) {
      const n = toNumber(p[k]);
      if (n > 0) return n;
    }
  }

  // fallback: لو العمود اسمه فيه كلمة "خصم" و قيمته رقم
  if (p) {
    for (const k of Object.keys(p)) {
      const kk = (k || '').toString();
      if (kk.includes('خصم') || kk.toLowerCase().includes('discount')) {
        const n = toNumber(p[k]);
        if (n > 0) return n;
      }
    }
  }
  return 0;
}

function getKiloVariant(variantsList) {
  if (!variantsList || !variantsList.length) return null;
  return variantsList.find(v => v.grams === 1000 || (v.label || '').includes('1 كيلو')) || null;
}

function isYes(val) {
  const s = (val ?? '').toString().trim().toLowerCase();
  return ['نعم', 'yes', 'true', '1', 'y', 'ok'].includes(s);
}

function isRamadanOffer(p) {
  if (!p || typeof p !== 'object') return false;
  return isYes(p.ramadan_offer || p.ramadanOffer || p['عرض رمضان'] || p['ramadan offer']);
}

function pickOfferVariant(variantsList) {
  if (!variantsList || !variantsList.length) return null;
  return getKiloVariant(variantsList) || variantsList[0];
}

function getOfferTarget(p) {
  const variantsList = parseVariants(p);
  if (variantsList?.length) {
    const chosenVariant = pickOfferVariant(variantsList);
    if (!chosenVariant || !(chosenVariant.price > 0)) return null;
    return { basePrice: chosenVariant.price, variantLabel: chosenVariant.label || '' };
  }

  const basePrice = toNumber(p?.price);
  if (!(basePrice > 0)) return null;
  return { basePrice, variantLabel: '' };
}


/* =========================================================
   ramadan.js - صفحة رمضان 🌙 (مُحدّث: Variants + أمان أعلى)
   - تحميل منتجات من Google Sheet
   - Variants (أوزان وسعر لكل وزن): "125 جم:40|250 جم:80"
   - بدون inline onclick/onkeyup (Event Delegation)
   - سلة مشتركة مع الرئيسية باستخدام localStorage
   ========================================================= */

const APPS_SCRIPT_URL = "https://alashrafsory.7elw-w-7adk.workers.dev/";
const WHATSAPP_NUMBER = '201097700404';
const DEFAULT_IMAGE   = 'image/default.jpg';

function fetchWithTimeout(url, ms = 12000, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const opts = { ...options, signal: ctrl.signal };
  return fetch(url, opts).finally(() => clearTimeout(t));
}

const CART_KEY        = 'alashraf_cart';
const CHECKOUT_DATA_KEY = 'alashraf_checkout_data_v1';

// لو فتحت الصفحة بـ ?nocache=1 هنمرره للـ Worker لتجربة فورية
function getApiUrl() {
  const api = new URL(APPS_SCRIPT_URL);
  const pageParams = new URLSearchParams(window.location.search);
  if (pageParams.get('nocache') === '1') api.searchParams.set('nocache', '1');
  return api.toString();
}

/* ================== Fast Load (Cache + No Loader on Reload) ==================
   - يعرض آخر بيانات رمضان محفوظة فوراً (بدون Loader) عند الـ Reload
   - يجلب نسخة جديدة بالخلفية ويحدّث الواجهة فقط لو الأسعار/البيانات تغيّرت
   ========================================================================== */
const RAMADAN_CACHE_KEY = 'alashraf_ramadan_products_cache_v1';
const RAMADAN_HASH_KEY  = 'alashraf_ramadan_products_hash_v1';

function _hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return String(h >>> 0);
}
function _normalizeDigits(s) {
  return (s ?? '').toString()
    .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[٫٬]/g, '.');
}
function _toNumber(v) {
  const s = _normalizeDigits(v).replace(/[^\d.]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function _computeDataHash(data) {
  // ✅ بصمة تشمل أي تغيير في الشيت (أي عمود/قيمة)
  // stringify ثابت (ترتيب مفاتيح موحّد) علشان مايحصلش اختلاف وهمي
  function stableStringify(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== "object") return JSON.stringify(value);

    if (Array.isArray(value)) {
      return "[" + value.map(stableStringify).join(",") + "]";
    }

    const keys = Object.keys(value).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }

  return _hashString(stableStringify(data || []));
}
function loadRamadanCache() {
  try {
    const raw = localStorage.getItem(RAMADAN_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch (_) { return null; }
}
function saveRamadanCache(data, hash) {
  try {
    localStorage.setItem(RAMADAN_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(RAMADAN_HASH_KEY, (hash && String(hash)) || _computeDataHash(data));
  } catch (_) {}
}
function getRamadanCacheHash() {
  try { return localStorage.getItem(RAMADAN_HASH_KEY) || ''; } catch (_) { return ''; }
}
function hideLoaderNow() {
  const loader = document.getElementById('page-loader');
  if (loader) loader.classList.add('loader-hidden');
  document.body.classList.remove('loading');
  document.documentElement.classList.remove('loading');
}


function loadCheckoutData() {
  try {
    return JSON.parse(localStorage.getItem(CHECKOUT_DATA_KEY) || '{}') || {};
  } catch (_) { return {}; }
}

function saveCheckoutData() {
  try {
    const data = {
      name: document.getElementById('c-name')?.value?.trim() || '',
      phone: document.getElementById('c-phone')?.value?.trim() || '',
      area: document.getElementById('c-area')?.value || '',
      branch: document.getElementById('c-branch')?.value || '',
      address: document.getElementById('c-address')?.value?.trim() || ''
    };
    localStorage.setItem(CHECKOUT_DATA_KEY, JSON.stringify(data));
  } catch (_) {}
}

function restoreCheckoutData() {
  const data = loadCheckoutData();
  const mapping = [
    ['c-name', data.name || ''],
    ['c-phone', data.phone || ''],
    ['c-area', data.area || ''],
    ['c-branch', data.branch || ''],
    ['c-address', data.address || '']
  ];

  mapping.forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
  });
}

// أقسام رمضان للبنرات
const RAMADAN_BANNERS = [
  {
    label: 'ياميش رمضان',
    img: 'image/ramadan-yameesh.jpg',
    desc: 'تشكيلة الياميش والمكسرات لرمضان بأعلى جودة.',
    targetId: 'yameesh-section'
  },
  {
    label: 'حلويات رمضان',
    img: 'image/ramadan-sweets.jpg',
    desc: 'قطايف، كنافة، بلح الشام وحلويات رمضانية طازجة.',
    targetId: 'sweets-section'
  }
];

// بيانات المنتجات
let ramadanYameesh  = [];
let ramadanSweets   = [];
let ramadanOffers   = [];
let allRamadanProds = [];
// ===== Guard: prevent empty-state during first load =====
let __productsFetchedOnce = false;
let __productsLoading = true;
let __pendingCategory = null;


// السلة
let cart = [];

/* ================== Helpers (أمان + Variants) ================== */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseVariants(p) {
  const raw = (p.variants || '').toString().trim();
  if (!raw) return null;

  const toGrams = {
    "ثمن": 125,
    "ربع": 250,
    "نصف": 500,
    "كيلو": 1000
  };

  const gramsToLabel = (g) => {
    if (g === 1000) return "1 كيلو";
    return `${g} جرام`;
  };

  const list = raw.split("|").map(part => {
    const [w, pr] = part.split(":").map(x => (x || "").trim());
    if (!w || !pr) return null;

    // نظف الكلمة (يشيل مسافات)
    const key = w.replace(/\s+/g, "");

    const grams = toGrams[key] || 0;

    // لو الكلمة مش معروفة، هنظهرها زي ما هي (Fallback)
    const label = grams ? gramsToLabel(grams) : w;

    return { label, price: Number(pr) || 0, grams };
  }).filter(Boolean);

  return list.length ? list : null;
}
// يختار افتراضيًا الوزن اللي سعره يساوي عمود price (لو موجود)
function pickDefaultVariant(variants, fallbackPrice) {
  if (!variants?.length) return null;
  const fp = Number(fallbackPrice);
  if (!Number.isNaN(fp)) {
    const match = variants.find(v => v.price === fp);
    if (match) return match;
  }
  return variants[0];
}

/* ================== تشغيل أول ما الصفحة تفتح ================== */

document.addEventListener('DOMContentLoaded', () => {
  loadCartFromStorage();
  renderRamadanBanners();
  setupRamadanSmoothScroll();
  bindGlobalHandlers();

  // ✅ لو في كاش: اعرض فوراً بدون Loader
  const cached = loadRamadanCache();
  const hasCache = !!(cached && cached.length);
  if (hasCache) {
    ramadanYameesh = cached.filter(p => (p.category || '').toString().trim() === 'ياميش رمضان');
    ramadanSweets  = cached.filter(p => (p.category || '').toString().trim() === 'حلويات رمضان');
    ramadanOffers  = cached.filter(p => isRamadanOffer(p) && getDiscountAfterPrice(p) > 0 && (getOfferTarget(p)?.basePrice || 0) >= getDiscountAfterPrice(p));
    allRamadanProds = [...ramadanYameesh, ...ramadanSweets];

      __productsLoading = false;
      __productsFetchedOnce = true;


        __productsLoading = false;
    __productsFetchedOnce = true;
const title = document.getElementById('ramadan-category-title');
    if (title) title.innerText = 'كل منتجات رمضان';

    renderRamadanOffers();
    renderAllRamadanProducts();
    hideLoaderNow();
  }

  // ✅ اجلب الداتا بالخلفية (لو مفيش كاش هيظهر اللودر طبيعي)
  fetchRamadanProducts({ silent: hasCache });

  restoreCheckoutData();

  // متابعة حقول الشحن لتعطيل/تفعيل زر الإرسال
  ['c-name', 'c-phone', 'c-area', 'c-branch', 'c-address'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = (id === 'c-area' || id === 'c-branch') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      saveCheckoutData();
      refreshCheckoutButtonState();
    });
  });

  refreshCheckoutButtonState();
});
/* ================== تحميل بيانات رمضان من الشيت ================== */

async function fetchRamadanProducts(opts = {}) {
  const silent = !!opts.silent;
  const loader = document.getElementById('page-loader');
  if (!silent && loader) loader.classList.remove('loader-hidden');

  try {
    const res  = await fetchWithTimeout(getApiUrl(), 12000, { cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await res.json() || [];
    const fresh = Array.isArray(data) ? data : [];

    const headerHash =
      res.headers.get('X-Data-Hash') ||
      (res.headers.get('ETag') || '').replace(/"/g, '');

    const newHash = headerHash || _computeDataHash(fresh);
    const oldHash = getRamadanCacheHash();

    if (!oldHash) {
      saveRamadanCache(fresh, newHash);
      ramadanYameesh = fresh.filter(p => (p.category || '').toString().trim() === 'ياميش رمضان');
      ramadanSweets  = fresh.filter(p => (p.category || '').toString().trim() === 'حلويات رمضان');
      ramadanOffers  = fresh.filter(p => isRamadanOffer(p) && getDiscountAfterPrice(p) > 0 && (getOfferTarget(p)?.basePrice || 0) >= getDiscountAfterPrice(p));
      allRamadanProds = [...ramadanYameesh, ...ramadanSweets];

      __productsLoading = false;
      __productsFetchedOnce = true;


      const title = document.getElementById('ramadan-category-title');
      if (title) title.innerText = 'كل منتجات رمضان';

      renderRamadanOffers();
      renderAllRamadanProducts();
      return;
    }

    if (newHash !== oldHash) {
      saveRamadanCache(fresh, newHash);
      ramadanYameesh = fresh.filter(p => (p.category || '').toString().trim() === 'ياميش رمضان');
      ramadanSweets  = fresh.filter(p => (p.category || '').toString().trim() === 'حلويات رمضان');
      ramadanOffers  = fresh.filter(p => isRamadanOffer(p) && getDiscountAfterPrice(p) > 0 && (getOfferTarget(p)?.basePrice || 0) >= getDiscountAfterPrice(p));
      allRamadanProds = [...ramadanYameesh, ...ramadanSweets];

      __productsLoading = false;
      __productsFetchedOnce = true;


      const title = document.getElementById('ramadan-category-title');
      if (title) title.innerText = 'كل منتجات رمضان';

      renderRamadanOffers();
      renderAllRamadanProducts();
    }
  } catch (err) {
    console.error(err);
    const list = document.getElementById('ramadan-product-list');
    if (list && !loadRamadanCache()) {
      list.innerHTML = '<p style="text-align:center; width:100%;">تعذر تحميل منتجات رمضان، حاول تاني لاحقاً.</p>';
    }
  } finally {
    if (loader) setTimeout(() => hideLoaderNow(), 200);
    else hideLoaderNow();
  }
}

/* ================== رسم البنرات (أقسام رمضان) ================== */

function renderRamadanBanners() {
  const grid = document.getElementById('ramadan-banners');
  if (!grid) return;

  grid.innerHTML = RAMADAN_BANNERS.map(cat => `
    <div class="ramadan-banner" data-scroll-to="${escapeHtml(cat.targetId)}">
      <img src="${escapeHtml(cat.img)}" alt="${escapeHtml(cat.label)}"
           onerror="this.src='${DEFAULT_IMAGE}'">
      <div class="ramadan-banner-overlay"></div>
      <div class="ramadan-banner-content">
        <h3>${escapeHtml(cat.label)}</h3>
        <p>${escapeHtml(cat.desc || '')}</p>
        <button type="button" class="ramadan-banner-btn">تسوق الآن</button>
      </div>
    </div>
  `).join('');
}

/* ================== عروض رمضان ================== */

function renderRamadanOffers() {
  const container = document.getElementById('ramadan-offers-list');
  if (!container) return;

  const offersHtml = (ramadanOffers || []).map(p => createRamadanOfferCard(p)).filter(Boolean).join('');

  if (!offersHtml) {
    container.innerHTML = '<p style="text-align:center; width:100%;">لا توجد عروض رمضان مضافة حالياً.</p>';
    return;
  }

  container.innerHTML = offersHtml;
}

/* ================== كل منتجات رمضان (ياميش + حلويات) ================== */

function renderAllRamadanProducts() {
  const container = document.getElementById('ramadan-product-list');
  if (!container) return;

  if (!allRamadanProds.length) {
    container.innerHTML = (__productsLoading && !__productsFetchedOnce)
      ? '<p style="text-align:center; width:100%;">جاري تحميل منتجات رمضان... ⏳</p>'
      : '<p style="text-align:center; width:100%;">لا توجد منتجات رمضان مضافة حتى الآن.</p>';
    return;
  }

  let html = '';

  if (ramadanYameesh.length) {
    html += `
      <h3 class="ramadan-subtitle">ياميش رمضان</h3>
      <div id="yameesh-section" class="classic-grid ramadan-sub-grid">
        ${ramadanYameesh.map(p => createRamadanProductCard(p)).join('')}
      </div>
    `;
  }

  if (ramadanSweets.length) {
    html += `
      <h3 class="ramadan-subtitle">حلويات رمضان</h3>
      <div id="sweets-section" class="classic-grid ramadan-sub-grid">
        ${ramadanSweets.map(p => createRamadanProductCard(p)).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
}

/* ================== كارت المنتج (Variants) ================== */

function createRamadanProductCard(p) {
  const nameRaw = (p.name || 'منتج').toString().trim();
  const imgRaw  = (p.image && p.image.trim() !== '') ? p.image : DEFAULT_IMAGE;

  const variants = parseVariants(p);
  const defV = pickDefaultVariant(variants, p.price);
  const defaultPrice = defV?.price ?? (Number(p.price) || 0);
  const defaultVariant = defV?.label ?? '';

  const variantsHtml = variants ? `
    <div class="variant-options" role="radiogroup" aria-label="اختيار الوزن">
      ${variants.map(v => `
        <button type="button"
          class="variant-btn ${v.label === defaultVariant ? 'active' : ''}"
          data-variant="${escapeHtml(v.label)}"
          data-price="${v.price}">
          ${escapeHtml(v.label)}
        </button>
      `).join('')}
    </div>
  ` : '';

  // نخزن البيانات في dataset (بدون onclick)
  return `
    <div class="product-card"
      data-name="${escapeHtml(nameRaw)}"
      data-img="${escapeHtml(imgRaw)}"
      data-price="${defaultPrice}"
      data-variant="${escapeHtml(defaultVariant)}">
      <div class="img-wrap">
        <img src="${escapeHtml(imgRaw)}" alt="${escapeHtml(defaultVariant ? `${nameRaw} - ${defaultVariant}` : nameRaw)}"
             onerror="this.src='${DEFAULT_IMAGE}'">
      </div>
      <div class="info">
        <h4>${escapeHtml(nameRaw)}</h4>
        ${variantsHtml}
        <span class="price js-price">${defaultPrice} ج.م</span>
        <button class="add-btn js-add-to-cart" type="button">أضف لسلة رمضان</button>
      </div>
    </div>
  `;
}

function createRamadanOfferCard(p) {
  const nameRaw = (p.name || 'منتج').toString().trim();
  const imgRaw  = (p.image && p.image.trim() !== '') ? p.image : DEFAULT_IMAGE;

  const newPrice = getDiscountAfterPrice(p);
  if (!newPrice) return '';

  const target = getOfferTarget(p);
  if (!target) return '';

  const oldPrice = target.basePrice;
  const offerVariantLabel = target.variantLabel;
  const offerVariantForCart = offerVariantLabel;

  if (!isRamadanOffer(p) || !(newPrice <= oldPrice)) return '';

  return `
    <div class="product-card offer-card"
      data-name="${escapeHtml(nameRaw)}"
      data-img="${escapeHtml(imgRaw)}"
      data-price="${newPrice}"
      data-variant="${escapeHtml(offerVariantForCart)}">
      <span class="offer-badge">عرض خاص</span>

      <div class="img-wrap">
        <img src="${escapeHtml(imgRaw)}"
             alt="${escapeHtml(offerVariantLabel ? `${nameRaw} - ${offerVariantLabel}` : nameRaw)}"
             onerror="this.src='${DEFAULT_IMAGE}'">
      </div>

      <div class="info">
        <h4>${escapeHtml(nameRaw)}</h4>

        ${offerVariantLabel ? `<div class="offer-variant-pill">عرض على: ${escapeHtml(offerVariantLabel)}</div>` : ''}

        <span class="price js-price">${newPrice} ج.م</span>
        <div class="old-price"><s>${oldPrice} ج.م</s></div>

        <button class="add-btn js-add-to-cart" type="button">أضف لسلة رمضان</button>
      </div>
    </div>
  `;
}


/* ================== البحث في منتجات رمضان ================== */

function filterRamadanProducts() {
  const input = document.getElementById('searchInput');
  const text  = (input?.value || '').trim().toLowerCase();

  const title = document.getElementById('ramadan-category-title');
  const container = document.getElementById('ramadan-product-list');
  if (!container) return;

  if (!text) {
    if (title) title.innerText = 'كل منتجات رمضان';
    renderAllRamadanProducts();
    return;
  }

  const filtered = allRamadanProds.filter(p =>
    (p.name || '').toString().toLowerCase().includes(text)
  );

  if (title) title.innerText = 'نتائج البحث في رمضان';

  if (!filtered.length) {
    container.innerHTML = '<p style="text-align:center; width:100%;">لا توجد نتائج لهذا البحث.</p>';
    return;
  }

  container.innerHTML = `
    <div class="classic-grid">
      ${filtered.map(p => createRamadanProductCard(p)).join('')}
    </div>
  `;
  scrollToSection('ramadan-products');
}

/* ================== سكرول سموث للروابط ================== */

function setupRamadanSmoothScroll() {
  const links = document.querySelectorAll('a[data-scroll]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('data-scroll');
      if (!targetId) return;
      e.preventDefault();
      scrollToSection(targetId);
    });
  });
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const header = document.querySelector('.store-header');
  const extraSpace = 8;
  const offset = header ? -(header.offsetHeight + extraSpace) : -80;

  const y = el.getBoundingClientRect().top + window.pageYOffset + offset;

  window.scrollTo({ top: y, behavior: 'smooth' });
}

/* ================== Handlers (بدون onclick) ================== */

let handlersBound = false;

function bindGlobalHandlers() {
  if (handlersBound) return;
  handlersBound = true;

  // البحث
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterRamadanProducts);
  }

  // كليك عام: فتح/غلق سلة + أزرار الهيرو + البنرات + Variants + إضافة للسلة + السلة نفسها
  document.addEventListener('click', (e) => {

    // فتح/غلق السلة
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const act = actionEl.getAttribute('data-action');
      if (act === 'toggle-cart') {
        toggleCart();
        return;
      }
      if (act === 'close-cart') {
        toggleCart(false);
        return;
      }
    }

    // أزرار الهيرو (scroll)
    const heroBtn = e.target.closest('[data-scroll-to]');
    if (heroBtn) {
      const id = heroBtn.getAttribute('data-scroll-to');
      if (id) scrollToSection(id);
      return;
    }


    // Roast (اختيار تحميص للقهوة) - مستقل عن الأوزان
    const rBtn = e.target.closest('.roast-btn');
    if (rBtn) {
      const card = rBtn.closest('.product-card');
      if (!card) return;

      card.querySelectorAll('.roast-btn').forEach(b => b.classList.remove('active'));
      rBtn.classList.add('active');

      const roast = rBtn.dataset.roast || '';
      card.dataset.roast = roast;
      return;
    }

    // Variants (اختيار وزن)
    const vBtn = e.target.closest('.variant-btn');
    if (vBtn) {
      const card = vBtn.closest('.product-card');
      if (!card) return;

      card.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active'));
      vBtn.classList.add('active');

      const price = Number(vBtn.dataset.price) || 0;
      const variant = vBtn.dataset.variant || '';

      card.dataset.price = String(price);
      card.dataset.variant = variant;

      const priceEl = card.querySelector('.js-price');
      if (priceEl) priceEl.textContent = `${price} ج.م`;
      return;
    }

    // إضافة للسلة
    const addBtn = e.target.closest('.js-add-to-cart');
    if (addBtn) {
      const card = addBtn.closest('.product-card');
      if (!card) return;

      const name = card.dataset.name || 'منتج';
      const img = card.dataset.img || DEFAULT_IMAGE;
      const price = Number(card.dataset.price) || 0;
      const variant = card.dataset.variant || '';

      addToCart(name, price, img, variant);
      return;
    }

    // أزرار السلة (+/-/حذف)
    const cartBtn = e.target.closest('[data-cart-action]');
    if (cartBtn) {
      const act = cartBtn.getAttribute('data-cart-action');
      const idx = Number(cartBtn.getAttribute('data-index'));
      if (Number.isNaN(idx)) return;

      if (act === 'inc') updateQty(idx, 1);
      if (act === 'dec') updateQty(idx, -1);
      if (act === 'remove') removeFromCart(idx);
      return;
    }

    // زر إرسال واتساب (لو مفيش onclick inline علشان مايفتحش مرتين)
    const checkoutBtn = e.target && e.target.closest ? e.target.closest('#checkoutBtn, .checkout-btn') : null;
    if (checkoutBtn && !checkoutBtn.hasAttribute('onclick')) {
      checkoutWhatsApp();
      return;
    }
  });

  // زر السلة العائم (إظهار بعد سكرول)
  window.addEventListener('scroll', () => {
    const floatBtn = document.getElementById('floatingCart');
    if (!floatBtn) return;
    if (window.scrollY > 150) floatBtn.classList.add('show');
    else floatBtn.classList.remove('show');
  });
}

/* ================== سلة رمضان ================== */

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) cart = [];
    else {
      const parsed = JSON.parse(raw);
      cart = Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading cart from storage', e);
    cart = [];
  }
  updateCartUI();
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    console.error('Error saving cart to storage', e);
  }
}

// إضافة منتج للسلة (مهم: يدمج حسب name + variant)
function addToCart(name, price, imageUrl, variant = '') {
  const v = (variant || '').toString().trim();
  const existing = cart.find(i => i.name === name && ((i.variant || '') === v));

  if (existing) { existing.quantity++; const np = Number(price) || 0; if (np && existing.price !== np) existing.price = np; }
  else {
    cart.push({
      name,
      variant: v,
      price: Number(price) || 0,
      quantity: 1,
      image: imageUrl || DEFAULT_IMAGE
    });
  }

  saveCartToStorage();
  updateCartUI();
  showToast();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCartToStorage();
  updateCartUI();
}

function updateQty(index, change) {
  if (!cart[index]) return;
  const next = cart[index].quantity + change;
  if (next <= 0) removeFromCart(index);
  else {
    cart[index].quantity = next;
    saveCartToStorage();
    updateCartUI();
  }
}

function buildCartItemHTML(item, index) {
  const lineTotal = item.price * item.quantity;
  const img = item.image || DEFAULT_IMAGE;

  const title = item.variant ? `${item.name} (${item.variant})` : item.name;

  return `
    <div class="cart-item">
      <div class="cart-item-main">
        <div class="cart-item-thumb">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}"
               onerror="this.src='${DEFAULT_IMAGE}'">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-title">${escapeHtml(title)}</div>
          <div class="cart-item-sub">سعر القطعة: ${item.price} ج.م</div>
          <div class="cart-item-row">
            <div class="cart-qty-controls">
              <button class="qty-btn" type="button" data-cart-action="dec" data-index="${index}">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn" type="button" data-cart-action="inc" data-index="${index}">+</button>
            </div>
            <div class="cart-line-total">${lineTotal} ج.م</div>
          </div>
          <div class="cart-item-note">تمت الإضافة لعربة رمضان بنجاح ✅</div>
        </div>
      </div>
      <button class="cart-item-remove" type="button" data-cart-action="remove" data-index="${index}">
        حذف
      </button>
    </div>
  `;
}

function updateCartUI() {
  const itemsDiv  = document.getElementById('cartItems');
  const totalSpan = document.getElementById('cartTotal');
  const headerCount = document.getElementById('cart-count');
  const floatCount  = document.getElementById('float-count');

  if (!itemsDiv) return;

  if (!cart || cart.length === 0) {
    itemsDiv.innerHTML = `
      <div class="cart-empty">
        السلة فاضية حاليًا 🤍
        <div class="cart-empty-sub">ابدأ بإضافة منتجات رمضان من الصفحة.</div>
      </div>
    `;
    if (totalSpan) totalSpan.innerText = '0';
    if (headerCount) headerCount.innerText = '0';
    if (floatCount) floatCount.innerText = '0';
    refreshCheckoutButtonState();
    return;
  }

  let total = 0;
  let count = 0;

  itemsDiv.innerHTML = cart.map((item, index) => {
    total += item.price * item.quantity;
    count += item.quantity;
    return buildCartItemHTML(item, index);
  }).join('');

  if (totalSpan) totalSpan.innerText = String(total);
  if (headerCount) headerCount.innerText = String(count);
  if (floatCount) floatCount.innerText = String(count);

  refreshCheckoutButtonState();
}

function toggleCart(forceOpen) {
  const sidebar  = document.getElementById('cartSidebar');
  const backdrop = document.getElementById('cartBackdrop');
  if (!sidebar) return;

  let shouldOpen;
  if (forceOpen === true) shouldOpen = true;
  else if (forceOpen === false) shouldOpen = false;
  else shouldOpen = !sidebar.classList.contains('open');

  sidebar.classList.toggle('open', shouldOpen);
  if (backdrop) backdrop.classList.toggle('active', shouldOpen);

  document.body.classList.toggle('cart-open', shouldOpen);
  document.documentElement.classList.toggle('cart-open', shouldOpen);

  if (shouldOpen) restoreCheckoutData();
}

function showToast() {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 2000);
}

/* ================== زر الإرسال (تفعيل/تعطيل) ================== */

function refreshCheckoutButtonState() {
  const btn = document.getElementById('checkoutBtn') || document.querySelector('.checkout-btn');
  if (!btn) return;

  const name = document.getElementById('c-name')?.value?.trim() || '';
  const phone = document.getElementById('c-phone')?.value?.trim() || '';
  const area = document.getElementById('c-area')?.value || '';
  const branch = document.getElementById('c-branch')?.value || '';

  const ok = (cart && cart.length > 0 && name && phone && area && branch);

  // ✅ مطلوب: الزر يفضل شغال (مش disabled)
  btn.classList.toggle('btn-disabled', !ok);
  btn.disabled = false;
}

/* ================== إرسال واتساب ================== */

async function checkoutWhatsApp() {
  if (!cart || cart.length === 0) {
    alert('السلة فارغة!');
    return;
  }

  const nameInput = document.getElementById('c-name');
  const phoneInput = document.getElementById('c-phone');
  const areaSelect = document.getElementById('c-area');
  const branchSelect = document.getElementById('c-branch');
  const addressInput = document.getElementById('c-address');

  const name = nameInput ? nameInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const area = areaSelect ? areaSelect.value : '';
  const branch = branchSelect ? branchSelect.value : '';
  const address = addressInput ? addressInput.value.trim() : '';

  const missing = [];
  if (!name)   missing.push({ label: 'الاسم', el: nameInput });
  if (!phone)  missing.push({ label: 'الموبايل', el: phoneInput });
  if (!area)   missing.push({ label: 'المنطقة', el: areaSelect });
  if (!branch) missing.push({ label: 'اختار الفرع الاقرب ليك', el: branchSelect });

  if (missing.length) {
    const msg = 'استكمل البيانات\n' + missing.map(m => `- ${m.label}`).join('\n');
    alert(msg);

    const first = missing[0].el;
    if (first) {
      first.focus?.();
      first.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  if (!window.AlAshrafOrders) {
    alert('ميزة الطلبات غير متاحة (orders.js غير موجود)');
    return;
  }

  saveCheckoutData();

  await window.AlAshrafOrders.createOrderFromCheckout({
    cart,
    customer: { name, phone, area, branch, address },
    whatsappNumber: WHATSAPP_NUMBER,
    sourcePage: "ramadan"
  });
}
// ====== ضمان ربط زر الإرسال في الرئيسية + إتاحة الدوال لـ inline onclick ======
try {
  window.checkoutWhatsApp = checkoutWhatsApp;
  window.refreshCheckoutButtonState = refreshCheckoutButtonState;
} catch (e) {}


// (Removed) duplicate .checkout-btn binding to prevent double checkout. Event delegation handles it.;