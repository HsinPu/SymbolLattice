import { describe, expect, it } from "vitest";

import {
  compareStableText,
  createEdgeId,
  type ArtifactFacts,
  type FortranProcedureFact,
  type GraphEdge,
  type SymbolNode
} from "../../../src/domain/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFortranFileFacts } from "../../../src/extraction/fortran.js";

const FORTRAN_PROJECT_RULE = "project.fortran.unique-subroutine.fixed-arity-call";
const INDEXED_AT = "2026-09-09T00:00:00.000Z";

const ENTRY_SOURCE = [
  "      SUBROUTINE ENTRY()",
  "      CALL HELPER(1,",
  "     $            2)",
  "      END"
].join("\n");
const HELPER_SOURCE = "      SUBROUTINE HELPER(A, B)\n      END\n";

interface FixtureInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly facts?: ArtifactFacts;
}

function sourceDocument(filePath: string, sourceText: string) {
  return {
    absolutePath: `/${filePath}`,
    relativePath: filePath,
    language: "fortran" as const,
    sourceText,
    contentHash: `${filePath}:${sourceText}`
  };
}

function extracted(filePath: string, sourceText: string): ArtifactFacts {
  return extractFortranFileFacts({ filePath, language: "fortran", sourceText });
}

function resolveFixtures(entries: readonly FixtureInput[]) {
  const fixtures = entries.map((entry) => ({
    ...entry,
    facts: entry.facts ?? extracted(entry.filePath, entry.sourceText)
  }));
  const snapshot = resolveProjectFacts({
    sourceDocuments: fixtures.map(({ filePath, sourceText }) =>
      sourceDocument(filePath, sourceText)
    ),
    extractedFiles: fixtures.map(({ facts }) => facts),
    indexedAt: INDEXED_AT
  });
  return { fixtures, snapshot };
}

function canonicalEdges(edges: readonly GraphEdge[]): readonly GraphEdge[] {
  return [...edges].sort((left, right) => compareStableText(left.id, right.id));
}

function expectedEdges(
  facts: readonly ArtifactFacts[],
  projectEdges: readonly GraphEdge[] = []
): readonly GraphEdge[] {
  return canonicalEdges([
    ...facts.flatMap((factsForFile) => factsForFile.edges),
    ...projectEdges
  ]);
}

function projectEdges(snapshot: { readonly edges: readonly GraphEdge[] }): readonly GraphEdge[] {
  return snapshot.edges.filter((edge) => edge.evidence?.ruleId === FORTRAN_PROJECT_RULE);
}

function symbolByName(facts: ArtifactFacts, name: string): SymbolNode {
  const symbol = facts.symbols.find(
    (candidate) => candidate.kind === "function" && candidate.name.toLowerCase() === name.toLowerCase()
  );
  if (symbol === undefined) {
    throw new Error(`Missing Fortran function symbol ${name}.`);
  }
  return symbol;
}

function replaceHelperProcedure(
  facts: ArtifactFacts,
  mutate: (procedure: FortranProcedureFact) => FortranProcedureFact
): ArtifactFacts {
  const fortranFacts = facts.fortranFacts;
  if (fortranFacts === undefined) {
    throw new Error("Missing Fortran project facts.");
  }
  return {
    ...facts,
    fortranFacts: {
      ...fortranFacts,
      procedures: fortranFacts.procedures.map((procedure) =>
        procedure.name.toLowerCase() === "helper" ? mutate(procedure) : procedure
      )
    }
  };
}

function expectedProjectCall(
  caller: SymbolNode,
  target: SymbolNode,
  call: NonNullable<ArtifactFacts["fortranFacts"]>["calls"][number]
): GraphEdge {
  return {
    id: createEdgeId({
      sourceId: caller.id,
      targetId: target.id,
      kind: "calls",
      line: call.range.start.line,
      column: call.range.start.column,
      referenceName: call.referenceName
    }),
    sourceId: caller.id,
    targetId: target.id,
    kind: "calls",
    filePath: call.filePath,
    range: call.range,
    resolution: "exact",
    confidence: 1,
    referenceName: call.referenceName,
    evidence: {
      ruleId: FORTRAN_PROJECT_RULE,
      stage: "module",
      candidateSymbolIds: [target.id]
    }
  };
}

