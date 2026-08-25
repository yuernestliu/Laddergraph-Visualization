> **已归档（历史文档，不要按它操作）**
>
> 这份文档写于代码还在 `设计中/` 子目录的时期。文件已经搬到仓库根目录，
> 文中所有 `设计中/xxx` 路径和 `/Users/ernest/Downloads/...` 绝对路径都已失效，
> 「概览模式」「`app.js`」「`app/edit-mode.js` 兼容入口」等内容也已经从代码里移除。
>
> 当前有效文档：
> - 运行方式与功能说明：[../../README.md](../../README.md)
> - 模块边界与协作约束：[../ARCHITECTURE.md](../ARCHITECTURE.md)
>
> 保留这份文件只是为了追溯当初的设计取舍。

---

# Laddergraph 可视化项目交接（当前主线：`设计中/`）

## 1. Project Purpose

这个项目是一个面向 Laddergraph `.gv/.dot` 文件的交互式浏览器，不是通用图编辑器。

当前目标：

- 用本地 Graphviz 生成 SVG，尽量保持接近 PDF 的排版风格。
- 在网页里做交互浏览：连通网络切换、节点点击上下游高亮、层级裁切、最小网络规模 M 过滤、缩放、节点文本切换、Label 字号调整、CSV 节点详情展示。
- 大图始终作为完整源图保留在前端状态中；M、层级等工具只负责筛选当前需要显示的连通图。
- 前端只显示当前筛选得到的一个或多个连通图，每个标签页只显示一个连通图。

当前真源是 `设计中/`。旧的 `vis-network` 思路和旧镜像目录只作历史参考。

## 2. Start Here

新 Agent 先读：

- 入口文档：`HANDOFF.md`
- 架构分工：`设计中/ARCHITECTURE.md`
- 页面入口：`设计中/index.html`
- 前端主控制器：`设计中/graphviz-app.js`
- 图解析与 DOT 序列化：`设计中/graphviz-core.js`
- SVG 交互层：`设计中/graphviz-svg-renderer.js`
- 前端辅助模块：`设计中/app/`
- 本地渲染服务：`设计中/server.py`
- 后端 Graphviz 封装：`设计中/backend/graphviz_render_service.py`

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
- 小网络显示逻辑已经抽成 display component 管线：
  - 完整源图先保留在内存；
  - 层级过滤和 M 过滤作为筛选工具；
  - 筛选结果再拆成多个可显示连通图；
  - 每个标签页只显示一个连通图。
- 孤立点默认不显示，也不提供 `M = 1` 的单点显示模式。
- M 的语义是：只显示总结点数 `>= M` 的网络。用户调整 M 后会重建可显示连通图列表并重新渲染。
- 标签数量大于 20 时使用下拉菜单，而不是一排过多标签。
- 顶部工具栏现在采用按功能分配宽度的响应式布局：
  - 导入和最小网络规模更宽；
  - 文本和节点尺寸更窄；
  - 窗口变小时自动换行，而不是把所有区域固定死。
- 文本显示现在是下拉菜单：
  - `都显示`
  - `只显示 ID`
  - `不显示 Label`
- Label 字号现在可调：
  - 控件在“文本”区域内，形态是 `- / 数字 / +`。
  - 默认 `10`，范围 `6-24`。
  - 调整后会重新渲染，并尽量保留当前选中节点状态。
- 节点信息现在优先使用 JSON，同时兼容旧 CSV：
  - JSON：以节点 ID 为 key、基因数组为 value，例如 `设计中/graphs/PHIRE/03_300_ladderons.json`。
  - 旧行式 CSV：按节点 ID 查一行，例如 `G7-汉字3500.csv`。
  - 旧列式 CSV：第一行是节点 ID，每一列是该节点的基因列表，例如 `00_20_ladderons.csv`。
  - 自动加载可从图名 `G2瑞金B细胞-03_300-全.gv` 推导并优先查找 `03_300_ladderons.json`。
