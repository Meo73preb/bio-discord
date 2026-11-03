# Bio Discord Worker

Website bio Discord tiếng Việt dạng HTML/CSS/JavaScript tĩnh. Không có backend, database hay framework build. Cloudflare Workers Static Assets phục vụ nội dung trong `public/`; các URL không có file trả `public/404.html` với HTTP 404.

## Yêu cầu

- Node.js 20 trở lên.
- Tài khoản Cloudflare có zone `meo-mate.site` đang Active và DNS được quản lý tại Cloudflare.

## Chạy và kiểm tra

```bash
npm ci
npm run dev
```

Trước khi deploy:

```bash
npm run check
```

Lệnh trên kiểm tra URL/file/fragment nội bộ và chạy Wrangler dry-run; nó **không publish** website.

## Deploy bằng terminal

```bash
npx wrangler login
npm run deploy
```

Nếu dùng Cloudflare Workers Builds kết nối GitHub thì đặt Deploy command là `npm run deploy`; không cần đồng thời chạy deploy terminal cho mỗi commit.

## Domain

Hướng dẫn gắn domain gốc và chuyển `www.meo-mate.site` về `meo-mate.site` nằm trong [`CLOUDFLARE_DOMAIN_SETUP.md`](./CLOUDFLARE_DOMAIN_SETUP.md). Không thêm `www` làm Custom Domain của Worker trong phương án này: `www` dùng DNS CNAME proxied và Cloudflare Single Redirect Rule.

## Quy tắc URL

- `https://meo-mate.site/` là URL chuẩn, được khai báo ở canonical, `robots.txt` và sitemap.
- Các file thật như `/robots.txt`, `/sitemap.xml`, `/.well-known/discord` và `/assets/...` được phục vụ trực tiếp.
- URL không có trong `public/` phải trả 404. Không dùng SPA fallback hoặc redirect mọi URL lỗi về trang chủ.
- `www` được chuyển hướng ở Cloudflare Rules, không phải trong HTML tĩnh.

Build command của Cloudflare để trống vì project không có bước build. Preview command mặc định `npx wrangler preview`; có thể tắt Preview deployments nếu không cần URL preview. Xem hướng dẫn domain để cấu hình chi tiết.
