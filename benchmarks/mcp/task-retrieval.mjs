import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { parse as parseJavaScript } from "espree";
import { identifierTermGroups, identifierTermVariants, identifierWords } from "../../dist/domain/identifier-search.js";

/** File judgments are deliberately incomplete; unknown output is never a false positive. */
export function scoreTask(task, result) {
  const selected = [...new Set([
    ...(result.focuses ?? []).map((focus) => focus.symbol?.filePath),
    result.match?.symbol?.filePath
  ].filter(Boolean))];
  const required = new Set(task.requiredFiles);
  const relevant = new Set([...required, ...task.supportingFiles]);
  const irrelevant = new Set(task.irrelevantFiles);
  const truePositives = selected.filter((file) => relevant.has(file));
  const falsePositives = selected.filter((file) => irrelevant.has(file));
  const falseNegatives = [...required].filter((file) => !selected.includes(file));
  const unjudged = selected.filter((file) => !relevant.has(file) && !irrelevant.has(file));
  const sources = [result.source, ...(result.focuses ?? []).map((focus) => focus.source),
    ...(result.sourceWindows ?? []).map((window) => window.source)].filter(Boolean);
  const evidence = task.evidence.map((item) => ({ ...item, found: sources.some((source) =>
    source.filePath === item.file && (source.lines ?? []).some((line) =>
      line.line === item.line && typeof line.text === "string" && line.text.includes(item.text))) }));
  const callContexts = result.focuses?.length ? result.focuses : [{ reference: result.match?.symbol?.qualifiedName,
    symbol: result.match?.symbol, unresolvedCalls: result.unresolvedCalls }];
  const unresolvedCallEvidence = (task.unresolvedCallEvidence ?? []).map((item) => ({ ...item,
    found: callContexts.some((focus) => focus.reference === item.focus &&
      focus.unresolvedCalls?.state === "available" && focus.unresolvedCalls.items.some((edge) =>
        edge.sourceId === focus.symbol.id && edge.filePath === item.file &&
        edge.range.start.line === item.line && edge.referenceName === item.referenceName &&
        edge.kind === "calls" && edge.resolution === "unresolved" &&
        edge.targetId === null && edge.confidence === 0)) }));
  const judged = truePositives.length + falsePositives.length;
  const referenceContexts = result.focuses?.length ? result.focuses : [{ reference: result.match?.symbol?.qualifiedName,
    symbol: result.match?.symbol, unresolvedReferences: result.unresolvedReferences }];
  const unresolvedReferenceEvidence = (task.unresolvedReferenceEvidence ?? []).map((item) => ({ ...item,
    found: referenceContexts.some((context) => context.reference === item.focus &&
      context.unresolvedReferences?.state === "available" && context.unresolvedReferences.items.some((edge) =>
        edge.sourceId === context.symbol.id && edge.filePath === item.file && edge.range.start.line === item.line &&
        edge.referenceName === item.referenceName && edge.kind === "references" && edge.resolution === "unresolved" &&
        edge.targetId === null && edge.confidence === 0 && (item.declaration === undefined ||
          context.unresolvedReferences.sameClassDeclarationLeads?.items.some((lead) =>
            lead.edgeId === edge.id && lead.declaration.qualifiedName === item.declaration)))) }));
  return {
    selected, truePositives, falsePositives, falseNegatives, unjudged,
    requiredFileRecall: required.size === 0 ? null : (required.size - falseNegatives.length) / required.size,
    judgedPrecision: judged === 0 ? null : truePositives.length / judged,
    judgedFraction: selected.length === 0 ? null : judged / selected.length,
    evidence, evidenceRecall: evidence.length === 0 ? null : evidence.filter((item) => item.found).length / evidence.length,
    unresolvedCallEvidence,
    unresolvedCallEvidenceRecall: unresolvedCallEvidence.length === 0 ? null :
      unresolvedCallEvidence.filter((item) => item.found).length / unresolvedCallEvidence.length,
    unresolvedReferenceEvidence,
    unresolvedReferenceEvidenceRecall: unresolvedReferenceEvidence.length === 0 ? null :
      unresolvedReferenceEvidence.filter((item) => item.found).length / unresolvedReferenceEvidence.length
  };
}

