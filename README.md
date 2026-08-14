<div align="center">

# SymbolLattice

**以證據優先、在地優先的程式碼圖與 AI Agent 限界程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.419.0 為開發者預覽版。MCP 查詢工具為唯讀，但 `serve --mcp` 預設會啟動另一個本機自動同步 watcher；它可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用。

## 這是什麼

SymbolLattice 掃描本機 repository、保存程式碼圖，並以 CLI/MCP 提供檔案、symbol、呼叫、import、繼承、route、entry point、限界 impact path 與來源可追溯脈絡的查詢。每一條關係都有 source range、解析階段、信心程度與規則證據。

無法精確證明的關係會保留為 unresolved 或 pending，而不會成為錯誤的 exact edge。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

node dist/cli/main.js init /path/to/project
node dist/cli/main.js sync /path/to/project
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## v0.419.0 TypeScript 自我託管證據

本版工作只在固定 TypeScript 範圍評估限界、exact-safe 的關係；**不**主張所有 TypeScript 專案、語言特性、runtime 路徑或動態關係的完整涵蓋或正確性。

- Stage 2 建立 250 個 compiler-grounded positive truths 與 100 個 negative assertions。
- Stage 3 在該固定 corpus 得分為 **TP 250 / FP 0 / FN 0**。
- Stage 4 的固定 A/B 評估中，兩個 arm 均為 4/4 任務成功；不提出 token 效能主張。
- Stage 5 評估 MIT 授權、peeled commit `315e698…` 的 NestJS v11.1.16：1,659 個 TypeScript 檔案、約 108,540 行。固定 oracle 得分為 **TP 300 / FP 0 / FN 0**，另有 150 個 negative assertions。最終 fresh index 為 1,748 files、18,125 symbols、46,920 edges、15,134 pending references；incremental 檢查 9/9 通過，MCP 檢查為 0 fallback、0 worker crash。extractor 為 v283，resolver 為 v148。

下列公開 npm alias 可執行內部 Stage 5 工具，且刻意要求明確的 project 與 output 參數：

```bash
npm run benchmark:typescript-large-oracle -- --project /path/to/project ...
npm run benchmark:typescript-large-index-evidence -- --project /path/to/project --output evidence.json
npm run benchmark:typescript-large-incremental -- --project /path/to/disposable-project ...
npm run verify:typescript-self-hosting-mcp -- --project /path/to/indexed-project ...
```

各 script 的 required-argument 訊息是參數的權威來源。它們會寫入指定 output，且在適用時會寫入所提供 project 的索引；實驗請使用可丟棄的副本。

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# 完全停用背景索引更新
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP 查詢不會直接執行 `init` 或 `sync`。需控制索引時，請使用 CLI 的 `init`、`sync` 或 `watch`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` / `sync` | 建立或明確更新專案程式碼圖。 |
| `status` | 檢視 generation 與 freshness。 |
| `files` / `file` | 列出或讀取已保存的來源。 |
| `find` / `node` | 搜尋並檢視 symbol。 |
| `callers` / `callees` | 查詢靜態呼叫關係。 |
| `routes` / `entrypoints` | 檢視 framework route 與 entry point。 |
| `impact` / `affected` | 執行限界 impact analysis。 |
| `context` / `explore` | 取得供 Agent 使用的程式碼脈絡。 |
| `explain-edge` | 檢視一條 edge 的完整證據。 |

以 `node dist/cli/main.js <command> --help` 查詢所有選項。

## 限制

SymbolLattice 是靜態程式碼圖與程式碼 intelligence 工具；它不是完整 compiler、type checker、runtime tracer、RDF ontology 或通用推理引擎。dynamic dispatch、reflection、macro、code generation、dependency injection 與外部套件型別可能仍為 unresolved。

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
