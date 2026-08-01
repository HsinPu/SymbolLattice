<div align="center">

# SymbolLattice

**證據優先、可查詢的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.136.0 是開發者預覽版，尚未發布到 npm；請從原始碼執行。

SymbolLattice 為專案建立可查詢的本機程式碼符號圖譜。每條關係都保留來源規則、解析階段與信心值；原始碼僅保存於受索引專案的 `.symbol-lattice/index.sqlite`，不會被靜默上傳。

## 重點

- 從 AST 建立檔案、符號、匯入/匯出、型別階層、路由、進入點與跨檔案關係。
- 不把模糊資訊偽裝為精確結果：關係明確標示為 `exact`、`heuristic` 或 `unresolved`。
- 支援前端、後端、JVM、系統、資料、IaC、樣板與 schema 語言，並提供受限、可稽核的框架路由解析。
- 提供 CLI 與唯讀 MCP 查詢：符號、關係、路由、進入點、影響範圍、歷程、差異與索引狀態。

## 快速開始

需求：Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；原始碼變更後才明確執行 sync
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js routes --project /path/to/project --domain api.example.test
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若沒有 `npm` 指令，請改用 `npm.cmd`。檔案系統根目錄與使用者家目錄需要明確加上 `--force` 才會接受。

## v0.136.0

- GoFrame v1/v2 現會逐一處理同一次 variadic `Bind(...)` 的可證明 argument：`&Controller{}`、`Factory()` 與既有支援的一層 factory alias 都會各自投影成保留 `Group` 前綴與 `Domain` host 的 `exact` route。
- 無法靜態證明的 argument 不會被升格為 exact，也不會阻擋同一批次中已證明 controller 的路由。
- artifact facts 升級為 `multi-language-ast-v117`；下次明確 `sync` 會重新萃取 Go facts 並重投影路由。

## 已知限制

- 這不是編譯器、型別檢查器、框架 runtime 或執行期追蹤器。
- 動態派發、反射、巨集展開、程式碼產生、依賴注入與歧義名稱不會成為 `exact` 關係。
- GoFrame Domain 僅接受可證明的字面量、非萬用字元 host；動態值、空白項目、萬用字元與重綁定 receiver 保持未解析。
- GoFrame 鏈式 receiver 僅支援 `g.Server()` 起點與有限的字面量 `Domain`／單參數 `Group` 鏈；任意方法鏈、動態前綴、變數傳遞與不受支援的 callback 形狀不會成為精確關係。
- GoFrame 跨檔 standard router 支援同一次 `Bind(...)` 中一個或多個直接 `&Controller{}`、已證明的 `Factory()`，以及一層 `alias := Factory(); Bind(alias)`。factory 必須無參數、宣告本機 `*Controller` 回傳型別，並直接回傳同型別指標；alias 只能是未重綁的短宣告。每個 argument 必須獨立符合證明條件；slice 展開、動態值與未證明 argument 不會成為 exact。顯式 alias 可直接使用，預設 import 必須由目標 `package` 宣告證明 qualifier，不能從 import 路徑猜測。`.`／`_` import、外部/傳遞模組、`replace`、巢狀模組選擇、build tag、依賴注入、轉送呼叫、分支或歧義 Controller 方法不會成為精確關係。
- 未綁定的 GoFrame request-signature 候選永遠是 `heuristic`，不代表 runtime 已註冊路由；反射、動態 Bind 與未知 prefix／host 維持未解析。
- 其他框架只涵蓋已實作且可驗證的切片；完整變更請見 [CHANGELOG.md](CHANGELOG.md)。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