describe("Fortran project resolver parity golden", () => {
  it("keeps the complete unique fixed-form CALL edge and evidence exact", () => {
    const { fixtures, snapshot } = resolveFixtures([
      { filePath: "entry.f", sourceText: ENTRY_SOURCE },
      { filePath: "helper.f", sourceText: HELPER_SOURCE }
    ]);
    const callerFacts = fixtures[0]?.facts;
    const helperFacts = fixtures[1]?.facts;
    if (callerFacts === undefined || helperFacts === undefined) {
      throw new Error("Missing fixed-form Fortran fixture facts.");
    }
    const caller = symbolByName(callerFacts, "ENTRY");
    const target = symbolByName(helperFacts, "HELPER");
    const call = callerFacts.fortranFacts?.calls[0];
    if (call === undefined) {
      throw new Error("Missing fixed-form Fortran CALL fact.");
    }
    const expected = expectedProjectCall(caller, target, call);

    expect(projectEdges(snapshot)).toEqual([expected]);
    expect(snapshot.edges).toEqual(expectedEdges([callerFacts, helperFacts], [expected]));
  });

  it.each([
    [
      "duplicate target",
      (targetFacts: ArtifactFacts) => targetFacts,
      ["a.f"] as const
    ],
    [
      "wrong arity",
      (targetFacts: ArtifactFacts) => replaceHelperProcedure(targetFacts, (procedure) => ({
        ...procedure,
        parameterCount: procedure.parameterCount - 1
      })),
      ["helper.f"] as const
    ],
    [
      "projectEligible false",
      (targetFacts: ArtifactFacts) => replaceHelperProcedure(targetFacts, (procedure) => ({
        ...procedure,
        projectEligible: false
      })),
      ["helper.f"] as const
    ],
    [
      "non-subroutine target",
      (targetFacts: ArtifactFacts) => replaceHelperProcedure(targetFacts, (procedure) => ({
        ...procedure,
        kind: "function"
      })),
      ["helper.f"] as const
    ],
    [
      "missing target symbol",
      (targetFacts: ArtifactFacts) => replaceHelperProcedure(targetFacts, (procedure) => ({
        ...procedure,
        symbolId: "missing-fortran-target"
      })),
      ["helper.f"] as const
    ]
  ] as const)("keeps the complete project edge output empty for %s", (_name, mutate, targetPaths) => {
    const entry = { filePath: "entry.f", sourceText: ENTRY_SOURCE };
    const helper = { filePath: "helper.f", sourceText: HELPER_SOURCE };
    const entryFacts = extracted(entry.filePath, entry.sourceText);
    const helperFacts = mutate(extracted(helper.filePath, helper.sourceText));
    const extraTargets = targetPaths
      .filter((path) => path !== "helper.f")
      .map((path) => ({
        filePath: path,
        sourceText: HELPER_SOURCE
      }));
    const entries: FixtureInput[] = [
      entry,
      { ...helper, facts: helperFacts },
      ...extraTargets
    ];
    const { fixtures, snapshot } = resolveFixtures(entries);

    expect(projectEdges(snapshot)).toEqual([]);
    expect(snapshot.edges).toEqual(expectedEdges(fixtures.map(({ facts }) => facts)));
  });

  it("keeps duplicate same-file syntax output and does not add a project duplicate", () => {
    const sourceText = [
      "subroutine entry()",
      "  call helper()",
      "end subroutine entry",
      "",
      "subroutine helper()",
      "end subroutine helper"
    ].join("\n");
    const { fixtures, snapshot } = resolveFixtures([
      { filePath: "same.f90", sourceText }
    ]);
    const facts = fixtures[0]?.facts;
    if (facts === undefined) {
      throw new Error("Missing same-file Fortran fixture facts.");
    }

    expect(snapshot.edges).toEqual(expectedEdges([facts]));
    expect(snapshot.edges.filter((edge) => edge.kind === "calls")).toEqual(
      canonicalEdges(facts.edges.filter((edge) => edge.kind === "calls"))
    );
    expect(projectEdges(snapshot)).toEqual([]);
  });
});
