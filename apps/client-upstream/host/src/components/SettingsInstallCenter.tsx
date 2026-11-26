import { useEffect, useState } from 'react';
import { api } from '../lib/client';
import { tr } from '../lib/i18n';
import { nativeAction, useNative } from '../lib/native';
import { Btn, ErrorNotice, Field, Icon, Pill, Select } from './ui';

interface ProbeEntry {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
}

interface ProbeReport {
  probedAt: string;
  results: ProbeEntry[];
  recommendation: { preset: string; reason: string };
}

interface IntegrationItem {
  id: string;
  name: string;
  kind: string;
  description: string;
  configPath: string;
  appDetected: boolean;
  canInstall: boolean;
  installed: boolean;
  upToDate: boolean;
  valid: boolean;
  error: string | null;
  detail: string | null;
}

interface InstallCenterState {
  checkedAt: string;
  appVersion: string;
  platform: string;
  arch: string;
  apiBaseUrl: string;
  summary: { readyCount: number; totalCore: number; allCoreReady: boolean };
  control: { installed: boolean; version: string | null; python: string | null; dir: string | null; healthy: boolean };
  engines: {
    primaryUsable: boolean;
    version: string | null;
    backend: string | null;
    notice: string | null;
    shapes: Array<{ shape: string; component: string; usable: boolean; version: string | null; backend: string | null }>;
    anyUsable: boolean;
    hasBundledEngine: boolean;
  };
  harness: { installed: boolean; version: string | null; dir: string | null; reason: string | null };
  browser: { mcpBundled: boolean; browserFound: boolean; browserName: string | null; browserPath: string | null; ready: boolean };
  cloudflared: { installed: boolean; path: string | null; version: string | null; source: string | null; canInstall: boolean };
  storage: { modelsDir: string; componentsDir: string; freeGb: number; totalGb: number; healthy: boolean };
  network: {
    source: 'auto' | 'huggingface' | 'modelscope';
    hfEndpoint: string;
    httpsProxy: string;
    httpProxy: string;
    effectiveHfEndpoint: string;
    effectiveSource: string;
    presets: Array<{ id: string; label: string; source: 'auto' | 'huggingface' | 'modelscope'; hfEndpoint: string }>;
  } | null;
  integrations: IntegrationItem[];
}

