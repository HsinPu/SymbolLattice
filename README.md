<div align="center">

# SymbolLattice

**可查詢、可解釋、證據優先的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.216.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 將專案索引為本機程式碼符號圖譜。每一條關係都保留規則、證據階段與信心值，並嚴格區分 `exact`、`heuristic`、`unresolved`。

## 快速開始

需要 Node.js 22.13 以上且低於 25，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已索引的程式碼證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 原始碼改動後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 查詢服務
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引存於目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若找不到 npm，請改用 `npm.cmd`。

> [!NOTE]
> `init` 建立圖譜；原始碼改動後由使用者明確執行 `sync`。MCP 查詢本身不會寫入或重建圖譜。

## v0.216.0 重點

- Java 與 Kotlin 直接父型別現在可用具慣例小寫 package 前綴的完整路徑跨檔案連結，例如 `example.api.Contract`。
- 只有唯一、已索引的頂層型別才產生 `exact` 的 `extends` 或 `implements`；完整路徑找不到目標時，不會退回連到同名型別。
- 已證實的直接父型別可讓 Java `@Override` 與 Kotlin `override fun` 連到唯一的父方法。
- 明確 import、同 package 與完整路徑各自保留可審查的證據規則；別名、萬用字元、泛型、可能的巢狀型別與 compiler classpath 仍不猜測。

## 範圍與保證

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識庫或本體推論系統。
- `exact` 代表已保存的靜態證據，不等於執行期動態派發、完整型別檢查或全圖 PageRank。
- 索引與查詢都在本機進行；即時檔案內容只用來判定新鮮度，不會取代已索引的證據。

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
