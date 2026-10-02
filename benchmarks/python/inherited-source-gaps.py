"""Observe imported base-class source gaps using independent CPython AST truth.

Usage: python inherited-source-gaps.py PROJECT MANIFEST OUTPUT
This audits written syntax and index coverage, never runtime method dispatch.
"""

import ast
import hashlib
import json
import pathlib
import sqlite3
import subprocess
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(project, *args):
    return subprocess.check_output(["git", "-C", str(project), *args], text=True).strip()


def audit(project, manifest_path):
    text = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(text)
    require(git(project, "rev-parse", "HEAD") == manifest["commit"], "Wrong corpus commit")
    require(git(project, "remote", "get-url", "origin").removesuffix(".git") ==
            manifest["repository"], "Wrong corpus repository")
    require(not git(project, "status", "--porcelain", "--untracked-files=no"), "Dirty corpus")
    database = sqlite3.connect((project / ".SymbolLattice/index.sqlite").as_uri() + "?mode=ro", uri=True)
    database.row_factory = sqlite3.Row
    try:
        database.execute("BEGIN")
        generation = database.execute("SELECT value FROM meta WHERE key='active_generation_id'").fetchone()[0]
        metadata = dict(database.execute("SELECT * FROM generations WHERE id=?", (generation,)).fetchone())
        sources = {}
        hashes = {}

        def tree(file):
            path = (project / file).resolve()
            require(path.is_relative_to(project), "Source escapes corpus")
            if file not in sources:
                source = path.read_bytes().decode("utf-8-sig")
                captured = database.execute("SELECT source_text FROM source_documents WHERE generation_id=? AND file_path=?",
                                            (generation, file)).fetchone()
                require(captured is not None and captured[0] == source, "Stale/missing indexed source: " + file)
                hashes[file] = hashlib.sha256(source.encode("utf-8")).hexdigest()
                sources[file] = ast.parse(source)
            return sources[file]

        def unique_class(file, name):
            candidates = [n for n in tree(file).body if isinstance(n, ast.ClassDef) and n.name == name]
            require(len(candidates) == 1, "Nonunique AST class: " + name)
            node = candidates[0]
            indexed = database.execute("SELECT * FROM symbols WHERE file_path=? AND name=? AND kind='class' AND start_line=?",
                                       (file, name, node.lineno)).fetchall()
            require(len(indexed) == 1, "Missing/nonunique indexed class: " + name)
            return node, indexed[0]

        observations = []
        for site in manifest["observations"]:
            file, base_file = site["file"], site["baseFile"]
            level = site.get("level", 0)
            require(level in (0, 1), "Unsupported import level")
            directory = str(pathlib.PurePosixPath(file).parent)
            prefix = directory + "/" if level == 1 and directory != "." else ""
            require(prefix + site["module"].replace(".", "/") + ".py" == base_file,
                    "Manifest module/file mismatch")
            cls, indexed_cls = unique_class(file, site["class"])
            base, indexed_base = unique_class(base_file, site["baseClass"])
            imports = [n for n in tree(file).body if isinstance(n, ast.ImportFrom) and n.level == level and
                       n.module == site["module"] and any(alias.name == base.name and
                       (alias.asname or alias.name) == site["baseName"] for alias in n.names)]
            require(len(imports) == 1, "Missing/nonunique written import")
            require(len(cls.bases) == 1 and isinstance(cls.bases[0], ast.Name) and
                    cls.bases[0].id == site["baseName"], "Unexpected written base syntax")
            methods = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == site["owner"]]
            require(len(methods) == 1, "Nonunique caller")
            # Descend only the selected lexical body, excluding nested owners.
            def calls(node):
                for child in ast.iter_child_nodes(node):
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                        continue
                    if isinstance(child, ast.Call):
                        yield child
                    yield from calls(child)
            written = [n for n in calls(methods[0]) if n.lineno == site["line"] and
                       isinstance(n.func, ast.Attribute) and isinstance(n.func.value, ast.Name) and
                       n.func.value.id == "self" and n.func.attr == site["method"]]
            require(len(written) == 1, "Missing/nonunique written self call")
            declarations = [n for n in base.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == site["method"]]
            require(len(declarations) == 1, "Missing/nonunique base declaration")
            source_lines = (project / file).read_bytes().decode("utf-8-sig").splitlines()
            def column(line, byte_offset):
                prefix = source_lines[line - 1].encode("utf-8")[:byte_offset].decode("utf-8")
                return len(prefix.encode("utf-16-le")) // 2 + 1
            relation = database.execute("SELECT e.*,ee.evidence_json FROM edges e LEFT JOIN edge_evidence ee ON ee.edge_id=e.id AND ee.generation_id=? WHERE e.source_id=? AND e.target_id=? AND e.kind='extends'",
                                        (generation, indexed_cls["id"], indexed_base["id"])).fetchall()
            if relation:
                require(len(relation) == 1, "Duplicate indexed inheritance")
                edge = relation[0]
                evidence = json.loads(edge["evidence_json"] or "null")
                written_base = cls.bases[0]
                directories = pathlib.PurePosixPath(base_file).parts[:-1]
                markers = ["/".join(directories[:length]) + "/__init__.py"
                           for length in range(1, len(directories) + 1)]
                if level == 1:
                    source_dirs = pathlib.PurePosixPath(file).parts[:-1]
                    anchor = next((length for length in range(len(source_dirs), -1, -1)
                                   if (project / ("/".join(source_dirs[:length]) + "/" if length else "") /
                                       "__init__.py").is_file()), None)
                    require(anchor is not None, "Missing regular-package ancestor")
                    directories_from_anchor = ["/".join(directories[:length])
                                               for length in range(anchor, len(directories) + 1)]
                    unmarked = [d for d in directories_from_anchor
                                if not (project / d / "__init__.py").is_file()]
                    markers = [(d + "/" if d else "") + "__init__.py"
                               for d in directories_from_anchor if d not in unmarked]
                else:
                    unmarked = []
                for marker in markers:
                    tree(marker)
                require(edge["file_path"] == file and edge["reference_name"] == site["baseName"] and
                        edge["resolution"] == "exact" and edge["confidence"] == 1 and
                        (edge["start_line"], edge["start_column"], edge["end_line"], edge["end_column"]) ==
                        (written_base.lineno, column(written_base.lineno, written_base.col_offset),
                         written_base.end_lineno, column(written_base.end_lineno, written_base.end_col_offset)) and
                        isinstance(evidence, dict) and evidence.get("stage") == "module" and
                        evidence.get("ruleId") == ("module.python.anchored-relative-named-import.unique-top-level-class-inheritance" if unmarked else
                                                   "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance" if level else
                                                   "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance") and
                        evidence.get("candidateSymbolIds") == [indexed_base["id"]] and
                        evidence.get("configurationPaths") == ([] if level and "project-resolver-v210" in metadata["resolver_version"] else markers) and
                        evidence.get("unmarkedPackagePaths", []) == unmarked and
                        evidence.get("resolutionPath") == [file, base_file], "Invalid inheritance source/target receipt")
                source_file = database.execute("SELECT id FROM symbols WHERE file_path=? AND kind='file'", (file,)).fetchone()[0]
                base_file_id = database.execute("SELECT id FROM symbols WHERE file_path=? AND kind='file'", (base_file,)).fetchone()[0]
                file_imports = database.execute("SELECT e.*,ee.evidence_json FROM edges e LEFT JOIN edge_evidence ee ON ee.edge_id=e.id AND ee.generation_id=? WHERE e.source_id=? AND e.target_id=? AND e.kind='imports'",
                                               (generation, source_file, base_file_id)).fetchall()
                import_name = "." * level + site["module"]
                candidates = [row for row in file_imports if row["reference_name"] == import_name and row["start_line"] == imports[0].lineno]
                require(len(candidates) == 1, "Missing/nonunique file-import receipt")
                imported = candidates[0]
                imported_evidence = json.loads(imported["evidence_json"])
                offset = source_lines[imports[0].lineno - 1].index(import_name)
                require(imported["file_path"] == file and imported["resolution"] == "exact" and imported["confidence"] == 1 and
                        (imported["start_column"], imported["end_line"], imported["end_column"]) ==
                        (offset + 1, imports[0].lineno, offset + len(import_name) + 1) and
                        imported_evidence.get("resolutionPath") == [file, base_file] and
                        imported_evidence.get("stage") == "module" and
                        imported_evidence.get("configurationPaths") == evidence.get("configurationPaths") and
                        imported_evidence.get("unmarkedPackagePaths", []) == unmarked and
                        imported_evidence.get("ruleId") == ("module.python.anchored-relative-named-base-import" if unmarked else
                                                           "module.python.regular-package.relative-named-import" if level else
                                                           "module.python.regular-package.absolute-named-base-import"), "Invalid file-import receipt")
            indexed_calls = database.execute("SELECT e.* FROM edges e JOIN symbols s ON s.id=e.source_id WHERE e.file_path=? AND e.kind='calls' AND e.start_line=? AND e.reference_name=? AND s.start_line=? AND s.name=?",
                                             (file, site["line"], "self." + site["method"], methods[0].lineno, site["owner"])).fetchall()
            require(len(indexed_calls) == 1, "Missing/nonunique indexed call")
            require(indexed_calls[0]["target_id"] is None and indexed_calls[0]["resolution"] == "unresolved" and
                    indexed_calls[0]["confidence"] == 0, "Inherited call was promoted to resolved dispatch")
            callee = written[0].func
            require((indexed_calls[0]["start_line"], indexed_calls[0]["start_column"],
                     indexed_calls[0]["end_line"], indexed_calls[0]["end_column"]) ==
                    (callee.lineno, column(callee.lineno, callee.col_offset),
                     callee.end_lineno, column(callee.end_lineno, callee.end_col_offset)), "Invalid call source range")
            observations.append({**site, "importLine": imports[0].lineno, "classLine": cls.lineno,
                                 "baseDeclarationLine": declarations[0].lineno,
                                 "extendsEdges": [dict(row) for row in relation],
                                 "extendsCoverage": "present" if relation else "missing",
                                 "extendsReceipt": "AST-verified" if relation else "not-emitted",
                                 "call": dict(indexed_calls[0]),
                                 "certainty": "written-import/base/declaration; runtime dispatch unproven"})
        return {"scope": "fixed source sites; not whole-corpus precision or runtime dispatch",
                "repository": manifest["repository"], "commit": manifest["commit"],
                "manifestSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "python": sys.version, "generation": metadata, "sourceHashes": hashes,
                "observations": observations,
                "missingExtends": sum(o["extendsCoverage"] == "missing" for o in observations)}
    finally:
        database.close()


if __name__ == "__main__":
    project, manifest, output = map(lambda value: pathlib.Path(value).resolve(), sys.argv[1:])
    product = pathlib.Path(__file__).resolve().parents[2]
    require(not output.is_relative_to(product) and not output.is_relative_to(project), "Output must be external")
    report = audit(project, manifest)
    report["productVersion"] = json.loads((product / "package.json").read_text(encoding="utf-8"))["version"]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"observations": len(report["observations"]), "missingExtends": report["missingExtends"], "output": str(output)}))
