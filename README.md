<div align="center">

# SymbolLattice

**以證據為先的本機程式碼智慧平台**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) · [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.117.0 為早期開發者版本，請從原始碼執行；npm 套件尚未發佈。

SymbolLattice 在本機建立可查詢的程式碼符號圖譜，並保留每一條關係的來源規則、解析階段與信心值。索引儲存在受檢專案的 `.symbol-lattice/index.sqlite`，不會靜默上傳原始碼。

## 重點

- 擷取可由語法證實的檔案、符號、匯入／匯出、型別階層、路由、進入點與跨檔關係。
- 證據不足時保留未解析或啟發式結果，不把猜測偽裝成精確關係。
- 支援前後端、JVM、系統、資料、IaC、模板與 schema 語言；Rust 支援保守的 Axum、Actix Web 與 Rocket 路由擷取。
- 提供 CLI 與唯讀 MCP 查詢，可查符號、關係、路由、進入點、差異、影響範圍與索引狀態。

## 快速開始

需求：Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 初始化專案的本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢，並在需要時明確同步來源變更
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動前景、唯讀的 MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 `npm`，請使用 `npm.cmd`。檔案系統根目錄與家目錄預設會被拒絕，只有明確指定 `--force` 才能放行。

## v0.117.0

- Rust Actix Web 可透過同檔案的 `App::configure(config)` 與 `web::scope(...).configure(config)`，投影 `ServiceConfig` 內路由的有效路徑；支援直接或別名匯入的 `&mut ServiceConfig` 型別。
- callback 支援字面路徑的 `cfg.route(...)`、掛載 resource、scope、attribute service，以及具名巢狀 `cfg.configure(...)`；handler 只在 callback 自己的詞彙作用域中解析。
- artifact facts 版本已更新；下一次明確執行 `sync` 或重新 `init` 會安全重擷取受影響的 Rust facts。

## 明確界線

- 這不是編譯器、型別檢查器、框架執行期或執行追蹤器。
- 動態派發、反射、巨集展開、程式碼生成、依賴注入與模糊名稱匹配，不會成為精確圖譜關係。
- Actix Web 僅接受直接匯入的 HTTP attribute macro，以及連續的 `App::new()` 靜態 `.route(...)`／`.service(...)`／`.configure(...)` 鏈。`ServiceConfig` 必須是同檔案、唯一、具名且型別可證實的 callback；closure、跨檔或 namespace handler、guard、wrapper、動態 callback／路徑與執行期組合仍保守地不推導。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
