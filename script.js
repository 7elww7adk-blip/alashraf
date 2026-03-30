/* =========================================================
   script.js - Main (Updated)
   ✅ Variants (ثمن/ربع/نصف/كيلو) + عرضها كـ 125/250/500/1 كيلو
   ✅ دمج السلة حسب (الاسم + الوزن) بدل الاسم فقط
   ✅ إزالة inline onclick من: كروت المنتجات + السلة + الفلاتر (أمان أعلى)
   ========================================================= */

// 1. الإعدادات والروابط
const APPS_SCRIPT_URL = "https://alashrafsory.7elw-w-7adk.workers.dev/";
const WHATSAPP_NUMBER = '201097700404'; // رقم الأشراف
const DEFAULT_IMAGE = 'image/default.jpg';
const CART_KEY = 'alashraf_cart';
const CHECKOUT_DATA_KEY = 'alashraf_checkout_data_v1';

// لو فتحت الصفحة بـ ?nocache=1 هنمرره للـ Worker لتجربة فورية
function getApiUrl() {
  const api = new URL(APPS_SCRIPT_URL);
  const pageParams = new URLSearchParams(window.location.search);
  if (pageParams.get('nocache') === '1') api.searchParams.set('nocache', '1');
  return api.toString();
}

/* ================== Fast Load (Cache + No Loader on Reload) ==================
   - يعرض آخر بيانات محفوظة فوراً (بدون Loader) عند الـ Reload
   - يجلب نسخة جديدة بالخلفية ويحدّث الواجهة فقط لو الأسعار/البيانات تغيّرت
   ========================================================================== */
const MAIN_CACHE_KEY = 'alashraf_main_products_cache_v1';
const MAIN_HASH_KEY  = 'alashraf_main_products_hash_v1';

