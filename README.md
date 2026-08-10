<div align="center">

# SymbolLattice

**證據優先、本機優先的程式碼圖譜與 AI 程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.363.0 是開發預覽版。MCP 查詢工具本身唯讀；`serve --mcp` 預設會另外啟動本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用自動同步。

## 專案用途

SymbolLattice 掃描本機 repository、建立可持久化的程式碼圖譜，並透過 CLI／MCP 查詢：

- 檔案、symbol、call、import、inheritance、route 與 entrypoint。
- callers、callees、impact、affected、context 與跨檔案 explore。
- 每條關係的來源範圍、解析階段、信心度與規則證據。

無法精確證明的關係會保留為 unresolved／pending，不會為了提高表面支援率而產生錯誤 exact edge。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立本機圖譜
node dist/cli/main.js init /path/to/project

# 更新圖譜
node dist/cli/main.js sync /path/to/project

# 基本查詢
node dist/cli/main.js files --project /path/to/project --json
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js callees createOrder --project /path/to/project --json
node dist/cli/main.js routes --project /path/to/project --json

# 讓 Agent 取得有界的跨檔案脈絡
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## v0.363.0 可用性快照

可重跑的 smoke matrix 會從正式語言與框架 registry 核對測試案例，而不是依 README 宣稱支援。

- 54 個正式語言皆可完成 `init`、no-op `sync`、changed `sync`、檔案與完整 identity symbol 查詢，並全數通過 B1 關係驗收。
- 54 種語言皆已有至少一種非純 `contains` 的可靠行為或依賴關係，完成第一輪 B1 深度對齊。
- Ruby 以 Rails literal route 到 controller method、Shell 以頂層 `export -f` function reference、SQL 以 bounded view-to-table reference 完成深度對齊。
- Astro 與 Razor 驗證元件到靜態頁面路由。
- Terraform 可驗證 output 到同檔唯一 resource traversal；GraphQL 可驗證 type 到單一 interface implementation；Proto 可驗證 RPC 到同檔唯一 request／response message。
- SQL 以精確檔案檢視驗證 bounded view-to-table reference；上述 schema／IaC 關係不宣稱完整 dialect、schema validation、plan/apply 或 runtime linkage。
- 57 條 required relation 全部驗證正確 endpoints、`resolution: exact`、`confidence: 1` 與包含 selected target 的 candidate evidence，benchmark 會保存完整證據收據。
- 檔案依賴查詢會回傳具體 exact import／export edges；Nix 與 Python 不再只靠 aggregate `edgeKinds` 取得 B1。
- Capability 發版閘門會阻擋任何語言 partial、scan-only 或 unavailable；框架案例仍可誠實保留 partial 診斷。
- Groovy 可驗證同檔唯一直接類別繼承；CFML 可驗證結構隔離 `.cfc` 的 remote entrypoint 到 handler。兩者的動態一般呼叫仍保守不產生 exact edge。
- React Router、Next.js、Vue Router、SvelteKit、Astro、Spring Web、FastAPI、Django 與 ASP.NET Core 的代表案例可建立預期 route。
- Nuxt 可掃描與查詢 Vue 檔案，但目前沒有專用 Nuxt route capability。

B1 深度對齊要求語言具備非純檔案包含的可靠關係；不代表 54 種語言已具有相同的跨檔案與框架深度。

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# 完全停用背景索引更新
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP 查詢不直接執行 `init` 或 `sync`。需要手動控制索引時，請使用 CLI 的 `init`、`sync`、`watch` 或經明確核准的 watcher 流程。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` | 建立專案圖譜。 |
| `sync` | 明確同步索引。 |
| `status` | 檢查 generation 與 freshness。 |
| `files`／`file` | 列出或閱讀已保存的來源檔。 |
| `find`／`node` | 尋找並查看 symbol。 |
| `callers`／`callees` | 查詢靜態呼叫關係。 |
| `routes`／`entrypoints` | 查看框架路由與入口。 |
| `impact`／`affected` | 進行有界影響分析。 |
| `context`／`explore` | 取得適合 Agent 使用的程式碼脈絡。 |
| `explain-edge` | 查看一條關係的完整證據。 |

使用 `node dist/cli/main.js <command> --help` 查看完整選項。

## 限制

SymbolLattice 是靜態 code graph／code intelligence 工具，不是完整編譯器、型別檢查器、runtime tracer、RDF ontology 或通用推理系統。動態 dispatch、reflection、macro、code generation、dependency injection 與外部套件型別可能保持 unresolved。

## 驗證

```bash
npm run check
npm test
npm run build
npm run benchmark:capabilities
npm run verify:mcp-worker-generation
npm run benchmark:mcp
npm run benchmark:comparison
npm pack --dry-run
```

## 授權

[MIT](LICENSE)
