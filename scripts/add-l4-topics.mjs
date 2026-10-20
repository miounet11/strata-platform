#!/usr/bin/env node
/**
 * Appends the L4 task-guide topics that cover the long-tail searches we have no page for yet.
 * Idempotent: re-running replaces an entry with the same slug instead of duplicating it.
 *
 *   node scripts/add-l4-topics.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "apps/www/src/data/topics.json");
const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"];

const T = (en, zh, ja, de, fr, es, pt) => ({ en, zh, ja, de, fr, es, pt });

const NEW = [
  {
    slug: "cpu-only",
    title: T("Run a model without a GPU", "没有显卡也能跑", "GPU なしで動かす", "Ohne Grafikkarte laufen lassen", "Sans carte graphique", "Sin tarjeta gráfica", "Sem placa de vídeo"),
    body: T(
      "A CPU-only machine can run the smaller quants, just slowly: expect a few tokens per second rather than dozens. It is usable for batch jobs, summaries and overnight work, not for a live chat. Keep at least 32 GB of RAM — the weights are loaded there, not in VRAM.",
      "纯 CPU 也能跑小量化模型，但只有每秒几个 token，适合批处理、摘要、夜里跑的任务，不适合实时对话。内存至少 32 GB，因为权重加载在内存而不是显存。",
      "CPU だけでも小さい量子化モデルは動きますが、毎秒数トークン程度です。バッチ処理や要約、夜間の処理向けで、対話には向きません。重みは VRAM ではなくメモリに載るため、32 GB 以上を確保してください。",
      "Auch ohne GPU laufen die kleineren Quantisierungen — aber mit wenigen Token pro Sekunde. Geeignet für Stapelverarbeitung und Zusammenfassungen, nicht für Chat. Mindestens 32 GB RAM einplanen, denn die Gewichte liegen im Arbeitsspeicher.",
      "Sans GPU, les quantifications légères tournent, mais à quelques jetons par seconde. Utile pour du traitement par lots ou des résumés, pas pour discuter. Prévoir au moins 32 Go de RAM : les poids sont chargés en mémoire, pas en VRAM.",
      "Sin GPU funcionan las cuantizaciones pequeñas, a unos pocos tokens por segundo. Sirve para lotes, resúmenes y trabajos nocturnos, no para conversar. Reserva al menos 32 GB de RAM: los pesos van a memoria, no a VRAM.",
      "Sem GPU as quantizações menores rodam, mas a poucos tokens por segundo. Serve para lotes, resumos e tarefas noturnas, não para conversar. Reserve pelo menos 32 GB de RAM: os pesos ficam na memória, não na VRAM.",
    ),
  },
  {
    slug: "offline-setup",
    title: T("Install on a machine with no internet", "断网机器怎么装", "オフライン環境での導入", "Installation ohne Internet", "Installer hors ligne", "Instalar sin internet", "Instalar sem internet"),
    body: T(
      "Download the engine archive and the model file on a connected machine, copy both over, then run setup with the local paths. Nothing phones home: the installer only needs the files you brought. Verify the checksums before copying — a truncated model file looks like a crash.",
      "在有网的机器上下载引擎压缩包和模型文件，拷过去后用本地路径安装。安装过程不联网，只需要你带过去的文件。拷贝前先核对校验和，模型文件不完整会表现成崩溃。",
      "ネット接続のある端末でエンジンとモデルファイルを取得し、コピーしてからローカルのパスを指定してセットアップします。インストール時に外部通信は不要です。コピー前にチェックサムを確認してください。",
      "Engine-Archiv und Modelldatei auf einem verbundenen Rechner herunterladen, beides kopieren und das Setup mit lokalen Pfaden starten. Der Installer braucht kein Netz. Vor dem Kopieren die Prüfsummen vergleichen — eine abgeschnittene Modelldatei wirkt wie ein Absturz.",
      "Téléchargez l'archive du moteur et le modèle sur une machine connectée, copiez le tout, puis lancez l'installation avec les chemins locaux. Aucune connexion requise. Vérifiez les sommes de contrôle : un fichier tronqué ressemble à un plantage.",
      "Descarga el motor y el modelo en una máquina con red, cópialos y ejecuta la instalación con rutas locales. No necesita conexión. Comprueba las sumas de verificación: un archivo truncado parece un fallo.",
      "Baixe o motor e o modelo em uma máquina conectada, copie tudo e instale com caminhos locais. Não precisa de internet. Confira os checksums: um arquivo truncado parece um travamento.",
    ),
  },
  {
    slug: "dual-gpu",
    title: T("Two cards, one model", "双卡怎么配", "2 枚の GPU で動かす", "Zwei Karten, ein Modell", "Deux cartes, un modèle", "Dos tarjetas, un modelo", "Duas placas, um modelo"),
    body: T(
      "Splitting a model across two cards gives you more VRAM, not more speed — each token still crosses the link between them. It pays off when one card cannot hold the quant you want. Matching cards and a fast interconnect matter more than the total memory.",
      "双卡主要买来的是显存而不是速度，每个 token 都要经过卡间链路。只有单卡放不下目标量化档位时才值得。两张卡型号一致、互联带宽高，比总显存更重要。",
      "2 枚に分けると増えるのは VRAM で、速度ではありません。トークンごとにカード間リンクを往復します。1 枚に収まらない量子化を使いたいときだけ有効です。同型番と高速な接続のほうが総メモリより重要です。",
      "Zwei Karten bringen mehr VRAM, nicht mehr Tempo: Jedes Token läuft über die Verbindung zwischen ihnen. Sinnvoll, wenn eine Karte die gewünschte Quantisierung nicht fasst. Gleiche Modelle und eine schnelle Anbindung zählen mehr als die Gesamtmenge.",
      "Deux cartes apportent de la VRAM, pas de la vitesse : chaque jeton traverse la liaison. Utile seulement si une carte ne suffit pas. Des cartes identiques et une liaison rapide comptent plus que la mémoire totale.",
      "Dos tarjetas dan más VRAM, no más velocidad: cada token cruza el enlace. Solo compensa si una no cabe la cuantización. Importan más dos iguales y un enlace rápido que la memoria total.",
      "Duas placas dão mais VRAM, não mais velocidade: cada token cruza o enlace. Só vale se uma não couber a quantização. Importam mais duas iguais e um enlace rápido que a memória total.",
    ),
  },
  {
    slug: "context-length",
    title: T("How much context fits in VRAM", "上下文长度吃多少显存", "コンテキスト長と VRAM", "Kontextlänge und VRAM", "Longueur de contexte et VRAM", "Longitud de contexto y VRAM", "Tamanho de contexto e VRAM"),
    body: T(
      "Weights are only half the story: the KV cache grows with context and batch size, and it can rival the model itself at 128k. If you see an out-of-memory error after a long paste, lower the context before lowering the quant.",
      "权重只占一半，KV 缓存随上下文和并发增长，128k 时可能和模型本身一样大。长文本粘贴后爆显存，先降上下文长度，再考虑降量化档位。",
      "重みは半分にすぎません。KV キャッシュはコンテキストと並列数に比例して増え、128k ではモデル本体に匹敵します。長文で OOM になる場合は、量子化を下げる前にコンテキストを短くしてください。",
      "Die Gewichte sind nur die Hälfte: Der KV-Cache wächst mit Kontext und Batch-Größe und kann bei 128k so groß werden wie das Modell. Bei OOM nach langem Einfügen zuerst den Kontext senken, dann die Quantisierung.",
      "Les poids ne sont que la moitié : le cache KV croît avec le contexte et peut égaler le modèle à 128k. En cas d'OOM après un long collage, réduisez d'abord le contexte, pas la quantification.",
      "Los pesos son solo la mitad: la caché KV crece con el contexto y a 128k puede igualar al modelo. Si hay OOM tras pegar mucho texto, baja el contexto antes que la cuantización.",
      "Os pesos são só metade: o cache KV cresce com o contexto e a 128k pode igualar o modelo. Se der OOM após colar muito texto, reduza o contexto antes da quantização.",
    ),
  },
  {
    slug: "coding-assistant",
    title: T("Point your editor at a local model", "让编辑器用上本地模型", "エディタからローカルモデルを使う", "Editor mit lokalem Modell verbinden", "Brancher l'éditeur sur le modèle local", "Conectar el editor al modelo local", "Ligar o editor ao modelo local"),
    body: T(
      "The engine exposes an OpenAI-compatible endpoint, so any tool that lets you set a base URL works: point it at the local address, pick the model id from the models page, and leave the API key empty. Latency stays predictable because nothing leaves the machine.",
      "引擎提供兼容 OpenAI 的接口，任何能改 base URL 的工具都能接：指向本地地址，模型 id 从模型页抄，API key 留空。因为不出本机，延迟是稳定的。",
      "OpenAI 互換のエンドポイントを公開しているので、base URL を変更できるツールなら何でも接続できます。ローカルアドレスを指定し、モデル ID はモデル一覧から、API キーは空欄にします。",
      "Die Engine bietet einen OpenAI-kompatiblen Endpunkt: Jedes Werkzeug mit einstellbarer Basis-URL funktioniert. Lokale Adresse eintragen, Modell-ID aus der Modellliste übernehmen, API-Schlüssel leer lassen.",
      "Le moteur expose un point d'accès compatible OpenAI : tout outil avec une URL de base configurable fonctionne. Indiquez l'adresse locale, l'ID du modèle, et laissez la clé vide.",
      "El motor expone un endpoint compatible con OpenAI: sirve cualquier herramienta con URL base configurable. Pon la dirección local, el id del modelo y deja la clave vacía.",
      "O motor expõe um endpoint compatível com OpenAI: qualquer ferramenta com URL base configurável funciona. Use o endereço local, o id do modelo e deixe a chave vazia.",
    ),
  },
  {
    slug: "igpu-laptop",
    title: T("What a laptop iGPU can run", "核显笔记本能跑多大模型", "内蔵 GPU のノートで動くモデル", "Was eine iGPU im Notebook schafft", "Ce qu'un iGPU de portable peut faire", "Qué puede un iGPU de portátil", "O que um iGPU de notebook roda"),
    body: T(
      "Integrated graphics share system RAM, so capacity is fine but bandwidth is not: expect single-digit tokens per second on a 7-14B model. It is a good way to try the workflow offline before buying a card, not a daily driver.",
      "核显和内存共享，容量够但带宽不足，7-14B 模型大概每秒个位数 token。适合先熟悉流程，不适合日常主力。",
      "内蔵 GPU はメインメモリを共有するため容量は足りますが帯域が足りません。7〜14B で毎秒 1 桁台のトークンになります。購入前の試用向けで、常用には向きません。",
      "Integrierte Grafik teilt den Arbeitsspeicher: Kapazität reicht, Bandbreite nicht. Bei 7–14B sind einstellige Token-Raten normal. Gut zum Ausprobieren, nicht für den Alltag.",
      "Le GPU intégré partage la mémoire système : la capacité suffit, la bande passante non. Comptez quelques jetons par seconde sur du 7-14B. Pour essayer, pas pour tous les jours.",
      "La GPU integrada comparte la RAM: capacidad sí, ancho de banda no. Con 7-14B verás unos pocos tokens por segundo. Sirve para probar, no para el día a día.",
      "O iGPU compartilha a RAM: capacidade ok, banda não. Com 7-14B fica em poucos tokens por segundo. Serve para testar, não para o dia a dia.",
    ),
  },
  {
    slug: "amd-rocm",
    title: T("Running on an AMD card", "AMD 显卡怎么跑", "AMD GPU で動かす", "Mit einer AMD-Karte laufen", "Fonctionner sur AMD", "Funcionar con AMD", "Rodar em placa AMD"),
    body: T(
      "AMD cards work through the HIP build rather than CUDA, and the ROCm version must match your driver. RDNA3 and newer are well covered; older Polaris cards are not worth the trouble. If a model loads but crawls, check that the HIP build is the one that started.",
      "AMD 显卡走 HIP 而不是 CUDA，ROCm 版本要匹配驱动。RDNA3 及以上支持较好，Polaris 老卡不建议折腾。如果模型能加载但很慢，先确认跑的是 HIP 版本。",
      "AMD は CUDA ではなく HIP ビルドを使い、ROCm のバージョンはドライバと一致させる必要があります。RDNA3 以降は良好、Polaris 世代は現実的ではありません。遅い場合は HIP ビルドが起動しているか確認してください。",
      "AMD-Karten laufen über den HIP-Build statt CUDA, und die ROCm-Version muss zum Treiber passen. RDNA3 und neuer sind gut abgedeckt, Polaris lohnt nicht. Wenn alles lädt, aber kriecht: prüfen, ob der HIP-Build gestartet ist.",
      "Les cartes AMD passent par le build HIP, pas CUDA, et la version ROCm doit correspondre au pilote. RDNA3 et plus sont bien couverts ; Polaris n'en vaut pas la peine. Si tout charge mais rame, vérifiez le build HIP.",
      "Las tarjetas AMD usan el build HIP, no CUDA, y la versión de ROCm debe coincidir con el driver. RDNA3 y posteriores van bien; Polaris no merece la pena. Si carga pero va lento, comprueba el build HIP.",
      "Placas AMD usam o build HIP, não CUDA, e a versão do ROCm precisa casar com o driver. RDNA3 e acima vão bem; Polaris não vale a pena. Se carrega mas arrasta, confira o build HIP.",
    ),
  },
  {
    slug: "privacy-audit",
    title: T("Prove that nothing leaves your machine", "怎么验证数据没外传", "外部送信がないことの確認", "Nachweisen, dass nichts rausgeht", "Prouver que rien ne sort", "Comprobar que nada sale", "Provar que nada sai"),
    body: T(
      "Run the engine with networking disabled and use it normally: if it still answers, the model and the conversation are local. For a stricter check, watch outbound connections while you chat — you should only see the local port. Anything else is worth investigating.",
      "把机器断网再用：还能正常回答，说明模型和对话都在本地。更严格的做法是聊天时观察出站连接，应该只看到本地端口，出现别的就值得查。",
      "ネットワークを切った状態で使ってみてください。それでも応答するなら、モデルと会話はローカルにあります。より厳密には、対話中の外向き接続を監視し、ローカルポート以外が出ないことを確認します。",
      "Netzwerk abschalten und normal weiterarbeiten: Antwortet es noch, sind Modell und Gespräch lokal. Strenger: ausgehende Verbindungen beim Chatten beobachten — außer dem lokalen Port sollte nichts erscheinen.",
      "Coupez le réseau et continuez : si ça répond, le modèle et la conversation sont locaux. Plus strict : surveillez les connexions sortantes pendant la discussion, seul le port local doit apparaître.",
      "Desconecta la red y sigue usándolo: si responde, el modelo y la conversación son locales. Más estricto: observa las conexiones salientes; solo debe aparecer el puerto local.",
      "Desligue a rede e continue usando: se responder, o modelo e a conversa são locais. Mais rigoroso: observe as conexões de saída; só o porto local deve aparecer.",
    ),
  },
  {
    slug: "speed-expectations",
    title: T("How fast should it be", "实际速度大概多少", "実際どれくらい速いのか", "Wie schnell ist das wirklich", "À quelle vitesse", "Qué velocidad esperar", "Qual velocidade esperar"),
    body: T(
      "Reading runs about forty times faster than writing: a card doing 4000 read tok/s writes around 100 tok/s. That is normal, not a misconfiguration — generation is sequential, prompt processing is parallel. Compare your card against the benchmark table before assuming something is wrong.",
      "读比写快大约四十倍：读 4000 tok/s 的卡，写大约 100 tok/s。这是正常现象，不是配置错了——生成是逐 token 的，预处理提示词是并行的。先对照基准表再怀疑出问题。",
      "読みは書きより約 40 倍速い。読み 4000 tok/s のカードは書き約 100 tok/s になります。設定ミスではなく、生成が逐次処理・プロンプト処理が並列だからです。異常を疑う前にベンチマーク表と比べてください。",
      "Lesen ist rund 40-mal schneller als Schreiben: 4000 tok/s lesend bedeuten etwa 100 tok/s schreibend. Das ist normal — Generierung läuft sequenziell, Prompt-Verarbeitung parallel. Erst mit der Benchmark-Tabelle vergleichen, bevor Sie einen Fehler vermuten.",
      "La lecture est environ 40 fois plus rapide que l'écriture : 4000 tok/s en lecture donnent ~100 tok/s en écriture. C'est normal — la génération est séquentielle, le traitement du prompt parallèle. Comparez au tableau de benchmarks avant de suspecter une panne.",
      "La lectura es unas 40 veces más rápida que la escritura: 4000 tok/s de lectura dan ~100 tok/s de escritura. Es normal: la generación es secuencial y el procesado del prompt paralelo. Compara con la tabla de benchmarks antes de sospechar un fallo.",
      "Ler é cerca de 40 vezes mais rápido que escrever: 4000 tok/s de leitura dão ~100 tok/s de escrita. É normal — a geração é sequencial e o processamento do prompt é paralelo. Compare com a tabela de benchmarks antes de suspeitar de defeito.",
    ),
  },
  {
    slug: "vram-not-enough",
    title: T("Out of VRAM, what next", "显存不够怎么办", "VRAM が足りないとき", "Zu wenig VRAM", "Plus assez de VRAM", "Sin VRAM suficiente", "Sem VRAM suficiente"),
    body: T(
      "Drop one quant level first — Q5_K_M to Q4_K_M typically frees a third of the memory for a small quality loss. Shrinking context also helps, because the KV cache grows with it. Only then consider a smaller model or a second card.",
      "先降一档量化：从 Q5_K_M 降到 Q4_K_M 通常省三分之一显存，质量损失有限。缩短上下文也能省，因为 KV cache 随长度增长。最后才考虑换小模型或加卡。",
      "まず量子化を一段下げます。Q5_K_M から Q4_K_M で約 3 分の 1 のメモリが減り、品質低下はわずかです。コンテキストを短くするのも有効（KV キャッシュが伸びるため）。小型モデルや 2 枚目は最後の手段です。",
      "Zuerst eine Quantisierungsstufe tiefer: Q5_K_M auf Q4_K_M spart meist ein Drittel Speicher bei geringem Qualitätsverlust. Auch ein kürzerer Kontext hilft, weil der KV-Cache mitwächst. Erst danach kleineres Modell oder zweite Karte erwägen.",
      "Baissez d'abord d'un cran de quantization : Q5_K_M vers Q4_K_M libère souvent un tiers de mémoire pour une perte minime. Réduire le contexte aide aussi, le cache KV grandit avec lui. Envisagez ensuite un modèle plus petit ou une seconde carte.",
      "Baja primero un nivel de cuantización: de Q5_K_M a Q4_K_M suele liberar un tercio de memoria con pérdida mínima. Acortar el contexto también ayuda, porque la caché KV crece con él. Después considera un modelo menor o una segunda tarjeta.",
      "Baixe primeiro um nível de quantização: de Q5_K_M para Q4_K_M costuma liberar um terço da memória com perda mínima. Encurtar o contexto também ajuda, pois o cache KV cresce com ele. Só depois considere um modelo menor ou uma segunda placa.",
    ),
  },
  {
    slug: "first-run-slow",
    title: T("The first answer is slow", "第一次回答特别慢", "最初の応答が遅い", "Die erste Antwort ist langsam", "La première réponse est lente", "La primera respuesta es lenta", "A primeira resposta é lenta"),
    body: T(
      "The first request loads the weights from disk into memory, so it can take seconds to a minute depending on the drive. Later requests reuse them. If every answer is slow, the model is being swapped in and out — that means the machine does not have enough RAM for the quant you chose.",
      "第一次请求要把权重从磁盘读进内存，视硬盘速度可能要几秒到一分钟；之后会复用。如果每次都慢，说明模型在被反复换入换出，也就是内存装不下你选的量化档位。",
      "最初のリクエストは重みをディスクからメモリに読み込むため、数秒から 1 分かかることがあります。以降は再利用されます。毎回遅い場合はモデルが入れ替えられており、選んだ量子化に対して RAM が足りません。",
      "Die erste Anfrage lädt die Gewichte von der Platte in den Speicher — je nach Laufwerk Sekunden bis Minuten. Danach werden sie wiederverwendet. Ist jede Antwort langsam, wird das Modell ausgelagert: zu wenig RAM für die gewählte Quantisierung.",
      "La première requête charge les poids du disque en mémoire : de quelques secondes à une minute selon le disque. Ensuite ils sont réutilisés. Si chaque réponse est lente, le modèle est échangé en permanence — pas assez de RAM pour le quant choisi.",
      "La primera petición carga los pesos del disco a memoria: de segundos a un minuto según el disco. Después se reutilizan. Si todas tardan, el modelo se está intercambiando: falta RAM para el quant elegido.",
      "A primeira requisição carrega os pesos do disco para a memória: de segundos a um minuto conforme o disco. Depois são reutilizados. Se todas demoram, o modelo está sendo trocado — falta RAM para o quant escolhido.",
    ),
  },
  {
    slug: "api-compatibility",
    title: T("Point your tools at it", "接入现有工具", "既存ツールから使う", "Bestehende Tools anbinden", "Brancher vos outils", "Conecta tus herramientas", "Ligue suas ferramentas"),
    body: T(
      "The engine speaks the OpenAI chat-completions format on a local port, so anything that accepts a custom base URL works: editor plugins, chat front-ends, scripts using the official SDK. Set the base URL to the local address and leave the API key empty or use any placeholder.",
      "引擎在本地端口上提供 OpenAI chat-completions 格式，任何支持自定义 base URL 的工具都能接：编辑器插件、聊天前端、用官方 SDK 的脚本。把 base URL 指向本地地址，API key 留空或填任意占位符。",
      "エンジンはローカルポートで OpenAI chat-completions 形式を提供します。カスタム base URL を受け付けるものなら何でも使えます：エディタ拡張、チャット UI、公式 SDK のスクリプト。base URL をローカルに向け、API キーは空かダミーで構いません。",
      "Die Engine spricht das OpenAI-chat-completions-Format auf einem lokalen Port. Alles, was eine eigene Base-URL akzeptiert, funktioniert: Editor-Plugins, Chat-Oberflächen, Skripte mit dem offiziellen SDK. Base-URL auf die lokale Adresse setzen, API-Key leer oder als Platzhalter.",
      "Le moteur expose le format OpenAI chat-completions sur un port local. Tout ce qui accepte une base URL personnalisée fonctionne : extensions d'éditeur, interfaces de chat, scripts avec le SDK officiel. Pointez la base URL vers l'adresse locale, clé API vide ou factice.",
      "El motor expone el formato OpenAI chat-completions en un puerto local. Funciona cualquier cosa que acepte una base URL propia: extensiones de editor, interfaces de chat, scripts con el SDK oficial. Apunta la base URL a la dirección local y deja la clave vacía o con un valor ficticio.",
      "O motor expõe o formato OpenAI chat-completions numa porta local. Funciona qualquer coisa que aceite uma base URL própria: extensões de editor, interfaces de chat, scripts com o SDK oficial. Aponte a base URL para o endereço local e deixe a chave vazia ou com um valor fictício.",
    ),
  },
  {
    slug: "windows-vs-linux",
    title: T("Windows or Linux", "Windows 还是 Linux", "Windows か Linux か", "Windows oder Linux", "Windows ou Linux", "Windows o Linux", "Windows ou Linux"),
    body: T(
      "Both are supported and reach similar speed on the same card. Windows is the shorter path: one installer, no driver surgery. Linux is easier to script and to leave running as a service. Pick by how you want to operate it, not by performance.",
      "两边都支持，同一张卡速度接近。Windows 上手更快：一个安装包，不用折腾驱动。Linux 更适合脚本化和长期作为服务运行。按你的运维习惯选，不要按性能选。",
      "どちらも対応しており、同じカードなら速度はほぼ同じです。Windows は導入が短く、インストーラー一つで済みます。Linux はスクリプト化やサービスとしての常時稼働に向きます。性能ではなく運用方法で選んでください。",
      "Beide werden unterstützt und erreichen auf derselben Karte ähnliche Geschwindigkeit. Windows ist der kürzere Weg: ein Installer, kein Treibergebastel. Linux lässt sich leichter skripten und als Dienst dauerhaft betreiben. Nach Betriebsart wählen, nicht nach Leistung.",
      "Les deux sont pris en charge avec des vitesses proches sur la même carte. Windows est plus court : un installateur, pas de chirurgie de pilotes. Linux se scripte mieux et tourne plus facilement en service. Choisissez selon l'exploitation, pas la performance.",
      "Ambos son compatibles y alcanzan velocidad similar en la misma tarjeta. Windows es más corto: un instalador y sin tocar controladores. Linux se automatiza mejor y es más fácil dejarlo como servicio. Elige por operación, no por rendimiento.",
      "Ambos são suportados com velocidade parecida na mesma placa. Windows é mais curto: um instalador, sem mexer em drivers. Linux é mais fácil de automatizar e de manter como serviço. Escolha pela operação, não pelo desempenho.",
    ),
  },
  {
    slug: "power-bill",
    title: T("What it costs to run", "长期跑要多少电费", "動かし続ける電気代", "Was der Betrieb kostet", "Combien ça coûte", "Cuánto cuesta mantenerlo", "Quanto custa manter"),
    body: T(
      "A card pulling 400 watts for an hour uses 0.4 kWh. At a typical household rate that is a few cents per hour of continuous generating — usually far below the API price for the same work. Idle costs almost nothing, so leaving it running is fine.",
      "一张 400 瓦的卡跑一小时用 0.4 度电。按常见民用电价，连续生成一小时只要几毛钱，通常远低于同等工作量走 API 的价格。空闲几乎不耗电，长期开着也没问题。",
      "400 W のカードを 1 時間動かすと 0.4 kWh です。一般的な家庭用電気料金なら連続生成 1 時間で数十円程度、同じ作業を API で行うより通常ずっと安くなります。アイドル時はほぼ消費しないので、つけっぱなしでも問題ありません。",
      "Eine Karte mit 400 Watt verbraucht pro Stunde 0,4 kWh. Bei üblichem Haushaltstarif sind das wenige Cent pro Stunde Dauerbetrieb — meist deutlich unter dem API-Preis für dieselbe Arbeit. Im Leerlauf kostet es fast nichts, laufen lassen ist unproblematisch.",
      "Une carte à 400 watts consomme 0,4 kWh par heure. Au tarif domestique courant, cela fait quelques centimes par heure de génération continue — bien moins que le prix API pour le même travail. Au repos, la consommation est quasi nulle.",
      "Una tarjeta de 400 vatios consume 0,4 kWh por hora. Con una tarifa doméstica típica son unos céntimos por hora de generación continua, muy por debajo del precio de API por el mismo trabajo. En reposo casi no consume.",
      "Uma placa de 400 watts consome 0,4 kWh por hora. Com a tarifa residencial típica são alguns centavos por hora de geração contínua — bem abaixo do preço de API pelo mesmo trabalho. Em repouso quase não consome.",
    ),
  },
  {
    slug: "choosing-quant",
    title: T("Which quant to pick", "量化档位怎么选", "量子化の選び方", "Welche Quantisierung", "Quel quantization choisir", "Qué cuantización elegir", "Qual quantização escolher"),
    body: T(
      "Start at Q4_K_M: it is the usual sweet spot between size and quality, and it is what most reports use. Move up to Q5 or Q6 only if you have headroom and can measure a difference on your own tasks. Below Q4 the loss becomes noticeable in code and long reasoning.",
      "先从 Q4_K_M 开始：这是体积与质量的常见平衡点，多数测评也用它。只有在显存有余量、且在自己的任务上能量出差异时，再往 Q5/Q6 升。低于 Q4，代码和长链推理的损失会明显。",
      "まず Q4_K_M から。サイズと品質のバランスが良く、多くの報告もこれを使っています。余裕があり、自分のタスクで差を測れる場合だけ Q5/Q6 に上げてください。Q4 未満はコードや長い推論で劣化が目立ちます。",
      "Beginnen Sie mit Q4_K_M: der übliche Kompromiss aus Größe und Qualität, und Basis der meisten Berichte. Erst auf Q5/Q6 gehen, wenn Reserve da ist und Sie auf Ihren Aufgaben einen Unterschied messen. Unter Q4 wird der Verlust bei Code und langem Schlussfolgern deutlich.",
      "Commencez par Q4_K_M : le compromis habituel entre taille et qualité, utilisé par la plupart des retours. Montez en Q5/Q6 seulement avec de la marge et si vous mesurez une différence sur vos tâches. Sous Q4, la perte devient visible en code et en raisonnement long.",
      "Empieza por Q4_K_M: el equilibrio habitual entre tamaño y calidad, y el que usan la mayoría de los reportes. Sube a Q5/Q6 solo si tienes margen y mides diferencia en tus tareas. Por debajo de Q4 la pérdida se nota en código y razonamiento largo.",
      "Comece por Q4_K_M: o equilíbrio usual entre tamanho e qualidade, e o que a maioria dos relatos usa. Suba para Q5/Q6 só se houver folga e você medir diferença nas suas tarefas. Abaixo de Q4 a perda fica visível em código e raciocínio longo.",
    ),
  },
];

const data = JSON.parse(readFileSync(FILE, "utf8"));
const bySlug = new Map(data.topics.map((t) => [t.slug, t]));
let added = 0;
let replaced = 0;

for (const item of NEW) {
  const entry = { slug: item.slug, status: "live", locales: LOCALES, filter: null, title: item.title, body: item.body };
  if (bySlug.has(item.slug)) replaced++;
  else added++;
  bySlug.set(item.slug, entry);
}

data.topics = [...bySlug.values()];
writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log(`[l4-topics] added ${added}, replaced ${replaced} → ${data.topics.length} topics`);
