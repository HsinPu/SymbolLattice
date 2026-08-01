<div align="center">

# SymbolLattice

**可查詢、可解釋、以本機為先的程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.163.0 是開發者預覽版，尚未發佈到 npm；請由原始碼執行。

SymbolLattice 為專案建立可查詢的本機程式碼符號圖譜。每一條關係都保留規則、解析階段與信心值，並嚴格區分 `exact`、`heuristic` 與 `unresolved` 證據。

## 快速開始

需要 Node.js 22.13 以上、低於 25，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；原始碼變更後由使用者明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若無法使用 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.163.0

- 新增 Django `re_path(prefix, include(...))` 的跨檔 URLConf 投影，支援相對匯入、字串 URLConf 與 package initializer re-export。
- 僅接受開頭 `^`、沒有結尾 `$`、且以 `/` 結束的純靜態前綴，例如 `r"^api/"`；投影邊會保留 `re_path` 專屬證據規則。
- 捕捉群組、萬用字元、逸出字元、缺少錨點、非斜線結尾、動態值與重綁定都不會被猜測為精確掛載。

## 核心原則

- 索引與查詢都在本機執行，原始碼不會被悄悄上傳。
- `init` 與 `sync` 是明確寫入動作；CLI 與 MCP 查詢保持唯讀，不會自行更新圖譜。
- 關係需要可重現的靜態證據；否則保留為未解析，而非推測。

## 靜態分析邊界

- 跨檔 Python 路由目前涵蓋 FastAPI `include_router`、Flask `register_blueprint`、Sanic `app.blueprint` 與 Django `path(..., include(...))`、受限 `re_path(..., include(...))`。
- Django 直接 `re_path` 僅接受單一路徑可完整比對的字面 pattern；跨檔 `re_path` 則僅接受可組合子路由的純靜態前綴。一般正規表示式語意不會產生 `exact` 結果。
- 動態組合、外部或 namespace 套件、父層相對匯入、複製值、列表或 tuple、class view、WebSocket、`add_route`、版本化與模糊目標都不會被標示為精確。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
