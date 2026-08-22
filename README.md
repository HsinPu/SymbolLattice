<div align="center">

# SymbolLattice

**以證據優先、在地優先的程式碼圖與 AI Agent 限界程式碼脈絡工具**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.436.0 是從官方 GitHub 固定版本安裝的開發者預覽版。MCP 查詢工具為唯讀，但 `serve --mcp` 預設會啟動另一個本機自動同步 watcher；它可能更新專案的 `.SymbolLattice` 索引。加入 `--no-auto-sync` 可停用。

## 這是什麼

SymbolLattice 掃描本機 repository、保存程式碼圖，並以 CLI/MCP 提供檔案、symbol、呼叫、import、繼承、route、entry point、限界 impact path 與來源可追溯脈絡的查詢。每一條關係都有 source range、解析階段、信心程度與規則證據。

無法精確證明的關係會保留為 unresolved 或 pending，而不會成為錯誤的 exact edge。

前一版本 v0.429.0 強化 Python 深度掃描：在固定的官方 GitHub 來源 CPython 3.13.11（`627894459a84be3488a1789919679c997056a03c`）、Django 5.2.15（`21e98408f84d22191e2c7ee4052bdd12d264fd3f`）與 Home Assistant Core 2026.8.0（`4a9dce13f61d03960ad5d2710e2af9fd2a78af54`）上，extractor v324／resolver v156 對宣告、containment、relative import、bounded class instantiation、extends、call 與 async identity 建立可追溯的 exact 證據。凍結驗收子集達到 TP 300／FP 0／FN 0／evidenceInvalid 0，150／150 個負向案例通過；fresh、no-op、comment、semantic、rename、delete、restore、reopen 與 invalid-config 共 38 個生命週期操作通過。這是 bounded 靜態分析，不宣稱支援所有 Python runtime、reflection、dynamic dispatch 或任意 metaprogramming；無法唯一證明的關係會保留 unresolved／pending 或省略。

v0.431.0 強化 SQL／PostgreSQL structural depth。固定來源為 PostgreSQL `REL_17_5`（`5e2f3df49d4298c6097789364a5a53be172f6e85`）、Supabase PostgreSQL observed `develop`（`667e8c6a0d65c6f2a855b05a33f96cdc24453999`）與 Hasura v2.12.0 peeled commit（`2660015787a4de2aa52fe67e56fb90efc90148b8`）。在 extractor v327／resolver v157、未新增 parser dependency 的 structural-only v2 契約下，只宣稱完整、可界定的 `CREATE SCHEMA`／`CREATE TABLE` identity 與檔案 `contains`；postfix v4 達到 TP 300／FP 0／FN 0／evidenceInvalid 0、負向 150／150、targeted 16／16，lifecycle v8 的 14 個正式操作通過。這仍是 bounded 靜態 structural analysis；view、function、dependency、`search_path`、PL/pgSQL、dynamic SQL、runtime 與其他 SQL 方言均為 NONCLAIM，不代表完整 PostgreSQL 支援。

v0.432.0 強化 Shell（POSIX／Bash）structural depth。固定來源為 Git v2.50.1（`d82adb61ba2fd11d8f2587fca1b6bd7925ce4044`）、nvm v0.40.6（`b6cf55f6adf3b953d0e5e00a4049444e300e3af8`）與 Kubernetes v1.36.3（`0f29094e5b73085e3802ecc1298ecae13866bfe6`）。在 extractor v328／resolver v157 與版本化 `SL-SHELL-STRUCTURAL-v1.2.3` 契約下，核准 subset 達 TP 300／FP 0／FN 0／evidenceInvalid 0、負向 150／150、controls 4／4；生命週期涵蓋 fresh、no-op、comment、semantic、rename、delete、restore、reopen、invalid source／config 與資源壓力恢復。支援限於語法有效且有界的 direct top-level function identity 與檔案 `contains`；動態 dispatch、`export -f`、runtime 行為、跨語言關係與無法唯一證明的 Shell 語意均為 NONCLAIM。

v0.433.0 強化 Lua structural depth。固定 LuaRocks v3.13.0、Kong 3.9.3 與 Lua 5.5.1 來源；產品使用唯一 `web-tree-sitter@0.26.12` runtime 與保留的 `tree-sitter-lua` v0.5.0 WASM（SHA-256 `609f25f03773c8eaa3e94c504f360e770c49009ba9383b65be581b2d51774b71`）。核准 subset 為 grammar-defined direct-root named Lua functions 與檔案 `contains`，大型固定來源達 TP 300／FP 0／FN 0／evidenceInvalid 0，actual/generated negatives、controls 與 lifecycle gates 全部通過。`.luau` typed syntax、direct-call 語意、runtime dispatch、metatables、reflection、dynamic loading 與無法唯一證明的關係均為 NONCLAIM；官方 Lua 5.5 `luac` oracle 在本版仍未宣稱完整相容。

