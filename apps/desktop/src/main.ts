import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type CheckStatus = "pass" | "warn" | "fail";

type EnvCheckItem = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fixHint?: string;
};

type EnvReport = {
  os: string;
  arch: string;
  items: EnvCheckItem[];
  readyForInstall: boolean;
  readyForDeploy: boolean;
};

type AppSettings = {
  strataDir: string;
  stratatRepoDir: string;
  deployHost: string;
  deployUser: string;
  sshIdentityFile: string;
  siteUrl: string;
  apiUrl: string;
};

const app = document.querySelector("#app")!;
app.innerHTML = `
  <div class="app">
    <header>
      <h1>Strata 控制台</h1>
      <p>环境检测 · 一键安装引擎 · 一键部署站点 · 本地设置</p>
    </header>
    <nav>
      <button type="button" data-tab="env" class="active">环境检测</button>
      <button type="button" data-tab="install">一键安装</button>
      <button type="button" data-tab="deploy">一键部署</button>
      <button type="button" data-tab="settings">设置</button>
    </nav>
    <main>
      <section id="panel-env" class="panel active">
        <div class="summary" id="env-summary"></div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="scan-env">重新检测</button>
          <button type="button" class="btn" id="open-ui">打开 Strata UI (127.0.0.1:8080)</button>
        </div>
        <ul class="check-list" id="check-list"></ul>
      </section>
      <section id="panel-install" class="panel">
        <p style="color: var(--muted); margin-top: 0;">
          克隆 <a href="https://github.com/Niko1221/Strata" style="color: var(--accent);">Niko1221/Strata</a> 并启动
          <code>setup.sh</code> / <code>START-HERE.bat</code>（新终端中执行）。
        </p>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="install-btn">一键安装 Strata</button>
        </div>
      </section>
      <section id="panel-deploy" class="panel">
        <p style="color: var(--muted); margin-top: 0;">
          从本机 stratat  monorepo 执行 <code>deploy/sync-and-deploy.sh</code>（rsync + VPS 上 build）。
          请先在「设置」里填写仓库路径与 SSH 主机。
        </p>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="deploy-btn">一键部署 stratat.com</button>
        </div>
      </section>
      <section id="panel-settings" class="panel">
        <form class="form-grid" id="settings-form">
          <label>Strata 安装目录
            <input name="strataDir" autocomplete="off" />
          </label>
          <label>Stratat 仓库根目录（含 apps/www）
            <input name="stratatRepoDir" autocomplete="off" placeholder="/path/to/stratat" />
          </label>
          <label>部署 VPS 主机
            <input name="deployHost" autocomplete="off" placeholder="203.0.113.10" />
          </label>
          <label>SSH 用户
            <input name="deployUser" autocomplete="off" />
          </label>
          <label>SSH 私钥路径（可选）
            <input name="sshIdentityFile" autocomplete="off" placeholder="~/.ssh/id_ed25519" />
          </label>
          <label>站点 URL
            <input name="siteUrl" autocomplete="off" />
          </label>
          <label>API URL
            <input name="apiUrl" autocomplete="off" />
          </label>
        </form>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="save-settings">保存并应用</button>
        </div>
      </section>
      <pre id="log"></pre>
    </main>
  </div>
`;

const logEl = document.querySelector("#log")!;
const log = (msg: string) => {
  logEl.textContent += `${msg}\n`;
};

