import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode, type EdgeEvidence } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function isSpringBootPropertiesFile(filePath: string): boolean {
  const fileName = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  return /^(application|bootstrap)(?:-[A-Za-z0-9_.-]+)?\.properties$/iu.test(fileName);
}

function isSpringBootYamlFile(filePath: string): boolean {
  const fileName = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  return /^(application|bootstrap)(?:-[A-Za-z0-9_.-]+)?\.ya?ml$/iu.test(fileName);
}

type SpringBootConfigKeySource = "properties" | "yaml";

interface SpringBootConfigKeyCandidate {
  readonly source: SpringBootConfigKeySource;
  readonly symbol: SymbolNode;
}

function springBootConfigKeyCandidates(
  factsByFile: ReadonlyMap<string, ExtractedFileFacts>
): readonly SpringBootConfigKeyCandidate[] {
  const configKeySymbols: SpringBootConfigKeyCandidate[] = [];
  for (const [filePath, facts] of [...factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    if (isSpringBootPropertiesFile(filePath)) {
      const qualifiedNamePrefix = `${filePath}#properties-key:`;
      for (const symbol of facts.symbols) {
        if (symbol.kind === "variable" && symbol.qualifiedName.startsWith(qualifiedNamePrefix)) {
          configKeySymbols.push({ source: "properties", symbol });
        }
      }
    }
    if (isSpringBootYamlFile(filePath)) {
      const qualifiedNamePrefix = `${filePath}#spring-boot-yaml-key:`;
      for (const symbol of facts.symbols) {
        if (symbol.kind === "variable" && symbol.qualifiedName.startsWith(qualifiedNamePrefix)) {
          configKeySymbols.push({ source: "yaml", symbol });
        }
      }
    }
  }
  return configKeySymbols;
}

function springBootConfigRuleId(
  source: SpringBootConfigKeySource | "config",
  suffix: "exact-key" | "unresolved-key" | "ambiguous-key"
): string {
  return `framework.spring-boot.${source}.direct-value.literal-key.${suffix}`;
}

/**
 * Conservative Spring relaxed-key identity. Dots remain segment boundaries;
 * only case, hyphens, and underscores normalize within those segments.
 */
function canonicalSpringBootConfigKey(key: string): string {
  return key.toLowerCase().replaceAll("-", "").replaceAll("_", "");
}

function springBootRelaxedConfigRuleId(
  source: SpringBootConfigKeySource | "config",
  suffix: "unique-key" | "ambiguous-key"
): string {
  return `framework.spring-boot.${source}.direct-value.relaxed-key.${suffix}`;
}

/**
 * Projects a direct Java/Kotlin `@Value("${literal.key}")` fact through one
 * parser-proven conventional application/bootstrap properties or YAML key.
 * A lone literal spelling stays exact; relaxed case/dash/underscore matching
 * is a lower-confidence fallback. Profile precedence, format precedence, and
 * every duplicate canonical identity remain explicit unresolved references.
 */
export function projectSpringBootPropertiesReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const configKeySymbols = springBootConfigKeyCandidates(input.factsByFile);

  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.springBootPropertiesFacts?.valueReferences ?? [])].sort(
      (left, right) => {
        const bySource = compareStableText(left.sourceId, right.sourceId);
        if (bySource !== 0) {
          return bySource;
        }
        const byLine = left.range.start.line - right.range.start.line;
        return byLine !== 0 ? byLine : left.range.start.column - right.range.start.column;
      }
    );
    for (const reference of references) {
      const sourceSymbol = input.symbolsById.get(reference.sourceId);
      if (sourceSymbol === undefined) {
        continue;
      }
      const canonicalReferenceKey = canonicalSpringBootConfigKey(reference.key);
      const candidates = configKeySymbols
        .filter(
          (candidate) => canonicalSpringBootConfigKey(candidate.symbol.name) === canonicalReferenceKey
        )
        .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
      const target = candidates.length === 1 ? candidates[0]?.symbol : undefined;
      const isLiteralGroup =
        candidates.length > 0 && candidates.every((candidate) => candidate.symbol.name === reference.key);
      const isRelaxedGroup = candidates.length > 0 && !isLiteralGroup;
      const candidateSources = new Set(candidates.map((candidate) => candidate.source));
      const ruleSource =
        candidateSources.size > 1
          ? "config"
          : (candidates[0]?.source ?? "config");
      edges.push({
        id: createEdgeId({
          sourceId: sourceSymbol.id,
          targetId: target?.id ?? null,
          kind: "references",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.key
        }),
        sourceId: sourceSymbol.id,
        targetId: target?.id ?? null,
        kind: "references",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : isRelaxedGroup ? "heuristic" : "exact",
        confidence: target === undefined ? 0 : isRelaxedGroup ? 0.75 : 1,
        referenceName: reference.key,
        evidence: isRelaxedGroup
          ? referenceEvidence(
              springBootRelaxedConfigRuleId(
                ruleSource,
                target === undefined ? "ambiguous-key" : "unique-key"
              ),
              target === undefined ? "unresolved" : "heuristic",
              candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
              candidates.map((candidate) => candidate.symbol.filePath)
            )
          : referenceEvidence(
              springBootConfigRuleId(
                ruleSource,
                target !== undefined
                  ? "exact-key"
                  : candidates.length === 0
                    ? "unresolved-key"
                    : "ambiguous-key"
              ),
              target === undefined ? "unresolved" : "module",
              candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
              candidates.map((candidate) => candidate.symbol.filePath)
            )
      });
    }
  }
  return edges;
}

