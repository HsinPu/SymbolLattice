import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type File = {path: string; language: SourceDocument["language"]; source: string};
const cases: {name: string; kind: string; files: File[]}[] = [
  {name: "markdown", kind: "references", files: [
    {path: "README.md", language: "markdown", source: "# Guide\n[API](docs/api.md)\n"},
    {path: "docs/api.md", language: "markdown", source: "# API\n"}]},
  {name: "liquid", kind: "calls", files: [
    {path: "templates/product.liquid", language: "liquid", source: "{% render 'card' %}\n"},
    {path: "snippets/card.liquid", language: "liquid", source: "<article>Card</article>"}]},
  {name: "twig", kind: "calls", files: [
    {path: "templates/page.twig", language: "twig", source: "{% include 'card.twig' %}\n"},
    {path: "templates/card.twig", language: "twig", source: "<article>Card</article>"}]},
  {name: "jsp", kind: "references", files: [
    {path: "src/main/webapp/index.jsp", language: "jsp", source: '<%@ include file="header.jsp" %>'},
    {path: "src/main/webapp/header.jsp", language: "jsp", source: "<header />"}]},
  {name: "blade", kind: "calls", files: [
    {path: "resources/views/page.blade.php", language: "blade", source: "@include('card')\n"},
    {path: "resources/views/card.blade.php", language: "blade", source: "<article>Card</article>"}]},
  {name: "razor", kind: "references", files: [
    {path: "Pages/Index.cshtml", language: "razor", source: '@page\n@model IndexModel\n<form method="post" asp-page-handler="Save"></form>'},
    {path: "Pages/Index.cshtml.cs", language: "csharp", source: "public class IndexModel : Microsoft.AspNetCore.Mvc.RazorPages.PageModel { public void OnPostSave() {} }"}]},
  {name: "solidity", kind: "extends", files: [
    {path: "Child.sol", language: "solidity", source: 'contract Base {}\ncontract Child is Base {}'},
    {path: "Base.sol", language: "solidity", source: "contract Base {}"}]}
];

function snapshot(files: File[]) {
  const documents = files.map((f) => ({relativePath: f.path, absolutePath: `/template-parity/${f.path}`, language: f.language,
    sourceText: f.source, contentHash: createHash("sha256").update(f.source).digest("hex")}));
  return resolveProjectFacts({sourceDocuments: documents,
    extractedFiles: documents.map((f) => extractFileFacts({filePath: f.relativePath, sourceText: f.sourceText, language: f.language})),
    indexedAt: "2026-09-09T00:00:00.000Z"});
}

describe("document and template complete-output parity before move", () => {
  it.each(cases)("$name preserves exact project-local relation", ({files, kind}) => {
    const result = snapshot(files);
    expect(result.edges.some((edge) => edge.kind === kind && edge.resolution === "exact")).toBe(true);
    expect(result).toMatchSnapshot();
  });
  it.each(cases)("$name preserves missing target nonclaim", ({name, files, kind}) => {
    const admitted = name === "solidity" ? [{path: "Child.sol", language: "solidity" as const, source: "contract Child is Base {}"}] : files.slice(0, 1);
    const result = snapshot(admitted);
    expect(result.edges.filter((edge) => edge.kind === kind && edge.resolution === "exact")).toEqual([]);
    expect(result.files.length).toBe(1);
    expect(result).toMatchSnapshot();
  });
});
