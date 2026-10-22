(function () {
  const R = window.Regie;
  const $ = (id) => document.getElementById(id);
  const state = {
    session: null,
    settings: null,
    shield: false,
    stream: null,
    followers: null,
    subs: null,
    messages: [],
    activity: [],
    filter: "all",
    badges: new Map(),
    connected: false,
    stick: true,
    armed: null,
    socket: null,
    reconnecting: false,
    generation: 0,
    pollTimer: 0,
    statTimer: 0,
    watchTimer: 0,
    toastTimer: 0,
    lastSocketAt: 0,
    keepaliveMs: 30000,
    busy: false,
  };

  const ICONS = {
    emote: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8.5 14c1.2 1.4 2.6 2 3.5 2s2.3-.6 3.5-2"/></svg>',
    follower: '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM5 19c1.2-2.4 3.4-3.5 7-3.5S17.8 16.6 19 19"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><path d="M12 3l2.2 4.6L19 8.2l-3.5 3.4.8 4.9L12 14.8 7.7 16.5l.8-4.9L5 8.2l4.8-.6z"/></svg>',
    unique: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
    slow: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-2.8 7.4-7 9-4.2-1.6-7-4.5-7-9V6z"/></svg>',
    ad: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 15V9l6 3z"/></svg>',
    raid: '<svg viewBox="0 0 24 24"><path d="M4 12h12M12 6l6 6-6 6"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13"/></svg>',
  };

  function readGlobal(name) {
    try {
      if (typeof twitchClientId !== "undefined" && name === "twitchClientId" && twitchClientId != null && twitchClientId !== "") return twitchClientId;
    } catch (e) {}
    try {
      if (typeof raidLogin !== "undefined" && name === "raidLogin" && raidLogin != null && raidLogin !== "") return raidLogin;
    } catch (e) {}
    try {
      const value = eval(name);
      if (value != null && value !== "") return value;
    } catch (e) {}
    try {
      if (Object.prototype.hasOwnProperty.call(window, name)) {
        const value = window[name];
        if (value != null && value !== "") return value;
      }
    } catch (e) {}
    return "";
  }

  function prop(name) {
    return readGlobal(name);
  }
  function clientId() {
    const fromIcue = R.cleanClientId(readGlobal("twitchClientId"));
    if (fromIcue) return fromIcue;
    return R.cleanClientId(loadStore().clientId);
  }

  function storageKey() {
    try {
      if (typeof uniqueId === "string" && uniqueId) return uniqueId;
    } catch (e) {}
    return "app.kandera.regie";
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveStore(patch) {
    const next = Object.assign(loadStore(), patch);
    localStorage.setItem(storageKey(), JSON.stringify(next));
    return next;
  }

  function clearStore() {
    localStorage.removeItem(storageKey());
  }

  function applyTheme() {
    const root = document.documentElement;
    const text = prop("textColor");
    const accent = prop("accentColor");
    const bg = prop("backgroundColor");
    if (text) root.style.setProperty("--text", text);
    if (accent) root.style.setProperty("--accent", accent);
    if (bg) root.style.setProperty("--bg", bg);
  }

  function toast(message) {
    const node = $("toast");
    node.hidden = !message;
    node.textContent = message || "";
    clearTimeout(state.toastTimer);
    if (message) state.toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
  }

  function openLink(url) {
    try {
      if (typeof pluginLinkprovider_initialized !== "undefined" && pluginLinkprovider_initialized && window.plugins && window.plugins.Linkprovider) {
        window.plugins.Linkprovider.open(url);
        return;
      }
    } catch (e) {}
    window.open(url, "_blank", "noopener");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function showGate(kind, extra) {
    $("desk").hidden = true;
    $("tabs").hidden = true;
    const gate = $("gate");
    gate.hidden = false;
    gate.replaceChildren();
    const title = el("h1", "", kind === "client" ? "Client ID fehlt" : "Mit Twitch verbinden");
    gate.append(title);
    if (kind === "client") {
      state.phase = "client";
      gate.append(el("p", "", "Client ID unten ins Feld oder in die iCUE-Einstellungen. App auf dev.twitch.tv, Redirect http://localhost, Typ Public. Kein Secret."));
      const input = document.createElement("input");
      input.placeholder = "Client ID";
      input.autocomplete = "off";
      input.value = loadStore().clientId || "";
      const save = el("button", "", "Übernehmen");
      save.type = "button";
      save.addEventListener("click", () => {
        const id = R.cleanClientId(input.value);
        if (!id) return toast("Client ID fehlt");
        saveStore({ clientId: id });
        reconcile();
      });
      const open = el("button", "ghost", "Konsole öffnen");
      open.type = "button";
      open.addEventListener("click", () => openLink("https://dev.twitch.tv/console/apps"));
      gate.append(input, save, open);
      return;
    }
    state.phase = kind;
    if (kind === "code") {
      gate.append(el("p", "", "Code auf twitch.tv/activate freigeben. Danach verbindet sich der eigene Chat von selbst."));
      gate.append(el("p", "code", extra.code));
      const button = el("button", "", "Im Browser öffnen");
      button.type = "button";
      button.addEventListener("click", () => openLink(extra.url));
      gate.append(button);
      return;
    }
    gate.append(el("p", "", extra || "Anmeldung starten. Es wird nur der eigene Kanal gelesen."));
    const button = el("button", "", "Anmelden");
    button.type = "button";
    button.addEventListener("click", () => startDeviceFlow());
    gate.append(button);
  }

  function showDesk() {
    $("gate").hidden = true;
    $("desk").hidden = false;
    if (window.matchMedia("(max-width: 980px)").matches) $("tabs").hidden = false;
    $("channel-name").textContent = state.session.displayName || state.session.login;
    renderRail();
    renderStats();
    renderFeed();
    renderPills();
    syncLog(true);
  }

  function button(key, title, subtitle, className) {
    const node = el("button", "act" + (className ? " " + className : ""));
    node.type = "button";
    node.dataset.act = key;
    node.innerHTML = ICONS[key] || "";
    const copy = el("span");
    copy.append(el("b", "", state.armed && state.armed.key === key ? "Sicher?" : title));
    copy.append(el("small", "", subtitle));
    node.append(copy);
    node.addEventListener("click", () => onAction(key));
    return node;
  }

  function renderRail() {
    const view = R.actionState(state.settings, state.shield);
    const rail = $("rail");
    rail.replaceChildren();
    rail.append(el("p", "kicker", "Aktionen"));
    rail.append(button("emote", "Emote", view.emoteLabel, view.emote ? "on" : ""));
    rail.append(button("follower", "Follower", view.followerLabel, view.follower ? "on" : ""));
    rail.append(button("subs", "Subs", view.subsLabel, view.subs ? "on" : ""));
    rail.append(button("unique", "Unique", view.uniqueLabel, view.unique ? "on" : ""));
    rail.append(button("slow", "Slow", view.slowLabel, view.slow ? "on" : ""));
    rail.append(button("shield", "Schild", view.shieldLabel, view.shield ? "on" : ""));
    rail.append(el("p", "kicker", "Senden"));
    rail.append(button("ad", "Werbung", "30–180s", ""));
    rail.append(button("raid", "Raid", R.normalizeLogin(prop("raidLogin")) || "Ziel wählen", ""));
    rail.append(button("clear", "Leeren", "Chat", "danger"));
    const spacer = el("div", "rail-gap");
    rail.append(spacer);
    const out = el("button", "ghost", "Abmelden");
    out.type = "button";
    out.addEventListener("click", logout);
    rail.append(out);
  }

  function renderStats() {
    const live = !!(state.stream && state.stream.type === "live");
    const uptime = live ? R.formatUptime(state.stream.started_at, Date.now()) : "nicht live";
    const cards = [
      ["Status", live ? "Live" : "Offline", uptime, live],
      ["Zuschauer", R.formatCount(live ? state.stream.viewer_count : 0), "gerade", false],
      ["Follower", R.formatCount(state.followers), "gesamt", false],
      ["Subs", R.formatCount(state.subs), "gesamt", false],
    ];
    const root = $("stats");
    root.replaceChildren();
    cards.forEach((card) => {
      const node = el("div", "stat" + (card[3] ? " live" : ""));
      node.append(el("p", "kicker", card[0]));
      node.append(el("b", "", card[1]));
      node.append(el("div", "sub", card[2]));
      root.append(node);
    });
    const pill = $("live-pill");
    pill.textContent = live ? R.formatCount(state.stream.viewer_count) : "Offline";
    pill.classList.toggle("on", live);
    $("conn").textContent = state.connected ? "verbunden" : "getrennt";
    $("conn").classList.toggle("on", state.connected);
  }

  function renderPills() {
    const root = $("mode-pills");
    root.replaceChildren();
    R.modePills(state.settings).forEach((label) => root.append(el("p", "pill", label)));
  }

  function renderFeed() {
    const filters = $("filters");
    filters.replaceChildren();
    [["all", "Alle"], ["follow", "Follows"], ["sub", "Subs"], ["bits", "Bits"], ["raid", "Raids"]].forEach((pair) => {
      const chip = el("button", "chip" + (state.filter === pair[0] ? " on" : ""), pair[1]);
      chip.type = "button";
      chip.addEventListener("click", () => { state.filter = pair[0]; renderFeed(); });
      filters.append(chip);
    });
    const feed = $("feed");
    const items = R.filterActivity(state.activity, state.filter);
    feed.replaceChildren();
    if (!items.length) {
      feed.append(el("p", "empty", "Noch nichts."));
      return;
    }
    items.forEach((item) => {
      const row = el("div", "item");
      row.append(el("i", "pip " + item.kind));
      const copy = el("div");
      copy.append(el("strong", "", item.title));
      if (item.detail) copy.append(el("span", "", item.detail));
      row.append(copy);
      row.append(el("time", "", R.formatAgo(item.at, Date.now())));
      feed.append(row);
    });
  }

  function fragmentNode(fragment) {
    if (fragment.type === "emote" && fragment.emote) {
      const animated = Array.isArray(fragment.emote.format) && fragment.emote.format.indexOf("animated") !== -1;
      const url = R.emoteUrl(fragment.emote.id, animated);
      if (!url) return document.createTextNode(fragment.text || "");
      const img = document.createElement("img");
      img.alt = fragment.text || "";
      img.src = url;
      img.addEventListener("error", () => {
        const fallback = R.emoteUrl(fragment.emote.id, false);
        if (img.src !== fallback) img.src = fallback;
      });
      return img;
    }
    if (fragment.type === "cheermote") return el("span", "cheer", fragment.text || "");
    if (fragment.type === "mention") return el("span", "name", fragment.text || "");
    return document.createTextNode(fragment.text || "");
  }

  function messageNode(message) {
    if (message.system) return el("div", "row system", message.text);
    const row = el("div", "row" + (message.deleted ? " deleted" : ""));
    row.dataset.id = message.id;
    const badges = el("span", "badges");
    message.badges.forEach((badge) => {
      const url = state.badges.get(badge.set + "/" + badge.id);
      if (!url) return;
      const img = document.createElement("img");
      img.alt = "";
      img.src = url;
      badges.append(img);
    });
    const body = el("div", "body");
    if (message.reply && message.reply.name) body.append(el("p", "reply", "Antwort an " + message.reply.name));
    const line = el("div");
    const name = el("span", "name", message.name);
    if (message.color) name.style.color = message.color;
    line.append(name, document.createTextNode(" "));
    message.fragments.forEach((fragment) => line.append(fragmentNode(fragment)));
    body.append(line);
    row.append(badges, body);
    return row;
  }

  function syncLog(force) {
    const log = $("log");
    if (force) log.replaceChildren();
    const seen = new Set();
    log.querySelectorAll("[data-id]").forEach((node) => seen.add(node.dataset.id));
    state.messages.forEach((message) => {
      const existing = message.id ? log.querySelector('[data-id="' + CSS.escape(message.id) + '"]') : null;
      if (existing) {
        existing.classList.toggle("deleted", !!message.deleted);
        return;
      }
      if (message.id && seen.has(message.id)) return;
      log.append(messageNode(message));
    });
    if (!state.messages.length && !log.childElementCount) log.append(el("p", "empty", "Wartet auf Nachrichten."));
    if (state.stick) log.scrollTop = log.scrollHeight;
  }

  function closeSheet() {
    $("sheet").hidden = true;
    $("sheet").replaceChildren();
  }

  function openSheet(title, body) {
    const sheet = $("sheet");
    sheet.hidden = false;
    sheet.replaceChildren();
    const card = el("div", "card");
    card.append(el("h2", "", title));
    card.append(body);
    const close = el("button", "ghost", "Schließen");
    close.type = "button";
    close.addEventListener("click", closeSheet);
    card.append(close);
    sheet.append(card);
  }

  function choiceSheet(title, choices, onPick) {
    const wrap = el("div", "choices");
    choices.forEach((choice) => {
      const node = el("button", "", choice.label);
      node.type = "button";
      node.addEventListener("click", () => { closeSheet(); onPick(choice.value); });
      wrap.append(node);
    });
    openSheet(title, wrap);
  }

  function arm(key, fn) {
    if (state.armed && state.armed.key === key) {
      clearTimeout(state.armed.timer);
      state.armed = null;
      renderRail();
      fn();
      return;
    }
    clearTimeout(state.armed && state.armed.timer);
    state.armed = {
      key,
      timer: setTimeout(() => { state.armed = null; renderRail(); }, 4000),
    };
    renderRail();
  }

  function idOf() {
    return state.session && state.session.userId;
  }

  async function helix(path, opts) {
    const options = opts || {};
    await ensureFresh();
    const headers = {
      Authorization: "Bearer " + state.session.accessToken,
      "Client-Id": clientId(),
    };
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch("https://api.twitch.tv/helix" + path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (response.status === 401 && !options.retried) {
      await refreshToken();
      return helix(path, Object.assign({}, options, { retried: true }));
    }
    if (response.status === 204) return null;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.message || "HTTP " + response.status);
    return json;
  }

  async function ensureFresh() {
    if (!state.session) throw new Error("Nicht angemeldet");
    if (!R.needsRefresh(state.session.expiresAt, Date.now())) return;
    await refreshToken();
  }

  async function refreshToken() {
    const body = new URLSearchParams({
      client_id: clientId(),
      grant_type: "refresh_token",
      refresh_token: state.session.refreshToken,
    });
    const response = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      logout();
      throw new Error(json.message || "Anmeldung abgelaufen");
    }
    acceptToken(json);
  }

  function acceptToken(token) {
    const previous = state.session || {};
    state.session = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || previous.refreshToken,
      expiresAt: Date.now() + (token.expires_in || 14400) * 1000,
      userId: previous.userId || "",
      login: previous.login || "",
      displayName: previous.displayName || "",
      clientId: clientId(),
    };
    saveStore({ session: state.session });
  }

  async function startDeviceFlow() {
    const id = clientId();
    if (!id) return showGate("client");
    const generation = ++state.generation;
    const response = await fetch("https://id.twitch.tv/oauth2/device", {
      method: "POST",
      body: new URLSearchParams({ client_id: id, scopes: R.SCOPES }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return toast(json.message || "Device-Code fehlgeschlagen");
    showGate("code", { code: json.user_code, url: json.verification_uri });
    pollDevice(json, generation, json.interval || 5);
  }

  function pollDevice(device, generation, wait) {
    clearTimeout(state.pollTimer);
    state.pollTimer = setTimeout(async () => {
      if (generation !== state.generation) return;
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId(),
          scopes: R.SCOPES,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      const json = await response.json().catch(() => ({}));
      const result = R.interpretPoll(response.status, json);
      if (result.type === "ok") {
        acceptToken(result.token);
        enter();
        return;
      }
      if (result.type === "pending") return pollDevice(device, generation, device.interval || wait);
      if (result.type === "slow") return pollDevice(device, generation, wait + 5);
      if (result.type === "denied") return showGate("login", "Freigabe abgelehnt.");
      if (result.type === "expired") return showGate("login", "Code abgelaufen.");
      toast(result.message);
      showGate("login", result.message);
    }, Math.max(5, wait) * 1000);
  }

  async function enter() {
    const me = await helix("/users");
    const user = me.data && me.data[0];
    if (!user) throw new Error("Twitch-User fehlt");
    state.session.userId = user.id;
    state.session.login = user.login;
    state.session.displayName = user.display_name;
    saveStore({ session: state.session });
    showDesk();
    await Promise.all([loadBadges(), refreshSettings(), refreshStats(), connectChat()]);
    clearInterval(state.statTimer);
    state.statTimer = setInterval(() => { refreshStats(); refreshSettings(); }, 20000);
  }

  async function loadBadges() {
    const [globalBadges, channelBadges] = await Promise.all([
      helix("/chat/badges/global"),
      helix("/chat/badges?broadcaster_id=" + idOf()),
    ]);
    [globalBadges, channelBadges].forEach((payload) => {
      ((payload && payload.data) || []).forEach((set) => {
        (set.versions || []).forEach((version) => {
          const url = R.safeBadgeUrl(version.image_url_2x || version.image_url_1x || "");
          if (url) state.badges.set(set.set_id + "/" + version.id, url);
        });
      });
    });
    syncLog(true);
  }

  async function refreshSettings() {
    try {
      const payload = await helix("/chat/settings?broadcaster_id=" + idOf() + "&moderator_id=" + idOf());
      state.settings = payload.data && payload.data[0];
    } catch (e) {
      toast(e.message);
    }
    try {
      const shield = await helix("/moderation/shield_mode?broadcaster_id=" + idOf() + "&moderator_id=" + idOf());
      state.shield = !!(shield.data && shield.data[0] && shield.data[0].is_active);
    } catch (e) {}
    renderRail();
    renderPills();
  }

  async function refreshStats() {
    try {
      const stream = await helix("/streams?user_id=" + idOf());
      state.stream = (stream.data && stream.data[0]) || null;
    } catch (e) {}
    try {
      const followers = await helix("/channels/followers?broadcaster_id=" + idOf());
      state.followers = followers.total;
    } catch (e) {}
    try {
      const subs = await helix("/subscriptions?broadcaster_id=" + idOf());
      state.subs = subs.total;
    } catch (e) {
      state.subs = null;
    }
    renderStats();
  }

  function closeSocket() {
    clearTimeout(state.watchTimer);
    if (state.socket) {
      state.socket.onclose = null;
      state.socket.close();
      state.socket = null;
    }
    state.connected = false;
  }

  function watchSocket() {
    clearTimeout(state.watchTimer);
    state.watchTimer = setTimeout(() => {
      if (Date.now() - state.lastSocketAt > state.keepaliveMs + 5000) connectChat();
      else watchSocket();
    }, state.keepaliveMs);
  }

  function connectChat() {
    closeSocket();
    const socket = new WebSocket("wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30");
    state.socket = socket;
    state.lastSocketAt = Date.now();
    socket.onmessage = (event) => onSocket(socket, event);
    socket.onclose = () => {
      state.connected = false;
      renderStats();
      if (state.socket === socket && state.session) setTimeout(connectChat, 2000);
    };
    watchSocket();
  }

  async function onSocket(socket, event) {
    state.lastSocketAt = Date.now();
    const message = JSON.parse(event.data);
    const type = message.metadata && message.metadata.message_type;
    if (type === "session_welcome") {
      state.keepaliveMs = ((message.payload.session.keepalive_timeout_seconds || 30) * 1000);
      if (state.reconnecting) {
        if (state.previousSocket) {
          state.previousSocket.onclose = null;
          state.previousSocket.close();
          state.previousSocket = null;
        }
        state.reconnecting = false;
        state.connected = true;
        state.socket = socket;
        renderStats();
        return;
      }
      await subscribeAll(message.payload.session.id);
      state.connected = true;
      renderStats();
      return;
    }
    if (type === "session_keepalive") return;
    if (type === "session_reconnect") {
      state.reconnecting = true;
      state.previousSocket = socket;
      socket.onclose = null;
      const next = new WebSocket(message.payload.session.reconnect_url);
      next.onmessage = (incoming) => onSocket(next, incoming);
      next.onclose = () => {
        state.connected = false;
        renderStats();
        if (state.socket === next && state.session) setTimeout(connectChat, 2000);
      };
      state.socket = next;
      return;
    }
    if (type === "revocation") {
      toast("Twitch hat ein Abo entzogen. Neu anmelden, falls der Chat stehen bleibt.");
      return;
    }
    if (type !== "notification") return;
    const sub = message.payload.subscription.type;
    const data = message.payload.event;
    if (sub === "channel.chat.message") addMessage(data);
    if (sub === "channel.chat.notification") addActivity(R.activityFromNotification(data));
    if (sub === "channel.follow") addActivity(R.activityFromFollow(data));
    if (sub === "channel.chat.message_delete") {
      state.messages = R.reduceChat(state.messages, { type: "delete", messageId: data.message_id });
      syncLog(false);
    }
    if (sub === "channel.chat.clear_user_messages") {
      state.messages = R.reduceChat(state.messages, { type: "clear-user", userId: data.target_user_id });
      syncLog(false);
    }
    if (sub === "channel.chat.clear") {
      state.messages = R.reduceChat(state.messages, { type: "clear", id: "clear-" + data.broadcaster_user_id + "-" + Date.now() });
      syncLog(false);
    }
  }

  function addMessage(event) {
    const message = R.parseMessage(event);
    state.messages = R.reduceChat(state.messages, { type: "message", message });
    if (message.cheer) addActivity(R.activityFromCheer(message, new Date().toISOString()));
    syncLog(false);
  }

  function addActivity(item) {
    state.activity = R.pushActivity(state.activity, item);
    renderFeed();
  }

  async function subscribeAll(sessionId) {
    const id = idOf();
    const chat = { broadcaster_user_id: id, user_id: id };
    const subs = [
      ["channel.chat.message", "1", chat],
      ["channel.chat.notification", "1", chat],
      ["channel.chat.clear", "1", chat],
      ["channel.chat.message_delete", "1", chat],
      ["channel.chat.clear_user_messages", "1", chat],
      ["channel.follow", "2", { broadcaster_user_id: id, moderator_user_id: id }],
    ];
    await Promise.all(subs.map(async (sub) => {
      try {
        await helix("/eventsub/subscriptions", {
          method: "POST",
          body: { type: sub[0], version: sub[1], condition: sub[2], transport: { method: "websocket", session_id: sessionId } },
        });
      } catch (e) {
        toast(sub[0] + ": " + e.message);
      }
    }));
  }

  async function patchSettings(action, arg, optimistic) {
    if (state.busy) return;
    state.busy = true;
    const previous = state.settings;
    state.settings = Object.assign({}, previous, optimistic);
    renderRail();
    renderPills();
    try {
      const payload = await helix("/chat/settings?broadcaster_id=" + idOf() + "&moderator_id=" + idOf(), {
        method: "PATCH",
        body: R.settingsBody(action, arg),
      });
      state.settings = payload.data[0];
    } catch (e) {
      state.settings = previous;
      toast(e.message);
    } finally {
      state.busy = false;
      renderRail();
      renderPills();
    }
  }

  function onAction(key) {
    const view = R.actionState(state.settings, state.shield);
    if (key === "emote") return patchSettings("emote", !view.emote, { emote_mode: !view.emote });
    if (key === "subs") return patchSettings("subs", !view.subs, { subscriber_mode: !view.subs });
    if (key === "unique") return patchSettings("unique", !view.unique, { unique_chat_mode: !view.unique });
    if (key === "follower") {
      if (view.follower) return patchSettings("follower-off", false, { follower_mode: false });
      return choiceSheet("Follower-Modus", R.FOLLOWER_MINUTES.map((minutes) => ({ label: R.formatDuration(minutes), value: minutes })), (minutes) => {
        patchSettings("follower-on", minutes, { follower_mode: true, follower_mode_duration: minutes });
      });
    }
    if (key === "slow") {
      if (view.slow) return patchSettings("slow-off", false, { slow_mode: false });
      return choiceSheet("Slow-Modus", R.SLOW_SECONDS.map((seconds) => ({ label: seconds + "s", value: seconds })), (seconds) => {
        patchSettings("slow-on", seconds, { slow_mode: true, slow_mode_wait_time: seconds });
      });
    }
    if (key === "shield") {
      if (view.shield) return setShield(false);
      return arm("shield", () => setShield(true));
    }
    if (key === "clear") return arm("clear", clearChat);
    if (key === "ad") return adSheet();
    if (key === "raid") return raidSheet();
  }

  async function setShield(active) {
    try {
      await helix("/moderation/shield_mode", {
        method: "PUT",
        body: { broadcaster_id: idOf(), moderator_id: idOf(), is_active: active },
      });
      state.shield = active;
      renderRail();
    } catch (e) {
      toast(e.message);
    }
  }

  async function clearChat() {
    try {
      await helix("/moderation/chat?broadcaster_id=" + idOf() + "&moderator_id=" + idOf(), { method: "DELETE" });
      toast("Chat geleert");
    } catch (e) {
      toast(e.message);
    }
  }

  async function startAd(length) {
    try {
      await helix("/channels/commercial", { method: "POST", body: { broadcaster_id: idOf(), length } });
      toast("Werbung " + length + "s gestartet");
    } catch (e) {
      toast(e.message);
    }
  }
  function adSheet() {
    const wrap = el("div", "choices");
    R.AD_LENGTHS.forEach((length) => {
      const node = el("button", "", length + "s");
      node.type = "button";
      node.dataset.len = String(length);
      node.addEventListener("click", () => {
        if (node.dataset.armed === "1") {
          closeSheet();
          startAd(length);
          return;
        }
        wrap.querySelectorAll("button").forEach((other) => {
          other.dataset.armed = "";
          other.textContent = other.dataset.len + "s";
        });
        node.dataset.armed = "1";
        node.textContent = "Sicher, " + length + "s?";
      });
      wrap.append(node);
    });
    openSheet("Werbung", wrap);
  }


  function raidSheet() {
    const wrap = el("div");
    const input = document.createElement("input");
    input.value = prop("raidLogin") || "";
    input.placeholder = "kanalname";
    input.autocomplete = "off";
    const go = el("button", "primary", "Raid starten");
    go.type = "button";
    go.addEventListener("click", () => {
      const login = R.normalizeLogin(input.value);
      if (!login) return toast("Kanalname fehlt");
      if (go.dataset.armed === "1" && go.dataset.login === login) {
        closeSheet();
        startRaid(login);
        return;
      }
      go.dataset.armed = "1";
      go.dataset.login = login;
      go.textContent = "Sicher, Raid nach " + login + "?";
    });
    const cancel = el("button", "ghost", "Raid abbrechen");
    cancel.type = "button";
    cancel.addEventListener("click", async () => {
      closeSheet();
      try {
        await helix("/raids?broadcaster_id=" + idOf(), { method: "DELETE" });
        toast("Raid abgebrochen");
      } catch (e) {
        toast(e.message);
      }
    });
    wrap.append(input, go, cancel);
    openSheet("Raid", wrap);
    input.focus();
  }

  async function startRaid(login) {
    try {
      const users = await helix("/users?login=" + encodeURIComponent(login));
      const target = users.data && users.data[0];
      if (!target) return toast("Kanal nicht gefunden");
      await helix("/raids", { method: "POST", body: { from_broadcaster_id: idOf(), to_broadcaster_id: target.id } });
      toast("Raid nach " + target.display_name + " gestartet");
    } catch (e) {
      toast(e.message);
    }
  }

  function logout() {
    const kept = clientId();
    state.generation += 1;
    state.entered = false;
    state.phase = "";
    clearTimeout(state.pollTimer);
    clearInterval(state.statTimer);
    closeSocket();
    clearStore();
    if (kept) saveStore({ clientId: kept });
    state.session = null;
    state.messages = [];
    state.activity = [];
    showGate(kept ? "login" : "client");
  }

  function demo() {
    state.session = { displayName: "Streamer", login: "streamer", userId: "1" };
    state.settings = { follower_mode: true, follower_mode_duration: 10, emote_mode: false, subscriber_mode: false, unique_chat_mode: false, slow_mode: false };
    state.stream = { type: "live", viewer_count: 1300, started_at: new Date(Date.now() - 5327000).toISOString() };
    state.followers = 12000;
    state.subs = 316;
    state.connected = true;
    const now = new Date().toISOString();
    state.messages = [
      { id: "1", userId: "a", name: "mira_k", color: "#c084fc", badges: [], fragments: [{ type: "text", text: "that flick was insane" }], deleted: false },
      { id: "2", userId: "b", name: "TTV_Jordan", color: "#7dd3fc", badges: [], fragments: [{ type: "text", text: "gg ez clap" }], deleted: false },
      { id: "3", userId: "c", name: "quietfox", color: "#86efac", badges: [], fragments: [{ type: "text", text: "first time here, love the vibe" }], deleted: false },
    ];
    state.activity = [
      { id: "r1", kind: "raid", title: "Kite raidet mit 120", detail: "", at: now },
      { id: "b1", kind: "bits", title: "Sam cheert 500 Bits", detail: "nice clutch", at: now },
      { id: "s1", kind: "sub", title: "mira_k verschenkt 5 Subs", detail: "", at: now },
    ];
    showDesk();
  }

  function reconcile() {
    applyTheme();
    if (state.demo || state.phase === "code") return;
    const id = clientId();
    if (!id) {
      if (state.phase !== "client") showGate("client");
      return;
    }
    if (state.session && state.session.clientId && state.session.clientId !== id) {
      logout();
      return;
    }
    if (state.entered) return;
    const stored = loadStore();
    if (stored.session && stored.session.clientId === id && stored.session.accessToken) {
      state.entered = true;
      state.phase = "desk";
      state.session = stored.session;
      enter().catch((error) => {
        state.entered = false;
        state.phase = "";
        toast(error.message);
        showGate("login", error.message);
      });
      return;
    }
    if (state.phase !== "login") showGate("login");
  }

  function boot() {
    if (new URLSearchParams(location.search).get("demo") === "1") {
      if (!state.demo) {
        state.demo = true;
        demo();
      }
      return;
    }
    reconcile();
    if (!state.propWatch) {
      state.propWatch = setInterval(() => {
        if (state.phase === "desk" || state.phase === "code" || state.phase === "login") {
          clearInterval(state.propWatch);
          state.propWatch = 0;
          return;
        }
        reconcile();
      }, 400);
    }
  }

  $("log").addEventListener("scroll", () => {
    const log = $("log");
    state.stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 48;
  });
  $("sheet").addEventListener("click", (event) => { if (event.target === $("sheet")) closeSheet(); });
  $("tabs").addEventListener("click", (event) => {
    const pane = event.target.dataset && event.target.dataset.pane;
    if (!pane) return;
    $("desk").dataset.pane = pane;
    $("tabs").querySelectorAll("button").forEach((button) => button.classList.toggle("on", button.dataset.pane === pane));
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSheet(); });

  window.icueEvents = { onICUEInitialized: boot, onDataUpdated: boot };
  icueEvents = window.icueEvents;
  if (typeof iCUE_initialized !== "undefined" && iCUE_initialized) boot();
  else window.addEventListener("DOMContentLoaded", boot);
})();
