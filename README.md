<div align="center">

# SymbolLattice

**以證據優先的本機程式碼圖，為開發者與 AI Agent 提供可追溯的程式碼脈絡。**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

SymbolLattice 掃描本機 repository，將檔案、symbol 與靜態關係保存為可查詢的程式碼圖，並透過 CLI 與 MCP 提供搜尋、呼叫關係、route、entry point、影響分析與來源脈絡。

每條關係都帶有來源範圍、解析階段、信心程度與規則證據。無法可靠證明的關係會保留為 unresolved／pending 或省略，不會為了提高覆蓋率製造錯誤的 exact edge。

目前版本：v0.437.0

## 主要能力

- 在同一個 repository 掃描多種程式語言與常見 framework。
- 查詢 symbol、callers、callees、inheritance、imports、routes 與 entry points。
- 以 `impact`、`affected` 與 Git hunk 資訊協助評估修改範圍。
- 產生有界、附來源的 Agent context 與 `explore` 結果。
- 保存 generation，支援增量同步、history 與 diff。
- 以 CLI 或唯讀 MCP query handlers 使用。

> [!IMPORTANT]
> MCP 查詢本身是唯讀的，但 `serve --mcp` 預設可啟動本機自動同步並更新 `.SymbolLattice` 索引。需要完全停用背景更新時，加入 `--no-auto-sync`。

## 支援範圍

SymbolLattice 可在單次 `init` 或 `sync` 中處理多語言 repository。不同語言的解析深度並不相同；無法由靜態來源唯一證明的 runtime 或動態關係不會宣稱為 exact。

| 類別 | 語言與格式 |
| --- | --- |
| 已完成大型專案深度驗證 | TypeScript、Java、HTML、CSS、JavaScript、JSP、Python、Ruby、Shell、Lua、Luau、Julia、Perl、R |
| Web 與模板 | ArkTS、Vue、Svelte、Astro、Razor、PHP、Blade、Liquid、Twig、CFML |
| JVM、.NET 與應用程式 | Groovy、Kotlin、Scala、C#、F#、VB.NET、Dart |
| 系統與原生語言 | C、C++、Objective-C、Rust、Go、Swift、Zig、Nim、Fortran、Ada、Pascal、COBOL |
| 資料、設定與 schema | SQL、GraphQL、Protocol Buffers、Terraform/OpenTofu、Nix、YAML、XML、Java Properties、Solidity |
| Functional 與 BEAM | Elixir、Erlang、Clojure、Haskell、OCaml |

## 安裝 CLI

需要 Git、Node.js `>=22.13 <25`、npm，以及 Windows PowerShell 5.1 或 PowerShell 7。

SymbolLattice 尚未從 npm Registry 發布。請使用官方 GitHub repository 的完整 40 字元 commit，或可用的版本 tag；安裝器不接受 `main`、`HEAD` 等浮動 ref。

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

try {
    git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
    git -C $bootstrap fetch --depth 1 origin $ref
    git -C $bootstrap checkout --detach FETCH_HEAD

    # 先預覽，不會安裝或修改 Codex
    & (Join-Path $bootstrap "install.ps1") -Ref $ref

    # 確認後安裝到目前使用者的 npm global prefix
    & (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
}
finally {
    if (Test-Path -LiteralPath $bootstrap) {
        Remove-Item -LiteralPath $bootstrap -Recurse -Force
    }
}
```

來源安裝器會驗證固定來源、lockfile、type check、build、npm package、隔離 CLI 與 MCP，並以可回復流程安裝全域 CLI。它不會修改 Codex 設定，也不會建立專案索引。

## 快速開始

在要查詢的 repository 明確建立索引：

```powershell
cd C:\path\to\project
SymbolLattice init .

SymbolLattice status .
SymbolLattice find createOrder --project . --json
SymbolLattice explore "Trace createOrder to persistence" --project . --json
```

檔案變更後可明確同步：

```powershell
SymbolLattice sync .
```

## 安裝到 Codex

Codex 安裝流程預設只產生預覽：

```powershell
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

它只管理全域 `~/.codex/config.toml` 中的 `mcp_servers.SymbolLattice`，以及 `~/.codex/AGENTS.md` 中由 `SYMBOL_LATTICE_START`／`SYMBOL_LATTICE_END` 包住的區塊。寫入前會建立備份；它不會自動建立或刪除任何專案索引。

設定完成後，請重新啟動 Codex 或開啟新的 task。移除整合時同樣先預覽：

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` / `sync` | 建立或明確更新程式碼圖。 |
| `status` / `history` / `diff` | 檢查 freshness 與 generation 變化。 |
| `files` / `file` | 列出或讀取已保存的來源。 |
| `find` / `node` / `search` | 搜尋並檢視 symbol 或來源。 |
| `callers` / `callees` / `hierarchy` | 查詢靜態關係。 |
| `routes` / `entrypoints` | 檢視 framework 入口。 |
| `impact` / `affected` / `git-hunks` | 評估修改影響。 |
| `context` / `explore` / `investigate` | 取得附來源的 Agent 脈絡。 |
| `explain-edge` | 檢視一條 edge 的完整證據。 |
| `serve --mcp` | 啟動 MCP stdio server。 |

使用 `SymbolLattice <command> --help` 查看完整選項。

## MCP 與同步

```powershell
SymbolLattice serve --mcp --project C:\path\to\project

# 停用背景索引更新
SymbolLattice serve --mcp --project C:\path\to\project --no-auto-sync
```

MCP query handlers 不會直接執行 `init`。索引的建立、手動同步與 watcher lifecycle 仍由 CLI 明確控制。

## 限制

SymbolLattice 是靜態程式碼圖與 code-intelligence 工具，不是完整 compiler、type checker、runtime tracer、RDF ontology 或通用推理引擎。dynamic dispatch、reflection、macro、code generation、dependency injection、metaprogramming 與外部套件型別可能保持 unresolved、pending 或不輸出。

## 從 v0.420.0 或更早版本升級

舊名稱與舊索引不會自動遷移或刪除。請先保留可回復副本，再依序執行：

```powershell
symbol-lattice uninstall codex --apply --yes
npm uninstall -g @hsinpu/symbol-lattice

# 依上方 GitHub 固定 ref 流程安裝新 CLI
SymbolLattice install codex --apply --yes
cd C:\path\to\project
SymbolLattice init .
```

確認新 CLI、Codex MCP 與 `.SymbolLattice` 索引正常後，再自行清理舊資料。

## 開發與驗證

```bash
git clone https://github.com/HsinPu/SymbolLattice.git
cd SymbolLattice
npm ci
npm run check
npm test
npm run build
npm run verify:mcp-worker-generation
npm pack --dry-run
```

## 授權

[MIT](LICENSE)
