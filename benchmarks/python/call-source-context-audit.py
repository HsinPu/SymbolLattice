#!/usr/bin/env python3
"""Check returned Python source routes against CPython AST, without executing imports."""
import argparse
import ast
import hashlib
import json
from pathlib import Path


REPOSITORIES = {
    "https://github.com/django/django": "django",
    "https://github.com/pallets/flask": "flask",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-identity", type=Path, required=True)
    parser.add_argument("--reports", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    identity = json.loads(args.build_identity.read_text(encoding="utf-8-sig"))
    corpora = {item["name"]: item for item in identity["corpora"]}
    cached, source_hashes, observations = {}, {}, []

    def path_for(project, relative):
        root = Path(project).resolve()
        path = (root / relative).resolve()
        assert root in path.parents, f"Source path leaves corpus: {relative}"
        return path

    def tree_for(project, relative):
        key = (project, relative)
        if key not in cached:
            raw = path_for(project, relative).read_bytes()
            cached[key] = ast.parse(raw.decode("utf-8-sig"), filename=relative)
            source_hashes[f"{project}|{relative}"] = hashlib.sha256(raw).hexdigest()
        return cached[key]

    def method_for(project, symbol, owner_name=None):
        found = []
        for cls in ast.walk(tree_for(project, symbol["filePath"])):
            if not isinstance(cls, ast.ClassDef) or (owner_name is not None and cls.name != owner_name):
                continue
            for method in cls.body:
                if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name == symbol["name"]:
                    if symbol["range"]["start"]["line"] <= method.lineno <= symbol["range"]["end"]["line"]:
                        assert method.end_lineno == symbol["range"]["end"]["line"], f"Method extent differs: {symbol['qualifiedName']}"
                        found.append((cls, method))
        assert len(found) == 1, f"Method ownership is ambiguous or absent: {symbol['qualifiedName']}"
        return found[0]

    def direct_calls(method):
        stack = list(method.body)
        while stack:
            node = stack.pop()
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                continue
            if isinstance(node, ast.Call):
                yield node
            stack.extend(ast.iter_child_nodes(node))

    def call_for(method, edge, name):
        found = [node for node in direct_calls(method) if node.lineno == edge["range"]["start"]["line"]
                 and isinstance(node.func, ast.Attribute) and node.func.attr == name
                 and isinstance(node.func.value, ast.Name) and node.func.value.id == "self"]
        assert len(found) == 1, f"No unique direct self call at {edge['filePath']}:{edge['range']['start']['line']}"
        return found[0]

    for report_path in sorted(args.reports.glob("*-tasks.json")):
        report = json.loads(report_path.read_text(encoding="utf-8-sig"))
        name = REPOSITORIES.get(report["repository"])
        if name is None:
            continue
        corpus = corpora[name]
        assert report["commit"] == corpus["commit"]
        assert report["productVersion"] == identity["version"]
        project = corpus["project"]
        for result in report["results"]:
            for window in result["result"].get("sourceWindows", []):
                context = window.get("callSourceContext")
                if context is None:
                    continue
                if context["reason"] == "exact-caller-source":
                    caller_owner, caller = method_for(project, context["declaration"])
                    root_owner, _ = method_for(project, context["root"])
                    assert caller_owner is root_owner, "Static caller is not in the root's literal class"
                    call = call_for(caller, context["callerEdge"], context["root"]["name"])
                    observations.append({"repository": name, "task": result["id"], "kind": "exact-caller-source",
                                         "file": context["declaration"]["filePath"], "line": call.lineno})
                    continue
                for step in context["steps"]:
                    witness = step["inheritedSource"]
                    caller_owner, caller = method_for(project, step["caller"], witness["callerClass"]["name"])
                    target_owner, _ = method_for(project, step["declaration"], witness["declarationClass"]["name"])
                    call = call_for(caller, step["call"], step["declaration"]["name"])
                    assert len(caller_owner.bases) == 1 and isinstance(caller_owner.bases[0], ast.Name)
                    written_base = caller_owner.bases[0].id
                    assert written_base == witness["inheritance"]["referenceName"]
                    imports = [node for node in tree_for(project, step["caller"]["filePath"]).body
                               if isinstance(node, ast.ImportFrom) and node.lineno == witness["importEdge"]["range"]["start"]["line"]
                               and any(alias.name == target_owner.name and (alias.asname or alias.name) == written_base for alias in node.names)]
                    assert len(imports) == 1, "Written base import does not bind the declared class name"
                    statement = imports[0]
                    if statement.level:
                        module = Path(step["caller"]["filePath"]).parent
                        for _ in range(statement.level - 1):
                            module = module.parent
                        if statement.module:
                            module = module.joinpath(*statement.module.split("."))
                    else:
                        assert statement.module
                        module = Path(*statement.module.split("."))
                    alternatives = [module / "__init__.py"] if statement.module is None else [module.with_suffix(".py"), module / "__init__.py"]
                    existing = [relative for relative in alternatives if path_for(project, relative).is_file()]
                    assert len(existing) == 1 and existing[0].as_posix() == step["declaration"]["filePath"], "Imported source path is ambiguous or differs"
                    assert target_owner in tree_for(project, step["declaration"]["filePath"]).body, "Imported base class is not top level"
                    evidence = witness["inheritance"]["evidence"]
                    for marker in evidence.get("configurationPaths", []):
                        assert path_for(project, marker).is_file() and Path(marker).name == "__init__.py"
                    for directory in evidence.get("unmarkedPackagePaths", []):
                        assert path_for(project, directory).is_dir() and not path_for(project, f"{directory}/__init__.py").exists()
                    observations.append({"repository": name, "task": result["id"], "kind": "inherited-call-source",
                                         "callerFile": step["caller"]["filePath"], "callerMethod": caller.name,
                                         "callLine": call.lineno, "base": written_base,
                                         "targetFile": step["declaration"]["filePath"], "targetMethod": step["declaration"]["name"]})
    assert observations, "No returned source contexts were audited"
    output = {"complete": True, "productVersion": identity["version"], "oracle": "CPython AST, imports not executed",
              "scope": "Written class/method ownership, direct self calls, named base imports and actual package markers; no runtime dispatch proof",
              "observations": observations, "sourceSha256": source_hashes}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    assert not args.output.exists(), "Preserve prior oracle output"
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"complete": True, "observations": len(observations), "sourceFiles": len(source_hashes)}))


if __name__ == "__main__":
    main()
