# GitHub Pages 部署与维护

生产站点是一个 Vite 构建的纯静态网站。GitHub Pages 负责分发 HTML、CSS、JavaScript、
Graphviz WebAssembly 和示例数据；DOT 布局在访问者浏览器的 Worker 中完成。

## 首次启用

1. 确认 GitHub 仓库的默认分支是 `main`。
2. 在仓库 **Settings → Pages** 中，把 **Build and deployment / Source** 设为
   **GitHub Actions**。
3. 推送 `main`，或在 **Actions → Deploy to GitHub Pages** 中手动运行工作流。
4. 等待 `build` 与 `deploy` 两个 job 都成功。公开地址通常是：
   `https://<GitHub 用户名>.github.io/Laddergraph-Visualization/`。

本仓库只准备部署文件，不会自动修改远程仓库的 Pages 设置。

## 日常更新

本地修改后执行：

```bash
npm ci
npm test
npm run build
npm run preview
```

确认无误后提交并推送到 `main`。工作流会依次安装锁定依赖、运行测试、构建 `dist/`，
再把该构建产物部署到原有网址。访问者不需要重新下载任何东西。

`dist/` 是生成目录，不提交到 Git；生产源文件在 `index.html`、`src/` 和根目录配置文件中。
如果上线版本有问题，回退或 revert 对应提交并重新推送即可触发一次旧版本构建。

## 路径与仓库名称

`vite.config.js` 中的 `base` 是 `/Laddergraph-Visualization/`，与 GitHub 项目 Pages 的仓库路径一致。
如果仓库改名，必须同步修改 `base`，否则页面可能能打开，但脚本、WASM 或示例数据会出现 404。

默认 GV/CSV 由 `src/core/graphviz-core.js` 使用 `new URL(..., import.meta.url)` 引入。
Vite 会把它们复制为带哈希的生产资源，因此不要在运行时代码中硬编码 `dist/assets/...` 文件名。

## 隐私与能力边界

- 用户选择的 `.gv` / `.dot` / `.csv` / `.json` 文件仅由浏览器读取。
- Graphviz WASM 使用访问者设备的 CPU 和内存；文件不会为渲染而上传到 GitHub。
- GitHub Pages 没有应用服务器、数据库或 Python 运行时。
- `legacy/python-backend/` 仅保留历史实现作参考，不参与测试、构建或生产部署。

如果将来需要账号、云端保存或多人协作，应单独设计后端和数据隐私边界，不要把旧 Python
参考实现直接接回当前生产前端。

## 工作流维护

部署工作流位于 `.github/workflows/pages.yml`。官方 Actions 以完整 commit SHA 固定，更新时应：

1. 核对目标 action 的官方仓库与 release；
2. 替换为该 release 对应的完整 SHA；
3. 运行测试和构建；
4. 通过 pull request 或独立提交记录升级原因。

工作流、本地开发与生产构建统一使用 Node.js 24；版本管理器可读取根目录 `.nvmrc`。
