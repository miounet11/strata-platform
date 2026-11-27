/** Pure, deterministic decision-tree engine for local deployment diagnostics. */

import type { UrlSchema } from "../url-state.ts";
import { decodeQuery, encodeQuery } from "../url-state.ts";
import { clamp } from "../format.ts";

export type SymptomId =
  | "cuda-oom"
  | "cpu-fallback"
  | "slow-ttft"
  | "download-stall"
  | "ide-connection"
  | "multi-gpu-imbalance";

export const SYMPTOM_IDS: readonly SymptomId[] = [
  "cuda-oom",
  "cpu-fallback",
  "slow-ttft",
  "download-stall",
  "ide-connection",
  "multi-gpu-imbalance",
];

export const SYMPTOM_META: Record<SymptomId, { title: string; hint: string }> = {
  "cuda-oom": { title: "显存溢出 CUDA OOM", hint: "分配权重或 KV cache 时报错" },
  "cpu-fallback": { title: "退回 CPU 极慢", hint: "日志提示 fallback to CPU" },
  "slow-ttft": { title: "首字延迟高", hint: "请求发出后长时间没有首字" },
  "download-stall": { title: "模型下载卡死 / 403", hint: "权重分片卡住或被拒绝" },
  "ide-connection": { title: "Cursor / Claude Code 连接被拒", hint: "客户端无法连接本地网关" },
  "multi-gpu-imbalance": { title: "多卡负载不均", hint: "一张卡满载另一张闲置" },
};

export const TROUBLESHOOT_GUIDE_HREF = "/guides/category/troubleshoot";

export type QuestionOption = { id: string; label: string; next: string };

export type QuestionNode = {
  kind: "question";
  id: string;
  symptom: SymptomId;
  title: string;
  question: string;
  options: QuestionOption[];
};

export type LeafDiagnosis = {
  kind: "leaf";
  id: string;
  symptom: SymptomId;
  title: string;
  rootCause: string;
  fixCommand: string;
  guideHref: string;
  /** Internal hrefs, e.g. /tools/vram-visualizer. */
  relatedTools: string[];
};

export type TreeNode = QuestionNode | LeafDiagnosis;

export type TreeEdge = {
  from: string;
  to: string;
  choice: string;
  label: string;
};

export type Session = {
  symptom: SymptomId | null;
  /** Node ids visited from the symptom root to the current node. */
  history: string[];
};

export type ParsedUrlState = {
  session: Session;
  symptom: SymptomId | null;
  valid: boolean;
  shareQuery: string;
};