function setTab(name: string) {
  document.querySelectorAll("nav button").forEach((b) => {
    b.classList.toggle("active", (b as HTMLButtonElement).dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${name}`);
  });
}

document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => setTab((btn as HTMLButtonElement).dataset.tab!));
});

function badge(status: CheckStatus) {
  return `<span class="badge ${status}">${status}</span>`;
}

async function loadSettingsIntoForm() {
  if (!isTauri) return;
  const s = await invoke<AppSettings>("get_settings");
  const form = document.querySelector("#settings-form") as HTMLFormElement;
  (form.elements.namedItem("strataDir") as HTMLInputElement).value = s.strataDir;
  (form.elements.namedItem("stratatRepoDir") as HTMLInputElement).value = s.stratatRepoDir;
  (form.elements.namedItem("deployHost") as HTMLInputElement).value = s.deployHost;
  (form.elements.namedItem("deployUser") as HTMLInputElement).value = s.deployUser;
  (form.elements.namedItem("sshIdentityFile") as HTMLInputElement).value = s.sshIdentityFile;
  (form.elements.namedItem("siteUrl") as HTMLInputElement).value = s.siteUrl;
  (form.elements.namedItem("apiUrl") as HTMLInputElement).value = s.apiUrl;
}

function readSettingsFromForm(): AppSettings {
  const form = document.querySelector("#settings-form") as HTMLFormElement;
  return {
    strataDir: (form.elements.namedItem("strataDir") as HTMLInputElement).value.trim(),
    stratatRepoDir: (form.elements.namedItem("stratatRepoDir") as HTMLInputElement).value.trim(),
    deployHost: (form.elements.namedItem("deployHost") as HTMLInputElement).value.trim(),
    deployUser: (form.elements.namedItem("deployUser") as HTMLInputElement).value.trim(),
    sshIdentityFile: (form.elements.namedItem("sshIdentityFile") as HTMLInputElement).value.trim(),
    siteUrl: (form.elements.namedItem("siteUrl") as HTMLInputElement).value.trim(),
    apiUrl: (form.elements.namedItem("apiUrl") as HTMLInputElement).value.trim(),
  };
}

async function renderEnv(report: EnvReport) {
  const summary = document.querySelector("#env-summary")!;
  summary.innerHTML = `
    <span><strong>${report.os}</strong> / ${report.arch}</span>
    <span>安装就绪: <strong>${report.readyForInstall ? "是" : "否"}</strong></span>
    <span>部署就绪: <strong>${report.readyForDeploy ? "是" : "否"}</strong></span>
  `;
  const list = document.querySelector("#check-list")!;
  list.innerHTML = report.items
    .map(
      (i) => `
    <li>
      <div class="row"><strong>${i.label}</strong>${badge(i.status)}</div>
      <p class="detail">${i.detail}</p>
      ${i.fixHint ? `<p class="hint">${i.fixHint}</p>` : ""}
    </li>`,
    )
    .join("");

  (document.querySelector("#install-btn") as HTMLButtonElement).disabled =
    !report.readyForInstall || !isTauri;
  (document.querySelector("#deploy-btn") as HTMLButtonElement).disabled =
    !report.readyForDeploy || !isTauri;
}

async function scanEnv() {
  if (!isTauri) {
    log("请在 Strata Desktop (Tauri) 中运行以检测本机环境。");
    return;
  }
  log("正在检测环境…");
  const report = await invoke<EnvReport>("scan_environment");
  await renderEnv(report);
  log("环境检测完成。");
}

document.querySelector("#scan-env")!.addEventListener("click", () => void scanEnv());

document.querySelector("#open-ui")!.addEventListener("click", async () => {
  if (isTauri) {
    try {
      await invoke("open_strata_ui");
    } catch {
      window.open("http://127.0.0.1:8080", "_blank");
    }
  } else {
    window.open("http://127.0.0.1:8080", "_blank");
  }
});

document.querySelector("#install-btn")!.addEventListener("click", async () => {
  log("开始一键安装…");
  if (!isTauri) {
    log("需要桌面应用才能启动安装脚本。");
    return;
  }
  try {
    const out = await invoke<string>("install_strata_one_click");
    log(out);
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#deploy-btn")!.addEventListener("click", async () => {
  log("开始一键部署…");
  if (!isTauri) {
    log("需要桌面应用才能调用 deploy 脚本。");
    return;
  }
  try {
    const out = await invoke<string>("deploy_stratat_one_click");
    log(out);
  } catch (e) {
    log(String(e));
  }
});

document.querySelector("#save-settings")!.addEventListener("click", async () => {
  if (!isTauri) {
    log("预览模式无法保存设置。");
    return;
  }
  const settings = readSettingsFromForm();
  await invoke("save_settings", { settings });
  const msg = await invoke<string>("apply_site_settings");
  log(msg);
  await scanEnv();
});

void (async () => {
  if (isTauri) {
    await loadSettingsIntoForm();
    await scanEnv();
  } else {
    log("浏览器预览 — 请用 pnpm tauri:dev 打开完整功能。");
  }
})();
