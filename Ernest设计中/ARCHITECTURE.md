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

- `app/component-filter.js`
  - 管理“小网络过滤”规则：
    - 阈值裁剪
    - 可见标签筛选
    - 滑杆数值格式化
  - 这里不要碰 DOM。

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