export type LayoutNode = {
  id: string;
  kind: "question" | "leaf";
  title: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type LayoutEdge = {
  from: string;
  to: string;
  choice: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

export const URL_SCHEMA: UrlSchema = {
  symptom: { kind: "enum", default: "", values: SYMPTOM_IDS, alias: "symptom" },
  path: { kind: "string", default: "", alias: "path" },
};

const NODE_W = 214;
const NODE_H = 62;
const COL_GAP = 62;
const ROW_GAP = 20;
const PAD = 24;

function leaf(
  symptom: SymptomId,
  id: string,
  title: string,
  rootCause: string,
  fixCommand: string,
  relatedTools: string[],
): LeafDiagnosis {
  return {
    kind: "leaf",
    id,
    symptom,
    title,
    rootCause,
    fixCommand,
    guideHref: TROUBLESHOOT_GUIDE_HREF,
    relatedTools: relatedTools.map((slug) => `/tools/${slug}`),
  };
}

function q(
  symptom: SymptomId,
  id: string,
  title: string,
  question: string,
  options: [string, string, string][],
): QuestionNode {
  return {
    kind: "question",
    id,
    symptom,
    title,
    question,
    options: options.map(([choice, label, next]) => ({ id: choice, label, next })),
  };
}

const tool = {
  vram: "/tools/vram-visualizer",
  gpuCompare: "/tools/gpu-compare",
  quant: "/tools/quant-explorer",
  install: "/tools/install-wizard",
  bench: "/tools/benchmark-scatter",
  planner: "/tools/multi-gpu-planner",
  pc: "/tools/pc-builder",
  roi: "/tools/roi-calculator",
  studio: "/tools/agent-studio",
};

function unprefix(slugs: string[]): string[] {
  return slugs.map((href) => href.slice("/tools/".length));
}

const rawNodes: TreeNode[] = [
  // cuda-oom
  q("cuda-oom", "q-oom-1", "显存诊断 1/3", "GPU 显存在报错时是否已经满载？", [
    ["yes", "是，接近 100%", "q-oom-2"],
    ["no", "否，占用很低", "l-oom-leak"],
  ]),
  q("cuda-oom", "q-oom-2", "显存诊断 2/3", "是否同时加载了多个模型或并行请求槽位？", [
    ["yes", "是，多模型 / 多槽", "l-oom-parallel"],
    ["no", "否，单模型单请求", "q-oom-3"],
  ]),
  q("cuda-oom", "q-oom-3", "显存诊断 3/3", "KV cache 是否使用 fp16 精度？", [
    ["yes", "是 fp16", "l-oom-kv"],
    ["no", "已量化或不确定", "l-oom-fragment"],
  ]),
  leaf("cuda-oom", "l-oom-leak", "其他进程或上下文占用显存",
    "目标进程显存占用很低，报错来自残留的 CUDA 上下文、其他进程或统一内存溢出，而不是当前模型本身。",
    "nvidia-smi --query-compute-apps=pid,used_memory --format=csv\npkill -f strata-engine\nstrata-engine serve --ctx 4096 --parallel 1",
    unprefix([tool.vram, tool.install])),
  leaf("cuda-oom", "l-oom-parallel", "并行槽位叠加超出显存预算",
    "并发请求或重复加载的模型权重叠加，使峰值显存超过物理容量。",
    "strata-engine serve --parallel 1 --ctx 4096 --kv q8_0\n# 逐步增大 --parallel，观察显存曲线",
    unprefix([tool.vram, tool.planner])),
  leaf("cuda-oom", "l-oom-kv", "fp16 KV cache 挤占权重空间",
    "长上下文下 fp16 KV cache 线性增长，与模型权重共同挤满显存。",
    "strata-engine serve --kv q8_0 --ctx 8192\n# 仍不足时改用 --kv q4_0",
    unprefix([tool.vram, tool.quant])),
  leaf("cuda-oom", "l-oom-fragment", "显存碎片与层卸载阈值过低",
    "权重已量化但显存分配碎片化，或部分层被强制留在 GPU，导致峰值分配失败。",
    "export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True\nstrata-engine serve --kv q4_0 --gpu-layers 99",
    unprefix([tool.vram, tool.gpuCompare])),

  // cpu-fallback
  q("cpu-fallback", "q-cpu-1", "后端诊断 1/3", "启动日志是否明确出现 CUDA / ROCm 初始化失败？", [
    ["yes", "是，有初始化报错", "q-cpu-2"],
    ["no", "没有报错但走 CPU", "l-cpu-unsupported"],
  ]),
  q("cpu-fallback", "q-cpu-2", "后端诊断 2/3", "nvidia-smi（或 rocm-smi）能否看到 GPU？", [
    ["yes", "能看到设备", "l-cpu-runtime"],
    ["no", "看不到设备", "l-cpu-driver"],
  ]),
  leaf("cpu-fallback", "l-cpu-unsupported", "GPU 架构或量化格式不受支持",
    "引擎没有匹配的 CUDA/ROCm kernel（旧架构或新量化格式），于是静默回退到 CPU。",
    "strata-engine info --verbose\nstrata-engine serve --runtime cuda13 --quant q4_k_m",
    unprefix([tool.install, tool.quant])),
  leaf("cpu-fallback", "l-cpu-runtime", "运行时版本与驱动不匹配",
    "设备可见，但安装的 runtime 与驱动/CUDA 版本不匹配，初始化失败后回退 CPU。",
    "nvidia-smi --query-gpu=driver_version --format=csv\nstrata-engine setup --runtime cuda13\nstrata-engine serve --runtime cuda13",
    unprefix([tool.install, tool.gpuCompare])),
  leaf("cpu-fallback", "l-cpu-driver", "驱动未加载或容器未透传 GPU",
    "驱动缺失、被黑名单屏蔽，或容器内没有挂载 /dev/nvidia*，因此引擎只能看到 CPU。",
    "sudo modprobe nvidia && nvidia-smi\n# 容器场景：docker run --gpus all ...",
    unprefix([tool.install, tool.pc])),

  // slow-ttft
  q("slow-ttft", "q-ttft-1", "延迟诊断 1/3", "首字延迟是否随上下文长度显著增长？", [
    ["yes", "是，上下文越长越慢", "q-ttft-2"],
    ["no", "与上下文长度无关", "l-ttft-offload"],
  ]),
  q("slow-ttft", "q-ttft-2", "延迟诊断 2/3", "每个请求是否重复发送完整系统提示词？", [
    ["yes", "是，每次都重发", "l-ttft-prompt-cache"],
    ["no", "提示词已复用", "l-ttft-context"],
  ]),
  leaf("slow-ttft", "l-ttft-offload", "部分层卸载到 CPU / 磁盘",
    "模型未完全驻留显存，prefill 阶段需要从 CPU 或磁盘搬运权重，首字被显著拖慢。",
    "strata-engine serve --gpu-layers 99 --kv q8_0\nnvidia-smi --query-gpu=utilization.gpu --format=csv -l 1",
    unprefix([tool.vram, tool.bench])),
  leaf("slow-ttft", "l-ttft-prompt-cache", "提示词缓存未命中导致重复 prefill",
    "客户端每次重建完整对话前缀，缓存失效，prefill 必须重算。",
    "strata-engine serve --prompt-cache on --ctx 16384\n# 客户端复用同一 conversation id",
    unprefix([tool.studio, tool.bench])),
  leaf("slow-ttft", "l-ttft-context", "上下文过长且 KV cache 精度过高",
    "超长上下文配合 fp16 KV cache 使 prefill 计算量和带宽 doubles，首字等待增加。",
    "strata-engine serve --kv q8_0 --ctx 8192 --chunked-prefill on",
    unprefix([tool.vram, tool.quant])),

  // download-stall
  q("download-stall", "q-dl-1", "下载诊断 1/3", "请求返回的是 403 / 401 吗？", [
    ["yes", "是，鉴权或权限错误", "l-dl-auth"],
    ["no", "不是，速度卡住", "q-dl-2"],
  ]),
  q("download-stall", "q-dl-2", "下载诊断 2/3", "是否总是卡在同一个权重分片？", [
    ["yes", "是，同一分片", "l-dl-shard"],
    ["no", "分片不固定", "l-dl-network"],
  ]),
  leaf("download-stall", "l-dl-auth", "令牌过期或仓库访问被拒",
    "本地缓存的 HF token 已过期，或仓库为 gated，未授权请求被端点以 403 拒绝。",
    "huggingface-cli login --token <YOUR_TOKEN>\nexport HF_ENDPOINT=https://hf-mirror.com",
    unprefix([tool.install, tool.quant])),
  leaf("download-stall", "l-dl-shard", "单分片下载损坏且断点续传死循环",
    "缓存中的分片校验失败，重试不断从同一偏移重新开始，表现为永久卡死。",
    "strata-engine cache clear --repo <REPO_ID>\nstrata-engine pull <REPO_ID> --resume false",
    unprefix([tool.install, tool.quant])),
  leaf("download-stall", "l-dl-network", "网络链路或镜像端点不稳定",
    "分片不固定且整体吞吐接近零，说明是链路拥塞、代理配置错误或镜像端点不可用。",
    "export HF_ENDPOINT=https://hf-mirror.com\nstrata-engine pull <REPO_ID> --max-workers 2 --timeout 120",
    unprefix([tool.install, tool.bench])),

  // ide-connection
  q("ide-connection", "q-ide-1", "连接诊断 1/3", "网关端口是否处于监听状态？", [
    ["yes", "是，正在监听", "q-ide-2"],
    ["no", "没有监听", "l-ide-firewall"],
  ]),
  q("ide-connection", "q-ide-2", "连接诊断 2/3", "客户端 Base URL 是否指向 /v1？", [
    ["yes", "是 /v1", "l-ide-auth"],
    ["no", "不是或缺失", "l-ide-base-url"],
  ]),
  leaf("ide-connection", "l-ide-firewall", "服务未启动或本地防火墙拦截",
    "网关进程已退出，或系统防火墙阻止了回环端口连接，因此连接直接被拒绝。",
    "lsof -nP -iTCP:8080 -sTCP:LISTEN\nstrata-engine serve --host 127.0.0.1 --port 8080",
    unprefix([tool.install, tool.studio])),
  leaf("ide-connection", "l-ide-base-url", "客户端 Base URL 配置错误",
    "Cursor / Claude Code 使用了根地址或缺少 /v1，OpenAI 兼容层返回 404 并被客户端显示为连接失败。",
    "# Cursor / Claude Code OpenAI-compatible 配置\nAPI_BASE=http://127.0.0.1:8080/v1",
    unprefix([tool.studio, tool.install])),
  leaf("ide-connection", "l-ide-auth", "API Key 或 CORS 校验失败",
    "网关启用了 API Key / Origin 校验，而客户端请求缺少对应头部，握手阶段被拒绝。",
    "strata-engine serve --api-key <YOUR_KEY> --allowed-origin http://localhost\n# 客户端填入同一 API Key",
    unprefix([tool.studio, tool.install])),

  // multi-gpu-imbalance
  q("multi-gpu-imbalance", "q-multi-1", "多卡诊断 1/3", "两张卡的显存占用差异是否超过 20%？", [
    ["yes", "是，差异明显", "q-multi-2"],
    ["no", "差异很小", "l-multi-thermal"],
  ]),
  q("multi-gpu-imbalance", "q-multi-2", "多卡诊断 2/3", "两张卡的 PCIe 通道 / 带宽是否对称？", [
    ["yes", "对称（x16/x16 或 x8/x8）", "l-multi-split"],
    ["no", "不对称或跨 CPU 插槽", "l-multi-pcie"],
  ]),
  leaf("multi-gpu-imbalance", "l-multi-thermal", "功耗墙 /  thermal throttling 导致算力不均",
    "显存占用接近但某张卡因温度或功耗墙降频，token 吞吐不均衡。",
    "nvidia-smi --query-gpu=index,temperature.gpu,power.draw,clocks.sm --format=csv -l 1\nstrata-engine serve --tensor-parallel 2",
    unprefix([tool.planner, tool.bench])),
  leaf("multi-gpu-imbalance", "l-multi-split", "层切分策略与模型层数不匹配",
    "张量并行把层平均切分，但模型层数不能被卡数整除，或某些层被固定在主卡。",
    "strata-engine serve --tensor-parallel 2 --layers-per-gpu auto\nnvidia-smi --query-gpu=index,memory.used --format=csv -l 1",
    unprefix([tool.planner, tool.vram])),
  leaf("multi-gpu-imbalance", "l-multi-pcie", "PCIe 通道不对称造成通信瓶颈",
    "一张卡挂在 x4 或跨 NUMA 节点，all-reduce 通信拖慢该卡，负载持续倾斜。",
    "# 将两张卡插在对称插槽（x8/x8 或 x16/x16）\nstrata-engine serve --tensor-parallel 2 --pipeline-parallel 1",
    unprefix([tool.planner, tool.pc])),
];

export const NODES: Record<string, TreeNode> = Object.fromEntries(rawNodes.map((node) => [node.id, node]));

export const EDGES: TreeEdge[] = rawNodes.flatMap((node) =>
  node.kind === "question"
    ? node.options.map((option) => ({
        from: node.id,
        to: option.next,
        choice: option.id,
        label: option.label,
      }))
    : [],
);

export const SYMPTOM_ROOTS: Record<SymptomId, string> = {
  "cuda-oom": "q-oom-1",
  "cpu-fallback": "q-cpu-1",
  "slow-ttft": "q-ttft-1",
  "download-stall": "q-dl-1",
  "ide-connection": "q-ide-1",
  "multi-gpu-imbalance": "q-multi-1",
};

export function isSymptom(value: unknown): value is SymptomId {
  return typeof value === "string" && (SYMPTOM_IDS as readonly string[]).includes(value);
}

export function emptySession(): Session {
  return { symptom: null, history: [] };
}

export function createSession(symptom: SymptomId | null = null): Session {
  if (!isSymptom(symptom)) return emptySession();
  return { symptom, history: [SYMPTOM_ROOTS[symptom]] };
}

export function currentNode(session: Session): TreeNode | null {
  const id = session.history[session.history.length - 1];
  return id ? NODES[id] ?? null : null;
}

export function advance(session: Session, choice: string): Session {
  const node = currentNode(session);
  if (!node || node.kind !== "question" || typeof choice !== "string") return session;
  const option = node.options.find((item) => item.id === choice);
  if (!option || !NODES[option.next]) return session;
  if (session.history.includes(option.next)) return session;
  return { symptom: session.symptom, history: [...session.history, option.next] };
}

export function stepBack(session: Session): Session {
  if (session.history.length <= 1) return session;
  return { symptom: session.symptom, history: session.history.slice(0, -1) };
}

/** Clears the diagnosis path but keeps the selected symptom entry. */
export function reset(session: Session): Session {
  return createSession(session.symptom);
}

export function choicesOf(session: Session): string[] {
  const choices: string[] = [];
  for (let i = 1; i < session.history.length; i += 1) {
    const from = session.history[i - 1];
    const to = session.history[i];
    const edge = EDGES.find((item) => item.from === from && item.to === to);
    choices.push(edge?.choice ?? "");
  }
  return choices;
}

export function sessionParams(session: Session): { symptom: string; path: string } {
  return { symptom: session.symptom ?? "", path: choicesOf(session).join(",") };
}

export function sessionShareQuery(session: Session): string {
  if (!session || !Array.isArray(session.history) || session.history.length === 0) return "";
  return encodeQuery(sessionParams(session), URL_SCHEMA);
}

/** Strict deep-link parser: rejects unknown symptoms, unknown choices and illegal branches. */
export function parseUrlState(search: string): ParsedUrlState {
  let raw: URLSearchParams;
  try {
    raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    raw = new URLSearchParams();
  }
  const rawSymptom = raw.get(URL_SCHEMA.symptom.alias ?? "symptom");
  if (rawSymptom != null && !isSymptom(rawSymptom)) {
    return { session: emptySession(), symptom: null, valid: false, shareQuery: "" };
  }
  const decoded = decodeQuery(search, URL_SCHEMA);
  const symptom: SymptomId | null = isSymptom(rawSymptom) ? rawSymptom : null;
  const path = decoded.path as string;
  let session = createSession(symptom);
  const choices = path ? path.split(",").filter((choice) => choice.length > 0) : [];
  for (const choice of choices) {
    const next = advance(session, choice);
    if (next.history.length === session.history.length) {
      session = createSession(session.symptom);
      return { session, symptom: session.symptom, valid: false, shareQuery: "" };
    }
    session = next;
  }
  if (session.history.length === 0) return { session, symptom, valid: choices.length === 0, shareQuery: "" };
  return { session, symptom, valid: true, shareQuery: sessionShareQuery(session) };
}

export function reachableNodes(symptom: SymptomId): TreeNode[] {
  const root = SYMPTOM_ROOTS[symptom];
  const seen = new Set<string>();
  const stack = [root];
  const out: TreeNode[] = [];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = NODES[id];
    if (!node) continue;
    out.push(node);
    if (node.kind === "question") {
      for (const option of node.options) if (!seen.has(option.next)) stack.push(option.next);
    }
  }
  return out;
}

export function leavesOf(symptom: SymptomId): LeafDiagnosis[] {
  return reachableNodes(symptom).filter((node): node is LeafDiagnosis => node.kind === "leaf");
}

/** Deterministic layered layout for one symptom, or the complete six-root forest. */
export function getTreeLayout(symptom: SymptomId | null = null): TreeLayout {
  const roots = symptom ? [SYMPTOM_ROOTS[symptom]] : SYMPTOM_IDS.map((id) => SYMPTOM_ROOTS[id]);
  const depths = new Map<string, number>();
  const queue: { id: string; depth: number }[] = roots.map((id) => ({ id, depth: 0 }));
  while (queue.length > 0) {
    const item = queue.shift() as { id: string; depth: number };
    if (depths.has(item.id)) continue;
    depths.set(item.id, item.depth);
    const node = NODES[item.id];
    if (node?.kind === "question") {
      for (const option of node.options) {
        if (!depths.has(option.next)) queue.push({ id: option.next, depth: item.depth + 1 });
      }
    }
  }
  const columns = new Map<number, string[]>();
  for (const [id, depth] of depths) {
    const column = columns.get(depth) ?? [];
    column.push(id);
    columns.set(depth, column);
  }
  const positions = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  for (const [depth, ids] of columns) {
    ids.sort((a, b) => a.localeCompare(b));
    maxRows = Math.max(maxRows, ids.length);
    ids.forEach((id, row) => {
      positions.set(id, {
        x: PAD + depth * (NODE_W + COL_GAP),
        y: PAD + row * (NODE_H + ROW_GAP),
      });
    });
  }
  const nodes: LayoutNode[] = Array.from(depths.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((id) => {
      const node = NODES[id] as TreeNode;
      const pos = positions.get(id) as { x: number; y: number };
      return {
        id,
        kind: node.kind,
        title: node.title,
        label: node.kind === "question" ? node.question : node.rootCause,
        x: pos.x,
        y: pos.y,
        width: NODE_W,
        height: NODE_H,
        depth: depths.get(id) ?? 0,
      };
    });
  const edges: LayoutEdge[] = EDGES.filter((edge) => depths.has(edge.from) && depths.has(edge.to)).map((edge) => {
    const from = positions.get(edge.from) as { x: number; y: number };
    const to = positions.get(edge.to) as { x: number; y: number };
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    return {
      from: edge.from,
      to: edge.to,
      choice: edge.choice,
      label: edge.label,
      x1,
      y1,
      x2,
      y2,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 6,
    };
  });
  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  return {
    nodes,
    edges,
    width: clamp(PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP, 1, 100000, 1),
    height: clamp(PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP, 1, 100000, 1),
  };
}
