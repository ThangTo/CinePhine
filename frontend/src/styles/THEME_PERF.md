# Theme perf checklist

Rút ra từ đợt tối ưu theme Halloween. Theme mới (Noel, Tết...) đi qua list này trước khi merge.

## Nguyên tắc: chỉ animate thứ compositor tự làm được

Composite (rẻ, chạy ngoài main thread): `transform`, `opacity`, `translate`, `rotate`, `scale`.
Mọi thứ khác trong keyframes = **repaint mỗi frame**.

## CSS

- [ ] Keyframes chỉ dùng `transform` / `opacity` / `translate` / `rotate` / `scale`.
- [ ] Không keyframe `filter`, `box-shadow`, `background-position`, `width/height/top/left`.
      Muốn "nhấp nháy glow" → glow tĩnh + animate `opacity` của một lớp phủ (pseudo-element).
- [ ] Pattern trôi (sọc, scanline): đặt lên pseudo-element rộng hơn 1 tile, animate `transform: translateX(<1 tile>)`.
      Xem `.site-leaderboard-bar::before` trong `themes.css`.
- [ ] **Không animate phần tử bên trong SVG** (`<g>`, `<path>`, `<circle>`...) nếu chạy liên tục:
      mỗi frame vẽ lại cả SVG + `drop-shadow` của nó. Đưa animation lên chính thẻ `<svg>` hoặc div bọc ngoài.
      Ngoại lệ: thứ đứng yên phần lớn chu kỳ (chớp mắt, nảy 1 nhịp) — hiếm khi đổi giá trị nên ít repaint.
- [ ] Hiệu ứng chỉ cần khi hover → chỉ bật animation trong `:hover` (vd. đuôi mèo).
- [ ] `filter: drop-shadow` chỉ để **tĩnh**, và tránh đặt trên overlay `position: fixed` phủ cả màn hình.
- [ ] Trang trí ở vùng thường nằm ngoài màn hình (footer...) → `content-visibility: auto`
      (chỉ dùng cho slot `position: absolute` trang trí; phần tử trong flow sẽ nhảy layout).
- [ ] Thêm selector mới vào block `prefers-reduced-motion` của theme.

## JS

- [ ] Handler `pointermove` / `scroll`: lưu toạ độ, gom về **1 `requestAnimationFrame`**; không làm việc trực tiếp trong handler.
- [ ] Trong frame: **đọc hết** (`getBoundingClientRect`) rồi mới **ghi** (`style.setProperty`). Đọc-ghi xen kẽ = layout lại mỗi phần tử.
- [ ] Không `transition` trên thứ đã bám theo chuột mỗi frame (transition bị restart liên tục).
- [ ] Canvas: không `shadowBlur` (blur pass cho mỗi lần fill). Dùng sprite gradient cache sẵn + `drawImage`
      (`drawGlow` trong `effects/halloween.js`) hoặc vẽ thêm 1 chấm mờ to hơn.
- [ ] Canvas rAF loop: ngừng khi ngoài màn hình (`IntersectionObserver`, xem `MagicFlowBackground`),
      không vẽ khi không có gì để vẽ (kể cả `clearRect` trên canvas đã trống).

## Đo nhanh

Bật theme (dev: `?themePreview=<theme>`), dán vào DevTools console. Mục `PAINT` là thứ repaint mỗi frame:

```js
const COMPOSITE = new Set(["transform","opacity","translate","rotate","scale"]);
const rows = {};
for (const a of document.getAnimations()) {
  if (a.playState !== "running") continue;
  const el = a.effect?.target;
  const pseudo = a.effect?.pseudoElement || "";
  const props = [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)))].filter(p => !["offset","computedOffset","easing","composite"].includes(p));
  const inSvg = el instanceof SVGElement && !(el instanceof SVGSVGElement);
  const paint = inSvg || props.some(p => !COMPOSITE.has(p));
  const name = (a.animationName || a.transitionProperty || "waapi") + pseudo;
  const key = `${name} [${props.join(",")}]${inSvg ? " (in-SVG)" : ""}`;
  rows[key] = rows[key] || { n: 0, paint, cls: String(el?.className?.baseVal ?? el?.className ?? "").slice(0, 45) };
  rows[key].n++;
}
({ total: Object.values(rows).reduce((s, r) => s + r.n, 0), paint: Object.values(rows).filter(r => r.paint).reduce((s, r) => s + r.n, 0), list: Object.entries(rows).map(([k, v]) => `${v.paint ? "PAINT" : "comp "} x${v.n}  ${k}  <${v.cls}>`).sort() })
```

Kỹ hơn: DevTools → Rendering → bật **Paint flashing**; vùng nhấp nháy xanh liên tục khi đứng yên = còn repaint.
