# Báo cáo sửa lỗi — bio-discord

Ngày: 2026-11-19 · Phạm vi: toàn bộ repo `Meo73preb/bio-discord`
Kết quả đo trên Chromium headless (cùng máy, cùng trang): **~14 fps → ~60 fps**.

---

## 1. Lỗi nghiêm trọng (site hỏng thật, không chỉ chậm)

| # | Lỗi | Hậu quả | Đã sửa |
|---|-----|---------|--------|
| 1 | CSS gọi `/assets/fog-forest-hero.webp` nhưng repo chỉ có `.jpg` (file `.webp` từng bị xoá ở commit `b13ad98`) | **404 mỗi lần tải trang**, hero + aside mất ảnh, tải 371KB vô ích | Tạo `.webp` thật (159KB, quality 72), xoá `.jpg` |
| 2 | CSP `script-src 'self'` + `style-src 'self'` nhưng `404.html` và `index.html` dùng `<style>`/`<script>` inline | **CSP chặn toàn bộ CSS và JS của trang 404** → trang trắng, hash không chạy, nút "Dừng chuyển hướng" không hoạt động | Tách ra `styles/404.css` + `scripts/404.js`; `index.html` cũng tách `styles/main.css` + `scripts/app.js`. CSP giữ nguyên nghiêm ngặt, bỏ hẳn `unsafe-inline` |
| 3 | Avatar: `?size=144` — Discord CDN chỉ nhận luỹ thừa 2 | **Avatar luôn 404 → luôn hiện ảnh mặc định**, kèm 1 request lỗi mỗi lần cập nhật presence | Đổi sang `?size=128` |
| 4 | Regex avatar `/^a?_[A-Za-z0-9_]+$/` viết sai | Avatar động (`a_…`) và avatar thường không khớp → lọt validate sai, URL luôn là fallback | `/^(?:a_)?[A-Za-z0-9_]+$/` |
| 5 | `wrangler.jsonc` dùng `"not_found_handling": "404-page"`, Worker lại kiểm tra `status !== 404` | Worker không bao giờ chạy → mọi URL lạ trả 404 mặc định của Cloudflare thay vì trang mô phỏng | `not_found_handling: "none"` + `run_worker_first: ["/*"]`, Worker trả `404.html` với HTTP 404 |
| 6 | `isShortString` được khai báo **sau** `isValidSpotify` (dùng `const`) | Nếu thứ tự thực thi thay đổi → `ReferenceError` (TDZ), toàn bộ validate presence chết | Khai báo helper trước, dùng `function` (hoisted) |
| 7 | CSS không khai báo `@font-face`/fallback khi Google Fonts bị chặn | Vẫn chạy nhưng cần `preconnect` + `display=swap` (đã có) — bổ sung `preload` hero | — |

## 2. Nguyên nhân lag (đo bằng A/B từng lớp CSS)

```
baseline (trang trắng)            60.3 fps
trang gốc                         12–14 fps
  → bỏ filter/mix-blend/mask      29 fps
  → bỏ toàn bộ animation          60 fps
```

Thủ phạm chính, không phải JS:

- `filter: blur(42px)` trên 2 dải sương full-screen.
- `mix-blend-mode: screen` (body::before noise + orb) → ép trình duyệt composite lại toàn viewport mỗi khung hình.
- `mask-image` + `filter: saturate/contrast` trên orb 680px.
- `backdrop-filter: blur()` trên `.button` và `.profile-card` — blur lại nền **trong khi nền đang động**.
- Animation `transform: scale(1.04 → 1.09)` trên lớp nền phủ toàn trang → repaint toàn màn hình mỗi frame.

Đã xử lý: bỏ hết filter/blend/mask/backdrop-filter (thay bằng gradient tĩnh), animation chỉ còn
`opacity` (compositor-only), bỏ `will-change`, thêm `content-visibility: auto` cho section dưới màn hình.

## 3. Rò rỉ tài nguyên & code rác

| Vấn đề | Sửa |
|---|---|
| 2 × `setInterval` 1 giây chạy mãi (đồng hồ + Spotify), kể cả khi tab ẩn | Gộp thành 1 timer, `stop` khi `visibilitychange` |
| WebSocket + heartbeat vẫn timers khi tab ẩn | `disconnectSocket()` khi ẩn, nối lại khi hiện |
| `.orb`/`.mist-ribbon` bị `animation: … infinite` kể cả khi `prefers-reduced-motion` | Giữ nguyên hành vi tôn trọng reduced-motion, đã kiểm tra |
| Handler `error` gắn lặp trên ảnh bìa Spotify mỗi lần re-render | `setSpotifyArt()` gỡ handler cũ trước khi gắn mới |
| `pointermove` giữ object `event` trong callback rAF | Chốt toạ độ ngay, chỉ dùng số trong rAF |
| `avatar.addEventListener("error")` gán lại `src` vô điều kiện | Thêm cờ `dataset.fallback` chống vòng lặp |
| `new URL(...)` trong try/catch cho mọi activity | Giữ, nhưng validate một lượt qua `every()` |
| Hàm/tham số chết: `paintRealtimePresence`, `clearSocketTimers` + `startSocketHeartbeat` trùng vai trò, `websocketLive` set sai chỗ, `attempt` tham số không dùng | Viết lại `app.js` gọn: 1 luồng sync, 1 luồng socket, 1 timer |
| `README.md` + `readme.md` trùng nội dung, mâu thuẫn nhau (một bản ghi "404 trả HTTP 200", bản kia "trả 404") | Gộp thành một `readme.md` đúng thực tế |
| `public/favicon.svg` trùng `assets/fog-discord-mark.svg` | Xoá file trùng |
| `Screenshot_20260910_163210_Discord.jpg` (tên xấu, 48KB) | Đổi thành `discord-bio-og.jpg` (24KB) |

