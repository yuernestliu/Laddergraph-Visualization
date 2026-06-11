# Laddergraph 可视化架构说明

当前主线目录：`设计中/`

这份文档的目标不是解释业务，而是定义协作边界。多人并行开发时，优先按下面这些模块分工，尽量不要跨模块随意改。

## 1. 顶层分层

- `index.html`
  - 只负责页面结构和样式。
  - 不放业务逻辑。

- `graphviz-app.js`
  - 前端总控制器。
  - 负责把 UI、图数据、Graphviz 渲染、缓存状态串起来。
  - 尽量保持“薄”，不要再把纯算法和纯 UI 文案堆回这里。

- `graphviz-core.js`
  - 图数据层。
  - 负责 DOT 解析、图清洗、连通图切分、层级计算、节点分类、DOT 序列化。
  - 这里应保持“无 DOM、无 fetch、无浏览器依赖”。

- `graphviz-svg-renderer.js`
  - SVG 视图层。
  - 负责 SVG DOM、节点高亮、缩放、平移、显隐。
  - 不负责图算法和业务状态决策。

- `server.py`
  - 仅负责 HTTP 层。
  - 不直接写 Graphviz 子进程细节。

## 2. 新增模块目录

### `app/`

- `app/graph-tab-state-store.js`
  - 管理每个连通图标签的本地状态：
    - 视口
    - 当前层级
    - 已渲染到的层级
    - SVG render cache
  - 如果以后要修“切标签后位置变化”，优先改这个模块。

- `app/layer-utils.js`
  - 管理层级相关规则：
    - 层级裁剪
    - 层级文案
    - 合适层级计算
  - 这里不要碰 DOM。

- `app/display-components.js`
  - 管理“小网络过滤”和可显示连通图生成规则：
    - 忽略孤立点
    - 按最小网络规模 M 筛选
    - 保证每个标签页只显示一个连通图
    - 标签过多时给 UI 层提供下拉选项数据
  - 后续新增筛选工具时，优先接入这里的 display component 管线。

- `app/csv-node-details.js`
  - 管理旧行式 CSV 的解析和按节点 ID 查询详情。
  - 这里不直接更新 DOM。

- `app/json-node-details.js`
  - 管理 JSON 节点信息解析。
  - 当前 JSON 格式是 `{ "<node id>": ["gene A", "gene B"] }`。
  - JSON 是新节点信息格式；旧 CSV 仅作为兼容格式保留。

- `app/node-info-source.js`
  - 统一节点信息来源：
    - 优先查找和解析 JSON；
    - 兼容旧 CSV；
    - 可从 `G2瑞金B细胞-03_300-全.gv` 推导 `03_300_ladderons.json`。
  - 后续调整节点信息命名规则或文件优先级时，优先改这里。

- `app/edit-mode/`
  - 管理编辑模式入口和模式边界：
    - 红框状态
    - 编辑按钮状态
    - 禁用非编辑控件
    - `data-edit-mode-control` 白名单
    - `laddergraph:edit-mode-change` 事件
  - 后续如果要实现“编辑模式”的具体功能，优先读 `app/edit-mode/README.md`，再改这个文件夹。
  - `app/edit-mode.js` 只是兼容转发入口。
  - 不要把具体编辑功能塞回 `graphviz-app.js`。

- `app/refine-mode/`
  - 管理“精修模式”：
    - 蓝色精修边框
    - 精修模式工具栏
    - 关注、隐藏、折叠、展开、只看关注等精修状态
    - `data-refine-mode-control` 白名单
    - `laddergraph:refine-mode-change` 事件
  - 精修只生成显示投影，不修改源图。
  - 后续如果要实现更复杂的隐藏/折叠/穿透逻辑，优先读 `app/refine-mode/README.md`。

