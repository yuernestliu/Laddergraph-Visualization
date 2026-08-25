# 开发环境与日常维护

本文件面向修改代码、运行测试和维护 GitHub 仓库的开发者。普通用户只需访问公开网站，使用说明见根目录 [README](../README.md)。

## 环境要求

| 依赖 | 要求 | 用途 |
| --- | --- | --- |
| Node.js | 24+ | 本地开发、测试和生产构建 |
| npm | 随 Node.js | 按 `package-lock.json` 安装固定依赖 |

不需要安装 Python 或系统 Graphviz。生产渲染使用浏览器端 `@viz-js/viz` WebAssembly。

## 本地启动

```bash
npm ci
npm run dev
```

打开 Vite 输出的地址，通常为：

<http://127.0.0.1:5173/Laddergraph-Visualization/>

不要直接双击 `index.html`；`file://` 会受到模块、Worker 和资源加载限制。

## 测试与生产构建

每次提交前至少运行：

```bash
npm test
npm run build
```

本地检查生产包：

```bash
npm run preview
```

`dist/` 是 Vite 生成且被 Git 忽略的部署产物，不要直接编辑或提交。

## 日常维护流程

1. 修改 `index.html`、`src/`、测试或配置。
2. 运行 `npm test` 和 `npm run build`。
3. 提交并推送到 `main`。
4. [Pages 工作流](../.github/workflows/pages.yml)自动测试、构建并更新公开网站。

首次启用、回退、仓库改名和 Pages 设置见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 项目结构

```text
index.html                         Vite HTML 入口
src/
  main.js                          页面接线、状态与渲染流程
  styles.css                       页面样式与响应式布局
  core/graphviz-core.js            DOT 解析、层级、过滤与序列化
  rendering/graphviz-svg-renderer.js
                                   SVG 高亮、缩放、平移与文字重绘
  app/                             UI、Worker、模式与节点信息模块
  assets/example_graphs/           默认 G0.gv 与配套 G0.csv

tests/                             Vitest 自动测试
docs/
  DEVELOPMENT.md                   本地开发与日常维护
  DEPLOYMENT.md                    GitHub Pages 部署
  ARCHITECTURE.md                  模块边界与协作约束
  archive/HANDOFF.md               历史交接资料
legacy/python-backend/             迁移前的 Python/Graphviz 参考实现
.github/workflows/pages.yml        main 分支自动发布
```

`legacy/` 与 `docs/archive/` 不参与生产运行，不应成为新功能依赖。

## 修改入口

| 修改内容 | 主要文件 |
| --- | --- |
| 页面结构与文案 | `index.html` |
| 页面样式与响应式布局 | `src/styles.css` |
| 控件联动与页面流程 | `src/main.js`、`src/app/ui.js` |
| 图算法、层级和 DOT 序列化 | `src/core/graphviz-core.js` |
| SVG 高亮、缩放和交互 | `src/rendering/graphviz-svg-renderer.js` |
| Graphviz Worker、超时和错误 | `src/app/graphviz-render-client.js`、`src/app/graphviz-wasm.js` |
| SVG 安全处理 | `src/app/svg-sanitizer.js` |
| 默认示例 | `src/assets/example_graphs/` |

更详细的状态所有权、异步竞态和模块约束见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 更新依赖

依赖版本在 `package.json` 与 `package-lock.json` 中固定。升级时应：

1. 核对依赖官方发布信息。
2. 更新精确版本和 lockfile。
3. 运行完整测试和生产构建。
4. 验证默认图、`dot` / `neato`、文件导入和 GitHub Pages 子路径。

GitHub Actions 同样固定到完整 commit SHA；维护规则见 [DEPLOYMENT.md](DEPLOYMENT.md)。
