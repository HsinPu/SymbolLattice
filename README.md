<div align="center">

# SymbolLattice

**可查詢、可說明、證據優先的本機程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.214.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 將專案建立為可查詢的本機程式碼符號圖譜。每條關係都保留規則、證據階段與信心值，並明確區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、低於 25，及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已索引的程式碼證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 原始碼變更後明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢服務
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料會儲存在目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若無法執行 `npm`，請改用 `npm.cmd`。

> [!NOTE]
> 先以 `init` 建立圖譜；原始碼變更後使用 `sync`。MCP 查詢本身不會寫入或重建圖譜。

## v0.214.0 重點

- Java 會建立介面與抽象介面方法符號，並保留同檔案、唯一名稱可證明的 `implements` 與介面 `extends` 關係。
- Kotlin 會將同檔案直接超型別依目標類型投影為 `extends` 或 `implements`；介面繼承也保留為精確關係。
- Java `@Override` 與 Kotlin `override fun` 現在可連到直接父類別或介面中唯一的同名方法。
- 多個直接父型別出現同名方法、跨檔案、限定名稱、間接祖先與多載等情況一律維持 `unresolved`，不猜測目標。

## 範圍與保證

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識庫或本體推理系統。
- `exact` 關係來自持久化的靜態證據；不宣稱執行期動態派發、完整型別檢查或全圖 PageRank。
- 圖譜與查詢都在本機執行；即時檔案內容只用於新鮮度判定，不會取代已索引證據。

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
