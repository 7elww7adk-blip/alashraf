/* orders.js
   - يحفظ الطلبات على الجهاز (localStorage)
   - يفتح واتساب ويعرض صفحة "طلباتي"
   - يسجل الطلب في Google Sheet عبر Apps Script (بدون CORS) باستخدام hidden form submit
*/

const ORDERS_KEY = "alashraf_orders_v1";
const LAST_ORDER_ID_KEY = "alashraf_last_order_id_v1";

// ✅ رابط الـ Apps Script (Web App)
const ORDERS_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOLtcn62mngtyCD9h7jgn6BR8Q6lnGvMBF6BZ-1C9iXXhPp7qfWQMIkio66hWkviP-gQ/exec";

function nowISO() { return new Date().toISOString(); }
function pad2(n){ return String(n).padStart(2,'0'); }

function makeOrderId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const day = pad2(d.getDate());
  const rand = Math.floor(10000 + Math.random()*90000);
  return `${y}${m}${day}-${rand}`;
}

function makeDeliveryCode() {
  return String(Math.floor(1000 + Math.random()*9000));
}

function normalizeOrderId(id) {
  if (!id) return "";
  const s = String(id).trim();
  const parts = s.split("-");
  if (parts.length === 2) {
    const a = parts[0], b = parts[1];
    // لو اتقلبت: 5digits-8digits => رجعها 8-5
    if (a.length === 5 && b.length === 8) return `${b}-${a}`;
  }
  return s;
}

function normalizeSyncState(sync) {
  const status = (sync && typeof sync.status === "string") ? sync.status : "pending";
  if (status === "synced" || status === "pending" || status === "failed") {
    return {
      status,
      at: (sync && sync.at) ? String(sync.at) : nowISO(),
      error: (sync && sync.error) ? String(sync.error) : ""
    };
  }
  return { status: "pending", at: nowISO(), error: "" };
}

function normalizeOrderRecord(order) {
  if (!order || typeof order !== "object") return null;
  const orderId = normalizeOrderId(order.orderId || order.id || "");
  if (!orderId) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const normalizedItems = items.map((it) => ({
    name: (it?.name || "").toString(),
    variant: (it?.variant || "").toString(),
    price: Math.max(0, Number(it?.price) || 0),
    quantity: Math.max(1, Number(it?.quantity) || 1),
    image: (it?.image || "").toString()
  })).filter(it => it.name.trim() !== "");

  return {
    orderId,
    deliveryCode: (order.deliveryCode || "").toString(),
    createdAt: (order.createdAt || nowISO()).toString(),
    dateText: (order.dateText || "").toString(),
    status: (order.status || "قيد التحضير").toString(),
    sourcePage: (order.sourcePage || "").toString(),
    customer: {
      name: (order.customer?.name || "").toString(),
      phone: (order.customer?.phone || "").toString(),
      area: (order.customer?.area || "").toString(),
      branch: (order.customer?.branch || "").toString(),
      address: (order.customer?.address || "").toString()
    },
    items: normalizedItems,
    sync: normalizeSyncState(order.sync)
  };
}

function loadOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeOrderRecord).filter(Boolean);
  } catch { return []; }
}

function saveOrders(list) {
  try {
    const safe = Array.isArray(list) ? list.map(normalizeOrderRecord).filter(Boolean) : [];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(safe));
  } catch (_) {}
}

function upsertOrder(order) {
  const orders = loadOrders();
  const idx = orders.findIndex(o => o.orderId === order.orderId);
  if (idx >= 0) orders[idx] = order;
  else orders.unshift(order);
  saveOrders(orders);
}

function setLastOrderId(orderId) {
  try {
    localStorage.setItem(LAST_ORDER_ID_KEY, normalizeOrderId(orderId));
  } catch (_) {}
}

function getLastOrderId() {
  try {
    return normalizeOrderId(localStorage.getItem(LAST_ORDER_ID_KEY) || "");
  } catch (_) {
    return "";
  }
}

function calcTotals(items) {
  let totalAmount = 0;
  let totalQty = 0;
  (items || []).forEach(it => {
    totalAmount += (Number(it.price)||0) * (Number(it.quantity)||0);
    totalQty += (Number(it.quantity)||0);
  });
  return { totalAmount, totalQty };
}

/* =========================
   Sheet Sync (no CORS)
   ========================= */
