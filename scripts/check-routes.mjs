import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const html = await readFile(path.join(publicDir, "index.html"), "utf8");
const errors = [];
const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
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

if (errors.length) {
  console.error("Kiểm tra route thất bại:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Kiểm tra route thành công: ${ids.size} ID và ${requiredFiles.length} endpoint bắt buộc.`);
}