function fetchWithTimeout(url, ms = 12000, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const opts = { ...options, signal: ctrl.signal };
  return fetch(url, opts).finally(() => clearTimeout(t));
}

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
function loadMainCache() {
  try {
    const raw = localStorage.getItem(MAIN_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch (_) { return null; }
}
function saveMainCache(data, hash) {
  try {
    localStorage.setItem(MAIN_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(MAIN_HASH_KEY, (hash && String(hash)) || _computeDataHash(data));
  } catch (_) {}
}
function getMainCacheHash() {
  try { return localStorage.getItem(MAIN_HASH_KEY) || ''; } catch (_) { return ''; }
}
function hideLoaderNow() {
  const loader = document.getElementById('page-loader');
  if (loader) loader.classList.add('loader-hidden');
  document.body.classList.remove('loading');
  document.documentElement.classList.remove('loading');
}


// 2. قائمة صور الأقسام
const CATEGORIES_LIST = [
{ name: 'ركن الحلويات الشرقية', img: 'image/sweets.jpg' },
  { name: 'ركن القهوة', img: 'image/coffee.jpg' },
  { name: 'ركن المجمدات والجبن السوري', img: 'https://i.postimg.cc/3xvnbZPT/unnamed.jpg' },
  { name: 'ركن المحمصة والتسالي', img: 'image/nuts.jpg' },
  { name: 'ركن الأيس كريم', img: 'https://i.postimg.cc/52CnkmZ1/unnamed_(1).jpg' },
  { name: 'ركن المشاريب', img: 'https://i.postimg.cc/2yW7XkKH/unnamed-(2).jpg' },
  { name: 'ركن المواد الغذائية',img: 'https://i.postimg.cc/J76kLvkt/Gemini-Generated-Image-y9ezkey9ezkey9ez.png' },
];

// =========================================================
// 3. إعدادات الفلاتر الذكية 🧠
// =========================================================
const TAGS_CONFIG = {
  'ركن الحلويات الشرقية': ['بسبوسة', 'كنافة', 'جلاش', 'بقلاوة', 'أساور', 'عش', 'رموش', 'مدلعة', 'شرقي', 'سادة', 'مكسرات'],
  'ركن القهوة': ['فاتح', 'وسط', 'غامق', 'محوج', 'سادة', 'اسبريسو', 'توفي', 'فرنساوي', 'بندق', 'شيكولاتة'],
  'ركن المحمصة والتسالي': ['كاجو', 'فستق', 'لوز', 'عين جمل', 'لب', 'سوداني', 'مشكل', 'مقرمشات', 'ذرة'],
  'ركن المجمدات والجبن السوري': ['موزاريلا', 'مشلل', 'حلوم', 'شيدر', 'رومي', 'سمبوسك', 'كبيبة', 'برك', 'ستريس'],
  'ركن الأيس كريم': ['فانيليا', 'شوكولاتة', 'مانجو', 'فراولة', 'لوتس', 'أوريو', 'وافل', 'رول', 'بولة', 'كونو', 'ستيك', 'صوص', 'نوتيلا', 'مكسرات', 'فستق', 'عائلي', 'بوكس'],
  'ركن المشاريب': ['عصير', 'مانجو', 'فراولة', 'قصب', 'برتقال', 'جوافة', 'ليمون', 'سموذي', 'ميلك شيك', 'موهيتو', 'صودا', 'ساخن', 'بارد', 'سحلب', 'كاكاو', 'تمر', 'سوبيا', 'كركديه'],
  'ركن المواد الغذائية': ['مكرونة','أرز','سكر','زيت','سمن','بهارات','عدس','فول','تونة','صلصة','دقيق','شاي','قهوة','نيدو','كاتشب']
};

// 4. المتغيرات العامة
let allProducts = [];
let cart = [];
let currentCategoryProducts = [];
// ===== Guard: prevent empty-state during first load =====
let __productsFetchedOnce = false;
let __productsLoading = true;
let __pendingCategory = null;
let __checkoutSubmitting = false;
let __lastCheckoutValidationToastAt = 0;
let __checkoutAttemptedSubmit = false;
let __cartCheckoutStep = 1;
const ADD_TO_CART_TOAST_MESSAGE = 'تمت الإضافة للسلة ✅';
 // لتخزين منتجات القسم الحالي للفلترة

// ================== Helpers ==================

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// يدعم 2 صيغ في الشيت:
// 1) "ثمن:40|ربع:80|نصف:150|كيلو:280"
// 2) "125 جم:40|250 جم:80|500 جم:150|1000 جم:280"
function parseVariants(p) {
  const raw = (p.variants || '').toString().trim();
  if (!raw) return null;

  const wordToGrams = { 'ثمن': 125, 'ربع': 250, 'نصف': 500, 'كيلو': 1000 };
  const gramsToLabel = (g) => (g === 1000 ? '1 كيلو' : `${g} جرام`);

  const list = raw.split('|').map(part => {
    const [w, pr] = part.split(':').map(x => (x || '').trim());
    if (!w || !pr) return null;

    const key = w.replace(/\s+/g, '');
    let grams = wordToGrams[key] || 0;

    if (!grams) {
      const digits = key.replace(/[^\d]/g, '');
      grams = digits ? Number(digits) : 0;
    }

    const label = grams ? gramsToLabel(grams) : w; // fallback لو حاجة مختلفة
    return { label, price: Number(pr) || 0, grams };
  }).filter(Boolean);

  return list.length ? list : null;
}

function pickDefaultVariant(variants, fallbackPrice) {
  if (!variants?.length) return null;
  const fp = Number(fallbackPrice);
  if (!Number.isNaN(fp)) {
    const match = variants.find(v => v.price === fp);
    if (match) return match;
  }
  return variants[0];
}

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

function isDailyOffer(p) {
  if (!p || typeof p !== 'object') return false;
  return isYes(p.daily_offer || p.dailyOffer || p['عرض اليوم'] || p['daily offer']);
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

function loadCheckoutData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKOUT_DATA_KEY) || '{}');
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
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

// =========================================================
// 5. التشغيل والتحميل (Init & Loader)
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  loadCartFromStorage();
  renderCategoriesGrid();

  // ✅ لو في كاش: اعرض فوراً بدون Loader (حتى لو عمل Reload)
  const cached = loadMainCache();
  const hasCache = !!(cached && cached.length);
  if (hasCache) {
    allProducts = cached;
    __productsLoading = false;
    __productsFetchedOnce = true;
renderBestSellers();
    renderDailyOffers();
    restoreUserSession();
    hideLoaderNow();
  }

  // ✅ اجلب الداتا بالخلفية (ولو مفيش كاش هيفضل اللودر لحد ما يخلص)
  fetchProducts({ silent: hasCache });

  // إدخالات الشحن
  restoreCheckoutData();

  ['c-name', 'c-phone', 'c-area', 'c-branch', 'c-address'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = (id === 'c-area' || id === 'c-branch') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      saveCheckoutData();
      refreshCheckoutButtonState();
    });
  });

  bindCheckoutAttemptToast();
  setCartCheckoutStep(1);

  refreshCheckoutButtonState();
});
// كليك عام (بديل onclick)
let handlersBound = false;
document.addEventListener('click', (e) => {
  if (!handlersBound) handlersBound = true;

  // Actions من HTML
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const act = actionEl.getAttribute('data-action');

    // منع التنقل الافتراضي في روابط #
    if (actionEl.tagName === 'A' && actionEl.getAttribute('href') === '#') {
      e.preventDefault();
    }

    if (act === 'show-categories') {
      const target = actionEl.getAttribute('data-target') || 'top';
      showCategories(target);
      return;
    }
    if (act === 'open-category') {
      const cat = actionEl.getAttribute('data-category');
      if (cat) openCategory(cat);
      return;
    }
    if (act === 'toggle-cart') {
      const force = actionEl.getAttribute('data-force'); // "open" / "close" / null
      if (force === 'open') toggleCart(true);
      else if (force === 'close') toggleCart(false);
      else toggleCart();
      return;
    }
    if (act === 'checkout') {
      checkoutWhatsApp();
      return;
    }
    if (act === 'go-checkout-step') {
      setCartCheckoutStep(2);
      return;
    }
    if (act === 'back-review-step') {
      setCartCheckoutStep(1);
      return;
    }
    if (act === 'apply-sub-filter') {
      const tag = actionEl.getAttribute('data-tag') || 'all';
      applySubFilter(tag, actionEl);
      return;
    }
  }

  // Variants (اختيار وزن) — ✅ لا تلمس أزرار التحميص
  const vBtn = e.target.closest('.variant-options .variant-btn');
  if (vBtn) {
    const card = vBtn.closest('.product-card');
    if (!card) return;

    // فعّل الوزن فقط بدون ما يطفي التحميص
    card.querySelectorAll('.variant-options .variant-btn').forEach(b => b.classList.remove('active'));
    vBtn.classList.add('active');

    const price = Number(vBtn.dataset.price) || 0;
    const variant = vBtn.dataset.variant || '';

    card.dataset.price = String(price);
    card.dataset.variant = variant;

    const priceEl = card.querySelector('.js-price');
    if (priceEl) priceEl.textContent = `${price} ج.م`;
    return;
  }

  // Roast (اختيار تحميص للقهوة) — ✅ مستقل عن الوزن
  const rBtn = e.target.closest('.roast-options .roast-btn');
  if (rBtn) {
    const card = rBtn.closest('.product-card');
    if (!card) return;

    card.querySelectorAll('.roast-options .roast-btn').forEach(b => b.classList.remove('active'));
    rBtn.classList.add('active');

    const roast = rBtn.dataset.roast || '';
    card.dataset.roast = roast;
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
    const roast = card.dataset.roast || '';
    const variantFull = roast ? (variant ? `${variant} - ${roast}` : roast) : variant;

    addToCart(name, price, img, variantFull);
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
});

