<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為優先的本機程式碼智慧工具**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.211.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 會在本機建立可查詢的程式碼符號圖譜。每條關係均保留規則、證據階段與信心值，並嚴格區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立第一個程式碼知識圖譜
node dist/cli/main.js init /path/to/project

# 從持久化圖譜查詢關鍵字與結構脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 以受限、精確的拓撲關係重新排序結果
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking topology --json

# 原始碼改動後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引儲存在目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若無法直接使用 npm，請改用 `npm.cmd`。

> [!NOTE]
> MCP 查詢不會建立或更新圖譜。`serve --mcp` 的預設自動同步是主機擁有的背景監看行為；加上 `--no-auto-sync` 可改為完全手動的 `init`／`sync` 流程。

## v0.211.0 重點

- TypeScript 與 JavaScript 現在會將直接 `new ClassName()` 建立為 `instantiates` 關係。
- 只有本地、匯入或再匯出後能唯一證明的 `class` 目標會取得 `exact` 邊；函式建構式、未匯入同名類別、成員存取與動態建構式不會被猜測為精確關係。
- `investigate --ranking topology` 已納入精確 `instantiates` 邊，並在每個結果的 `topologySignals` 顯示固定順序的關係計數。
- 舊索引在執行一次 `sync` 後會重新擷取事實，以取得本版的新關係。

## 範圍與保證

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識庫或 ontology 推論系統。
- Topology 排名只使用受限、已持久化且 `exact` 的 `calls`、`references`、`routes`、`handles`、`imports`、`extends`、`implements` 與 `instantiates` 關係；它不是全圖 PageRank、執行期分析或動態派發推論。
- `instantiates` 目前只涵蓋原生 TypeScript／JavaScript 文件中的直接類別建構式；Astro endpoint 路由投影不受影響。
- 索引與查詢都留在本機；即時檔案內容只用於新鮮度判定，不會取代已索引證據。

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
