# تقرير فحص سريع للمشروع (GitHub Pages + الهيكل)

## 1) خريطة المشروع
- الصفحات الرئيسية في الجذر:
  - `index.html` (الواجهة الرئيسية)
  - `ramadan.html` (صفحة رمضان)
  - `orders.html` (صفحة الطلبات)
- منطق الواجهة:
  - `script.js` (منطق الصفحة الرئيسية + الكاتالوج + السلة)
  - `ramadan.js` (منطق صفحة رمضان + السلة)
  - `orders.js` (حفظ/عرض الطلبات + واتساب + مزامنة)
- التنسيقات:
  - `style.css` (ستايلات مشتركة لكل الصفحات)
- الأصول:
  - `image/` (صور المنتجات والشعار والبانر)
  - `fonts/` (خطوط محلية)
- يوجد نسخة مكررة/أرشيفية داخل: `الأشراف v13/` بنفس بنية ملفات الموقع تقريبًا.

## 2) طريقة التشغيل
- الموقع **Static** بالكامل (HTML/CSS/JS) بدون build step (لا يوجد package.json/webpack/vite).
- التشغيل المحلي: أي static server مثل:
  - `python -m http.server 4173`
- مسارات التحميل داخل الصفحات الرئيسية كلها نسبية (`style.css`, `script.js`, `image/...`) وبالتالي صالحة غالبًا لـ GitHub Pages (project pages) طالما فتح الصفحات من داخل نفس مجلد النشر.

## 3) Entry point وربط CSS/JS
- Entry UI الرئيسي: `index.html`.
  - يربط `style.css` داخل `<head>`.
  - يربط `orders.js` ثم `script.js` قبل `</body>`.
- صفحة رمضان: `ramadan.html` تربط `style.css` + `orders.js` + `ramadan.js`.
- صفحة الطلبات: `orders.html` تربط `style.css` + `orders.js`.

## 4) مراجعة GitHub Pages (المسارات)
- إيجابي: أغلب الروابط للأصول **نسبية** (مثل `image/logo.png`, `style.css`, `orders.html`) وهذا مناسب للنشر تحت subpath في GitHub Pages.
- ملاحظات مهمة:
  - يوجد ميتا OG/Twitter تشير إلى دومين خارجي `pages.dev` (ليست مشكلة تشغيل لكن قد لا تعكس رابط GitHub Pages الفعلي).
  - الاعتماد على صور خارجية من `postimg.cc` لبعض البانرات (مخاطر انقطاع خارجي).
  - هناك fallback لصورة `image/logo.jpg` بينما الملف غير موجود.

## 5) فحص سريع للأخطاء
نتائج الفحص المحلي أظهرت مشاكل أصول فعلية:
- `fonts/MyFont.ttf` غير موجود لكن مستخدم في `@font-face` داخل `style.css`.
- `image/pattern.png` غير موجود لكن مستخدم كخلفية للفوتر في `style.css`.
- `image/logo.jpg` غير موجود لكن مستخدم fallback في `onerror` داخل `index.html` و`orders.html`.

أثر ذلك:
- Console errors (404) في المتصفح.
- خط العناوين المحلي لا يعمل (fallback إلى خط بديل).
- خلفية الفوتر بنمط pattern لا تظهر.

## 6) 5 تحسينات سريعة بدون تغيير الوظيفة
1. إضافة/تصحيح ملفات الأصول الناقصة (`fonts/MyFont.ttf`, `image/pattern.png`) أو تعديل المسارات إلى الملفات الموجودة فعليًا.
2. إزالة fallback غير الموجود `image/logo.jpg` أو توفير الملف.
3. حذف/عزل النسخة المكررة `الأشراف v13/` في branch أرشيفي لتقليل الالتباس أثناء الصيانة.
4. توحيد إعداد روابط المشاركة (OG/Twitter) على رابط GitHub Pages الفعلي بدل pages.dev.
5. تقليل الاعتماد على صور خارجية (postimg) ونقلها إلى `image/` لتحسين الاعتمادية والأداء.

---

## How it works (10 نقط)
1. المستخدم يفتح `index.html` (أو `ramadan.html`) كصفحة static.
2. الصفحة تحمل `style.css` لتوحيد الهوية البصرية.
3. JS يجلب المنتجات من endpoint خارجي (Worker/Apps Script).
4. يتم كاش للمنتجات في `localStorage` لتسريع التحميل التالي.
5. عرض الأقسام/المنتجات يتم ديناميكيًا عبر DOM في `script.js`/`ramadan.js`.
6. السلة مشتركة بين الصفحات باستخدام مفتاح `alashraf_cart` في `localStorage`.
7. عند الإرسال، `orders.js` يبني order object ويحفظه محليًا.
8. ينشئ رسالة واتساب ويرسل المستخدم إلى WhatsApp برابط prefilled.
9. يحاول أيضًا مزامنة الطلب إلى Google Apps Script (beacon/fetch/form fallback).
10. صفحة `orders.html` تقرأ الطلبات المحلية وتعرضها مع البحث والتفاصيل.

## الملفات اللي غالبًا ستعدّلها حسب نوع التغيير
- الألوان/الخطوط/المسافات/الـlayout: `style.css`
- محتوى الصفحة الرئيسية وبنية الأقسام: `index.html`
- منطق الكاتالوج/الفلاتر/السلة الرئيسية: `script.js`
- محتوى ومنطق صفحة رمضان: `ramadan.html`, `ramadan.js`
- منطق الطلبات والربط مع واتساب/Apps Script: `orders.js`, `orders.html`
- الأصول البصرية: `image/*`, `fonts/*`

## ملاحظات قد تمنع GitHub Pages من العمل بشكل سليم
- أخطاء 404 الحالية لملفات أصول ناقصة (`MyFont.ttf`, `pattern.png`, `logo.jpg` fallback).
- لو تم استخدام مسار نشر غير الجذر مع روابط مطلقة مستقبلًا، قد تنكسر الأصول (حاليًا الروابط المحلية جيدة لأنها نسبية).
- أي تعطل في الـ endpoints الخارجية (Worker/Apps Script) سيؤثر على تحميل المنتجات/إرسال الطلبات رغم أن الاستضافة نفسها static.
