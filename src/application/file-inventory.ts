import { createHash } from "node:crypto";

import { compareStableText } from "../domain/index.js";
import type {
  FileLanguageGroup,
  FileTreeDirectoryNode,
  FileTreeNode,
  FileTreeProjection,
  IndexedFileSummary
} from "./types.js";
import { MAX_FILE_CURSOR_LENGTH } from "./types.js";

export interface FileSelection {
  readonly pathPrefix?: string;
  readonly language?: IndexedFileSummary["language"];
  readonly pattern?: string;
}

export interface FilePageCursorPayload {
  readonly schemaVersion: 1;
  readonly generationId: string;
  readonly selectionFingerprint: string;
  readonly afterFilePath: string;
}

export class InvalidFilePageCursorError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidFilePageCursorError";
  }
}

/** Hashes only record-selection filters so presentation and page size may change between pages. */
export function fileSelectionFingerprint(selection: FileSelection): string {
  return createHash("sha256").update(JSON.stringify({
    pathPrefix: selection.pathPrefix ?? null,
    language: selection.language ?? null,
    pattern: selection.pattern ?? null
  }), "utf8").digest("hex");
}

export function encodeFilePageCursor(
  payload: Omit<FilePageCursorPayload, "schemaVersion">
): string {
  return Buffer.from(JSON.stringify({ schemaVersion: 1, ...payload }), "utf8").toString("base64url");
}

export function decodeFilePageCursor(cursor: string): FilePageCursorPayload {
  try {
    if (cursor.length === 0 || cursor.length > MAX_FILE_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error("Cursor encoding is not canonical base64url.");
    }
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) {
      throw new Error("Cursor encoding is not canonical base64url.");
    }
    const json = bytes.toString("utf8");
    if (!Buffer.from(json, "utf8").equals(bytes)) {
      throw new Error("Cursor payload is not canonical UTF-8.");
    }
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Cursor payload must be an object.");
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join("|") !== "afterFilePath|generationId|schemaVersion|selectionFingerprint") {
      throw new Error("Cursor payload has an unexpected shape.");
    }
    if (
      record.schemaVersion !== 1 ||
      typeof record.generationId !== "string" || record.generationId.length === 0 || record.generationId.length > 256 ||
      typeof record.selectionFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(record.selectionFingerprint) ||
      typeof record.afterFilePath !== "string" || !isProjectRelativeCursorPath(record.afterFilePath)
    ) {
      throw new Error("Cursor payload values are invalid.");
    }
    return {
      schemaVersion: 1,
      generationId: record.generationId,
      selectionFingerprint: record.selectionFingerprint,
      afterFilePath: record.afterFilePath
    };
  } catch (error) {
    throw new InvalidFilePageCursorError(
      error instanceof Error ? error.message : "File cursor is invalid."
    );
  }
}

function isProjectRelativeCursorPath(filePath: string): boolean {
  return filePath.length > 0 && filePath.length <= 1024 && filePath === filePath.trim() &&
    !filePath.includes("\0") && !filePath.includes("\\") && !filePath.startsWith("/") &&
    !/^[A-Za-z]:/.test(filePath) && !filePath.split("/").includes("..");
}

interface MutableTreeNode {
  readonly name: string;
  readonly path: string;
  readonly children: Map<string, MutableTreeNode>;
  file?: IndexedFileSummary;
}

/** Compiles the deliberately small, anchored file-glob grammar used by files queries. */
export function createProjectFileGlobMatcher(pattern: string): (filePath: string) => boolean {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          expression += "(?:.*/)?";
        } else {
          expression += ".*";
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += /[.\\+^$(){}|[\]]/.test(character) ? `\\${character}` : character;
    }
  }
  const regex = new RegExp(`${expression}$`);
  return (filePath) => regex.test(filePath);
}

export function matchesProjectFileGlob(filePath: string, pattern: string): boolean {
  return createProjectFileGlobMatcher(pattern)(filePath);
}

/** Builds a directory-first tree from the already bounded, deterministically sorted records. */
export function buildFileTree(
  files: readonly IndexedFileSummary[],
  maxDepth?: number
): FileTreeProjection {
  const root: MutableTreeNode = { name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = file.filePath.split("/");
    let current = root;
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]!;
      const path = parts.slice(0, index + 1).join("/");
      let child = current.children.get(name);
      if (child === undefined) {
        child = { name, path, children: new Map() };
        current.children.set(name, child);
      }
      current = child;
    }
    current.file = file;
  }

  return {
    returnedFileCount: files.length,
    children: renderChildren(root, 1, maxDepth)
  };
}

export function buildFileLanguageGroups(
  files: readonly IndexedFileSummary[]
): readonly FileLanguageGroup[] {
  const groups = new Map<IndexedFileSummary["language"], IndexedFileSummary[]>();
  for (const file of files) {
    const group = groups.get(file.language) ?? [];
    group.push(file);
    groups.set(file.language, group);
  }
  return [...groups.entries()]
    .map(([language, groupedFiles]) => ({
      language,
      fileCount: groupedFiles.length,
      files: groupedFiles.sort((left, right) => compareStableText(left.filePath, right.filePath))
    }))
    .sort((left, right) =>
      right.fileCount - left.fileCount || compareStableText(left.language, right.language));
}

function renderChildren(
  parent: MutableTreeNode,
  depth: number,
  maxDepth: number | undefined
): readonly FileTreeNode[] {
  return [...parent.children.values()]
    .sort((left, right) => {
      const leftDirectory = left.children.size > 0;
      const rightDirectory = right.children.size > 0;
      return leftDirectory === rightDirectory
        ? compareStableText(left.name, right.name)
        : leftDirectory ? -1 : 1;
    })
    .map((node): FileTreeNode => {
      if (node.children.size === 0 && node.file !== undefined) {
        return { kind: "file", name: node.name, path: node.path, file: node.file };
      }
      const depthLimited = maxDepth !== undefined && depth >= maxDepth && node.children.size > 0;
      const directory: FileTreeDirectoryNode = {
        kind: "directory",
        name: node.name,
        path: node.path,
        returnedFileCount: countFiles(node),
        depthLimited,
        children: depthLimited ? [] : renderChildren(node, depth + 1, maxDepth)
      };
      return directory;
    });
}

function countFiles(node: MutableTreeNode): number {
  let count = node.file === undefined ? 0 : 1;
  for (const child of node.children.values()) count += countFiles(child);
  return count;
}
