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
> v0.108.0 為早期開發者版本。此儲存庫從原始碼執行；npm 套件維持私有，尚未發佈。

## 產品定位

SymbolLattice 在本機建立可查詢的程式碼符號圖譜，並保留每條關係的來源規則、解析階段與信心資訊。索引資料只寫入受檢專案的 `.symbol-lattice/index.sqlite`，不會暗中上傳原始碼。

授權：MIT。

## 核心功能

- 以語法可證明的檔案、符號、包含關係、匯入／匯出、型別階層、路由、進入點與跨檔案關係建立圖譜。
- 只在條件明確時建立精確邊；模糊候選保留為未解析或啟發式證據，不猜測執行期行為。
- 支援前端、後端、JVM、科學計算、系統語言、原生語言、資料格式、IaC、模板與 schema 檔案；包含 TypeScript、Java、Groovy、Fortran、Ada、Python、Go、Rust、C/C++、C#、PHP、Ruby、Kotlin、Swift、Dart、SQL、GraphQL、Protocol Buffers、Terraform、YAML、XML 等。
- 提供 CLI 與唯讀 MCP 查詢，可查看符號、關係、路由、進入點、版本歷史、差異、受影響測試、自動同步健康與有界診斷歷程。

## 快速開始

需求：Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 為一個專案建立本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已建立的圖譜
node dist/cli/main.js find add --project /path/to/project
node dist/cli/main.js explain-edge "edge:<edge-id>" --project /path/to/project

# 啟動 MCP：先補齊已過期索引，之後在背景自動保持新鮮
node dist/cli/main.js serve --mcp --project /path/to/project

# 從 MCP client 取得最近 8 筆 watcher 診斷事件
# symbol_lattice_auto_sync_diagnostics { "limit": 8 }
```

Windows PowerShell 若找不到 `npm`，請使用 `npm.cmd`。系統預設拒絕索引檔案系統根目錄或家目錄，除非明確指定 `--force`。

## v0.108.0 重點

- 新增 `symbol_lattice_auto_sync_diagnostics`：可取得預設 MCP host 的 live index observation、watcher 狀態與最新事件時間線。
- 時間線最多保留 32 筆已安全化的 receipt，可用 `limit` 取得最近事件；會回報保留數、已捨棄數與截斷狀態。
- 即使即時 `getStatus` 讀取失敗，診斷仍會回傳結構化錯誤與既有 watcher 歷程；它不會建立、索引或同步圖譜。

可用 `--sync-interval <ms>` 調整輪詢備援、`--poll` 關閉原生事件加速，或以 `--no-auto-sync` 關閉背景同步；此時 status 工具會回報 `disabled`。首次使用仍需先執行 `init`；手動 `sync` 適合修復或 CI。

## 明確限制

- 不是編譯器、完整語言 parser、型別檢查器、framework runtime 或執行期追蹤器。
- 不會把動態派發、反射、巨集、程式碼產生、依賴注入或模糊名稱連結當成精確關係。
- Groovy、Fortran 與 Ada 仍是保守初版：僅擷取完整直接單元，不推斷成員、跨檔案或執行期關係；遇到曖昧結構會略過。
- Koa、Hono 與 Elysia 初版只支援直接 receiver 路由；不推斷 prefix、掛載、巢狀 app、`basePath`／`group`／`use`／`route`／`on`、CommonJS、動態路徑或內嵌／成員處理器。
- 預設 MCP 背景同步只處理已初始化的專案，且不會改變已儲存的索引範圍；根目錄或家目錄仍需明確加上 `--force`。
- 自動同步狀態只描述目前預設 MCP host 的 watcher，不是跨程序 daemon、集中式工作佇列或效能監控系統。
- 診斷歷程只存在目前 MCP host 記憶體，重啟後會清空；它不是持久化 audit log 或跨客戶端共享時間線。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```