async function postToSheet(order) {
  if (!ORDERS_APPS_SCRIPT_URL) return { ok:false, skipped:true };

  const { totalAmount, totalQty } = calcTotals(order.items);
  const itemsCount = (order.items || []).length;

  const fields = {
    // الأعمدة في الشيت
    order_code: order.orderId,
    created_at: order.createdAt,
    name: order.customer.name,
    phone: order.customer.phone,
    area: order.customer.area,
    branch: order.customer.branch || "",
    nearestBranch: order.customer.branch || "",
    address: order.customer.address || "",
    items_json: JSON.stringify(order.items || []),
    items_count: String(itemsCount),     // عدد الأصناف
    items_count_2: String(totalQty),     // إجمالي القطع (للعمود المكرر)
    subtotal: String(totalAmount),
    note: `delivery=${order.deliveryCode} | source=${order.sourcePage || ""} | status=${order.status || ""}`
  };

  // ✅ الأفضل على الاستضافة: sendBeacon (يكمل حتى لو الصفحة اتغيرت)
  // fallback: fetch(no-cors) ثم fallback: hidden form submit
  const params = new URLSearchParams();
  Object.entries(fields).forEach(([k,v]) => params.append(k, v ?? ""));

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([params.toString()], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
      const ok = navigator.sendBeacon(ORDERS_APPS_SCRIPT_URL, blob);
      if (ok) return { ok:true, via:"beacon" };
    }
  } catch (e) {
    // ignore and fallback
  }

  try {
    // no-cors: نقدر نبعت بدون ما نقرأ الرد (Apps Script يستقبل عادي)
    await fetch(ORDERS_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString()
    });
    return { ok:true, via:"fetch" };
  } catch (e) {
    // fallback to form
  }

  try {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = ORDERS_APPS_SCRIPT_URL;
    form.style.display = "none";

    // hidden iframe target (أفضل من فتح تبويب جديد)
    const iframe = document.getElementById("sheet_iframe") || (() => {
      const fr = document.createElement("iframe");
      fr.name = "sheet_iframe";
      fr.id = "sheet_iframe";
      fr.style.display = "none";
      document.body.appendChild(fr);
      return fr;
    })();
    form.target = iframe.name;

    Object.entries(fields).forEach(([k,v]) => {
      const inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = k;
      inp.value = v ?? "";
      form.appendChild(inp);
    });

    document.body.appendChild(form);
    form.submit();
    form.remove();
    return { ok:true, via:"form" };
  } catch (e) {
    return { ok:false, error:String(e) };
  }
}

async function syncOne(order) {
  try {
    const r = await postToSheet(order);
    if (r.ok) {
      order.sync = { status:"synced", at: nowISO() };
      upsertOrder(order);
      return true;
    }
    order.sync = { status:"failed", at: nowISO(), error: String(r?.error || "sync_not_confirmed") };
    upsertOrder(order);
    return false;
  } catch (e) {
    order.sync = { status:"failed", at: nowISO(), error: String(e) };
    upsertOrder(order);
    return false;
  }
}

async function syncPending() {
  const orders = loadOrders();
  const pending = orders.filter(o => (o.sync?.status || "pending") !== "synced");
  let okCount = 0;
  for (const o of pending) {
    const ok = await syncOne(o);
    if (ok) okCount++;
  }
  return { total: pending.length, ok: okCount };
}

/* =========================
   WhatsApp Message Builder
   ========================= */
function buildWhatsAppMessage(order) {
  const { totalAmount, totalQty } = calcTotals(order.items);

  let msg = `*طلب جديد من موقع الأشراف*`;
  msg += `\n====================`;
  msg += `\n كود الطلب: ${normalizeOrderId(order.orderId)}`;
  msg += `\n كود التوصيل: ${order.deliveryCode}`;
  msg += `\n التاريخ: ${order.dateText}`;
  msg += `\n--------------------`;
  msg += `\n الاسم: ${order.customer.name}`;
  msg += `\n الهاتف: ${order.customer.phone}`;
  msg += `\n العنوان: ${order.customer.area} - ${order.customer.address || '-'}`;
  msg += `\n الفرع الأقرب: ${order.customer.branch || '-'}`;
  msg += `\n====================`;
  msg += `\n🧺 تفاصيل الطلب:\n`;

  order.items.forEach((item, index) => {
    const title = item.variant ? `${item.name} (${item.variant})` : item.name;
    const lineTotal = (Number(item.price)||0) * (Number(item.quantity)||0);
    msg += `\n${index+1}) ${title}`;
    msg += `\n   الكمية: ${item.quantity}`;
    msg += `\n   سعر القطعة: ${item.price} ج.م`;
    msg += `\n   إجمالي المنتج: ${lineTotal} ج.م\n`;
  });

  msg += `\n====================`;
  msg += `\nإجمالي عدد القطع: ${totalQty}`;
  msg += `\nالإجمالي الكلي: ${totalAmount} ج.م`;
  msg += `\n====================`;
  msg += `\nتم إرسال الطلب من خلال موقع الأشراف.`;

  return msg;
}