export function verifyOmittedDeclarationLeads(result, readSource) {
  const focuses = result.focuses ?? [];
  const search = result.queryPlan?.omittedDeclarationSearch;
  let verifiedLeads = 0, verifiedOrigins = 0;
  for (const focus of focuses) {
    const receipt = focus.omittedQueryDeclaration;
    if (!receipt) continue;
    assert.equal(receipt.state, "unresolved-name-candidate");
    assert.ok(["inspected-bounded-graph", "selected-files-index", "inspected-inherited-source"].includes(receipt.scope));
    if (receipt.scope === "selected-files-index") {
      const lookup = search?.selectedFileLookup;
      assert.equal(lookup?.state, "available");
      assert.ok(lookup.names.length <= 8 && lookup.filePaths.length <= 8);
      assert.ok(lookup.names.includes(focus.symbol.name));
      assert.ok(lookup.filePaths.includes(focus.symbol.filePath));
      assert.ok(lookup.filePaths.every(path => focuses.some(item => !item.omittedQueryDeclaration && item.symbol.filePath === path)));
    }
    if (receipt.matchingDeclarationCount === 2) {
      assert.equal(receipt.scope, "selected-files-index");
      assert.equal(search?.selectedFileLookup?.state, "available");
      assert.equal(receipt.matchingDeclarationIds?.length, 2);
      assert.equal(new Set(receipt.matchingDeclarationIds).size, 2);
      assert.ok(receipt.matchingDeclarationIds.includes(focus.symbol.id));
      for (const id of receipt.matchingDeclarationIds) {
        const sibling = focuses.find(item => item.symbol.id === id);
        assert.ok(sibling && sibling.symbol.name === focus.symbol.name);
        assert.equal(sibling.omittedQueryDeclaration?.scope, "selected-files-index");
        assert.deepEqual(sibling.omittedQueryDeclaration.matchingDeclarationIds, receipt.matchingDeclarationIds);
        assert.deepEqual(sibling.omittedQueryDeclaration.call, receipt.call);
      }
    } else {
      assert.equal(receipt.matchingDeclarationCount, 1);
      assert.equal(receipt.matchingDeclarationIds, undefined);
    }
    assert.equal(search?.policy, "omitted-query-call-declarations-v1");
    assert.equal(search.state, "searched");
    assert.ok(search.omittedTerms.length <= 8);
    const normalize = value => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}_$]/gu, "");
    const queryTerms = new Set([...result.queryPlan.query.trim().slice(0, 512)
      .matchAll(/[\p{L}\p{N}_$][\p{L}\p{N}_$.-]*/gu)].map(match => normalize(match[0])));
    assert.ok(search.omittedTerms.every(term => queryTerms.has(term) && !result.queryPlan.identifierTerms.includes(term)),
      "Follow-up terms must occur in the bounded question outside primary retrieval");
    const groups = identifierTermGroups(receipt.matchedOmittedTerms);
    assert.ok(groups.length >= 2 && groups.length === receipt.matchedOmittedTerms.length);
    const omittedGroups = identifierTermGroups(search.omittedTerms);
    const words = new Set(identifierWords(focus.symbol.name).flatMap(identifierTermVariants));
    for (const group of groups) {
      assert.ok(omittedGroups.some(other => other[0] === group[0]), "Invented omitted query concept");
      assert.ok(group.some(term => words.has(term)), "Declaration name does not corroborate the omitted concept");
    }
    assert.equal(focus.score, 0);
    assert.equal(focus.baseScore, 0);
    assert.equal(focus.graphDiffusion.rankingContribution, 0);
    assert.deepEqual(focus.matchedTerms, []);
    assert.deepEqual(focus.sourceMatches, []);
    assert.equal(focus.generated.generated, false);
    assert.equal(focus.sourceRole.role, "production");
    const call = receipt.call;
    assert.equal(call.kind, "calls");
    assert.equal(call.targetId, null);
    assert.equal(call.resolution, "unresolved");
    assert.equal(call.confidence, 0);
    assert.equal(call.referenceName.split(".").at(-1), focus.symbol.name);
    const primary = focuses.filter(item => !item.omittedQueryDeclaration && !item.nameFollowup && !item.importedCallDeclaration);
    const owner = primary.find(item => item.symbol.id === call.sourceId);
    assert.ok(owner && owner.sourceRole.role === "production" && !owner.generated.generated);
    assert.equal(owner.symbol.filePath, call.filePath);
    const position = (a, b) => a.line - b.line || a.column - b.column;
    assert.ok(position(call.range.start, owner.symbol.range.start) >= 0 && position(call.range.end, owner.symbol.range.end) <= 0 &&
      position(call.range.end, call.range.start) > 0);
    assert.equal(owner.unresolvedCalls.state, "available");
    assert.deepEqual(call, owner.unresolvedCalls.items.find(edge => edge.id === call.id));
    if (receipt.scope === "inspected-inherited-source") {
      const w = receipt.inheritedSource;
      assert.ok(w && w.callerClass.kind === "class" && w.declarationClass.kind === "class");
      assert.equal(call.referenceName, `self.${focus.symbol.name}`);
      assert.equal(call.evidence?.ruleId, "syntax.python.member-call.unknown-receiver");
      for (const [edge, kind, source, target] of [
        [w.callerContainment, "contains", w.callerClass, owner.symbol],
        [w.inheritance, "extends", w.callerClass, w.declarationClass],
        [w.declarationContainment, "contains", w.declarationClass, focus.symbol]]) {
        assert.equal(edge.kind, kind); assert.equal(edge.sourceId, source.id); assert.equal(edge.targetId, target.id);
        assert.equal(edge.filePath, source.filePath); assert.equal(edge.resolution, "exact"); assert.equal(edge.confidence, 1);
        const sourceLines = readSource(edge.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
        const text = sourceLines.slice(edge.range.start.line - 1, edge.range.end.line).join("\n");
        assert.ok(text.includes(kind === "contains" ? target.name : edge.referenceName));
      }
      assert.equal(w.callerClass.filePath, owner.symbol.filePath);
      assert.equal(w.declarationClass.filePath, focus.symbol.filePath);
      assert.equal(w.inheritance.evidence?.ruleId, "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance");
      assert.deepEqual(w.inheritance.evidence.resolutionPath, [owner.symbol.filePath, focus.symbol.filePath]);
      assert.equal(w.importEdge.kind, "imports"); assert.equal(w.importEdge.resolution, "exact");
      assert.equal(w.importEdge.confidence, 1); assert.equal(w.importEdge.filePath, owner.symbol.filePath);
      assert.equal(w.importEdge.evidence?.ruleId, "module.python.regular-package.absolute-named-base-import");
      assert.deepEqual(w.importEdge.evidence.resolutionPath, w.inheritance.evidence.resolutionPath);
      const importLines = readSource(w.importEdge.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
      assert.ok(importLines[w.importEdge.range.start.line - 1]?.includes(w.importEdge.referenceName));
    } else {
      assert.equal(receipt.inheritedSource, undefined);
      assert.ok(primary.some(item => item.symbol.filePath === focus.symbol.filePath), "Lead introduced an unselected file");
    }
    assert.ok(focuses.filter(item => item.symbol.filePath === focus.symbol.filePath).length <= 3);
    const lines = readSource(focus.symbol.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
    const header = lines[focus.symbol.range.start.line - 1];
    assert.ok(header?.includes(focus.symbol.name), "Declaration header is not source-backed");
    verifiedLeads++;
    verifiedOrigins++;
  }
  assert.ok(verifiedLeads <= 2);
  if (search) assert.equal(search.emittedCount, verifiedLeads);
  if (verifiedLeads) assert.ok(focuses.length <= 10);
  if (verifiedLeads === 2) assert.ok(focuses.filter(item => item.omittedQueryDeclaration)
    .every(item => item.omittedQueryDeclaration.matchingDeclarationCount === 2));
  return { verifiedLeads, verifiedOrigins };
}

export function verifyDirectoryContexts(result) {
  let verifiedContexts = 0;
  for (const focus of result.focuses ?? []) {
    const receipt = focus.directoryContext;
    if (focus.reasons?.includes("query-directory-context")) assert.ok(receipt);
    if (!receipt) continue;
    assert.equal(receipt.policy, "literal-query-directory-v1");
    assert.equal(receipt.filePath, focus.symbol.filePath);
    assert.equal(receipt.score, 500);
    assert.ok(focus.reasons.includes("query-directory-context"));
    const directories = new Set(receipt.filePath.split("/").slice(0, -1).map(part => part.normalize("NFKC").toLowerCase()));
    assert.ok(receipt.terms.length > 0 && receipt.terms.every(term =>
      result.queryPlan.identifierTerms.includes(term) && directories.has(term)));
    assert.ok(identifierTermGroups([...new Set(focus.sourceMatches.map(match => match.term))]).length >= 2);
    verifiedContexts++;
  }
  return { verifiedContexts };
}

export function verifyNameFollowups(result) {
  let verifiedFollowups = 0, verifiedOrigins = 0;
  const focuses = result.focuses ?? [];
  for (const focus of focuses) {
    const receipt = focus.nameFollowup;
    if (!receipt) continue;
    assert.equal(receipt.state, 'unresolved-name-match');
    assert.equal(receipt.scope, 'bounded-candidates');
    assert.ok(Number.isInteger(receipt.matchingDeclarationCount) && receipt.matchingDeclarationCount >= 1);
    assert.ok(new Set(receipt.calls.map(edge => edge.filePath)).size >= 2);
    for (const edge of receipt.calls) {
      assert.equal(edge.targetId, null);
      assert.equal(edge.resolution, 'unresolved');
      assert.equal(edge.kind, 'calls');
      assert.equal(edge.referenceName.split('.').at(-1), focus.symbol.name);
      const owner = focuses.find(candidate => candidate.symbol.id === edge.sourceId && !candidate.nameFollowup);
      assert.ok(owner, 'Follow-up must cite an original focus');
      assert.equal(edge.filePath, owner.symbol.filePath);
      assert.equal(owner.unresolvedCalls?.state, 'available');
      assert.deepEqual(edge, owner.unresolvedCalls.items.find(item => item.id === edge.id));
      verifiedOrigins++;
    }
    verifiedFollowups++;
  }
  assert.ok(verifiedFollowups <= 1);
  if (verifiedFollowups > 0) {
    const primary = focuses.filter(focus => !focus.importedCallDeclaration && !focus.omittedQueryDeclaration);
    assert.ok(primary.length <= 8);
    assert.ok(focuses.length <= 9);
    assert.ok(new Set(primary.map(f => f.symbol.filePath)).size <= 5);
    assert.ok(new Set(focuses.map(f => f.symbol.filePath)).size <= 6);
    assert.equal(result.queryPlan.nameFollowupSearch.emittedCount, verifiedFollowups);
  }
  return { verifiedFollowups, verifiedOrigins };
}

/** Check that every emitted source-property followup cites selected exact source evidence. */
export function verifyPropertyUseFollowups(result) {
  const focuses = result.focuses ?? [];
  const uses = focuses.filter((focus) => focus.propertyUseFollowup);
  assert.ok(uses.length <= 2);
  assert.ok(new Set(uses.map((focus) => focus.symbol.filePath)).size <= 1);
  const byId = new Map(focuses.map((focus) => [focus.symbol.id, focus]));
  const connections = new Map((result.connections ?? []).map((connection) => [connection.edge.id, connection]));
  let verifiedEdges = 0, unverifiedEdges = 0;
  for (const focus of uses) {
    const receipt = focus.propertyUseFollowup;
    assert.equal(receipt.policy, "source-property-use-followup-v1");
    assert.ok(focus.reasons.includes("source-property-use"));
    assert.ok(Number.isInteger(receipt.candidateFileCount) && receipt.candidateFileCount >= 1);
    assert.ok(receipt.edgeIds.length > 0);
    assert.equal(new Set(receipt.edgeIds).size, receipt.edgeIds.length);
    const anchor = byId.get(receipt.anchorSymbolId);
    assert.equal(anchor?.symbol.kind, "variable");
    assert.equal(anchor?.symbol.isExported, true);
    if (receipt.replacedFilePath !== null) {
      assert.ok(!focuses.some((item) => item.symbol.filePath === receipt.replacedFilePath));
    }
    for (const id of receipt.edgeIds) {
      const connection = connections.get(id);
      if (!connection && result.connectionsTruncated) { unverifiedEdges++; continue; }
      assert.ok(connection, `Missing selected property-use connection ${id}`);
      const edge = connection.edge;
      assert.equal(connection.source.id, focus.symbol.id);
      assert.equal(connection.target.id, anchor.symbol.id);
      assert.equal(edge.sourceId, focus.symbol.id);
      assert.equal(edge.targetId, anchor.symbol.id);
      assert.equal(edge.filePath, focus.symbol.filePath);
      assert.equal(edge.kind, "references");
      assert.equal(edge.resolution, "exact");
      assert.equal(edge.evidence?.ruleId, "module.commonjs-object-property-reference");
      assert.equal(edge.evidence?.commonJsBinding?.policy, "javascript-commonjs-object-property-reference-v1");
      assert.deepEqual(edge.evidence?.resolutionPath, [focus.symbol.filePath, anchor.symbol.filePath]);
      assert.equal(edge.evidence?.commonJsBinding?.importSite.filePath, focus.symbol.filePath);
      assert.equal(edge.evidence?.commonJsBinding?.exportSite.filePath, anchor.symbol.filePath);
      verifiedEdges++;
    }
  }
  return { verifiedFollowups: uses.length, verifiedEdges, unverifiedEdges };
}

/** Validate caller receipts against selected endpoints and pinned written source. */
export function verifyIncomingCallWitnesses(result, readSource) {
  const focuses = result.focuses ?? [], additions = focuses.filter(f => f.incomingCallWitness);
  assert.ok(additions.length <= 1);
  const byId = new Map(focuses.map(f => [f.symbol.id, f]));
  const connections = new Map((result.connections ?? []).map(c => [c.edge.id, c]));
  let verifiedEdges = 0, omittedConnections = 0;
  const source = site => {
    assert.ok(!isAbsolute(site.filePath) && !site.filePath.split(/[\\/]/u).includes('..'));
    const lines = readSource(site.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
    const { start, end } = site.range;
    for (const point of [start, end]) assert.ok(Number.isInteger(point.line) && point.line >= 1 && point.line <= lines.length &&
      Number.isInteger(point.column) && point.column >= 1 && point.column <= lines[point.line - 1].length + 1);
    assert.ok(start.line < end.line || start.line === end.line && start.column < end.column);
    return lines.slice(start.line - 1, end.line).map((line, i) => line.slice(i === 0 ? start.column - 1 : 0,
      i === end.line - start.line ? end.column - 1 : undefined)).join('\n');
  };
  for (const focus of additions) {
    const receipt = focus.incomingCallWitness;
    assert.equal(receipt.policy, 'exact-module-call-caller-v1');
    assert.equal(receipt.scope, 'returned-bounded-graph');
    assert.ok(focus.reasons.includes('exact-module-call-caller'));
    assert.ok(Number.isInteger(receipt.candidateCount) && receipt.candidateCount >= 1);
    assert.equal(typeof receipt.candidatesTruncated, 'boolean');
    assert.equal(typeof receipt.witnessesTruncated, 'boolean');
    assert.ok(receipt.edges.length >= 1 && receipt.edges.length <= 8);
    assert.equal(new Set(receipt.edges.map(e => e.id)).size, receipt.edges.length);
    for (const edge of receipt.edges) {
      const target = byId.get(edge.targetId);
      assert.ok(target && ['function', 'method'].includes(target.symbol.kind));
      assert.ok(['function', 'method'].includes(focus.symbol.kind));
      assert.equal(edge.sourceId, focus.symbol.id);
      assert.equal(edge.filePath, focus.symbol.filePath);
      assert.notEqual(focus.symbol.filePath, target.symbol.filePath);
      assert.equal(edge.kind, 'calls'); assert.equal(edge.resolution, 'exact'); assert.equal(edge.confidence, 1);
      assert.equal(edge.evidence.stage, 'module');
      assert.deepEqual(edge.evidence.candidateSymbolIds, [target.symbol.id]);
      assert.deepEqual(edge.evidence.resolutionPath, [focus.symbol.filePath, target.symbol.filePath]);
      const position = (a, b) => a.line - b.line || a.column - b.column;
      assert.ok(position(edge.range.start, focus.symbol.range.start) >= 0 && position(edge.range.end, focus.symbol.range.end) <= 0);
      const written = source(edge);
      const binding = edge.evidence.commonJsBinding;
      if (binding) {
        assert.equal(binding.importSite.filePath, focus.symbol.filePath);
        assert.equal(binding.exportSite.filePath, target.symbol.filePath);
        assert.ok(source(binding.importSite).includes(binding.localName));
        assert.ok(source(binding.exportSite).includes(binding.importedName));
        assert.ok(written.includes(binding.localName));
      }
      const connection = connections.get(edge.id);
      if (!connection && result.connectionsTruncated) omittedConnections++;
      else { assert.ok(connection, 'Caller witness requires its selected connection'); assert.deepEqual(connection.edge, edge); }
      verifiedEdges++;
    }
  }
  return { verifiedCallers: additions.length, verifiedEdges, omittedConnections };
}

/** Independent whole-file AST validation of supplemental written operations; no builtin/dispatch inference. */
export function verifySourceOperationLeads(result, readSource) {
  const focuses = result.focuses ?? [], additions = focuses.filter(f => f.sourceOperationLead);
  assert.ok(additions.length <= 1);
  const compare = (a, b) => a.line - b.line || a.column - b.column;
  const inside = (range, owner) => compare(range.start, owner.range.start) >= 0 && compare(range.end, owner.range.end) <= 0;
  let verifiedCalls = 0;
  for (const focus of additions) {
    const receipt = focus.sourceOperationLead, owner = focus.symbol;
    assert.equal(receipt.policy, 'written-object-operation-v1');
    assert.equal(receipt.scope, 'selected-files-bounded-candidates');
    assert.equal(receipt.state, 'written-callee-source-lead');
    assert.ok(focus.reasons.includes('source-object-operation'));
    assert.ok(['function', 'method'].includes(owner.kind));
    assert.equal(focus.sourceRole.role, 'production');
    assert.equal(focus.generated.generated, false);
    assert.ok(/\.(?:[cm]?js|jsx)$/iu.test(owner.filePath));
    assert.ok(!isAbsolute(owner.filePath) && !owner.filePath.split(/[\\/]/u).includes('..'));
    const earlier = focuses.slice(0, focuses.indexOf(focus));
    assert.ok(earlier.some(f => f.symbol.filePath === owner.filePath && f.sourceRole.role === 'production' && !f.generated.generated));
    assert.ok(!earlier.some(f => f.symbol.id === owner.id || f.symbol.filePath === owner.filePath &&
      ['function', 'method'].includes(f.symbol.kind) && inside(owner.range, f.symbol)));
    assert.ok(Number.isInteger(receipt.candidateCount) && receipt.candidateCount >= 1 && receipt.candidateCount <= 32);
    for (const flag of ['candidatesTruncated', 'callsTruncated']) assert.equal(typeof receipt[flag], 'boolean');
    assert.ok(receipt.calls.length >= 1 && receipt.calls.length <= 2);
    assert.equal(new Set(receipt.calls.map(e => e.id)).size, receipt.calls.length);
    const concepts = (focus.sourceMatches ?? []).filter(m => m.lineContext !== 'comment-prefixed' &&
      m.filePath === owner.filePath && inside(m.range, owner) && result.queryPlan.identifierTerms.includes(m.term));
    assert.ok(identifierTermGroups(concepts.map(m => m.term)).length >= 2);
    verifyLexicalMatches({ focuses: [focus] }, readSource);
    const source = readSource(owner.filePath), parsedCalls = [];
    let ast;
    try { ast = parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true, ecmaFeatures: { jsx: true } }); }
    catch { ast = parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'commonjs', loc: true, ecmaFeatures: { jsx: true } }); }
    const visit = (node, callables) => {
      if (!node || typeof node.type !== 'string') return;
      if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) callables = [...callables, node];
      if (node.type === 'CallExpression' && !node.optional && node.callee.type === 'MemberExpression' &&
          !node.callee.computed && !node.callee.optional && node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Object' && node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'setPrototypeOf') parsedCalls.push({ node, callables });
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) for (const child of value) visit(child, callables);
        else if (value && typeof value === 'object') visit(value, callables);
      }
    };
    visit(ast, []);
    const range = node => ({ start: { line: node.loc.start.line, column: node.loc.start.column + 1 },
      end: { line: node.loc.end.line, column: node.loc.end.column + 1 } });
    for (const edge of receipt.calls) {
      assert.equal(edge.sourceId, owner.id); assert.equal(edge.filePath, owner.filePath);
      assert.equal(edge.referenceName, 'Object.setPrototypeOf'); assert.equal(edge.kind, 'calls');
      assert.equal(edge.targetId, null); assert.equal(edge.confidence, 0); assert.equal(edge.resolution, 'unresolved');
      assert.equal(edge.evidence.stage, 'syntax');
      assert.equal(edge.evidence.ruleId, 'syntax.javascript.member-call.unknown-receiver');
      assert.deepEqual(edge.evidence.candidateSymbolIds, []);
      assert.ok(focus.unresolvedCalls?.state === 'available' && focus.unresolvedCalls.items.some(e =>
        JSON.stringify(e) === JSON.stringify(edge)), 'Lead must retain the same generation-fenced call receipt');
      assert.ok(parsedCalls.some(({ node, callables }) => callables.length > 0 && inside(range(callables.at(-1)), owner) &&
        callables.filter(callable => inside(range(callable), owner)).length === 1 &&
        JSON.stringify(range(node.callee)) === JSON.stringify(edge.range)), 'Written call requires a whole-file AST callee and owning callable');
      verifiedCalls++;
    }
  }
  return { verifiedLeads: additions.length, verifiedCalls };
}

