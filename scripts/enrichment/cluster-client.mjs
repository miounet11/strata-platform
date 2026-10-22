import { spawnSync } from "node:child_process";

export function clusterConfig() {
  return {
    host: process.env.CLUSTER_HOST ?? "",
    sshUser: process.env.CLUSTER_SSH_USER ?? "root",
    sshPass: process.env.CLUSTER_SSH_PASS ?? "",
    ttsUrl: process.env.CLUSTER_TTS_URL ?? "",
    luxTtsUrl: process.env.CLUSTER_LUX_TTS_URL ?? "",
    imageModel: process.env.CLUSTER_IMAGE_MODEL ?? "z-image-turbo",
    imageSvc: process.env.CLUSTER_IMAGE_SVC ?? "",
  };
}

// Every image costs two round trips (POST, then fetch the returned url). Without a multiplexed
// connection each one pays a full handshake, which dominates generation time on a LAN.
const SSH_OPTS = [
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=no",
  "-o", "ControlMaster=auto",
  "-o", "ControlPath=~/.ssh/cm/%r@%h:%p",
  "-o", "ControlPersist=30m",
];

function sshExec(remoteCmd, timeoutMs = 180000) {
  const { host, sshUser, sshPass } = clusterConfig();
  const target = `${sshUser}@${host}`;
  const env = sshPass ? { ...process.env, SSHPASS: sshPass } : process.env;
  const r = sshPass
    ? spawnSync("sshpass", ["-e", "ssh", ...SSH_OPTS, target, remoteCmd], {
        env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeoutMs,
      })
    : spawnSync("ssh", ["-o", "BatchMode=yes", ...SSH_OPTS, target, remoteCmd], {
        env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeoutMs,
      });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`ssh failed: ${r.stderr?.slice(0, 500) ?? r.status}`);
  }
  return r.stdout;
}

/** The image worker is a ClusterIP service with several replicas, not a single pod. */
export function clusterImageSvcUrl() {
  const { imageSvc } = clusterConfig();
  if (imageSvc) return imageSvc.replace(/\/$/, "");
  const out = sshExec(
    `kubectl get svc z-image-turbo -o jsonpath='{.spec.clusterIP}:{.spec.ports[0].port}' 2>/dev/null`,
    30000,
  ).trim();
  if (!out || out.includes("<none>")) throw new Error("z-image-turbo service not found on cluster");
  return `http://${out}`;
}

/**
 * Returns PNG/WebP bytes. The server answers with a `url` on its own origin rather than inline
 * base64, so fetch that URL back through the same host before returning.
 */
export async function generateImage(prompt, { size = "1024x576", model } = {}) {
  const cfg = clusterConfig();
  const svc = clusterImageSvcUrl();
  const payload = JSON.stringify({
    model: model ?? cfg.imageModel,
    prompt,
    size,
    n: 1,
  }).replace(/'/g, `'\\''`);
  const out = sshExec(
    `curl -s -m 240 -X POST ${svc}/v1/images/generations -H 'Content-Type: application/json' -d '${payload}'`,
    260000,
  );
  const json = JSON.parse(out);
  const inline = json?.data?.[0]?.b64_json;
  if (inline) return Buffer.from(inline, "base64");
  const url = json?.data?.[0]?.url;
  if (!url) throw new Error(`no image in response: ${out.slice(0, 200)}`);
  const b64 = sshExec(`curl -s -m 120 '${url}' | base64 -w0`, 140000).trim();
  if (!b64) throw new Error(`could not fetch image from ${url}`);
  return Buffer.from(b64, "base64");
}

export async function generateImageB64(prompt, opts) {
  return (await generateImage(prompt, opts)).toString("base64");
}

/**
 * Generate an image through the OpenAI-compatible gateway instead of the LAN cluster.
 *
 * The cluster path above needs SSH into a private network, which the production host cannot
 * reach — so anything scheduled there could never illustrate its own articles, and
 * `publish.mjs` held back every article without a hero image. The gateway is reachable over
 * plain HTTPS and speaks the same `/images/generations` shape, so the caller does not care
 * which one produced the bytes.
 *
 * `b64_json` is requested explicitly: without it the gateway answers with a URL on its own
 * internal address (`172.17.0.1:9102`), which is useless from any other machine. Rewriting that
 * hostname onto the public domain does not work either — it returns the SPA's HTML fallback
 * with a 200, so a naive fetch would happily save a web page as a .webp.
 */
export async function generateImageViaGateway(prompt, { size = "1024x576", model } = {}) {
  const base = (process.env.CONTENT_IMAGE_BASE_URL ?? process.env.CONTENT_LLM_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.CONTENT_IMAGE_API_KEY ?? process.env.CONTENT_LLM_API_KEY;
  const usedModel = model ?? process.env.CONTENT_IMAGE_MODEL ?? "z-image-turbo";
  if (!base || !key) throw new Error("image gateway not configured (CONTENT_LLM_BASE_URL / CONTENT_LLM_API_KEY)");

  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: usedModel, prompt, n: 1, size, response_format: "b64_json" }),
    signal: AbortSignal.timeout(240000),
  });
  if (!res.ok) throw new Error(`image gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  const inline = json?.data?.[0]?.b64_json;
  if (!inline) throw new Error(`no inline image in gateway response: ${JSON.stringify(json).slice(0, 200)}`);

  const buf = Buffer.from(inline, "base64");
  // A truncated or error body would otherwise be written as a .webp that renders blank. RIFF
  // is the container signature both WebP and WAV use, and this endpoint only returns WebP.
  if (buf.length < 5000 || buf.subarray(0, 4).toString("latin1") !== "RIFF") {
    throw new Error(`gateway returned a non-image payload (${buf.length} bytes)`);
  }
  return buf;
}

export async function generateTtsBuffer(text, { model = "qwen3-tts-acted", voice = "alloy" } = {}) {
  const { ttsUrl } = clusterConfig();
  const res = await fetch(`${ttsUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text, voice }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS ${res.status}: ${err.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function generateAmbientMp3(durationSec = 8) {
  const cmd = `ffmpeg -y -f lavfi -i anoisesrc=d=0:c=pink:r=44100:a=${durationSec} -af "volume=0.08,lowpass=f=800" -q:a 9 /tmp/strata-ambient.mp3 2>/dev/null && base64 /tmp/strata-ambient.mp3 | head -c 200000`;
  const out = sshExec(cmd, 60000);
  return Buffer.from(out.trim(), "base64");
}