- “导入节点信息”按钮已放在“导入”区旁边，按钮为蓝色，并显示 `节点信息：有/无`。
- 单节点与双节点基因导出已经隔离成独立模块组。
  - 普通点击一个梯元后，可立即导出它自己的基因列表。
  - 按住 `Ctrl`/`Command` 点击另一个梯元作为第二选择。
  - 右侧详情面板会显示单节点和双节点导出按钮。
  - 双节点 CSV 包含两个梯元各自的基因列表、交集与并集。
- 编辑模式已经有独立接口，但真实编辑功能尚未实现。
  - 进入编辑模式后，网络显示窗口出现红色边框。
  - 除编辑模式控件与缩放按钮外，其他按钮/输入/下拉会强制禁用。
  - 缩放控件 `+ / - / 适中` 在编辑模式中仍允许使用。
- 精修模式已经隔离成独立模块组。
  - 进入精修模式后，网络显示窗口出现蓝色边框。
  - 精修只生成当前显示投影，不修改原始大图。
  - 当前第一版支持：关注、隐藏、折叠、展开、取消标记、只看关注、清空、退出。
  - 编辑模式和精修模式互斥，同一时间只允许开启一个。

## 4. Current Code And Document Map

主线代码：

- `设计中/index.html`
  - 页面结构和 CSS。
  - 顶部控制区、蓝色“导入节点信息”按钮、节点信息有无状态、文本下拉、Label 字号步进器、独立编辑按钮、网络窗口、右侧详情面板都在这里。
  - `#networkShell` 是编辑模式红框的目标区域。
  - 要新增编辑模式自己的按钮，优先放到 `#networkShell` 内，并给按钮或父容器加 `data-edit-mode-control`。

- `设计中/graphviz-app.js`
  - 前端主控制器。
  - 负责文件加载、默认图加载、M 过滤、层级过滤、标签/下拉、Graphviz 请求、状态缓存、CSV 详情联动、Label 字号参数接线。
  - 这里只负责接入编辑模式，不应把具体编辑功能写回这里。

- `设计中/graphviz-core.js`
  - DOT 解析、图清洗、组件/层级相关数据处理、DOT 序列化。
  - `serializeGraphToDot(...)` 支持：
    - `nodeTextMode = "label" | "id" | "none"`
    - `nodeSizeMode`
    - `labelFontSize`
  - DOT 解析已经兼容跨行 label/属性块，避免 G2 示例中上游叶子节点因跨行属性丢失而无法点击或高亮。

- `设计中/graphviz-svg-renderer.js`
  - SVG DOM 接入、缩放、平移、节点点击高亮、选择状态恢复。
  - `nodeTextMode = "none"` 时会移除特殊拆分标签。
  - `labelFontSize` 会影响特殊椭圆/target 节点的自绘拆分 label。
  - `hasNode(nodeId)` 用于重新渲染后恢复当前选中状态。

- `设计中/app/display-components.js`
  - 当前小网络/M 过滤的主要模块。
  - 负责从源图和过滤参数生成可显示连通图列表。
  - 后续新增筛选工具，优先接入这里的 display component 管线。

- `设计中/app/csv-node-details.js`
  - 行式 CSV 解析与按节点 ID 查详情。
  - 适合 `G7-汉字3500.csv` 这类“每行一个节点详情”的文件。

- `设计中/app/ladderon-node-info.js`
  - 旧列式 CSV 节点信息解析模块。
  - 当前用于 `00_20_ladderons.csv` 这类“第一行是节点 ID、每列是该节点基因列表”的文件。
  - 这是后续多人分模块设计节点信息读取/计算功能的主要扩展点之一。

- `设计中/app/json-node-details.js`
  - 新 JSON 节点信息解析模块。
  - 当前格式是 `{ "<node id>": ["gene A", "gene B"] }`。

- `设计中/app/node-info-source.js`
  - 统一选择 JSON/CSV 解析器，并生成图对应的节点信息候选路径。
  - JSON 优先，旧 CSV 作为兼容回退。
  - 节点信息文件命名或自动查找规则应优先改这里。

