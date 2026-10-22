const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../widget/scripts/logic.js");

test("formatCount matches the dashboard scale", () => {
  assert.equal(R.formatCount(316), "316");
  assert.equal(R.formatCount(1300), "1.3K");
  assert.equal(R.formatCount(12000), "12K");
  assert.equal(R.formatCount(null), "—");
});

test("formatUptime is h:mm:ss", () => {
  const start = "2026-10-22T10:00:00.000Z";
  const now = Date.parse("2026-10-22T11:28:47.000Z");
  assert.equal(R.formatUptime(start, now), "1:28:47");
});

test("settings body only sends the field being changed", () => {
  assert.deepEqual(R.settingsBody("emote", true), { emote_mode: true });
  assert.deepEqual(R.settingsBody("follower-on", 10), { follower_mode: true, follower_mode_duration: 10 });
  assert.deepEqual(R.settingsBody("follower-off"), { follower_mode: false });
  assert.deepEqual(R.settingsBody("slow-on", 30), { slow_mode: true, slow_mode_wait_time: 30 });
  assert.deepEqual(R.settingsBody("slow-off"), { slow_mode: false });
  assert.equal(R.settingsBody("nope"), null);
});

test("device poll distinguishes pending from success", () => {
  assert.equal(R.interpretPoll(400, { message: "authorization_pending" }).type, "pending");
  assert.equal(R.interpretPoll(400, { message: "slow_down" }).type, "slow");
  assert.equal(R.interpretPoll(400, { message: "access_denied" }).type, "denied");
  assert.equal(R.interpretPoll(200, { access_token: "abc", expires_in: 14400 }).type, "ok");
});

test("chat reduce deletes, clears, and caps duplicates", () => {
  const first = R.parseMessage({
    message_id: "m1",
    chatter_user_id: "u1",
    chatter_user_name: "mira",
    color: "#fff",
    badges: [{ set_id: "subscriber", id: "12" }],
    message: { text: "hi", fragments: [{ type: "text", text: "hi" }] },
  });
  let list = R.reduceChat([], { type: "message", message: first });
  list = R.reduceChat(list, { type: "message", message: first });
  assert.equal(list.length, 1);
  list = R.reduceChat(list, { type: "delete", messageId: "m1" });
  assert.equal(list[0].deleted, true);
  list = R.reduceChat(list, { type: "clear", id: "c1" });
  assert.equal(list.at(-1).system, true);
  assert.equal(list.at(-1).text, "Chat geleert");
});

test("activity maps follows, cheers, raids, and subs without duplicates", () => {
  const follow = R.activityFromFollow({ user_id: "9", user_name: "quietfox", followed_at: "2026-10-22T12:00:00Z" });
  assert.equal(follow.kind, "follow");
  assert.equal(follow.title, "quietfox folgt");
  const cheer = R.activityFromCheer({ id: "m", name: "Sam", cheer: 500 }, "2026-10-22T12:00:00Z");
  assert.equal(cheer.kind, "bits");
  const raid = R.activityFromNotification({
    notice_type: "raid",
    chatter_user_name: "Kite",
    message_id: "n1",
    raid: { user_name: "Kite", viewer_count: 120 },
  });
  assert.equal(raid.title, "Kite raidet mit 120");
  const sub = R.activityFromNotification({ notice_type: "community_sub_gift", chatter_user_name: "mira_k", message_id: "n2", community_sub_gift: { total: 5 } });
  assert.equal(sub.kind, "sub");
  let feed = R.pushActivity([], follow);
  feed = R.pushActivity(feed, follow);
  assert.equal(feed.length, 1);
  assert.deepEqual(R.filterActivity(feed.concat([cheer, raid]), "bits").map((item) => item.id), [cheer.id]);
});

test("login and emote url stay strict", () => {
  assert.equal(R.normalizeLogin(" @Kite "), "kite");
  assert.equal(R.emoteUrl("62836", false), "https://static-cdn.jtvnw.net/emoticons/v2/62836/static/dark/2.0");
  assert.equal(R.emoteUrl("nope", false), "");
  assert.equal(R.safeBadgeUrl("https://static-cdn.jtvnw.net/badges/v1/x/2"), "https://static-cdn.jtvnw.net/badges/v1/x/2");
  assert.equal(R.safeBadgeUrl("http://static-cdn.jtvnw.net/badges/v1/x/2"), "");
  assert.equal(R.needsRefresh(1_000, 500, 100), false);
  assert.equal(R.needsRefresh(1_000, 950, 100), true);
});

test("mode pills reflect only active chat modes", () => {
  assert.deepEqual(R.modePills({ follower_mode: true, follower_mode_duration: 10, emote_mode: true, subscriber_mode: false, unique_chat_mode: false, slow_mode: false }), ["Follower 10 Min", "Emote only"]);
});
