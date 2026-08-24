import { describe, expect, it } from "vitest";

import { scoreSets, strictHtmlTruth } from "../../../benchmarks/html/correctness-oracle.mjs";

describe("HTML large-project correctness oracle", () => {
  it("derives strict element identities and containment without product extraction", () => {
    const truth = strictHtmlTruth("index.html", '<!doctype html><html lang="en"><body><main id="app"><img alt=""></main></body></html>');
    expect(truth.resources).toEqual([
        "index.html#html-element:html[1]",
        "index.html#html-element:html[1]#html-attribute:lang=en",
        "index.html#html-element:html[1]/body[1]",
        "index.html#html-element:html[1]/body[1]/main[1]",
        "index.html#html-element:html[1]/body[1]/main[1]#html-attribute:id=app",
        "index.html#html-element:html[1]/body[1]/main[1]#html-semantic:landmark:main",
        "index.html#html-element:html[1]/body[1]/main[1]/img[1]",
        "index.html#html-element:html[1]/body[1]/main[1]/img[1]#html-attribute:alt="
    ]);
    expect(truth.containments).toEqual([
        "index.html->index.html#html-element:html[1]",
        "index.html#html-element:html[1]->index.html#html-element:html[1]#html-attribute:lang=en",
        "index.html#html-element:html[1]->index.html#html-element:html[1]/body[1]",
        "index.html#html-element:html[1]/body[1]->index.html#html-element:html[1]/body[1]/main[1]",
        "index.html#html-element:html[1]/body[1]/main[1]->index.html#html-element:html[1]/body[1]/main[1]#html-attribute:id=app",
        "index.html#html-element:html[1]/body[1]/main[1]->index.html#html-element:html[1]/body[1]/main[1]#html-semantic:landmark:main",
        "index.html#html-element:html[1]/body[1]/main[1]->index.html#html-element:html[1]/body[1]/main[1]/img[1]",
        "index.html#html-element:html[1]/body[1]/main[1]/img[1]->index.html#html-element:html[1]/body[1]/main[1]/img[1]#html-attribute:alt="
    ]);
  });

  it("rejects recovery-dependent documents and keeps RCDATA opaque", () => {
    expect(strictHtmlTruth("bad.html", "<div><span></div>")).toBeNull();
    expect(strictHtmlTruth("bad.html", "<div>")).toBeNull();
    expect(strictHtmlTruth("ok.html", "<textarea><p>literal</p></textarea>")?.resources).toEqual([
      "ok.html#html-element:textarea[1]",
      "ok.html#html-element:textarea[1]#html-semantic:form-control:textarea"
    ]);
  });

  it("does not classify a statically hidden input as an interactive-control conflict", () => {
    const truth = strictHtmlTruth(
      "hidden.html",
      '<html lang="en"><body><input type="hidden" aria-hidden="true" role="presentation"><button disabled aria-hidden="true" role="presentation"></button><button hidden aria-hidden="true" role="presentation"></button></body></html>'
    );

    expect(
      truth.resources.filter((resource) => resource.includes("#html-diagnostic:"))
    ).toEqual([]);
  });

  it("reports exact set false positives and false negatives", () => {
    expect(scoreSets(["a", "b"], ["a", "c"])).toMatchObject({ tp: 1, fp: 1, fn: 1 });
  });
});
