import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/content/x.test.mjs → repo root is two levels up.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
import { gzipSync } from "node:zlib";
import {
  utcRangeForLocalDay,
  localDateOf,
  isBot,
  isPageView,
  summarize,
  botName,
  formatReport,
  collect,
  readLogLines,
} from "../daily-report.mjs";
import { siteOf, snapshotFromLines, writeTrafficSnapshot } from "./traffic-board.mjs";

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

test("当天累计的报文标明截至时刻，完整日不标", () => {
  const summary = summarize([], { from: "2026-10-22T16:00:00.000Z", to: "2026-10-23T06:00:00.000Z" });
  const published = { total: 0, byLocale: {}, titles: [] };
  const partial = formatReport({
    date: "2026-10-23",
    range: ["2026-10-22T16:00:00.000Z", "2026-10-23T06:00:00.000Z"],
    summary,
    published,
    logFrom: null,
    partial: true,
  });
  assert.match(partial, /截至 06:00 UTC/);

  const whole = formatReport({
    date: "2026-10-22",
    range: ["2026-10-21T16:00:00.000Z", "2026-10-22T16:00:00.000Z"],
    summary,
    published,
    logFrom: null,
  });
  assert.doesNotMatch(whole, /截至/);
});

// --- streaming reader -----------------------------------------------------------------------
// The report used to readFileSync + gunzipSync + split the whole rotated log set into one array.
// These cases pin the streaming replacement: same totals, gz handled, and no crash on a huge log.

const mkdtemp = (prefix) => fs.mkdtempSync(join(os.tmpdir(), prefix));

function line(entry) {
  return JSON.stringify(entry);
}

