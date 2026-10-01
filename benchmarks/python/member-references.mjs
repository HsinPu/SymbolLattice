import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {parser} from '@lezer/python';
import {extractPythonFileFacts} from '../../dist/extraction/python.js';
import {SYMBOL_LATTICE_VERSION} from '../../dist/version.js';
import {ARTIFACT_FACTS_EXTRACTOR_VERSION} from '../../dist/domain/facts.js';

const [projectArgument, python, outputArgument, baselineArgument] = process.argv.slice(2);
assert(projectArgument && python && outputArgument && baselineArgument,
  'Usage: node benchmarks/python/member-references.mjs PROJECT PYTHON OUTPUT BASELINE_PRODUCT');
const project = resolve(projectArgument), output = resolve(outputArgument);
const baseline = await import(pathToFileURL(resolve(baselineArgument, 'dist/extraction/python.js')));
const git = (...args) => execFileSync('git', ['-C', project, ...args], {encoding:'utf8', windowsHide:true}).trim();
const commit = git('rev-parse', 'HEAD'), repository = git('remote', 'get-url', 'origin');
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Tracked corpus must be clean');
execFileSync(python, [fileURLToPath(new URL('./MemberReferenceOracle.py', import.meta.url)),
  project, output + '.truth.json'], {windowsHide:true});
const truth = JSON.parse(readFileSync(output + '.truth.json', 'utf8'));
const rule = 'syntax.python.member-reference.unknown-receiver';
let tp = 0, fp = 0, fn = 0, unsupported = 0, rejected = 0, existingFactsChanged = 0, admittedFiles = 0;
const failures = [], started = performance.now();

function inspect(text) {
  const cursor = parser.parse(text).cursor();
  let invalid = false, rootError = false, bareYieldOnly = true;
  do {
    if (!cursor.type.isError) continue;
    invalid = true;
    const node = cursor.node, parent = node.parent;
    rootError ||= parent?.name === 'Script';
    let inFunction = false;
    for (let ancestor = parent?.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.name === 'FunctionDefinition') { inFunction = true; break; }
      if (ancestor.name === 'ClassDefinition' || ancestor.name === 'Script') break;
    }
    bareYieldOnly &&= node.from === node.to && ['YieldStatement', 'YieldExpression'].includes(parent?.name) &&
      text.slice(parent.from, parent.to) === 'yield' && inFunction;
  } while (cursor.next());
  return {invalid, rootError, bareYieldOnly: invalid && bareYieldOnly};
}

for (const record of truth.records) {
  if (record.rejected) { rejected++; continue; }
  const raw = readFileSync(resolve(project, record.path));
  assert.equal(createHash('sha256').update(raw).digest('hex'), record.sha256, 'Corpus source changed');
  const sourceText = new TextDecoder().decode(raw), input = {filePath:record.path, language:'python', sourceText};
  const previous = baseline.extractPythonFileFacts(input), facts = extractPythonFileFacts(input);
  const added = facts.edges.filter(edge => edge.evidence?.ruleId === rule);
  if (!isDeepStrictEqual({...facts, edges:facts.edges.filter(edge => edge.evidence?.ruleId !== rule)}, previous)) {
    existingFactsChanged++;
    failures.push({path:record.path, reason:'existing-facts-changed'});
  }
  let parsed = inspect(sourceText);
  if (parsed.invalid && !parsed.rootError && sourceText.includes('\r\n')) {
    const normalized = inspect(sourceText.replaceAll('\r\n', '\n'));
    // Closed CRLF recovery requires an entirely clean normalized parse.
    if (!normalized.invalid) parsed = normalized;
  }
  if (parsed.invalid && !parsed.bareYieldOnly) {
    unsupported += record.references.length;
    if (added.length) failures.push({path:record.path, reason:'references-in-unsupported-parser-scope'});
    continue;
  }
  admittedFiles++;
  const key = ({owner, referenceName, range}) => JSON.stringify([owner.name, owner.line, referenceName, range]);
  const expected = new Set(record.references.map(key));
  const actual = new Set(added.map(edge => {
    const owner = facts.symbols.find(symbol => symbol.id === edge.sourceId);
    assert(owner);
    assert.equal(edge.kind, 'references'); assert.equal(edge.targetId, null);
    assert.equal(edge.resolution, 'unresolved'); assert.equal(edge.confidence, 0);
    return key({owner:{name:owner.name, line:owner.range.start.line}, referenceName:edge.referenceName, range:edge.range});
  }));
  const extras = [...actual].filter(key => !expected.has(key)), missing = [...expected].filter(key => !actual.has(key));
  tp += expected.size - missing.length; fp += extras.length; fn += missing.length;
  if (extras.length || missing.length) failures.push({path:record.path, extras, missing});
}
assert.equal(git('rev-parse', 'HEAD'), commit);
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '');
const report = {version:SYMBOL_LATTICE_VERSION, extractor:ARTIFACT_FACTS_EXTRACTOR_VERSION,
  repository, commit, node:process.version, python:truth.python, command:process.argv.slice(1),
  scope:'Maximal written non-call dotted member syntax in function bodies; includes Store/Del occurrences, excludes lambda/headers/class execution and parser-ineligible files. No receiver, access-mode or dispatch claims.',
  files:truth.records.length, admittedFiles, tp, fp, fn, precision:tp+fp ? tp/(tp+fp) : null,
  recall:tp+fn ? tp/(tp+fn) : null, unsupported, rejected, existingFactsChanged, ms:performance.now()-started, failures};
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({...report, failures:failures.slice(0,5)}, null, 2));
if (fp || fn || failures.length) process.exitCode = 1;
