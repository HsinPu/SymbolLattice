import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { createSymbolId } from "../../../src/domain/index.js";
import { extractFileFacts, type ExtractedFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const ADA_PACKAGE_BODY_RULE = "project.ada.root-library-package-body.unique-specification";
const temporaryDirectories: string[] = [];
const SPECIFICATION_SOURCE = [
  "generic",
  "  type Item is private;",
  "package Result is",
  "end Result;"
].join("\n");
const BODY_SOURCE = [
  "package body Result is",
  "end Result;"
].join("\n");

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-ada-project-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

function adaPackageBodyEdges(snapshot: {
  readonly edges: readonly { readonly evidence?: { readonly ruleId?: string } }[];
}) {
  return snapshot.edges.filter((edge) => edge.evidence?.ruleId === ADA_PACKAGE_BODY_RULE);
}

function document(relativePath: string, sourceText: string) {
  return {
    absolutePath: `/${relativePath}`,
    relativePath,
    language: "ada" as const,
    sourceText,
    contentHash: `${relativePath}:${sourceText}`
  };
}

function extractedAda(filePath: string, sourceText: string): ExtractedFileFacts {
  return extractFileFacts({ filePath, language: "ada", sourceText });
}

function directSnapshot(input: {
  readonly specification?: ExtractedFileFacts;
  readonly body?: ExtractedFileFacts;
  readonly specificationSource?: string;
  readonly bodySource?: string;
  readonly specificationPath?: string;
  readonly bodyPath?: string;
}) {
  const specificationPath = input.specificationPath ?? "src/result.ads";
  const bodyPath = input.bodyPath ?? "src/result.adb";
  return resolveProjectFacts({
    sourceDocuments: [
      document(specificationPath, input.specificationSource ?? SPECIFICATION_SOURCE),
      document(bodyPath, input.bodySource ?? BODY_SOURCE)
    ],
    extractedFiles: [
      input.specification ?? extractedAda(specificationPath, SPECIFICATION_SOURCE),
      input.body ?? extractedAda(bodyPath, BODY_SOURCE)
    ],
    indexedAt: "2026-08-12T00:00:00.000Z"
  });
}

function withRuntimeAdaProjectFacts(
  facts: ExtractedFileFacts,
  adaProjectFacts: unknown
): ExtractedFileFacts {
  return { ...facts, adaProjectFacts } as unknown as ExtractedFileFacts;
}

function forgedInvalidIdentifierFacts(input: {
  readonly filePath: string;
  readonly role: "spec" | "body";
  readonly name: string;
}): { readonly sourceText: string; readonly facts: ExtractedFileFacts } {
  const prefix = input.role === "spec" ? "package " : "package body ";
  const header = `${prefix}${input.name} is`;
  const ending = `end ${input.name};`;
  const sourceText = `${header}\n${ending}`;
  const base = extractedAda(input.filePath, sourceText);
  const qualifiedName = `${input.filePath}#${input.role === "spec" ? "package" : "package-body"}:${input.name}`;
  const range = {
    start: { line: 1, column: 1 },
    end: { line: 2, column: ending.length + 1 }
  };
  const symbol = {
    id: createSymbolId({
      filePath: input.filePath,
      qualifiedName,
      kind: "module",
      declarationOrdinal: 0
    }),
    name: input.name,
    qualifiedName,
    kind: "module" as const,
    filePath: input.filePath,
    range,
    isExported: true,
    declarationOrdinal: 0
  };
  return {
    sourceText,
    facts: {
      ...base,
      symbols: [base.symbols[0]!, symbol],
      adaProjectFacts: {
        packageUnits: [{
          role: input.role,
          normalizedFullName: input.name.toLowerCase(),
          symbolId: symbol.id,
          filePath: input.filePath,
          unitRange: range,
          headerRange: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: header.length + 1 }
          },
          nameRange: {
            start: { line: 1, column: prefix.length + 1 },
            end: { line: 1, column: prefix.length + input.name.length + 1 }
          },
          endRange: {
            start: { line: 2, column: 5 },
            end: { line: 2, column: input.name.length + 5 }
          }
        }]
      }
    }
  };
}

