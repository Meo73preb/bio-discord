# Trà Mèo — Discord Bio

Một hồ sơ Discord tĩnh bằng tiếng Việt, được tạo như một trang nhật ký đêm cho Trà Mèo. Giao diện dùng mực xanh đen, ánh sương ngọc và kiểu chữ giàu chất biên tập. Những câu thơ và lời nhắn ban đầu được giữ nguyên; trạng thái Discord và Spotify được lấy trực tiếp từ Lanyard.

> “Đừng tìm ta giữa đám đông. Hãy tìm phần sương còn sót lại.”

Website không có backend riêng, cơ sở dữ liệu hay bước biên dịch frontend. HTML, CSS và JavaScript được phục vụ từ `public/` bằng Cloudflare Workers Static Assets. Worker nhỏ trong `src/index.js` chỉ xử lý các đường dẫn không tồn tại.

## Tính năng

- Hồ sơ Trà Mèo giữ lại bài thơ mười dòng, các trích dẫn, trạng thái và đường dẫn liên hệ ban đầu.
- Kết nối Lanyard REST và WebSocket cho trạng thái Discord theo thời gian thực. Nếu API tạm thời lỗi, trang dùng dữ liệu dự phòng hoặc bản lưu ngắn hạn.
- Khi Lanyard báo đang nghe Spotify, hồ sơ hiện ảnh bìa, tên bài, nghệ sĩ và thanh tiến độ. Tiến độ dựa trên mốc thời gian `start`/`end` của Spotify presence và được cập nhật mỗi giây. Đây là tiện ích trạng thái, không phát nhạc.
- Nền sương nhiều lớp chuyển động nhẹ và dịch điểm sáng theo con trỏ trên thiết bị có chuột. Không dùng canvas hay vòng lặp hạt nặng. Thiết lập giảm chuyển động của hệ điều hành được tôn trọng.
- Đồng hồ hiển thị giờ địa phương từ thiết bị của khách truy cập. Công tắc **“Pháp Tắc: Đứng Hình”** chụp chính xác thời điểm hiện tại; tắt công tắc để tiếp tục cập nhật.
- Trang `public/404.html` là hiệu ứng terminal hư cấu. Hash được đổi tại chỗ để tránh thêm hàng loạt mục vào lịch sử trình duyệt. Sau 3–21 giây trang tự quay về `/`, trừ khi khách chọn **“Dừng chuyển hướng”** hoặc mở trang hồ sơ bằng nút riêng. Nội dung ghi rõ đây chỉ là mô phỏng; không có quét mạng, khai thác hay truy cập hệ thống thật.
- Cloudflare Worker trả nội dung 404 mô phỏng với mã HTTP 200 theo yêu cầu. Các URL lỗi vì vậy không mang mã HTTP 404; `X-Robots-Tag` và `noindex` được đặt để hạn chế lập chỉ mục nhầm.
- Không còn nút nhạc nền, player ẩn, thẻ âm thanh, trang chờ bấm để phát hay tích hợp luồng MP3.

## Nhật ký thay đổi

### Phiên bản nâng cấp

- Gỡ hoàn toàn điều khiển nhạc Thiên Ý, player iframe YouTube, logic phát/dừng, cơ chế mở YouTube dự phòng và các chính sách CSP dành cho YouTube/media.
- Tạo widget Spotify từ trường `spotify` trong presence Lanyard. Ảnh bìa được kiểm tra nguồn HTTPS `i.scdn.co`; văn bản được hiển thị như text an toàn, không dựng HTML từ dữ liệu presence.
- Thêm nền sương CSS nhẹ có phản hồi con trỏ và hỗ trợ `prefers-reduced-motion`.
- Thay đồng hồ trang trí phụ thuộc trạng thái Discord bằng đồng hồ giờ địa phương thực, mặt đồng hồ analog và công tắc đóng băng.
- Thiết kế lại 404 thành terminal mô phỏng có log nhấp nháy, chuỗi hash ngẫu nhiên 21 ký tự, bộ đếm tự trở về và nút dừng.
- Thêm Worker và assets binding để URL không có tệp nhận trang 404 mô phỏng với mã 200.
- Cập nhật chính sách bảo mật nội dung (CSP), kiểm tra route và tài liệu triển khai.

### Nội dung được giữ nguyên

Bài thơ gốc trong `public/index.html` cùng các câu trích dẫn, đoạn kết nối, hồ sơ Discord và kênh GitHub được giữ lại. Có thể đối chiếu các dòng thơ sau trong section `#verse`:

> Sương khói mờ nhân ảnh,  
> Đời thực thực hư hư.  
> Ngươi bảo ta sai trái?  
> Hãy tự đúng trước dư!  
> Thật nực cười nhân thế,  
> Mang hắc ám trong tim.  
> Lại giương cao lưỡi kiếm,  
> Đòi diệt sạch bóng đêm?  
> Sảy chân vào cõi mộng,  
> Trường sinh hay nấm mồ?

## Cấu trúc dự án

```text
public/
  index.html      Hồ sơ, phong cách và logic trình duyệt
  404.html        Giao diện terminal mô phỏng độc lập
  _headers        CSP và các HTTP security headers
  assets/         Hình ảnh, biểu tượng và favicon
src/
  index.js        Chỉ đổi response 404 của asset thành HTTP 200
scripts/
  check-routes.mjs Kiểm tra route và tài nguyên nội bộ
wrangler.jsonc    Cấu hình Cloudflare Worker và static assets
```

