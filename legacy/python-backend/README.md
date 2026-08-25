# Legacy Python backend

这里保存迁移到 Graphviz WASM 之前的 Python/系统 Graphviz 实现，仅用于历史追溯和结果对照。

- `server.py`：旧 HTTP 静态服务与 `/api/render` 入口。
- `backend/graphviz_render_service.py`：旧系统 Graphviz 子进程封装。

生产网页、Vite 构建和 GitHub Pages 工作流都不会导入或执行这里的代码。移动后的目录也不再是
当前前端的静态根，因此不要把 `python3 server.py` 当作本项目的开发启动方式。

当前开发入口是仓库根目录下的：

```bash
npm ci
npm run dev
```

如果未来确实需要云端渲染，应重新设计独立服务的认证、资源限制、错误隔离和隐私边界，
不要直接把这份参考实现接入生产。
