<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為核心的本機程式碼智慧工具**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.234.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 將專案建立為本機程式碼符號圖譜。每一條關係都保留規則、證據階段與信心值，並明確區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、低於 25，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已索引的程式碼證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 原始碼或設定變動後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料存放在目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若無法執行 `npm`，請改用 `npm.cmd`。

## v0.234.0 重點

- Flask 現可精確追蹤專案根目錄的絕對 `Blueprint` 匯入，例如 `from app.routes.catalog import catalog as catalog_blueprint`，並保留完整模組路徑與 `exact` 證據。
- 跨檔 Flask、FastAPI 與 Django Ninja 路由都必須有唯一的本機目標與完整的 `__init__.py` 套件邊界；動態、外部與不完整套件匯入不會被投影為路由。
- 提供多語言靜態符號、呼叫、匯入、路由與跨檔關係查詢，所有圖譜與查詢資料維持在本機。

## 目前限制

- 不推論父層相對、字串或動態匯入；動態路徑；條件式建構；重新綁定的 API／Router／Blueprint 實例；或執行期動態派發。
- 這是程式碼圖譜，不是 RDF/SPARQL 知識庫；不進行完整型別檢查或依賴注入選擇。
- `init` 後，原始碼或設定變更需明確執行 `sync`；MCP 查詢不會寫入或重建圖譜。

## 驗證

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
git diff --check
```

## 授權

[MIT](LICENSE)
