/**
 * Kiểm tra tĩnh trước khi deploy: chạy `npm run check`.
 *
 * Mục tiêu: bắt sớm các lỗi "âm thầm" từng làm site hỏng mà không báo gì —
 * thiếu file, link chết, CSP chặn inline, cấu hình assets sai, hash 404 sai.
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

const read = (relative) => readFile(path.join(root, relative), "utf8");
const exists = async (relative) => {
  try {
    await access(path.join(publicDir, relative));
    return true;
  } catch {
    return false;
  }
};

const [html, notFoundHtml, worker, headers, wranglerText, appJs, notFoundJs, mainCss, notFoundCss] =
  await Promise.all([
    read("public/index.html"),
    read("public/404.html"),
    read("src/index.js"),
    read("public/_headers"),
    read("wrangler.jsonc"),
    read("public/scripts/app.js"),
    read("public/scripts/404.js"),
    read("public/styles/main.css"),
    read("public/styles/404.css"),
  ]);

const errors = [];
const warn = (message) => errors.push(message);

/** 1. File bắt buộc phải tồn tại. */
const requiredFiles = [
  "index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  ".well-known/discord",
  "favicon.ico",
  "assets/fog-discord-mark.svg",
  "assets/fog-forest-hero.webp",
  "assets/apple-touch-icon.png",
  "styles/main.css",
  "styles/404.css",
  "scripts/app.js",
  "scripts/404.js",
];
for (const file of requiredFiles) {
  if (!(await exists(file))) warn(`Thiếu file bắt buộc trong public/: /${file}`);
}

