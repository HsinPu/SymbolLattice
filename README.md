# SymbolLattice

以來源證據建立本機程式碼關係圖，協助開發者與 AI Agent 搜尋程式、追蹤呼叫與評估修改影響。

繁體中文 | [English](README.en.md)

目前版本：**v0.520.3** · Node.js **>=22.13 <25** · [MIT](LICENSE)

## 能做什麼

SymbolLattice 掃描 repository，把檔案、符號與靜態關係保存在 `.SymbolLattice/index.sqlite`，透過 CLI 與 MCP 提供查詢。

- 搜尋符號與來源，查看 callers、callees、繼承、imports、routes 與 entry points。
- 使用 `impact`、`affected` 與 Git hunk 資訊評估修改範圍。
- 使用 `explore`、`context` 與 `investigate` 取得附來源的程式碼脈絡。
- 增量同步索引，透過 generation history 與 diff 比較變化。

關係帶有來源範圍、解析階段與規則證據。無法可靠證明的關係會保留為 unresolved／pending 或省略。這是靜態分析工具；動態 dispatch、reflection、macro、code generation 與外部套件型別可能無法解析。

## 安裝

需要 Git、Node.js `>=22.13 <25`、npm，以及 Windows PowerShell 5.1 或 PowerShell 7。

目前未發布至 npm Registry。請使用官方 GitHub repository 的完整 40 字元 commit，或已存在的 `vX.Y.Z` tag；安裝器不接受 `main`、`HEAD` 等浮動 ref。

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
if ($LASTEXITCODE -ne 0) { throw "Clone failed" }
git -C $bootstrap fetch --depth 1 origin $ref
if ($LASTEXITCODE -ne 0) { throw "Fetch failed" }
git -C $bootstrap checkout --detach FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Checkout failed" }

# 預覽安裝計畫
& (Join-Path $bootstrap "install.ps1") -Ref $ref

