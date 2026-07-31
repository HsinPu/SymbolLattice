<div align="center">

# SymbolLattice

**證據優先的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) · [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.120.0 為開發中版本；套件尚未發布至 npm，請從原始碼執行。

SymbolLattice 為本機專案建立可查詢的程式碼符號圖譜。每條關係都保留來源規則、解析階段與信心度；來源碼只存於被索引專案的 `.symbol-lattice/index.sqlite`，不會被靜默上傳。

## 重點

- 以 AST 與明確證據擷取檔案、符號、匯入/匯出、型別階層、路由、入口點與跨檔關係。
- 無法唯一證明的關係維持 unresolved 或 heuristic，不把猜測標示為 exact。
- 支援前端、後端、JVM、系統、資料、IaC、模板與 schema 語言；Rust 包含保守的 Axum、Actix Web、Rocket 與 Cargo workspace 路由分析。
- 提供 CLI 與唯讀 MCP 查詢：符號、關係、路由、入口點、影響範圍、歷史、差異與索引狀態。

## 快速開始

需求：Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢；需要更新時明確執行 sync
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動前景、唯讀的 MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 `npm`，請改用 `npm.cmd`。檔案系統根目錄與家目錄預設會被拒絕，只有明確使用 `--force` 才可覆寫。

## v0.120.0

- Actix Web 現可從 Cargo workspace 的另一個 crate 投影 `ServiceConfig`，例如 `use api_routes::routes::configure`。
- 必須同時證明 literal workspace member、目標 crate 的 `Cargo.toml`、掛載 crate 的直接 `[dependencies]` inline `path` 依賴，以及目標 `src/lib.rs` 的每個直接 `mod` hop；支援 package alias。
- 投影 edge 會保留三份 manifest 的設定證據與「掛載檔 → `lib.rs` → callback 模組」解析鏈；缺少任一證據時不投影，也不抑制原始 attribute route。

## 有意限制

- 這不是編譯器、型別檢查器、框架 runtime 或執行追蹤器。
- 動態派發、反射、巨集展開、程式碼產生、依賴注入與模糊名稱不會成為 exact 關係。
- Actix Web 跨檔 `ServiceConfig` 目前只接受 `main.rs`／`lib.rs` 的一或兩層直接外部模組；workspace crate 僅支援 literal `members`、root package 或明確 member，以及 `[dependencies]` 的 inline `path` 依賴。glob member、`workspace = true`、registry／transitive／dev／build 依賴、re-export、`#[path]`、inline module、超過兩層的路徑、closure、wrapper、動態 callback 或路徑皆不投影。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
