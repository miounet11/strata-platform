import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { collectBoard, type DayRow } from "@/lib/dashboard/data";
import { SESSION_COOKIE, loadSecret, pathMatches, verifySession } from "@/lib/dashboard/secret";

/** Reads files the pipeline rewrites several times a day, so it must never be cached. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Content board",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const KIND_LABEL: Record<string, string> = {
  hardware: "硬件实机",
  task: "任务场景",
  compare: "横向对比",
  troubleshoot: "故障排查",
  local: "本地部署",
  concept: "概念解释",
};

const LOCALE_LABEL: Record<string, string> = {
  en: "英语",
  zh: "中文",
  ja: "日语",
  de: "德语",
  fr: "法语",
  es: "西语",
  pt: "葡语",
};

function n(value: number) {
  return value.toLocaleString("en-US");
}

function pct(part: number, total: number) {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function dayClass(day: DayRow, today: string) {
  if (day.date < today) return "muted";
  if (day.date === today) return "today";
  return "";
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { key } = await params;
  const secret = loadSecret();
  // No secret file means the board does not exist. Every other hidden path 404s the same way,
  // so a scanner cannot tell "wrong path" from "feature switched off".
  if (!secret || !pathMatches(secret, key)) notFound();

  const jar = await cookies();
  const signedIn = verifySession(secret, jar.get(SESSION_COOKIE)?.value);
  const { e } = await searchParams;

  if (!signedIn) {
    return (
      <main className="login">
        <h1>内容看板</h1>
        <p className="sub">输入密码后查看规划与产出状态。</p>
        <form method="post" action={`/b/${key}/login`}>
          <label htmlFor="password">密码</label>
          <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
          <button type="submit">进入</button>
          {e ? <p className="error">密码不正确。</p> : null}
        </form>
      </main>
    );
  }

  const board = collectBoard();
  const { plan, pipeline, media } = board;

  return (
    <main>
      <div className="top">
        <div>
          <h1>内容看板</h1>
          <p className="sub">
            数据核对于 {new Date(board.checkedAt).toLocaleString("zh-CN", { hour12: false })} · 计划生成{" "}
            {plan.generatedAt ? new Date(plan.generatedAt).toLocaleString("zh-CN", { hour12: false }) : "未知"}
          </p>
        </div>
        <form method="post" action={`/b/${key}/logout`}>
          <button type="submit">退出</button>
        </form>
      </div>

      <div className="stats">
        <div className="stat">
          <b>{n(plan.total)}</b>
          <span>计划文章总数 · {plan.days} 天 · {plan.locales.length} 种语言</span>
        </div>
        <div className="stat">
          <b>{n(pipeline.produced)}</b>
          <span>已生成正文 · {plan.total ? pct(pipeline.produced, plan.total) : "—"}</span>
        </div>
        <div className="stat">
          <b className={pipeline.live ? "good" : ""}>{n(pipeline.live)}</b>
          <span>已发布上线</span>
        </div>
        <div className="stat">
          <b className="warn">{n(pipeline.waitingImage)}</b>
          <span>缺配图，被发布门控拦住</span>
        </div>
        <div className="stat">
          <b>{n(pipeline.missingArticle)}</b>
          <span>尚未生成正文</span>
        </div>
        <div className="stat">
          <b>{n(media.guideAssets)}</b>
          <span>Guide 配图 · 清单共 {n(media.assets)} 项</span>
        </div>
      </div>

      {board.problems.length ? (
        <section>
          <h2>数据源异常</h2>
          <ul>
            {board.problems.map((problem) => (
              <li key={problem} className="bad">
                {problem}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>内容架构 · 按类型</h2>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>类型</th>
                <th className="num">计划</th>
                <th className="num">已生成</th>
                <th className="num">已上线</th>
                <th className="num">可发布</th>
                <th className="num">缺配图</th>
                <th className="num">生成率</th>
              </tr>
            </thead>
            <tbody>
              {board.kinds.map((row) => (
                <tr key={row.kind}>
                  <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                  <td className="num">{n(row.planned)}</td>
                  <td className="num">{n(row.produced)}</td>
                  <td className="num">{n(row.live)}</td>
                  <td className="num">{n(row.ready)}</td>
                  <td className={`num ${row.waitingImage ? "warn" : "muted"}`}>{n(row.waitingImage)}</td>
                  <td className="num muted">{pct(row.produced, row.planned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>内容架构 · 按语言</h2>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>语言</th>
                <th className="num">计划</th>
                <th className="num">已生成</th>
                <th className="num">待发布</th>
                <th className="num">已上线</th>
                <th className="num">可发布</th>
                <th className="num">缺配图</th>
              </tr>
            </thead>
            <tbody>
              {board.locales.map((row) => (
                <tr key={row.locale}>
                  <td>
                    {LOCALE_LABEL[row.locale] ?? row.locale} <span className="muted">/{row.locale}</span>
                  </td>
                  <td className="num">{n(row.planned)}</td>
                  <td className="num">{n(row.produced)}</td>
                  <td className="num">{n(row.scheduled)}</td>
                  <td className="num">{n(row.live)}</td>
                  <td className="num">{n(row.ready)}</td>
                  <td className={`num ${row.waitingImage ? "warn" : "muted"}`}>{n(row.waitingImage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>每日发布规划</h2>
        <p className="sub">
          计划从 {plan.firstDay ?? "—"} 到 {plan.lastDay ?? "—"}，共 {plan.days} 天；发布门控要求正文已生成且配图已入库。
        </p>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th className="num">当日计划</th>
                <th className="num">已生成</th>
                <th className="num">已上线</th>
                <th className="num">可发布</th>
                <th className="num">缺配图</th>
                <th>语言分布</th>
              </tr>
            </thead>
            <tbody>
              {board.schedule.map((day) => (
                <tr key={day.date} className={dayClass(day, board.today)}>
                  <td>
                    {day.date}
                    {day.date === board.today ? " · 今天" : ""}
                  </td>
                  <td className="num">{n(day.total)}</td>
                  <td className="num">{n(day.produced)}</td>
                  <td className="num">{n(day.live)}</td>
                  <td className="num">{n(day.ready)}</td>
                  <td className={`num ${day.waitingImage ? "warn" : "muted"}`}>{n(day.waitingImage)}</td>
                  <td className="muted">{Object.keys(day.byLocale).sort().join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>计划覆盖</h2>
        <div className="wrap">
          <table>
            <tbody>
              <tr>
                <th>机型</th>
                <td>{plan.rigs.join(" · ") || "—"}</td>
              </tr>
              <tr>
                <th>计划生成时间</th>
                <td>{plan.generatedAt ?? "—"}</td>
              </tr>
              <tr>
                <th>已生成 / 待发布 / 已上线</th>
                <td>
                  {n(pipeline.produced)} / {n(pipeline.scheduled)} / {n(pipeline.live)}
                </td>
              </tr>
              <tr>
                <th>数据源</th>
                <td>{board.sources.map((source) => `${source.label} (${source.status})`).join("；") || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>最近发布日志</h2>
        <div className="logs">
          {board.logs.map((log) => (
            <div key={log.file}>
              <div className="log-title">{log.file}</div>
              <pre>{log.lines.join("\n")}</pre>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