/* =========================
   Public API (used by script.js / ramadan.js)
   ========================= */
window.AlAshrafOrders = {
  createOrderFromCheckout: async function({ cart, customer, whatsappNumber, sourcePage }) {
    // منع الضغط مرتين (double submit)
    if (window.__alashraf_checkout_lock) return { skipped: true, reason: "locked" };
    window.__alashraf_checkout_lock = true;
    try {
      const d = new Date();
      const orderId = makeOrderId();
      const deliveryCode = makeDeliveryCode();

      const items = (cart || []).map(it => ({
        name: it.name,
        variant: it.variant || "",
        price: Math.max(0, Number(it.price) || 0),
        quantity: Math.max(1, Number(it.quantity) || 1),
        image: it.image || ""
      }));

      const order = {
        orderId,
        deliveryCode,
        createdAt: nowISO(),
        dateText: `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`,
        status: "قيد التحضير",
        sourcePage: sourcePage || "",
        customer: {
          name: customer?.name || "",
          phone: customer?.phone || "",
          area: customer?.area || "",
          branch: customer?.branch || "",
          address: customer?.address || ""
        },
        items,
        sync: { status: "pending", at: nowISO() }
      };

      upsertOrder(order);
      setLastOrderId(orderId);

      // مزامنة في الخلفية بدون تعطيل نفس التدفق الحالي
      syncOne(order).catch(() => {});

      // افتح واتساب
      const msg = buildWhatsAppMessage(order);
      const encodedMsg = encodeURIComponent(msg);
      window.open(`https://wa.me/${whatsappNumber}?text=${encodedMsg}`, "_blank");

      // افتح صفحة الطلبات (نفس التاب) بعد تأخير بسيط لضمان وصول الإرسال
      setTimeout(() => {
        window.location.href = `orders.html?order=${encodeURIComponent(orderId)}`;
      }, 700);

      return order;
    } finally {
      setTimeout(() => { window.__alashraf_checkout_lock = false; }, 5000);
    }
  },

  loadOrders,
  syncPending
};

/* =========================
   Orders Page Renderer
   ========================= */
