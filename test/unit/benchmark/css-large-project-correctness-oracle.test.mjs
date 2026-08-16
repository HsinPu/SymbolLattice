import { describe, expect, it } from "vitest";

import { scoreSets, strictCssTruth } from "../../../scripts/css-large-project-correctness-oracle.mjs";

describe("CSS large-project correctness oracle", () => {
  it("derives independent strict CSS resource and containment truths", () => {
    const truth = strictCssTruth(
      "site.css",
      ":root { --tone: red; }\n.card:hover, #hero { color: var(--tone); display: grid; }"
    );

    expect(truth).not.toBeNull();
    expect(truth.resources).toEqual(expect.arrayContaining([
      "site.css#css-rule[1]::root@0",
      "site.css#css-rule[1]::root#css-selector::root@0",
      "site.css#css-rule[1]::root#css-selector::root#css-semantic:selector-kind:pseudo@0",
      "site.css#css-rule[1]::root#css-custom-property:--tone@0",
      "site.css#css-rule[2]:.card:hover, #hero@0",
      "site.css#css-rule[2]:.card:hover, #hero#css-selector:.card:hover@0",
      "site.css#css-rule[2]:.card:hover, #hero#css-selector:#hero@0"
    ]));
    expect(truth.containments).toHaveLength(truth.resources.length);
  });

  it("handles nested at-rules and keyframes separately from style rules", () => {
    const truth = strictCssTruth(
      "motion.css",
      "@media screen { .card { display: grid; } } @keyframes spin { from { transform: none; } to { transform: rotate(1turn); } }"
    );
    expect(truth?.resources).toEqual(expect.arrayContaining([
      "motion.css#css-at-rule[1]:@media screen@0",
      "motion.css#css-at-rule[2]:@keyframes spin@0",
      "motion.css#css-at-rule[2]:@keyframes spin#css-keyframe[1]:from@0",
      "motion.css#css-at-rule[2]:@keyframes spin#css-keyframe[2]:to@0"
    ]));
  });

  it("rejects recovery-dependent CSS and scores exact set differences", () => {
    expect(strictCssTruth("bad.css", ".card { color: red;")).toBeNull();
    expect(scoreSets(["a", "b"], ["a", "c"])).toMatchObject({ tp: 1, fp: 1, fn: 1 });
  });
});
