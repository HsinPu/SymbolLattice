from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from fparser.common.readfortran import FortranFileReader
from fparser.two.Fortran2003 import (
    Call_Stmt,
    External_Stmt,
    Function_Subprogram,
    Main_Program,
    Procedure_Declaration_Stmt,
    Subroutine_Subprogram,
)
from fparser.two.parser import ParserFactory
from fparser.two.utils import walk

EXTENSIONS = {".f", ".for", ".f77", ".f90", ".f95", ".f03", ".f08"}
IGNORED = {".git", ".symbollattice", "node_modules", "build", "cmake-build-debug"}
CALLERS = (Subroutine_Subprogram, Function_Subprogram, Main_Program)


def source_files(root: Path) -> list[Path]:
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in EXTENSIONS
        and not any(part.lower() in IGNORED for part in path.relative_to(root).parts)
    )


def header(unit: object) -> object:
    return unit.children[0]


def unit_name(unit: object) -> str | None:
    statement = header(unit)
    items = getattr(statement, "items", ())
    for item in items:
        if item is not None and type(item).__name__ == "Name":
            return str(item)
    return None


def dummy_names(unit: object) -> set[str]:
    statement = header(unit)
    items = getattr(statement, "items", ())
    for item in items:
        if item is not None and type(item).__name__ == "Dummy_Arg_List":
            return {str(value).lower() for value in item.items}
    return set()


def target_arity(unit: object) -> int:
    statement = header(unit)
    items = getattr(statement, "items", ())
    for item in items:
        if item is not None and type(item).__name__ == "Dummy_Arg_List":
            return len(item.items)
    return 0


def nearest_caller(node: object) -> object | None:
    parent = getattr(node, "parent", None)
    while parent is not None:
        if isinstance(parent, CALLERS):
            return parent
        parent = getattr(parent, "parent", None)
    return None


def has_procedure_shadow(caller: object, name: str) -> bool:
    lowered = name.lower()
    if lowered in dummy_names(caller):
        return True
    statements = walk(caller, External_Stmt) + walk(caller, Procedure_Declaration_Stmt)
    return any(re.search(rf"\b{re.escape(name)}\b", str(statement), re.IGNORECASE) for statement in statements)


def position(lines: list[str], line_number: int, name: str, keyword: str | None = None) -> tuple[int, int] | None:
    if line_number < 1 or line_number > len(lines):
        return None
    line = lines[line_number - 1]
    start = 0
    if keyword is not None:
        match = re.search(rf"\b{re.escape(keyword)}\b", line, re.IGNORECASE)
        if match is None:
            return None
        start = match.end()
    match = re.search(rf"\b{re.escape(name)}\b", line[start:], re.IGNORECASE)
    if match is None:
        return None
    return line_number, start + match.start()


def declaration_position(lines: list[str], line_number: int) -> tuple[int, int] | None:
    if line_number < 1 or line_number > len(lines):
        return None
    line = lines[line_number - 1]
    return line_number, len(line) - len(line.lstrip())


def analyze(path: Path, root: Path, parser: object) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    text = path.read_text(encoding="utf-8", errors="strict")
    lines = text.splitlines()
    tree = parser(FortranFileReader(str(path)))
    if path.suffix != path.suffix.lower():
        return [], []
    subroutines = walk(tree, Subroutine_Subprogram)
    definitions: list[dict[str, object]] = []
    for unit in subroutines:
        name = unit_name(unit)
        if name is not None:
            target_line = header(unit).item.span[0]
            target_position = declaration_position(lines, target_line)
            if target_position is not None:
                definitions.append({
                    "name": name,
                    "file": path.relative_to(root).as_posix(),
                    "arity": target_arity(unit),
                    "line": target_position[0],
                    "column": target_position[1],
                })
    calls: list[dict[str, object]] = []
    for call in walk(tree, Call_Stmt):
        if call.item is None:
            continue
        target_name = str(call.items[0])
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", target_name):
            continue
        caller = nearest_caller(call)
        caller_name = None if caller is None else unit_name(caller)
        if caller is None or caller_name is None or has_procedure_shadow(caller, target_name):
            continue
        arguments = call.items[1]
        call_arity = 0 if arguments is None else len(arguments.items)
        caller_line = header(caller).item.span[0]
        call_line = call.item.span[0]
        caller_position = declaration_position(lines, caller_line)
        call_position = position(lines, call_line, target_name, "call")
        if caller_position is None or call_position is None:
            continue
        calls.append({
            "file": path.relative_to(root).as_posix(),
            "caller_kind": type(caller).__name__,
            "caller": caller_name,
            "target": target_name,
            "arity": call_arity,
            "caller_line": caller_position[0],
            "caller_column": caller_position[1],
            "call_line": call_position[0],
            "call_column": call_position[1],
        })
    return definitions, calls


def main() -> int:
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument("source_root", type=Path)
    args = argument_parser.parse_args()
    root = args.source_root.resolve(strict=True)
    parser = ParserFactory().create(std="f2008")
    files = source_files(root)
    rejected = 0
    definitions: list[dict[str, object]] = []
    calls: list[dict[str, object]] = []
    for path in files:
        try:
            file_definitions, file_calls = analyze(path, root, parser)
            definitions.extend(file_definitions)
            calls.extend(file_calls)
        except Exception as error:
            rejected += 1
            print(f"REJECTED\t{path.relative_to(root).as_posix()}\t{type(error).__name__}", file=sys.stderr)
    by_name: dict[str, list[dict[str, object]]] = {}
    for definition in definitions:
        by_name.setdefault(str(definition["name"]).lower(), []).append(definition)
    candidates: list[str] = []
    for call in calls:
        targets = by_name.get(str(call["target"]).lower(), [])
        if len(targets) != 1 or int(targets[0]["arity"]) != int(call["arity"]):
            continue
        target = targets[0]
        fields = [
            "CANDIDATE", str(call["file"]), str(target["file"]), str(call["caller_kind"]),
            str(call["caller"]), str(call["target"]), str(call["arity"]),
            str(call["caller_line"]), str(call["caller_column"]),
            str(target["line"]), str(target["column"]),
            str(call["call_line"]), str(call["call_column"]),
        ]
        candidates.append("\t".join(fields))
    for fact in sorted(set(candidates)):
        print(fact)
    print(f"SUMMARY\t{len(files)}\t{rejected}\t{len(set(candidates))}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

