# Laddergraph 可视化架构说明

生产入口和构建配置位于仓库根目录，应用源码集中在 `src/`。运行方式和功能说明见 [README.md](../README.md)。

这份文档的目标不是解释业务，而是定义协作边界。多人并行开发时，优先按下面这些模块分工，尽量不要跨模块随意改。

## 1. 顶层分层

- `index.html`
  - 只负责页面结构和 Vite 入口声明。
  - 不放业务逻辑或大段内联样式。

- `src/styles.css`
  - 负责全站样式与响应式布局。
  - 从原 `index.html` 内嵌样式等价抽出，视觉行为保持不变。

- `src/main.js`
  - 前端总控制器。
  - 负责把 UI、图数据、Graphviz 渲染、缓存状态串起来。
  - 尽量保持“薄”，不要再把纯算法和纯 UI 文案堆回这里。

- `src/core/graphviz-core.js`
  - 图数据层。
  - 负责 DOT 解析、图清洗、层级计算、层级/连通规模过滤、DOT 序列化。
  - 这里应保持“无 DOM、无 fetch、无浏览器依赖”。

- `src/rendering/graphviz-svg-renderer.js`
  - SVG 视图层。
  - 负责清洗后 SVG 的 DOM、节点高亮、缩放、平移、Label 重绘。
  - 不负责图算法和业务状态决策。

- `legacy/python-backend/server.py`
  - 迁移前的 Python/系统 Graphviz 基线，仅用于对照。
  - 当前 Vite/GitHub Pages 网页运行时不调用它。

## 2. 源码模块

### `src/app/`

- `src/app/graphviz-render-client.js`
  - 管理模块 Worker 的复用、latest-wins、超时和错误恢复。
  - Worker 忙时的取消必须通过 `terminate()` 真正停止同步 WASM 计算；空闲时保持复用。

- `src/app/graphviz-render.worker.js` + `src/app/graphviz-wasm.js`
  - 在浏览器后台线程内初始化并运行固定版本的 `@viz-js/viz`。
  - 只接受 `dot` / `neato`，通过结构化消息返回 SVG 或错误。
  - 用户 DOT 只通过 `postMessage` 进入本机 Worker，不经过网络。

- `src/app/svg-sanitizer.js`
  - 使用 DOMPurify 和 Graphviz SVG 专用 allow-list 建立不可信 SVG 的安全边界。
  - 必须保留 `g.node` / `g.edge` / `title`，同时去掉脚本、链接、外部资源、事件属性和内联 CSS。

- `src/app/graph-tab-state-store.js`
  - 管理每个连通图标签的本地状态：
    - 视口
    - SVG render cache
  - 如果以后要修“切标签后位置变化”，优先改这个模块。

- `src/app/layer-utils.js`
  - 管理层级相关规则：
    - 层级裁剪
    - 层级文案
    - 合适层级计算（对裁剪量做二分，依赖“裁得越多、图只会更小”的单调性）
  - 这里不要碰 DOM。

- `src/app/display-components.js`
  - 管理“小网络过滤”和可显示连通图生成规则：
    - 忽略孤立点
    - 按节点数阈值 n 隐藏小图
    - 保证每个标签页只显示一个连通图
    - 标签过多时给 UI 层提供下拉选项数据
  - 后续新增筛选工具时，优先接入这里的 display component 管线。
  - **连通分量切分只有这一份实现**，不要在 `src/core/graphviz-core.js` 里再写一份。

- `src/app/csv-node-details.js`
  - 管理旧行式 CSV 的解析和按节点 ID 查询详情。
  - 这里不直接更新 DOM。

- `src/app/ladderon-node-info.js`
  - 管理列式 CSV（表头是节点 ID）的解析。

- `src/app/json-node-details.js`
  - 管理 JSON 节点信息解析。
  - 当前 JSON 格式是 `{ "<node id>": ["gene A", "gene B"] }`。
  - JSON 是新节点信息格式；旧 CSV 仅作为兼容格式保留。

- `src/app/node-info-source.js`
  - 统一节点信息来源：
    - 优先查找和解析 JSON；
    - 兼容两种 CSV；
    - 可从 `G2瑞金B细胞-03_300-全.gv` 推导 `03_300_ladderons.json`。
  - 后续调整节点信息命名规则或文件优先级时，优先改这里。

- `src/app/edit-mode/`
  - 管理编辑模式入口和模式边界：
    - 红框状态
    - 编辑按钮状态
    - 禁用非编辑控件
    - `data-edit-mode-control` 白名单
    - `laddergraph:edit-mode-change` 事件
  - 目前只有模式外壳，没有实际编辑功能。
  - 后续如果要实现“编辑模式”的具体功能，优先读 `src/app/edit-mode/README.md`，再改这个文件夹。
  - 不要把具体编辑功能塞回 `src/main.js`。

- `src/app/refine-mode/`
  - 管理“精修模式”：
    - 蓝色精修边框
    - 精修模式工具栏
    - 关注、隐藏、折叠、展开、只看关注等精修状态
    - `data-refine-mode-control` 白名单
    - `laddergraph:refine-mode-change` 事件
  - 精修只生成显示投影，不修改源图。
  - 后续如果要实现更复杂的隐藏/折叠/穿透逻辑，优先读 `src/app/refine-mode/README.md`。

- `src/app/gene-pair-export/`
  - 管理单节点与双节点基因导出：
    - 普通点击后可立即导出当前节点
    - `Ctrl`/`Command` 点击另一个节点作为第二选择
    - 右侧详情面板显示单节点和双节点导出按钮
    - 双节点 CSV 导出两个节点的基因列表、交集与并集
  - 后续如果要调整导出字段、文件名或交集规则，优先读 `src/app/gene-pair-export/README.md`。

