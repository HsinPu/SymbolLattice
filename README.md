<div align="center">

# SymbolLattice

**以證據為先、在本機運作的程式碼圖譜與 AI Agent 程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.412.0 是開發預覽版。MCP 查詢工具本身唯讀；`serve --mcp` 預設會另外啟動本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用自動同步。

## 簡介

SymbolLattice 掃描本機 repository、保存程式碼圖譜，並以 CLI 與 MCP 提供查詢：

- 檔案、symbol、call、import、inheritance、route 與 entry point。
- callers、callees、impact、affected path、context 與跨檔探索。
- 每個關係的來源範圍、解析階段、信心值與規則證據。

無法精確證明的關係會維持 unresolved 或 pending，不會轉成錯誤的 exact edge。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

node dist/cli/main.js init /path/to/project
node dist/cli/main.js sync /path/to/project
node dist/cli/main.js files --project /path/to/project --json
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js callees createOrder --project /path/to/project --json
node dist/cli/main.js routes --project /path/to/project --json
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## v0.412.0 重點

- 固定來源驗收使用 WordPress 官方 [`wordpress-develop`](https://github.com/WordPress/wordpress-develop) 6.7.0 commit [`262f4b6add2d1503bdd35611764ec58742b10fb9`](https://github.com/WordPress/wordpress-develop/tree/262f4b6add2d1503bdd35611764ec58742b10fb9)（GPL-2.0-or-later），掃描完整 [`tests/phpunit/multisite.xml`](https://github.com/WordPress/wordpress-develop/blob/262f4b6add2d1503bdd35611764ec58742b10fb9/tests/phpunit/multisite.xml)。三項 B1 truth 為根元素 `phpunit`、直接子元素 `php`，以及 `phpunit`→`php` 的唯一直接 containment；SymbolLattice 為 **TP 3／FP 0／FN 0**，CodeGraph 1.5 僅辨識 XML 檔案、沒有元素 identity／containment，為 **TP 0／FP 0／FN 3**。
- 不宣稱 PHPUnit 執行、XML Schema 驗證、屬性值、文字內容或任意深層 XML 語義。extractor facts 維持 v274，resolver 維持 v143；本次只驗證靜態 XML 元素 identity 與直接 containment。

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# 完全停用背景索引更新
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP 查詢不會直接執行 `init` 或 `sync`。需要控制索引時，請使用 CLI 的 `init`、`sync`、`watch`，或明確核准的 watcher 流程。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` | 建立專案圖譜。 |
| `sync` | 明確同步索引。 |
| `status` | 查看 generation 與 freshness。 |
| `files` / `file` | 列出或讀取已保存來源。 |
| `find` / `node` | 尋找並查看 symbol。 |
| `callers` / `callees` | 查詢靜態 call 關係。 |
| `routes` / `entrypoints` | 查看 framework route 與進入點。 |
| `impact` / `affected` | 執行有界的影響分析。 |
| `context` / `explore` | 取得適合 Agent 使用的程式碼脈絡。 |
| `explain-edge` | 查看單一 edge 的完整證據。 |

使用 `node dist/cli/main.js <command> --help` 查看所有選項。

## 限制

SymbolLattice 是靜態程式碼圖譜與程式碼 intelligence 工具，不是完整編譯器、type checker、runtime tracer、RDF ontology 或通用推理引擎。dynamic dispatch、reflection、macro、code generation、dependency injection 與外部 package type 可能維持 unresolved。

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
