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
> v0.217.0 為開發預覽版。請由原始碼執行。

SymbolLattice 將專案索引為本機的程式碼符號圖譜。每條關係都保留規則、證據階段與信心值；`exact`、`heuristic`、`unresolved` 不會混為一談。

## 快速開始

需使用 Node.js 22.13 以上、25 以下及 npm。

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

# 啟動唯讀 MCP 查詢服務
node dist/cli/main.js serve --mcp --project /path/to/project
```

索引資料存於目標專案的 `.symbol-lattice/index.sqlite`。Windows PowerShell 若找不到 npm，請使用 `npm.cmd`。

> [!NOTE]
> 先用 `init` 建立圖譜；原始碼或專案設定變動後，明確執行 `sync`。MCP 查詢不會寫入或重建圖譜。

## v0.217.0 重點

- 掃描慣例式 Maven `pom.xml` 模組與 Gradle 的字面 `include` 模組，將 Java／Kotlin 的 `src/main`、`src/test` 來源保留為可審查的模組證據。
- 有 Maven／Gradle 證據時，沒有 import 或完整型別路徑的同 package 父型別只能在唯一且可見的同模組 source set 內產生 `exact` 關係；測試可引用同模組 main，main 不會連到 test。
- 明確 import 與完整型別路徑仍各自保有語法證據；本版不宣稱已解析 Maven／Gradle 相依性、compiler classpath 或自訂 Gradle `projectDir`。
- `pom.xml`、Gradle settings 與選定的 build 檔會納入索引輸入，設定異動可要求重新同步圖譜。

## 設計邊界

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識庫或本體推理系統。
- `exact` 來自持久化的靜態證據，不代表執行期動態派發、完整型別檢查或全圖 PageRank。
- 索引與查詢皆在本機進行；即時檔案內容僅用來判斷新鮮度，不會取代已索引的證據。

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