test("流式读取普通日志与 gz 日志，结果和整数组聚合一致", async () => {
  const dir = mkdtemp("stratat-report-");
  try {
    const rows = [
      { t: "2026-10-22T01:00:00.000Z", uri: "/zh", ip: "1.1.1.1", ua: "Mozilla/5.0 Chrome", status: 200 },
      { t: "2026-10-22T02:00:00.000Z", uri: "/zh", ip: "1.1.1.1", ua: "Mozilla/5.0 Chrome", status: 200 },
      { t: "2026-10-22T03:00:00.000Z", uri: "/en", ip: "2.2.2.2", ua: "Googlebot/2.1", status: 200 },
      { t: "2026-10-22T04:00:00.000Z", uri: "/_next/static/x.js", ip: "1.1.1.1", ua: "Mozilla/5.0 Chrome", status: 200 },
      { t: "2026-10-21T23:59:59.000Z", uri: "/zh", ip: "3.3.3.3", ua: "Mozilla/5.0 Chrome", status: 200 },
    ];
    // Rotated gz file holds the older rows, plain file holds the newer ones.
    fs.writeFileSync(join(dir, "strata-access.log.1.gz"), gzipSync(rows.slice(0, 2).map(line).join("\n") + "\n"));
    fs.writeFileSync(join(dir, "strata-access.log"), rows.slice(2).map(line).join("\n") + "\n");

    const range = { from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z" };
    const streamed = await collect({ ...range, dir });
    const arrayed = summarize(rows.map(line), range);

    assert.equal(streamed.summary.total, arrayed.total);
    assert.equal(streamed.summary.humans.requests, arrayed.humans.requests);
    assert.equal(streamed.summary.humans.ips, arrayed.humans.ips);
    assert.equal(streamed.summary.bots.requests, arrayed.bots.requests);
    assert.equal(streamed.summary.bots.ips, arrayed.bots.ips);
    assert.deepEqual(
      Object.fromEntries(streamed.summary.bots.byName),
      Object.fromEntries(arrayed.bots.byName),
    );
    assert.deepEqual(Object.fromEntries(streamed.summary.statuses), Object.fromEntries(arrayed.statuses));
    assert.equal(streamed.logFrom, "2026-10-22");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("空日志目录不抛错，统计为零", async () => {
  const dir = mkdtemp("stratat-report-empty-");
  try {
    const out = await collect({ from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z", dir });
    assert.equal(out.summary.total, 0);
    assert.equal(out.summary.humans.requests, 0);
    assert.equal(out.summary.bots.requests, 0);
    assert.equal(out.logFrom, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("日志目录不存在时按空处理", async () => {
  const out = await collect({
    from: "2026-10-21T16:00:00.000Z",
    to: "2026-10-22T16:00:00.000Z",
    dir: join(os.tmpdir(), "stratat-report-does-not-exist"),
  });
  assert.equal(out.summary.total, 0);
  assert.equal(out.logFrom, null);
});

test("跨 chunk 的多字节字符不被拆成替换字符", async () => {
  const dir = mkdtemp("stratat-report-utf8-");
  try {
    // createReadStream's default highWaterMark is 64KiB. Place a 3-byte char so bytes 65534-65536
    // straddle that boundary; a naive chunk.toString() would emit U+FFFD here.
    const head = "A".repeat(65534) + "中";
    const body = "\n" + 'B'.repeat(10) + "\n";
    fs.writeFileSync(join(dir, "strata-access.log"), head + body);

    const lines = [];
    for await (const line of readLogLines({ dir })) lines.push(line);
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes("中"), "多字节字符应完整保留");
    assert.ok(!lines[0].includes("\uFFFD"), "不应出现替换字符");
    assert.equal(lines[1], "B".repeat(10));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CRLF 行尾被剥掉，末行无换行也能读到", async () => {
  const dir = mkdtemp("stratat-report-crlf-");
  try {
    const a = line({ t: "2026-10-22T01:00:00.000Z", uri: "/zh", ip: "1.1.1.1", ua: "Mozilla/5.0 Chrome", status: 200 });
    const b = line({ t: "2026-10-22T02:00:00.000Z", uri: "/en", ip: "2.2.2.2", ua: "Googlebot/2.1", status: 200 });
    fs.writeFileSync(join(dir, "strata-access.log"), `${a}\r\n${b}`); // CRLF, no trailing newline

    const out = await collect({ from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z", dir });
    assert.equal(out.summary.malformed, 0, "带 \\r 的行不应算坏行");
    assert.equal(out.summary.total, 2);
    assert.equal(out.summary.humans.requests, 1);
    assert.equal(out.summary.bots.requests, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("空文件不阻塞也不抛错", async () => {
  const dir = mkdtemp("stratat-report-zero-");
  try {
    fs.writeFileSync(join(dir, "strata-access.log"), "");
    const out = await collect({ from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z", dir });
    assert.equal(out.summary.total, 0);
    assert.equal(out.logFrom, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("损坏的 gz 被跳过，后面的文件照常统计", async () => {
  const dir = mkdtemp("stratat-report-badgz-");
  try {
    // Truncated gzip: valid header, no trailer. This is what a rotation caught mid-write looks like.
    fs.writeFileSync(join(dir, "strata-access.log.2.gz"), gzipSync(line({
      t: "2026-10-22T00:00:00.000Z", uri: "/zh", ip: "9.9.9.9", ua: "Mozilla/5.0 Chrome", status: 200,
    })).subarray(0, 12));
    fs.writeFileSync(join(dir, "strata-access.log"), line({
      t: "2026-10-22T01:00:00.000Z", uri: "/en", ip: "8.8.8.8", ua: "Mozilla/5.0 Chrome", status: 200,
    }) + "\n");

    const out = await collect({
      from: "2026-10-21T16:00:00.000Z",
      to: "2026-10-22T16:00:00.000Z",
      dir,
    });
    // The bad file is skipped; the good file is still counted.
    assert.equal(out.summary.total, 1);
    assert.equal(out.summary.humans.requests, 1);
    assert.equal(out.summary.pages.get("/en"), 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("单个文件打不开时跳过，其余文件照常统计", async () => {
  const dir = mkdtemp("stratat-report-enoent-");
  try {
    // A dangling symlink is the reachable version of "file vanished between readdir and open",
    // which is exactly what logrotate does to a live file.
    fs.symlinkSync(join(dir, "gone.log"), join(dir, "strata-access.log.2"));
    fs.writeFileSync(join(dir, "strata-access.log"), line({
      t: "2026-10-22T01:00:00.000Z", uri: "/zh", ip: "1.1.1.1", ua: "Mozilla/5.0 Chrome", status: 200,
    }) + "\n");

    const out = await collect({ from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z", dir });
    assert.equal(out.summary.total, 1, "打不开的文件不应让整份报告失败");
    assert.equal(out.summary.humans.requests, 1);
    // ENOENT is a rotation race, not a fault: it must not fail the run.
    assert.deepEqual(out.failures, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("目录不可读时返回零而不是抛错", async (t) => {
  // A regular file where a directory is expected makes `readdirSync` throw ENOTDIR. Unlike a
  // chmod-based test this fails the same way for root, so the assertion is always real.
  const dir = mkdtemp("stratat-report-notdir-");
  const asFile = join(dir, "not-a-dir");
  try {
    fs.writeFileSync(asFile, "");
    const out = await collect({ from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z", dir: asFile });
    assert.equal(out.summary.total, 0);
    assert.equal(out.logFrom, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  t.diagnostic("ENOTDIR path covered deterministically");
});

test("同编号 .gz 与普通文件的读取顺序是确定的", async () => {
  const dir = mkdtemp("stratat-report-tie-");
  try {
    const plain = line({ t: "2026-10-22T02:00:00.000Z", uri: "/plain", ip: "1.1.1.1", ua: "Mozilla/5.0 Chrome", status: 200 });
    const gz = line({ t: "2026-10-22T01:00:00.000Z", uri: "/gz", ip: "2.2.2.2", ua: "Mozilla/5.0 Chrome", status: 200 });
    fs.writeFileSync(join(dir, "strata-access.log.2"), plain + "\n");
    fs.writeFileSync(join(dir, "strata-access.log.2.gz"), gzipSync(gz + "\n"));

    const seen = [];
    for await (const l of readLogLines({ dir })) seen.push(JSON.parse(l).uri);
    // Same rotation number: `.2` sorts before `.2.gz`, deterministically on every run.
    // (Totals and `logFrom` are order-independent, so the tie-break only has to be stable.)
    assert.deepEqual(seen, ["/plain", "/gz"], "编号相同则按名称排序，不依赖 readdirSync 顺序");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("真实故障(损坏 gz)进 failures，轮转竞态不进", async () => {
  const dir = mkdtemp("stratat-report-failures-");
  try {
    // Not gzip at all = real corruption, not the truncated-header rotation race.
    fs.writeFileSync(join(dir, "strata-access.log.3.gz"), "definitely not gzip payload");
    fs.symlinkSync(join(dir, "gone.log"), join(dir, "strata-access.log.2")); // ENOENT: race
    fs.writeFileSync(join(dir, "strata-access.log"), line({
      t: "2026-10-22T01:00:00.000Z", uri: "/en", ip: "8.8.8.8", ua: "Mozilla/5.0 Chrome", status: 200,
    }) + "\n");

    const out = await collect({ from: "2026-10-21T16:00:00.000Z", to: "2026-10-22T16:00:00.000Z", dir });
    assert.equal(out.failures.length, 1, "只有损坏 gz 算真实故障");
    assert.equal(out.failures[0].file, "strata-access.log.3.gz");
    assert.equal(out.failures[0].code, "Z_DATA_ERROR");
    assert.equal(out.summary.total, 1, "好文件仍被统计");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("可读目录但内容损坏时，CLI 以非零退出码并上报 failures", async () => {
  const dir = mkdtemp("stratat-report-exit-");
  try {
    fs.writeFileSync(join(dir, "strata-access.log.1.gz"), "not a gzip file at all");
    fs.writeFileSync(join(dir, "strata-access.log"), line({
      t: "2026-10-22T01:00:00.000Z", uri: "/en", ip: "8.8.8.8", ua: "Mozilla/5.0 Chrome", status: 200,
    }) + "\n");

    const r = spawnSync(process.execPath, ["scripts/daily-report.mjs", "--date", "2026-10-22", "--json"], {
      cwd: repoRoot,
      env: { ...process.env, STRATA_LOG_DIR: dir },
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0, `exit code should be non-zero, got ${r.status}`);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.failures.length, 1);
    assert.equal(payload.failures[0].file, "strata-access.log.1.gz");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("只有轮转竞态时 CLI 退出码为 0", async () => {
  const dir = mkdtemp("stratat-report-exit0-");
  try {
    fs.symlinkSync(join(dir, "gone.log"), join(dir, "strata-access.log.4"));
    fs.writeFileSync(join(dir, "strata-access.log"), line({
      t: "2026-10-22T01:00:00.000Z", uri: "/en", ip: "8.8.8.8", ua: "Mozilla/5.0 Chrome", status: 200,
    }) + "\n");

    const r = spawnSync(process.execPath, ["scripts/daily-report.mjs", "--date", "2026-10-22", "--json"], {
      cwd: repoRoot,
      env: { ...process.env, STRATA_LOG_DIR: dir },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `rotation race must not fail the run; stderr=${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout).failures, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("大日志(5 万行)流式读完且计数正确", async () => {
  const dir = mkdtemp("stratat-report-big-");
  try {
    const N = 50_000;
    const chunk = [];
    for (let i = 0; i < N; i++) {
      chunk.push(line({
        t: "2026-10-22T05:00:00.000Z",
        uri: i % 2 === 0 ? "/zh" : "/en",
        ip: `10.0.${(i % 200)}.1`,
        ua: i % 5 === 0 ? "Googlebot/2.1" : "Mozilla/5.0 Chrome",
        status: 200,
      }));
    }
    fs.writeFileSync(join(dir, "strata-access.log"), chunk.join("\n") + "\n");

    const out = await collect({
      from: "2026-10-21T16:00:00.000Z",
      to: "2026-10-22T16:00:00.000Z",
      dir,
    });
    assert.equal(out.summary.total, N);
    assert.equal(out.summary.bots.requests + out.summary.humans.requests, N);
    assert.equal(out.summary.bots.requests, N / 5);
    assert.equal(out.summary.humans.requests, N - N / 5);
    assert.equal(out.summary.pages.get("/zh"), N / 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const HUMAN = "Mozilla/5.0 Chrome/131";
// 2026-10-22 18:00 in Asia/Shanghai, still that local day.
const SNAP_NOW = Date.parse("2026-10-22T10:00:00.000Z");

test("路径首段归入语言站点，其余归其他", () => {
  assert.equal(siteOf("/zh"), "zh");
  assert.equal(siteOf("/zh/gpus/rtx-4090"), "zh");
  assert.equal(siteOf("/en"), "en");
  assert.equal(siteOf("/ja/a"), "ja");
  assert.equal(siteOf("/de"), "de");
  assert.equal(siteOf("/fr/x"), "fr");
  assert.equal(siteOf("/es"), "es");
  assert.equal(siteOf("/pt/y"), "pt");
  assert.equal(siteOf("/"), "other");
  assert.equal(siteOf("/downloads/app"), "other");
});

test("流量快照按站点分开人机，排除静态与 RSC，跨两天分桶", () => {
  const snap = snapshotFromLines([
    { t: "2026-10-21T02:00:00.000Z", ip: "203.0.113.10", uri: "/zh", ua: HUMAN, status: 200 },
    { t: "2026-10-21T03:00:00.000Z", ip: "203.0.113.10", uri: "/zh/gpus", ua: HUMAN, status: 200 },
    { t: "2026-10-22T02:00:00.000Z", ip: "203.0.113.10", uri: "/zh", ua: HUMAN, status: 200 },
    { t: "2026-10-22T03:00:00.000Z", ip: "203.0.113.11", uri: "/en", ua: "Googlebot/2.1", status: 200 },
    { t: "2026-10-22T04:00:00.000Z", ip: "203.0.113.12", uri: "/_next/static/x.js", ua: HUMAN, status: 200 },
    { t: "2026-10-22T04:01:00.000Z", ip: "203.0.113.12", uri: "/_next/data/build/en.json", ua: HUMAN, status: 200 },
    { t: "not-json", ip: "203.0.113.99", uri: "/zh", ua: HUMAN },
  ], { now: SNAP_NOW, dayCount: 2 });

  const zh = snap.sites.find((site) => site.site === "zh");
  const en = snap.sites.find((site) => site.site === "en");
  assert.equal(zh.today.humanPv, 1);
  assert.equal(zh.today.humanIps, 1);
  assert.equal(zh.days7.humanPv, 3);
  assert.equal(zh.days7.humanIps, 1, "同一 IP 跨天只算一个独立 IP");
  assert.equal(en.today.botPv, 1);
  assert.equal(en.today.humanPv, 0);
  assert.equal(snap.sites.reduce((sum, site) => sum + site.days7.humanPv + site.days7.botPv, 0), 4);
  assert.deepEqual(snap.trend.map((day) => day.date), ["2026-10-21", "2026-10-22"]);
  assert.equal(snap.trend[0].humanPv, 2);
  assert.equal(snap.trend[1].botPv, 1);
  assert.equal(JSON.stringify(snap).includes("203.0.113"), false);
});

test("独立 IP 到上限后停止增长，但浏览量继续计", () => {
  const snap = snapshotFromLines([
    { t: "2026-10-22T02:00:00.000Z", ip: "203.0.113.1", uri: "/ja", ua: HUMAN, status: 200 },
    { t: "2026-10-22T02:01:00.000Z", ip: "203.0.113.2", uri: "/ja", ua: HUMAN, status: 200 },
    { t: "2026-10-22T02:02:00.000Z", ip: "203.0.113.1", uri: "/ja", ua: HUMAN, status: 200 },
  ], { now: SNAP_NOW, dayCount: 1, ipCap: 1 });
  const ja = snap.sites.find((site) => site.site === "ja");
  assert.equal(ja.today.humanPv, 3);
  assert.equal(ja.today.humanIps, 1);
  assert.equal(ja.today.humanIpsCapped, true);
});

test("热门页最多 8 条，溢出后浏览量仍然精确，爬虫最多 4 个", () => {
  const lines = [];
  for (let i = 0; i < 10; i++) {
    for (let n = 0; n < 10 - i; n++) {
      lines.push({ t: "2026-10-22T02:00:00.000Z", ip: "203.0.113.7", uri: `/de/p${i}`, ua: HUMAN, status: 200 });
    }
  }
  for (let n = 0; n < 5; n++) lines.push({ t: "2026-10-22T03:00:00.000Z", ip: "198.51.100.1", uri: "/de", ua: "Googlebot/2.1", status: 200 });
  for (let n = 0; n < 4; n++) lines.push({ t: "2026-10-22T03:00:01.000Z", ip: "198.51.100.2", uri: "/de", ua: "Mozilla/5.0 (compatible; Baiduspider/2.0)", status: 200 });
  for (let n = 0; n < 3; n++) lines.push({ t: "2026-10-22T03:00:02.000Z", ip: "198.51.100.3", uri: "/de", ua: "Mozilla/5.0 (compatible; bingbot/2.0)", status: 200 });
  for (let n = 0; n < 2; n++) lines.push({ t: "2026-10-22T03:00:03.000Z", ip: "198.51.100.4", uri: "/de", ua: "Bytespider", status: 200 });
  lines.push({ t: "2026-10-22T03:00:04.000Z", ip: "198.51.100.5", uri: "/de", ua: "curl/8.5.0", status: 200 });
  const snap = snapshotFromLines(lines, { now: SNAP_NOW, dayCount: 1, pageCap: 3 });
  const de = snap.sites.find((site) => site.site === "de");
  assert.equal(de.pages.length, 3, "pageCap 只有 3，热门列表不能超过它，也不能超过 8");
  assert.deepEqual(de.pages.map(([uri]) => uri), ["/de/p0", "/de/p1", "/de/p2"]);
  assert.equal(de.pageOverflow, 28);
  assert.equal(de.today.humanPv, 55);
  assert.equal(de.bots.length, 4);
  assert.deepEqual(de.bots.map(([name]) => name), ["Googlebot", "Baidu", "Bing", "ByteDance"]);
  assert.equal(JSON.stringify(snap).includes("198.51.100"), false);
  assert.equal(JSON.stringify(snap).includes("203.0.113"), false);

  const many = [];
  for (let i = 0; i < 10; i++) {
    many.push({ t: "2026-10-22T02:00:00.000Z", ip: "203.0.113.8", uri: `/pt/p${i}`, ua: HUMAN, status: 200 });
  }
  const top = snapshotFromLines(many, { now: SNAP_NOW, dayCount: 1 });
  assert.equal(top.sites.find((site) => site.site === "pt").pages.length, 8);
});

test("快照文件是完整 JSON，且不含访客 IP", async () => {
  const dir = mkdtemp("stratat-traffic-");
  const file = join(dir, "traffic-board.json");
  try {
    fs.writeFileSync(join(dir, "strata-access.log"), [
      line({ t: "2026-10-22T02:00:00.000Z", ip: "203.0.113.50", uri: "/fr", ua: HUMAN, status: 200 }),
      line({ t: "2026-10-22T02:05:00.000Z", ip: "203.0.113.51", uri: "/_next/static/app.js", ua: HUMAN, status: 200 }),
    ].join("\n") + "\n");
    const snap = await writeTrafficSnapshot({
      dir,
      file,
      now: SNAP_NOW,
      dayCount: 1,
    });
    const text = fs.readFileSync(file, "utf8");
    assert.equal(text.includes("203.0.113"), false);
    assert.equal(JSON.parse(text).sites.find((site) => site.site === "fr").today.humanPv, snap.sites.find((site) => site.site === "fr").today.humanPv);
    assert.equal(snap.sites.find((site) => site.site === "fr").today.humanPv, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