## Chạy và kiểm tra

Yêu cầu Node.js 20 trở lên.

```bash
npm ci
npm run dev
```

Kiểm tra liên kết nội bộ, endpoint, yêu cầu nội dung và cấu hình deploy:

```bash
npm run check
```

`npm run check` chạy `check:routes` rồi Wrangler dry-run. Lệnh này không xuất bản website. Có thể thử một đường dẫn không tồn tại khi server phát triển đang chạy; Worker sẽ trả nội dung terminal với mã 200.

Để phát hành bằng terminal, đăng nhập Cloudflare trước rồi chạy:

```bash
npx wrangler login
npm run deploy
```

Nếu dùng Cloudflare Workers Builds kết nối GitHub, cấu hình deploy command là `npm run deploy`. Không cần chạy lệnh deploy terminal cho mỗi commit. Hãy xác nhận zone, DNS và quyền Cloudflare của tài khoản trước khi xuất bản.

## Hướng dẫn phát triển và hỗ trợ

### Đổi Discord ID hoặc Lanyard

Trong `public/index.html`, sửa hằng `DISCORD_ID`. URL REST được tạo từ ID này; WebSocket dùng cùng ID khi gửi gói subscribe. Đồng thời cập nhật ID trong liên kết hồ sơ Discord, nhãn hiển thị/copy và Worker không cần thay đổi. Trang dùng endpoint công khai `https://api.lanyard.rest`; nó không cần Discord bot token hay khóa bí mật.

Widget Spotify đọc `spotify.song`, `spotify.artist`, `spotify.album_art_url` và `spotify.timestamps.start/end` từ presence. Nếu mốc thời gian không có hoặc không hợp lệ, widget vẫn hiện bài hát nhưng thanh tiến độ không giả định một thời lượng. Nếu thay host ảnh bìa, hãy sửa kiểm tra host trong `isValidSpotify()` và `img-src` trong `public/_headers` cùng lúc. Trang không gọi API Spotify riêng.

### Điều chỉnh mật độ/chuyển động nền

Nền nằm trong CSS của `public/index.html`. Độ hiện rõ của các lớp sương được điều khiển bởi các alpha trong gradient `.page-shell::before`; thời gian trôi nằm ở animation `fog-shift`. Tăng alpha hoặc giảm thời gian để làm nền rõ/chuyển động nhanh hơn; giảm alpha và tăng thời gian để nền kín đáo hơn. Phản hồi chuột được cập nhật theo `requestAnimationFrame`, một lần tối đa mỗi khung hình. Không tăng thêm vòng lặp hạt nếu ưu tiên hiệu năng di động.

### Đồng hồ Pháp Tắc

Đồng hồ lấy múi giờ từ thiết bị người xem qua `Date` và `Intl.DateTimeFormat`. Hàm `paintClock()` vẽ lại chữ số và kim. Khi bật công tắc, `frozenClockTime` lưu một `Date` duy nhất; bỏ chọn sẽ đặt nó về `null` và đồng hồ tiếp tục theo giờ máy. Chỉnh cấu trúc hoặc nhãn ở section `.local-clock`, và giữ nguyên kết nối `aria-describedby` để trạng thái đóng băng được đọc bằng trình hỗ trợ tiếp cận.

### Thay đổi hiệu ứng 404

Trong `public/404.html`, khoảng tự chuyển hướng được tính bằng:

```js
const waitMs = 3000 + Math.floor(Math.random() * 18001);
```

Giá trị này tạo khoảng 3–21 giây. Đổi `3000` để thay đổi thời gian tối thiểu và `18001` để thay đổi độ rộng của khoảng ngẫu nhiên. Chuỗi hash có đúng 21 ký tự; khoảng giữa các lần cập nhật là 120 ms. Mỗi lần dùng `history.replaceState`, nên không làm phình lịch sử điều hướng. Nếu chỉnh lại giao diện, giữ thông báo mô phỏng, liên kết trang chủ và nút dừng chuyển hướng hiển thị rõ.

`src/index.js` chỉ chuyển nội dung của asset 404 sang response 200 và đặt `X-Robots-Tag: noindex, nofollow`. Đây là lựa chọn có chủ ý của dự án: khách truy cập và crawler đều nhận mã 200 cho URL không tồn tại. Nếu muốn HTTP semantics và SEO thông thường, bỏ Worker fallback và dùng `not_found_handling: "404-page"` để trả mã 404.

### Chính sách bảo mật nội dung

`public/_headers` cho phép kết nối Lanyard qua HTTPS/WebSocket, ảnh đại diện Discord từ `cdn.discordapp.com` và ảnh bìa Spotify từ `i.scdn.co`. Khi thêm một nguồn ngoài mới, chỉ thêm đúng host cần thiết vào chỉ thị CSP phù hợp. Không thêm nguồn phát âm thanh, iframe hoặc script bên ngoài nếu không có tính năng tương ứng.

## Bảo trì

Hãy giữ nguyên các câu thơ và nội dung thương hiệu khi chỉnh giao diện. Trước khi phát hành, chạy `npm run check` và kiểm tra bằng trình duyệt trên màn hình nhỏ, với giảm chuyển động bật/tắt, khi Lanyard có Spotify presence và khi Lanyard không có dữ liệu. Thay đổi chỉ được triển khai lên Cloudflare sau một lệnh deploy rõ ràng.

Tài liệu tham khảo triển khai: [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) và [Configuration and Bindings](https://developers.cloudflare.com/workers/static-assets/binding/).
