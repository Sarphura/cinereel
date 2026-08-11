# HTML 报告格式

架构评审以单一自包含的 HTML 文件渲染到 OS 临时目录。Tailwind 与 Mermaid 都通过 CDN 引入。Mermaid 负责图状结构的可靠渲染；手工 div 与内联 SVG 负责更具编辑感的视觉（质量图、横截面）。两者混用——不要全靠 Mermaid，否则会显得千篇一律。

## 语言与术语

- HTML 文档的 `lang` 设为 `zh-CN`；页面标题、图例、候选卡片字段、推荐强度标签、Before/After 图节点与文案、Top recommendation 等所有用户可见文本使用简体中文。
- HTML 元素的 `class`/`id`、CSS 选择器、Mermaid 节点 ID 等技术性标识符保留英文原文。
- 推荐强度标签中文化：`Strong` → “强烈推荐”、`Worth exploring` → “值得探索”、`Speculative` → “试探性”。
- 架构术语保留英文：`Module`、`Interface`、`Implementation`、`Depth`、`Seam`、`Adapter`、`Leverage`、`Locality`、`deep`、`shallow`。
- 依赖类别（`in-process`、`local-substitutable`、`ports & adapters`、`mock`）保留英文。

## 脚手架

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>架构评审 — {{仓库名}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* Tailwind 未覆盖干净的部分用一个小的自定义层补齐：
         虚线 Seam、手绘感的箭头头部，等等。 */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## 页眉

仓库名、日期，以及一个紧凑的图例：实线框 = Module，虚线 = Seam，红色箭头 = 泄漏，粗深色框 = 深层 Module。不要写导语段——直接进入候选。

## 候选卡片

图是主角。文字要稀疏、平实，并直接使用 `/codebase-design` 技能中的词汇，不要刻意修饰。

每个候选为一个 `<article>`：

- **Title**——简短，命名此次加深（例如“收拢 Order intake 流水线”）。
- **Badge row**——推荐强度（`强烈推荐` = 翠绿，`值得探索` = 琥珀，`试探性` = 石板灰），外加一个依赖类别标签（`in-process`、`local-substitutable`、`ports & adapters`、`mock`）。
- **Files**——等宽列表，`font-mono text-sm`。
- **Before / After diagram**——核心。左右两列并排。详见下方模式。
- **Problem**——一句话。当前哪里痛。
- **Solution**——一句话。变化是什么。
- **Wins**——要点，每条 ≤6 个字。例如“测试只需一个 Interface”“Pricing 逻辑不再泄漏”“删除 4 个浅层包装”。
- **ADR 提示框**（如适用）——琥珀色背景框内一行说明。

不要写解释性段落。如果一张图需要一段文字才能看懂，那就重画它。

## 图示模式

挑出最契合候选的模式。混合使用它们。不要让每张图看起来都一样——多样性本身就是要点。

### Mermaid 图（依赖/调用流的主力）

当要点是“X 调用 Y 再调用 Z，看看这一团乱麻”时，使用 Mermaid 的 `flowchart` 或 `graph`。用 Tailwind 卡片包裹，避免突兀。用 classDef 把泄漏边染红、把深层 Module 染深。时序图适合表达“Before：6 次往返；After：1 次”。

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### 手工盒子与箭头（Mermaid 布局不听话时）

Module 用带边框与标签的 `<div>` 表示。箭头用内联 SVG 的 `<line>` 或 `<path>` 元素，绝对定位在相对定位的容器上。当你想要 After 图表现为“一个粗边框深层 Module、内部细节灰显”时采用它——Mermaid 渲染不出这种分量。

### 横截面（适合分层式浅层）

堆叠水平条带（`h-12 border-l-4`）来展示一次调用穿过的层级。Before：6 条细层，每条几乎不做事。After：1 条粗条，标注合并后的职责。

### 质量图（适合“接口与实现等宽”）

每个 Module 用两个矩形表示：一个表示 Interface 表面积，一个表示 Implementation。Before：Interface 矩形几乎与 Implementation 矩形等高（浅层）。After：Interface 矩形矮、Implementation 矩形高（深层）。

### 调用图折叠

Before：一个函数调用树，渲染为嵌套方框。After：同一棵树折叠为一个方框，原来的内部调用以淡色显示在内部。

## 样式指引

- 编辑感优先，不要企业仪表板风。留白要慷慨。标题可选用衬线字体（`font-serif` 与 stone/slate 配色相得益彰）。
- 配色克制：一个主色（翠绿或靛蓝）+ 红色用于泄漏 + 琥珀用于警示。
- 图的高度保持在 ~320px，让 Before/After 能舒适地并排显示而不滚动。
- 图内的 Module 标签使用 `text-xs uppercase tracking-wider`——应当读起来像示意，而不是 UI。
- 唯一的外链脚本只有 Tailwind CDN 与 Mermaid ESM 引入。报告其余部分保持静态——没有应用代码，没有除 Mermaid 自身渲染之外的交互。

## Top recommendation 段落

一张更大的卡片。候选名、一句话理由、锚链接到该卡片。仅此而已。

## 语气

平实、简洁——但架构名词与动词直接来自 `/codebase-design` 技能。简洁不是漂移的借口。

**精确使用：** Module、Interface、Implementation、Depth、deep、shallow、Seam、Adapter、Leverage、Locality。

**不得替换：** component、service、unit（用于 Module）· API、signature（用于 Interface）· boundary（用于 Seam）· layer、wrapper（当你想表达 Module 时）。

**贴合风格的措辞：**

- “Order intake module 是浅层的——接口几乎与实现一样复杂。”
- “Pricing 越过 Seam 泄漏出来。”
- “加深：一个 Interface，一处可测。”
- “两个 Adapter 证明了这个 Seam 值得存在：生产用 HTTP，测试用 in-memory。”

**Wins 要点**用词汇表中的术语命名收益：*“Locality：bug 集中在一个 Module”*、*“Leverage：一个 Interface，N 个调用点”*、*“Interface 收缩，Implementation 吸收掉那些包装”*。不要写“更易维护”“更干净的代码”——这些词不在词汇表里，也不配出现。

不要犹豫、不要清嗓门、不要写“值得注意的是……”。一句话能写成要点就写成要点。要点能砍就砍。一个术语不在 `/codebase-design` 词汇表里时，先去那里找现成的，再考虑新造。