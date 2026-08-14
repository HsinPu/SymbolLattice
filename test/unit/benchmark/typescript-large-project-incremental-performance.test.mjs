import { describe, expect, it } from "vitest";
import { assertDisposableProject, createSemanticProbeText, incrementalExitCode, renamedTypeScriptPath, scopeMatches, validateTruthManifest } from "../../../scripts/typescript-large-project-incremental-performance.mjs";

describe("Stage5 incremental harness contract", () => {
  it("requires an explicit Stage5 semanticProbe schema", () => {
    expect(() => validateTruthManifest({ selectedFiles: [{ filePath: "src/example.ts" }] })).toThrow("semanticProbe");
    expect(validateTruthManifest({ selectedFiles: [{ filePath: "src/example.ts" }], semanticProbe: { filePath: "src/example.ts", reopenCaller: "src/example.ts#caller", reopenTarget: "src/example.ts#target" } })).toEqual({ selectedFiles: ["src/example.ts"], semanticProbe: { filePath: "src/example.ts", reopenCaller: "src/example.ts#caller", reopenTarget: "src/example.ts#target" } });
  });
  it("creates two top-level functions with a direct caller-to-target call", () => {
    const probe = createSemanticProbeText();
    expect(probe.text).toContain(`export function ${probe.targetName}`); expect(probe.text).toContain(`export function ${probe.callerName}`); expect(probe.text).toContain(`return ${probe.targetName}();`);
  });
  it("keeps the rename target TypeScript and validates exact incremental scopes", () => {
    expect(renamedTypeScriptPath("src/example.ts")).toBe("src/example.symbol-lattice-stage5-rename.ts"); expect(() => renamedTypeScriptPath("README.md")).toThrow("TypeScript");
    expect(scopeMatches({ mode: "incremental", modifiedFiles: ["src/example.ts"], reExtractedFiles: ["src/example.ts"] }, { modifiedFiles: ["src/example.ts"], reExtractedFiles: ["src/example.ts"] })).toBe(true);
  });
  it("requires a fresh marker-authorized project", () => {
    expect(() => assertDisposableProject({ hasMarker: false, hasGitDirectory: true, hasIndexDirectory: false })).toThrow("disposable-project"); expect(() => assertDisposableProject({ hasMarker: true, hasGitDirectory: false, hasIndexDirectory: true })).toThrow("non-fresh");
  });
  it("fails the executable contract when any correctness assertion fails", () => {
    expect(incrementalExitCode({ correctness: { passed: true } })).toBe(0);
    expect(incrementalExitCode({ correctness: { passed: false } })).toBe(2);
  });
});