/** 2. Mọi href/src nội bộ trong HTML phải trỏ tới file có thật. */
const checkedDocs = [
  ["public/index.html", html],
  ["public/404.html", notFoundHtml],
];
for (const [label, doc] of checkedDocs) {
  const ids = new Set([...doc.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
  for (const match of doc.matchAll(/\b(?:href|src|poster|action)\s*=\s*(["'])(.*?)\1/gs)) {
    const value = match[2].trim();
    if (!value || /^(?:https?:|\/\/|data:|mailto:|tel:|javascript:)/i.test(value)) continue;

    if (value.startsWith("#")) {
      const fragment = decodeURIComponent(value.slice(1));
      if (!ids.has(fragment)) warn(`${label}: fragment không tồn tại — ${value}`);
      continue;
    }

    const url = new URL(value, "https://local.invalid/");
    if (url.origin !== "https://local.invalid") continue;

    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (relative.includes("..")) {
      warn(`${label}: URL vượt khỏi thư mục public — ${value}`);
      continue;
    }
    if (!(await exists(relative))) warn(`${label}: không có file cho URL nội bộ — ${value}`);
  }
}

/** 3. Nội dung gốc không được mất khi refactor. */
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
  if (!html.includes(`>${line}</span>`)) warn(`Bài thơ gốc bị thiếu hoặc đã đổi: ${line}`);
}
for (const [feature, snippet] of [
  ["Spotify widget", 'id="spotify-widget"'],
  ["Đồng hồ địa phương", 'id="local-time"'],
  ["Công tắc Pháp Tắc", 'id="freeze-clock"'],
  ["Nền sương", ".page-shell::before"],
]) {
  const haystack = feature === "Nền sương" ? mainCss : html;
  if (!haystack.includes(snippet)) warn(`Thiếu module bắt buộc: ${feature}`);
}
if (!html.includes("Pháp Tắc: Đứng Hình")) warn("Thiếu nhãn công tắc Pháp Tắc.");
if (!appJs.includes("refreshSpotifyProgress")) warn("Thiếu đồng bộ tiến độ Spotify.");

/** 4. Không còn code rác / tích hợp nhạc đã bị loại bỏ. */
const removedPatterns = [
  [/\byoutube\b|iframe_api|youtube-player|<audio\b|\.mp3|media-src|frame-src/i, "player/nhạc nền"],
  [/fog-forest-hero\.jpg/i, "ảnh hero .jpg đã xoá (chỉ còn .webp)"],
  [/Screenshot_20260910_163210_Discord/i, "ảnh OG tên cũ đã xoá"],
];
for (const [pattern, label] of removedPatterns) {
  for (const [file, content] of [
    ["public/index.html", html],
    ["public/404.html", notFoundHtml],
    ["public/styles/main.css", mainCss],
    ["public/_headers", headers],
  ]) {
    if (pattern.test(content)) warn(`${file} còn tham chiếu ${label}.`);
  }
}

/** 5. Toàn bộ JS/CSS phải là file ngoài — CSP không cho phép inline. */
for (const [file, doc] of checkedDocs) {
  if (/<style[\s>]/i.test(doc)) warn(`${file} còn <style> inline — CSP sẽ chặn.`);
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(doc)) warn(`${file} còn <script> inline — CSP sẽ chặn.`);
  if (/\sstyle=["']/i.test(doc)) warn(`${file} còn style="" inline — CSP sẽ chặn.`);
}

/** 6. Trang 404: hash 21 ký tự, không tự chuyển hướng, phiên 10–21 giây. */
if (!/new Uint8Array\(21\)/.test(notFoundJs)) warn("404: hash không còn đúng 21 ký tự.");
if (!/10000 \+ Math\.floor\(Math\.random\(\) \* 11001\)/.test(notFoundJs)) {
  warn("404: phiên mô phỏng không còn nằm trong khoảng 10–21 giây.");
}
if (/location\.(assign|replace|href)|location\s*=|meta[^>]+http-equiv=["']?refresh/i.test(notFoundJs + notFoundHtml)) {
  warn("404: vẫn còn logic tự chuyển hướng — yêu cầu là KHÔNG chuyển hướng.");
}
if (!/refreshState|replaceState/.test(notFoundJs)) warn("404: hash phải đổi bằng history.replaceState.");
if (!/visibilitychange|pagehide/.test(notFoundJs)) warn("404: thiếu cơ chế dừng khi rời tab.");

/** 7. Worker + cấu hình Wrangler. */
if (!/status:\s*404/.test(worker)) warn("Worker phải trả HTTP 404 cho URL không tồn tại.");
if (!worker.includes('"/404.html"') && !worker.includes("NOT_FOUND_PATH")) {
  warn("Worker không trỏ tới trang 404.html.");
}
if (!/ALLOWED_HOST/.test(worker)) warn("Worker thiếu kiểm tra ALLOWED_HOST (chỉ một domain duy nhất).");

let config;
try {
  config = JSON.parse(wranglerText);
} catch {
  warn("wrangler.jsonc không phải JSON hợp lệ.");
}
if (config) {
  if (config.main !== "./src/index.js") warn("wrangler.jsonc: main phải là ./src/index.js.");
  if (config.assets?.binding !== "ASSETS") warn("wrangler.jsonc: thiếu assets.binding = ASSETS.");
  if (config.assets?.not_found_handling !== "none") {
    warn('wrangler.jsonc: not_found_handling phải là "none" để Worker tự xử lý 404.');
  }
  if (!Array.isArray(config.assets?.run_worker_first) || !config.assets.run_worker_first.includes("/*")) {
    warn('wrangler.jsonc: run_worker_first phải chứa "/*" để Worker kiểm tra host.');
  }
  if (!config.vars?.ALLOWED_HOST) warn("wrangler.jsonc: thiếu vars.ALLOWED_HOST.");
}

/** 8. CSP: không có 'unsafe-inline' cho script, đủ host cho ảnh/fetch. */
const csp = (headers.match(/Content-Security-Policy:\s*(.+)/i) || [])[1] || "";
if (!csp) warn("public/_headers thiếu Content-Security-Policy.");
const directives = Object.fromEntries(
  csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...values]) => [name, values.join(" ")]),
);
if (/unsafe-inline/.test(directives["script-src"] || "")) warn("CSP: script-src không được có 'unsafe-inline'.");
if (/unsafe-inline|unsafe-eval/.test(directives["style-src"] || "")) warn("CSP: style-src không được có 'unsafe-inline'.");
for (const [directive, host] of [
  ["connect-src", "https://api.lanyard.rest"],
  ["connect-src", "wss://api.lanyard.rest"],
  ["img-src", "https://cdn.discordapp.com"],
  ["img-src", "https://i.scdn.co"],
  ["style-src", "https://fonts.googleapis.com"],
  ["font-src", "https://fonts.gstatic.com"],
]) {
  if (!(directives[directive] || "").includes(host)) warn(`CSP: ${directive} thiếu ${host}.`);
}
if (/www\./i.test(headers) || /www\./i.test(worker) || /www\./i.test(html)) {
  warn("Còn tham chiếu www.* — dự án chỉ hỗ trợ một domain duy nhất.");
}

/** 9. HTML head: canonical + OG trỏ đúng domain duy nhất. */
if (!html.includes('<link rel="canonical" href="https://meo-mate.site/"')) {
  warn("index.html: canonical phải là https://meo-mate.site/.");
}

if (errors.length) {
  console.error(`Kiểm tra thất bại (${errors.length} vấn đề):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Kiểm tra thành công: ${requiredFiles.length} file bắt buộc, link/fragment nội bộ, thơ gốc, ` +
      `Spotify/đồng hồ, 404 không chuyển hướng, CSP chặt, ALLOWED_HOST và cấu hình Wrangler.`,
  );
}
