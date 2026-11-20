/**
 * bio-discord — Cloudflare Worker (Static Assets router)
 *
 * Worker chỉ làm hai việc:
 *   1. Chuẩn hoá host: chỉ phục vụ ĐÚNG MỘT domain chính (vars.ALLOWED_HOST).
 *      Mọi host khác — www, *.workers.dev, *.pages.dev, subdomain — trả 404 gọn.
 *   2. Đưa URL không tồn tại (và mọi lỗi khi đọc Assets) về public/404.html
 *      với HTTP 404 thật, header no-store + noindex.
 *
 * File tĩnh có thật do Cloudflare phục vụ trực tiếp qua env.ASSETS.
 */

const DEFAULT_ALLOWED_HOST = "meo-mate.site";
const NOT_FOUND_PAGE = "/404.html";
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function allowedHost(env) {
  const fromEnv = env && env.ALLOWED_HOST;
  return String(typeof fromEnv === "string" && fromEnv.trim() ? fromEnv.trim() : DEFAULT_ALLOWED_HOST)
    .toLowerCase();
}

function isAllowedHost(hostname, env) {
  const host = hostname.toLowerCase();
  return host === allowedHost(env) || DEV_HOSTS.has(host);
}

function plainNotFound(message) {
  return new Response(message, {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Trả nội dung 404.html nhưng giữ đúng HTTP 404 cho URL hiện tại. */
async function renderNotFound(request, env) {
  const pageUrl = new URL(request.url);
  pageUrl.pathname = NOT_FOUND_PAGE;
  pageUrl.search = "";

  let page;
  try {
    page = await env.ASSETS.fetch(new Request(pageUrl.toString(), { method: "GET" }));
  } catch {
    return plainNotFound("Not Found");
  }
  if (!page.ok) return plainNotFound("Not Found");

  const headers = new Headers(page.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.delete("ETag");
  return new Response(request.method === "HEAD" ? null : page.body, {
    status: 404,
    statusText: "Not Found",
    headers,
  });
}

export default {
  async fetch(request, env) {
    const { hostname } = new URL(request.url);
    if (!isAllowedHost(hostname, env)) return plainNotFound("Not Found");

    let response;
    try {
      response = await env.ASSETS.fetch(request);
    } catch {
      return renderNotFound(request, env);
    }
    if (response.status !== 404) return response;

    // /404.html truy cập trực tiếp: Cloudflare đã xử lý redirect/trailing slash.
    if (new URL(request.url).pathname === NOT_FOUND_PAGE) return response;
    return renderNotFound(request, env);
  },
};
