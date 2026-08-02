<div align="center">

# SymbolLattice

**可查詢、可解釋、本機優先的程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.183.0 是開發者預覽版，尚未發佈至 npm；請由原始碼執行。

SymbolLattice 會在專案本機建立可查詢的程式碼符號圖譜。每條關係都保留規則、解析階段與信心值，並明確區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 查詢唯讀；原始碼變更後再明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 `npm`，請改用 `npm.cmd`。索引資料會留在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.183.0 重點

- Spring Web 現可在 Java 與 Kotlin 的直接具體處理函式上辨識 `@RequestMapping(method = …)`；支援 GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS、TRACE。
- `@RequestMapping`、`RequestMethod` 與控制器註解都必須是精確直接 import 或完整 Spring 名稱。路徑只能省略、或是單一 `path =`／`value =` 純字串，並會與類別前綴正規化合併。
- 每條路由都以 `exact` 證據連到本地處理函式；多 method、條件屬性、動態路徑、別名／萬用字元 import、預設 ALL mapping 與執行期路由都會保守排除。

## 設計原則

- 索引與查詢都在本機；來源碼不會被靜默上傳。
- `init` 與 `sync` 是明確寫入；CLI 與 MCP 查詢一律唯讀。
- 沒有可重現的靜態證據時，關係會保留為 unresolved，不會猜測。

## 分析邊界

- Spring Web 支援直接頂層具體 Java/Kotlin 控制器、字面 HTTP shortcut 註解，以及一個可證明 `RequestMethod` enum 的方法層級 `@RequestMapping`；不推論預設 ALL、多 method、條件、代理、巢狀宣告或執行期路由。
- Spring `@ConfigurationProperties` 支援直接 Java/Kotlin 類別、直接頂層 Java `record`，以及直接 `@Configuration` 類別內具體 Java/Kotlin `@Bean` 成員。
- factory-method 路徑不推論執行期 bean 註冊或綁定結果；巢狀類別、Kotlin `object` factory、抽象／介面／頂層函式、別名或萬用字元 import、`value =`、多屬性、動態前綴、profile、優先序與環境覆寫均不分析。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