v0.434.0 強化 Luau structural depth。固定來源為官方 Luau 0.735（`367f9d83cc29804a6d5938ec85b6116d34d8743b`）、Lute `v1.0.1-nightly.20260822`（`ccd1edc563010fbab83c16d4476e6ed5be1ff1a3`）與 Fusion `v0.3-beta`（`77e603534ff4013f4049611826ff0309d6000b15`）。extractor v330 支援 bounded generic／optional／union／table／function type annotations、Luau if-expressions／interpolated strings、direct-root member methods 與 exported/local type aliases；核准 exact-singleton subset 達 TP 300／FP 0／FN 0／evidenceInvalid 0，150／150 個負向案例與 lifecycle gates 通過。全固定來源候選掃描另記錄 TP 3,752／FP 0／FN 1,412，unsupported breadth recall 0.727；這些未納入核准 subset 的語法保留為 unsupported，不宣稱完整 Luau coverage。runtime dispatch、Roblox engine semantics、metatables、reflection、dynamic require、cross-file／cross-language relationships 與 type inference／subtype compatibility 均為 NONCLAIM。

v0.435.0 強化 Julia structural depth。固定來源為 Julia `v1.12.7`（`6d172b025e4befc4d274d9fbc9339917a8a86b65`）、Pluto.jl `v1.0.3`（`4c726d24aa602eb6cba0636540ce3e8f7eb42dbb`）與 Flux.jl `v0.16.11`（`443ed1bc8c157168e4fe99a045f42014ae26def8`）。extractor v331 支援 bounded module／baremodule、struct／mutable struct、abstract／primitive type、完整與一行函式／qualified method identity，以及 file／module containment；核准 reviewed exact-singleton subset 達 TP 400／FP 0／FN 0／evidenceInvalid 0，150／150 個負向案例與 lifecycle gates 通過。全固定來源候選掃描另記錄 TP 18,292／FP 601／FN 5,204，unsupported breadth recall 0.779；候選 oracle 以獨立 masked-line truth 定義，未納入 reviewed subset 的語法仍保留為 unsupported，不宣稱完整 Julia coverage。macro／generated function、runtime multiple dispatch、reflection、metaprogramming、package loading、type inference／subtype compatibility 與跨檔 exact resolution 均為 NONCLAIM。

v0.436.0 強化 Perl structural depth。固定來源為 Perl `v5.45.2`（`6f488b9e12b015c5b1b2827a5621991e8bd30e04`）、Mojolicious `v9.49`（`c2d9f035556218c628dedae2e1075e115504a2a6`）與 Perl::Critic `v1.154`（`382d701fd1129822c98fdcdb08403a733a24dc08`）。extractor v332 支援 bounded package／class／role／named sub identity、forward declaration、prototype／attribute 宣告範圍與 file／package containment；核准 reviewed exact-singleton subset 達 TP 400／FP 0／FN 0／evidenceInvalid 0，150／150 個負向案例與 lifecycle gates 通過。全固定來源候選掃描另記錄 TP 5,013／FP 2,587／FN 6,923，unsupported breadth recall 0.420；候選 oracle 以獨立 masked-line truth 定義，未納入 reviewed subset 的語法仍保留為 unsupported，不宣稱完整 Perl coverage。eval／do／require、anonymous／nested sub、qualified method dispatch、runtime reflection、metaprogramming 與跨檔 exact resolution 均為 NONCLAIM。

## 支援的語言

目前可發現並建立索引的語言共 57 種。執行一次 `init` 或 `sync` 會掃描同一個 repository 內所有符合的語言，不需要逐一指定。下列清單代表可掃描與建立圖譜，不代表每種語言都有相同的解析深度；無法由靜態來源證明的動態關係會保留為 unresolved／pending 或直接省略。

| 類別 | 語言 |
| --- | --- |
| 最近完成大型專案深度驗證 | TypeScript、Java、HTML、CSS、JavaScript、JSP、Python、Ruby、Shell、Lua、Luau、Julia、Perl |
| Web、元件與模板 | ArkTS、Vue、Svelte、Astro、Razor、PHP、Blade、Liquid、Twig、CFML |
| JVM、.NET 與應用程式 | Groovy、Kotlin、Scala、C#、F#、VB.NET、Dart |
| 系統與原生語言 | C、C++、Objective-C、Rust、Go、Swift、Zig、Nim、Fortran、Ada、Pascal、COBOL |
| 腳本與資料處理 | Python、Ruby、Perl、Lua、Luau、R、Julia、Shell、SQL |
| 函數式與 BEAM | Elixir、Erlang、Clojure、Haskell、OCaml |
| 基礎設施、資料與結構描述 | Terraform／OpenTofu、Nix、YAML、XML、Java Properties、GraphQL、Protocol Buffers、Solidity |

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

v0.436.0 不提供舊名稱的 alias，也不會讀取舊索引。建議依序處理：

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

| 舊項目 | v0.436.0 |
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
