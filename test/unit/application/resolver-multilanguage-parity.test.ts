import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

// Fixed representative inputs from existing relation integration tests.
// Captured before each corresponding language resolver is moved; not compiler truth.
const cases: readonly { language: SourceDocument["language"]; files: Readonly<Record<string, string>> }[] = [
  {
    "language": "kotlin",
    "files": {
      "src/api/Contract.kt": "package demo.api\n\ninterface Contract { fun act() }\nopen class Widget(val value: Int) {\n  open fun run() {}\n}\nfun helper() {}\nfun Widget.ext() {}\n",
      "src/app/Service.kt": "package demo.app\n\nimport demo.api.Contract\nimport demo.api.Widget\n\nclass Service : Contract {\n  override fun act() {}\n  fun create(): Widget = Widget(1)\n}\n",
      "src/app/Caller.kt": "package demo.app\n\nimport demo.api.Widget\nimport demo.api.ext\nimport demo.api.helper\nimport demo.app.Service\n\nfun caller() {\n  val service: Service = Service()\n  val widget: Widget = Widget(1)\n  widget.run()\n  widget.ext()\n  helper()\n  service.act()\n}\n"
    }
  },
  {
    "language": "swift",
    "files": {
      "Sources/API.swift": "public protocol Contract {\n  func act()\n}\npublic class Base {\n  public init() {}\n  public func run() {}\n}\npublic struct Point {\n  public init(x: Int) {}\n  public func magnitude() {}\n}\npublic class Service: Base, Contract {\n  public init(value: Int) {}\n  override public func run() {}\n  func act() {}\n}\nextension Point {\n  public func doubled() {}\n}\npublic func helper() {}\npublic func makePoint(_ value: Point) -> Point { value }",
      "Sources/App.swift": "import Demo.Point\nimport Demo.Service\nimport Demo.Contract\nimport Demo.helper\nimport Demo.makePoint\n\nfunc caller(_ point: Point, _ service: Service) {\n  point.magnitude()\n  point.doubled()\n  service.run()\n  Point(x: 1)\n  helper()\n  makePoint(Point(x: 1))\n}"
    }
  },
  {
    "language": "dart",
    "files": {
      "lib/api.dart": "class Base {\n  Base(int value) {}\n  void run() {}\n}\nclass Child extends Base with Mixin implements Contract {\n  Child(int value) : super(value);\n  @override\n  void run() {}\n}\nmixin Mixin { void mix() {} }\nabstract class Contract { void act(); }\nclass Point {\n  Point(int value) {}\n  int magnitude() => 0;\n}\nextension PointExtensions on Point { int doubled() => 2; }\nint helper(Point value) => value.magnitude();",
      "lib/app.dart": "import 'api.dart';\nvoid caller() {\n  final Point local = Point(1);\n  local.magnitude();\n  local.doubled();\n  helper(Point(1));\n  Child(1);\n}"
    }
  },
  {
    "language": "csharp",
    "files": {
      "src/Api.cs": "namespace Demo.Api {\n  public interface IContract { void Act(Point p); }\n  public record Point(int Value);\n  public class Base {\n    public Base(int value) {}\n    public virtual Point Run(Point p) => p;\n  }\n  public class Service : Base, IContract {\n    public Service(int value) : base(value) {}\n    public override Point Run(Point p) => p;\n    public void Act(Point p) {}\n  }\n  public static class Helpers { public static Point Helper(Point p) => p; }\n}",
      "src/App.cs": "using Demo.Api;\nnamespace Demo.App {\n  public class Caller {\n    public Point Execute(Point point, Service service) {\n      Point local = new Point(1);\n      local = new Point(2);\n      service.Run(point);\n      Helpers.Helper(new Point(3));\n      new Service(1);\n      return Helpers.Helper(new Point(4));\n    }\n  }\n}"
    }
  }
];

describe("multi-language resolver complete-output parity", () => {
  it.each(cases)("$language preserves unresolved imports when only the consumer remains", ({ language, files }) => {
    const entries = Object.entries(files);
    const consumer = entries[entries.length - 1];
    if (consumer === undefined) throw new Error("Missing consumer fixture");
    const [relativePath, sourceText] = consumer;
    const result = resolveProjectFacts({
      sourceDocuments: [{
        relativePath, absolutePath: `/resolver-parity/${relativePath}`, language, sourceText,
        contentHash: createHash("sha256").update(sourceText).digest("hex")
      }],
      extractedFiles: [extractFileFacts({ filePath: relativePath, sourceText, language })],
      indexedAt: "2026-09-09T00:00:00.000Z"
    });
    expect(result.edges.filter((edge) => edge.resolution === "exact" && edge.kind === "calls")).toEqual([]);
    expect(result).toMatchSnapshot();
  });

  it.each(cases)("$language preserves the full multi-file snapshot", ({ language, files }) => {
    const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
      relativePath, absolutePath: `/resolver-parity/${relativePath}`, language, sourceText,
      contentHash: createHash("sha256").update(sourceText).digest("hex")
    }));
    const result = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((file) => extractFileFacts({
        filePath: file.relativePath, sourceText: file.sourceText, language: file.language
      })),
      indexedAt: "2026-09-09T00:00:00.000Z"
    });
    expect(result.edges.some((edge) => edge.resolution === "exact" && edge.kind === "calls")).toBe(true);
    expect(result).toMatchSnapshot();
  });
});
