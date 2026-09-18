import { expect, it } from "vitest";
import { namedExpressionTruth, scoreNamedExpressions } from "../../../benchmarks/javascript/named-function-expressions.mjs";

it("derives expression ranges independently and rejects wrong or duplicate identities", () => {
  const source = "module.exports = function assigned() {}; const run = function hidden() {};\nconst text = 'function fake() {}';";
  const truth = namedExpressionTruth(source, "index.js");
  expect(truth.map((item) => item.expressionName)).toEqual(["assigned", "hidden"]);
  expect(truth[0].expressionRange).toEqual({ start: { line: 1, column: 18 }, end: { line: 1, column: 40 } });
  const symbols = truth.map((item, index) => ({ ...item.alternatives.at(-1), filePath: item.filePath, id: `s${index}` }));
  expect(scoreNamedExpressions(truth, symbols)).toMatchObject({ tp: 2, fn: 0, duplicates: 0, recall: 1 });
  const wrong = [{ ...symbols[0], range: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } } }];
  expect(scoreNamedExpressions(truth, wrong)).toMatchObject({ tp: 0, fn: 2 });
  expect(scoreNamedExpressions(truth, [...symbols, { ...symbols[0], id: "duplicate" }])).toMatchObject({ tp: 1, duplicates: 1 });
  expect(scoreNamedExpressions([], [])).toMatchObject({ recall: null });
});
