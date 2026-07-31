<div align="center">

# SymbolLattice

**本機、證據優先的程式碼圖譜工具**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) · [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.115.0 為早期開發者版本，請從原始碼執行；npm 套件尚未發佈。

SymbolLattice 在本機建立可查詢的程式碼符號圖譜，並為每條關係保留來源規則、解析階段與信心資訊。索引只存放在受檢專案的 `.symbol-lattice/index.sqlite`，不會暗中上傳原始碼。

## 重點

- 從可證明的語法擷取檔案、符號、匯入／匯出、型別階層、路由、進入點與跨檔案關係。
- 只在證據充分時建立精確邊；模糊候選會保留為未解析或啟發式結果，不猜測執行期行為。
- 支援多種前端、後端、JVM、系統、資料、IaC、模板與 schema 語言；Rust 路由包含 Axum、Actix Web App/resource/scope builder 與 Rocket 的受限靜態掃描。
- 提供 CLI 與唯讀 MCP 查詢，支援符號、關係、路由、進入點、差異、影響範圍與索引狀態。

## 快速開始

需求：Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 初始化目標專案的本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢與明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動前景、唯讀 MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 `npm`，請改用 `npm.cmd`。檔案系統根目錄與家目錄預設會被拒絕，除非明確加入 `--force`。

## v0.115.0

- 新增 Rust Actix Web 的直接 `web::scope("/prefix")` 路由鏈：支援 scope 內 `.route(...)`、已掛載 resource 與巢狀 scope 的靜態 prefix 組合。
- 每條 scope 路由都保留專屬 framework evidence rule；未掛載／動態／shadow／wrapper／尾端斜線 scope 不會產生路由。
- 更新 artifact facts 版本；下一次明確 `sync` 或新的 `init` 會安全重建受影響的 Rust facts。

## 已知邊界

- 這不是編譯器、型別檢查器、framework runtime 或執行期追蹤器。
- 不會將動態派發、反射、巨集展開、程式碼產生、依賴注入或模糊名稱連結提升為精確關係。
- Actix Web 目前只接受直接匯入的屬性巨集，或連續 `App::new()` 中的 `.route(...)`／`.service(web::resource(...) | web::scope(...))` 靜態鏈。scope 只接受以 `/` 開頭且不帶尾端 `/` 的字面 prefix（根 `/` 除外），其內只接受 direct route、resource 或巢狀 scope；`configure`、attribute service 掛載、guard、wrapper、動態路徑及執行期組合留待後續版本。Rocket 目前僅支援直接匯入的 HTTP 屬性巨集。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
