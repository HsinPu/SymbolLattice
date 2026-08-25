import { watch } from "node:fs";

import type {
  WatchEventCallbacks,
  WatchEventSource,
  WatchEventSubscription
} from "../../application/watch.js";
import { containsHardExcludedDirectory } from "./project-filesystem.js";

export interface FileSystemWatchOptions {
  readonly recursive: true;
  readonly persistent: false;
}

export type FileSystemWatchFilename = string | Buffer | null;

export type FileSystemWatchListener = (
  eventType: string,
  filename: FileSystemWatchFilename
) => void;

/** Minimal `FSWatcher` surface so unit tests do not need a native watcher. */
export interface FileSystemWatchHandle {
  close(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
  off?(event: "error", listener: (error: Error) => void): unknown;
}

export type FileSystemWatchFactory = (
  projectPath: string,
  options: FileSystemWatchOptions,
  listener: FileSystemWatchListener
) => FileSystemWatchHandle;

const nativeWatchOptions: FileSystemWatchOptions = {
  recursive: true,
  persistent: false
};

const nativeWatchFactory: FileSystemWatchFactory = (projectPath, options, listener) =>
  watch(projectPath, options, listener);

/**
 * A native filename can be absent, so treat it as a project-wide invalidation.
 * For a named path, hard exclusions mirror discovery: all other files may be
 * relevant configuration or source inputs and therefore trigger reconciliation.
 */
export function shouldTriggerProjectWatchEvent(filename: string | null): boolean {
  if (filename === null) {
    return true;
  }

  return !containsHardExcludedDirectory(filename);
}

function toWatchFilename(filename: FileSystemWatchFilename): string | null {
  if (filename === null || typeof filename === "string") {
    return filename;
  }

  return filename.toString();
}

/**
 * Native watcher filenames are normally relative to the watched project, but
 * that is not a guarantee. Only forward an exact, unambiguous relative path;
 * all other notifications still invalidate the project without exposing a
 * host path to the application layer.
 */
function toProjectRelativeWatchPath(filename: string | null): string | null {
  if (filename === null) {
    return null;
  }

  const normalized = filename.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    return null;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

/**
 * Native filesystem event adapter. It deliberately lets watcher construction
 * errors escape so the application can retain its polling fallback.
 */
export class NodeFileSystemWatchSource implements WatchEventSource {
  public constructor(private readonly watchFactory: FileSystemWatchFactory = nativeWatchFactory) {}

  public subscribe(projectPath: string, callbacks: WatchEventCallbacks): WatchEventSubscription {
    let closed = false;
    const onChange: FileSystemWatchListener = (_eventType, filename) => {
      const watchFilename = toWatchFilename(filename);
      if (closed) {
        return;
      }

      const projectRelativePath = toProjectRelativeWatchPath(watchFilename);
      if (projectRelativePath === null) {
        // Validate before applying directory exclusions: an untrusted absolute
        // or traversal path may contain an excluded-looking segment but must
        // still invalidate the project without exposing that path.
        callbacks.onChange({ filePath: null });
        return;
      }

      if (!shouldTriggerProjectWatchEvent(projectRelativePath)) {
        return;
      }

      callbacks.onChange({ filePath: projectRelativePath });
    };
    const handle = this.watchFactory(projectPath, nativeWatchOptions, onChange);
    const onError = (error: Error): void => {
      if (!closed) {
        callbacks.onError(error);
      }
    };

    try {
      handle.on("error", onError);
    } catch (error) {
      try {
        handle.close();
      } catch {
        // Preserve the listener-setup error; there is no useful recovery here.
      }
      throw error;
    }

    return {
      close(): void {
        if (closed) {
          return;
        }

        closed = true;
        try {
          handle.off?.("error", onError);
        } finally {
          handle.close();
        }
      }
    };
  }
}
