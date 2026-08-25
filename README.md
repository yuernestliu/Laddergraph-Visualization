# Laddergraph Visualization

一个面向 Laddergraph `.gv` / `.dot` 文件的**纯前端交互式浏览器**（不是通用图编辑器）。

Graphviz 通过 WebAssembly 在用户浏览器的模块 Worker 中运行，前端再在清洗后的 SVG 上做交互：
连通网络切换、节点点击上下游高亮、层级裁切、最小网络规模过滤、缩放平移、节点尺寸映射、
节点基因信息展示与导出。用户选择的 DOT 只在本机浏览器中处理，不会上传到 GitHub 或其它服务器。

GitHub Pages 启用后的公开地址：<https://yuernestliu.github.io/Laddergraph-Visualization/>。

---

## 1. 运行

### 开发依赖

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | 24+ | 本地开发、测试和生产构建 |
| npm | 随 Node.js | 使用已提交的 `package-lock.json` 复现依赖 |

使用者访问部署好的网页时不需要安装 Node.js、Python 或系统 Graphviz。

### 启动

```bash
npm ci
npm run dev
```

然后打开 Vite 输出的本地地址（通常是 <http://127.0.0.1:5173/Laddergraph-Visualization/>）。
停止服务时在终端按 `Ctrl+C`。

> 不建议直接双击 `index.html`。浏览器的 `file://` 安全限制会阻止模块、Worker 和示例资源正常加载。

生产构建与本地预览：

```bash
npm run build
npm run preview
```

`vite.config.js` 已把生产基路径固定为 `/Laddergraph-Visualization/`，用于 GitHub 项目 Pages。
`legacy/python-backend/` 保留迁移前的 Python/系统 Graphviz 基线，仅供参考，当前网页运行时不会调用它。

### 验证是否正常

页面打开后会自动加载示例图 `src/assets/example_graphs/G0.gv` 及其配套节点信息
`src/assets/example_graphs/G0.csv`。完整自检：

```bash
npm test
npm run build
```

测试会分别用 WASM 的 `dot` / `neato` 生成真实 SVG，并覆盖 Worker 取消/超时和 SVG 安全清洗。

### GitHub Pages 发布与日常维护

首次发布前，在 GitHub 仓库 **Settings → Pages** 中把 Source 设为 **GitHub Actions**。
之后的维护流程是：

1. 修改 `index.html`、`src/`、测试或配置；
2. 本地运行 `npm test` 与 `npm run build`；
3. 提交并推送到 `main`；
4. [Pages 工作流](.github/workflows/pages.yml)自动测试、构建并更新同一个公开网址。

`dist/` 是 Vite 生成且被 Git 忽略的部署产物，不要直接编辑或提交。完整的首次启用、回退、
仓库改名和隐私说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

---

## 2. 界面总览

```
┌─ 控制面板 ──────────────────────────────────────────────┐
│ 导入 │ 布局 │ 文本 │ 节点尺寸 │ 最小网络规模             │
│ 编辑/精修（固定在第二排）                                  │
└─────────────────────────────────────────────────────────┘
┌─ 连通网络标签条（>20 个时变下拉框）─────────────────────┐
│ 层级 x/y。共 N 节点 / M 边；目前显示：…                  │
├──────────────────────────────┬──────────────────────────┤
│  图区（右上角浮层：缩放 / 层级） │  节点详情 + 基因导出面板  │
│  左下角浮层：精修工具栏          │                          │
└──────────────────────────────┴──────────────────────────┘
```

---

## 3. 功能与操作

### 3.1 导入图

- **选择文件**：接受 `.gv` / `.dot` / `.txt`，选中后**立即自动渲染**。
- **渲染**：用当前已加载的 DOT 文本重新渲染一次（改了布局/文本以外的东西想重来时用）。
- 页面启动时自动加载 `src/assets/example_graphs/G0.gv`。

> 目前没有「从目录里挑图」的界面；导入其它图时使用系统文件选择器。

### 3.2 节点信息（基因表）

节点信息是独立于 `.gv` 的一份「节点 ID → 基因列表」数据。默认示例的 GV 与 CSV 在构建时
显式配对，因此 Vite 给资源加哈希后仍会自动加载正确的 `G0.csv`。

对于网页自身提供的 URL 图源，页面只尝试已知的配套节点信息文件；找不到或读取失败时会弹出消息，
再让用户手动选择 `.csv` / `.json`。不要依赖或硬编码 `dist/assets/` 中的哈希文件名。

浏览器不会向网页暴露系统文件选择器中本地 GV 的真实目录，也不允许网页枚举其同级文件。
因此，从系统文件框导入任意本地 GV 后，点击按钮会直接说明这一限制，并提供手动选择入口。
这避免了把服务器中碰巧同名、但并非同目录的 CSV 错配给当前图。

控制面板左上角的「节点信息：有（N 项）/ 无」会显示导入结果。

支持三种格式：