describe("Ada project resolution", () => {
  it("pairs a Result-shaped generic package body with its unique specification", async () => {
    const projectPath = await createInlineProject({
      "src/result.ads": SPECIFICATION_SOURCE,
      "src/result.adb": BODY_SOURCE
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    const initial = await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const specification = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/result.ads#package:Result"
    );
    const body = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/result.adb#package-body:Result"
    );
    expect(specification).toMatchObject({
      kind: "module",
      filePath: "src/result.ads",
      name: "Result",
      range: { start: { line: 3, column: 1 }, end: { line: 4, column: 12 } }
    });
    expect(body).toMatchObject({
      kind: "module",
      filePath: "src/result.adb",
      name: "Result",
      range: { start: { line: 1, column: 1 }, end: { line: 2, column: 12 } }
    });
    expect(adaPackageBodyEdges(snapshot)).toEqual([
      expect.objectContaining({
        sourceId: body?.id,
        targetId: specification?.id,
        kind: "references",
        filePath: "src/result.adb",
        range: { start: { line: 1, column: 14 }, end: { line: 1, column: 20 } },
        resolution: "exact",
        confidence: 1,
        referenceName: "Result",
        evidence: {
          ruleId: ADA_PACKAGE_BODY_RULE,
          stage: "module",
          candidateSymbolIds: [specification?.id],
          resolutionPath: ["src/result.adb", "src/result.ads"]
        }
      })
    ]);

    expect((await service.callees(projectPath, body?.qualifiedName ?? "missing")).relations.map(
      (relation) => relation.symbol.id
    )).toEqual([specification?.id]);
    expect((await service.callers(projectPath, specification?.qualifiedName ?? "missing")).relations.map(
      (relation) => relation.symbol.id
    )).toEqual([body?.id]);
    expect(await service.explainEdge(projectPath, adaPackageBodyEdges(snapshot)[0]?.id ?? "missing"))
      .toMatchObject({
        source: { id: body?.id },
        target: { id: specification?.id },
        edge: { evidence: { ruleId: ADA_PACKAGE_BODY_RULE } }
      });
    expect(await service.hierarchy(projectPath, body?.qualifiedName ?? "missing")).toMatchObject({
      parents: [],
      children: []
    });
    expect(await service.hierarchy(projectPath, specification?.qualifiedName ?? "missing")).toMatchObject({
      parents: [],
      children: []
    });
    expect(await service.fileView(projectPath, "src/result.ads")).toMatchObject({ dependents: [] });

    const initialGenerationId = initial.generationId;
    expect((await service.sync({ projectPath })).generationId).toBe(initialGenerationId);
    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    expect((await reopened.callers(projectPath, specification?.qualifiedName ?? "missing")).relations.map(
      (relation) => relation.symbol.id
    )).toEqual([body?.id]);

    await writeFile(resolve(projectPath, "src/result.adb"), `${BODY_SOURCE}\n-- synchronized comment\n`, "utf8");
    const commentSync = await service.sync({ projectPath });
    expect(commentSync.generationId).not.toBe(initialGenerationId);
    expect(adaPackageBodyEdges(store.getSnapshot(projectPath))).toEqual([
      expect.objectContaining({
        id: adaPackageBodyEdges(snapshot)[0]?.id,
        sourceId: body?.id,
        targetId: specification?.id
      })
    ]);
    expect((await service.sync({ projectPath })).generationId).toBe(commentSync.generationId);

    await writeFile(resolve(projectPath, "src/result.adb"), BODY_SOURCE.replaceAll("Result", "Other"), "utf8");
    await service.sync({ projectPath });
    expect(adaPackageBodyEdges(store.getSnapshot(projectPath))).toEqual([]);
    await writeFile(resolve(projectPath, "src/result.adb"), BODY_SOURCE, "utf8");
    await service.sync({ projectPath });
    expect(adaPackageBodyEdges(store.getSnapshot(projectPath))).toEqual([
      expect.objectContaining({ sourceId: body?.id, targetId: specification?.id })
    ]);
  });

  it("matches canonical root package names case-insensitively", async () => {
    const projectPath = await createInlineProject({
      "src/result.ads": "package RESULT is\nend RESULT;",
      "src/result.adb": "package body Result is\nend result;"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(adaPackageBodyEdges(store.getSnapshot(projectPath))).toEqual([
      expect.objectContaining({ referenceName: "Result" })
    ]);
  });

  it.each([
    [
      "mismatched package names",
      { "src/result.ads": SPECIFICATION_SOURCE, "src/other.adb": BODY_SOURCE.replaceAll("Result", "Other") }
    ],
    [
      "duplicate specifications",
      {
        "src/result.ads": SPECIFICATION_SOURCE,
        "other/result.ads": SPECIFICATION_SOURCE,
        "src/result.adb": BODY_SOURCE
      }
    ],
    [
      "duplicate bodies",
      {
        "src/result.ads": SPECIFICATION_SOURCE,
        "src/result.adb": BODY_SOURCE,
        "other/result.adb": BODY_SOURCE
      }
    ],
    [
      "different directories",
      { "api/result.ads": SPECIFICATION_SOURCE, "src/result.adb": BODY_SOURCE }
    ],
    [
      "a noncanonical specification filename",
      { "src/custom.ads": SPECIFICATION_SOURCE, "src/result.adb": BODY_SOURCE }
    ],
    [
      "a noncanonical uppercase filename",
      { "src/Result.ads": SPECIFICATION_SOURCE, "src/result.adb": BODY_SOURCE }
    ],
    [
      "a child package",
      {
        "src/result.ads": "package Parent.Result is\nend Parent.Result;",
        "src/result.adb": "package body Parent.Result is\nend Parent.Result;"
      }
    ],
    [
      "a specification and body in one artifact",
      { "src/result.ads": `${SPECIFICATION_SOURCE}\n${BODY_SOURCE}` }
    ]
  ] as const)("emits no Ada package pairing for %s", async (_description, files) => {
    const projectPath = await createInlineProject(files);
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(adaPackageBodyEdges(store.getSnapshot(projectPath))).toEqual([]);
  });

  it.each([
    [
      "a duplicate fact",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification: {
          ...specification,
          adaProjectFacts: {
            packageUnits: [
              ...specification.adaProjectFacts!.packageUnits,
              ...specification.adaProjectFacts!.packageUnits
            ]
          }
        },
        body
      })
    ],
    [
      "foreign artifact ownership",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: specification.adaProjectFacts!.packageUnits
          }
        }
      })
    ],
    [
      "a missing symbol",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              symbolId: "missing-symbol"
            }))
          }
        }
      })
    ],
    [
      "a foreign module symbol",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              symbolId: specification.adaProjectFacts!.packageUnits[0]!.symbolId
            }))
          }
        }
      })
    ],
    [
      "a forged unit range",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              unitRange: { ...fact.unitRange, end: { line: 2, column: 11 } }
            }))
          }
        }
      })
    ],
    [
      "a forged header range",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              headerRange: fact.nameRange
            }))
          }
        }
      })
    ],
    [
      "a forged name range",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              nameRange: fact.endRange
            }))
          }
        }
      })
    ],
    [
      "a forged end range",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              endRange: fact.nameRange
            }))
          }
        }
      })
    ],
    [
      "a forged role",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({ ...fact, role: "spec" as const }))
          }
        }
      })
    ],
    [
      "a forged normalized name",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          adaProjectFacts: {
            packageUnits: body.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              normalizedFullName: "other"
            }))
          }
        }
      })
    ],
    [
      "a forged qualified identity",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification,
        body: {
          ...body,
          symbols: body.symbols.map((symbol) =>
            symbol.kind === "module" ? { ...symbol, qualifiedName: "src/result.adb#package-body:Other" } : symbol
          )
        }
      })
    ],
    [
      "an omitted specification fact",
      (specification: ExtractedFileFacts, body: ExtractedFileFacts) => ({
        specification: { ...specification, adaProjectFacts: undefined },
        body
      })
    ]
  ] as const)("poisons Ada project resolution for %s", (_description, tamper) => {
    const specification = extractedAda("src/result.ads", SPECIFICATION_SOURCE);
    const body = extractedAda("src/result.adb", BODY_SOURCE);
    const tampered = tamper(specification, body);

    expect(adaPackageBodyEdges(directSnapshot(tampered))).toEqual([]);
  });

  it("poisons Ada project resolution when retained facts are stale against the source document", () => {
    expect(adaPackageBodyEdges(directSnapshot({
      body: extractedAda("src/result.adb", BODY_SOURCE),
      bodySource: BODY_SOURCE.replace("end Result;", "end Other;")
    }))).toEqual([]);
  });

  it("poisons all Ada pairings when any retained Ada fact is invalid", () => {
    const otherSpecificationSource = "package Other is\nend Other;";
    const otherBodySource = "package body Other is\nend Other;";
    const invalidOtherBody = extractedAda("other/other.adb", otherBodySource);
    const snapshot = resolveProjectFacts({
      sourceDocuments: [
        document("src/result.ads", SPECIFICATION_SOURCE),
        document("src/result.adb", BODY_SOURCE),
        document("other/other.ads", otherSpecificationSource),
        document("other/other.adb", otherBodySource)
      ],
      extractedFiles: [
        extractedAda("src/result.ads", SPECIFICATION_SOURCE),
        extractedAda("src/result.adb", BODY_SOURCE),
        extractedAda("other/other.ads", otherSpecificationSource),
        {
          ...invalidOtherBody,
          adaProjectFacts: {
            packageUnits: invalidOtherBody.adaProjectFacts!.packageUnits.map((fact) => ({
              ...fact,
              nameRange: fact.endRange
            }))
          }
        }
      ],
      indexedAt: "2026-08-12T00:00:00.000Z"
    });

    expect(adaPackageBodyEdges(snapshot)).toEqual([]);
  });

  it("rejects noncanonical Ada module declaration ordinals", () => {
    const specification = extractedAda("src/result.ads", SPECIFICATION_SOURCE);
    const body = extractedAda("src/result.adb", BODY_SOURCE);
    const forgedBody = {
      ...body,
      symbols: body.symbols.map((symbol) =>
        symbol.kind === "module" ? { ...symbol, declarationOrdinal: 99 } : symbol
      )
    };

    expect(adaPackageBodyEdges(directSnapshot({ specification, body: forgedBody }))).toEqual([]);
  });

  it.each([
    ["null project facts", () => null],
    ["a non-record project fact", () => "invalid"],
    ["a missing packageUnits array", () => ({})],
    ["null packageUnits", () => ({ packageUnits: null })],
    ["a non-array packageUnits value", () => ({ packageUnits: {} })],
    ["a null package-unit fact", () => ({ packageUnits: [null] })],
    ["a null normalized name", (fact: Record<string, unknown>) => ({ packageUnits: [{ ...fact, normalizedFullName: null }] })],
    ["a missing normalized name", (fact: Record<string, unknown>) => {
      const { normalizedFullName: _removed, ...withoutName } = fact;
      return { packageUnits: [withoutName] };
    }],
    ["an invalid role", (fact: Record<string, unknown>) => ({ packageUnits: [{ ...fact, role: "procedure" }] })],
    ["a null unit range", (fact: Record<string, unknown>) => ({ packageUnits: [{ ...fact, unitRange: null }] })],
    ["a missing header range", (fact: Record<string, unknown>) => {
      const { headerRange: _removed, ...withoutHeaderRange } = fact;
      return { packageUnits: [withoutHeaderRange] };
    }],
    ["a scalar name range", (fact: Record<string, unknown>) => ({ packageUnits: [{ ...fact, nameRange: 1 }] })],
    ["an incomplete end range", (fact: Record<string, unknown>) => ({
      packageUnits: [{ ...fact, endRange: { start: { line: 2, column: 5 } } }]
    })]
  ] as const)("does not throw and poisons Ada projection for %s", (_description, malformed) => {
    const specification = extractedAda("src/result.ads", SPECIFICATION_SOURCE);
    const body = extractedAda("src/result.adb", BODY_SOURCE);
    const fact = specification.adaProjectFacts!.packageUnits[0] as unknown as Record<string, unknown>;
    const malformedFacts = malformed(fact);
    let snapshot: ReturnType<typeof directSnapshot> | undefined;

    expect(() => {
      snapshot = directSnapshot({
        specification: withRuntimeAdaProjectFacts(specification, malformedFacts),
        body
      });
    }).not.toThrow();
    expect(snapshot === undefined ? [] : adaPackageBodyEdges(snapshot)).toEqual([]);
  });

  it.each(["Package", "Bad__Name", "Bad_"])(
    "rejects a fully source-coherent forged Ada identifier %s",
    (name) => {
      const normalizedName = name.toLowerCase();
      const specification = forgedInvalidIdentifierFacts({
        filePath: `src/${normalizedName}.ads`,
        role: "spec",
        name
      });
      const body = forgedInvalidIdentifierFacts({
        filePath: `src/${normalizedName}.adb`,
        role: "body",
        name
      });
      const snapshot = resolveProjectFacts({
        sourceDocuments: [
          document(`src/${normalizedName}.ads`, specification.sourceText),
          document(`src/${normalizedName}.adb`, body.sourceText)
        ],
        extractedFiles: [specification.facts, body.facts],
        indexedAt: "2026-08-12T00:00:00.000Z"
      });

      expect(adaPackageBodyEdges(snapshot)).toEqual([]);
    }
  );

  it("does not throw while sync rebuilds a generation containing malformed persisted Ada facts", async () => {
    const projectPath = await createInlineProject({
      "src/result.ads": SPECIFICATION_SOURCE,
      "src/result.adb": BODY_SOURCE
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const bundle = store.getActiveGenerationBundle(projectPath);
    if (bundle.indexInputs === null) {
      throw new Error("Expected initialized project inputs.");
    }
    store.replaceProjectFacts({
      projectPath,
      snapshot: bundle.snapshot,
      indexedAt: "2026-08-12T00:00:00.000Z",
      artifactFacts: bundle.artifactFacts.map((facts) =>
        facts.filePath === "src/result.ads"
          ? withRuntimeAdaProjectFacts(facts, { packageUnits: [null] }) as typeof facts
          : facts
      ),
      indexInputs: bundle.indexInputs,
      resolverVersion: "project-resolver-v142"
    });

    await expect(service.sync({ projectPath })).resolves.toMatchObject({ stale: false });
    expect(adaPackageBodyEdges(store.getSnapshot(projectPath))).toEqual([]);
  });
});
