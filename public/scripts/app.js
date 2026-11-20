/**
 * Trà Mèo — trang hồ sơ.
 * Không dùng framework, không build step. Chỉ ba mối quan tâm:
 *   1. Đồng hồ giờ thiết bị (kèm công tắc đóng băng)
 *   2. Presence Discord qua Lanyard (REST + WebSocket)
 *   3. Tiện ích nhỏ: sao chép ID, phản hồi con trỏ, ảnh đại diện dự phòng
 */
(function () {
  "use strict";

  var DISCORD_ID = "1159075341227278377";
  var LANYARD_URL = "https://api.lanyard.rest/v1/users/" + DISCORD_ID;
  var LANYARD_SOCKET_URL = "wss://api.lanyard.rest/socket";
  var CACHE_KEY = "fog-discord:last-good-lanyard";
  var CACHE_MAX_AGE_MS = 15 * 60 * 1000;
  var REQUEST_TIMEOUT_MS = 8000;
  var REST_POLL_MS = 5 * 60 * 1000;

  var FALLBACK_AVATAR = "/assets/fog-discord-mark.svg";
  var statusNames = {
    online: "Đang trực tuyến",
    idle: "Đang chờ",
    dnd: "Không làm phiền",
    offline: "Ngoại tuyến"
  };

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var avatar = $("avatar");
  var spotifyArt = $("spotify-art");

  // ---------------------------------------------------------------- helpers
  function isShortString(value, max) {
    return typeof value === "string" && value.length > 0 && value.length <= max;
  }

  function formatDuration(ms) {
    var seconds = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }

  var timeFormatter = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

  // --------------------------------------------------------------- clock UI
  var freezeSwitch = $("freeze-clock");
  var clockFace = document.querySelector(".clock-face");
  var timeEl = $("local-time");
  var dateEl = $("local-date");
  var clockModeEl = $("clock-mode");
  var frozenAt = null;
  var timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  var dateFmt = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  function paintClock() {
    var now = frozenAt || new Date();
    timeEl.textContent = timeFmt.format(now);
    timeEl.dateTime = now.toISOString();
    dateEl.textContent = dateFmt.format(now);
    if (clockFace) {
      var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
      clockFace.style.setProperty("--hour-angle", ((h % 12) * 30 + m * 0.5) + "deg");
      clockFace.style.setProperty("--minute-angle", (m * 6 + s * 0.1) + "deg");
      clockFace.style.setProperty("--second-angle", (s * 6) + "deg");
    }
    clockModeEl.textContent = frozenAt ? "Đã đóng băng tại thời điểm này" : "Đang chạy theo giờ thiết bị";
  }

  freezeSwitch.addEventListener("change", function () {
    frozenAt = freezeSwitch.checked ? new Date() : null;
    paintClock();
  });

  // Một timer duy nhất cho cả đồng hồ và tiến độ Spotify; dừng khi tab bị ẩn.
  var uiTimer = null;
  function startUiTimer() {
    if (uiTimer) return;
    paintClock();
    refreshSpotifyProgress();
    uiTimer = setInterval(function () {
      paintClock();
      refreshSpotifyProgress();
    }, 1000);
  }
  function stopUiTimer() {
    if (!uiTimer) return;
    clearInterval(uiTimer);
    uiTimer = null;
  }
  startUiTimer();
  paintClock();

  // ------------------------------------------------------------ spotify UI
  var spotifyTiming = null;

  function isValidSpotify(spotify) {
    if (spotify == null) return true;
    if (typeof spotify !== "object" || Array.isArray(spotify)) return false;
    for (var i = 0; i < 3; i += 1) {
      var field = ["song", "artist", "album"][i];
      if (spotify[field] != null && !isShortString(spotify[field], 256)) return false;
    }
    if (spotify.album_art_url != null) {
      if (typeof spotify.album_art_url !== "string" || spotify.album_art_url.length > 512) return false;
      try {
        var artUrl = new URL(spotify.album_art_url);
        if (artUrl.protocol !== "https:" || artUrl.hostname !== "i.scdn.co") return false;
      } catch (error) {
        return false;
      }
    }
    if (spotify.timestamps != null) {
      var times = spotify.timestamps;
      if (typeof times !== "object" || Array.isArray(times)) return false;
      if (times.start != null && !Number.isFinite(times.start)) return false;
      if (times.end != null && !Number.isFinite(times.end)) return false;
    }
    return true;
  }

  function refreshSpotifyProgress() {
    var progress = $("spotify-progress");
    var fill = $("spotify-progress-fill");
    if (!progress || !fill || !spotifyTiming) return;
    var total = spotifyTiming.end - spotifyTiming.start;
    if (!(total > 0)) {
      $("spotify-elapsed").textContent = "0:00";
      $("spotify-duration").textContent = "—:—";
      progress.setAttribute("aria-valuenow", "0");
      fill.style.width = "0%";
      return;
    }
    var elapsed = Math.max(0, Math.min(total, Date.now() - spotifyTiming.start));
    var percent = Math.round((elapsed / total) * 1000) / 10;
    $("spotify-elapsed").textContent = formatDuration(elapsed);
    $("spotify-duration").textContent = formatDuration(total);
    fill.style.width = percent + "%";
    progress.setAttribute("aria-valuenow", String(Math.round(percent)));
  }

  // Ảnh bìa có thể trùng URL giữa hai lần cập nhật → luôn gỡ handler cũ
  // trước khi gắn handler mới, nếu không handler tích tụ dần (rò rỉ + nháy ảnh).
  function setSpotifyArt(src) {
    spotifyArt.onerror = null;
    spotifyArt.onload = null;
    if (src) {
      spotifyArt.onerror = function () {
        spotifyArt.onerror = null;
        spotifyArt.src = FALLBACK_AVATAR;
      };
    }
    if (spotifyArt.getAttribute("src") !== src) spotifyArt.src = src || FALLBACK_AVATAR;
  }

  function renderSpotify(spotify) {
    var widget = $("spotify-widget");
    if (!widget) return;
    if (!spotify || !spotify.song || !spotify.artist || !isValidSpotify(spotify)) {
      spotifyTiming = null;
      widget.hidden = true;
      return;
    }
    widget.hidden = false;
    $("spotify-title").textContent = spotify.song;
    $("spotify-artist").textContent = spotify.artist;
    setSpotifyArt(spotify.album_art_url);

    var ts = spotify.timestamps;
    spotifyTiming = ts && Number.isFinite(ts.start) && Number.isFinite(ts.end)
      ? { start: ts.start, end: ts.end }
      : null;
    refreshSpotifyProgress();
  }

  // ---------------------------------------------------- presence validation
  var validStatuses = Object.keys(statusNames);

  function isValidPresenceData(data) {
    if (!data || typeof data !== "object") return false;
    var user = data.discord_user;
    if (!user || typeof user !== "object" || user.id !== DISCORD_ID) return false;
    if (validStatuses.indexOf(data.discord_status) === -1) return false;
    if (data.active_on_discord_mobile != null && typeof data.active_on_discord_mobile !== "boolean") return false;
    var textFields = ["username", "display_name", "global_name"];
    for (var i = 0; i < textFields.length; i += 1) {
      if (user[textFields[i]] != null && !isShortString(user[textFields[i]], 80)) return false;
    }
    if (user.avatar != null) {
      if (typeof user.avatar !== "string" || user.avatar.length > 128) return false;
      if (!/^(?:a_)?[A-Za-z0-9_]+$/.test(user.avatar)) return false;
    }
    if (data.spotify != null && !isValidSpotify(data.spotify)) return false;
    if (data.activities != null) {
      if (!Array.isArray(data.activities) || data.activities.length > 100) return false;
      var ok = data.activities.every(function (item) {
        return item && typeof item === "object" && !Array.isArray(item) &&
          (item.type == null || typeof item.type === "number") &&
          (item.name == null || isShortString(item.name, 128)) &&
          (item.state == null || isShortString(item.state, 256));
      });
      if (!ok) return false;
    }
    return true;
  }

  function avatarUrl(user) {
    if (!user || !user.avatar || !/^(?:a_)?[A-Za-z0-9_]{1,128}$/.test(user.avatar)) return FALLBACK_AVATAR;
    var format = user.avatar.indexOf("a_") === 0 ? "gif" : "png";
    // Discord CDN chỉ chấp nhận size là luỹ thừa của 2 (16…4096); 144 sẽ trả HTTP 400.
    return "https://cdn.discordapp.com/avatars/" + DISCORD_ID + "/" + user.avatar + "." + format + "?size=128";
  }

  function customStatus(data) {
    var activities = Array.isArray(data && data.activities) ? data.activities : [];
    for (var i = 0; i < activities.length; i += 1) {
      var item = activities[i];
      if (item && (item.type === 4 || item.name === "Custom Status")) return item.state || null;
    }
    return null;
  }

  // ------------------------------------------------------------ presence UI
  function paintPresence(data, isFallback) {
    var user = (data && data.discord_user) || {};
    var status = (data && data.discord_status) || "offline";
    var mobile = !isFallback && Boolean(data.active_on_discord_mobile);
    var name = user.display_name || user.global_name || user.username || "Trà Mèo";
    var custom = customStatus(data);

    if (root.dataset.discordState !== status) root.dataset.discordState = status;
    renderSpotify(isFallback ? null : data && data.spotify);

    $("display-name").textContent = name;
    $("handle").textContent = "@" + (user.username || "meo_mate");

    var nextAvatar = avatarUrl(user);
    if (avatar.getAttribute("src") !== nextAvatar) avatar.src = nextAvatar;
    avatar.alt = "Ảnh đại diện của " + name;

    var dot = $("presence-dot");
    var dotClass = "presence-dot " + (isFallback ? "offline" : status);
    if (dot.className !== dotClass) dot.className = dotClass;

    var visibleStatus = isFallback ? "Không thể xác minh" : (statusNames[status] || status);
    dot.setAttribute("aria-label", visibleStatus);
    $("status-label").textContent = visibleStatus + (mobile ? " · mobile" : "");

    $("custom-status").textContent = isFallback
      ? "Chưa thể tải trạng thái."
      : custom ? "“" + custom + "”" : "Chưa để lại lời nào.";

    var activities = Array.isArray(data && data.activities) ? data.activities : [];
    $("activity-value").textContent = isFallback
      ? "Đang chờ kết nối"
      : activities.length
        ? ((activities.find(function (i) { return i.type === 4; }) || activities[0] || {}).name || "Discord")
        : "Không hoạt động";

    $("connect-status").textContent = visibleStatus;

    var now = timeFormatter.format(new Date());
    $("sync-value").textContent = isFallback ? "Dữ liệu dự phòng" : "Đã cập nhật " + now;
    $("sync-value").classList.toggle("error-text", isFallback);

    var lastSync = $("last-sync");
    if (lastSync) lastSync.textContent = isFallback ? "Chờ kết nối" : "Lúc " + now;

    $("footer-state").textContent = isFallback
      ? "Lanyard / dùng dữ liệu dự phòng"
      : "Lanyard / " + (statusNames[status] || status).toLowerCase();
  }

  var fallbackData = {
    discord_user: { id: DISCORD_ID, display_name: "Trà Mèo", username: "meo_mate", avatar: null },
    discord_status: "offline",
    active_on_discord_mobile: false,
    activities: []
  };

  // -------------------------------------------------------------- REST + WSS
  var lastGoodPayload = null;
  var lastGoodSavedAt = 0;
  var syncInFlight = false;

  function readCachedPresence() {
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !Number.isFinite(cached.savedAt)) return null;
      var age = Date.now() - cached.savedAt;
      if (age >= 0 && age <= CACHE_MAX_AGE_MS && isValidPresenceData(cached.payload && cached.payload.data)) {
        return cached.payload;
      }
      localStorage.removeItem(CACHE_KEY);
      return null;
    } catch (error) {
      return null;
    }
  }

  function savePresence(data) {
    if (!isValidPresenceData(data)) return;
    var payload = { data: data };
    lastGoodPayload = payload;
    lastGoodSavedAt = Date.now();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: lastGoodSavedAt, payload: payload }));
    } catch (error) { /* storage có thể bị chặn */ }
  }

  function fetchPresence() {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);

    return fetch(LANYARD_URL, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (response.status === 429) {
        var wait = (Number(response.headers.get("Retry-After")) || 1) * 1000;
        var error = new Error("Lanyard rate limited");
        error.retryAfter = Math.min(wait, 8000);
        throw error;
      }
      if (!response.ok) throw new Error("Lanyard HTTP " + response.status);
      return response.json();
    }).then(function (payload) {
      if (!payload || payload.success !== true) throw new Error("Lanyard payload không hợp lệ");
      if (!isValidPresenceData(payload.data)) throw new Error("Lanyard payload không hợp lệ");
      return payload.data;
    }).finally(function () {
      clearTimeout(timeoutId);
    });
  }

  function syncPresence(attempt) {
    if (syncInFlight) return;
    syncInFlight = true;
    var tries = attempt == null ? 0 : attempt;

    fetchPresence().then(function (data) {
      savePresence(data);
      paintPresence(data, false);
      if (websocketLive) $("sync-value").textContent = "Realtime · " + timeFormatter.format(new Date());
    }).catch(function () {
      if (tries < 2) {
        syncInFlight = false;
        setTimeout(function () { syncPresence(tries + 1); }, 650 * Math.pow(2, tries));
        return;
      }
      var freshness = lastGoodPayload ? Date.now() - lastGoodSavedAt : Infinity;
      var cached = freshness <= CACHE_MAX_AGE_MS ? lastGoodPayload : readCachedPresence();
      if (cached) {
        lastGoodPayload = cached;
        paintPresence(cached.data, false);
        $("sync-value").textContent = "Dữ liệu cũ · " + timeFormatter.format(new Date());
        $("sync-value").classList.add("error-text");
        $("footer-state").textContent = "Lanyard / đang dùng dữ liệu gần nhất";
      } else {
        paintPresence(fallbackData, true);
        $("sync-value").textContent = "Chưa thể kết nối";
        $("sync-value").classList.add("error-text");
        $("footer-state").textContent = "Lanyard / ngoại tuyến tạm thời";
      }
    }).finally(function () {
      syncInFlight = false;
    });
  }

  var socket = null;
  var heartbeatTimer = null;
  var heartbeatMs = 0;
  var reconnectTimer = null;
  var reconnectAttempt = 0;
  var closing = false;
  var websocketLive = false;

  function clearHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    heartbeatMs = 0;
  }

  function startHeartbeat() {
    clearHeartbeat();
    if (!socket || socket.readyState !== WebSocket.OPEN || !heartbeatMs) return;
    heartbeatTimer = setInterval(function () {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 3, d: null }));
    }, heartbeatMs);
  }

  function scheduleReconnect() {
    if (closing || document.hidden || reconnectTimer) return;
    var wait = Math.min(30000, 1000 * Math.pow(2, Math.min(reconnectAttempt, 5)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connectSocket();
    }, wait);
  }

  function connectSocket() {
    if (closing || !("WebSocket" in window)) return;
    if (socket && socket.readyState !== WebSocket.CLOSED) return;
    try {
      socket = new WebSocket(LANYARD_SOCKET_URL);
    } catch (error) {
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", function () {
      websocketLive = true;
    });

    socket.addEventListener("message", function (event) {
      var message;
      try { message = JSON.parse(event.data); } catch (error) { return; }

      if (message.op === 1) {
        heartbeatMs = Math.max(5000, Number(message.d && message.d.heartbeat_interval) || 30000);
        startHeartbeat();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: DISCORD_ID } }));
        }
        return;
      }

      if (message.op === 0 && (message.t === "INIT_STATE" || message.t === "PRESENCE_UPDATE")) {
        var payload = message.d || {};
        var data = payload.discord_user ? payload : payload[DISCORD_ID];
        if (data && data.discord_user) {
          reconnectAttempt = 0;
          if (isValidPresenceData(data)) {
            savePresence(data);
            paintPresence(data, false);
            $("sync-value").textContent = "Realtime · " + timeFormatter.format(new Date());
            $("sync-value").classList.remove("error-text");
            $("footer-state").textContent = "Lanyard / realtime · " + (statusNames[data.discord_status] || data.discord_status).toLowerCase();
          }
        }
        return;
      }

      if (message.op === 9) {
        websocketLive = false;
        try { socket.close(); } catch (error) { /* đã đóng */ }
      }
    });

    socket.addEventListener("close", function () {
      websocketLive = false;
      clearHeartbeat();
      if (closing || document.hidden) return;
      syncPresence();
      scheduleReconnect();
    });

    socket.addEventListener("error", function () {
      websocketLive = false;
      try { socket.close(); } catch (error) { /* đã đóng */ }
    });
  }

  function disconnectSocket() {
    closing = true;
    clearHeartbeat();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { if (socket) socket.close(1000, "page hidden"); } catch (error) { /* đã đóng */ }
    socket = null;
  }

  // Ảnh đại diện: chỉ đổi sang fallback một lần, tránh vòng gắn handler.
  avatar.addEventListener("error", function () {
    if (avatar.dataset.fallback === "true") return;
    avatar.dataset.fallback = "true";
    avatar.src = FALLBACK_AVATAR;
    avatar.alt = "Ảnh đại diện mặc định của Trà Mèo";
  });

  // ------------------------------------------------------------- copy ID
  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(helper);
      helper.select();
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
      helper.remove();
      copied ? resolve() : reject(new Error("Clipboard unavailable"));
    });
  }

  $("copy-id").addEventListener("click", function () {
    var button = $("copy-id");
    var label = button.querySelector("span");
    var feedback = $("copy-feedback");
    var resetTimer = null;

    copyText(DISCORD_ID).then(function () {
      label.textContent = "Đã chép";
      button.setAttribute("aria-label", "Đã sao chép Discord ID");
      feedback.textContent = "Đã sao chép Discord ID";
    }).catch(function () {
      label.textContent = "Hãy chọn ID";
      feedback.textContent = "Không thể tự động sao chép. Discord ID là " + DISCORD_ID + ".";
    }).finally(function () {
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        label.textContent = "Sao chép";
        button.setAttribute("aria-label", "Sao chép Discord ID");
      }, 1600);
    });
  });

  // ------------------------------------------- pointer mist (fine pointers)
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var pageShell = document.querySelector(".page-shell");
  if (pageShell && window.matchMedia("(pointer: fine)").matches && !reduceMotion.matches) {
    var pointerFrame = 0;
    var pendingX = 0, pendingY = 0;
    var lastX = -1, lastY = -1;
    window.addEventListener("pointermove", function (event) {
      // Toạ độ phải chốt ngay: object event không nên bị giữ lại trong callback rAF.
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(function () {
        pointerFrame = 0;
        var x = Math.round((pendingX / window.innerWidth) * 100);
        var y = Math.round((pendingY / window.innerHeight) * 100);
        if (x === lastX && y === lastY) return;
        lastX = x; lastY = y;
        pageShell.style.setProperty("--mist-x", x + "%");
        pageShell.style.setProperty("--mist-y", y + "%");
      });
    }, { passive: true });
  }

  // ------------------------------------------------------------- bootstrap
  var cached = readCachedPresence();
  paintPresence(cached ? cached.data : fallbackData, !cached);
  if (cached) {
    $("sync-value").textContent = "Bộ nhớ đệm · " + timeFormatter.format(new Date());
    $("footer-state").textContent = "Lanyard / dữ liệu gần nhất";
  } else {
    $("sync-value").textContent = "Đang kết nối";
    $("footer-state").textContent = "Lanyard / đang kết nối";
  }

  syncPresence(0);
  connectSocket();

  var pollTimer = setInterval(function () {
    if (!document.hidden && !websocketLive) syncPresence(0);
  }, REST_POLL_MS);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopUiTimer();
      disconnectSocket();
      websocketLive = false;
    } else {
      closing = false;
      reconnectAttempt = 0;
      startUiTimer();
      paintClock();
      refreshSpotifyProgress();
      syncPresence(0);
      connectSocket();
    }
  });

  window.addEventListener("pagehide", function () {
    stopUiTimer();
    clearInterval(pollTimer);
    disconnectSocket();
  });
})();
