import { expect, it } from "vitest";
import { assignedCallableTruth, scoreAssignedCallables } from "../../../benchmarks/javascript/assigned-callables.mjs";

it("derives assignment ranges independently while excluding named, dynamic and compound targets", () => {
  const truth = assignedCallableTruth("obj.run = function () { helper(); nested(() => ignored()); }; obj['next'] = () => next(); obj[key] = () => {}; obj.other ||= () => {}; obj.named = function keep() {};", "sample.js");
  expect(truth.map((item) => item.assignmentName)).toEqual(["obj.run", 'obj["next"]']);
  expect(truth[0].alternatives[0].range).toEqual({ start: { line: 1, column: 1 }, end: { line: 1, column: 61 } });
  expect(truth[0].calls.map((call) => call.name)).toEqual(["helper", "nested"]);
});

it("rejects incorrect ranges, duplicate identities and calls attributed to a file instead of the assignment", () => {
  const truth = assignedCallableTruth("obj.run = () => helper();", "sample.js");
  const symbol = { ...truth[0].alternatives[0], id: "assigned", filePath: "sample.js" };
  const edge = { kind: "calls", filePath: "sample.js", range: truth[0].calls[0].range, referenceName: "helper", sourceId: "assigned" };
  expect(scoreAssignedCallables(truth, { symbols: [symbol], edges: [edge] })).toMatchObject({ tp: 1, fn: 0, ownership: { tp: 1, fn: 0 } });
  expect(scoreAssignedCallables(truth, { symbols: [symbol], edges: [{ ...edge, sourceId: "file" }] })).toMatchObject({ tp: 1, ownership: { tp: 0, fn: 1 } });
  expect(scoreAssignedCallables(truth, { symbols: [{ ...symbol, range: { ...symbol.range, start: { line: 1, column: 2 } } }], edges: [edge] })).toMatchObject({ tp: 0, fn: 1 });
  expect(scoreAssignedCallables(truth, { symbols: [symbol, { ...symbol, id: "duplicate" }], edges: [edge] })).toMatchObject({ duplicates: 1, ownership: { fn: 1 } });
  expect(scoreAssignedCallables([], { symbols: [], edges: [] })).toMatchObject({ recall: null, ownership: { recall: null } });
});
