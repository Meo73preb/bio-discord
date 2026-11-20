/* Trang 404 mô phỏng: hash ngẫu nhiên 21 ký tự, tự dừng sau 10–21 giây. */
(() => {
  "use strict";
  const terminal = document.getElementById("terminal");
  const traceTimer = document.getElementById("trace-timer");
  const traceSuffix = document.getElementById("trace-suffix");

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const lines = [
    "[TRACE] Đang kiểm tra dấu vết của đường dẫn…",
    "[SIM] Mô-đun sương: hoạt ảnh cục bộ đã khởi tạo.",
    "[WARN] Không tìm thấy tài nguyên tại vị trí này.",
    "[SIM] Ghi đè giả lập: chỉ hiệu ứng giao diện đang chạy.",
    "[TRACE] Tự chuyển hướng: đã tắt theo cấu hình."
  ];

  const randomHash = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(21));
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) out += chars[bytes[i] % chars.length];
    return out;
  };

  // Một phiên mô phỏng kéo dài 10–21 giây rồi tự dừng hoàn toàn.
  const startedAt = performance.now();
  const sessionMs = 10000 + Math.floor(Math.random() * 11001);
  const basePath = window.location.pathname + window.location.search;

  // Thiết bị yếu (<30fps) sẽ giãn nhịp đổi hash để không ngốn CPU.
  const SLOW_FPS = 30;
  const MIN_GAP_MS = 100;
  const MAX_GAP_MS = 300;
  let hashGapMs = MIN_GAP_MS + Math.round(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
  let logGapMs = 900;

  let lastFrame = 0;
  let avgFrameMs = 16.7;
  let nextHashAt = startedAt;
  let nextLogAt = startedAt;
  let lineIndex = 0;
  let running = true;
  let frameHandle = 0;
  let lastPaint = -1;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const paintLog = () => {
    const recent = Array.from({ length: 5 }, (_, i) => lines[(lineIndex + i) % lines.length]);
    lineIndex = (lineIndex + 1) % lines.length;
    const tail = running
      ? "ĐANG MÔ PHỎNG…"
      : "PHIÊN MÔ PHỎNG ĐÃ KẾT THÚC.";
    terminal.textContent = `${recent.join("\n")}\n> ${tail}`;
  };

  const updateDot = (elapsed) => {
    traceTimer.textContent = (elapsed / 1000).toFixed(1).replace(".", ",");
  };

  function stop() {
    if (!running) return;
    running = false;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    traceSuffix.textContent = "s · đã dừng";
    traceTimer.textContent = ((performance.now() - startedAt) / 1000).toFixed(1).replace(".", ",");
    paintLog();
  }

  function tick(now) {
    if (!running) return;
    if (document.hidden) { stop(); return; }

    if (lastFrame) {
      // Trung bình luỹ tiến nhẹ để nhận biết máy chậm mà không giật cục.
      avgFrameMs = avgFrameMs * 0.9 + (now - lastFrame) * 0.1;
      const fps = 1000 / Math.max(avgFrameMs, 1);
      if (fps < SLOW_FPS) {
        hashGapMs = Math.min(1200, Math.round(hashGapMs * 1.02) + 5);
        logGapMs = 1400;
      } else if (hashGapMs > MAX_GAP_MS) {
        hashGapMs = Math.max(MAX_GAP_MS, hashGapMs - 10);
      }
    }
    lastFrame = now;

    const elapsed = now - startedAt;

    if (!reduceMotion && now >= nextHashAt) {
      // replaceState: đổi hash tại chỗ, không làm phình lịch sử trình duyệt.
      window.history.replaceState(null, "", `${basePath}#${randomHash()}`);
      nextHashAt = now + hashGapMs;
    }

    if (now >= nextLogAt) {
      paintLog();
      nextLogAt = now + logGapMs;
    }

    const wholeTenths = Math.floor(elapsed / 100);
    if (wholeTenths !== lastPaint) {
      lastPaint = wholeTenths;
      updateDot(elapsed);
    }

    if (elapsed >= sessionMs) { stop(); return; }
    frameHandle = requestAnimationFrame(tick);
  }

  // Tab bị ẩn hoặc rời trang: dừng ngay, không giữ timer nào chạy nền.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (running) { lastFrame = 0; nextHashAt = performance.now(); frameHandle = requestAnimationFrame(tick); }
  });
  window.addEventListener("pagehide", stop, { once: true });

  paintLog();
  frameHandle = requestAnimationFrame(tick);
})();
  
