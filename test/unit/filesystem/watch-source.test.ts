import { describe, expect, it, vi } from "vitest";

import type { WatchEventCallbacks } from "../../../src/application/watch.js";
import {
  type FileSystemWatchFactory,
  type FileSystemWatchFilename,
  type FileSystemWatchHandle,
  type FileSystemWatchListener,
  type FileSystemWatchOptions,
  NodeFileSystemWatchSource,
  shouldTriggerProjectWatchEvent
} from "../../../src/infrastructure/filesystem/watch-source.js";

class FakeWatchHandle implements FileSystemWatchHandle {
  public closeCalls = 0;
  public listener: FileSystemWatchListener | null = null;
  private errorListeners: Array<(error: Error) => void> = [];

  public get lastErrorListener(): ((error: Error) => void) | null {
    return this.errorListeners[this.errorListeners.length - 1] ?? null;
  }

  public get errorListenerCount(): number {
    return this.errorListeners.length;
  }

  public close(): void {
    this.closeCalls += 1;
  }

  public on(_event: "error", listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  public off(_event: "error", listener: (error: Error) => void): void {
    this.errorListeners = this.errorListeners.filter((candidate) => candidate !== listener);
  }

  public emitChange(filename: FileSystemWatchFilename): void {
    this.listener?.("change", filename);
  }

  public emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }
}

function createWatchFactory(handle: FakeWatchHandle): {
  readonly watchFactory: FileSystemWatchFactory;
  readonly requestedPaths: string[];
  readonly requestedOptions: FileSystemWatchOptions[];
} {
  const requestedPaths: string[] = [];
  const requestedOptions: FileSystemWatchOptions[] = [];
  const watchFactory: FileSystemWatchFactory = (projectPath, options, listener) => {
    requestedPaths.push(projectPath);
    requestedOptions.push(options);
    handle.listener = listener;
    return handle;
  };

  return { watchFactory, requestedPaths, requestedOptions };
}

function createCallbacks(): WatchEventCallbacks {
  return {
    onChange: vi.fn(),
    onError: vi.fn()
  };
}

describe("project filesystem watch events", () => {
  it("filters hard-excluded directory segments after normalizing Windows separators", () => {
    expect(shouldTriggerProjectWatchEvent("src/index.ts")).toBe(true);
    expect(shouldTriggerProjectWatchEvent("tsconfig.json")).toBe(true);
    expect(shouldTriggerProjectWatchEvent(".tmp/pytest-history/state.json")).toBe(true);
    expect(shouldTriggerProjectWatchEvent("src/.cache/result.json")).toBe(true);
    expect(shouldTriggerProjectWatchEvent("src/nested/.gitignore")).toBe(true);
    expect(shouldTriggerProjectWatchEvent(".github/workflows/ci.yml")).toBe(true);
    expect(shouldTriggerProjectWatchEvent("src\\node_modules\\library\\index.js")).toBe(false);
    expect(shouldTriggerProjectWatchEvent(".SymbolLattice/state.db")).toBe(false);
    expect(shouldTriggerProjectWatchEvent("node_modules")).toBe(false);
    expect(shouldTriggerProjectWatchEvent(null)).toBe(true);
  });

  it("creates a non-persistent recursive native subscription and forwards normalized relative paths", () => {
    const handle = new FakeWatchHandle();
    const { watchFactory, requestedPaths, requestedOptions } = createWatchFactory(handle);
    const callbacks = createCallbacks();

    new NodeFileSystemWatchSource(watchFactory).subscribe("C:/project", callbacks);

    expect(requestedPaths).toEqual(["C:/project"]);
    expect(requestedOptions).toEqual([{ recursive: true, persistent: false }]);

    handle.emitChange("src\\nested\\index.ts");
    handle.emitChange(Buffer.from("tsconfig.json"));
    handle.emitChange("dist/output.js");
    handle.emitChange(null);

    expect(callbacks.onChange).toHaveBeenCalledTimes(3);
    expect(callbacks.onChange).toHaveBeenNthCalledWith(1, { filePath: "src/nested/index.ts" });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(2, { filePath: "tsconfig.json" });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(3, { filePath: null });
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("reconciles unknown, absolute, traversal, and ambiguous event paths without forwarding them", () => {
    const handle = new FakeWatchHandle();
    const { watchFactory } = createWatchFactory(handle);
    const callbacks = createCallbacks();

    new NodeFileSystemWatchSource(watchFactory).subscribe("C:/project", callbacks);

    handle.emitChange(null);
    handle.emitChange("/outside/secret.ts");
    handle.emitChange("C:\\outside\\secret.ts");
    handle.emitChange("../outside.ts");
    handle.emitChange("src/../secret.ts");
    handle.emitChange("src//ambiguous.ts");
    handle.emitChange("../node_modules/secret.ts");

    expect(callbacks.onChange).toHaveBeenCalledTimes(7);
    expect(callbacks.onChange).toHaveBeenNthCalledWith(1, { filePath: null });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(2, { filePath: null });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(3, { filePath: null });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(4, { filePath: null });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(5, { filePath: null });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(6, { filePath: null });
    expect(callbacks.onChange).toHaveBeenNthCalledWith(7, { filePath: null });
  });

  it("ignores hard-excluded directory events in both separator forms", () => {
    const handle = new FakeWatchHandle();
    const { watchFactory } = createWatchFactory(handle);
    const callbacks = createCallbacks();

    new NodeFileSystemWatchSource(watchFactory).subscribe("/project", callbacks);

    handle.emitChange("node_modules/library/index.js");
    handle.emitChange("src\\node_modules\\library\\index.js");
    handle.emitChange(".SymbolLattice\\state.db");
    handle.emitChange("coverage/report.json");
    handle.emitChange("dist\\output.js");

    expect(callbacks.onChange).not.toHaveBeenCalled();
  });

  it("forwards each active watcher error once", () => {
    const handle = new FakeWatchHandle();
    const { watchFactory } = createWatchFactory(handle);
    const callbacks = createCallbacks();
    const error = new Error("watch failed");

    new NodeFileSystemWatchSource(watchFactory).subscribe("/project", callbacks);
    handle.emitError(error);

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).toHaveBeenCalledWith(error);
  });

  it("closes once and ignores late change and error callbacks", () => {
    const handle = new FakeWatchHandle();
    const { watchFactory } = createWatchFactory(handle);
    const callbacks = createCallbacks();
    const subscription = new NodeFileSystemWatchSource(watchFactory).subscribe("/project", callbacks);
    const lateChange = handle.listener;
    const lateError = handle.lastErrorListener;

    subscription.close();
    subscription.close();

    expect(handle.closeCalls).toBe(1);
    expect(handle.errorListenerCount).toBe(0);
    lateChange?.("change", "src/index.ts");
    lateError?.(new Error("late error"));
    expect(callbacks.onChange).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("propagates native watcher setup failures to the application caller", () => {
    const expected = new Error("recursive watch is unavailable");
    const watchFactory: FileSystemWatchFactory = () => {
      throw expected;
    };

    expect(() => new NodeFileSystemWatchSource(watchFactory).subscribe("/project", createCallbacks())).toThrow(
      expected
    );
  });
});
