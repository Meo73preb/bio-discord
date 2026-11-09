import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const [html, notFoundHtml, worker, headers, wranglerText] = await Promise.all([
  readFile(path.join(publicDir, "index.html"), "utf8"),
  readFile(path.join(publicDir, "404.html"), "utf8"),
  readFile(path.join(root, "src/index.js"), "utf8"),
  readFile(path.join(publicDir, "_headers"), "utf8"),
  readFile(path.join(root, "wrangler.jsonc"), "utf8"),
]);
const errors = [];
const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
const requiredFiles = [
  "index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  ".well-known/discord",
];

for (const file of requiredFiles) {
  try {
    await access(path.join(publicDir, file));
  } catch {
    errors.push(`Thiếu endpoint bắt buộc: /${file}`);
  }
}

for (const match of html.matchAll(/\b(?:href|src|poster|action)\s*=\s*(["'])(.*?)\1/gs)) {
  const value = match[2].trim();
  if (!value || /^(?:https?:|\/\/|data:|mailto:|tel:|javascript:)/i.test(value)) continue;

  if (value.startsWith("#")) {
    const fragment = decodeURIComponent(value.slice(1));
    if (!ids.has(fragment)) errors.push(`Fragment không tồn tại: ${value}`);
    continue;
  }

  let url;
  try {
    url = new URL(value, "https://local.invalid/");
  } catch {
    errors.push(`URL nội bộ không hợp lệ: ${value}`);
    continue;
  }

  if (url.origin !== "https://local.invalid") continue;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    errors.push(`URL có percent-encoding không hợp lệ: ${value}`);
    continue;
  }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const target = path.resolve(publicDir, relative);
  if (!target.startsWith(`${publicDir}${path.sep}`) && target !== path.join(publicDir, "index.html")) {
    errors.push(`URL vượt khỏi thư mục public: ${value}`);
    continue;
  }

  try {
    await access(target);
  } catch {
    errors.push(`Không tìm thấy file cho URL nội bộ: ${value}`);
  }
}

const originalPoem = [
  "Sương khói mờ nhân ảnh,",
  "Đời thực thực hư hư.",
  "Ngươi bảo ta sai trái?",
  "Hãy tự đúng trước dư!",
  "Thật nực cười nhân thế,",
  "Mang hắc ám trong tim.",
  "Lại giương cao lưỡi kiếm,",
  "Đòi diệt sạch bóng đêm?",
  "Sảy chân vào cõi mộng,",
  "Trường sinh hay nấm mồ?",
];
for (const line of originalPoem) {
  if (!html.includes(`>${line}</span>`)) errors.push(`Bài thơ gốc bị thiếu hoặc thay đổi: ${line}`);
}

const removedAudioPattern = /\byoutube\b|iframe_api|youtube-player|sound-control|music-toggle|<audio\b|\.mp3|media-src|frame-src/i;
if (removedAudioPattern.test(html)) errors.push("Trang chính còn tích hợp hoặc tham chiếu player/nhạc nền.");
if (removedAudioPattern.test(headers)) errors.push("CSP còn cho phép tích hợp iframe hoặc media không dùng.");
for (const [feature, snippet] of [
  ["Spotify widget", 'id="spotify-widget"'],
  ["Đồng hồ địa phương", 'id="local-time"'],
  ["Công tắc Pháp Tắc", 'id="freeze-clock"'],
  ["Nền sương", ".page-shell::before"],
]) {
  if (!html.includes(snippet)) errors.push(`Thiếu module bắt buộc: ${feature}`);
}
if (!html.includes('Pháp Tắc: Đứng Hình')) errors.push("Thiếu nhãn công tắc Pháp Tắc.");
if (!html.includes("spotify.timestamps") || !html.includes("refreshSpotifyProgress")) errors.push("Thiếu đồng bộ tiến độ Spotify.");

if (!notFoundHtml.includes("length: 21") || !notFoundHtml.includes("3000 + Math.floor(Math.random() * 18001)")) {
  errors.push("Trang mô phỏng 404 thiếu hash 21 ký tự hoặc khoảng tự chuyển hướng 3–21 giây.");
}
if (!notFoundHtml.includes("Dừng chuyển hướng") || !notFoundHtml.includes("GIAO DIỆN MÔ PHỎNG")) {
  errors.push("Trang 404 thiếu nội dung công khai mô phỏng hoặc nút dừng chuyển hướng.");
}
if (!worker.includes("status: 200") || !worker.includes('"/404.html"')) {
  errors.push("Worker chưa phục vụ trang 404 mô phỏng với mã HTTP 200.");
}
try {
  const config = JSON.parse(wranglerText);
  if (config.main !== "./src/index.js" || config.assets?.binding !== "ASSETS" || config.assets?.not_found_handling !== "404-page") {
    errors.push("Cấu hình Wrangler thiếu Worker hoặc assets binding/404-page.");
  }
} catch {
  errors.push("wrangler.jsonc không phải JSON hợp lệ cho cấu hình hiện tại.");
}

if (errors.length) {
  console.error("Kiểm tra route thất bại:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Kiểm tra thành công: ${ids.size} ID, ${requiredFiles.length} endpoint, thơ gốc, Spotify/clock, 404 HTTP 200 và không có tích hợp nhạc.`);
}