- `设计中/app/gene-pair-export/`
  - **单节点与双节点基因导出的主文件夹。后续 Agent 如果要编辑这个功能，优先读 `设计中/app/gene-pair-export/README.md`。**
  - 当前负责：
    - `createGenePairExportController(...)`
    - 单节点选择后立即导出
    - Ctrl/Command 二次选择
    - 右侧单节点与双节点导出按钮
    - 双节点导出四列：第一节点、第二节点、交集、并集
  - 不负责 CSV 文件读取；节点详情来自 `graphviz-app.js` 传入的 `getNodeDetail` 回调。

- `设计中/app/ui.js`
  - UI 文案、控件状态、标签/下拉渲染、右侧节点详情面板展示。
  - 当前会识别 `detail.type === "geneColumn"` 并列出该节点对应列的全部基因。

- `设计中/app/edit-mode/`
  - **编辑模式的主文件夹。后续 Agent 如果要编辑 edit mode，优先读 `设计中/app/edit-mode/README.md`。**
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
  - `设计中/app/edit-mode.js` 只是兼容转发入口，保留旧导入路径。

- `设计中/app/refine-mode/`
  - **精修模式的主文件夹。后续 Agent 如果要编辑 refine mode，优先读 `设计中/app/refine-mode/README.md`。**
  - 当前负责：
    - `createRefineModeController(...)`
    - 蓝色精修边框 class：`is-refine-mode`
    - 精修按钮激活状态
    - 精修工具栏
    - 锁住非精修控件
    - 白名单选择器：`[data-refine-mode-control]`
    - 事件：`laddergraph:refine-mode-change`
    - 当前显示投影：关注、隐藏、折叠、只看关注
  - 精修投影入口是 `projectGraph(parsed)`，不能修改源图。

- `设计中/app/graph-tab-state-store.js`
  - 标签页状态缓存：视口、选择状态、渲染缓存等。
  - 保留节点选中/染色状态相关问题，优先从这里和 renderer 的保存恢复逻辑查。

- `设计中/app/layer-utils.js`
  - 层级过滤工具。

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
  - 下一步如果做节点编辑、颜色编辑、批量标注等，应优先扩展 `设计中/app/edit-mode/`。
  - 不要把编辑功能直接塞回 `graphviz-app.js`。

- 精修模式：
  - 当前已完成独立文件夹和第一版投影动作。
  - 后续更复杂的隐藏、折叠、穿透、路径压缩逻辑应优先放在 `设计中/app/refine-mode/refine-projection.js`。
  - 精修状态字段应放在 `设计中/app/refine-mode/refine-state.js`。
  - 精修 UI 按钮应放在 `设计中/app/refine-mode/refine-toolbar.js`。
  - 主控制器只做接线和模式边界，不要把复杂图算法写回 `graphviz-app.js`。

- 大图显示：
  - 继续保持“源大图 + 过滤器 + display components + 当前图渲染”的思路。
  - 后续新增筛选工具时，应接入同一 display component 管线，而不是另写一套标签拆分逻辑。

- 节点信息/CSV：
  - JSON 优先改 `设计中/app/json-node-details.js`。
  - 文件自动查找和格式选择优先改 `设计中/app/node-info-source.js`。
  - 旧行式 CSV 优先改 `设计中/app/csv-node-details.js`。
  - 旧列式 ladderon/基因表优先改 `设计中/app/ladderon-node-info.js`。
  - 右侧展示样式优先改 `设计中/app/ui.js`。
  - 主控制器 `graphviz-app.js` 只负责选择合适的解析器并把结果传给 UI。

- 节点基因导出：
  - 功能入口在 `设计中/app/gene-pair-export/`。
  - 后续如果要改导出列、交集算法、文件名或支持多个节点，优先改这个文件夹。
  - 不要在这个模块里重新解析 CSV 或重新 fetch 文件。

- 字体与可读性：
  - Label 字号已作为渲染参数接入。
  - 普通 Graphviz label 在 `graphviz-core.js` 里通过 DOT `fontsize` 控制。
  - 特殊拆分 label 在 `graphviz-svg-renderer.js` 里自绘，因此也要同步使用 `labelFontSize`。

