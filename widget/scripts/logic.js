(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Regie = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCOPES = [
    "user:read:chat",
    "user:bot",
    "channel:bot",
    "moderator:read:chat_settings",
    "moderator:manage:chat_settings",
    "moderator:manage:chat_messages",
    "moderator:read:shield_mode",
    "moderator:manage:shield_mode",
    "moderator:read:followers",
    "channel:read:subscriptions",
    "channel:edit:commercial",
    "channel:manage:raids",
  ].join(" ");

  const AD_LENGTHS = [30, 60, 90, 120, 180];
  const SLOW_SECONDS = [3, 5, 10, 30, 60, 120];
  const FOLLOWER_MINUTES = [0, 10, 30, 60, 1440, 10080];
  const CHAT_CAP = 200;
  const ACTIVITY_CAP = 40;

  function formatCount(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    if (n < 1000) return String(Math.round(n));
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    if (n < 1000000) return Math.round(n / 1000) + "K";
    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  function cleanClientId(value) {
    return String(value == null ? "" : value).trim().replace(/^['"]+|['"]+$/g, "");
  }

  function formatUptime(startedAt, now) {
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start)) return "—";
    let seconds = Math.max(0, Math.floor((now - start) / 1000));
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hours + ":" + pad(minutes) + ":" + pad(seconds);
  }

  function formatAgo(iso, now) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return "";
    const seconds = Math.max(0, Math.floor((now - time) / 1000));
    if (seconds < 45) return "gerade";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return "vor " + minutes + " Min";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return "vor " + hours + " Std";
    return "vor " + Math.floor(hours / 24) + " T";
  }

  function formatDuration(minutes) {
    if (!minutes) return "sofort";
    if (minutes % 10080 === 0) return minutes / 10080 + " Wo";
    if (minutes % 1440 === 0) return minutes / 1440 + " T";
    if (minutes % 60 === 0) return minutes / 60 + " Std";
    return minutes + " Min";
  }

  function emoteUrl(id, animated) {
    if (!/^\d+$/.test(String(id))) return "";
    return "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/" + (animated ? "animated" : "static") + "/dark/2.0";
  }

  function safeBadgeUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return "";
      if (parsed.hostname !== "static-cdn.jtvnw.net" && !parsed.hostname.endsWith(".jtvnw.net")) return "";
      return parsed.toString();
    } catch (e) {
      return "";
    }
  }

  function needsRefresh(expiresAt, now, skewMs) {
    if (!expiresAt) return true;
    return expiresAt - now <= (skewMs == null ? 5 * 60 * 1000 : skewMs);
  }

  function normalizeLogin(value) {
    return String(value || "").trim().replace(/^@+/, "").toLowerCase();
  }

  function interpretPoll(status, body) {
    const message = String((body && (body.message || body.error)) || "").toLowerCase();
    if (status === 200 && body && body.access_token) return { type: "ok", token: body };
    if (message.includes("authorization_pending")) return { type: "pending" };
    if (message.includes("slow_down")) return { type: "slow" };
    if (message.includes("access_denied")) return { type: "denied" };
    if (message.includes("expired")) return { type: "expired" };
    return { type: "error", message: (body && body.message) || "HTTP " + status };
  }

  function settingsBody(action, arg) {
    if (action === "emote") return { emote_mode: !!arg };
    if (action === "follower-on") return { follower_mode: true, follower_mode_duration: arg };
    if (action === "follower-off") return { follower_mode: false };
    if (action === "subs") return { subscriber_mode: !!arg };
    if (action === "unique") return { unique_chat_mode: !!arg };
    if (action === "slow-on") return { slow_mode: true, slow_mode_wait_time: arg };
    if (action === "slow-off") return { slow_mode: false };
    return null;
  }

  function modePills(settings) {
    if (!settings) return [];
    const pills = [];
    if (settings.follower_mode) pills.push(settings.follower_mode_duration ? "Follower " + formatDuration(settings.follower_mode_duration) : "Follower");
    if (settings.subscriber_mode) pills.push("Subs only");
    if (settings.emote_mode) pills.push("Emote only");
    if (settings.unique_chat_mode) pills.push("Unique");
    if (settings.slow_mode) pills.push("Slow " + (settings.slow_mode_wait_time || 0) + "s");
    return pills;
  }

  function actionState(settings, shield) {
    const current = settings || {};
    return {
      emote: !!current.emote_mode,
      follower: !!current.follower_mode,
      subs: !!current.subscriber_mode,
      unique: !!current.unique_chat_mode,
      slow: !!current.slow_mode,
      shield: !!shield,
      followerLabel: current.follower_mode ? (current.follower_mode_duration ? formatDuration(current.follower_mode_duration) : "An") : "Aus",
      slowLabel: current.slow_mode ? (current.slow_mode_wait_time || 0) + "s" : "Aus",
      emoteLabel: current.emote_mode ? "An" : "Aus",
      subsLabel: current.subscriber_mode ? "An" : "Aus",
      uniqueLabel: current.unique_chat_mode ? "An" : "Aus",
      shieldLabel: shield ? "An" : "Aus",
    };
  }

  function parseMessage(event) {
    const fragments = event.message && Array.isArray(event.message.fragments) ? event.message.fragments : [];
    return {
      id: event.message_id,
      userId: event.chatter_user_id,
      name: event.chatter_user_name || event.chatter_user_login || "?",
      color: event.color || "",
      badges: Array.isArray(event.badges) ? event.badges.map((badge) => ({ set: badge.set_id, id: badge.id })) : [],
      fragments: fragments.length ? fragments : [{ type: "text", text: (event.message && event.message.text) || "" }],
      reply: event.reply ? { name: event.reply.parent_user_name || "", text: event.reply.parent_message_body || "" } : null,
      cheer: event.cheer && event.cheer.bits ? event.cheer.bits : 0,
      deleted: false,
      system: false,
    };
  }

  function reduceChat(messages, event) {
    const list = messages.slice();
    if (event.type === "message") {
      if (!event.message || !event.message.id) return list;
      if (list.some((item) => item.id === event.message.id)) return list;
      list.push(event.message);
      return list.slice(-CHAT_CAP);
    }
    if (event.type === "delete") {
      return list.map((item) => (item.id === event.messageId ? Object.assign({}, item, { deleted: true }) : item));
    }
    if (event.type === "clear-user") {
      return list.map((item) => (item.userId === event.userId ? Object.assign({}, item, { deleted: true }) : item));
    }
    if (event.type === "clear") {
      const cleared = list.map((item) => Object.assign({}, item, { deleted: true }));
      cleared.push({ id: event.id || "clear", system: true, text: "Chat geleert", deleted: false });
      return cleared.slice(-CHAT_CAP);
    }
    return list;
  }

  function activityFromFollow(event) {
    if (!event || !event.user_id) return null;
    return {
      id: "follow-" + event.user_id + "-" + (event.followed_at || ""),
      kind: "follow",
      title: (event.user_name || event.user_login) + " folgt",
      detail: "",
      at: event.followed_at || "",
    };
  }

  function activityFromCheer(message, at) {
    if (!message || !message.cheer) return null;
    return {
      id: "cheer-" + message.id,
      kind: "bits",
      title: message.name + " cheert " + formatCount(message.cheer) + " Bits",
      detail: "",
      at: at || "",
    };
  }

  function activityFromNotification(event) {
    if (!event) return null;
    const name = event.chatter_user_name || event.chatter_user_login || "Jemand";
    const at = event.notice_time || "";
    const id = "notice-" + (event.message_id || name + "-" + (event.notice_type || "") + "-" + at);
    const type = event.notice_type;
    if (type === "sub") {
      return { id, kind: "sub", title: name + " hat abonniert", detail: "", at };
    }
    if (type === "resub") {
      const months = event.resub && event.resub.cumulative_months;
      return { id, kind: "sub", title: months ? name + " resub · " + months + " Monate" : name + " resub", detail: (event.message && event.message.text) || "", at };
    }
    if (type === "sub_gift") {
      const who = (event.sub_gift && event.sub_gift.recipient_user_name) || "?";
      return { id, kind: "sub", title: name + " verschenkt einen Sub an " + who, detail: "", at };
    }
    if (type === "community_sub_gift") {
      const total = event.community_sub_gift && event.community_sub_gift.total;
      return { id, kind: "sub", title: name + " verschenkt " + (total || "?") + " Subs", detail: "", at };
    }
    if (type === "raid") {
      const viewers = event.raid && event.raid.viewer_count;
      const who = (event.raid && event.raid.user_name) || name;
      return { id, kind: "raid", title: viewers != null ? who + " raidet mit " + formatCount(viewers) : who + " raidet", detail: "", at };
    }
    if (type === "announcement") {
      return { id, kind: "other", title: name + " · Ankündigung", detail: (event.message && event.message.text) || "", at };
    }
    return { id, kind: "other", title: name + " · " + (type || "Hinweis"), detail: (event.message && event.message.text) || "", at };
  }

  function pushActivity(list, item) {
    if (!item || !item.id) return list;
    if (list.some((entry) => entry.id === item.id)) return list;
    return [item].concat(list).slice(0, ACTIVITY_CAP);
  }

  function filterActivity(list, filter) {
    if (!filter || filter === "all") return list;
    return list.filter((item) => item.kind === filter);
  }

  return {
    SCOPES,
    cleanClientId,
    SLOW_SECONDS,
    FOLLOWER_MINUTES,
    formatCount,
    formatUptime,
    formatAgo,
    formatDuration,
    emoteUrl,
    safeBadgeUrl,
    needsRefresh,
    normalizeLogin,
    interpretPoll,
    settingsBody,
    modePills,
    actionState,
    parseMessage,
    reduceChat,
    activityFromFollow,
    activityFromCheer,
    activityFromNotification,
    pushActivity,
    filterActivity,
  };
});
