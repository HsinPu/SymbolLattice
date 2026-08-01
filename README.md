<div align="center">

# SymbolLattice

**可查詢、可追溯、本機優先的程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.161.0 是開發者預覽版，尚未發佈至 npm；請從原始碼執行。

SymbolLattice 為專案建立可查詢的本機程式碼符號圖譜。每條關係都保留規則、解析階段與信心值，並清楚區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、25 以下與 npm。

```bash
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
```

Windows PowerShell 若無法使用 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.161.0

- Django 現在可將 `path("api/", include("project.catalog.urls"))` 的靜態字串 URLConf 投影成精確子路由。
- 也支援字串指向 regular package 的 `__init__.py`，再經由最終 `urlpatterns` 匯出鏈抵達子 URLConf。
- 每條投影路由保留掛載模組、URLConf 匯出鏈與來源路由的 `resolutionPath` 證據。

## 核心原則

- 索引與查詢維持本機執行，不會悄悄上傳原始碼。
- `init` 與 `sync` 是明確寫入操作；CLI 與 MCP 的查詢不會自行掃描或更新圖譜。
- 只有可重現的靜態證據才會成為 `exact` 關係；其餘情況不猜測。

## 靜態分析邊界

- 跨檔 Python 路由目前涵蓋 FastAPI `include_router`、Flask `register_blueprint`、Sanic `app.blueprint` 與 Django `include`。
- Django 字串 include 僅接受單一、未逸出、點分隔的專案內 Python 模組名稱；目標必須唯一，且每個套件目錄都有 `__init__.py`。最終 `urlpatterns` 可經由 package initializer 匯出鏈解析。
- 動態組合、外部或 namespace package、父相對匯入、複製值、列表或 tuple 值、class view、WebSocket、`add_route`、版本化與模糊目標不會被標示為精確。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