function springBootConfigurationPropertiesRuleId(
  suffix: "unique-leaf" | "ambiguous-leaf" | "unresolved-prefix"
): string {
  return `framework.spring-boot.configuration-properties.literal-prefix.${suffix}`;
}

function springBootConfigurationPropertiesRelaxedRuleId(
  suffix: "unique-leaf" | "ambiguous-leaf"
): string {
  return `framework.spring-boot.configuration-properties.relaxed-prefix.${suffix}`;
}

/**
 * A Java/Kotlin `@ConfigurationProperties(prefix = "app.cache")` class proves
 * the static prefix but not Spring's active-profile or source-precedence
 * outcome. Project each unique canonical descendant leaf, retaining literal
 * spelling at 0.85 and relaxed matching at 0.75; collisions and missing
 * prefixes remain unresolved.
 */
export function projectSpringBootConfigurationPropertiesPrefixes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const configKeySymbols = springBootConfigKeyCandidates(input.factsByFile);
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.springBootPropertiesFacts?.configurationPropertiesPrefixes ?? [])].sort(
      (left, right) => {
        const bySource = compareStableText(left.sourceId, right.sourceId);
        if (bySource !== 0) {
          return bySource;
        }
        const byLine = left.range.start.line - right.range.start.line;
        return byLine !== 0 ? byLine : left.range.start.column - right.range.start.column;
      }
    );
    for (const reference of references) {
      const sourceSymbol = input.symbolsById.get(reference.sourceId);
      if (sourceSymbol === undefined) {
        continue;
      }
      const candidatesByCanonicalKey = new Map<string, SpringBootConfigKeyCandidate[]>();
      const literalDescendantPrefix = `${reference.prefix}.`;
      const canonicalDescendantPrefix = `${canonicalSpringBootConfigKey(reference.prefix)}.`;
      for (const candidate of configKeySymbols) {
        const canonicalCandidateKey = canonicalSpringBootConfigKey(candidate.symbol.name);
        if (!canonicalCandidateKey.startsWith(canonicalDescendantPrefix)) {
          continue;
        }
        const candidates = candidatesByCanonicalKey.get(canonicalCandidateKey) ?? [];
        candidates.push(candidate);
        candidatesByCanonicalKey.set(canonicalCandidateKey, candidates);
      }
      const leaves = [...candidatesByCanonicalKey.entries()].sort(([left], [right]) =>
        compareStableText(left, right)
      );
      if (leaves.length === 0) {
        edges.push({
          id: createEdgeId({
            sourceId: sourceSymbol.id,
            targetId: null,
            kind: "references",
            line: reference.range.start.line,
            column: reference.range.start.column,
            referenceName: reference.prefix
          }),
          sourceId: sourceSymbol.id,
          targetId: null,
          kind: "references",
          filePath: reference.filePath,
          range: reference.range,
          resolution: "unresolved",
          confidence: 0,
          referenceName: reference.prefix,
          evidence: referenceEvidence(
            springBootConfigurationPropertiesRuleId("unresolved-prefix"),
            "unresolved",
            []
          )
        });
        continue;
      }
      for (const [canonicalKey, candidates] of leaves) {
        const orderedCandidates = [...candidates].sort((left, right) =>
          compareStableText(left.symbol.id, right.symbol.id)
        );
        const target = orderedCandidates.length === 1 ? orderedCandidates[0]?.symbol : undefined;
        const literalCandidateNames = new Set(
          orderedCandidates
            .filter((candidate) => candidate.symbol.name.startsWith(literalDescendantPrefix))
            .map((candidate) => candidate.symbol.name)
        );
        const literalKey = [...literalCandidateNames][0];
        const isLiteralGroup =
          literalKey !== undefined &&
          literalCandidateNames.size === 1 &&
          orderedCandidates.every((candidate) => candidate.symbol.name === literalKey);
        const referenceName = isLiteralGroup
          ? `${reference.prefix}:${literalKey}`
          : `${reference.prefix}:relaxed:${canonicalKey}`;
        edges.push({
          id: createEdgeId({
            sourceId: sourceSymbol.id,
            targetId: target?.id ?? null,
            kind: "references",
            line: reference.range.start.line,
            column: reference.range.start.column,
            referenceName
          }),
          sourceId: sourceSymbol.id,
          targetId: target?.id ?? null,
          kind: "references",
          filePath: reference.filePath,
          range: reference.range,
          resolution: target === undefined ? "unresolved" : "heuristic",
          confidence: target === undefined ? 0 : isLiteralGroup ? 0.85 : 0.75,
          referenceName,
          evidence: referenceEvidence(
            isLiteralGroup
              ? springBootConfigurationPropertiesRuleId(
                  target === undefined ? "ambiguous-leaf" : "unique-leaf"
                )
              : springBootConfigurationPropertiesRelaxedRuleId(
                  target === undefined ? "ambiguous-leaf" : "unique-leaf"
                ),
            target === undefined ? "unresolved" : "heuristic",
            candidateSymbolIds(orderedCandidates.map((candidate) => candidate.symbol)),
            orderedCandidates.map((candidate) => candidate.symbol.filePath)
          )
        });
      }
    }
  }
  return edges;
}
