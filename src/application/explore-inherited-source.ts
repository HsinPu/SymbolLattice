import type { GraphEdge, SymbolNode } from "../domain/types.js";
import type { ExploreQueryGraph } from "./explore-query.js";

/** Written one-hop source context. Never an MRO, receiver-type or dispatch claim. */
export interface InheritedSourceWitness {
  readonly callerClass: SymbolNode;
  readonly declarationClass: SymbolNode;
  readonly callerContainment: GraphEdge;
  readonly inheritance: GraphEdge;
  readonly declarationContainment: GraphEdge;
  readonly importEdge: GraphEdge;
}

export function inheritedSourceLookup(graph: ExploreQueryGraph):
  (source: SymbolNode, call: GraphEdge, declaration: SymbolNode) => InheritedSourceWitness | undefined {
  // Initialized only for an eligible cross-file lead; no extra store read.
  let symbols: Map<string, SymbolNode> | undefined;
  let incoming: Map<string, GraphEdge[]>;
  let outgoing: Map<string, GraphEdge[]>;
  const inside = (edge: GraphEdge, symbol: SymbolNode) => {
    const compare = (a: typeof edge.range.start, b: typeof edge.range.start) => a.line - b.line || a.column - b.column;
    return edge.filePath === symbol.filePath && compare(edge.range.start, symbol.range.start) >= 0 &&
      compare(edge.range.end, symbol.range.end) <= 0 && compare(edge.range.end, edge.range.start) > 0;
  };
  return (source, call, declaration) => {
    if (source.kind !== "method" || declaration.kind !== "method" || !source.filePath.endsWith(".py") ||
        call.sourceId !== source.id || call.kind !== "calls" || call.targetId !== null ||
        call.resolution !== "unresolved" || call.confidence !== 0 || !inside(call, source) ||
        call.referenceName !== `self.${declaration.name}` ||
        call.evidence?.ruleId !== "syntax.python.member-call.unknown-receiver") return undefined;
    if (symbols === undefined) {
      symbols = new Map(graph.symbols.slice(0, 4096).map(symbol => [symbol.id, symbol]));
      incoming = new Map(); outgoing = new Map();
      for (const edge of graph.edges.slice(0, 16384)) {
        if (edge.resolution !== "exact" || edge.confidence !== 1 || edge.targetId === null) continue;
        const targets = incoming.get(edge.targetId) ?? []; targets.push(edge); incoming.set(edge.targetId, targets);
        const sources = outgoing.get(edge.sourceId) ?? []; sources.push(edge); outgoing.set(edge.sourceId, sources);
      }
    }
    const callerLinks = (incoming.get(source.id) ?? []).filter(edge => edge.kind === "contains");
    const declarationLinks = (incoming.get(declaration.id) ?? []).filter(edge => edge.kind === "contains");
    if (callerLinks.length !== 1 || declarationLinks.length !== 1) return undefined;
    const callerContainment = callerLinks[0]!, declarationContainment = declarationLinks[0]!;
    const callerClass = symbols.get(callerContainment.sourceId), declarationClass = symbols.get(declarationContainment.sourceId);
    if (callerClass?.kind !== "class" || declarationClass?.kind !== "class" ||
        callerClass.filePath === declarationClass.filePath || !inside(callerContainment, source) ||
        !inside(declarationContainment, declaration) || !inside(callerContainment, callerClass) ||
        !inside(declarationContainment, declarationClass)) return undefined;
    const bases = (outgoing.get(callerClass.id) ?? []).filter(edge => edge.kind === "extends");
    if (bases.length !== 1) return undefined;
    const inheritance = bases[0]!;
    if (inheritance.targetId !== declarationClass.id || !inside(inheritance, callerClass) ||
        inheritance.evidence?.ruleId !== "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance" ||
        inheritance.evidence.stage !== "module") return undefined;
    const path = inheritance.evidence.resolutionPath;
    if (path?.length !== 2 || path[0] !== callerClass.filePath || path[1] !== declarationClass.filePath) return undefined;
    const imports = graph.edges.slice(0, 16384).filter(edge => edge.kind === "imports" && edge.resolution === "exact" &&
      edge.confidence === 1 && edge.filePath === callerClass.filePath && edge.targetId !== null &&
      symbols!.get(edge.sourceId)?.kind === "file" && symbols!.get(edge.sourceId)?.filePath === callerClass.filePath &&
      symbols!.get(edge.targetId)?.kind === "file" && symbols!.get(edge.targetId)?.filePath === declarationClass.filePath &&
      edge.evidence?.ruleId === "module.python.regular-package.absolute-named-base-import" &&
      edge.evidence.stage === "module" && edge.evidence.resolutionPath?.join("\n") === path.join("\n"));
    if (imports.length !== 1) return undefined;
    return { callerClass, declarationClass, callerContainment, inheritance, declarationContainment, importEdge: imports[0]! };
  };
}
