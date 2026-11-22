/**
 * Adds the DevDock-AI/Speedy topic and groups it with the upstream topic under the
 * "ecosystem" column. Idempotent: replaces an existing speedy-fork entry.
 * Run: node scripts/add-speedy-topic.mjs
 */
import fs from 'node:fs';

const FILE = new URL('../apps/www/src/data/topics.json', import.meta.url);

const raw = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
// guard: the file is authored as 2-space JSON; fail loudly if that ever changes
if (JSON.stringify(data, null, 2) + '\n' !== raw) {
  throw new Error('topics.json is not canonical 2-space JSON; use a textual insert instead');
}

const L = (en, zh, ja, de, fr, es, pt) => ({ en, zh, ja, de, fr, es, pt });

const speedy = {
  slug: 'devdock-speedy',
  status: 'live',
  column: 'ecosystem',
  locales: ['en', 'zh', 'ja', 'de', 'fr', 'es', 'pt'],
  filter: null,
  title: L(
    'Speedy — the tuned Strata fork',
    'Speedy — Strata 的调优分支',
    'Speedy — Strata のチューニングフォーク',
    'Speedy — der getunte Strata-Fork',
    'Speedy — le fork optimisé de Strata',
    'Speedy — el fork afinado de Strata',
    'Speedy — o fork ajustado do Strata',
  ),
  body: L(
    'DevDock-AI/Speedy is a measured, tuned fork of Niko1221/Strata for Qwen3.8-Flash-Next (125B MoE): 229K native context plus a 1M preset on one or two RTX 3080 10GB cards. Every change must pass same-window A/B (ABBA order), a stated noise floor and three quality gates — token alignment, eight coding tasks, and 90K–1M needle recall — with adopted and rejected tweaks logged in TUNING-HISTORY.md. It reports +65–212% prefill and +20–55% decode over Strata 0.1.45, and adds per-card presets, a dual-card layer-split setup and an OpenAI- and Anthropic-compatible server. It ships its own non-commercial licence instead of upstream MIT; the speed figures are the fork\'s Linux + gpu-unlock measurements, not this site\'s benchmark table.',
    'DevDock-AI/Speedy 是 Niko1221/Strata 的调优分支，主打「先测量再合并」：跑 Qwen3.8-Flash-Next（125B MoE），229K 原生上下文、1M 档位预设，用 1~2 张 RTX 3080 10GB。每项改动都要过同窗口 A/B（ABBA 顺序）、声明噪声底，以及三道质量门——token 对齐、8 个编码任务、90K~1M 长上下文 needle recall；采纳与否决都记在 TUNING-HISTORY.md。相对 Strata 0.1.45 自报 prefill +65%~+212%、decode +20%~+55%，并加了按卡型预设、双卡 layer-split 配置、OpenAI 与 Anthropic 双兼容服务端。它把上游的 MIT 换成了自有非商用许可；这些速度是该分支在 Linux + gpu-unlock 下的自测，不是本站基准表。',
    'DevDock-AI/Speedy は Niko1221/Strata を「測ってから取り込む」方針でチューニングしたフォークです。Qwen3.8-Flash-Next（125B MoE）を 1〜2 枚の RTX 3080 10GB で動かし、229K のネイティブコンテキストと 1M プリセットを備えます。変更は同一ウィンドウの A/B（ABBA 順）、明示したノイズ下限、トークン整合・8 つのコーディング課題・90K〜1M の needle recall という 3 つの品質ゲートを通す必要があり、採用・却下は TUNING-HISTORY.md に記録されます。Strata 0.1.45 比で prefill +65〜212%、decode +20〜55% を報告し、カード別プリセット、2 枚構成の layer-split、OpenAI / Anthropic 互換サーバーを追加しています。ライセンスは上流の MIT ではなく独自の非商用ライセンス。速度は同フォークの Linux + gpu-unlock での自測値であり、本サイトのベンチマーク表ではありません。',
    'DevDock-AI/Speedy ist ein gemessener, getunter Fork von Niko1221/Strata für Qwen3.8-Flash-Next (125B MoE): 229K nativer Kontext plus 1M-Preset auf ein oder zwei RTX 3080 10GB. Jede Änderung muss A/B im selben Fenster (ABBA-Reihenfolge), eine genannte Rauschgrenze und drei Qualitätsgates bestehen – Token-Abgleich, acht Coding-Aufgaben und 90K–1M Needle-Recall; angenommene und verworfene Eingriffe stehen in TUNING-HISTORY.md. Gegenüber Strata 0.1.45 werden +65–212 % Prefill und +20–55 % Decode berichtet, dazu Presets je Karte, ein Layer-Split für zwei Karten und ein OpenAI- und Anthropic-kompatibler Server. Statt upstream MIT gilt eine eigene Non-Commercial-Lizenz; die Zahlen sind eigene Messungen unter Linux + gpu-unlock, nicht die Benchmark-Tabelle dieser Site.',
    'DevDock-AI/Speedy est un fork mesuré et optimisé de Niko1221/Strata pour Qwen3.8-Flash-Next (125B MoE) : 229K de contexte natif et un preset 1M sur une ou deux RTX 3080 10GB. Chaque changement doit passer un A/B dans la même fenêtre (ordre ABBA), un plancher de bruit annoncé et trois garde-fous — alignement des tokens, huit tâches de code et rappel needle 90K–1M ; acceptations et rejets sont consignés dans TUNING-HISTORY.md. Il annonce +65–212 % de prefill et +20–55 % de decode face à Strata 0.1.45, et ajoute des presets par carte, un layer-split double carte et un serveur compatible OpenAI et Anthropic. Sa licence non commerciale remplace le MIT d’amont ; les chiffres sont ses mesures Linux + gpu-unlock, pas le tableau de benchmarks de ce site.',
    'DevDock-AI/Speedy es un fork medido y afinado de Niko1221/Strata para Qwen3.8-Flash-Next (125B MoE): 229K de contexto nativo y un preset de 1M en una o dos RTX 3080 10GB. Cada cambio debe pasar un A/B en la misma ventana (orden ABBA), un suelo de ruido declarado y tres puertas de calidad — alineación de tokens, ocho tareas de código y needle recall de 90K–1M — con lo adoptado y rechazado registrado en TUNING-HISTORY.md. Reporta +65–212 % de prefill y +20–55 % de decode frente a Strata 0.1.45, y añade presets por tarjeta, layer-split para dos tarjetas y un servidor compatible con OpenAI y Anthropic. Sustituye el MIT upstream por una licencia no comercial propia; las cifras son sus mediciones en Linux + gpu-unlock, no la tabla de benchmarks de este sitio.',
    'DevDock-AI/Speedy é um fork medido e ajustado do Niko1221/Strata para o Qwen3.8-Flash-Next (125B MoE): 229K de contexto nativo e um preset de 1M em uma ou duas RTX 3080 10GB. Cada mudança precisa passar por A/B na mesma janela (ordem ABBA), um piso de ruído declarado e três gates de qualidade — alinhamento de tokens, oito tarefas de código e needle recall de 90K–1M — com adoções e rejeições registradas em TUNING-HISTORY.md. Reporta +65–212% de prefill e +20–55% de decode sobre o Strata 0.1.45, e acrescenta presets por placa, layer-split para duas placas e servidor compatível com OpenAI e Anthropic. Substitui o MIT upstream por uma licença não comercial própria; os números são medições do fork em Linux + gpu-unlock, não a tabela de benchmarks deste site.',
  ),
  links: [
    { href: 'https://github.com/DevDock-AI/Speedy', label: L('DevDock-AI/Speedy', 'DevDock-AI/Speedy', 'DevDock-AI/Speedy', 'DevDock-AI/Speedy', 'DevDock-AI/Speedy', 'DevDock-AI/Speedy', 'DevDock-AI/Speedy') },
    { href: '/topics/niko-strata', label: L('Upstream Strata', '上游 Strata', '上流の Strata', 'Upstream Strata', 'Strata en amont', 'Strata upstream', 'Strata upstream') },
    { href: '/benchmarks', label: L('Our benchmark table', '本站基准表', '本サイトのベンチマーク表', 'Unsere Benchmark-Tabelle', 'Notre tableau de benchmarks', 'Nuestra tabla de benchmarks', 'Nossa tabela de benchmarks') },
  ],
  evidence: 'https://github.com/DevDock-AI/Speedy',
  importedAt: '2026-11-15',
};

// Upstream topic belongs to the same column.
const upstream = data.topics.find((t) => t.slug === 'niko-strata');
if (!upstream) throw new Error('niko-strata topic missing');
upstream.column = 'ecosystem';

const idx = data.topics.findIndex((t) => t.slug === speedy.slug);
if (idx === -1) data.topics.push(speedy);
else data.topics[idx] = speedy;

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('added devdock-speedy; column=ecosystem on it and on niko-strata');
