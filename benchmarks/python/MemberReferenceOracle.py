"""Independent CPython syntax occurrences; this is not a receiver/dispatch oracle."""
import ast
import hashlib
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
paths = subprocess.check_output(
    ['git', '-C', str(root), 'ls-files', '-z', '*.py', '*.pyi']
).decode().split('\0')
records = []
for path in filter(None, paths):
    raw = (root / path).read_bytes()
    text = raw.decode('utf-8-sig')  # Preserve original CRLF and UTF-8 byte columns.
    record = dict(path=path, sha256=hashlib.sha256(raw).hexdigest())
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError as error:
        records.append(dict(record, rejected=str(error)))
        continue
    lines = text.splitlines(keepends=True)

    def position(line, column):
        prefix = lines[line - 1].encode('utf-8')[:column].decode('utf-8')
        return dict(line=line, column=len(prefix.encode('utf-16-le')) // 2 + 1)

    def segment(node):
        start, end = node.lineno - 1, node.end_lineno - 1
        if start == end:
            return lines[start].encode('utf-8')[node.col_offset:node.end_col_offset].decode('utf-8')
        return (lines[start].encode('utf-8')[node.col_offset:].decode('utf-8') +
                ''.join(lines[start + 1:end]) +
                lines[end].encode('utf-8')[:node.end_col_offset].decode('utf-8'))

    name_cache = {}

    def static_name(node):
        if not isinstance(node, ast.Attribute):
            return None
        if node not in name_cache:
            parts = segment(node).split('.')
            name_cache[node] = ('.'.join(part.strip() for part in parts)
                                if all(part.strip().isidentifier() for part in parts) else None)
        return name_cache[node]

    references = []

    def walk(node, owner=None, parent=None):
        if isinstance(node, ast.Lambda):
            return
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            child_owner = None if isinstance(node, ast.ClassDef) else dict(name=node.name, line=node.lineno)
            for child in node.body:
                walk(child, child_owner, node)
            return
        if owner is not None and isinstance(node, ast.Attribute):
            name = static_name(node)
            callee = isinstance(parent, ast.Call) and parent.func is node
            in_static_chain = isinstance(parent, ast.Attribute) and static_name(parent) is not None
            if name is not None and not callee and not in_static_chain:
                references.append(dict(owner=owner, referenceName=name,
                    range=dict(start=position(node.lineno, node.col_offset),
                               end=position(node.end_lineno, node.end_col_offset)),
                    context=type(node.ctx).__name__))
        for child in ast.iter_child_nodes(node):
            walk(child, owner, node)

    walk(tree)
    records.append(dict(record, references=references))
pathlib.Path(sys.argv[2]).write_text(json.dumps(dict(python=sys.version, records=records),
    ensure_ascii=False), encoding='utf-8')
