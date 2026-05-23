# Laddergraph 可视化项目交接（当前主线：`设计中/`）

## 1. Project Purpose

这个项目是一个面向 Laddergraph `.gv/.dot` 文件的交互式浏览器，不是通用图编辑器。

当前主线目标：

- 用本地 Graphviz 生成 SVG，尽量保持接近 PDF 的排版风格。
- 在网页里做交互浏览：连通网络切换、节点点击上下游高亮、层级裁切、最小网络规模 M 过滤、缩放、节点文本切换。
- 大图默认以可读方式打开；用户通过 M、层级等过滤工具选择要显示的子网络。
- 前端只显示当前筛选得到的连通图；背后应始终把源 `.gv/.dot` 当作完整大图。

当前真源是 `设计中/`。旧的 `vis-network` 思路和旧镜像目录只作历史参考。

## 2. Start Here

新 Agent 先读这些文件：

- 入口文档：`HANDOFF.md`
- 架构分工：`设计中/ARCHITECTURE.md`
- 当前主线目录：`设计中/`
- 页面入口：`设计中/index.html`
- 前端主控制器：`设计中/graphviz-app.js`
- 图解析与 DOT 序列化：`设计中/graphviz-core.js`
- SVG 交互层：`设计中/graphviz-svg-renderer.js`
- 前端辅助模块：`设计中/app/`
- 本地渲染服务：`设计中/server.py`
- 后端 Graphviz 封装：`设计中/backend/`

启动方式：

```bash
cd /Users/ernest/Downloads/6-Codex项目/Laddergraph可视化/设计中
python3 server.py
```

然后打开 `http://127.0.0.1:8000/`。

注意：

- 不能直接双击 `index.html`，页面需要 `/api/render` 调本地 Graphviz。
- 全局规则要求：任何 `_FORBIDDEN_*` 路径都不能读取、搜索、遍历、推断或修改。
- 默认图是 `设计中/G-default.gv`；用户实验图通常放在 `设计中/graphs/`。

## 3. Current Stable Conclusions

- 当前主线是 `设计中/`，不是 `1_before_1-图互动/`，也不是 `3-github/` 里的旧镜像。
- 主渲染层是 `Graphviz SVG + server.py`，不再使用 `vis-network` 做主排版。
- 页面会自动加载 `设计中/G-default.gv`。
- 小网络显示逻辑已经抽成组件管线：
  - 完整源图先保留在内存；
  - 层级过滤和 M 过滤作为筛选工具；
  - 筛选结果再拆成多个可显示连通图；
  - 每个标签页只显示一个连通图。
- 孤立点默认不显示，也不提供 `M = 1` 的单点显示模式。
- M 的语义是：只显示总结点数 `>= M` 的网络。用户调整 M 后会重建可显示连通图列表并重新渲染。
- 标签数量大于 20 时使用下拉菜单，而不是一排过多标签。
- 点击节点后，右侧详情面板会尝试读取同名 CSV：
  - 例：`G7-汉字3500.gv` 对应 `G7-汉字3500.csv`。
  - CSV 里按节点 ID 查行；当前需求是展示最右列（如“对应的梯元”）的汉字预览。
- 节点文本按钮现在是三态：
  - `Label -> ID -> 不显示文本 -> Label`
  - `不显示文本` 会去掉节点和边的文字。
- 编辑模式已经有独立接口，但真实编辑功能尚未实现。
  - 进入编辑模式后，网络显示窗口出现红色边框。
  - 除编辑模式控件与缩放按钮外，其他按钮/输入/下拉会强制禁用。
  - 缩放控件 `+ / - / 适中` 在编辑模式中仍允许使用。

## 4. Current Code And Document Map

主线代码：

- `设计中/index.html`
  - 页面结构和 CSS。
  - 顶部控制区、独立编辑按钮、网络窗口、右侧 CSV 详情面板都在这里。
  - `#networkShell` 是编辑模式红框的目标区域。
  - 要新增编辑模式自己的按钮，优先放到 `#networkShell` 内，并给按钮或父容器加 `data-edit-mode-control`。

