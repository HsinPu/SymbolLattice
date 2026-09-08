import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

// Representative existing integration inputs captured before module moves.
const cases: readonly { language: SourceDocument["language"]; files: Readonly<Record<string, string>> }[] = [
  {
    "language": "fsharp",
    "files": {
      "src/Api.fs": "module Demo.Api\n\ntype Point(value: int) =\n    member _.Magnitude() : int = value\n\ntype IContract = abstract Act: Point -> Point\ntype Base() =\n    abstract Run: Point -> Point\n\ntype Service() =\n    inherit Base()\n    interface IContract with\n        member _.Act(p: Point) : Point = p\n    override _.Run(p: Point) : Point = p\n\nmodule Helpers =\n    let helper (p: Point) : Point = p",
      "src/App.fs": "module Demo.App\nopen Demo.Api\n\nlet localA (p: Point) : Point = p\n\nlet execute (p: Point) (service: Service) : Point =\n    let local: Point = Point(1)\n    service.Run(p)\n    local.Magnitude()\n    Helpers.helper(p)\n    p |> localA\n    Point(2)"
    }
  },
  {
    "language": "ocaml",
    "files": {
      "src/Api.ml": "module Api = struct\n  class point (value : int) = object\n    method magnitude : int = value\n  end\n  class type contract = object\n    method act : point -> point\n  end\n  class base = object\n    method virtual run : point -> point\n  end\n  class service : contract = object\n    inherit base\n    method! run (p : point) : point = p\n  end\n  let helper (p : point) : point = p\nend",
      "src/App.ml": "open Api\nlet local_a (p : point) : point = p\nlet execute (p : point) (service : service) : point =\n  let local : point = new point (1) in\n  service#run (p);\n  local#magnitude;\n  Api.helper (p);\n  local_a (p);\n  new service;\n  local"
    }
  },
  {
    "language": "haskell",
    "files": {
      "src/Api.hs": "module Api (Point(..), Contract, helper) where\ndata Point = Point Int\nclass Contract a where\n  run :: a -> a\ninstance Contract Point where\n  run p = p\nhelper :: Point -> Point\nhelper p = p",
      "src/App.hs": "module App where\nimport Api (Point(..), helper, Contract)\nimport qualified Api as A\nlocal :: Point -> Point\nlocal p = helper p\nexecute :: Point -> Point\nexecute p =\n  let created = Point 1 in\n  let localResult = local p in\n  A.helper created"
    }
  },
  {
    "language": "scala",
    "files": {
      "src/Api.scala": "package demo.api\ntrait Contract { def run(value: Int): Int }\nclass Base { def run(value: Int): Int = value }\ncase class Point(value: Int) { def magnitude(): Int = value }\nclass Service(val point: Point) extends Base with Contract { override def run(value: Int): Int = value; def execute(input: Point): Point = Api.helper(input) }\nobject Api { def helper(point: Point): Point = point }\nenum Color { case Red, Blue }\ntype Alias = Point",
      "src/App.scala": "package demo.app\nimport demo.api.Api\nimport demo.api.Point\nimport demo.api.Service\nobject App {\n  def local(value: Point): Point = Api.helper(value)\n  def execute(value: Point): Point = {\n    val created: Point = new Point(1)\n    val caseCreated: Point = Point(2)\n    val service: Service = new Service(created)\n    val localResult: Point = local(value)\n    val memberResult: Int = created.magnitude()\n    val serviceResult: Point = service.execute(value)\n    Api.helper(created)\n  }\n}"
    }
  }
];

function snapshot(language: SourceDocument["language"], files: Readonly<Record<string, string>>) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath, absolutePath: `/resolver-parity/${relativePath}`, language, sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({sourceDocuments,
    extractedFiles: sourceDocuments.map((f) => extractFileFacts({filePath: f.relativePath, sourceText: f.sourceText, language})),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

function crossFileCalls(result: ReturnType<typeof snapshot>) {
  const symbols = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return result.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact" && symbols.get(edge.targetId)?.filePath !== edge.filePath);
}

describe("functional-language resolver output parity", () => {
  it.each(cases)("$language preserves multi-file relations and complete evidence", ({language, files}) => {
    const result = snapshot(language, files);
    expect(crossFileCalls(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });
  it.each(cases)("$language preserves consumer-only nonclaims and local relations", ({language, files}) => {
    const consumer = Object.entries(files).at(-1);
    if (!consumer) throw new Error("Missing consumer fixture");
    const result = snapshot(language, Object.fromEntries([consumer]));
    expect(crossFileCalls(result)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
