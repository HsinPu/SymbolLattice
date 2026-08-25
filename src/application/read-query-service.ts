import type { GitChangeSetProvider, GitRevisionHunkProvider } from "../ports/git-change-set.js";
import type { GraphStore } from "../ports/graph-store.js";
import type { SourceCatalog } from "../ports/source-catalog.js";
import {
  SymbolLatticeService,
  type SymbolLatticeServiceExtensions
} from "./service.js";

/** Read-only service surface loaded by MCP query workers. */
export type ReadQueryService = Pick<
  SymbolLatticeService,
  | "explore"
  | "node"
  | "context"
  | "affectedTests"
  | "gitAffectedTestsAvailable"
  | "affectedTestsFromGit"
  | "gitHunksAvailable"
  | "gitHunks"
  | "search"
  | "investigate"
  | "impact"
  | "files"
  | "fileView"
  | "routes"
  | "entrypoints"
  | "hierarchy"
  | "history"
  | "diff"
  | "explainEdge"
>;

export function createReadQueryService(
  graphStore: GraphStore,
  sourceCatalog: SourceCatalog,
  extensions: SymbolLatticeServiceExtensions = {},
  gitChangeSetProvider?: GitChangeSetProvider,
  gitRevisionHunkProvider?: GitRevisionHunkProvider
): ReadQueryService {
  return new SymbolLatticeService(
    graphStore,
    sourceCatalog,
    extensions,
    gitChangeSetProvider,
    gitRevisionHunkProvider
  );
}