- `设计中/graphviz-app.js`
  - 前端主控制器。
  - 负责文件加载、默认图加载、M 过滤、层级过滤、标签/下拉、Graphviz 请求、状态缓存、CSV 详情联动。
  - 这里只负责接入编辑模式，不应把具体编辑功能写回这里。

- `设计中/app/edit-mode.js`
  - **编辑模式的主文件。后续 Agent 如果要编辑 edit mode，优先改这里。**
  - 当前负责：
    - `createEditModeController(...)`
    - 红框状态 class：`is-edit-mode`
    - 编辑按钮激活状态
    - 锁住非编辑控件
    - 白名单选择器：`[data-edit-mode-control]`
    - 事件：`laddergraph:edit-mode-change`
  - 当前公开接口：
    - `mount()`
    - `destroy()`
    - `setEnabled(true/false)`
    - `toggle()`
    - `refreshDisabledState()`
    - `isEnabled()`

- `设计中/graphviz-core.js`
  - DOT 解析、图清洗、组件/层级相关数据处理、DOT 序列化。
  - `serializeGraphToDot(...)` 现在支持 `nodeTextMode = "none"`。

- `设计中/graphviz-svg-renderer.js`
  - SVG DOM 接入、缩放、平移、节点点击高亮、选择状态恢复。
  - `nodeTextMode = "none"` 时会移除特殊拆分标签。

- `设计中/app/display-components.js`
  - 当前小网络/M 过滤的主要模块。
  - 负责从源图和过滤参数生成可显示连通图列表。

- `设计中/app/csv-node-details.js`
  - CSV 解析与按节点 ID 查详情。

- `设计中/app/graph-tab-state-store.js`
  - 标签页状态缓存：视口、选择状态、渲染缓存等。
  - 保留节点选中/染色状态相关问题，优先从这里和 renderer 的保存恢复逻辑查。

- `设计中/app/layer-utils.js`
  - 层级过滤工具。

- `设计中/app/ui.js`
  - UI 文案、控件状态、标签/下拉渲染等。

- `设计中/server.py`
  - 静态服务 + `/api/render`。

- `设计中/backend/graphviz_render_service.py`
  - Graphviz 子进程封装。

非主线但需要知道：

- `设计中/app.js`
  - 旧版单文件实现，不要继续加新功能。
- `设计中/_版本存档/`
  - 历史版本归档。
- `1_before_1-图互动/`
  - 更早实验区。
- `3-github/Laddergraph-Visualization/`
  - 旧 GitHub 镜像/发布相关，不是当前真源。

## 5. Active Workstreams

- 编辑模式：
  - 当前只完成“模式边界”和“控件锁定”接口。
  - 真实编辑动作尚未实现。
  - 下一步如果做节点编辑、颜色编辑、批量标注等，应优先扩展 `设计中/app/edit-mode.js`，必要时再新增 `设计中/app/edit-*.js` 子模块。
  - 不要把编辑功能直接塞回 `graphviz-app.js`。

- 大图显示：
  - 继续保持“源大图 + 过滤器 + display components + 当前图渲染”的思路。
  - 后续新增筛选工具时，应接入同一 display component 管线，而不是另写一套标签拆分逻辑。

- CSV 详情：
  - 当前只做同名 CSV 的行详情展示。
  - 如果要展示更多列、做搜索或格式化，应优先改 `csv-node-details.js` 和 `ui.js`。

- 状态保持：
  - 用户关心：重新渲染或切换过滤条件时，已选节点和颜色状态尽量不要丢。
  - 这是后续编辑模式实现时必须继续保留的性质。

## 6. What Not To Repeat

