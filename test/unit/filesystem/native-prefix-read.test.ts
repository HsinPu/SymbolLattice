import { beforeEach, describe, expect, it, vi } from "vitest";
import { readNativeFileIntoBuffer, readNativeFilePrefix } from "../../../src/infrastructure/filesystem/native-prefix-read.js";

const io = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), close: vi.fn() }));
vi.mock("node:fs", () => io);

beforeEach(() => {
  vi.resetAllMocks();
  io.open.mockImplementation((_path, _flags, callback) => callback(null, 41));
  io.read.mockImplementation((_descriptor, buffer, _offset, _length, _position, callback) => {
    buffer.set(Buffer.from("#!/bin/sh\n")); callback(null, 10);
  });
  io.close.mockImplementation((_descriptor, callback) => callback(null));
});

describe("native bounded whole-file reads", () => {
  it("continues after short reads through EOF and closes before returning only actual bytes", async () => {
    const chunks = [Buffer.from("ab"), Buffer.from("c"), Buffer.alloc(0)];
    io.read.mockImplementation((_descriptor, buffer, offset, _length, _position, callback) => {
      const chunk = chunks.shift()!;
      buffer.set(chunk, offset); callback(null, chunk.length);
    });
    let finishClose: (error: Error | null) => void = () => {};
    io.close.mockImplementation((_descriptor, callback) => { finishClose = callback; });
    let settled = false;
    const result = readNativeFileIntoBuffer("source.ts", Buffer.alloc(8, 0xff))
      .then(bytes => { settled = true; return bytes; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finishClose(null);
    expect(Buffer.from((await result)!)).toEqual(Buffer.from("abc"));
    expect(chunks).toEqual([]);
    expect(io.close).toHaveBeenCalledExactlyOnceWith(41, expect.any(Function));
  });

  it("requests streaming at capacity without writing outside the borrowed buffer", async () => {
    io.read.mockImplementation((_descriptor, buffer, offset, length, _position, callback) => {
      expect(offset + length).toBeLessThanOrEqual(buffer.byteLength);
      buffer.fill(0x61, offset, offset + length); callback(null, length);
    });
    await expect(readNativeFileIntoBuffer("source.ts", Buffer.alloc(8))).resolves.toBeNull();
    expect(io.read).toHaveBeenCalledTimes(1);
    expect(io.close).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty file from an exhausted buffer", async () => {
    io.read.mockImplementation((_descriptor, _buffer, _offset, _length, _position, callback) => callback(null, 0));
    expect(await readNativeFileIntoBuffer("empty.ts", Buffer.alloc(8, 0xff))).toHaveLength(0);
    expect(await readNativeFileIntoBuffer("empty.ts", Buffer.alloc(0))).toBeNull();
    expect(io.close).toHaveBeenCalledTimes(2);
  });

  it("does not read or close a descriptor after an open failure", async () => {
    const error = Object.assign(new Error("denied"), { code: "EACCES" });
    io.open.mockImplementation((_path, _flags, callback) => callback(error));
    await expect(readNativeFileIntoBuffer("source.ts", Buffer.alloc(8))).rejects.toBe(error);
    expect(io.read).not.toHaveBeenCalled(); expect(io.close).not.toHaveBeenCalled();
  });

  it.each([false, true])("closes after a later short-read failure, including synchronous errors (%s)", async synchronous => {
    const error = new Error("read failed");
    let first = true;
    io.read.mockImplementation((_descriptor, buffer, offset, _length, _position, callback) => {
      if (first) { first = false; buffer[offset] = 0x61; callback(null, 1); return; }
      if (synchronous) throw error;
      callback(error, 0);
    });
    await expect(readNativeFileIntoBuffer("source.ts", Buffer.alloc(8))).rejects.toBe(error);
    expect(io.close).toHaveBeenCalledExactlyOnceWith(41, expect.any(Function));
  });

  it("keeps close-error precedence over read failure and successful EOF", async () => {
    const readError = new Error("read failed"), closeError = new Error("close failed");
    io.close.mockImplementation((_descriptor, callback) => callback(closeError));
    for (const failure of [readError, null]) {
      io.read.mockImplementation((_descriptor, _buffer, _offset, _length, _position, callback) => callback(failure, 0));
      await expect(readNativeFileIntoBuffer("source.ts", Buffer.alloc(8))).rejects.toBe(closeError);
    }
  });
});

describe("native bounded prefix reads", () => {
  it("returns only actual bytes and settles after closing the descriptor", async () => {
    let finishClose: (error: Error | null) => void = () => {};
    io.close.mockImplementation((_descriptor, callback) => { finishClose = callback; });
    let settled = false;
    const result = readNativeFilePrefix("script.tool", 32).then(bytes => { settled = true; return bytes; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(io.read.mock.calls[0]?.slice(2, 5)).toEqual([0, 32, 0]);
    finishClose(null);
    expect(Buffer.from(await result).toString()).toBe("#!/bin/sh\n");
    expect(io.close).toHaveBeenCalledTimes(1);
  });

  it("does not read or close a descriptor when opening fails", async () => {
    const error = Object.assign(new Error("denied"), { code: "EACCES" });
    io.open.mockImplementation((_path, _flags, callback) => callback(error));
    await expect(readNativeFilePrefix("script.tool", 32)).rejects.toBe(error);
    expect(io.read).not.toHaveBeenCalled(); expect(io.close).not.toHaveBeenCalled();
  });

  it.each([false, true])("closes after a read failure, including a synchronous failure (%s)", async synchronous => {
    const error = new Error("read failed");
    io.read.mockImplementation((_descriptor, _buffer, _offset, _length, _position, callback) => {
      if (synchronous) throw error;
      callback(error, 0);
    });
    await expect(readNativeFilePrefix("script.tool", 32)).rejects.toBe(error);
    expect(io.close).toHaveBeenCalledExactlyOnceWith(41, expect.any(Function));
  });

  it("preserves close-error precedence over a read error", async () => {
    const readError = new Error("read failed"), closeError = new Error("close failed");
    io.read.mockImplementation((_descriptor, _buffer, _offset, _length, _position, callback) => callback(readError, 0));
    io.close.mockImplementation((_descriptor, callback) => callback(closeError));
    await expect(readNativeFilePrefix("script.tool", 32)).rejects.toBe(closeError);
  });

  it("closes if allocating the bounded buffer throws", async () => {
    await expect(readNativeFilePrefix("script.tool", -1)).rejects.toThrow();
    expect(io.read).not.toHaveBeenCalled(); expect(io.close).toHaveBeenCalledTimes(1);
  });
});
