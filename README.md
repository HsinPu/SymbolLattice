<div align="center">

# SymbolLattice

**以證據優先、在地優先的程式碼圖與 AI Agent 限界程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.426.0 是從官方 GitHub 固定版本安裝的開發者預覽版；SymbolLattice 尚未發布到 npm Registry。MCP 查詢工具為唯讀，但 `serve --mcp` 預設會啟動另一個本機自動同步 watcher；它可能更新專案的 `.SymbolLattice` 索引。加入 `--no-auto-sync` 可停用。

## 這是什麼

SymbolLattice 掃描本機 repository、保存程式碼圖，並以 CLI/MCP 提供檔案、symbol、呼叫、import、繼承、route、entry point、限界 impact path 與來源可追溯脈絡的查詢。每一條關係都有 source range、解析階段、信心程度與規則證據。

無法精確證明的關係會保留為 unresolved 或 pending，而不會成為錯誤的 exact edge。

v0.426.0 新增 `.css` 單檔深度掃描：保留 style rule、selector、At-rule、keyframes、自訂屬性、selector 分類與 declaration group，並只建立來源可證明的直接 containment。固定 Bootstrap v5.3.8 的 31 個官方範例 CSS，由獨立 PostCSS oracle 驗證 1,144 個 resources 與 1,144 個 containment，合計 TP 2,288／FP 0／FN 0；150 個 malformed 案例全部保守為 file-only。`var()` target、animation name、`@import` target、URL、HTML／JavaScript、cascade、CSS Modules、Sass／Less、Tailwind 與跨語言關係不會被猜成 exact。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/SymbolLattice.git
cd SymbolLattice
npm ci
npm run build

node dist/cli/main.js init /path/to/project
node dist/cli/main.js sync /path/to/project
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## 從 GitHub 安裝 CLI

需要 Git、Node.js `>=22.13 <25`、npm 與 Windows PowerShell 5.1 或 PowerShell 7。請先在 GitHub 選擇完整 40 字元 commit 或版本 tag，不接受 `main`、`HEAD` 或其他浮動 branch。

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

try {
    git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
    git -C $bootstrap fetch --depth 1 origin $ref
    git -C $bootstrap checkout --detach FETCH_HEAD

    # 先預覽；確認來源、npm prefix 與執行步驟，不會寫入
    & (Join-Path $bootstrap "install.ps1") -Ref $ref

    # 確認後才安裝到目前使用者的 npm global prefix
    & (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
}
finally {
    if (Test-Path -LiteralPath $bootstrap) {
        Remove-Item -LiteralPath $bootstrap -Recurse -Force
    }
}
```

來源安裝器會再次 Clone 固定 ref 到自己的唯一暫存 workspace，驗證 origin、commit、lockfile、type check、build、pack、隔離 CLI／MCP，再以可回復流程安裝全域 CLI。成功會清除該 workspace；失敗會回復全域安裝並保留診斷 workspace。它不修改 Codex 設定，也不建立專案索引。

安裝 CLI 後，在要使用的 repository 明確建立索引：

```powershell
cd C:\path\to\project
SymbolLattice init .
```

## 安裝到 Codex

Codex 安裝器同樣預設只顯示計畫，不會寫入：

```bash
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

它共同管理全域 `~/.codex/config.toml` 的 `mcp_servers.SymbolLattice` table，以及全域 `~/.codex/AGENTS.md` 中由 `SYMBOL_LATTICE_START`／`SYMBOL_LATTICE_END` 包住的區塊。既有檔案修改前會建立完整備份；任一檔案前置檢查或寫入失敗時，安裝會停止或回復已嘗試的變更。

移除時也先預覽，且只移除 SymbolLattice 自己管理的內容：

```bash
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

安裝器不會自動建立或刪除專案索引。安裝完成後，請重新啟動 Codex 或開啟新的 task，讓新的 MCP 設定生效。

## 從 v0.420.0 或更早版本升級

v0.426.0 不提供舊名稱的 alias，也不會讀取舊索引。建議依序處理：

```bash
# 仍可執行舊 CLI 時，先移除舊 Codex MCP 設定
symbol-lattice uninstall codex --apply --yes

# 移除舊 npm 套件，再依上方「從 GitHub 安裝 CLI」安裝固定版本
npm uninstall -g @hsinpu/symbol-lattice

# 安裝新 Codex 設定，並在每個專案建立新索引
SymbolLattice install codex --apply --yes
cd /path/to/project
SymbolLattice init .
SymbolLattice doctor codex
```

| 舊項目 | v0.426.0 |
| --- | --- |
| npm package | `@hsinpu/symbollattice` |
| CLI | `SymbolLattice` |
| Codex MCP entry | `mcp_servers.SymbolLattice` |
| MCP tools | `SymbolLattice_*` |
| 專案索引 | `.SymbolLattice` |

如果舊 CLI 已不存在，請先從 `~/.codex/config.toml` 手動移除舊 MCP table，再執行新安裝器。舊 `.symbol-lattice` 不會被自動刪除；先保留作回復用途，確認新 `.SymbolLattice` 查詢正常後再自行清理。

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# 完全停用背景索引更新
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP 查詢不會直接執行 `init` 或 `sync`。需控制索引時，請使用 CLI 的 `init`、`sync` 或 `watch`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` / `sync` | 建立或明確更新專案程式碼圖。 |
| `status` | 檢視 generation 與 freshness。 |
| `files` / `file` | 列出或讀取已保存的來源。 |
| `find` / `node` | 搜尋並檢視 symbol。 |
| `callers` / `callees` | 查詢靜態呼叫關係。 |
| `routes` / `entrypoints` | 檢視 framework route 與 entry point。 |
| `impact` / `affected` | 執行限界 impact analysis。 |
| `context` / `explore` | 取得供 Agent 使用的程式碼脈絡。 |
| `explain-edge` | 檢視一條 edge 的完整證據。 |

以 `node dist/cli/main.js <command> --help` 查詢所有選項。

## 限制

SymbolLattice 是靜態程式碼圖與程式碼 intelligence 工具；它不是完整 compiler、type checker、runtime tracer、RDF ontology 或通用推理引擎。dynamic dispatch、reflection、macro、code generation、dependency injection 與外部套件型別可能仍為 unresolved。

## 驗證

```bash
npm run check
npm test
npm run build
npm run verify:mcp-worker-generation
npm pack --dry-run
```

## 授權

[MIT](LICENSE)
