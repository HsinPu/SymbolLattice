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
> v0.158.0 是開發者預覽版，尚未發布到 npm；請從原始碼執行。

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

## v0.158.0

- FastAPI `APIRouter` 現可透過正規 Python 套件的巢狀 `__init__.py` 最終單一名稱 re-export 鏈，跨檔解析 `include_router(...)` 路由。
- 每一條 exact 路由都會在 `resolutionPath` 留下掛載模組、初始化檔與實際宣告模組，方便追溯。
- 只接受未重綁定、可解析且沒有歧義的最終匯出；來源不存在、循環、衝突與動態覆寫不會產生 exact 路由。

## 核心原則

- 所有索引與查詢都在本機執行，不會靜默上傳原始碼。
- `init` 與 `sync` 是明確的寫入操作；CLI 與 MCP 查詢維持唯讀。
- 關係必須有可重現的靜態證據，否則保留為未解析，而非猜測。

## 邊界

- 跨檔 FastAPI 與 Sanic 路徑限於正規 Python 套件內、一個前導點、單一名稱的相對匯入，以及頂層、字面量的框架註冊；`__init__.py` 僅支援最終、未重綁定的同型匯出鏈。
- 動態組合、複製值、list/tuple 成員、非初始化檔 re-export、namespace package、父層相對匯入、class view、WebSocket、`add_route`、版本與其他註冊選項目前不會升格為 exact。
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
