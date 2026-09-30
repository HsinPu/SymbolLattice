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
            require(site["module"].replace(".", "/") + ".py" == base_file,
                    "Manifest module/file mismatch")
            cls, indexed_cls = unique_class(file, site["class"])
            base, indexed_base = unique_class(base_file, site["baseClass"])
            imports = [n for n in tree(file).body if isinstance(n, ast.ImportFrom) and n.level == 0 and
                       n.module == site["module"] and any(alias.name == base.name and
                       (alias.asname or alias.name) == site["baseName"] for alias in n.names)]
            require(len(imports) == 1, "Missing/nonunique written absolute import")
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
            relation = database.execute("SELECT id,resolution,confidence FROM edges WHERE source_id=? AND target_id=? AND kind='extends'",
                                        (indexed_cls["id"], indexed_base["id"])).fetchall()
            indexed_calls = database.execute("SELECT e.id,e.target_id,e.resolution,e.confidence FROM edges e JOIN symbols s ON s.id=e.source_id WHERE e.file_path=? AND e.kind='calls' AND e.start_line=? AND e.reference_name=? AND s.start_line=? AND s.name=?",
                                             (file, site["line"], "self." + site["method"], methods[0].lineno, site["owner"])).fetchall()
            require(len(indexed_calls) == 1, "Missing/nonunique indexed call")
            observations.append({**site, "importLine": imports[0].lineno, "classLine": cls.lineno,
                                 "baseDeclarationLine": declarations[0].lineno,
                                 "extendsEdges": [dict(row) for row in relation],
                                 "extendsCoverage": "present" if relation else "missing",
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
