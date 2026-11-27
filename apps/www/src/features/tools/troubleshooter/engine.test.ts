import test from "node:test";
import assert from "node:assert/strict";

import {
  EDGES,
  NODES,
  SYMPTOM_IDS,
  SYMPTOM_ROOTS,
  URL_SCHEMA,
  advance,
  choicesOf,
  createSession,
  currentNode,
  getTreeLayout,
  isSymptom,
  leavesOf,
  parseUrlState,
  reachableNodes,
  reset,
  sessionParams,
  sessionShareQuery,
  stepBack,
  type LeafDiagnosis,
  type SymptomId,
} from "./engine.ts";

/** Walk one deterministic branch (always the `yes` edge) until a leaf. */
function walkYes(symptom: SymptomId): LeafDiagnosis {
  let session = createSession(symptom);
  for (let step = 0; step < 64; step += 1) {
    const node = currentNode(session);
    if (!node) throw new Error(`no node for ${symptom}`);
    if (node.kind === "leaf") return node;
    session = advance(session, "yes");
  }
  throw new Error(`possible cycle for ${symptom}`);
}

function walkPath(symptom: SymptomId, choices: string[]): LeafDiagnosis {
  let session = createSession(symptom);
  for (const choice of choices) session = advance(session, choice);
  const node = currentNode(session);
  assert.equal(node?.kind, "leaf");
  assert.equal(session.history.length, choices.length + 1);
  return node as LeafDiagnosis;
}

test("six symptom roots are the only valid entries", () => {
  assert.deepEqual(SYMPTOM_IDS, [
    "cuda-oom", "cpu-fallback", "slow-ttft",
    "download-stall", "ide-connection", "multi-gpu-imbalance",
  ]);
  assert.deepEqual(Object.keys(SYMPTOM_ROOTS).sort(), [...SYMPTOM_IDS].sort());
  for (const symptom of SYMPTOM_IDS) {
    assert.equal(isSymptom(symptom), true);
    assert.equal(createSession(symptom).history[0], SYMPTOM_ROOTS[symptom]);
  }
  assert.equal(isSymptom("unknown"), false);
  assert.deepEqual(createSession("unknown" as SymptomId), { symptom: null, history: [] });
});

