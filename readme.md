# Trà Mèo — Discord Bio

Hồ sơ Discord tĩnh tiếng Việt, chạy trên **Cloudflare Workers Static Assets** (gói Free).
Không backend riêng, không database, không bước build frontend. Toàn bộ file nằm trong `public/`;
Worker `src/index.js` chỉ làm hai việc: chặn host lạ và trả trang 404 mô phỏng.

> “Đừng tìm ta giữa đám đông. Hãy tìm phần sương còn sót lại.”

## Quy tắc cố định của dự án

| Hạng mục | Quy định |
| --- | --- |
| Domain | **Duy nhất** `meo-mate.site`. Không hỗ trợ `www`, không hỗ trợ subdomain. |
| Host lạ | Worker trả `404` gọn (không redirect, không phục vụ nội dung). |
| URL không tồn tại | Trả trang `public/404.html` với HTTP `404`, header `no-store` + `noindex`. |
| Trang 404 | Hash 21 ký tự đổi ngẫu nhiên trong 10–21 giây rồi **tự dừng**, **không chuyển hướng**. |
| CSP | Không có `unsafe-inline`: mọi CSS/JS phải là file ngoài. |

## Cấu trúc

```text
public/
  index.html          markup hồ sơ (không inline style/script)
  styles/main.css     toàn bộ giao diện + hiệu ứng nền
  scripts/app.js      đồng hồ, Lanyard REST/WebSocket, Spotify, copy ID
  404.html            trang mô phỏng
  styles/404.css
  scripts/404.js      hash ngẫu nhiên, tự dừng
  _headers            CSP + security headers + Cache-Control
  assets/             fog-forest-hero.webp, apple-touch-icon.png, OG, mark
  robots.txt, sitemap.xml, .well-known/discord, favicon.*
src/index.js          Worker: allowlist host + trang 404
scripts/check-routes.mjs  kiểm tra tĩnh trước khi deploy
wrangler.jsonc        cấu hình Worker + static assets
```

## Chạy & kiểm tra

Yêu cầu **Node.js 22+** (Wrangler 4 từ chối Node 20).

```bash
npm install
npm run dev            # http://localhost:8787
npm run check          # check:routes + wrangler deploy --dry-run
```

`npm run check` kiểm tra: file bắt buộc, link/fragment nội bộ, bài thơ gốc, CSP (không inline),
hash 404 & việc không còn redirect, allowlist host, và tính hợp lệ của `wrangler.jsonc`.

## Deploy

```bash
npx wrangler login
npm run deploy
```

Với Cloudflare Workers Builds (kết nối GitHub): **Build command để trống**, **Deploy command** là
`npm run deploy`.

### Gắn domain duy nhất

1. Zone `meo-mate.site` đang Active trên Cloudflare.
2. Workers → project `bio-discord` → *Settings → Domains & Routes → Add → Custom domain* → chọn
   `meo-mate.site` (apex).
3. **Không** thêm `www` hay `*.meo-mate.site`. Nếu trong DNS còn bản ghi `www` trỏ về Worker,
   hãy xoá hoặc để nó trỏ ra ngoài; Worker cũng sẽ trả 404 cho host đó.
4. `ALLOWED_HOST` mặc định là `meo-mate.site` (`wrangler.jsonc → vars`). Nếu đổi domain, sửa biến
   này **và** `src/index.js` (`DEFAULT_ALLOWED_HOST`), cùng canonical/OG trong `index.html`,
   `robots.txt`, `sitemap.xml`.

## Tinh chỉnh

### Discord ID / Lanyard

`DISCORD_ID` ở đầu `public/scripts/app.js`. Trang dùng endpoint công khai `https://api.lanyard.rest`
(không cần token). Đổi ID thì nhớ đổi cả link hồ sơ Discord và nhãn `ID · …` trong `index.html`.

### Ảnh bìa Spotify

Đọc `spotify.song/artist/album_art_url/timestamps.*`. Host ảnh phải là `i.scdn.co` — kiểm tra trong
`isValidSpotify()` và `img-src` của `public/_headers` cùng lúc.

### Đồng hồ Pháp Tắc

`paintClock()` trong `app.js` vẽ giờ thiết bị; bật công tắc sẽ chụp một `Date` duy nhất
(`frozenAt`) và giữ nguyên. Một timer 1 giây dùng chung cho cả đồng hồ và tiến độ Spotify,
tự dừng khi tab bị ẩn.

### Trang 404

```js
const sessionMs = 10000 + Math.floor(Math.random() * 11001); // 10–21 giây
const MIN_GAP_MS = 100;  // nhịp đổi hash: 100–300ms
const MAX_GAP_MS = 300;
const SLOW_FPS = 30;     // máy dưới 30fps sẽ giãn nhịp, tối đa 1200ms
```

Hash dùng `history.replaceState` nên không phình lịch sử. Phiên tự dừng sau `sessionMs`, dừng ngay
khi tab bị ẩn hoặc rời trang, và không có bất kỳ `location.assign`/`meta refresh` nào.

## Hiệu năng

Các điểm từng gây lag trên máy yếu/điện thoại và cách xử lý:

- `filter: blur(42px)` + `mix-blend-mode` + `mask-image` + `backdrop-filter` phủ lên nền động →
  bỏ hết, thay bằng gradient tĩnh.
- Animation phóng to/`transform` nền full-screen → chỉ còn animate `opacity` (compositor-only).
- Hai `setInterval` 1 giây chạy song song → gộp còn một, dừng khi tab ẩn.
- Font Google chặn render (`display=swap` + `preconnect`) và ảnh hero sai tên `.webp` (404 mỗi lần
  tải trang) → đã sửa; hero nén còn ~159KB WebP.
- Section dưới màn hình dùng `content-visibility: auto`.

Kết quả đo bằng Chromium headless trên cùng máy: **~14 fps → ~60 fps** ở trạng thái nghỉ.

## Bảo trì

Giữ nguyên bài thơ và nội dung thương hiệu khi chỉnh giao diện. Trước khi phát hành:
`npm run check`, rồi thử trên màn hình nhỏ, khi bật/tắt giảm chuyển động, khi Lanyard có Spotify và
khi Lanyard không trả dữ liệu.

Tham khảo: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/).
