# Go declaration validation

`declarations.mjs` compares two frozen built products with an independent oracle built from Go's standard-library `go/parser` and `go/ast`. It reads tracked `.go` files in a clean pinned Git checkout. It does not build or execute the external project, resolve its dependencies, select build tags, type-check calls, or measure runtime dispatch.

The scored unit is one top-level `FuncDecl`: name, function/method kind, plain named or pointer receiver, and exact original UTF-16 source range. Generic receivers, interface members, other symbol kinds, and files rejected by the official parser are excluded and listed. Parser errors in otherwise accepted files remain visible. Declaration recall is separate from task-file retrieval and relationship quality.

```sh
node benchmarks/go/declarations.mjs "/external/pinned-go-project" "/external/go/bin/go.exe" "/external/results/declarations.json" "/external/built-baseline" "/external/built-candidate"
```

Both products need built `dist/`, `package.json`, and access to their dependencies. Use the same pinned sources for both. The tool records repository/commit, Go and Node versions, every source hash, helper hash, both product fingerprints, raw declarations, parser errors, excluded cases, and TP/FP/FN. Unchanged complete raw-fact files are counted separately; they are not a relation oracle. The helper executable and report belong in the external output directory.

The v0.550.2 run uses official Go `go1.27.1 windows/amd64`, Gin `43fe48e8a0f44af783116cdb010725e6bb50255f` (99 Go files), and grpc-go `d96c2ef4f3339142d20a47797d8a5a4fae948607` (1,003 Go files). Go's archive identity is retained in the external SDK directory; download metadata comes from [official Go downloads](https://go.dev/dl/). The [boolean semicolon audit](boolean-semicolon-audit.md) records limitations, task failures, upgrade behavior, raw artifacts and paired service measurements.