test("tree is acyclic, edges resolve, all branches terminate in leaves", () => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): void {
    assert.equal(NODES[id]?.kind === "question" || NODES[id]?.kind === "leaf", true, `missing node ${id}`);
    assert.equal(visiting.has(id), false, `cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const node = NODES[id];
    if (node.kind === "question") {
      assert.ok(node.options.length >= 2, `${id} needs options`);
      assert.equal(new Set(node.options.map((o) => o.id)).size, node.options.length);
      for (const option of node.options) dfs(option.next);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const symptom of SYMPTOM_IDS) dfs(SYMPTOM_ROOTS[symptom]);
  for (const edge of EDGES) {
    assert.ok(NODES[edge.from], `dangling from ${edge.from}`);
    assert.ok(NODES[edge.to], `dangling to ${edge.to}`);
  }
  assert.equal(visited.size, Object.keys(NODES).length);
});

test("all six main paths reach a leaf without looping", () => {
  for (const symptom of SYMPTOM_IDS) {
    const node = walkYes(symptom);
    assert.equal(node.kind, "leaf");
    assert.equal(node.symptom, symptom);
  }
});

test("every reachable leaf per symptom carries root cause, command, guide and related tools", () => {
  let total = 0;
  for (const symptom of SYMPTOM_IDS) {
    const leaves = leavesOf(symptom);
    assert.ok(leaves.length >= 2, `${symptom} has too few leaves`);
    for (const leaf of leaves) {
      total += 1;
      assert.equal(leaf.kind, "leaf");
      assert.equal(leaf.symptom, symptom);
      assert.ok(leaf.rootCause.length > 8);
      assert.ok(leaf.fixCommand.length > 8);
      assert.equal(leaf.guideHref, "/guides/category/troubleshoot");
      assert.ok(leaf.relatedTools.length >= 1);
      for (const href of leaf.relatedTools) assert.match(href, /^\/tools\/[a-z-]+$/);
    }
  }
  assert.equal(total, Object.values(NODES).filter((n) => n.kind === "leaf").length);
  assert.equal(reachableNodes("cuda-oom").some((n) => n.kind === "question"), true);
});

test("history stack records choices, stepBack pops exactly one, reset keeps symptom", () => {
  let session = createSession("cuda-oom");
  const root = session.history[0];
  session = advance(session, "yes");
  session = advance(session, "yes");
  assert.equal(session.history.length, 3);
  assert.deepEqual(choicesOf(session), ["yes", "yes"]);
  const back = stepBack(session);
  assert.equal(back.history.length, 2);
  assert.deepEqual(back.history, [root, "q-oom-2"]);
  assert.equal(session.history.length, 3, "stepBack must not mutate original session");
  const doubleBack = stepBack(back);
  assert.equal(doubleBack.history.length, 1);
  assert.deepEqual(stepBack(doubleBack).history, [root]);
  const fresh = reset(session);
  assert.equal(fresh.symptom, "cuda-oom");
  assert.deepEqual(fresh.history, [root]);
  assert.equal(currentNode(fresh)?.kind, "question");
});

test("invalid choices, advancing from a leaf and stepping past root are no-ops", () => {
  const session = createSession("cuda-oom");
  assert.equal(advance(session, "maybe"), session);
  assert.equal(advance(session, ""), session);
  const leafSession = advance(advance(advance(session, "yes"), "no"), "no");
  assert.equal(currentNode(leafSession)?.kind, "leaf");
  assert.equal(advance(leafSession, "yes"), leafSession);
  assert.equal(stepBack(session), session);
  assert.equal(currentNode({ symptom: null, history: [] }), null);
  assert.equal(advance({ symptom: null, history: [] }, "yes").history.length, 0);
});

test("URL deep link resolves legal symptom and path, rejects illegal branches", () => {
  const session = createSession("cuda-oom");
  const full = advance(advance(advance(session, "yes"), "no"), "no");
  assert.equal(currentNode(full)?.kind, "leaf");
  const query = sessionShareQuery(full);
  assert.deepEqual(sessionParams(full), { symptom: "cuda-oom", path: "yes,no,no" });
  const parsed = parseUrlState(query);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.symptom, "cuda-oom");
  assert.deepEqual(parsed.session.history, full.history);
  assert.equal(parsed.shareQuery, query);

  const rootOnly = parseUrlState("?symptom=cuda-oom");
  assert.equal(rootOnly.valid, true);
  assert.deepEqual(rootOnly.session.history, [SYMPTOM_ROOTS["cuda-oom"]]);
  assert.equal(parseUrlState("?symptom=cpu-fallback&path=yes,no").valid, true);
  const leafDeep = parseUrlState("?symptom=cuda-oom&path=yes,no,no");
  assert.equal(leafDeep.symptom, "cuda-oom");
  assert.deepEqual(sessionParams(leafDeep.session), { symptom: "cuda-oom", path: "yes,no,no" });
});

test("URL rejects unknown symptoms, unknown choices and cross-symptom jumps", () => {
  for (const search of [
    "?symptom=not-a-symptom",
    "?symptom=not-a-symptom&path=yes",
    "?symptom=cuda-oom&path=bogus",
    "?symptom=cuda-oom&path=yes,bogus",
    "?symptom=cuda-oom&path=yes,no,no,no",
    "?symptom=cuda-oom&path=q-cpu-2",
    "?symptom=ide-connection&path=yes,yes,yes,yes",
  ]) {
    const parsed = parseUrlState(search);
    assert.equal(parsed.valid, false, search);
  }
  const bad = parseUrlState("?symptom=cuda-oom&path=bogus");
  assert.deepEqual(bad.session.history, [SYMPTOM_ROOTS["cuda-oom"]]);
  assert.equal(bad.shareQuery, "");
  assert.deepEqual(parseUrlState("").session, { symptom: null, history: [] });
  assert.equal(parseUrlState("").valid, true);
});

test("URL schema round-trips all fields and keeps aliases stable", () => {
  assert.deepEqual(Object.keys(URL_SCHEMA), ["symptom", "path"]);
  assert.equal(URL_SCHEMA.symptom.kind, "enum");
  assert.equal(URL_SCHEMA.path.kind, "string");
  let session = createSession("multi-gpu-imbalance");
  session = advance(session, "no");
  const query = sessionShareQuery(session);
  assert.match(query, /^\?symptom=multi-gpu-imbalance&path=no$/);
  assert.equal(sessionShareQuery(createSession(null)), "");
  assert.equal(sessionShareQuery({} as never), "");
});

test("layout contains all reachable nodes and matching edges", () => {
  for (const symptom of SYMPTOM_IDS) {
    const layout = getTreeLayout(symptom);
    const ids = new Set(reachableNodes(symptom).map((node) => node.id));
    assert.equal(layout.nodes.length, ids.size);
    for (const node of layout.nodes) {
      assert.equal(ids.has(node.id), true);
      assert.ok(node.width > 0 && node.height > 0);
      assert.ok(node.x >= 0 && node.y >= 0);
      assert.ok(node.x + node.width <= layout.width);
      assert.ok(node.y + node.height <= layout.height);
    }
    const localEdges = EDGES.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    assert.equal(layout.edges.length, localEdges.length);
    for (const edge of layout.edges) {
      const from = layout.nodes.find((node) => node.id === edge.from);
      const to = layout.nodes.find((node) => node.id === edge.to);
      assert.equal(edge.x1, (from?.x ?? 0) + (from?.width ?? 0));
      assert.equal(edge.y1, (from?.y ?? 0) + (from?.height ?? 0) / 2);
      assert.equal(edge.x2, to?.x);
      assert.equal(edge.y2, (to?.y ?? 0) + (to?.height ?? 0) / 2);
    }
  }
  const forest = getTreeLayout();
  assert.equal(forest.nodes.length, Object.keys(NODES).length);
  assert.equal(forest.edges.length, EDGES.length);
});
