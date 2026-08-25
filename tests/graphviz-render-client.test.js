import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GraphvizRenderClient } from "../src/app/graphviz-render-client.js";

class FakeWorker {
  static instances = [];

  constructor() {
    this.messages = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message) {
    this.onmessage?.({ data: message });
  }
}

describe("GraphvizRenderClient", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one worker while idle and resolves the matching response", async () => {
    const client = new GraphvizRenderClient({ workerFactory: () => new FakeWorker() });
    const result = client.render("digraph { a -> b }", "dot");
    const worker = FakeWorker.instances[0];
    const [{ id }] = worker.messages;

    worker.emit({ type: "render-result", id, svgMarkup: "<svg></svg>" });

    await expect(result).resolves.toBe("<svg></svg>");
    expect(worker.terminated).toBe(false);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("terminates a busy worker so the latest request truly cancels the old render", async () => {
    const client = new GraphvizRenderClient({ workerFactory: () => new FakeWorker() });
    const first = client.render("digraph { a -> b }", "dot");
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const oldWorker = FakeWorker.instances[0];
    const [{ id: oldId }] = oldWorker.messages;

    const latest = client.render("digraph { b -> c }", "neato");
    await firstRejected;
    const newWorker = FakeWorker.instances[1];
    const [{ id: latestId }] = newWorker.messages;

    expect(oldWorker.terminated).toBe(true);
    oldWorker.emit({ type: "render-result", id: oldId, svgMarkup: "<svg id='stale'></svg>" });
    newWorker.emit({ type: "render-result", id: latestId, svgMarkup: "<svg id='latest'></svg>" });

    await expect(latest).resolves.toContain("latest");
    client.dispose();
  });

  it("terminates a timed-out worker and recreates it for the next request", async () => {
    vi.useFakeTimers();
    const client = new GraphvizRenderClient({
      workerFactory: () => new FakeWorker(),
      timeoutMs: 25,
    });
    const timedOut = client.render("digraph { a -> b }", "dot");
    const rejected = expect(timedOut).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
    const timedOutWorker = FakeWorker.instances[0];

    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(timedOutWorker.terminated).toBe(true);

    const retry = client.render("digraph { a -> b }", "dot");
    const retryWorker = FakeWorker.instances[1];
    const [{ id }] = retryWorker.messages;
    retryWorker.emit({ type: "render-result", id, svgMarkup: "<svg></svg>" });

    await expect(retry).resolves.toBe("<svg></svg>");
    client.dispose();
  });

  it("rejects unsupported engines without starting a worker", async () => {
    const client = new GraphvizRenderClient({ workerFactory: () => new FakeWorker() });

    await expect(client.render("digraph { a -> b }", "circo")).rejects.toMatchObject({
      code: "UNSUPPORTED_ENGINE",
    });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("turns synchronous worker creation failures into structured promise rejections", async () => {
    const cause = new Error("Worker constructor is unavailable");
    const workerFactory = vi.fn(() => {
      throw cause;
    });
    const client = new GraphvizRenderClient({ workerFactory });
    let renderPromise;

    expect(() => {
      renderPromise = client.render("digraph { a -> b }", "dot");
    }).not.toThrow();
    await expect(renderPromise).rejects.toMatchObject({
      name: "GraphvizRenderError",
      code: "WORKER_CREATE_FAILED",
      message: "无法启动浏览器端 Graphviz 后台线程。",
      cause,
      details: [cause.message],
    });
    expect(workerFactory).toHaveBeenCalledTimes(1);
  });
});