export function verifyNumericQualifiers(result) {
  if (result.queryPlan?.numericCoverage) {
    const coverage = result.queryPlan.numericCoverage;
    assert.equal(coverage.policy, 'numeric-query-coverage-v1');
    const anchor = (result.focuses ?? []).find(f => f.symbol.id === coverage.symbolId);
    assert.ok(anchor?.numericQualifier, 'Numeric coverage must retain its qualified focus');
    assert.deepEqual(coverage.terms, anchor.numericQualifier.terms);
  }
  let verifiedQualifiers = 0;
  for (const focus of result.focuses ?? []) {
    const receipt = focus.numericQualifier;
    if (!receipt) continue;
    assert.equal(receipt.policy, 'numeric-query-qualifiers-v1');
    assert.equal(receipt.score, 500);
    assert.ok(receipt.terms.length > 0);
    for (const term of receipt.terms) {
      assert.match(term, /^\p{N}{3,}$/u);
      assert.ok(result.queryPlan.identifierTerms.includes(term));
      const runs = value => value.normalize('NFKC').match(/\p{N}+/gu) ?? [];
      assert.ok(runs(focus.symbol.name).includes(term) || (focus.sourceMatches ?? []).some(match =>
        match.term === term && runs(match.token).includes(term)), 'Numeric qualifier lacks a matching name or source token');
      verifiedQualifiers++;
    }
  }
  return { verifiedQualifiers };
}

