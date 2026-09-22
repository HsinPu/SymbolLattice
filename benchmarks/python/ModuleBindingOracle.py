import ast, hashlib, json, pathlib, re, subprocess, sys
root = pathlib.Path(sys.argv[1])
paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '*.py']).decode().split('\0')
records = []
for path in filter(None, paths):
    raw = (root / path).read_bytes()
    text = raw.decode('utf-8-sig')
    try:
        module = ast.parse(text, filename=path)
    except SyntaxError as e:
        records.append(dict(path=path, sha256=hashlib.sha256(raw).hexdigest(), rejected=str(e)))
        continue
    lines = text.splitlines()
    bindings = []
    def position(line, byte_column):
        prefix = lines[line-1].encode('utf-8')[:byte_column].decode('utf-8')
        return dict(line=line, column=len(prefix.encode('utf-16-le'))//2+1)
    for node in module.body:
        target = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            target = node.target
        if not isinstance(target, ast.Name) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', target.id):
            continue
        bindings.append(dict(name=target.id, range=dict(start=position(node.lineno,node.col_offset), end=position(node.end_lineno,node.end_col_offset))))
    records.append(dict(path=path,sha256=hashlib.sha256(raw).hexdigest(),bindings=bindings))
pathlib.Path(sys.argv[2]).write_text(json.dumps(dict(python=sys.version, records=records),ensure_ascii=False),encoding='utf-8')
