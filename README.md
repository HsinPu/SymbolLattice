<div align="center">

# SymbolLattice

**以證據為先的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.125.0 為開發者預覽版，尚未發布至 npm；請從原始碼執行。

SymbolLattice 會建立可查詢的本機程式碼符號圖譜。每一條關係都保留來源規則、解析階段與信心值；原始碼只保存在索引專案的 `.symbol-lattice/index.sqlite`，不會被靜默上傳。

## 重點

- 擷取 AST 可證明的檔案、符號、匯入／匯出、型別階層、路由、進入點與跨檔關係。
- 無法完整證明的結果會保留為 unresolved 或 heuristic，不會偽裝成 exact 關係。
- 支援前端、後端、JVM、系統、資料、IaC、模板與 schema 語言；Rust 包含保守的 Axum、Actix Web、Rocket 與 Cargo workspace 路由分析。
- 提供 CLI 與唯讀 MCP 查詢：符號、關係、路由、進入點、影響範圍、歷程、差異與索引狀態。

## 快速開始

需求：Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢；來源變動後才明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動前景、唯讀的 MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若沒有 `npm` 指令，請改用 `npm.cmd`。檔案系統根目錄與使用者家目錄需要明確加上 `--force` 才會接受。

## v0.125.0

- GoFrame v1/v2 現可精確投影 `Group.Map(g.Map{...})`：每個 key 必須是明確 HTTP method 與字面路徑，value 則須為同檔唯一的套件函式或支援的本地物件方法。
- `Group.ALLMap(g.Map{...})` 現會將字面路徑投影為 `ALL` 路由，包含靜態群組與已證明的 callback 群組前綴。
- 擷取器版本升為 `multi-language-ast-v107`；下一次明確 `sync` 會重新擷取既有來源。

## 明確限制

- 這不是編譯器、型別檢查器、框架 runtime 或執行追蹤器。
- 動態派發、反射、巨集展開、程式碼產生、依賴注入與模糊名稱不會成為 exact 圖譜關係。
- GoFrame batch 僅接受直接 `g.Map` 字面量；raw map、動態 key/value、inline handler、部分 batch、動態 receiver、factory/wrapper/rebound object、跨檔 controller/request join、多 method tag 與 domain rule 都維持未解析。
- 其他框架僅涵蓋已實作且可驗證的切片；完整歷程與相容性請見 [CHANGELOG.md](CHANGELOG.md)。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
