<div align="center">

# SymbolLattice

**可查詢、可解釋、證據優先的本機程式碼情報圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.213.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 會建立可查詢的本機程式碼符號圖譜。每條關係都保留規則、證據階段與信心值，並明確區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立第一份本機程式碼知識圖譜
node dist/cli/main.js init /path/to/project

# 查詢已持久化的圖譜證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 以有界且精確的拓撲證據重新排序
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking topology --json

# 原始碼變更後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料會存放在目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 找不到 npm 時，請使用 `npm.cmd`。

> [!NOTE]
> MCP 查詢不會建立或更新圖譜。預設的 `serve --mcp` 自動同步是主機擁有的背景監看；加上 `--no-auto-sync` 即可使用完全手動的 `init`／`sync` 流程。

## v0.213.0 重點

- `overrides` 現在也支援 Java 的標準 `@Override` 標記與 Kotlin 的 `override fun`。
- Java／Kotlin 僅在同一來源檔內，唯一的直接父類別與唯一同名方法都可證明時，才建立 `exact` 邊；跨檔、限定名稱與介面實作會保留為 `unresolved`，不猜測目標。
- `investigate --ranking topology` 持續把精確 `overrides` 納入拓撲關係，並在 `topologySignals` 顯示固定順序的關係計數。
- 既有索引請執行一次 `sync`，重新擷取來源事實並投影新的關係。

## 範圍與保證

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識庫或 ontology 推理系統。
- 拓撲排序只使用已持久化且 `exact` 的 `calls`、`references`、`routes`、`handles`、`imports`、`extends`、`implements`、`instantiates` 與 `overrides` 關係；它不是全圖 PageRank、執行期分析或動態派發推論。
- `overrides` 支援原生 TypeScript 的 `override`、Java 的標準 `@Override` 與 Kotlin 的 `override fun`。Java／Kotlin 的精確投影限於同檔、簡單名稱的直接父類別；不執行編譯器簽章檢查，也不推論存取子、mixins、間接祖先、介面派發或不唯一多載。
- 索引與查詢都在本機進行。即時檔案內容只用於判斷新鮮度，絕不取代已索引的證據。

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
