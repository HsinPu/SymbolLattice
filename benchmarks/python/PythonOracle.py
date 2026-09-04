from __future__ import annotations

import argparse
import ast
import hashlib
import json
from pathlib import Path


def utf16_column(line: str, byte_column: int) -> int:
    prefix = line.encode("utf-8")[:byte_column].decode("utf-8")
    return len(prefix.encode("utf-16-le")) // 2 + 1


def endpoint(file_path: str, class_name: str, node: ast.FunctionDef, lines: list[str]) -> dict[str, object]:
    return {
        "filePath": file_path,
        "kind": "method",
        "name": node.name,
        "qualifiedName": f"{file_path}#{class_name}.{node.name}",
        "line": node.lineno,
        "column": utf16_column(lines[node.lineno - 1], node.col_offset),
    }


class DirectSelfCalls(ast.NodeVisitor):
    def __init__(self) -> None:
        self.calls: list[ast.Attribute] = []
        self.unsafe = False

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        return

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        return

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        return

    def visit_Lambda(self, node: ast.Lambda) -> None:
        return

    def visit_Name(self, node: ast.Name) -> None:
        if node.id == "self" and isinstance(node.ctx, (ast.Store, ast.Del)):
            self.unsafe = True

    def visit_Call(self, node: ast.Call) -> None:
        if (
            isinstance(node.func, ast.Name)
            and node.func.id in {"setattr", "delattr"}
            and node.args
            and isinstance(node.args[0], ast.Name)
            and node.args[0].id == "self"
        ):
            self.unsafe = True
        if (
            isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "self"
        ):
            self.calls.append(node.func)
        self.generic_visit(node)


def candidates(source_id: str, root: Path) -> tuple[list[dict[str, object]], int, int]:
    found: list[dict[str, object]] = []
    parsed = rejected = 0
    for path in sorted(root.rglob("*.py")):
        relative = path.relative_to(root).as_posix()
        file_path = f"{source_id}/{relative}"
        try:
            text = path.read_text(encoding="utf-8")
            tree = ast.parse(text, filename=file_path)
        except (UnicodeError, SyntaxError):
            rejected += 1
            continue
        parsed += 1
        if any(
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in {"globals", "exec"}
            for node in ast.walk(tree)
        ):
            continue
        lines = text.splitlines()
        artifact_mutated_members = {
            f"{target.value.id}.{target.attr}"
            for node in ast.walk(tree)
            if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign, ast.Delete))
            for target in (
                node.targets
                if isinstance(node, (ast.Assign, ast.Delete))
                else [node.target]
            )
            if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name)
        }
        for class_node in (node for node in tree.body if isinstance(node, ast.ClassDef)):
            if class_node.decorator_list or any(keyword.arg == "metaclass" for keyword in class_node.keywords):
                continue
            methods = [node for node in class_node.body if isinstance(node, ast.FunctionDef) and not node.decorator_list]
            all_method_names = {
                node.name for node in class_node.body
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
            by_name: dict[str, list[ast.FunctionDef]] = {}
            for method in methods:
                by_name.setdefault(method.name, []).append(method)
            if any(name in all_method_names for name in ("__getattribute__", "__getattr__", "__setattr__")):
                continue
            class_tainted_names: set[str] = set()
            for statement in class_node.body:
                targets: list[ast.expr] = []
                if isinstance(statement, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
                    targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
                class_tainted_names.update(target.id for target in targets if isinstance(target, ast.Name))
            for caller in methods:
                positional = [*caller.args.posonlyargs, *caller.args.args]
                if not positional or positional[0].arg != "self":
                    continue
                collector = DirectSelfCalls()
                for statement in caller.body:
                    collector.visit(statement)
                if collector.unsafe:
                    continue
                for call in collector.calls:
                    targets = by_name.get(call.attr, [])
                    if (
                        len(targets) != 1
                        or call.attr in class_tainted_names
                        or f"{class_node.name}.{call.attr}" in artifact_mutated_members
                    ):
                        continue
                    target = targets[0]
                    occurrence = {
                        "filePath": file_path,
                        "line": call.end_lineno,
                        "column": utf16_column(lines[call.end_lineno - 1], call.end_col_offset - len(call.attr.encode("utf-8"))),
                    }
                    fact = {
                        "project": source_id,
                        "stratum": "memberCall",
                        "kind": "calls",
                        "source": endpoint(file_path, class_node.name, caller, lines),
                        "target": endpoint(file_path, class_node.name, target, lines),
                        "occurrence": occurrence,
                    }
                    fact["hash"] = hashlib.sha256(json.dumps(fact, sort_keys=True).encode()).hexdigest()
                    found.append(fact)
    return found, parsed, rejected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", action="append", required=True, help="name=path")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    selected: list[dict[str, object]] = []
    stats: dict[str, object] = {}
    quotas = [14, 13, 13]
    for index, value in enumerate(args.corpus):
        name, raw_path = value.split("=", 1)
        rows, parsed, rejected = candidates(name, Path(raw_path).resolve())
        rows.sort(key=lambda row: str(row["hash"]))
        quota = quotas[index] if index < len(quotas) else 0
        selected.extend(rows[: quota * 10])
        stats[name] = {"parsedFiles": parsed, "rejectedFiles": rejected, "candidateCount": len(rows), "candidatePool": min(quota * 10, len(rows)), "quota": quota}
    output = {
        "schemaVersion": 1,
        "oracle": "cpython-stdlib-ast-3.13.11-direct-self-member-v1",
        "stats": stats,
        "positives": selected,
        "positiveTruthSha256": hashlib.sha256("\n".join(sorted(str(row["hash"]) for row in selected)).encode()).hexdigest(),
    }
    Path(args.output).write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"positives": len(selected), "stats": stats, "output": args.output}, indent=2))


if __name__ == "__main__":
    main()
