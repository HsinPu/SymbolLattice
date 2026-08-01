<div align="center">

# SymbolLattice

**可查詢、可解釋、完全在本機執行的程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.156.0 是開發者預覽版，尚未發布到 npm；請從原始碼執行。

SymbolLattice 將專案建立為可查詢的本機程式碼符號圖譜。每條關係都保留規則、解析階段與信心值，絕不混淆 `exact`、`heuristic` 與 `unresolved` 證據。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

~~~bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；原始碼變更後明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
~~~

在 Windows PowerShell，如無法使用 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.156.0

- Sanic `Blueprint.group(...)` 現可跨同一個已證明 Python 套件的相對匯入路徑遞迴投影路由。
- 支援直接與匯入的 Blueprint 成員、巢狀群組、別名，以及群組 prefix、Blueprint prefix、掛載 prefix 與 decorator path 的精確組合。
- 每條跨檔群組路由保留完整模組跳點的 `resolutionPath` 證據。
- 同一 app 的重複群組掛載僅在每個直接群組均有不同且字面量 `name_prefix` 時成為 exact；循環、重複葉節點、衝突與未證明成員不會產生 exact 路由。

## 核心原則

- 所有索引與查詢都在本機執行，不會靜默上傳原始碼。
- `init` 與 `sync` 是明確的寫入操作；CLI 與 MCP 查詢維持唯讀。
- 關係必須有可重現的靜態證據，否則保留為未解析，而非猜測。

## 邊界

- 跨檔 Sanic 路徑限於正規 Python 套件內、一個前導點、單一名稱的相對匯入，以及頂層、字面量設定的 `Blueprint.group(...)` 與 `app.blueprint(...)`。
- 動態組合、複製值、list/tuple 成員、re-export、namespace package、父層相對匯入、class view、WebSocket、`add_route`、版本與其他註冊選項目前不會升格為 exact。
- 反射、執行期設定、DI、巨集、產生程式碼與模糊名稱同樣不會被當作靜態證明。

## 驗證

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## 授權

[MIT](LICENSE)