async function fetchProducts(opts = {}) {
  const silent = !!opts.silent;
  const loader = document.getElementById('page-loader');
  if (!silent && loader) loader.classList.remove('loader-hidden');

  try {
    const response = await fetchWithTimeout(getApiUrl(), 12000, { cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await response.json();
    const fresh = Array.isArray(data) ? data : [];

    const headerHash =
      response.headers.get('X-Data-Hash') ||
      (response.headers.get('ETag') || '').replace(/"/g, '');

    const newHash = headerHash || _computeDataHash(fresh);
    const oldHash = getMainCacheHash();

    // أول مرة: احفظ واعرض
    if (!oldHash) {
      allProducts = fresh;

      __productsLoading = false;
      __productsFetchedOnce = true;
      if (__pendingCategory) { const c = __pendingCategory; __pendingCategory = null; try { openCategory(c, true); } catch(e) {} }
      saveMainCache(fresh, newHash);
      renderBestSellers();
      renderDailyOffers();
      restoreUserSession();
      return;
    }

    // لو اتغيرت الأسعار/البيانات: حدّث
    if (newHash !== oldHash) {
      allProducts = fresh;

      __productsLoading = false;
      __productsFetchedOnce = true;
      if (__pendingCategory) { const c = __pendingCategory; __pendingCategory = null; try { openCategory(c, true); } catch(e) {} }
      saveMainCache(fresh, newHash);

      renderBestSellers();
      renderDailyOffers();

      const productsArea = document.getElementById('products-area');
      const isProductsView = productsArea && productsArea.style.display !== 'none';
      const titleEl = document.getElementById('current-category-title');

      const searchInput = document.getElementById('searchInput');
      const searching = !!(searchInput && searchInput.value && searchInput.value.trim());

      if (searching) {
        filterProducts();
      } else if (isProductsView && titleEl && titleEl.innerText) {
        openCategory(titleEl.innerText, true);
      }
    }
  } catch (error) {
    console.error('Error fetching data:', error);

    if (!loadMainCache()) {
      const list = document.getElementById('product-list');
      if (list) {
        list.innerHTML = '<p style="text-align:center; width:100%;">تعذر تحميل المنتجات، تأكد من الاتصال بالإنترنت وحاول مرة أخرى.</p>';
      }
    }
  } finally {
    if (loader) setTimeout(() => hideLoaderNow(), 200);
    else hideLoaderNow();
  }
}

// =========================================================
// 6. دوال العرض والمنتجات
// =========================================================

function renderCategoriesGrid() {
  const grid = document.getElementById('categories-list');
  if (!grid) return;
  grid.innerHTML = CATEGORIES_LIST.map(cat => `
    <div class="cat-card" data-action="open-category" data-category="${escapeHtml(cat.name)}" role="button" tabindex="0">
      <div class="cat-circle">
        <img src="${escapeHtml(cat.img)}" alt="${escapeHtml(cat.name)}" onerror="this.src='${DEFAULT_IMAGE}'">
      </div>
      <h3 class="cat-title">${escapeHtml(cat.name.replace('ركن ', ''))}</h3>
    </div>`).join('');
}

function renderBestSellers() {
  const list = document.getElementById('best-sellers-list');
  if (!list) return;
  const bestProducts = allProducts.filter(p => (p.best_seller || '').toString().trim() === 'نعم');

  if (bestProducts.length > 0) {
    list.innerHTML = bestProducts.map(p => createProductCard(p)).join('');
  } else {
    list.innerHTML = '<p style="text-align:center; width:100%; opacity:0.7;">جاري تجهيز العروض المميزة... ✨</p>';
  }
}

function renderDailyOffers() {
  const list = document.getElementById('daily-offers-list');
  if (!list) return;

  const offers = (allProducts || []).filter(p => {
    if (!isDailyOffer(p)) return false;

    const after = getDiscountAfterPrice(p);
    const target = getOfferTarget(p);
    if (!target) return false;

    return after > 0 && target.basePrice >= after;
  });

  if (!offers.length) {
    list.innerHTML = '<p style="text-align:center; width:100%;">لا توجد عروض اليوم حالياً</p>';
    return;
  }

  list.innerHTML = offers.map(p => createDailyOfferCard(p)).filter(Boolean).join('');
}

function createDailyOfferCard(p) {
  const nameRaw = (p.name || 'منتج').toString().trim();
  const imgRaw  = (p.image && p.image.trim() !== '') ? p.image : DEFAULT_IMAGE;

  const newPrice = getDiscountAfterPrice(p);
  if (!newPrice) return '';

  const target = getOfferTarget(p);
  if (!target) return '';

  const oldPrice = target.basePrice;
  const offerVariantLabel = target.variantLabel;
  const offerVariantForCart = offerVariantLabel;

  if (!(newPrice <= oldPrice) || !isDailyOffer(p)) return '';

  return `
    <div class="product-card offer-card"
      data-name="${escapeHtml(nameRaw)}"
      data-img="${escapeHtml(imgRaw)}"
      data-price="${newPrice}"
      data-variant="${escapeHtml(offerVariantForCart)}">
      <span class="offer-badge">عرض اليوم</span>

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

        <button class="add-btn js-add-to-cart" type="button">أضف للسلة</button>
      </div>
    </div>
  `;
}

function createProductCard(p) {
  const nameRaw = (p.name || 'منتج').toString().trim();
  const imgRaw = (p.image && p.image.trim() !== '') ? p.image : DEFAULT_IMAGE;

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

  const isCoffee = ((p.category || '').toString().includes('قهوة') || (p.category || '').toString().includes('ركن القهوة'));
  const ROAST_OPTIONS = ['فاتح', 'وسط', 'غامق'];
  const defaultRoast = 'وسط';
  const roastHtml = isCoffee ? `
    <div class="roast-options" role="radiogroup" aria-label="اختيار التحميص">
      ${ROAST_OPTIONS.map(r => `
        <button type="button"
          class="roast-btn variant-btn ${r === defaultRoast ? 'active' : ''}"
          data-roast="${escapeHtml(r)}">
          ${escapeHtml(r)}
        </button>
      `).join('')}
    </div>
  ` : '';


  return `
    <div class="product-card"
      data-name="${escapeHtml(nameRaw)}"
      data-img="${escapeHtml(imgRaw)}"
      data-price="${defaultPrice}"
      data-variant="${escapeHtml(defaultVariant)}"
      data-roast="${escapeHtml(isCoffee ? defaultRoast : '')}">
      <div class="img-wrap">
        <img src="${escapeHtml(imgRaw)}" alt="${escapeHtml(defaultVariant ? `${nameRaw} - ${defaultVariant}` : nameRaw)}"
             onerror="this.src='${DEFAULT_IMAGE}'">
      </div>
      <div class="info">
        <h4>${escapeHtml(nameRaw)}</h4>
        ${variantsHtml}
        ${roastHtml}
        <span class="price js-price">${defaultPrice} ج.م</span>
        <button class="add-btn js-add-to-cart" type="button">أضف للسلة</button>
      </div>
    </div>`;
}

// =========================================================
// 7. دوال فتح الأقسام والفلاتر الذكية 🔥
// =========================================================

function openCategory(catName, isRestore = false) {
  const productsArea = document.getElementById('products-area');
  const productList = document.getElementById('product-list');
  const title = document.getElementById('current-category-title');

  const getFilteredProducts = () => {
    const productCatMatches = (p) => {
      const productCat = (p.category || '').trim();
      if (catName === 'ركن الأيس كريم')
        return productCat.includes('أيس') || productCat.includes('وافل') || productCat === catName;
      if (catName === 'ركن المشاريب')
        return productCat.includes('مشاريب') || productCat.includes('عصير') || productCat === catName;
      return productCat === catName;
    };
    return allProducts.filter(productCatMatches);
  };

  const filtered = getFilteredProducts();
  currentCategoryProducts = filtered;

  const render = () => {
    title.innerText = catName;
    productList.innerHTML = filtered.length
      ? filtered.map(p => createProductCard(p)).join('')
      : (__productsLoading && !__productsFetchedOnce)
          ? '<p style="text-align:center;">جاري تحميل المنتجات... ⏳</p>'
          : '<p style="text-align:center;">لا توجد منتجات حالياً</p>';
    renderSmartFilters(catName, filtered);
  };

  if (isRestore) {
    document.querySelectorAll('#main-hero, #categories-area, #best-sellers, #daily-offers')
      .forEach(el => el.style.display = 'none');
    productsArea.style.display = 'block';
    productsArea.classList.remove('hidden-state');
    render();
    return;
  }

  if (productsArea.style.display !== 'none') {
    productList.classList.add('fade-out-grid');
    setTimeout(() => {
      render();
      scrollToProductsHeader('smooth');
      productList.classList.remove('fade-out-grid');
    }, 300);
  } else {
    const itemsToHide = '#main-hero, #categories-area, #best-sellers, #daily-offers';
    smoothSwitch(itemsToHide, '#products-area', () => {
      render();
      scrollToProductsHeader('smooth');
    });
  }
}

function renderSmartFilters(catName, products) {
  const container = document.getElementById('smart-filters');
  if (!container) return;

  container.innerHTML = '';

  const keywords = TAGS_CONFIG[catName];
  if (!keywords || keywords.length === 0) return;

  const activeTags = keywords.filter(tag =>
    products.some(p => (p.name || '').includes(tag))
  );

  if (activeTags.length === 0) return;

  let html = `<div class="filter-chip active" data-action="apply-sub-filter" data-tag="all">الكل</div>`;
  activeTags.forEach(tag => {
    html += `<div class="filter-chip" data-action="apply-sub-filter" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</div>`;
  });

  container.innerHTML = html;
}

function applySubFilter(tag, btnElement) {
  const allChips = document.querySelectorAll('.filter-chip');
  allChips.forEach(c => c.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  const list = document.getElementById('product-list');
  list.style.opacity = '0';
  list.style.transform = 'translateY(10px)';

  setTimeout(() => {
    let result = [];
    if (tag === 'all') {
      result = currentCategoryProducts;
    } else {
      result = currentCategoryProducts.filter(p => (p.name || '').includes(tag));
    }
    list.innerHTML = result.length
      ? result.map(p => createProductCard(p)).join('')
      : '<p style="text-align:center;">لا توجد نتائج</p>';
    list.style.opacity = '1';
    list.style.transform = 'translateY(0)';
  }, 300);
}

function getStickyHeaderOffset(extra = 12) {
  const header = document.querySelector('.store-header');
  const h = header ? header.offsetHeight : 0;
  return h + extra;
}

function scrollToProductsHeader(behavior = 'smooth') {
  const anchor =
    document.getElementById('products-header-anchor') ||
    document.querySelector('#products-area .section-header') ||
    document.getElementById('products-area');
  if (!anchor) return;

  const y = anchor.getBoundingClientRect().top + window.pageYOffset - getStickyHeaderOffset();
  window.scrollTo({ top: Math.max(0, y), behavior });
}

// =========================================================
// 8. دوال التنقل والاسترجاع (Navigation & Session)
// =========================================================

function smoothSwitch(hideSelectors, showSelector, callback) {
  const toHide = document.querySelectorAll(hideSelectors);
  toHide.forEach(el => {
    if (el && el.style.display !== 'none') {
      el.classList.add('smooth-section', 'hidden-state');
    }
  });

  setTimeout(() => {
    toHide.forEach(el => { if (el) el.style.display = 'none'; });
    const toShow = document.querySelector(showSelector);
    if (toShow) {
      toShow.style.display = 'block';
      toShow.classList.add('smooth-section', 'hidden-state');
      requestAnimationFrame(() => { toShow.classList.remove('hidden-state'); });
    }
    if (callback) callback();
  }, 300);
}

function showCategories(target = 'top') {
  const itemsToHide = document.querySelectorAll('#products-area');
  itemsToHide.forEach(el => { el.classList.add('smooth-section', 'hidden-state'); });

  setTimeout(() => {
    itemsToHide.forEach(el => el.style.display = 'none');
    ['#main-hero', '#best-sellers', '#daily-offers', '#categories-area'].forEach(id => {
      const el = document.querySelector(id);
      if (el) {
        el.style.display = (id === '#main-hero') ? 'flex' : 'block';
        el.classList.add('smooth-section', 'hidden-state');
        requestAnimationFrame(() => el.classList.remove('hidden-state'));
      }
    });

    if (target === 'cats') {
      const catSection = document.getElementById('categories-area');
      if (catSection) {
        const yOffset = -80;
        const y = catSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 300);
}

window.addEventListener('beforeunload', () => {
  const productsArea = document.getElementById('products-area');
  const isProductsView = productsArea && productsArea.style.display !== 'none';
  const currentScroll = window.scrollY;
  const titleEl = document.getElementById('current-category-title');
  const sessionData = {
    isProductsView: isProductsView,
    scroll: currentScroll,
    categoryName: isProductsView && titleEl ? titleEl.innerText : null
  };
  sessionStorage.setItem('userSession', JSON.stringify(sessionData));
});

function restoreUserSession() {
  try {
    const savedData = sessionStorage.getItem('userSession');
    if (!savedData) return;

    const session = JSON.parse(savedData);
    const scroll = Number(session?.scroll) || 0;
    const isProductsView = !!session?.isProductsView;
    const categoryName = (session?.categoryName || '').toString().trim();

    if (isProductsView && categoryName) {
      openCategory(categoryName, true);
      setTimeout(() => {
        window.scrollTo({ top: scroll, behavior: 'auto' });
      }, 100);
    } else {
      setTimeout(() => {
        window.scrollTo({ top: scroll, behavior: 'auto' });
      }, 100);
    }
  } catch (_) {
    // ignore malformed session payloads
  }
}

function filterProducts() {
  const input = document.getElementById('searchInput');
  const txt = (input?.value || '').toLowerCase().trim();

  if (txt !== '') {
    const itemsToHide = '#main-hero, #categories-area, #best-sellers, #daily-offers';
    smoothSwitch(itemsToHide, '#products-area', () => {
      document.getElementById('current-category-title').innerText = 'نتائج البحث';
      const filterContainer = document.getElementById('smart-filters');
      if (filterContainer) filterContainer.innerHTML = '';

      const filtered = allProducts.filter(p =>
        (p.name || '').toLowerCase().includes(txt)
      );
      document.getElementById('product-list').innerHTML = filtered.length
        ? filtered.map(p => createProductCard(p)).join('')
        : '<p style="text-align:center;">مفيش نتائج تطابق بحثك</p>';

      // ✅ نزول تلقائي لنتائج البحث
      const productsArea = document.getElementById('products-area');
      if (productsArea) {
        const yOffset = -90;
        const y = productsArea.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  } else showCategories();
}

// =========================================================
// 9. السلة (Cart Logic) – موحدة 🛒
// =========================================================

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) {
      cart = [];
      updateCartUI();
      return;
    }
    const parsed = JSON.parse(raw);
    cart = Array.isArray(parsed)
      ? parsed.map((it) => {
          if (!it || typeof it !== 'object') return null;
          const name = (it.name || '').toString().trim();
          if (!name) return null;
          return {
            name,
            variant: (it.variant || '').toString().trim(),
            price: Math.max(0, Number(it.price) || 0),
            quantity: Math.max(1, Number(it.quantity) || 1),
            image: ((it.image || '').toString().trim()) || DEFAULT_IMAGE
          };
        }).filter(Boolean)
      : [];
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

// ✅ دمج حسب الاسم + الوزن
function addToCart(name, price, imageUrl, variant = '') {
  const v = (variant || '').toString().trim();
  const existing = cart.find(i => i.name === name && ((i.variant || '') === v));

  if (existing) { existing.quantity++; const np = Number(price) || 0; if (np && existing.price !== np) existing.price = np; }
  else {
    cart.push({
      name: name,
      variant: v,
      price: Number(price) || 0,
      quantity: 1,
      image: imageUrl || DEFAULT_IMAGE
    });
  }

  saveCartToStorage();
  updateCartUI();
  showAddToCartToast();
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
  const title = item.name;
  const variant = (item.variant || '').toString().trim();
  const fullTitle = variant ? `${title} (${variant})` : title;

  return `
    <div class="cart-item">
      <div class="cart-item-main">
        <div class="cart-item-thumb">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(fullTitle)}"
               onerror="this.src='${DEFAULT_IMAGE}'">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-title">${escapeHtml(title)}</div>
          ${variant ? `<div class="cart-item-variant">${escapeHtml(variant)}</div>` : ''}
          <div class="cart-item-pricing">
            <span class="cart-item-sub">سعر القطعة</span>
            <b class="cart-item-unit-price">${item.price} ج.م</b>
          </div>
          <div class="cart-item-row">
            <div class="cart-qty-controls">
              <button class="qty-btn" type="button" data-cart-action="dec" data-index="${index}">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn" type="button" data-cart-action="inc" data-index="${index}">+</button>
            </div>
            <div class="cart-line-total">
              <span>الإجمالي</span>
              <b>${lineTotal} ج.م</b>
            </div>
          </div>
        </div>
      </div>
      <button class="cart-item-remove" type="button" data-cart-action="remove" data-index="${index}">
        حذف
      </button>
    </div>
  `;
}

function updateCartUI() {
  const itemsDiv = document.getElementById('cartItems');
  const totalSpan = document.getElementById('cartTotal');
  const headerCount = document.getElementById('cart-count');
  const floatCount = document.getElementById('float-count');

  if (!itemsDiv) return;

  if (!cart || cart.length === 0) {
    itemsDiv.innerHTML = `
      <div class="cart-empty">
        السلة فاضية حاليًا 🤍
        <div class="cart-empty-sub">ابدأ بإضافة المنتجات من الصفحة.</div>
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
  const sidebar = document.getElementById('cartSidebar');
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

  if (shouldOpen) {
    restoreCheckoutData();
    setCartCheckoutStep(1);
  }
}

function showToast() {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  const message = arguments[0];
  const type = arguments[1] || 'ok';
  const duration = Number(arguments[2]) || 2000;
  const safeMessage = (message || '').toString().trim() || ADD_TO_CART_TOAST_MESSAGE;

  // reset any previous state before showing again
  toast.classList.remove('active');
  toast.classList.remove('toast-warn');

  toast.textContent = safeMessage;
  toast.dataset.toastType = type;
  toast.classList.toggle('toast-warn', type === 'warn');
  clearTimeout(showToast._t);
  requestAnimationFrame(() => {
    toast.classList.add('active');
  });
  showToast._t = setTimeout(() => {
    toast.classList.remove('active');
    toast.classList.remove('toast-warn');
    toast.removeAttribute('data-toast-type');
    toast.textContent = '';
  }, duration);
}

function showAddToCartToast() {
  showToast(ADD_TO_CART_TOAST_MESSAGE, 'ok', 2000);
}

function showCheckoutValidationToast() {
  showToast('من فضلك استكمل بيانات الشحن أولاً', 'warn', 2400);
}

function getMissingCheckoutFields() {
  const hasItems = Array.isArray(cart) && cart.length > 0;
  const name = document.getElementById('c-name')?.value.trim();
  const phone = document.getElementById('c-phone')?.value.trim();
  const area = document.getElementById('c-area')?.value;
  const branch = document.getElementById('c-branch')?.value;

  const missing = [];
  if (!name) missing.push('الاسم');
  if (!phone) missing.push('الموبايل');
  if (!area) missing.push('المنطقة');
  if (!branch) missing.push('الفرع الأقرب');

  return { hasItems, missing };
}

function maybeShowCheckoutValidationToast(force = false) {
  const { hasItems, missing } = getMissingCheckoutFields();
  if (!hasItems || missing.length === 0) return false;

  const now = Date.now();
  if (!force && (now - __lastCheckoutValidationToastAt) < 900) return false;
  __lastCheckoutValidationToastAt = now;
  showCheckoutValidationToast();
  return true;
}

function bindCheckoutAttemptToast() {
  const btn = document.getElementById('checkoutBtn');
  const footer = document.querySelector('.cart-footer');
  if (!btn || !footer) return;

  footer.addEventListener('pointerup', (e) => {
    if (__cartCheckoutStep !== 2) return;
    if (!btn.disabled) return;

    const r = btn.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    const insideBtn = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (insideBtn) {
      __checkoutAttemptedSubmit = true;
      refreshCheckoutButtonState();
      maybeShowCheckoutValidationToast(true);
    }
  });
}

function setCartCheckoutStep(step = 1) {
  __cartCheckoutStep = (step === 2) ? 2 : 1;

  const form = document.querySelector('.cart-form');
  const proceedBtn = document.getElementById('proceedCheckoutStepBtn');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const submitHelp = document.querySelector('.checkout-submit-help');
  const note = document.querySelector('.cart-note');
  const validation = document.getElementById('checkoutValidationMsg');
  const stepHint = document.getElementById('cartStepHint');
  const stepBadge = document.getElementById('checkoutStepBadge');

  if (form) form.style.display = (__cartCheckoutStep === 2) ? '' : 'none';
  if (proceedBtn) proceedBtn.style.display = (__cartCheckoutStep === 1) ? '' : 'none';
  if (checkoutBtn) checkoutBtn.style.display = (__cartCheckoutStep === 2) ? '' : 'none';
  if (submitHelp) submitHelp.style.display = (__cartCheckoutStep === 2) ? '' : 'none';
  if (note) note.style.display = (__cartCheckoutStep === 2) ? '' : 'none';
  if (stepHint) {
    stepHint.textContent = (__cartCheckoutStep === 2)
      ? 'أكمل بيانات الشحن ثم أرسل الطلب'
      : 'راجع السلة قبل إدخال بيانات الشحن';
  }
  if (stepBadge) stepBadge.textContent = 'إتمام الطلب';

  if (validation && __cartCheckoutStep === 1) {
    validation.textContent = '';
    validation.classList.remove('is-warn', 'is-info');
  }

  if (__cartCheckoutStep === 2) {
    const firstField = document.getElementById('c-name');
    firstField?.focus?.();
  }

  refreshCheckoutButtonState();
}

function refreshCheckoutButtonState() {
  const btn = document.getElementById('checkoutBtn');
  if (!btn) return;
  if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = (btn.textContent || '').trim();
  const feedbackEl = document.getElementById('checkoutValidationMsg');

  const hasItems = cart.length > 0;
  const name = document.getElementById('c-name')?.value.trim();
  const phone = document.getElementById('c-phone')?.value.trim();
  const area = document.getElementById('c-area')?.value;
  const branch = document.getElementById('c-branch')?.value;

  const missing = [];
  if (!name) missing.push('الاسم');
  if (!phone) missing.push('الموبايل');
  if (!area) missing.push('المنطقة');
  if (!branch) missing.push('الفرع الأقرب');

  if (hasItems && name && phone && area && branch) {
    __checkoutAttemptedSubmit = false;
  }

  const requiredState = [
    ['name', !!name],
    ['phone', !!phone],
    ['area', !!area],
    ['branch', !!branch]
  ];
  const isCheckoutStep = (__cartCheckoutStep === 2);
  const shouldMarkInvalid = isCheckoutStep && __checkoutAttemptedSubmit && hasItems;
  requiredState.forEach(([key, okField]) => {
    const group = document.querySelector(`.required-field[data-required="${key}"]`);
    if (!group) return;
    group.classList.toggle('field-invalid', shouldMarkInvalid && !okField);
  });

  const ok = !!(hasItems && name && phone && area && branch);
  const proceedBtn = document.getElementById('proceedCheckoutStepBtn');
  if (proceedBtn) {
    const canProceed = hasItems && !__checkoutSubmitting;
    proceedBtn.disabled = !canProceed;
    proceedBtn.classList.toggle('btn-disabled', !canProceed);
    proceedBtn.setAttribute('aria-disabled', String(!canProceed));
  }

  btn.classList.toggle('btn-disabled', !ok);
  btn.disabled = !ok || __checkoutSubmitting;
  btn.setAttribute('aria-disabled', String(btn.disabled));
  btn.setAttribute('aria-busy', String(__checkoutSubmitting));

  if (!isCheckoutStep) {
    if (feedbackEl) {
      feedbackEl.textContent = '';
      feedbackEl.classList.remove('is-warn', 'is-info');
    }
    return;
  }

  if (__checkoutSubmitting) {
    btn.textContent = 'جارٍ إرسال الطلب...';
    if (feedbackEl) {
      feedbackEl.textContent = 'يتم تجهيز الطلب وتحويلك إلى واتساب...';
      feedbackEl.classList.remove('is-warn');
      feedbackEl.classList.add('is-info');
    }
    return;
  }

  if (!ok) {
    btn.textContent = 'استكمل بيانات الشحن';
    if (feedbackEl) {
      if (!hasItems) feedbackEl.textContent = 'أضف منتجات إلى السلة أولاً لإرسال الطلب.';
      else feedbackEl.textContent = `البيانات الناقصة: ${missing.join(' • ')}`;
      feedbackEl.classList.remove('is-info');
      feedbackEl.classList.add('is-warn');
    }
    return;
  }

  btn.textContent = btn.dataset.defaultLabel || 'إرسال الطلب واتساب';
  if (feedbackEl) {
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('is-warn', 'is-info');
  }
}

async function checkoutWhatsApp() {
  if (__checkoutSubmitting) return;
  __checkoutAttemptedSubmit = true;
  refreshCheckoutButtonState();

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
  maybeShowCheckoutValidationToast(true);
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

  __checkoutSubmitting = true;
  refreshCheckoutButtonState();

  try {
    saveCheckoutData();

    await window.AlAshrafOrders.createOrderFromCheckout({
      cart,
      customer: { name, phone, area, branch, address },
      whatsappNumber: WHATSAPP_NUMBER,
      sourcePage: "index"
    });
  } catch (_) {
    alert('تعذر إرسال الطلب حالياً، حاول مرة أخرى.');
  } finally {
    __checkoutSubmitting = false;
    refreshCheckoutButtonState();
  }
}

// زر السلة العائم
window.addEventListener('scroll', () => {
  const floatBtn = document.getElementById('floatingCart');
  if (!floatBtn) return;
  if (window.scrollY > 150) floatBtn.classList.add('show');
  else floatBtn.classList.remove('show');
});
// ====== ضمان ربط زر الإرسال في الرئيسية + إتاحة الدوال لـ inline onclick ======
try {
  window.checkoutWhatsApp = checkoutWhatsApp;
  window.refreshCheckoutButtonState = refreshCheckoutButtonState;
} catch (e) {}


// (Removed) duplicate .checkout-btn binding to prevent double checkout. Event delegation handles it.