- `src/app/ui.js`
  - 所有“只更新界面”的逻辑都放这里：
    - 状态文字
    - 标签条
    - 层级按钮禁用态
    - 小网络过滤控件文案
  - 这里不要放图算法。

### `legacy/python-backend/backend/`

- `legacy/python-backend/backend/graphviz_render_service.py`
  - 迁移前的系统 Graphviz 子进程实现，当前仅保留作基线对照。
  - 不要让新的前端功能重新依赖它；若未来确需云端渲染，应另行设计后端边界。

## 3. 推荐并行分工

适合多人同时做的分工方式：

- A 负责 `src/core/graphviz-core.js`
  - 图结构、层级算法、节点分类、尺寸映射。

- B 负责 `src/rendering/graphviz-svg-renderer.js`
  - 缩放、平移、高亮、SVG 交互。

- C 负责 `src/main.js` + `src/app/`
  - 页面行为、缓存状态、控件联动。

- D 负责 `src/app/graphviz-render-*.js` + `src/app/graphviz-wasm.js`
  - 浏览器端布局、Worker 生命周期、性能和错误处理。

- E 负责 `index.html` + `src/styles.css`
  - UI 结构和样式，不碰图算法。

## 4. 对接接口

为了降低冲突，尽量通过这些接口对接：

- 图数据输入输出：
  - `parseDot(dotText)`
  - `sanitizeParsedGraph(parsed)`
  - `buildNodeLayerMap(parsed)`
  - `applyVisibleSubgraphFilters(parsed, trimmedLayerCount, layerMeta, threshold)`
  - `serializeGraphToDot(parsed, options)`

- 连通图切分与 M 过滤：
  - `buildDisplayComponentState(parsed, { minComponentSize })`
  - `getSubgraphForDisplayComponent(parsed, component)`

- SVG 渲染器接口：
  - `renderer.render({ svgMarkup, parsed, nodeTextMode, labelFontSize })`
  - `renderer.fitToView()`
  - `renderer.zoom(scaleFactor)`
  - `renderer.getViewState(viewKey)`
  - `renderer.restoreViewState(savedState, viewKey)`
  - `renderer.setPairSelectionNodeIds(nodeIds)`

- 标签状态缓存接口：
  - `GraphTabStateStore#getViewState(tabId, viewKey)`
  - `GraphTabStateStore#setViewState(tabId, viewKey, state)`
  - `GraphTabStateStore#getRenderCache(tabId, renderKey)`
  - `GraphTabStateStore#setRenderCache(tabId, renderKey, entry)`

- 编辑模式接口：
  - `createEditModeController({ rootEl, toggleButton, disabledRoot, onChange })`
  - `controller.mount()`
  - `controller.setEnabled(true/false)`
  - `controller.toggle()`
  - `controller.refreshDisabledState()`
  - `controller.isEnabled()`
  - 允许编辑模式内继续可用的控件应放在带 `data-edit-mode-control` 的元素内。

- 精修模式接口：
  - `createRefineModeController({ rootEl, toggleButton, disabledRoot, onChange, onProjectionChange })`
  - `controller.mount()`
  - `controller.setEnabled(true/false)`
  - `controller.setSelectedNode(nodeId)`
  - `controller.projectGraph(parsed)`
  - `controller.getProjectionSignature()`
  - `controller.clear()`
  - 允许精修模式内继续可用的控件应放在带 `data-refine-mode-control` 的元素内。

- 节点基因导出接口：
  - `createGenePairExportController({ panelRoot, renderer, getNodeDetail })`
  - `controller.handleNodeClick({ nodeId, event, activeSelectionNodeId })`
  - `controller.setPrimaryNode(nodeId)`
  - `controller.clearPair()`
  - `controller.refresh()`

- 浏览器渲染接口：
  - `GraphvizRenderClient.render(dot, engine, options) -> Promise<string>`
  - Worker 协议由 `src/app/graphviz-render-protocol.js` 统一定义。

## 5. 协作约束

- 新功能如果是纯算法，优先放 `src/core/graphviz-core.js` 或 `src/app/*.js`。
- 新功能如果是纯 UI，优先放 `src/app/ui.js` 或 `index.html`。
- 当前 `src/main.js` 仍是体量较大的总控制器；新增逻辑时优先把纯算法和纯 UI 职责放进现有模块，逐步让它回归协调层，不把具体行数当作硬性门槛。
- 不要把用户 DOT 发回服务器；当前产品的隐私边界是浏览器本地 Worker。
- 不要绕过 `src/app/svg-sanitizer.js` 把 Graphviz SVG 字符串直接插入 live DOM。
- 不要在多个模块里重复实现同一套层级/过滤规则。
- **不要留“代码在、UI 不在”的功能**：如果控件从 `index.html` 里去掉了，对应的分支和状态也要一起去掉，
  否则会像之前的“概览模式”一样长期空转。
- 大图上任何 O(V+E) 级别的重算都要先问：这个动作真的需要重算吗？
  `src/main.js` 里层级图（`rebuildLayerMeta`）只在换图时重建，调 M 时不重建，就是这个原因。

## 6. 下一步建议

值得继续拆的是：

- 把 `src/core/graphviz-core.js` 再拆成：
  - `src/core/parse-dot.js`
  - `src/core/layering.js`
  - `src/core/serialize-dot.js`

- 把 `src/rendering/graphviz-svg-renderer.js` 再拆成：
  - `src/rendering/viewport.js`
  - `src/rendering/highlight.js`
  - `src/rendering/label-decoration.js`

还没做的性能项：

- `parseDot` 在万级节点图上仍然要 5 秒以上，且跑在主线程。要根治需要搬进 Web Worker。
- 每个标签页的 SVG render cache 目前没有上限，大图上会持续吃内存。
