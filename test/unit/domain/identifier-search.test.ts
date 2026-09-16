import { describe, expect, it } from "vitest";
import { identifierTermGroups, identifierTermVariants, identifierWords } from "../../../src/domain/identifier-search.js";

describe("identifier search concepts", () => {
  it("recognizes identifier word boundaries without damaging acronyms or Unicode", () => {
    expect(identifierWords("HTTPServer.resolve_userID")).toEqual(["http", "server", "resolve", "user", "id"]);
    expect(identifierWords("讀取使用者")).toEqual(["讀取使用者"]);
  });

  it("retains exact terms and limits inflection expansion to English words", () => {
    expect(identifierTermVariants("resolved")).toContain("resolve");
    expect(identifierTermVariants("creating")).toContain("create");
    expect(identifierTermVariants("running")).toContain("run");
    expect(identifierTermVariants("dependencies")).toContain("dependency");
    for (const term of ["class", "status", "analysis", "constructor", "src/file.ts", "資料", "x"]) {
      expect(identifierTermVariants(term)).toEqual([term]);
    }
  });

  it("merges overlapping word forms into a single coverage group", () => {
    const groups = identifierTermGroups(["resolve", "resolved", "resolving", "providers", "provider"]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(expect.arrayContaining(["resolve", "resolved", "resolving"]));
    expect(groups[1]).toEqual(expect.arrayContaining(["provider", "providers"]));
  });

  it("retains full query words while expanding conventional abbreviations as one concept", () => {
    expect(identifierTermVariants("parameters")).toEqual(expect.arrayContaining(["parameters", "parameter", "param", "params"]));
    expect(identifierTermGroups(["arguments", "args", "configuration", "config"])).toHaveLength(2);
    expect(identifierTermVariants("contextual")).not.toContain("ctx");
  });
});
