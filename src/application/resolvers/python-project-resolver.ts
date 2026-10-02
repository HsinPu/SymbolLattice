import { compareStableText, createEdgeId, type EdgeEvidence, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import { resolvePythonAbsoluteModule } from "./python-route-projector-helpers.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

/**
 * Resolves the deliberately narrow Python B2 surface: one named import from a
 * module below the current regular package, including dotted subpackages.
 * Unmarked directories below a known regular ancestor support written base
 * source only; they never establish runtime calls or construction.
 * Python's broader import machinery is outside this resolver. Missing targets,
 * duplicate, decorated or rebound declarations, unanchored namespaces and
 * unsupported binding shapes emit no edge.
 * Absolute named imports additionally support written single-base inheritance
 * at the indexed project root, including import lists/aliases. They never
 * resolve construction, inherited method dispatch, or inferred source roots.
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
    const packageDirectory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
    const sourceParts = packageDirectory === "" ? [] : packageDirectory.split("/");
    let anchorDepth: number | undefined;
    for (let depth = sourceParts.length; depth >= 0; depth--) {
      const prefix = sourceParts.slice(0, depth).join("/");
      if (input.knownFilePaths.has(`${prefix === "" ? "" : `${prefix}/`}__init__.py`)) { anchorDepth = depth; break; }
    }
    for (const imported of pythonFacts.relativeNamedImports) {
      if (anchorDepth === undefined || imported.filePath !== filePath || pythonFacts.dynamicGlobalHazard === true ||
          pythonFacts.artifactGlobalTaintedNames?.includes(imported.localName)) {
        continue;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(imported.moduleName)) continue;
      const moduleParts = imported.moduleName.split(".");
      const modulePath = moduleParts.join("/");
      const directoryParts = [...sourceParts, ...moduleParts.slice(0, -1)];
      const packageDirectories = Array.from({ length: directoryParts.length - anchorDepth + 1 }, (_, index) =>
        directoryParts.slice(0, anchorDepth! + index).join("/"));
      const packageMarkers = packageDirectories.map(directory => `${directory === "" ? "" : `${directory}/`}__init__.py`)
        .filter(marker => input.knownFilePaths.has(marker));
      const unmarkedPackagePaths = packageDirectories.filter(directory =>
        !input.knownFilePaths.has(`${directory === "" ? "" : `${directory}/`}__init__.py`));
      const anchoredSourceOnly = unmarkedPackagePaths.length > 0;
      const targetFilePath = packageDirectory === ""
        ? `${modulePath}.py`
        : `${packageDirectory}/${modulePath}.py`;
      const packageTargetFilePath = packageDirectory === ""
        ? `${modulePath}/__init__.py`
        : `${packageDirectory}/${modulePath}/__init__.py`;
      if (
        packageDirectories.some(directory => input.knownFilePaths.has(`${directory}.py`)) ||
        !input.knownFilePaths.has(targetFilePath) ||
        input.knownFilePaths.has(packageTargetFilePath) || targetFilePath === filePath
      ) {
        continue;
      }
      const sourceFile = input.fileSymbols.get(filePath);
      const targetFile = input.fileSymbols.get(targetFilePath);
      const targetFacts = input.factsByFile.get(targetFilePath)?.pythonFacts;
      if (sourceFile?.id !== imported.sourceId || targetFile === undefined || targetFacts === undefined) {
        continue;
      }
      const sourceBindings = [...pythonFacts.relativeNamedImports, ...(pythonFacts.absoluteNamedImports ?? [])].filter(
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
      const inheritances = pythonFacts.importedClassInheritances.filter(candidate =>
        candidate.filePath === filePath && candidate.localName === imported.localName);
      if (anchoredSourceOnly && (targetDeclaration.kind !== "class" || targetCallTainted || inheritances.length === 0)) continue;
      const sourceEvidence = (ruleId: string, candidateIds: readonly string[]): EdgeEvidence => ({
        ...referenceEvidence(ruleId, "module", candidateIds, packageMarkers, [filePath, targetFilePath]),
        ...(anchoredSourceOnly ? { unmarkedPackagePaths } : {})
      });
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
        evidence: sourceEvidence(anchoredSourceOnly ? "module.python.anchored-relative-named-base-import" :
          "module.python.regular-package.relative-named-import", fileImportCandidateIds)
      });
      if (
        !anchoredSourceOnly && targetDeclaration.kind === "function" &&
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
              packageMarkers,
              [filePath, targetFilePath]
            )
          });
        }
      }
      if (targetDeclaration.kind === "class") {
        if (!anchoredSourceOnly && targetDeclaration.instantiationEligible === true && !targetCallTainted) {
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
                packageMarkers,
                [filePath, targetFilePath]
              )
            });
          }
        }
        for (const inheritance of targetCallTainted ? [] : inheritances) {
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
            evidence: sourceEvidence(anchoredSourceOnly ? "module.python.anchored-relative-named-import.unique-top-level-class-inheritance" :
              "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance", declarationCandidateIds)
          });
        }
      }
    }
    // Written base-class identity only. Do not infer construction or inherited dispatch.
    const emittedAbsoluteImports = new Set<string>();
    for (const imported of pythonFacts.absoluteNamedImports ?? []) {
      if (imported.filePath !== filePath || pythonFacts.dynamicGlobalHazard === true ||
          pythonFacts.artifactGlobalTaintedNames?.includes(imported.localName)) continue;
      const targetFilePath = resolvePythonAbsoluteModule(input.knownFilePaths, filePath, imported.moduleName);
      if (targetFilePath === null) continue;
      const sourceFile = input.fileSymbols.get(filePath);
      const targetFile = input.fileSymbols.get(targetFilePath);
      const targetFacts = input.factsByFile.get(targetFilePath)?.pythonFacts;
      if (sourceFile?.id !== imported.sourceId || targetFile === undefined || targetFacts === undefined ||
          targetFacts.dynamicGlobalHazard === true || targetFacts.artifactGlobalTaintedNames?.includes(imported.importedName)) continue;
      const bindings = [...pythonFacts.relativeNamedImports, ...(pythonFacts.absoluteNamedImports ?? [])]
        .filter(candidate => candidate.localName === imported.localName);
      const declarations = targetFacts.topLevelDeclarations.filter(candidate => candidate.name === imported.importedName);
      if (bindings.length !== 1 || declarations.length !== 1 || declarations[0]?.kind !== "class") continue;
      const declaration = declarations[0];
      const inheritances = pythonFacts.importedClassInheritances.filter(candidate =>
        candidate.filePath === filePath && candidate.localName === imported.localName);
      if (inheritances.length === 0) continue;
      const packageMarkers = targetFilePath.split("/").slice(0, -1).map((_, index, parts) =>
        `${parts.slice(0, index + 1).join("/")}/__init__.py`);
      const importId = createEdgeId({ sourceId: sourceFile.id, targetId: targetFile.id, kind: "imports",
        line: imported.range.start.line, column: imported.range.start.column, referenceName: imported.moduleName });
      if (!emittedAbsoluteImports.has(importId)) {
        emittedAbsoluteImports.add(importId);
        edges.push({ id: importId,
        sourceId: sourceFile.id, targetId: targetFile.id, kind: "imports", filePath, range: imported.range,
        resolution: "exact", confidence: 1, referenceName: imported.moduleName,
        evidence: referenceEvidence("module.python.regular-package.absolute-named-base-import", "module",
          [targetFile.id], packageMarkers, [filePath, targetFilePath]) });
      }
      for (const inheritance of inheritances) {
        edges.push({ id: createEdgeId({ sourceId: inheritance.sourceId, targetId: declaration.symbolId, kind: "extends",
          line: inheritance.range.start.line, column: inheritance.range.start.column, referenceName: imported.localName }),
          sourceId: inheritance.sourceId, targetId: declaration.symbolId, kind: "extends", filePath, range: inheritance.range,
          resolution: "exact", confidence: 1, referenceName: imported.localName,
          evidence: referenceEvidence("module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance",
            "module", [declaration.symbolId], packageMarkers, [filePath, targetFilePath]) });
      }
    }
  }
  return edges;
}