- `app/gene-pair-export/`
  - 管理单节点与双节点基因导出：
    - 普通点击后可立即导出当前节点
    - `Ctrl`/`Command` 点击另一个节点作为第二选择
    - 右侧详情面板显示单节点和双节点导出按钮
    - 双节点 CSV 导出两个节点的基因列表、交集与并集
  - 后续如果要调整导出字段、文件名或交集规则，优先读 `app/gene-pair-export/README.md`。

- `app/ui.js`
  - 所有“只更新界面”的逻辑都放这里：
    - 状态文字
    - 顶部提示
    - 标签条
    - 层级按钮禁用态
    - 小网络过滤控件文案
  - 这里不要放图算法。

### `backend/`

- `backend/graphviz_render_service.py`
  - 封装 Graphviz 子进程调用。
  - 提供单一接口：`render_dot_to_svg(...)`
  - 如果以后要切 `dot/neato` 策略、做 stderr 处理、加超时或队列，优先改这里。

## 3. 推荐并行分工

适合多人同时做的分工方式：

- A 负责 `graphviz-core.js`
  - 图结构、层级算法、节点分类、尺寸映射。

- B 负责 `graphviz-svg-renderer.js`
  - 缩放、平移、高亮、SVG 交互。

- C 负责 `graphviz-app.js` + `app/`
  - 页面行为、缓存状态、控件联动。

- D 负责 `server.py` + `backend/`
  - 本地渲染服务、性能、错误处理。

- E 负责 `index.html`
  - UI 布局和样式，不碰图算法。

## 4. 对接接口

为了降低冲突，尽量通过这些接口对接：

- 图数据输入输出：
  - `parseDot(dotText)`
  - `sanitizeParsedGraph(parsed)`
  - `buildGraphTabs(parsed)`
  - `buildNodeLayerMap(parsed)`
  - `applyVisibleSubgraphFilters(parsed, trimmedLayerCount, layerMeta, threshold)`
  - `serializeGraphToDot(parsed, options)`

- SVG 渲染器接口：
  - `renderer.render({ svgMarkup, parsed, overview, nodeTextMode })`
  - `renderer.setVisibleSubgraph(parsed)`
  - `renderer.fitToView()`
  - `renderer.zoom(scaleFactor)`
  - `renderer.getViewState(viewKey)`
  - `renderer.restoreViewState(savedState, viewKey)`

- 标签状态缓存接口：
  - `GraphTabStateStore#getViewState(...)`
  - `GraphTabStateStore#setViewState(...)`
  - `GraphTabStateStore#getRenderCache(...)`
  - `GraphTabStateStore#setRenderCache(...)`
  - `GraphTabStateStore#getLayerDepth(...)`
  - `GraphTabStateStore#setLayerDepth(...)`
  - `GraphTabStateStore#getRenderedDepth(...)`
  - `GraphTabStateStore#setRenderedDepth(...)`

- 编辑模式接口：
  - `createEditModeController({ rootEl, toggleButton, disabledRoot })`
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

- 后端渲染接口：
  - `render_dot_to_svg(dot_source, engine, dot_bin, cwd)`

## 5. 协作约束

- 新功能如果是纯算法，优先放 `graphviz-core.js` 或 `app/*.js`。
- 新功能如果是纯 UI，优先放 `app/ui.js` 或 `index.html`。
- 不要让 `graphviz-app.js` 再变回 800 行以上的“总垃圾桶”。
- 不要让 `server.py` 再直接承担 Graphviz 子进程细节。
- 不要在多个模块里重复实现同一套层级/过滤规则。

## 6. 下一步建议

下一轮继续收紧时，最值得继续拆的是：

- 把 `graphviz-core.js` 再拆成：
  - `core/parse-dot.js`
  - `core/tab-splitting.js`
  - `core/layering.js`
  - `core/serialize-dot.js`

- 把 `graphviz-svg-renderer.js` 再拆成：
  - `renderer/viewport.js`
  - `renderer/highlight.js`
  - `renderer/label-decoration.js`

这一轮先不继续拆，是为了先把边界稳定下来，避免多人并行时一次性改动过大。
