# Laddergraph Visualization

本仓库提供一个基于浏览器的 Graphviz 本地预览工具。

实际可运行页面和服务端脚本位于 `Ernest设计中/` 目录：

- 前端页面：`Ernest设计中/index.html`
- 本地服务：`Ernest设计中/server.py`
- 示例图文件：`Ernest设计中/graphs/`

## 1. Clone 仓库

```bash
git clone <your-repo-url>
cd Laddergraph-Visualization
```

如果你是作为上层仓库里的嵌套仓库单独维护，也可以直接进入该目录后继续下面步骤。

## 2. 本地依赖

需要两样东西：

- Python 3
- Graphviz，并且本机可用 `dot` 命令

先检查是否已安装：

```bash
python3 --version
dot -V
```

如果 `dot` 不存在，可以按系统安装：

### macOS

```bash
brew install graphviz
```

### Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y graphviz
```

## 3. 启动项目

在仓库根目录执行：

```bash
python3 Ernest设计中/server.py
```

启动成功后会看到类似输出：

```text
Serving /.../Laddergraph-Visualization/Ernest设计中 at http://127.0.0.1:8000
```

然后在浏览器打开：

```text
http://127.0.0.1:8000/index.html
```

## 4. 如何使用

页面打开后可以：

- 加载 `Ernest设计中/graphs/` 下的示例 `.gv` 文件
- 在前端界面切换布局引擎
- 通过本地 `/api/render` 接口调用 Graphviz，把 DOT 渲染成 SVG

## 5. 常见问题

### 页面能开，但渲染失败

先检查：

```bash
dot -V
```

`server.py` 会优先从系统 `PATH` 查找 `dot`，如果没找到，会回退到：

```text
/opt/homebrew/bin/dot
```

如果你的 Graphviz 不在这两个位置之一，需要把 `dot` 加进 `PATH`，或者修改 `Ernest设计中/server.py` 里的 `DOT_BIN`。

### 8000 端口被占用

可以先停止占用该端口的进程，或者把 `Ernest设计中/server.py` 里的 `PORT = 8000` 改成别的端口，再重新启动。

### 直接双击 HTML 不工作

不要直接用 `file://` 打开 `index.html`。这个项目依赖本地 HTTP 服务和 `/api/render` 接口，必须先启动 `server.py`。
