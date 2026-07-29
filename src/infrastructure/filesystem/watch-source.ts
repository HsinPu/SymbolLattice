import { watch } from "node:fs";

import type {
  WatchEventCallbacks,
  WatchEventSource,
  WatchEventSubscription
} from "../../application/watch.js";
import { HARD_EXCLUDED_DIRECTORY_NAMES } from "./discovery.js";

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

  return !filename
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => HARD_EXCLUDED_DIRECTORY_NAMES.has(segment));
}

function toWatchFilename(filename: FileSystemWatchFilename): string | null {
  if (filename === null || typeof filename === "string") {
    return filename;
  }

  return filename.toString();
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
      if (closed || !shouldTriggerProjectWatchEvent(toWatchFilename(filename))) {
        return;
      }

      callbacks.onChange();
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
