"""Audit indexed Python direct self-call targets against independent CPython ASTs.

Usage: py -3 benchmarks/python/direct-self-call-receipts.py PROJECT MANIFEST OUTPUT
PROJECT must be a clean, pinned, indexed checkout. OUTPUT belongs outside the repo.
"""

import ast
import hashlib
import json
import pathlib
import sqlite3
import subprocess
import sys


def git(root, *args):
    return subprocess.check_output(
        ["git", "-C", str(root), *args], text=True, stderr=subprocess.PIPE
    ).strip()


def syntax_sites(source):
    tree = ast.parse(source)
    lines = source.splitlines()

    def column(line, byte_offset):
        prefix = lines[line - 1].encode("utf-8")[:byte_offset].decode("utf-8")
        return len(prefix.encode("utf-16-le")) // 2 + 1

    sites = {}

    def walk(node, owner, cls):
        if node is not owner and isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)
        ):
            return
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "self"
        ):
            attribute = node.func
            start_byte = attribute.end_col_offset - len(attribute.attr.encode("utf-8"))
            site = (
                attribute.end_lineno,
                column(attribute.end_lineno, start_byte),
                attribute.end_lineno,
                column(attribute.end_lineno, attribute.end_col_offset),
            )
            sites.setdefault(site, []).append((owner, cls, attribute))
        for child in ast.iter_child_nodes(node):
            walk(child, owner, cls)

    for cls in tree.body:
        if isinstance(cls, ast.ClassDef):
            for method in cls.body:
                if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    walk(method, method, cls)
    return sites


def audit(project, manifest_path):
    manifest_text = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(manifest_text)
    assert git(project, "rev-parse", "HEAD") == manifest["commit"]
    assert git(project, "remote", "get-url", "origin").removesuffix(".git") == manifest["repository"]
    assert not git(project, "status", "--porcelain", "--untracked-files=no")

    database = sqlite3.connect(
        f"file:{project / '.SymbolLattice' / 'index.sqlite'}?mode=ro", uri=True
    )
    database.row_factory = sqlite3.Row
    try:
        generation = database.execute(
            "SELECT value FROM meta WHERE key='active_generation_id'"
        ).fetchone()["value"]
        extractor = database.execute(
            "SELECT extractor_version FROM generations WHERE id=?", (generation,)
        ).fetchone()["extractor_version"]
        edges = database.execute(
            """SELECT e.*, ee.evidence_json, s.name source_name,
                      s.qualified_name source_qualified, s.start_line source_line,
                      t.name target_name, t.qualified_name target_qualified,
                      t.start_line target_line, t.file_path target_file
               FROM edge_evidence ee JOIN edges e ON e.id=ee.edge_id
               JOIN symbols s ON s.id=e.source_id
               JOIN symbols t ON t.id=e.target_id
               WHERE ee.generation_id=? AND
                 json_extract(ee.evidence_json, '$.ruleId') =
                 'syntax.python.same-class.unique-direct-self-member-call'""",
            (generation,),
        ).fetchall()
        by_file = {}
        for edge in edges:
            by_file.setdefault(edge["file_path"], []).append(edge)
        for item in manifest["observations"]:
            by_file.setdefault(item["file"], [])

        failures = []
        sites_by_file = {}
        for file, file_edges in by_file.items():
            source = (project / file).read_bytes().decode("utf-8-sig")
            captured = database.execute(
                "SELECT source_text FROM source_documents WHERE generation_id=? AND file_path=?",
                (generation, file),
            ).fetchone()
            assert captured is not None and captured["source_text"] == source, (
                "Index source is stale", file
            )
            sites = syntax_sites(source)
            sites_by_file[file] = sites
            for edge in file_edges:
                site = (
                    edge["start_line"], edge["start_column"],
                    edge["end_line"], edge["end_column"],
                )
                evidence = json.loads(edge["evidence_json"])
                valid = (
                    edge["kind"] == "calls"
                    and edge["resolution"] == "exact"
                    and edge["confidence"] == 1
                    and evidence.get("stage") == "syntax"
                    and evidence.get("candidateSymbolIds") == [edge["target_id"]]
                    and edge["target_file"] == file
                    and any(
                        owner.name == edge["source_name"]
                        and owner.lineno == edge["source_line"]
                        and edge["source_qualified"].endswith(
                            f"#{cls.name}.{owner.name}"
                        )
                        and edge["target_qualified"].endswith(
                            f"#{cls.name}.{attribute.attr}"
                        )
                        and attribute.attr == edge["reference_name"]
                        and attribute.attr == edge["target_name"]
                        and len(targets := [
                            member for member in cls.body
                            if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef))
                            and member.name == attribute.attr
                        ]) == 1
                        and targets[0].lineno == edge["target_line"]
                        for owner, cls, attribute in sites.get(site, [])
                    )
                )
                if not valid:
                    failures.append({
                        "file": file, "line": edge["start_line"],
                        "column": edge["start_column"], "rule": "invalid-target-or-site",
                    })

        observations = []
        for item in manifest["observations"]:
            matching_sites = [
                site for site, candidates in sites_by_file[item["file"]].items()
                if site[0] == item["line"]
                and any(
                    owner.name == item["owner"]
                    and cls.name == item["class"]
                    and attribute.attr == item["target"]
                    and owner.lineno == item["ownerLine"]
                    and len(targets := [
                        member for member in cls.body
                        if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef))
                        and member.name == item["target"]
                    ]) == 1
                    and targets[0].lineno == item["targetLine"]
                    for owner, cls, attribute in candidates
                )
            ]
            assert len(matching_sites) == 1, ("Independent truth site not unique", item)
            site = matching_sites[0]
            found = any(
                (edge["start_line"], edge["start_column"], edge["end_line"], edge["end_column"]) == site
                and edge["source_name"] == item["owner"]
                and edge["target_name"] == item["target"]
                and edge["target_line"] == item["targetLine"]
                for edge in by_file[item["file"]]
            )
            observations.append({**item, "found": found})
        assert git(project, "rev-parse", "HEAD") == manifest["commit"]
        assert not git(project, "status", "--porcelain", "--untracked-files=no")
        return {
            "repository": manifest["repository"], "commit": manifest["commit"],
            "truthSha256": hashlib.sha256(manifest_text.encode()).hexdigest(),
            "generationId": generation, "extractorVersion": extractor,
            "oracle": "CPython ast, independent of product parser and graph resolver",
            "scope": "All emitted exact same-class direct self-call receipts; pinned observations are a separate recall subset. Runtime monkey-patching safety and corpus-wide recall are not proven.",
            "verifiedReceipts": len(edges) - len(failures),
            "invalidReceipts": len(failures), "receiptFiles": len(by_file),
            "tp": sum(item["found"] for item in observations),
            "fn": sum(not item["found"] for item in observations),
            "observations": observations, "failures": failures[:30],
        }
    finally:
        database.close()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    report = audit(pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]))
    pathlib.Path(sys.argv[3]).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({key: value for key, value in report.items() if key not in ("observations", "failures")}, ensure_ascii=False))
    if report["invalidReceipts"] or report["fn"]:
        raise SystemExit(1)
