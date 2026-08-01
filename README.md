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
> v0.129.0 是開發者預覽版，尚未發布到 npm；請從原始碼執行。

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

## v0.129.0

- GoFrame v1/v2 現可跨同一個已證明的 Go package 目錄，精確連結分散檔案中的 `g.Meta`、Controller 方法與 `Bind(&Controller{})`；保留 Group 前綴與 `Server.Domain(...)` host 證據。
- 新增的原始 facts 會保存到 SQLite，無關檔案變更後的增量 `sync` 仍可重用原本的 Go 檔案並重建同一條路由。
- 萃取器升級為 `multi-language-ast-v111`，專案解析器升級為 `project-resolver-v33`；下次明確 `sync` 會重建未變動原始碼的 facts。

## 已知限制

- 這不是編譯器、型別檢查器、框架 runtime 或執行期追蹤器。
- 動態派發、反射、巨集展開、程式碼產生、依賴注入與歧義名稱不會成為 `exact` 關係。
- GoFrame Domain 僅接受可證明的字面量、非萬用字元 host；動態值、空白項目、萬用字元與重綁定 receiver 保持未解析。
- GoFrame 跨檔 standard router 僅支援同一資料夾且 package 名稱相同的唯一對應；跨 package import、build tag、限定型別與歧義 Controller 方法保持未解析。
- 其他框架只涵蓋已實作且可驗證的切片；完整變更請見 [CHANGELOG.md](CHANGELOG.md)。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
