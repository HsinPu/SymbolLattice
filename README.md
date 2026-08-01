<div align="center">

# SymbolLattice

**可查詢、可說明、local-first 的程式碼情報**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.160.0 是開發者預覽版，尚未發布到 npm；請從原始碼執行。

SymbolLattice 會為專案建立可查詢的本機程式碼符號圖譜。每條關係都保留規則、解析階段與信心值，`exact`、`heuristic`、`unresolved` 證據絕不混用。

## 快速開始

需要 Node.js 22.13 以上、低於 25，以及 npm。

~~~bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；原始碼變更後再明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
~~~

在 Windows PowerShell，如無法使用 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.160.0

- Django `include(...)` 現可穿越正規 Python 套件中巢狀、最終單一名稱的 `__init__.py` URLConf 匯出鏈。
- 每條 exact 路由會將掛載模組、所有初始化檔與實際 `urlpatterns` 模組記入 `resolutionPath`，便於追溯。
- 缺失、競爭、重新綁定或動態值不會產生 exact 路由。

## 核心原則

- 索引與查詢都在本機執行；不會悄悄上傳原始碼。
- `init` 與 `sync` 是明確寫入動作；CLI 與 MCP 查詢維持唯讀。
- 關係必須有可重現的靜態證據；否則保留為未解析，而非猜測。

## 已知界線

- 跨檔 Python 路由目前支援 FastAPI `include_router`、Flask `register_blueprint`、Sanic `app.blueprint` 與 Django `include`；僅接受正規套件內單一前導點、單一名稱相對匯入，以及最終且未重新綁定的 `__init__.py` 匯出鏈。
- 動態組合、複製值、list／tuple 成員、初始化檔外的匯出、namespace package、父層相對匯入、class view、WebSocket、`add_route`、版本與其他註冊選項不會成為 exact 證據。
- 反射、執行期設定、依賴注入、巨集、生成程式碼與模糊名稱同樣不會被當成靜態證明。

## 驗證

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## 授權

[MIT](LICENSE)
