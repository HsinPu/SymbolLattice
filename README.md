<div align="center">

# SymbolLattice

**證據優先、本機優先的程式碼圖譜與 AI 程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.376.0 是開發預覽版。MCP 查詢工具本身唯讀；`serve --mcp` 預設會另外啟動本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用自動同步。

## 專案用途

SymbolLattice 掃描本機 repository、建立可持久化的程式碼圖譜，並透過 CLI／MCP 查詢：

- 檔案、symbol、call、import、inheritance、route 與 entrypoint。
- callers、callees、impact、affected、context 與跨檔案 explore。
- 每條關係的來源範圍、解析階段、信心度與規則證據。

無法精確證明的關係會保留為 unresolved／pending，不會為了提高表面支援率而產生錯誤 exact edge。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 更新圖譜
node dist/cli/main.js sync /path/to/project

# 基本查詢
node dist/cli/main.js files --project /path/to/project --json
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js callees createOrder --project /path/to/project --json
node dist/cli/main.js routes --project /path/to/project --json

# 讓 Agent 取得有界的跨檔案脈絡
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## v0.376.0 重點

- 在固定的 `fortran-lang/stdlib` v0.7.0 驗收中，Fortran B1 可辨識小寫 `.f90` 的 module 內 member symbol，並對 `trueloc` 內帶引數的 `CALL logicalloc(...)` 建立保守的同 module direct-call。SymbolLattice 為 `TP 3 / FP 0 / FN 0`；CodeGraph 為 `TP 0 / FP 0 / FN 3`。
- 按慣例可能需要 preprocessing 的大寫副檔名仍會建立 symbol，但不建立 exact call。source-local preprocessing／conditional 若影響或包住 caller、call site 或 target，便維持 fail-closed；平衡且無關的 conditional／macro block 可保留 exact call。`interface`、dynamic、type-bound 與 ambiguous 情況也維持 fail-closed。此界線依副檔名與原始碼證據判定，不涵蓋編譯器對小寫檔案額外強制啟用 preprocessing 的情況。

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# 完全停用背景索引更新
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP 查詢不直接執行 `init` 或 `sync`。需要手動控制索引時，請使用 CLI 的 `init`、`sync`、`watch` 或經明確核准的 watcher 流程。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` | 建立專案圖譜。 |
| `sync` | 明確同步索引。 |
| `status` | 檢查 generation 與 freshness。 |
| `files`／`file` | 列出或閱讀已保存的來源檔。 |
| `find`／`node` | 尋找並查看 symbol。 |
| `callers`／`callees` | 查詢靜態呼叫關係。 |
| `routes`／`entrypoints` | 查看框架路由與入口。 |
| `impact`／`affected` | 進行有界影響分析。 |
| `context`／`explore` | 取得適合 Agent 使用的程式碼脈絡。 |
| `explain-edge` | 查看一條關係的完整證據。 |

使用 `node dist/cli/main.js <command> --help` 查看完整選項。

## 限制

SymbolLattice 是靜態 code graph／code intelligence 工具，不是完整編譯器、型別檢查器、runtime tracer、RDF ontology 或通用推理系統。動態 dispatch、reflection、macro、code generation、dependency injection 與外部套件型別可能保持 unresolved。

## 驗證

```bash
npm run check
npm test
npm run build
npm run benchmark:capabilities
npm run verify:mcp-worker-generation
npm run benchmark:mcp
npm run benchmark:comparison
npm pack --dry-run
```

## 授權

[MIT](LICENSE)
