import { compareStableText, createEdgeId, type EdgeEvidence, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

/**
 * Resolves the deliberately narrow Python B2 surface: one named import from a
 * sibling module in a regular package.  Python's broader import machinery is
 * intentionally outside this resolver; every missing, duplicate, decorated,
 * rebound, namespace-package, or non-single-name shape simply emits no edge.
 */
export function projectPythonRegularPackageRelativeNamedImports(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const pythonFacts = facts.pythonFacts;
    if (pythonFacts === undefined) {
      continue;
    }
    for (const imported of pythonFacts.relativeNamedImports) {
      if (imported.filePath !== filePath) {
        continue;
      }
      const packageDirectory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
      const packageInit = packageDirectory === "" ? "__init__.py" : `${packageDirectory}/__init__.py`;
      const targetFilePath = packageDirectory === ""
        ? `${imported.moduleName}.py`
        : `${packageDirectory}/${imported.moduleName}.py`;
      const packageTargetFilePath = packageDirectory === ""
        ? `${imported.moduleName}/__init__.py`
        : `${packageDirectory}/${imported.moduleName}/__init__.py`;
      if (
        !input.knownFilePaths.has(packageInit) ||
        !input.knownFilePaths.has(targetFilePath) ||
        input.knownFilePaths.has(packageTargetFilePath)
      ) {
        continue;
      }
      const sourceFile = input.fileSymbols.get(filePath);
      const targetFile = input.fileSymbols.get(targetFilePath);
      const targetFacts = input.factsByFile.get(targetFilePath)?.pythonFacts;
      if (sourceFile?.id !== imported.sourceId || targetFile === undefined || targetFacts === undefined) {
        continue;
      }
      const sourceBindings = pythonFacts.relativeNamedImports.filter(
        (candidate) => candidate.localName === imported.localName
      );
      const targetDeclarations = targetFacts.topLevelDeclarations.filter(
        (candidate) => candidate.name === imported.importedName
      );
      if (sourceBindings.length !== 1 || targetDeclarations.length !== 1) {
        continue;
      }
      const targetDeclaration = targetDeclarations[0];
      if (targetDeclaration === undefined) {
        continue;
      }
      const declarationCandidateIds = [targetDeclaration.symbolId];
      const targetCallTainted =
        targetFacts.dynamicGlobalHazard === true ||
        (targetFacts.artifactGlobalTaintedNames?.includes(targetDeclaration.name) ?? false);
      const fileImportCandidateIds = [targetFile.id];
      edges.push({
        id: createEdgeId({
          sourceId: sourceFile.id,
          targetId: targetFile.id,
          kind: "imports",
          line: imported.range.start.line,
          column: imported.range.start.column,
          referenceName: `.${imported.moduleName}`
        }),
        sourceId: sourceFile.id,
        targetId: targetFile.id,
        kind: "imports",
        filePath,
        range: imported.range,
        resolution: "exact",
        confidence: 1,
        referenceName: `.${imported.moduleName}`,
        evidence: referenceEvidence(
          "module.python.regular-package.relative-named-import",
          "module",
          fileImportCandidateIds,
          [],
          [filePath, targetFilePath]
        )
      });
      if (
        targetDeclaration.kind === "function" &&
        targetDeclaration.runtimeCallEligible === true &&
        !targetCallTainted
      ) {
        for (const call of pythonFacts.importedFunctionCalls) {
          if (call.filePath !== filePath || call.localName !== imported.localName) {
            continue;
          }
          edges.push({
            id: createEdgeId({
              sourceId: call.sourceId,
              targetId: targetDeclaration.symbolId,
              kind: "calls",
              line: call.range.start.line,
              column: call.range.start.column,
              referenceName: call.localName
            }),
            sourceId: call.sourceId,
            targetId: targetDeclaration.symbolId,
            kind: "calls",
            filePath,
            range: call.range,
            resolution: "exact",
            confidence: 1,
            referenceName: call.localName,
            evidence: referenceEvidence(
              "module.python.regular-package.relative-named-import.unique-top-level-function-call",
              "module",
              declarationCandidateIds,
              [],
              [filePath, targetFilePath]
            )
          });
        }
      }
      if (targetDeclaration.kind === "class") {
        if (targetDeclaration.instantiationEligible === true && !targetCallTainted) {
          for (const instantiation of pythonFacts.importedClassInstantiations ?? []) {
            if (
              instantiation.filePath !== filePath ||
              instantiation.localName !== imported.localName
            ) {
              continue;
            }
            edges.push({
              id: createEdgeId({
                sourceId: instantiation.sourceId,
                targetId: targetDeclaration.symbolId,
                kind: "instantiates",
                line: instantiation.range.start.line,
                column: instantiation.range.start.column,
                referenceName: instantiation.localName
              }),
              sourceId: instantiation.sourceId,
              targetId: targetDeclaration.symbolId,
              kind: "instantiates",
              filePath,
              range: instantiation.range,
              resolution: "exact",
              confidence: 1,
              referenceName: instantiation.localName,
              evidence: referenceEvidence(
                "module.python.regular-package.relative-named-import.unique-top-level-class-instantiation",
                "module",
                declarationCandidateIds,
                [],
                [filePath, targetFilePath]
              )
            });
          }
        }
        for (const inheritance of pythonFacts.importedClassInheritances) {
          if (inheritance.filePath !== filePath || inheritance.localName !== imported.localName) {
            continue;
          }
          edges.push({
            id: createEdgeId({
              sourceId: inheritance.sourceId,
              targetId: targetDeclaration.symbolId,
              kind: "extends",
              line: inheritance.range.start.line,
              column: inheritance.range.start.column,
              referenceName: inheritance.localName
            }),
            sourceId: inheritance.sourceId,
            targetId: targetDeclaration.symbolId,
            kind: "extends",
            filePath,
            range: inheritance.range,
            resolution: "exact",
            confidence: 1,
            referenceName: inheritance.localName,
            evidence: referenceEvidence(
              "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance",
              "module",
              declarationCandidateIds,
              [],
              [filePath, targetFilePath]
            )
          });
        }
      }
    }
  }
  return edges;
}
