<div align="center">

# SymbolLattice

**可查詢、可追溯、以證據為核心的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.236.0 是開發者預覽版，請從原始碼執行。

SymbolLattice 會將專案索引成留在本機的程式碼符號圖譜；每一條關係都保留規則、證據階段與信心值，嚴格區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已索引的程式碼證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 原始碼或設定改動後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料位於目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若找不到 `npm`，請使用 `npm.cmd`。

## v0.236.0 重點

- 支援同檔案 Flask-RESTful：可證明的 `Api(app)`、`Resource` 繼承與字面 `add_resource(...)` 會投影為精確的 HTTP 路由，並連到實際類別方法。
- 一次註冊多個字面端點時，會為每個支援的 `get`、`post`、`put`、`patch`、`delete`、`head`、`options`、`trace` 方法建立獨立且可解釋的關係。
- Flask、FastAPI 與 Django Ninja 的跨檔案解析仍要求完整套件邊界與唯一靜態目標；動態或重綁定的路由不會被誤報為精確結果。

## 目前限制

- 不推斷動態路徑、條件式建構、重綁定的 App／Api／Router／Blueprint／Resource 類別或方法，或執行期動態派發。
- 這是程式碼圖譜，不是 RDF/SPARQL 知識庫；不做完整型別檢查或依賴注入選擇。
- 執行 `init` 後，原始碼或設定變更須明確執行 `sync`；MCP 查詢不會寫入或重建圖譜。

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