| 格式 | 形状 | 解析模块 |
| --- | --- | --- |
| JSON（**推荐**） | `{"<节点id>": ["基因A", "基因B"]}` | [src/app/json-node-details.js](src/app/json-node-details.js) |
| 列式 CSV | 表头每列是一个节点 ID，列里是该节点的基因 | [src/app/ladderon-node-info.js](src/app/ladderon-node-info.js) |
| 行式 CSV（旧） | 表头含 `层级` / `梯元` / `梯元id` / `重数`，最后一列是详情 | [src/app/csv-node-details.js](src/app/csv-node-details.js) |

### 3.3 布局

| 选项 | Graphviz engine | 说明 |
| --- | --- | --- |
| 层级布局（下→上） | `dot`，`rankdir=BT` | 默认 |
| 层级布局（左→右） | `dot`，`rankdir=LR` | |
| 分层布局（组成关系递推） | `dot`，`rankdir=BT` + `ordering=out` | 排布更紧凑 |
| 力导向布局 | `neato` | 大图会明显变慢 |

选完点 **应用**。

### 3.4 文本与字号

- 下拉：`都显示` / `只显示 ID` / `不显示 Label`。
- `-` `10` `+`：Label 字号，范围 6–24。

梯元节点的 label 会按换行拆成两段渲染：第一行画在节点**上方**，其余画在节点**内部**。

### 3.5 节点尺寸

`固定` / `sqrt(S)` / `S^(1/3)` / `log(S+1)` / `S`。

- `S` 取节点 label 里**最后一个括号内的数字**，例如 `46 (739)` → `S = 739`。
- 只对灰色椭圆的梯元节点生效；target 节点（白色填充或 ID 为负数）始终是固定小圆。
- 尺寸按当前标签页内的最大值归一化，不会无限放大。

### 3.6 最小网络规模 M

只显示**节点数 ≥ M** 的连通网络。

- `-` / 数字框 / `+`，或快捷键 `≥2` `≥3` `≥5` `≥10` `≥20`。
- 最小值是 2 —— **孤立点永远不显示**，没有 `M = 1` 模式。
- 下方提示行会说明：当前可显示几个网络、最大的网络多少点、忽略了多少孤立点。

### 3.7 连通网络切换

过滤后的每个连通图占一个标签（`1 · 38点`、`2 · 35点`…），按节点数从大到小排。
标签超过 20 个时自动改用下拉框。**每个标签页只显示一个连通图。**

切换标签会保留各自的视口位置和选中节点（见 [src/app/graph-tab-state-store.js](src/app/graph-tab-state-store.js)）。

### 3.8 层级裁切（图区右上角）

层级 = 从入度为 0 的节点算起的**最长路径长度**，0 层是最底层。

| 按钮 | 作用 |
| --- | --- |
| **浅1层** | 去掉一层最底层，显示层数 −1 |
| **深1层** | 补回一层最底层，显示层数 +1 |
| **合适层级** | 自动选一个裁剪量，使可见图 ≤ 180 节点且 ≤ 320 边 |
| **全部层** | 不裁剪，显示全部层 |

标签条上方的 `层级 8/8` 表示当前显示 8 层 / 共 8 层，点一次「浅1层」会变成 `7/8`。
加载新图时默认走「合适层级」。

### 3.9 缩放与平移

- 图区右上角 `+` / `-` / `适中`。
- 在空白处**按住拖动**平移。
- **目前没有滚轮缩放**，只能用按钮。

### 3.10 点击节点：上下游高亮

点任意节点：

| 颜色 | 含义 |
| --- | --- |
| 深红（`#5a0010`） | 选中的节点 |
| 红色系 | **上游**：沿边方向可达的节点与边，距离越远颜色越浅 |
| 绿色系 | **下游**：反向可达的节点与边，距离越远颜色越浅 |

再次点击同一节点、或点击空白处，取消高亮。右侧详情面板同步显示该节点的基因列表。

### 3.11 基因导出

在右侧详情面板底部：

1. 点一个节点 → **导出当前梯元 CSV**（单列，该节点全部基因）。
2. 按住 `Ctrl`（macOS 也可 `Command`）点第二个节点 → **导出双节点集合 CSV**。
   四列并排：`<节点A> 所有集`、`<节点B> 所有集`、`交集`、`并集`，短列补空。

导出文件是 **UTF-8 with BOM**，Excel 打开中文不乱码。
文件名形如 `node_genes_46.csv` / `gene_pair_46_53.csv`。

配对成功的两个节点在图上会带蓝色发光描边。

### 3.12 精修模式（蓝框）

点顶部 **精修** 进入。图区加蓝色边框，除缩放按钮外的常规控件全部锁定。

工具栏在**图区左下角**。图区高度是 `min(84vh, 980px)`，窗口不够高时需要**向下滚动**才能看到它。