# 確認預覽後，安裝到目前使用者的 npm global prefix
& (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
```

完成後可刪除 `$bootstrap` 指向的暫存 checkout。安裝器會驗證固定來源、lockfile、型別檢查、建置、套件及隔離 CLI／MCP，並提供安裝失敗時的回復流程。安裝 CLI 不會修改 Codex 設定或建立專案索引。

## 快速開始

在要分析的 repository 根目錄執行：

```powershell
SymbolLattice init .
SymbolLattice status .
SymbolLattice find createOrder --project . --json
SymbolLattice explore "Trace createOrder to persistence" --project . --json

# 原始碼修改後更新索引
SymbolLattice sync .
```

| 指令 | 用途 |
| --- | --- |
| `init` / `sync` | 建立或更新索引。 |
| `status` / `history` / `diff` | 查看索引 freshness 與 generation 變化。 |
| `files` / `file` / `find` / `node` / `search` | 列出檔案、讀取已保存來源、搜尋符號。 |
| `callers` / `callees` / `hierarchy` | 追蹤呼叫與繼承關係。 |
| `routes` / `entrypoints` | 查看 framework 入口。 |
| `impact` / `affected` / `git-hunks` | 分析修改影響。 |
| `context` / `explore` / `investigate` | 取得附來源的 Agent 脈絡。 |
| `explain-edge` | 查看關係證據。 |
| `diagnostics` | 唯讀查看 operation 與 auto-sync 診斷紀錄。 |
| `serve --mcp` | 啟動 MCP stdio server。 |

完整選項請執行 `SymbolLattice <command> --help`。

## Codex 與 MCP

```powershell
# 預覽整合設定，再套用
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

安裝流程管理 `~/.codex/config.toml` 的 `mcp_servers.SymbolLattice` 與 `~/.codex/AGENTS.md` 中的 `SYMBOL_LATTICE_START`／`SYMBOL_LATTICE_END` 區塊，寫入前建立備份。設定使用目前 Node 與 `dist/cli/main.js` 的絕對路徑；移動或重裝 CLI 後請重新執行整合安裝，再重新啟動 Codex 或開啟新 task。

整合安裝本身不建立索引。安裝的 Agent 指示會要求在辨識到軟體 repository、任務需要理解或修改程式碼且索引缺失時，從 repository root 執行 `SymbolLattice init .`。共用外層 `.git` 的 monorepo 只在外層建立一次；含多個獨立 repo 的 workspace 則逐 repo 建立。檔案系統根目錄、Home、Desktop 根層、暫存與 dependency 目錄不會自動初始化。

也可以直接啟動 MCP：

```powershell
SymbolLattice serve --mcp --project C:\path\to\project

# 停用背景索引更新
SymbolLattice serve --mcp --project C:\path\to\project --no-auto-sync
```

- MCP query handlers 是唯讀的，但 server 預設可啟動自動同步並更新索引；需要停用背景更新時使用 `--no-auto-sync`。
- 預設只暴露 `SymbolLattice_explore`，回傳精簡 Markdown 與附行號來源。CLI 的 `explore --json` 保留機器可讀輸出。
- 使用環境變數 `SYMBOL_LATTICE_MCP_TOOLS=node,impact` 加入工具，或設為 `all` 暴露全部工具。
- 啟動目錄沒有索引時仍會註冊工具，但不啟動該目錄的 watcher。查詢時以 `projectPath` 指定已建立索引的 repository；query handlers 不會直接執行 `init`。
- 多 repository 的查詢須分別提供 `projectPath`；各索引不會自動合併成跨 repo 關係圖。

移除整合：

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## 語言支援與驗證範圍

目前 58 種語言與格式有掃描入口，包括 TypeScript／JavaScript、Java、Go、Python、C／C++、C#、Rust、Ruby、Shell，以及 Web 模板、文件與設定格式。**可掃描不代表具備相同的關係解析深度，也不代表完整語言支援。**

- 宣告、同檔呼叫、跨檔關係與 framework 語意的支援範圍分別驗證。
- HTML、CSS、文件與設定格式依適用的資源引用與結構關係驗證。
- 非空小語料測試、大型專案真值與負向案例使用不同分母；召回率不能當成精確率。
- CI 中的 benchmark 工具契約測試，不代表每次都下載並分析完整外部語料。

完整語言清單與限制見 [language-depth.ts](src/domain/language-depth.ts)；驗證工具與執行邊界見 [benchmarks/README.md](benchmarks/README.md)。

## 開發

```bash
npm ci
npm run check
npm run build
npm test
npm run verify:language-depth
npm run verify:mcp-worker-generation
npm pack --dry-run
```

先建置再測試，讓需要 `dist/` 與 parser assets 的測試有可用產物。`npm pack --dry-run` 仍會觸發 `prepack`，執行建置與語言深度檢查。

| 目錄 | 內容 |
| --- | --- |
| `src/domain/` | 圖模型、證據、查詢規則與語言支援定義。 |
| `src/extraction/` | 各語言解析器與 framework facts 擷取。 |
| `src/application/` | 索引、關係解析、同步與查詢協調。 |
| `src/ports/` | 儲存、來源目錄與 Git 介面。 |
| `src/infrastructure/` | SQLite、檔案系統與 Git 實作。 |
| `src/cli/` / `src/mcp/` | CLI 與 MCP 入口。 |
| `src/assets/` | Parser WASM、manifest、來源資訊與第三方授權。 |
| `test/` | 單元測試、整合測試與 fixtures。 |
| `scripts/` | [建置、安裝與發布工具](scripts/README.md)。 |
| `benchmarks/` | [大型專案與效能驗證工具](benchmarks/README.md)。 |
| `tools/` | Shell parser adapter 的來源與建置目標。 |

CI 在 Ubuntu／Windows、Node 22／24 上執行型別檢查、建置、完整測試、語言驗證、隔離安裝與自我索引並行查詢。外部語料與產生的報告不應提交到原始碼目錄。

## 從 v0.420.0 或更早版本升級

舊套件名稱與索引不會自動遷移。先保留可回復副本，再移除舊整合與 CLI：

```powershell
symbol-lattice uninstall codex --apply --yes
npm uninstall -g @hsinpu/symbol-lattice
```

依上方 GitHub 固定 ref 流程安裝新 CLI，然後重新整合並建立索引：

```powershell
SymbolLattice install codex --apply --yes
cd C:\path\to\project
SymbolLattice init .
```

確認新 CLI、MCP 與 `.SymbolLattice` 索引正常後，再清理舊資料。

## 授權

[MIT](LICENSE)。Parser 資產另附第三方授權與來源資訊，位於 `src/assets/`。
