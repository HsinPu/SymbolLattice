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
    expect(identifierTermVariants("sent")).toEqual(["sent", "send"]);
    expect(identifierTermGroups(["send", "sent"])).toHaveLength(1);
    expect(identifierTermVariants("sentry")).not.toContain("send");
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
    expect(identifierTermVariants("information")).toEqual(["information", "info"]);
    expect(identifierTermGroups(["information", "info", "server"])).toHaveLength(2);
    expect(identifierTermVariants("informational")).not.toContain("info");
    expect(identifierTermVariants("informatics")).not.toContain("info");
  });

  it("does not share cached arrays with callers or between helper calculations", () => {
    const words = identifierWords("HTTPServer.userID") as string[];
    words[0] = "wrong";
    words.push("injected");
    const variants = identifierTermVariants("information") as string[];
    variants.splice(0, variants.length, "wrong");
    expect(identifierWords("HTTPServer.userID")).toEqual(["http", "server", "user", "id"]);
    expect(identifierTermVariants("information")).toEqual(["information", "info"]);
    expect(identifierWords("information")).toEqual(["information"]);
    const hit = identifierTermVariants("information") as string[];
    hit.push("injected");
    expect(identifierTermVariants("information")).toEqual(["information", "info"]);
  });

  it("preserves inflections, Unicode and oversized spellings after repeated cache churn", () => {
    for (let index = 0; index < 12300; index++) {
      identifierWords(`HTTPServer${index}.userID`);
      identifierTermVariants(`candidate${index}`);
    }
    expect(identifierWords("HTTPServer.userID")).toEqual(["http", "server", "user", "id"]);
    expect(identifierTermVariants("parameters")).toEqual(["parameters", "parameter", "param", "params"]);
    const oversized = "資料_" + "ReadUserID_".repeat(30);
    expect(identifierWords(oversized)).toEqual(["資料", ...Array.from({ length: 30 }, () => ["read", "user", "id"]).flat()]);
    expect(identifierTermVariants(oversized)).toEqual([oversized]);
  });
});
