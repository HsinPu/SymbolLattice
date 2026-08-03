<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為先的本機程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.229.0 為開發者預覽版；請從原始碼執行。

SymbolLattice 將專案索引為本機程式碼符號圖譜。每條關係都保留規則、證據階段與信心值，並明確區分 `exact`、`heuristic`、`unresolved`。

## 快速開始

需使用 Node.js 22.13 以上、25 以下與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已索引的程式碼證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 原始碼或專案設定變動後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料存放在目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若無法使用 `npm`，請改用 `npm.cmd`。

## v0.229.0 重點

- Django Ninja 現可穿透最終 `__init__.py` Router re-export 鏈，例如 `from .catalog import router as public_router`，再由主 API 直接 `add_router` 掛載。
- 一般裝飾器與固定 `api_operation` 方法陣列都保留完整模組路徑及各自的 `exact` 證據；循環、競爭或重綁定的匯出會被拒絕。
- 持續提供多語言靜態符號、呼叫、匯入、路由與跨檔案關係查詢，且圖譜與查詢資料皆留在本機。

## 已知邊界

- 本版尚不推論絕對、父層或字串匯入的 Django Ninja Router、巢狀 Router、動態或非固定方法 `api_operation`、動態路徑、條件式或重綁定的 API/Router 實例。
- 此專案是程式碼圖譜，不是 RDF/SPARQL 知識庫，也不推論執行期動態派發、完整型別檢查或依賴注入選擇結果。
- `init` 建圖後，原始碼或設定變更需由使用者明確執行 `sync`；MCP 查詢不會寫入或重建圖譜。

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
