import {
  GraphvizRenderError,
  deserializeRenderError,
  validateGraphvizRenderInput,
} from "./graphviz-render-protocol.js";

export const DEFAULT_GRAPHVIZ_RENDER_TIMEOUT_MS = 60_000;

function createAbortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function createDefaultWorker() {
  return new Worker(new URL("./graphviz-render.worker.js", import.meta.url), {
    type: "module",
    name: "laddergraph-graphviz",
  });
}

export class GraphvizRenderClient {
  constructor(options = {}) {
    this.workerFactory = options.workerFactory || createDefaultWorker;
    this.timeoutMs = options.timeoutMs || DEFAULT_GRAPHVIZ_RENDER_TIMEOUT_MS;
    this.worker = null;
    this.workerGeneration = 0;
    this.activeRequest = null;
    this.nextRequestId = 1;
  }

  render(dot, engine, options = {}) {
    try {
      validateGraphvizRenderInput(dot, engine);
    } catch (error) {
      return Promise.reject(error);
    }

    if (this.activeRequest) {
      this.cancel("已有更新的渲染请求，已取消上一项任务。");
    }

    let worker;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      return Promise.reject(
        new GraphvizRenderError("无法启动浏览器端 Graphviz 后台线程。", {
          code: "WORKER_CREATE_FAILED",
          cause: error,
          details: error?.message ? [error.message] : [],
        }),
      );
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, options.timeoutMs)
      : this.timeoutMs;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.activeRequest?.id !== id) return;
        const error = new GraphvizRenderError(
          `Graphviz 渲染超过 ${Math.ceil(timeoutMs / 1000)} 秒，已停止本次任务。`,
          { code: "RENDER_TIMEOUT" },
        );
        this.rejectActiveRequest(error, { terminateWorker: true });
      }, timeoutMs);

      this.activeRequest = { id, resolve, reject, timeoutId };

      try {
        worker.postMessage({ type: "render", id, dot, engine });
      } catch (error) {
        this.rejectActiveRequest(
          new GraphvizRenderError("无法把渲染任务发送到浏览器后台线程。", {
            code: "WORKER_POST_FAILED",
            cause: error,
            details: error?.message ? [error.message] : [],
          }),
          { terminateWorker: true },
        );
      }
    });
  }

  cancel(reason = "Graphviz 渲染已取消。") {
    if (!this.activeRequest) return false;
    this.rejectActiveRequest(createAbortError(reason), { terminateWorker: true });
    return true;
  }

  dispose() {
    if (this.activeRequest) {
      this.rejectActiveRequest(createAbortError("Graphviz 渲染器已关闭。"), {
        terminateWorker: true,
      });
      return;
    }
    this.terminateWorker();
  }

  ensureWorker() {
    if (this.worker) return this.worker;

    const worker = this.workerFactory();
    const generation = this.workerGeneration + 1;
    this.workerGeneration = generation;
    this.worker = worker;

    worker.onmessage = (event) => this.handleWorkerMessage(event, generation);
    worker.onerror = (event) => {
      if (generation !== this.workerGeneration || !this.activeRequest) return;
      event.preventDefault?.();
      this.rejectActiveRequest(
        new GraphvizRenderError("浏览器端 Graphviz 后台线程异常退出。", {
          code: "WORKER_ERROR",
          details: event.message ? [event.message] : [],
        }),
        { terminateWorker: true },
      );
    };
    worker.onmessageerror = () => {
      if (generation !== this.workerGeneration || !this.activeRequest) return;
      this.rejectActiveRequest(
        new GraphvizRenderError("无法读取浏览器端 Graphviz 的返回结果。", {
          code: "WORKER_MESSAGE_ERROR",
        }),
        { terminateWorker: true },
      );
    };

    return worker;
  }

  handleWorkerMessage(event, generation) {
    if (generation !== this.workerGeneration) return;
    const message = event.data;
    if (!this.activeRequest || message?.id !== this.activeRequest.id) return;

    if (message.type === "render-result") {
      const { resolve } = this.takeActiveRequest();
      resolve(message.svgMarkup);
      return;
    }

    if (message.type === "render-error") {
      this.rejectActiveRequest(deserializeRenderError(message.error), {
        terminateWorker: message.error?.code === "WASM_INIT_FAILED",
      });
    }
  }

  takeActiveRequest() {
    const request = this.activeRequest;
    this.activeRequest = null;
    clearTimeout(request.timeoutId);
    return request;
  }

  rejectActiveRequest(error, options = {}) {
    const request = this.takeActiveRequest();
    if (options.terminateWorker) {
      this.terminateWorker();
    }
    request.reject(error);
  }

  terminateWorker() {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = null;
    this.workerGeneration += 1;
  }
}
