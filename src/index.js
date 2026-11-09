// Only unmatched paths reach this Worker. Known static files are served directly by Cloudflare.
export default {
  async fetch(request, env) {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    // Serve the standalone theatrical 404 UI with the requested HTTP 200 status.
    const pageUrl = new URL("/404.html", request.url);
    const pageResponse = await env.ASSETS.fetch(new Request(pageUrl, { method: "GET" }));
    const headers = new Headers(pageResponse.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(request.method === "HEAD" ? null : pageResponse.body, {
      status: 200,
      headers,
    });
  },
};
