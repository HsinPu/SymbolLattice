import { compareStableText } from "../domain/index.js";
import type {
  FileLanguageGroup,
  FileTreeDirectoryNode,
  FileTreeNode,
  FileTreeProjection,
  IndexedFileSummary
} from "./types.js";

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