/** Verify that an omitted broad focus has the same source hits as its selected, exact child. */
export function verifyNumericContainerFiltering(result, readSource) {
  const filtering = result.queryPlan?.numericContainerFiltering;
  if (!filtering) return { verifiedOmissions: 0, verifiedMatches: 0 };
  assert.equal(filtering.policy, 'numeric-contained-source-focus-v1');
  assert.deepEqual(filtering.limits, { policy: filtering.policy, minimumContainerLines: 64, maximumChildLines: 32 });
  assert.ok(filtering.omitted.length > 0);
  const focuses = result.focuses ?? [];
  const compare = (left, right) => left.line - right.line || left.column - right.column;
  let verifiedMatches = 0;
  for (const item of filtering.omitted) {
    const child = focuses.find(focus => focus.symbol.id === item.coveredBySymbolId);
    assert.ok(child, 'Omitted container requires a selected exact child');
    assert.ok(!focuses.some(focus => focus.symbol.id === item.container.id));
    assert.equal(item.container.kind, 'variable');
    assert.equal(item.container.filePath, child.symbol.filePath);
    assert.ok(child.symbol.qualifiedName.startsWith(`${item.container.qualifiedName}.`));
    assert.ok(item.container.range.end.line - item.container.range.start.line + 1 >= filtering.limits.minimumContainerLines);
    assert.ok(child.symbol.range.end.line - child.symbol.range.start.line + 1 <= filtering.limits.maximumChildLines);
    assert.ok(compare(item.container.range.start, child.symbol.range.start) <= 0 &&
      compare(child.symbol.range.end, item.container.range.end) <= 0);
    const edge = item.containmentEdge;
    assert.equal(edge.kind, 'contains');
    assert.equal(edge.resolution, 'exact');
    assert.equal(edge.sourceId, item.container.id);
    assert.equal(edge.targetId, child.symbol.id);
    assert.equal(edge.filePath, child.symbol.filePath);
    assert.deepEqual(edge.range, child.symbol.range);
    assert.ok(edge.evidence?.ruleId);
    assert.ok(item.sourceMatches.length >= 2);
    const lines = readSource(item.container.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
    for (const match of item.sourceMatches) {
      assert.equal(match.filePath, child.symbol.filePath);
      assert.ok((child.sourceMatches ?? []).some(original => JSON.stringify(original) === JSON.stringify(match)));
      assert.ok(compare(child.symbol.range.start, match.range.start) <= 0 &&
        compare(match.range.end, child.symbol.range.end) <= 0);
      assert.equal(match.range.start.line, match.range.end.line);
      const line = lines[match.range.start.line - 1];
      assert.ok(line !== undefined && match.range.start.column >= 1 && match.range.end.column <= line.length + 1);
      assert.equal(line.slice(match.range.start.column - 1, match.range.end.column - 1), match.token);
      verifiedMatches++;
    }
  }
  return { verifiedOmissions: filtering.omitted.length, verifiedMatches };
}

export function verifyUnresolvedCalls(result, readSource) {
  let verifiedCalls = 0, verifiedPythonCallees = 0, verifiedJavaScriptCallees = 0;
  const contexts = result.focuses?.length ? result.focuses : [{ symbol: result.match?.symbol, unresolvedCalls: result.unresolvedCalls }];
  const compare = (a, b) => a.line - b.line || a.column - b.column;
  for (const context of contexts) {
    const evidence = context.unresolvedCalls;
    if (!evidence) continue;
    assert.equal(evidence.state, 'available', 'Expected a stable generation for call-site verification');
    for (const edge of evidence.items) {
      const owner = context.symbol;
      assert.equal(edge.sourceId, owner.id);
      assert.equal(edge.targetId, null);
      assert.equal(edge.resolution, 'unresolved');
      assert.equal(edge.kind, 'calls');
      assert.equal(edge.filePath, owner.filePath);
      assert.ok(compare(edge.range.start, owner.range.start) >= 0 && compare(edge.range.end, owner.range.end) <= 0);
      assert.ok(compare(edge.range.start, edge.range.end) < 0);
      const lines = readSource(edge.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
      for (const point of [edge.range.start, edge.range.end]) {
        assert.ok(Number.isInteger(point.line) && Number.isInteger(point.column) && point.line >= 1 &&
          point.line <= lines.length && point.column >= 1 && point.column <= lines[point.line - 1].length + 1);
      }
      const fragment = lines.slice(edge.range.start.line - 1, edge.range.end.line)
        .map((line, index) => line.slice(index === 0 ? edge.range.start.column - 1 : 0,
          index === edge.range.end.line - edge.range.start.line ? edge.range.end.column - 1 : undefined)).join('\n');
      if (edge.evidence?.ruleId === 'syntax.python.member-call.unknown-receiver') {
        assert.equal(fragment, fragment.trim(), 'Callee range must not include surrounding whitespace');
        assert.equal(edge.confidence, 0);
        assert.deepEqual(edge.evidence.candidateSymbolIds, []);
        assert.equal(fragment.replace(/\\\n/g, '').replace(/#[^\n]*/g, '').replace(/\s/g, ''), edge.referenceName);
        verifiedPythonCallees++;
      }
      if (edge.evidence?.ruleId === 'syntax.javascript.member-call.unknown-receiver') {
        assert.equal(edge.confidence, 0);
        assert.deepEqual(edge.evidence.candidateSymbolIds, []);
        const expression = parseJavaScript(`(${fragment}\n)()`, { ecmaVersion: 'latest' }).body[0].expression;
        const name = node => {
          if (node.type === 'Identifier') return node.name;
          if (node.type === 'ThisExpression') return 'this';
          if (node.type !== 'MemberExpression' || node.computed || node.optional || node.property.type !== 'Identifier') return null;
          const receiver = name(node.object);
          return receiver === null ? null : `${receiver}.${node.property.name}`;
        };
        assert.equal(expression.type, 'CallExpression');
        assert.equal(name(expression.callee), edge.referenceName);
        verifiedJavaScriptCallees++;
      }
      verifiedCalls++;
    }
  }
  return { verifiedCalls, verifiedPythonCallees, verifiedJavaScriptCallees };
}

/** Validate non-call syntax locations and candidate declarations, without access-mode/dispatch claims. */
export function verifyUnresolvedReferences(result, readSource) {
  let verifiedReferences = 0, verifiedLeads = 0;
  const contexts = result.focuses?.length ? result.focuses :
    [{symbol:result.match?.symbol, unresolvedReferences:result.unresolvedReferences}];
  const compare = (a,b) => a.line-b.line || a.column-b.column;
  for (const context of contexts) {
    const evidence = context.unresolvedReferences;
    if (!evidence) continue;
    assert.equal(evidence.state, 'available');
    assert.ok(evidence.items.length <= 8);
    const owner = context.symbol;
    for (const edge of evidence.items) {
      assert.equal(edge.sourceId, owner.id); assert.equal(edge.filePath, owner.filePath);
      assert.equal(edge.kind, 'references'); assert.equal(edge.targetId, null);
      assert.equal(edge.resolution, 'unresolved'); assert.equal(edge.confidence, 0);
      assert.equal(edge.evidence?.ruleId, 'syntax.python.member-reference.unknown-receiver');
      assert.deepEqual(edge.evidence.candidateSymbolIds, []);
      assert.ok(compare(edge.range.start, owner.range.start) >= 0 && compare(edge.range.end, owner.range.end) <= 0);
      assert.ok(compare(edge.range.start, edge.range.end) < 0);
      const lines = readSource(edge.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
      for (const point of [edge.range.start, edge.range.end]) assert.ok(Number.isInteger(point.line) &&
        Number.isInteger(point.column) && point.line >= 1 && point.line <= lines.length &&
        point.column >= 1 && point.column <= lines[point.line-1].length+1);
      const fragment = lines.slice(edge.range.start.line-1, edge.range.end.line).map((line,index) =>
        line.slice(index === 0 ? edge.range.start.column-1 : 0,
          index === edge.range.end.line-edge.range.start.line ? edge.range.end.column-1 : undefined)).join('\n');
      assert.equal(fragment.replace(/\\\n/g, '').replace(/#[^\n]*/g, '').replace(/\s/g, ''), edge.referenceName);
      verifiedReferences++;
    }
    const leads = evidence.sameClassDeclarationLeads;
    if (!leads) continue;
    assert.equal(leads.policy, 'bounded-python-member-reference-declarations-v1');
    assert.equal(leads.scope, 'returned-bounded-graph');
    assert.ok(leads.items.length > 0 && leads.items.length <= 2);
    assert.ok(Number.isSafeInteger(leads.omittedCount) && leads.omittedCount >= 0);
    assert.equal(owner.kind, 'method');
    const className = owner.qualifiedName.slice(0, owner.qualifiedName.lastIndexOf('.'));
    for (const lead of leads.items) {
      const edge = evidence.items.find(edge => edge.id === lead.edgeId);
      assert.ok(edge); assert.equal(edge.referenceName, `self.${lead.declaration.name}`);
      assert.equal(lead.declaration.filePath, owner.filePath); assert.equal(lead.declaration.kind, 'method');
      assert.equal(lead.declaration.qualifiedName, `${className}.${lead.declaration.name}`);
      assert.equal(lead.declarationLine.line, lead.declaration.range.start.line);
      const actual = readSource(owner.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u)[lead.declarationLine.line-1];
      assert.ok(actual?.includes(lead.declaration.name));
      if (lead.declarationLine.truncated) assert.ok(actual.startsWith(lead.declarationLine.text) && actual.length > lead.declarationLine.text.length);
      else assert.equal(lead.declarationLine.text, actual);
      verifiedLeads++;
    }
  }
  return {verifiedReferences, verifiedLeads};
}

/** Check each candidate lead against the written call and the pinned declaration line. */
export function verifySameClassDeclarationLeads(result, readSource) {
  let verifiedLeads = 0, omittedLeads = 0;
  const contexts = result.focuses?.length ? result.focuses :
    [{ symbol: result.match?.symbol, unresolvedCalls: result.unresolvedCalls }];
  for (const focus of contexts) {
    const evidence = focus.unresolvedCalls;
    const receipt = evidence?.sameClassDeclarationLeads;
    if (!receipt) continue;
    assert.equal(evidence.state, 'available');
    assert.equal(receipt.policy, 'bounded-python-same-class-declarations-v1');
    assert.equal(receipt.scope, 'returned-bounded-graph');
    assert.ok(receipt.items.length > 0 && receipt.items.length <= 2);
    assert.ok(Number.isSafeInteger(receipt.omittedCount) && receipt.omittedCount >= 0);
    assert.equal(new Set(receipt.items.map(item => item.edgeId)).size, receipt.items.length);
    const owner = focus.symbol;
    assert.equal(owner.kind, 'method');
    const className = owner.qualifiedName.slice(0, owner.qualifiedName.lastIndexOf('.'));
    for (const lead of receipt.items) {
      const edge = evidence.items.find(item => item.id === lead.edgeId);
      assert.ok(edge, `Missing unresolved call for declaration lead ${lead.edgeId}`);
      assert.equal(edge.sourceId, owner.id);
      assert.equal(edge.targetId, null);
      assert.equal(edge.resolution, 'unresolved');
      assert.equal(edge.evidence?.ruleId, 'syntax.python.member-call.unknown-receiver');
      assert.equal(edge.referenceName, `self.${lead.declaration.name}`);
      assert.equal(lead.declaration.kind, 'method');
      assert.equal(lead.declaration.filePath, owner.filePath);
      assert.equal(lead.declaration.qualifiedName,
        `${className}.${lead.declaration.name}`);
      assert.equal(lead.declarationLine.line, lead.declaration.range.start.line);
      const actual = readSource(owner.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u)[lead.declarationLine.line - 1];
      assert.ok(actual !== undefined && actual.includes(lead.declaration.name));
      if (lead.declarationLine.truncated) {
        assert.ok(actual.length > lead.declarationLine.text.length &&
          actual.startsWith(lead.declarationLine.text));
      } else assert.equal(lead.declarationLine.text, actual);
      verifiedLeads++;
    }
    omittedLeads += receipt.omittedCount;
  }
  return { verifiedLeads, omittedLeads };
}

export function verifyCoveredContextFiltering(result, readSource) {
  const receipt = result.queryPlan?.coveredContextFiltering;
  if (!receipt) return { verifiedOmissions: 0, verifiedMatches: 0 };
  assert.equal(receipt.policy, "covered-context-focus-v1");
  assert.equal(receipt.evidenceScope, "returned-bounded-graph");
  const groups = receipt.queryTermGroups;
  assert.ok(groups.length >= 6);
  const count = terms => groups.filter(group => terms.some(term => group.includes(term))).length;
  assert.equal(count(receipt.anchorSourceMatches.map(match => match.term)), groups.length);
  assert.ok((result.focuses ?? []).some(focus => focus.symbol.id === receipt.anchor.id));
  for (const item of receipt.omitted) {
    assert.ok(!(result.focuses ?? []).some(focus => focus.symbol.id === item.symbol.id));
    assert.equal(item.matchedConceptCount, count(item.matchedTerms));
    assert.ok(item.matchedConceptCount <= groups.length / 2);
    assert.ok(item.namedConceptCount < 2);
    assert.notEqual(item.symbol.filePath, receipt.anchor.filePath);
  }
  const matches = verifyLexicalMatches({ focuses: [
    { symbol: receipt.anchor, sourceMatches: receipt.anchorSourceMatches }, ...receipt.omitted
  ] }, readSource);
  return { verifiedOmissions: receipt.omitted.length, ...matches };
}

export function verifyLexicalMatches(result, readSource) {
  let verifiedMatches = 0;
  const verify = (match, symbol) => {
    assert.equal(match.filePath, symbol.filePath);
    assert.equal(match.range.start.line, match.range.end.line);
    const compare = (left, right) => left.line - right.line || left.column - right.column;
    assert.ok(compare(match.range.start, symbol.range.start) >= 0 && compare(match.range.end, symbol.range.end) <= 0,
      "Lexical evidence lies outside its declaration");
    const line = readSource(match.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u)[match.range.start.line - 1];
    assert.ok(line !== undefined && match.range.start.column >= 1 &&
      match.range.end.column > match.range.start.column && match.range.end.column <= line.length + 1,
      "Lexical evidence has invalid line coordinates");
    assert.equal(line.slice(match.range.start.column - 1, match.range.end.column - 1), match.token,
      `Lexical source mismatch: ${match.filePath}:${match.range.start.line}`);
    verifiedMatches += 1;
  };
  for (const focus of result.focuses ?? []) {
    for (const match of focus.sourceMatches ?? []) verify(match, focus.symbol);
  }
  for (const window of result.sourceWindows ?? []) {
    if (!window.sourceMatches?.length) continue;
    if (window.reason === 'focus-source-match') {
      const owner = (result.focuses ?? []).find(focus => focus.rank === window.focusRank);
      assert.ok(owner, 'Lexical window requires its original focus');
      assert.equal(window.filePath, owner.symbol.filePath);
      assert.deepEqual(window.connectionEdgeIds, [], 'Lexical window must not invent relation evidence');
      assert.deepEqual(window.pathSpineIndexes, []);
      assert.deepEqual(window.relatedSymbolIds, [owner.symbol.id]);
      for (const match of window.sourceMatches) {
        assert.ok((owner.sourceMatches ?? []).some(original => JSON.stringify(original) === JSON.stringify(match)), 'Lexical window must retain an original receipt');
        assert.ok(match.range.start.line >= window.startLine && match.range.end.line <= window.endLine);
        verify(match, owner.symbol);
      }
      continue;
    }
    const owners = (result.focuses ?? []).flatMap((focus) => (focus.callees?.items ?? []).filter(({ symbol, edge }) =>
      window.connectionEdgeIds.includes(edge.id) && window.relatedSymbolIds.includes(symbol.id) &&
      edge.kind === "calls" && edge.resolution === "exact" && edge.sourceId === focus.symbol.id &&
      edge.targetId === symbol.id && edge.filePath === focus.symbol.filePath && symbol.filePath === window.filePath
    ).map(({ symbol }) => symbol));
    assert.equal(new Set(owners.map((symbol) => symbol.id)).size, 1, "Callee lexical evidence requires an exact target receipt");
    for (const match of window.sourceMatches) {
      verify(match, owners[0]);
    }
  }
  return { verifiedMatches };
}

function execute(command, args, cwd) {
  const run = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000, windowsHide: true });
  if (run.error || run.status !== 0) throw new Error(`${command} failed: ${run.error?.message ?? run.stderr}`);
  return run.stdout.trim();
}

/** Shared prefixes must resolve to earlier emitted excerpts, with no missing bytes. */
export function verifySourceReuse(result, readSource) {
  let verifiedReuses = 0, reusedCharacters = 0;
  const focuses = result.focuses ?? [];
  const canonical = (text) => text.replace(/\r\n|\r|\u2028|\u2029/gu, "\n");
  for (const [index, focus] of focuses.entries()) {
    const reuse = focus.sourceReuse;
    if (!reuse) continue;
    assert.equal(focus.sourceAvailability, "active-generation");
    const original = readSource(focus.symbol.filePath);
    const offsets = reuse.originalCharacterOffsets;
    assert.ok(Number.isSafeInteger(offsets.start) && Number.isSafeInteger(offsets.end) &&
      offsets.start >= 0 && offsets.start < offsets.end && offsets.end <= original.length);
    assert.equal(canonical(original.slice(offsets.start, offsets.end)).length, reuse.originalEmittedCharacters);
    let cursor = offsets.start;
    assert.ok(reuse.segments.length > 0, "Missing shared source owners");
    for (const segment of reuse.segments) {
      assert.ok(Number.isSafeInteger(segment.referenceIndex) && segment.referenceIndex >= 0 && segment.referenceIndex < index,
        "Shared source must reference an earlier focus");
      const owner = focuses[segment.referenceIndex];
      assert.ok(owner.source, "Shared source owner was not emitted");
      assert.equal(segment.reference, owner.reference);
      assert.equal(segment.sourceIdentityId, owner.source.sourceIdentity.id);
      assert.equal(segment.filePath, focus.symbol.filePath);
      assert.equal(segment.filePath, owner.source.filePath);
      const span = segment.fullFileCharacterOffsets;
      const delivered = owner.source.sourceIdentity.fullFileCharacterOffsets;
      assert.equal(span.start, cursor, "Gap in shared source coverage");
      assert.ok(Number.isSafeInteger(span.end) && span.end > span.start && span.end <= offsets.end &&
        span.start >= delivered.start && span.end <= delivered.end, "Shared source extends beyond its emitted owner");
      const position = (offset) => {
        const endings = [...original.slice(0, offset).matchAll(/\r\n|\r|\n|\u2028|\u2029/gu)];
        const last = endings.at(-1);
        return { line: endings.length + 1, column: offset - (last ? last.index + last[0].length : 0) + 1 };
      };
      assert.deepEqual(segment.range, { start: position(span.start), end: position(span.end) });
      cursor = span.end;
    }
    assert.equal(canonical(original.slice(offsets.start, cursor)).length, reuse.reusedCharacters);
    if (focus.source === null) assert.equal(cursor, offsets.end, "Shared source did not cover the omitted excerpt");
    else {
      assert.equal(focus.source.filePath, focus.symbol.filePath);
      assert.deepEqual(focus.source.sourceIdentity.fullFileCharacterOffsets, { start: cursor, end: offsets.end });
    }
    assert.equal(reuse.reusedCharacters + (focus.source?.emittedCharacters ?? 0), reuse.originalEmittedCharacters);
    verifiedReuses += 1;
    reusedCharacters += reuse.reusedCharacters;
  }
  return { verifiedReuses, reusedCharacters };
}

/** Verify emitted bytes and line coordinates against the pinned checkout, independently of extraction. */
export function verifySourceExcerpts(result, readSource) {
  const sources = [result.source, ...(result.focuses ?? []).map((focus) => focus.source),
    ...(result.sourceWindows ?? []).map((window) => window.source)].filter(Boolean);
  let characters = 0;
  let lines = 0;
  for (const source of sources) {
    const original = readSource(source.filePath);
    const { start, end } = source.sourceIdentity.fullFileCharacterOffsets;
    assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end <= original.length);
    const expected = original.slice(start, end).replace(/\r\n|\r|\u2028|\u2029/gu, "\n");
    assert.equal(source.text, expected, `Source text mismatch: ${source.filePath}`);
    assert.equal(source.emittedCharacters, expected.length);
    assert.equal(source.sourceIdentity.contentSha256, createHash("sha256").update(expected).digest("hex"));
    const position = (offset) => {
      const endings = [...original.slice(0, offset).matchAll(/\r\n|\r|\n|\u2028|\u2029/gu)];
      const last = endings.at(-1);
      return { line: endings.length + 1, column: offset - (last ? last.index + last[0].length : 0) + 1 };
    };
    assert.deepEqual(source.range, { start: position(start), end: position(end) });
    const texts = expected.split("\n");
    if (expected.endsWith("\n")) texts.pop();
    assert.deepEqual(source.lines, texts.map((text, index) => ({ line: source.range.start.line + index, text })));
    characters += expected.length;
    lines += source.lines.length;
  }
  return { verifiedExcerpts: sources.length, emittedCharacters: characters, emittedLines: lines };
}

/** Verify emitted graph receipts against pinned source coordinates and directed endpoints. */
export function verifyGraphEvidence(result, readSource) {
  const uniqueEdges = new Map();
  const linesByPath = new Map();
  let verifiedConnections = 0;
  let verifiedRankingConnections = 0;
  let verifiedPathSteps = 0;
  let verifiedReverseSteps = 0;
  const verifyEdge = (edge) => {
    assert.equal(typeof edge.id, 'string');
    assert.ok(edge.id.length > 0);
    assert.ok(typeof edge.filePath === 'string' && edge.filePath.length > 0);
    assert.ok(!isAbsolute(edge.filePath) && !edge.filePath.split(/[\\/]/u).includes('..'),
      `Edge path leaves pinned checkout: ${edge.filePath}`);
    assert.ok(edge.resolution !== 'exact' || typeof edge.evidence?.ruleId === 'string',
      `Exact edge lacks a source rule: ${edge.id}`);
    const signature = JSON.stringify([edge.kind, edge.resolution, edge.sourceId, edge.targetId,
      edge.filePath, edge.range, edge.evidence]);
    const previous = uniqueEdges.get(edge.id);
    if (previous !== undefined) {
      assert.equal(signature, previous, `Conflicting receipts for edge ${edge.id}`);
      return;
    }
    const lines = linesByPath.get(edge.filePath) ??
      readSource(edge.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u);
    linesByPath.set(edge.filePath, lines);
    const start = edge.range?.start, end = edge.range?.end;
    for (const point of [start, end]) {
      assert.ok(Number.isSafeInteger(point?.line) && point.line >= 1 && point.line <= lines.length &&
        Number.isSafeInteger(point.column) && point.column >= 1 &&
        point.column <= lines[point.line - 1].length + 1,
      `Edge site is outside pinned source: ${edge.id}`);
    }
    assert.ok(start.line < end.line || start.line === end.line && start.column <= end.column,
      `Edge site is reversed: ${edge.id}`);
    uniqueEdges.set(edge.id, signature);
  };
  const visit = (value) => {
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    if (value === null || typeof value !== 'object') return;
    if (typeof value.id === 'string' && typeof value.sourceId === 'string' &&
      typeof value.kind === 'string' && typeof value.resolution === 'string' && value.range) {
      verifyEdge(value);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(result);
  for (const connection of result.connections ?? []) {
    assert.equal(connection.edge.resolution, 'exact');
    assert.equal(connection.edge.sourceId, connection.source.id);
    assert.equal(connection.edge.targetId, connection.target.id);
    verifiedConnections++;
  }
  const rankingReceipts = result.queryPlan?.graphConnectionEvidence ?? [];
  assert.equal(new Set(rankingReceipts.map(receipt => receipt.symbolId)).size,
    rankingReceipts.length, 'Duplicate graph ranking focus receipt');
  const rankingById = new Map(rankingReceipts.map(receipt => [receipt.symbolId, receipt]));
  for (const focus of result.focuses ?? []) {
    const receipt = rankingById.get(focus.symbol.id);
    if (!receipt) {
      assert.ok(!focus.reasons?.includes('graph-connected'),
        'Graph-connected ranking requires cited candidate links');
      continue;
    }
    assert.equal(receipt.policy, 'bounded-candidate-graph-connections-v1');
    assert.equal(receipt.scope, 'returned-bounded-graph');
    assert.equal(receipt.symbolId, focus.symbol.id);
    assert.ok(focus.reasons?.includes('graph-connected'));
    assert.equal(receipt.witnesses.length, 1);
    assert.equal(receipt.distinctRelationCount,
      receipt.witnesses.length + receipt.omittedRelationCount);
    assert.equal(focus.connectionScore, Math.min(240, receipt.distinctRelationCount * 60));
    const keys = new Set();
    for (const { edge, neighbor } of receipt.witnesses) {
      assert.equal(edge.resolution, 'exact');
      assert.ok(edge.sourceId === focus.symbol.id && edge.targetId === neighbor.id ||
        edge.targetId === focus.symbol.id && edge.sourceId === neighbor.id,
      'Ranking witness must join the selected focus to its cited candidate');
      const key = `${edge.kind}:${neighbor.id}`;
      assert.ok(!keys.has(key), 'Duplicate ranking relationship');
      keys.add(key);
      verifiedRankingConnections++;
    }
  }
  assert.equal(rankingReceipts.length, (result.focuses ?? [])
    .filter(focus => focus.reasons?.includes('graph-connected')).length);
  const paths = [
    ...(result.pathSpinePlan?.spines ?? []).map(spine => spine.path),
    ...(result.evidencePaths ?? []).filter(item => item.status === 'path').map(item => item.path),
    ...(result.focuses ?? []).map(focus => focus.focusCoverage?.flow?.path).filter(Boolean)
  ];
  for (const path of paths) {
    assert.equal(path.symbols.length, path.steps.length + 1);
    assert.equal(path.edges.length, path.steps.length);
    for (const [index, step] of path.steps.entries()) {
      assert.equal(step.from.id, path.symbols[index].id);
      assert.equal(step.to.id, path.symbols[index + 1].id);
      assert.equal(step.edge.id, path.edges[index].id);
      assert.equal(step.edge.resolution, 'exact');
      assert.equal(step.edge.sourceId, step.from.id);
      assert.equal(step.edge.targetId, step.to.id);
      verifiedPathSteps++;
    }
  }
  const reversePaths = [...(result.impact ?? []),
    ...(result.focuses ?? []).flatMap(focus => focus.impact?.paths ?? [])];
  for (const path of reversePaths) {
    assert.equal(path.symbols.length, path.steps.length + 1);
    assert.equal(path.edges.length, path.steps.length);
    for (const [index, step] of path.steps.entries()) {
      assert.equal(step.from.id, path.symbols[index].id);
      assert.equal(step.to.id, path.symbols[index + 1].id);
      assert.equal(step.edge.id, path.edges[index].id);
      assert.equal(step.edge.sourceId, step.to.id);
      assert.equal(step.edge.targetId, step.from.id);
      verifiedReverseSteps++;
    }
  }
  return { verifiedEdges: uniqueEdges.size, verifiedConnections, verifiedRankingConnections, verifiedPathSteps,
    verifiedReverseSteps };
}

export function productFingerprint(root) {
  const hash = createHash("sha256");
  let files = 0;
  let bytes = 0;
  const visit = (relative) => {
    for (const entry of readdirSync(resolve(root, "dist", relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) {
        const contents = readFileSync(resolve(root, "dist", name));
        hash.update(`${name}\0${contents.length}\0`).update(contents);
        files += 1;
        bytes += contents.length;
      }
    }
  };
  visit("");
  return { sha256: hash.digest("hex"), files, bytes };
}

export async function runTaskRetrieval({ project, manifestPath, output, repetitions = 3, split, productRoot }) {
  assert.ok(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 100);
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  assert.equal(execute("git", ["rev-parse", "HEAD"], project), manifest.commit, "Corpus commit differs from task truth");
  assert.equal(execute("git", ["remote", "get-url", "origin"], project).replace(/\.git$/, ""), manifest.repository.replace(/\.git$/, ""));
  assert.equal(execute("git", ["status", "--porcelain", "--untracked-files=no"], project), "", "Corpus tracked source changed");
  const tasks = manifest.tasks.filter((task) => split === undefined || task.split === split);
  assert.ok(tasks.length > 0, "No tasks selected");
  // Validate all source truth before executing any product query.
  for (const task of manifest.tasks) {
    assert.equal(new Set(task.requiredFiles).size, task.requiredFiles.length);
    assert.ok(task.irrelevantFiles.every((file) => ![...task.requiredFiles, ...task.supportingFiles].includes(file)));
    for (const item of task.evidence) {
      const actual = readFileSync(resolve(project, item.file), "utf8").split(/\r?\n/)[item.line - 1];
      assert.ok(actual?.includes(item.text), `Source truth mismatch: ${task.id} ${item.file}:${item.line}`);
    }
    for (const item of task.unresolvedCallEvidence ?? []) {
      const actual = readFileSync(resolve(project, item.file), "utf8").split(/\r?\n/)[item.line - 1];
      assert.ok(actual?.includes(item.text) && actual.includes(item.referenceName),
        `Call source truth mismatch: ${task.id} ${item.file}:${item.line}`);
    }
    for (const item of task.unresolvedReferenceEvidence ?? []) {
      assert.ok(item.file.endsWith('.py') && Number.isInteger(item.line));
      assert.ok(readFileSync(resolve(project, item.file), 'utf8').split(/\r\n|\r|\n/u)[item.line-1]?.includes(item.referenceName),
        `Member reference source truth mismatch: ${task.id} ${item.file}:${item.line}`);
    }
  }
  const root = productRoot === undefined ? resolve(dirname(fileURLToPath(import.meta.url)), "../..") : resolve(productRoot);
  const productBuild = productFingerprint(root);
  const { renderExploreText } = await import(pathToFileURL(resolve(root, "dist/mcp/explore-text.js")).href);
  const productVersion = execute(process.execPath, [resolve(root, "dist/cli/main.js"), "--version"], root);
  const results = tasks.map((task) => {
    const durations = [];
    let response;
    let raw;
    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      const start = performance.now();
      raw = execute(process.execPath, [resolve(root, "dist/cli/main.js"), "explore", task.query, "--project", project, "--json"], root);
      durations.push(performance.now() - start);
      const current = JSON.parse(raw);
      assert.equal(current.status?.initialized, true, "Corpus index is not initialized");
      assert.equal(current.status?.stale, false, "Corpus index is stale");
      if (response) assert.equal(current.status.generationId, response.status.generationId, "Index generation changed during evaluation");
      if (response) assert.deepEqual(scoreTask(task, current), scoreTask(task, response), "Retrieval changed across repetitions");
      response = current;
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const sourceVerification = verifySourceExcerpts(response, (file) => readFileSync(resolve(project, file), "utf8"));
    return { id: task.id, split: task.split, query: task.query, ...scoreTask(task, response),
      processMilliseconds: durations, medianProcessMilliseconds: sorted[Math.floor(sorted.length / 2)],
      responseBytes: Buffer.byteLength(raw), markdownProjectionBytes: Buffer.byteLength(renderExploreText(response)),
      sourceVerification, graphEvidenceVerification: verifyGraphEvidence(response,
        (file) => readFileSync(resolve(project, file), "utf8")),
      lexicalVerification: verifyLexicalMatches(response, (file) => readFileSync(resolve(project, file), "utf8")),
      coveredContextVerification: verifyCoveredContextFiltering(response,
        (file) => readFileSync(resolve(project, file), "utf8")),
      unresolvedCallVerification: verifyUnresolvedCalls(response, (file) => readFileSync(resolve(project, file), "utf8")),
      unresolvedReferenceVerification: verifyUnresolvedReferences(response, (file) => readFileSync(resolve(project, file), "utf8")),
      sameClassDeclarationVerification: verifySameClassDeclarationLeads(response,
        (file) => readFileSync(resolve(project, file), "utf8")),
      nameFollowupVerification: verifyNameFollowups(response),
      directoryContextVerification: verifyDirectoryContexts(response),
      omittedDeclarationVerification: verifyOmittedDeclarationLeads(response,
        (file) => readFileSync(resolve(project, file), "utf8")),
      incomingCallVerification: verifyIncomingCallWitnesses(response, (file) => readFileSync(resolve(project, file), "utf8")),
      sourceOperationVerification: verifySourceOperationLeads(response, (file) => readFileSync(resolve(project, file), "utf8")),
      propertyUseFollowupVerification: verifyPropertyUseFollowups(response),
      numericQualifierVerification: verifyNumericQualifiers(response),
      numericContainerVerification: verifyNumericContainerFiltering(response,
        (file) => readFileSync(resolve(project, file), "utf8")),
      reuseVerification: verifySourceReuse(response, (file) => readFileSync(resolve(project, file), "utf8")), result: response };
  });
  const report = {
    schemaVersion: 1, productVersion, productBuild, repository: manifest.repository, commit: manifest.commit,
    manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
    conditions: { project: resolve(project), repetitions, node: process.version, platform: process.platform,
      timing: "Sequential fresh CLI processes against an existing index; includes startup, freshness checking and JSON serialization. Small-sample diagnostic, not a latency SLO.",
      indexing: "Not measured; this run reuses an existing index.",
      scoring: "Distinct focus files per task; recall denominator is required files; precision denominator includes only manually judged returned files. Evidence checks cited source lines; optional unresolved-call truth requires a source-located, null-target call in the general-query response, not semantic cross-file correctness.",
      graphPrecision: "not-measured", agentCompletionTime: "not-measured" },
    results
  };
  assert.deepEqual(productFingerprint(root), productBuild, "Product build changed during evaluation");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const project = option("--project");
  const manifestPath = option("--manifest");
  const output = option("--output");
  assert.ok(project && manifestPath && output, "Required: --project <indexed corpus> --manifest <truth.json> --output <report.json>");
  const report = await runTaskRetrieval({ project, manifestPath, output, repetitions: Number(option("--repetitions") ?? 3), split: option("--split"), productRoot: option("--product-root") });
  console.log(JSON.stringify(report.results.map(({ result, ...summary }) => summary), null, 2));
}