| 按钮 | 作用 |
| --- | --- |
| 关注 | 把当前选中节点标为关注（黄底橙边） |
| 隐藏 | 从显示投影里移除该节点及其相连边 |
| 折叠 | 该节点显示为蓝色圆角胶囊占位 |
| 展开 | 取消折叠 |
| 取消标记 | 清除该节点的全部精修标记 |
| 只看关注 | 只显示关注节点 + 其直接邻居 |
| 清空 | 清空全部精修状态 |
| 退出 | 退出精修模式 |

**精修只生成显示投影，不会修改源图**；退出或重新加载图即还原。

### 3.13 编辑模式（红框）

点顶部 **编辑** 进入。图区加红色边框，除缩放按钮外的常规控件锁定。

> ⚠️ **当前编辑模式只是一个模式外壳，没有任何实际编辑功能。**
> 它存在的目的是给后续开发一个不污染 `src/main.js` 的落点，见
> [src/app/edit-mode/README.md](src/app/edit-mode/README.md)。

编辑模式与精修模式互斥，开一个会自动关掉另一个。

---

## 4. 自带数据

| 文件 | 规模 | 说明 |
| --- | --- | --- |
| `src/assets/example_graphs/G0.gv` | 28,876 bytes / 221 个声明节点 / 420 条边 | 默认示例图 |
| `src/assets/example_graphs/G0.csv` | 460,445 bytes / 200 个信息列 | 与 G0 同名配套，启动时自动导入 |

---

## 5. 性能须知

前端把完整源图保留在内存里，层级 / M 只是显示筛选器；解析和层级计算仍在主线程同步跑。
Graphviz 布局在 Worker 内完成，大图布局不会锁死页面主线程；新请求会真正终止仍在计算的旧 Worker，
单次渲染默认 60 秒超时。默认的 GV 与 CSV 均控制在 500,000 bytes 以内；同一标签页、同一组参数的
SVG 会被缓存。性能和内存上限最终仍取决于访问者的设备与浏览器。

---

## 6. 项目结构

```text
index.html                         Vite HTML 入口，只放页面结构
src/
  main.js                          前端总控制器：接线、状态、渲染流程
  styles.css                       页面样式与响应式布局
  core/graphviz-core.js            DOT 解析 / 层级 / 过滤 / 序列化
  rendering/graphviz-svg-renderer.js
                                   SVG 高亮、缩放、平移、Label 重绘
  app/                             UI、Worker、模式与节点信息模块
  assets/example_graphs/           默认 G0.gv 与配套 G0.csv

tests/                             Vitest 自动测试
docs/
  ARCHITECTURE.md                  模块边界与协作约束
  DEPLOYMENT.md                    GitHub Pages 部署与维护
  archive/HANDOFF.md               历史交接文档（不要按它操作）
legacy/python-backend/             旧 Python/系统 Graphviz 参考实现
.github/workflows/pages.yml        main 分支自动测试、构建与 Pages 部署
package.json / package-lock.json   固定依赖与开发命令
vite.config.js                     Pages 子路径和构建配置
dist/                              本地生成目录（忽略，不提交）
```

- **生产源文件**：`index.html`、`src/`、`tests/`、`package*.json`、`vite.config.js` 和工作流。
- **生成文件**：`dist/`、`coverage/`、`node_modules/`，均由命令重建，不手工维护。
- **历史参考**：`legacy/` 与 `docs/archive/`，不参与生产运行，也不应成为新功能依赖。

模块分工与协作约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；
各功能模块另有自己的 README（`src/app/edit-mode/`、`src/app/refine-mode/`、
`src/app/gene-pair-export/`）。

### 修改前先读

| 想改什么 | 从哪里开始 |
| --- | --- |
| 图算法、层级、DOT 序列化 | `src/core/graphviz-core.js` |
| 高亮、缩放、SVG 交互 | `src/rendering/graphviz-svg-renderer.js` |
| 页面行为、控件联动 | `src/main.js` + `src/app/` |
| 界面文案与禁用态 | `src/app/ui.js` |
| 页面结构与样式 | `index.html` + `src/styles.css` |
| Graphviz 调用策略、超时、错误处理 | `src/app/graphviz-render-client.js` + `src/app/graphviz-wasm.js` |
| SVG 安全边界 | `src/app/svg-sanitizer.js` |

修改后至少运行：

```bash
npm test
npm run build
```

---

## 7. 已知限制

- 「编辑」模式没有实际编辑功能，只是模式外壳。
- 没有滚轮缩放。
- 无法在界面里浏览任意本地目录，只能用文件选择器。
- 浏览器无法自动读取系统文件框所选 GV 的同级 CSV；此时会提示用户手动选择。
- 精修工具栏在图区左下角，窗口不高时需要滚动才能看到。
- 大图（万级节点）的 DOT 解析仍在主线程，会卡住页面约 6 秒。
- Graphviz WASM 使用访问者设备的 CPU 和内存；极大图可能触发 60 秒超时或浏览器内存限制。
- 每个标签页的 SVG 渲染缓存没有上限，长时间浏览大图会持续占用内存。