## 4. Đúng yêu cầu mới của bạn

- **Bỏ hoàn toàn tự chuyển hướng** ở trang 404: không `location.assign`, không `meta refresh`,
  không đếm ngược, bỏ nút "Dừng chuyển hướng" (giữ nút "Mở trang hồ sơ").
- **Giữ hash ngẫu nhiên 21 ký tự**, nhịp đổi **100–300 ms**, dùng `history.replaceState`
  (không phình lịch sử).
- **Giới hạn phiên 10–21 giây rồi tự dừng** (10 000 + random 0–11 000 ms).
- **Throttle theo FPS**: máy dưới 30 fps sẽ giãn nhịp đổi hash tới 1 200 ms và giãn log —
  không ngốn CPU của khách vô tình truy cập.
- **Dừng ngay khi rời trang / ẩn tab** (`pagehide`, `visibilitychange`), không để timer chạy nền.
- **Một domain duy nhất**: Worker chỉ phục vụ `meo-mate.site` (`vars.ALLOWED_HOST`),
  `www.meo-mate.site` và mọi subdomain/`*.workers.dev` trả `404` gọn. Đã xoá mọi hướng dẫn `www`
  khỏi docs/code.

## 5. Hạ tầng / vận hành

- `wrangler.jsonc`: bật `observability` (log miễn phí), khai báo `vars.ALLOWED_HOST`,
  `run_worker_first` để Worker kiểm tra host trước khi trả asset.
- `_headers`: CSP chặt (`default-src 'none'`, không `unsafe-inline`), thêm COOP/CORP,
  `Permissions-Policy` đầy đủ, cache: HTML `must-revalidate`, CSS/JS `max-age=3600`,
  `/assets/*` `immutable 30 ngày`.
- `package.json`: khai báo `engines: node >= 22` (Wrangler 4 từ chối Node 20 — đây là lý do
  `npm run check` fail trên máy bạn; xem mục 6).
- `scripts/check-routes.mjs` viết lại: kiểm tra file bắt buộc, link/fragment, bài thơ gốc,
  **không còn inline `<style>`/`<script>`/`style=""`**, hash 404 & không redirect, CSP có đủ host,
  không còn `www`, cấu hình Wrangler, `ALLOWED_HOST`.

## 6. Việc bạn cần làm khi deploy

```bash
# Node 22+ là bắt buộc cho Wrangler 4
nvm install 22 && nvm use 22
npm install
npm run check
npm run deploy
```

- Gắn **Custom Domain `meo-mate.site`** (apex) cho Worker `bio-discord`.
- **Không** thêm `www` hay wildcard; nếu DNS còn bản ghi `www` trỏ về Worker thì xoá.
- Trên Workers Builds: Build command **để trống**, Deploy command `npm run deploy`.
- Nếu đổi domain: sửa `vars.ALLOWED_HOST`, `DEFAULT_ALLOWED_HOST` trong `src/index.js`,
  canonical/OG trong `public/index.html`, `robots.txt`, `sitemap.xml`.

## 7. Những gì đã kiểm thử

- Chromium headless: trang chủ desktop 1280×900 và mobile 390×844 — 0 pageerror, 0 console error,
  không tràn ngang.
- Đồng hồ chạy đúng, công tắc "Pháp Tắc: Đứng Hình" đóng băng chính xác.
- Lanyard thật: presence "Đang trực tuyến · mobile", custom status, avatar CDN tải được.
- Lanyard mock: widget Spotify hiện đúng tên/nghệ sĩ, thanh tiến độ tự chạy theo giây.
- Lanyard lỗi: dùng cache localStorage và báo "Dữ liệu cũ", không crash.
- 404: hash 21 ký tự, đổi 100–300 ms, **không chuyển hướng**, tự dừng sau phiên, dừng khi ẩn tab.
- Host: `meo-mate.site` → 200; `www.`, `sub.`, `*.workers.dev` → 404.
- `npm run check` + `wrangler deploy --dry-run`: pass.
