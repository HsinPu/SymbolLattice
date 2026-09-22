import ast, hashlib, json, pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
records = []
for path in filter(None, subprocess.check_output(['git','-C',str(root),'ls-files','-z','*.py']).decode().split('\0')):
    raw = (root/path).read_bytes()
    text = raw.decode('utf-8-sig')
    try: tree = ast.parse(text, filename=path)
    except SyntaxError as e:
        records.append(dict(path=path,sha256=hashlib.sha256(raw).hexdigest(),rejected=str(e)))
        continue
    lines=text.splitlines()
    def position(line,col):
        prefix=lines[line-1].encode('utf-8')[:col].decode('utf-8')
        return dict(line=line,column=len(prefix.encode('utf-16-le'))//2+1)
    def dotted(node):
        if isinstance(node,ast.Name): return node.id
        if isinstance(node,ast.Attribute):
            parent=dotted(node.value)
            if parent is not None: return parent+'.'+node.attr
        return None
    calls=[]
    def walk(node,owner=None):
        if isinstance(node,ast.Lambda): return
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
            child_owner=None if isinstance(node,ast.ClassDef) else dict(name=node.name,line=node.lineno)
            for child in node.body: walk(child,child_owner)
            return
        if owner is not None and isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute):
            name=dotted(node.func)
            if name is not None:
                callee=node.func
                calls.append(dict(owner=owner,referenceName=name,range=dict(start=position(callee.lineno,callee.col_offset),end=position(callee.end_lineno,callee.end_col_offset))))
        for child in ast.iter_child_nodes(node): walk(child,owner)
    walk(tree)
    records.append(dict(path=path,sha256=hashlib.sha256(raw).hexdigest(),calls=calls))
pathlib.Path(sys.argv[2]).write_text(json.dumps(dict(python=sys.version,records=records),ensure_ascii=False),encoding='utf-8')
