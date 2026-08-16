import { describe, expect, it } from "vitest";

import { scoreSets, strictHtmlTruth } from "../../../scripts/html-large-project-correctness-oracle.mjs";

describe("HTML large-project correctness oracle", () => {
  it("derives strict element identities and containment without product extraction", () => {
    const truth = strictHtmlTruth("index.html", "<!doctype html><html><body><main><img></main></body></html>");
    expect(truth).toEqual({
      identities: [
        "index.html#html-element:html[1]",
        "index.html#html-element:html[1]/body[1]",
        "index.html#html-element:html[1]/body[1]/main[1]",
        "index.html#html-element:html[1]/body[1]/main[1]/img[1]"
      ],
      containments: [
        "index.html->index.html#html-element:html[1]",
        "index.html#html-element:html[1]->index.html#html-element:html[1]/body[1]",
        "index.html#html-element:html[1]/body[1]->index.html#html-element:html[1]/body[1]/main[1]",
        "index.html#html-element:html[1]/body[1]/main[1]->index.html#html-element:html[1]/body[1]/main[1]/img[1]"
      ]
    });
  });

  it("rejects recovery-dependent documents and keeps RCDATA opaque", () => {
    expect(strictHtmlTruth("bad.html", "<div><span></div>")).toBeNull();
    expect(strictHtmlTruth("bad.html", "<div>")).toBeNull();
    expect(strictHtmlTruth("ok.html", "<textarea><p>literal</p></textarea>")?.identities).toEqual([
      "ok.html#html-element:textarea[1]"
    ]);
  });

  it("reports exact set false positives and false negatives", () => {
    expect(scoreSets(["a", "b"], ["a", "c"])).toMatchObject({ tp: 1, fp: 1, fn: 1 });
  });
});