export function SettingsInstallCenter() {
  const native = useNative();
  const [data, setData] = useState<InstallCenterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Network form state
  const [source, setSource] = useState<'auto' | 'huggingface' | 'modelscope'>('auto');
  const [hfEndpoint, setHfEndpoint] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [savingNet, setSavingNet] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeReport | null>(null);

  // Action busy flags
  const [installingCf, setInstallingCf] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState<Record<string, string>>({});

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const next = await api.get<InstallCenterState>('/api/install-center');
      setData(next);
      if (next.network) {
        setSource(next.network.source);
        setHfEndpoint(next.network.hfEndpoint);
        setHttpsProxy(next.network.httpsProxy);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function saveNetwork(override?: { source?: 'auto' | 'huggingface' | 'modelscope'; hfEndpoint?: string; httpsProxy?: string }) {
    setSavingNet(true);
    setError('');
    setStatusNote('');
    try {
      const payload = {
        source: override?.source ?? source,
        hfEndpoint: override?.hfEndpoint ?? hfEndpoint,
        httpsProxy: override?.httpsProxy ?? httpsProxy,
      };
      const next = await api.post<InstallCenterState>('/api/install-center/network', payload);
      setData(next);
      if (next.network) {
        setSource(next.network.source);
        setHfEndpoint(next.network.hfEndpoint);
        setHttpsProxy(next.network.httpsProxy);
      }
      setStatusNote(tr('Download mirror settings saved.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingNet(false);
    }
  }

  async function runNetworkProbe() {
    setProbing(true);
    setError('');
    try {
      setProbe(await api.post<ProbeReport>('/api/install-center/network-probe', {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProbing(false);
    }
  }

  async function installCloudflared() {
    setInstallingCf(true);
    setError('');
    setStatusNote('');
    try {
      await api.post('/api/install-center/cloudflared', {});
      await refresh();
      setStatusNote(tr('Cloudflare tunnel connector installed and verified.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallingCf(false);
    }
  }

  async function runRepair() {
    setRepairing(true);
    setError('');
    setStatusNote('');
    try {
      const res = await api.post<{ ok: boolean; status: InstallCenterState }>('/api/install-center/repair', {});
      setData(res.status);
      setStatusNote(tr('Runtime repair and engine verification finished.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRepairing(false);
    }
  }

  async function triggerEngineUpdate() {
    setError('');
    setStatusNote('');
    try {
      await nativeAction('operations', { kind: 'update-engine' });
      setStatusNote(tr('Engine installation started. Check Engine settings for progress.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleIntegration(id: string, action: 'install' | 'uninstall' | 'verify') {
    setBusyTool(`${id}:${action}`);
    setError('');
    try {
      if (action === 'verify') {
        const res = await api.post<{ ok: boolean; apiReachable: boolean | null }>(`/api/install-center/integrations/${id}/verify`, {});
        setVerifyNote((prev) => ({
          ...prev,
          [id]: res.ok
            ? (res.apiReachable === false ? tr('Config valid (start a model to enable live API).') : tr('Verified and ready.'))
            : tr('Configuration check failed.'),
        }));
      } else {
        const res = await api.post<{ integrations: IntegrationItem[] }>(`/api/install-center/integrations/${id}/${action}`, {});
        setData((prev) => (prev ? { ...prev, integrations: res.integrations } : prev));
        setVerifyNote((prev) => ({
          ...prev,
          [id]: action === 'install' ? tr('Installed with automatic backup.') : tr('Removed cleanly.'),
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyTool(null);
    }
  }

  async function exportDiagnostics() {
    setError('');
    try {
      const report = await api.get<Record<string, unknown>>('/api/install-center/diagnostics');
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stratat-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusNote(tr('Sanitized diagnostics report exported.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="stack stack--lg settings-body">
      {error ? <ErrorNotice message={error} /> : null}
      {statusNote ? <p className="small" role="status">{statusNote}</p> : null}

      <section className="settings-section">
        <div className="section-toolbar" style={{ marginBottom: 14 }}>
          <h2 className="h3">{tr('Component Health & Repair')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <Btn size="sm" icon="refresh" disabled={loading} onClick={() => void refresh()}>
              {tr('Recheck')}
            </Btn>
            <Btn size="sm" variant="primary" disabled={repairing} onClick={() => void runRepair()}>
              {tr(repairing ? 'Repairing…' : 'One-Click Repair')}
            </Btn>
            <Btn size="sm" icon="download" onClick={() => void exportDiagnostics()}>
              {tr('Export Diagnostics')}
            </Btn>
          </div>
        </div>

        <div className="st-card st-card--flush">
          <Field
            label={tr('Control Runtime')}
            hint={data?.control.version ? `Python 3.12 · v${data.control.version}` : tr('Bundled Python control runtime for models, GPUs, and updates.')}
          >
            <Pill tone={data?.control.healthy ? 'accent' : 'warn'} dot>
              {tr(data?.control.healthy ? 'Ready' : 'Not installed')}
            </Pill>
          </Field>

          <Field
            label={tr('Inference Engines')}
            hint={
              data?.engines.anyUsable
                ? [
                    data.engines.primaryUsable ? `Qwen3.8 (${data.engines.backend ?? 'native'} ${data.engines.version ?? ''})` : null,
                    ...data.engines.shapes.filter((s) => s.usable).map((s) => `${s.component} (${s.version ?? ''})`),
                  ].filter(Boolean).join(' · ')
                : (data?.engines.notice ?? tr('Native GPU inference engine for local models.'))
            }
          >
            <div className="row" style={{ gap: 8 }}>
              <Pill tone={data?.engines.anyUsable ? 'accent' : 'warn'} dot>
                {tr(data?.engines.anyUsable ? 'Ready' : 'Needs install')}
              </Pill>
              {native?.capabilities.componentUpdates ? (
                <Btn size="sm" onClick={() => void triggerEngineUpdate()}>
                  {tr(data?.engines.anyUsable ? 'Check Engine Update' : 'Install Engine')}
                </Btn>
              ) : null}
            </div>
          </Field>

          <Field
            label={tr('Agent Harness')}
            hint={data?.harness.installed ? `DeepSeek Harness v${data.harness.version ?? ''}` : (data?.harness.reason ?? tr('Autonomous coding agent, skills, and tool execution runtime.'))}
          >
            <Pill tone={data?.harness.installed ? 'accent' : 'warn'} dot>
              {tr(data?.harness.installed ? 'Ready' : 'Not installed')}
            </Pill>
          </Field>

          <Field
            label={tr('Browser Automation')}
            hint={
              data?.browser.browserFound
                ? `${data.browser.browserName} · ${data.browser.mcpBundled ? tr('Playwright MCP bundled') : tr('MCP missing')}`
                : tr('Install Chrome, Edge, or Brave to let the assistant browse web pages.')
            }
          >
            <Pill tone={data?.browser.ready ? 'accent' : 'plain'} dot>
              {tr(data?.browser.ready ? 'Ready' : data?.browser.mcpBundled ? 'Browser needed' : 'Not installed')}
            </Pill>
          </Field>

          <Field
            label={tr('Cloudflare Tunnel Connector')}
            hint={
              data?.cloudflared.installed
                ? `${data.cloudflared.version ?? 'cloudflared'} · ${data.cloudflared.path ?? ''}`
                : tr('Official SHA-256 verified connector for remote HTTPS sharing.')
            }
          >
            <div className="row" style={{ gap: 8 }}>
              <Pill tone={data?.cloudflared.installed ? 'accent' : 'plain'} dot>
                {tr(data?.cloudflared.installed ? 'Installed' : 'Optional')}
              </Pill>
              {!data?.cloudflared.installed && data?.cloudflared.canInstall ? (
                <Btn size="sm" variant="primary" disabled={installingCf} onClick={() => void installCloudflared()}>
                  {tr(installingCf ? 'Installing…' : 'Install Connector')}
                </Btn>
              ) : null}
            </div>
          </Field>

          <Field
            label={tr('Model Storage')}
            hint={data?.storage ? `${data.storage.modelsDir} (${data.storage.freeGb} GB / ${data.storage.totalGb} GB)` : ''}
          >
            <Pill tone={data?.storage.healthy ? 'accent' : 'danger'} dot>
              {tr(data?.storage.healthy ? 'Healthy' : 'Low disk space')}
            </Pill>
          </Field>
        </div>
      </section>

      <section className="settings-section">
        <div className="section-toolbar" style={{ marginBottom: 14 }}>
          <h2 className="h3">{tr('Download Mirrors & Proxy')}</h2>
          <Btn size="sm" icon="activity" disabled={probing} onClick={() => void runNetworkProbe()}>
            {tr(probing ? 'Testing…' : 'Test Download Mirrors')}
          </Btn>
        </div>

        <div className="st-card st-card--flush">
          <Field
            label={tr('Quick Mirror Preset')}
            hint={tr('Choose a fast regional mirror so models, vision files, and drafters download reliably.')}
          >
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(data?.network?.presets ?? []).map((preset) => (
                <Btn
                  key={preset.id}
                  size="sm"
                  disabled={savingNet}
                  onClick={() => void saveNetwork({ source: preset.source, hfEndpoint: preset.hfEndpoint })}
                >
                  {preset.label}
                </Btn>
              ))}
            </div>
          </Field>

          <Field
            label={tr('Model Download Source')}
            hint={tr('ModelScope serves verified weights directly in mainland China.')}
          >
            <Select
              ariaLabel={tr('Model Download Source')}
              value={source}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'huggingface', label: 'Hugging Face' },
                { value: 'modelscope', label: 'ModelScope' },
              ]}
              onChange={(v) => setSource(v as 'auto' | 'huggingface' | 'modelscope')}
            />
          </Field>

          <Field
            label={tr('Hugging Face Mirror URL')}
            hint={tr('Leave empty for huggingface.co, or use https://hf-mirror.com.')}
          >
            <input
              type="text"
              className="st-input"
              aria-label={tr('Hugging Face Mirror URL')}
              placeholder="https://hf-mirror.com"
              value={hfEndpoint}
              onChange={(e) => setHfEndpoint(e.target.value)}
            />
          </Field>

          <Field
            label={tr('HTTPS Proxy')}
            hint={tr('Optional proxy for restricted corporate or campus networks (e.g. http://127.0.0.1:7890).')}
          >
            <div className="row" style={{ gap: 8 }}>
              <input
                type="text"
                className="st-input"
                aria-label={tr('HTTPS Proxy')}
                placeholder="http://127.0.0.1:7890"
                value={httpsProxy}
                onChange={(e) => setHttpsProxy(e.target.value)}
              />
              <Btn size="sm" variant="primary" disabled={savingNet} onClick={() => void saveNetwork()}>
                {tr(savingNet ? 'Saving…' : 'Save')}
              </Btn>
            </div>
          </Field>

          {probe ? (
            <Field label={tr('Mirror Connectivity')} hint={probe.recommendation.reason}>
              <div className="stack" style={{ gap: 4 }}>
                {probe.results.map((r) => (
                  <div key={r.id} className="row small" style={{ gap: 8 }}>
                    <Pill tone={r.ok ? 'accent' : 'danger'} badge>
                      {r.ok ? `${r.latencyMs} ms` : (r.error ?? 'Failed')}
                    </Pill>
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>
            </Field>
          ) : null}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-toolbar" style={{ marginBottom: 14 }}>
          <h2 className="h3">{tr('IDE & Coding Agent Integrations')}</h2>
          <span className="small muted">{data?.apiBaseUrl ?? ''}</span>
        </div>

        <div className="st-card st-card--flush">
          {(data?.integrations ?? []).map((item) => (
            <Field
              key={item.id}
              label={item.name}
              hint={`${item.configPath}${verifyNote[item.id] ? ` · ${verifyNote[item.id]}` : item.error ? ` · ${item.error}` : ''}`}
            >
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Pill tone={item.installed && item.valid ? 'accent' : item.appDetected ? 'info' : 'plain'} dot>
                  {tr(item.installed ? (item.upToDate ? 'Configured' : 'Needs update') : item.appDetected ? 'Detected' : 'Not configured')}
                </Pill>
                <Btn
                  size="sm"
                  variant={item.installed ? 'secondary' : 'primary'}
                  disabled={!item.canInstall || busyTool !== null}
                  onClick={() => void handleIntegration(item.id, 'install')}
                >
                  <Icon name="download" size={14} />
                  {tr(item.installed ? 'Reconfigure' : 'Install')}
                </Btn>
                {item.installed ? (
                  <>
                    <Btn size="sm" disabled={busyTool !== null} onClick={() => void handleIntegration(item.id, 'verify')}>
                      {tr('Verify')}
                    </Btn>
                    <Btn size="sm" variant="ghost" disabled={busyTool !== null} onClick={() => void handleIntegration(item.id, 'uninstall')}>
                      {tr('Remove')}
                    </Btn>
                  </>
                ) : null}
              </div>
            </Field>
          ))}
        </div>
      </section>
    </div>
  );
}
