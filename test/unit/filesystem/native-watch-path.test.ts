import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  realpath: vi.fn(),
  watch: vi.fn(),
  handle: { close: vi.fn(), on: vi.fn(), off: vi.fn() }
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    realpathSync: Object.assign(vi.fn(), { native: native.realpath }),
    watch: native.watch
  };
});

import { NodeFileSystemWatchSource } from "../../../src/infrastructure/filesystem/watch-source.js";

beforeEach(() => {
  native.realpath.mockReset();
  native.watch.mockReset().mockReturnValue(native.handle);
});

describe("native watch path boundary", () => {
  it.skipIf(process.platform !== "win32")("resolves a short or aliased path before calling the native watcher", () => {
    const requested = "C:/Users/RUNNER~1/project";
    const canonical = "C:\\Users\\Runner Administrator\\project";
    native.realpath.mockReturnValue(canonical);

    const subscription = new NodeFileSystemWatchSource().subscribe(requested, {
      onChange: vi.fn(), onError: vi.fn()
    });

    expect(native.realpath).toHaveBeenCalledExactlyOnceWith(requested);
    expect(native.watch).toHaveBeenCalledExactlyOnceWith(
      canonical, { recursive: true, persistent: false }, expect.any(Function)
    );
    subscription.close();
    expect(native.handle.close).toHaveBeenCalledOnce();
  });

  it.skipIf(process.platform !== "win32")("propagates canonicalization failure without passing an unsafe path to fs.watch", () => {
    const failure = Object.assign(new Error("path disappeared"), { code: "ENOENT" });
    native.realpath.mockImplementation(() => { throw failure; });

    expect(() => new NodeFileSystemWatchSource().subscribe("missing", {
      onChange: vi.fn(), onError: vi.fn()
    })).toThrow(failure);
    expect(native.watch).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")("preserves the native watch path on non-Windows platforms", () => {
    const subscription = new NodeFileSystemWatchSource().subscribe("/virtual/project", {
      onChange: vi.fn(), onError: vi.fn()
    });
    expect(native.realpath).not.toHaveBeenCalled();
    expect(native.watch).toHaveBeenCalledExactlyOnceWith(
      "/virtual/project", { recursive: true, persistent: false }, expect.any(Function)
    );
    subscription.close();
  });

  it("keeps an injected watch factory independent of the native filesystem", () => {
    const factory = vi.fn().mockReturnValue(native.handle);
    const subscription = new NodeFileSystemWatchSource(factory).subscribe("virtual/project", {
      onChange: vi.fn(), onError: vi.fn()
    });

    expect(native.realpath).not.toHaveBeenCalled();
    expect(native.watch).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledWith(
      "virtual/project", { recursive: true, persistent: false }, expect.any(Function)
    );
    subscription.close();
  });
});
