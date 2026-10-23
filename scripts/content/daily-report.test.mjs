import test from "node:test";
import assert from "node:assert/strict";
import {
  utcRangeForLocalDay,
  localDateOf,
  isBot,
  isPageView,
  summarize,
  botName,
  formatReport,
} from "../daily-report.mjs";

const TZ = "Asia/Shanghai";

test("本地日 → UTC 范围跨过 8 小时偏移", () => {
  const [from, to] = utcRangeForLocalDay("2026-10-22", TZ);
  assert.equal(from, "2026-10-21T16:00:00.000Z");
  assert.equal(to, "2026-10-22T16:00:00.000Z");
});

test("UTC 时间点换算回本地日期", () => {
  // 16:00Z 正好是上海次日 00:00
  assert.equal(localDateOf(Date.parse("2026-10-21T16:00:00Z"), TZ), "2026-10-22");
  assert.equal(localDateOf(Date.parse("2026-10-21T15:59:59Z"), TZ), "2026-10-21");
});

test("爬虫判定覆盖搜索、AI 抓取与脚本", () => {
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBot("Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)"), true);
  assert.equal(isBot("curl/8.5.0"), true);
  assert.equal(isBot("python-requests/2.31.0"), true);
  assert.equal(isBot(""), true, "空 UA 归为自动流量：浏览器一定会发 UA");
  assert.equal(
    isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"),
    false,
  );
});

test("静态资源与预取不算页面请求", () => {
  assert.equal(isPageView("/en/pulls"), true);
  assert.equal(isPageView("/zh/gpus/rtx-4090"), true);
  assert.equal(isPageView("/_next/static/chunks/main.js"), false);
  assert.equal(isPageView("/en/gpus?_rsc=abc"), true, "带 query 的路径仍是页面，uri 字段本身没有 query");
  assert.equal(isPageView("/favicon.ico"), false);
  assert.equal(isPageView("/sitemap.xml"), false);
  assert.equal(isPageView("/media/guide-x/hero.webp"), false);
});

test("同一 IP 多次请求只算一个独立 IP，人机分开统计", () => {
  const lines = [
    { t: "2026-10-22T02:00:00+00:00", ip: "1.1.1.1", uri: "/en", status: 200, ua: "Mozilla/5.0 Chrome/131" },
    { t: "2026-10-22T02:05:00+00:00", ip: "1.1.1.1", uri: "/en/gpus", status: 200, ua: "Mozilla/5.0 Chrome/131" },
    { t: "2026-10-22T03:00:00+00:00", ip: "2.2.2.2", uri: "/en", status: 200, ua: "Googlebot/2.1" },
    { t: "2026-10-22T03:01:00+00:00", ip: "2.2.2.2", uri: "/zh", status: 200, ua: "Googlebot/2.1" },
    { t: "2026-10-22T03:02:00+00:00", ip: "3.3.3.3", uri: "/_next/static/x.js", status: 200, ua: "Mozilla/5.0 Chrome/131" },
  ].map((o) => JSON.stringify(o));

  const s = summarize(lines, {
    from: "2026-10-21T16:00:00.000Z",
    to: "2026-10-22T16:00:00.000Z",
  });

  assert.equal(s.humans.requests, 2);
  assert.equal(s.humans.ips, 1);
  assert.equal(s.bots.requests, 2);
  assert.equal(s.bots.ips, 1);
  assert.equal(s.pages.get("/en"), 2);
  assert.equal(s.pages.has("/_next/static/x.js"), false);
});

test("区间外的请求不计入", () => {
  const lines = [
    JSON.stringify({ t: "2026-10-21T15:59:59+00:00", ip: "9.9.9.9", uri: "/en", status: 200, ua: "Chrome/131" }),
    JSON.stringify({ t: "2026-10-22T16:00:00+00:00", ip: "9.9.9.9", uri: "/en", status: 200, ua: "Chrome/131" }),
  ];
  const s = summarize(lines, { from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z" });
  assert.equal(s.total, 0, "左闭右开：起点前与终点当刻都不算");
});

test("坏行不吞掉整份报表", () => {
  const lines = [
    "not json at all",
    JSON.stringify({ t: "2026-10-22T02:00:00+00:00", ip: "1.1.1.1", uri: "/en", status: 200, ua: "Chrome/131" }),
  ];
  const s = summarize(lines, { from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z" });
  assert.equal(s.malformed, 1);
  assert.equal(s.humans.requests, 1);
});

test("爬虫归类到可读名字", () => {
  assert.equal(botName("Googlebot/2.1"), "Googlebot");
  assert.equal(botName("OAI-SearchBot/1.4"), "OpenAI");
  assert.equal(botName("Mozilla/5.0 ExaSearchBot/1.0"), "Exa");
  assert.equal(botName("curl/8.5.0"), "脚本");
  assert.equal(botName("SomethingUnknown/1.0"), "其他爬虫");
});

test("报表写明口径，不把独立 IP 说成人数", () => {
  const text = formatReport({
    date: "2026-10-22",
    range: ["2026-10-21T16:00:00.000Z", "2026-10-22T16:00:00.000Z"],
    summary: summarize([], { from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z" }),
    published: { total: 0, byLocale: {}, titles: [] },
    logFrom: "2026-10-23",
  });
  assert.match(text, /独立 IP ≠ 人数/);
  assert.match(text, /日志始于 2026-10-23/);
  assert.match(text, /当天发帖 0 篇/);
});