- 状态保持：
  - 用户关心：重新渲染或切换过滤条件时，已选节点和颜色状态尽量不要丢。
  - 当前 Label 字号变化、文本模式变化等都会进入 render/view key。
  - 如果已有 `selectedNodeId` 仍在新 SVG 中，会尽量重新应用高亮。
  - 后续编辑模式实现时必须继续保留这个性质。

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
- 不要把“精修模式具体功能”写进 `graphviz-app.js`；精修逻辑应留在 `设计中/app/refine-mode/`。
- 不要让编辑模式和精修模式同时开启。
- 不要把节点信息解析继续堆进 `graphviz-app.js`；行式和列式 CSV 都应留在独立模块。
- 不要把节点基因导出逻辑写进 `graphviz-app.js`；应留在 `设计中/app/gene-pair-export/`。
- 不要把文本模式恢复成循环按钮；当前要求是窄下拉菜单。
- 不要在没有提醒用户的情况下静默做上下文压缩。

## 7. Next Recommended Actions

最有价值的下一步取决于用户目标：

1. 如果继续做编辑模式：
   - 先读 `设计中/app/edit-mode/README.md`。
   - 在 `#networkShell` 内加编辑工具栏或按钮。
   - 给编辑工具栏或按钮加 `data-edit-mode-control`，否则进入编辑模式会被锁住。
   - 通过 `laddergraph:edit-mode-change` 监听模式变化。
   - 保持缩放按钮可用。

2. 如果继续做精修模式：
   - 先读 `设计中/app/refine-mode/README.md`。
   - 图投影算法改 `设计中/app/refine-mode/refine-projection.js`。
   - 精修状态改 `设计中/app/refine-mode/refine-state.js`。
   - 精修工具栏改 `设计中/app/refine-mode/refine-toolbar.js`。
   - 保持精修只输出显示投影，不修改源图。

3. 如果继续做显示过滤：
   - 优先改 `设计中/app/display-components.js`。
   - 新筛选条件应作为参数进入同一管线，最终仍输出一组可显示连通图。

4. 如果继续做节点信息：
   - JSON：改 `设计中/app/json-node-details.js`。
   - 自动查找/格式选择：改 `设计中/app/node-info-source.js`。
   - 旧行式 CSV：改 `设计中/app/csv-node-details.js`。
   - 旧列式基因表：改 `设计中/app/ladderon-node-info.js`。
   - 右侧详情展示：改 `设计中/app/ui.js`。
   - 示例文件：`设计中/graphs/PHIRE/03_300_ladderons.json`。

5. 如果继续做双节点导出：
   - 先读 `设计中/app/gene-pair-export/README.md`。
   - 导出行为改 `设计中/app/gene-pair-export/gene-pair-export.js`。
   - 节点点击转发在 `graphviz-svg-renderer.js` 的 `onNodeClick` 和 `graphviz-app.js` 的 controller 接线。

6. 如果继续调字体可读性：
   - 普通节点字号：看 `graphviz-core.js` 的 `labelFontSize`。
   - 特殊上下分行 label：看 `graphviz-svg-renderer.js` 的 `decorateSplitLabelNodes()`。

7. 改动后验证：
   - `node --check 设计中/graphviz-app.js`
   - `node --check 设计中/graphviz-core.js`
   - `node --check 设计中/graphviz-svg-renderer.js`
   - `node --check 设计中/app/ui.js`
   - `node --check 设计中/app/json-node-details.js`
   - `node --check 设计中/app/node-info-source.js`
   - `node --check 设计中/app/ladderon-node-info.js`
   - `node --check 设计中/app/gene-pair-export/gene-pair-export.js`
   - `node --check 设计中/app/edit-mode/edit-controller.js`
   - `node --check 设计中/app/refine-mode/refine-controller.js`
   - 打开 `http://127.0.0.1:8000/` 做浏览器交互验证。

## 8. Deep References

当前已验证过的行为：

- 编辑按钮进入后：
  - `#networkShell` 加 `is-edit-mode`；
  - 红框只包网络显示区域；
  - `render/layout/M/layer/text` 等主要控件禁用；
  - `zoomIn/zoomOut/fitView` 仍可用；
  - 控制台无错误。
