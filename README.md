<div align="center">

# SymbolLattice

**以證據優先、在地優先的程式碼圖與 AI Agent 限界程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.420.0 為開發者預覽版。MCP 查詢工具為唯讀，但 `serve --mcp` 預設會啟動另一個本機自動同步 watcher；它可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用。

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

## 安裝到 Codex

先安裝公開 CLI，並在要使用的 repository 明確建立索引：

```bash
npm install -g @hsinpu/symbol-lattice
cd /path/to/project
symbol-lattice init .
```

Codex 安裝器預設只顯示計畫，不會寫入：

```bash
symbol-lattice install codex
symbol-lattice install codex --apply --yes
symbol-lattice doctor codex
```

它共同管理全域 `~/.codex/config.toml` 的 `mcp_servers.symbol_lattice` table，以及全域 `~/.codex/AGENTS.md` 中由 `SYMBOL_LATTICE_START`／`SYMBOL_LATTICE_END` 包住的區塊。既有檔案修改前會建立完整備份；任一檔案前置檢查或寫入失敗時，安裝會停止或回復已嘗試的變更。

移除時也先預覽，且只移除 SymbolLattice 自己管理的內容：

```bash
symbol-lattice uninstall codex
symbol-lattice uninstall codex --apply --yes
```

安裝器不會自動建立或刪除專案索引。v0.420.0 已通過隔離 npm 安裝、MCP stdio cwd，以及新 Codex task 的實機驗證；該 task 成功載入 SymbolLattice MCP，並把執行中的 repository 正確解析為專案路徑。

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
npm run verify:mcp-worker-generation
npm pack --dry-run
```

## 授權

[MIT](LICENSE)
