<div align="center">

# SymbolLattice

**可查詢、可解釋、證據優先的本地程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.215.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 會在本機建立可查詢的程式碼符號圖譜。每一條關係都保留規則、證據階段與信心值，嚴格區分 `exact`、`heuristic`、`unresolved`。

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

# 原始碼變更後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢服務
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料儲存在目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 找不到 npm 時，請改用 `npm.cmd`。

> [!NOTE]
> `init` 建立圖譜；原始碼變更後以 `sync` 更新。MCP 查詢不會寫入或重建圖譜。

## v0.215.0 重點

- Java 與 Kotlin 現可透過唯一、明確的直接 import，或同一 package 的唯一頂層型別，建立跨檔案 `extends`、`implements` 與介面繼承關係。
- 已證明的跨檔案直接父型別，會讓 Java `@Override` 與 Kotlin `override fun` 連到唯一同名父方法。
- 每條跨檔案關係保留來源位置、候選符號與 import／package 證據；`init` 與後續 `sync` 都會持久化這些原始事實。
- 萬用字元 import、Kotlin 別名、限定型別、巢狀型別、編譯器 classpath、歧義與間接祖先維持未解析，絕不推測。

## 範圍與保證

- 這是本地程式碼圖譜，不是 RDF／SPARQL 知識庫或本體推理系統。
- `exact` 關係來自持久化的靜態證據，不做執行期動態派發、完整型別檢查或全圖 PageRank 推論。
- 索引與查詢都在本機進行；即時檔案只用來判斷新鮮度，不會取代已索引的證據。

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
