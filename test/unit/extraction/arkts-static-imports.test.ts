import { describe, expect, it } from "vitest";

import { extractArkTsFileFacts } from "../../../src/extraction/arkts.js";

describe("ArkTS static imports", () => {
  it("retains direct literal module-prelude imports as file dependencies", () => {
    const facts = extractArkTsFileFacts({
      filePath: "src/pages/Index.ets",
      language: "arkts",
      sourceText: `import { TopView } from '../common/topView'
import hilog from '@ohos.hilog'

@Entry
@Component
struct Index {
  build() { TopView() }
}`
    });

    expect(
      facts.pendingReferences.map((reference) => ({
        sourceId: reference.sourceId,
        relationKind: reference.relationKind,
        referenceName: reference.referenceName
      }))
    ).toEqual([
      {
        sourceId: facts.symbols[0]?.id,
        relationKind: "imports",
        referenceName: "../common/topView"
      },
      {
        sourceId: facts.symbols[0]?.id,
        relationKind: "imports",
        referenceName: "@ohos.hilog"
      }
    ]);
  });

  it("does not treat dynamic, CommonJS, fake, or post-statement text as static ArkTS imports", () => {
    const sources = [
      "const component = import('../common/topView')",
      "const component = require('../common/topView')",
      "const marker = 1\nimport { TopView } from '../common/topView'",
      "const text = \"import { TopView } from '../common/topView'\"",
      "// import { TopView } from '../common/topView'"
    ] as const;

    for (const sourceText of sources) {
      const facts = extractArkTsFileFacts({
        filePath: "src/pages/Index.ets",
        language: "arkts",
        sourceText
      });
      expect(facts.pendingReferences, sourceText).toEqual([]);
    }
  });
});