- 不要读、搜、遍历任何 `_FORBIDDEN_*` 路径。
- 不要把 `设计中/app.js` 当主入口继续堆功能。
- 不要把 `3-github/...` 当当前真源。
- 不要重新引回 `vis-network` 作为主排版。
- 不要恢复孤立点显示为默认行为；用户明确说几乎不会想看孤立点。
- 不要提供 `M = 1` 的单点网络显示入口。
- 不要让每个标签页显示多个连通图；一个标签页只显示一个连通图。
- 不要把“编辑模式具体功能”写进 `graphviz-app.js`；`graphviz-app.js` 只做接线。
- 不要在编辑模式里禁用缩放按钮；用户明确要求缩放仍可用。
- 不要在没有提醒用户的情况下静默做上下文压缩。

## 7. Next Recommended Actions

最有价值的下一步取决于用户目标：

1. 如果继续做编辑模式：
   - 先读 `设计中/app/edit-mode.js`。
   - 在 `#networkShell` 内加编辑工具栏或按钮。
   - 给编辑工具栏或按钮加 `data-edit-mode-control`，否则进入编辑模式会被锁住。
   - 通过 `laddergraph:edit-mode-change` 监听模式变化。
   - 保持缩放按钮可用。

2. 如果继续做显示过滤：
   - 优先改 `设计中/app/display-components.js`。
   - 新筛选条件应作为参数进入同一管线，最终仍输出一组可显示连通图。

3. 如果继续做 CSV 详情：
   - 优先改 `设计中/app/csv-node-details.js` 和 `设计中/app/ui.js`。

4. 改动后验证：
   - `node --check 设计中/graphviz-app.js`
   - `node --check 设计中/graphviz-core.js`
   - `node --check 设计中/graphviz-svg-renderer.js`
   - `node --check 设计中/app/edit-mode.js`
   - 打开 `http://127.0.0.1:8000/` 做浏览器交互验证。

## 8. Deep References

当前已验证过的行为：

- 编辑按钮进入后：
  - `#networkShell` 加 `is-edit-mode`；
  - 红框只包网络显示区域；
  - `render/layout/M/layer/text` 等主要控件禁用；
  - `zoomIn/zoomOut/fitView` 仍可用；
  - 控制台无错误。
- 文本三态：
  - Label 模式 SVG text 数量正常；
  - ID 模式 SVG text 数量减少；
  - 不显示文本模式 SVG text 数量为 `0`。
- `G7-汉字3500.gv` 的同名 CSV 可通过 `设计中/graphs/G7-汉字3500.csv` 加载。

命名与术语约定：

- `target`
  - 目标节点，通常固定圆形，不按 `S` 缩放。
- `基本单元`
  - `b0`, `b1`, `b2` 等基础节点。
- `梯元`
  - 主体节点，尺寸常按 label 括号里的 `S` 映射。
- `M`
  - 最小可显示网络规模，即总结点数 `>= M`。

本次没有 archive pass。

原因：

- 根目录已有唯一 canonical handoff：`HANDOFF.md`。
- 用户要求的是更新 handoff，不是清理旧文档。
- `1_before_1-图互动/`、`3-github/`、`设计中/_版本存档/` 是历史资产，不是同级重复 handoff。

## 9. Prompt For Next Agent

你接手的是一个基于 Graphviz SVG 的 Laddergraph 浏览器，当前真源在 `/Users/ernest/Downloads/6-Codex项目/Laddergraph可视化/设计中/`。先读 `HANDOFF.md`，再读 `设计中/index.html`、`设计中/graphviz-app.js`、`设计中/graphviz-core.js`、`设计中/graphviz-svg-renderer.js` 和 `设计中/app/`。

如果任务是编辑 edit mode：直接从 `设计中/app/edit-mode.js` 开始。主程序只在 `graphviz-app.js` 里用 `createEditModeController({ rootEl: networkShell, toggleButton: editModeBtn, disabledRoot: appRoot })` 接入。红框目标是 `#networkShell`，编辑按钮和缩放控件通过 `data-edit-mode-control` 保持可用。新增编辑模式自己的工具时，把控件放在 `#networkShell` 内并标记 `data-edit-mode-control`。不要把具体编辑功能写进 `graphviz-app.js`。进入编辑模式后，除编辑控件和缩放外，其他控件应继续禁用。
