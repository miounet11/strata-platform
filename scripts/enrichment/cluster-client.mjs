import { spawnSync } from "node:child_process";

export function clusterConfig() {
  return {
    host: process.env.CLUSTER_HOST ?? "",
    sshUser: process.env.CLUSTER_SSH_USER ?? "root",
    sshPass: process.env.CLUSTER_SSH_PASS ?? "",
    ttsUrl: process.env.CLUSTER_TTS_URL ?? "",
    luxTtsUrl: process.env.CLUSTER_LUX_TTS_URL ?? "",
    imageModel: process.env.CLUSTER_IMAGE_MODEL ?? "qwen-image-21",
  };
}

function sshExec(remoteCmd, timeoutMs = 180000) {
  const { host, sshUser, sshPass } = clusterConfig();
  const target = `${sshUser}@${host}`;
  const env = sshPass ? { ...process.env, SSHPASS: sshPass } : process.env;
  const r = sshPass
    ? spawnSync("sshpass", ["-e", "ssh", "-o", "StrictHostKeyChecking=no", target, remoteCmd], {
        env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeoutMs,
      })
    : spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", target, remoteCmd], {
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

export function clusterImagePodIp() {
  const out = sshExec(
    `kubectl get pods -o wide 2>/dev/null | grep qwen-image-21-a | awk '{print $6}' | head -1`,
    30000,
  ).trim();
  if (!out) throw new Error("qwen-image pod IP not found on cluster");
  return out;
}

export async function generateImageB64(prompt, { size = "1024x576", model } = {}) {
  const cfg = clusterConfig();
  const ip = clusterImagePodIp();
  const payload = JSON.stringify({
    model: model ?? cfg.imageModel,
    prompt,
    size,
    n: 1,
  }).replace(/'/g, `'\\''`);
  const out = sshExec(
    `curl -s -m 180 -X POST http://${ip}:8000/v1/images/generations -H 'Content-Type: application/json' -d '${payload}'`,
    190000,
  );
  const json = JSON.parse(out);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image in response: ${out.slice(0, 200)}`);
  return b64;
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