- 文本显示：
  - 当前是下拉菜单，不是循环按钮；
  - `都显示` 显示原 label；
  - `只显示 ID` 显示节点 ID；
  - `不显示 Label` 会去掉节点和边的文字。
- Label 字号：
  - 控件默认值 `10`；
  - 范围 `6-24`；
  - 验证过 `serializeGraphToDot(..., labelFontSize: 14)` 会输出 `fontsize="14"`。
- CSV 节点详情：
  - `G7-汉字3500.gv` 的同名 CSV 可通过 `设计中/graphs/G7-汉字3500.csv` 加载。
  - `00_20_ladderons.csv` 被识别为列式基因表；验证时解析出 `1354` 个节点信息条目。
  - 节点 `20` 在 `00_20_ladderons.csv` 中验证读到 `1812` 个基因，前几个是 `ISG15`, `AURKAIP1`, `SSU72`, `TNFRSF14`, `RPL22`。
- G2 跨行 label 问题：
  - DOT parser 已改为用 `[\s\S]` 解析跨行属性。
  - `G2瑞金B细胞-00_20-全.gv` 这类文件中，上游叶子节点不应再因属性解析失败而无法点击或高亮。

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
- `设计中/ARCHITECTURE.md` 是架构辅助文档，不是竞争性的 handoff。
- `1_before_1-图互动/`、`3-github/`、`设计中/_版本存档/` 是历史资产，不是同级重复 handoff。

## 9. Prompt For Next Agent

你接手的是一个基于 Graphviz SVG 的 Laddergraph 浏览器，当前真源在 `/Users/ernest/Downloads/6-Codex项目/Laddergraph可视化/设计中/`。先读 `HANDOFF.md`，再读 `设计中/ARCHITECTURE.md`、`设计中/index.html`、`设计中/graphviz-app.js`、`设计中/graphviz-core.js`、`设计中/graphviz-svg-renderer.js` 和 `设计中/app/`。

如果任务是编辑 edit mode：直接从 `设计中/app/edit-mode/README.md` 和 `设计中/app/edit-mode/edit-controller.js` 开始。主程序只在 `graphviz-app.js` 里用 `createEditModeController({ rootEl: networkShell, toggleButton: editModeBtn, disabledRoot: appRoot })` 接入。红框目标是 `#networkShell`，编辑按钮和缩放控件通过 `data-edit-mode-control` 保持可用。新增编辑模式自己的工具时，把控件放在 `#networkShell` 内并标记 `data-edit-mode-control`。不要把具体编辑功能写进 `graphviz-app.js`。

如果任务是精修 refine mode：直接从 `设计中/app/refine-mode/README.md` 开始。精修模式由 `refine-controller.js` 接入，状态在 `refine-state.js`，显示投影在 `refine-projection.js`，工具栏在 `refine-toolbar.js`。精修只能修改当前显示投影，不能改源图。编辑模式和精修模式必须保持互斥。

如果任务是节点信息：JSON 从 `设计中/app/json-node-details.js` 开始；自动查找和格式选择从 `设计中/app/node-info-source.js` 开始；旧 CSV 分别由 `csv-node-details.js` 和 `ladderon-node-info.js` 兼容；右侧显示从 `设计中/app/ui.js` 开始。主控制器只负责接线。

如果任务是节点基因导出：直接从 `设计中/app/gene-pair-export/README.md` 和 `设计中/app/gene-pair-export/gene-pair-export.js` 开始。普通点击后可导出当前梯元；再按 `Ctrl`/`Command` 点击第二梯元，可导出两个节点各自的基因列表、交集与并集。不要在这个模块里重新读 CSV/JSON；通过 `getNodeDetail(nodeId)` 使用主程序已经加载的节点详情。

如果任务是显示过滤：从 `设计中/app/display-components.js` 开始，保持“源大图 + 过滤器 + 可显示连通图”的共同接口。不要为新筛选工具另写一套标签页/连通图逻辑。