function escapeHtml(s){
  return (s ?? "").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function renderOrderDetails(order) {
  const box = document.getElementById("orderDetailsCard");
  if (!box) return;

  if (!order) {
    box.innerHTML = `
      <div class="cart-empty">
        مفيش طلبات لسه 🤍
        <div class="cart-empty-sub">اطلب من الموقع وبعدين ارجع هنا.</div>
      </div>
    `;
    return;
  }

  const { totalAmount, totalQty } = calcTotals(order.items);

  const statusPill = ``; // الحالة ثابتة عندكم ومش هتتغير — مش هنظهرها
  let syncPill = `<span class="order-pill ok">تم إستلام الطلب</span>`;
  if (order.sync?.status === "synced") {
    syncPill = `<span class="order-pill ok">متسجل ✅</span>`;
  } else if (order.sync?.status === "failed") {
    syncPill = `<span class="order-pill warn">تعذر المزامنة - سيتم إعادة المحاولة</span>`;
  } else if (order.sync?.status === "pending") {
    syncPill = `<span class="order-pill warn">جارٍ تسجيل الطلب...</span>`;
  }

  const itemsHtml = (order.items || []).map((it) => {
    const title = it.variant ? `${it.name} (${it.variant})` : it.name;
    const lineTotal = (Number(it.price)||0) * (Number(it.quantity)||0);
    const img = it.image || "image/default.jpg";

    // نفس ستايل كارت السلة الحالي
    return `
      <div class="cart-item">
        <div class="cart-item-main">
          <div class="cart-item-thumb">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" onerror="this.src='image/default.jpg'">
          </div>
          <div class="cart-item-info">
            <div class="cart-item-title">${escapeHtml(title)}</div>
            <div class="cart-item-sub">سعر القطعة: ${escapeHtml(it.price)} ج.م</div>
            <div class="cart-item-row">
              <div class="cart-qty-controls">
                <span class="qty-value">x${escapeHtml(it.quantity)}</span>
              </div>
              <div class="cart-line-total">${escapeHtml(lineTotal)} ج.م</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  box.innerHTML = `
    <div class="orders-meta">
      <div>كود الطلب: <b>${escapeHtml(normalizeOrderId(order.orderId))}</b></div>
      <div>كود التوصيل: <b>${escapeHtml(order.deliveryCode)}</b></div>
      <div>التاريخ: <b>${escapeHtml(order.dateText)}</b></div>
      <div class="orders-pills">${statusPill} ${syncPill}</div>
    </div>

    <div class="orders-address">
      <b>عنوان التوصيل:</b>
      <div>${escapeHtml(order.customer.area)} - ${escapeHtml(order.customer.address || "-")}</div>
      <div>الفرع الأقرب: ${escapeHtml(order.customer.branch || "-")}</div>
      <div class="orders-address-sub">${escapeHtml(order.customer.name)} • ${escapeHtml(order.customer.phone)}</div>
    </div>

    <div class="orders-items-head">
      <b>عناصر الطلب</b>
      <span class="orders-items-count">(${totalQty} قطعة)</span>
    </div>

    <div class="orders-items">
      ${itemsHtml}
    </div>

    <div class="orders-total">
      <span>الإجمالي</span>
      <b>${escapeHtml(totalAmount)} ج.م</b>
    </div>
  `;
}

function renderOrdersList(orders, q="") {
  const list = document.getElementById("ordersList");
  if (!list) return;

  const allOrders = Array.isArray(orders) ? orders : [];
  const qq = (q || "").trim().toLowerCase();
  const filtered = !qq ? allOrders : allOrders.filter(o => {
    const hay = [
      o.orderId, o.deliveryCode, o.customer?.name, o.customer?.phone, o.customer?.area, o.customer?.branch,
      ...(o.items||[]).map(i => i.name + " " + (i.variant||""))
    ].join(" ").toLowerCase();
    return hay.includes(qq);
  });

  if (!filtered.length) {
    list.innerHTML = qq
      ? `<div class="orders-card">لا توجد نتائج مطابقة للبحث.</div>`
      : `<div class="orders-card">لا توجد طلبات محفوظة حالياً.</div>`;
    return;
  }

  list.innerHTML = filtered.map(o => {
    const { totalAmount, totalQty } = calcTotals(o.items);
    const sync = (o.sync?.status === "synced") ? "✅" : (o.sync?.status === "failed" ? "⚠️" : "⏳");
    return `
      <button class="order-row" type="button" data-oid="${escapeHtml(normalizeOrderId(o.orderId))}">
        <div class="order-row-title">طلب ${escapeHtml(normalizeOrderId(o.orderId))} ${sync}</div>
        <div class="order-row-sub">${escapeHtml(o.dateText)} • ${escapeHtml(totalQty)} قطعة • ${escapeHtml(totalAmount)} ج.م</div>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".order-row").forEach(btn => {
    btn.addEventListener("click", () => {
      const oid = btn.getAttribute("data-oid");
      const all = loadOrders();
      const found = all.find(x => normalizeOrderId(x.orderId) === normalizeOrderId(oid));
      if (found) {
        renderOrderDetails(found);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // اشتغل بس لو الصفحة فيها عناصر الطلبات
  if (!document.getElementById("orderDetailsCard")) return;

  const orders = loadOrders();
  const url = new URL(location.href);
  const rawOid = url.searchParams.get("order") || getLastOrderId();
  const oid = normalizeOrderId(rawOid);
  const current = orders.find(o => normalizeOrderId(o.orderId) === oid) || orders[0];
  const search = document.getElementById("ordersSearch");

  renderOrderDetails(current || null);
  renderOrdersList(orders);

  // إعادة محاولة صامتة لأي طلبات pending/failed عند فتح صفحة الطلبات
  syncPending().then(() => {
    const all = loadOrders();
    const cur = all.find(o => normalizeOrderId(o.orderId) === oid) || all[0];
    renderOrderDetails(cur || null);
    renderOrdersList(all, search?.value || "");
  }).catch(() => {});

  if (search) {
    search.addEventListener("input", () => {
      renderOrdersList(loadOrders(), search.value);
    });
  }
});
