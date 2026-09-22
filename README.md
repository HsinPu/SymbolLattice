# SymbolLattice

以來源證據建立本機程式碼關係圖，協助開發者與 AI Agent 搜尋程式、追蹤呼叫與評估修改影響。

繁體中文 | [English](README.en.md)

目前版本：**v0.523.17** · Node.js **>=22.13 <25** · [MIT](LICENSE)

## 能做什麼

透過 CLI 或 MCP 查詢 repository，索引保存在本機 `.SymbolLattice/`。

- 找出任務相關的檔案與符號，附上原始碼、行號和關係證據。
- 追蹤呼叫、繼承、匯入與框架入口，協助評估修改影響。
- 增量更新索引，查看歷史與差異。

採靜態分析；動態呼叫、反射、巨集與外部套件可能無法解析。未解析或被截斷的結果不代表相關程式碼不存在。

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

完成後可刪除 `$bootstrap` 指向的暫存 checkout。安裝 CLI 不會修改 Codex 設定或建立專案索引。

## 快速開始

在要分析的 repository 根目錄執行：

```powershell
SymbolLattice init .
SymbolLattice status .
SymbolLattice find createOrder --project . --json
SymbolLattice explore "Trace createOrder flow to persistence" --project . --json

# 原始碼修改後更新索引
SymbolLattice sync .
```

| 指令 | 用途 |
| --- | --- |
| `init` / `sync` | 建立或更新索引。 |
| `find` / `search` / `file` | 搜尋符號與來源、讀取已保存來源。 |
| `callers` / `callees` / `hierarchy` | 追蹤呼叫與繼承關係。 |
| `impact` / `affected` | 分析修改影響。 |
| `context` / `explore` / `investigate` | 取得附來源的 Agent 脈絡。 |

完整選項請執行 `SymbolLattice <command> --help`。

## Codex 與 MCP

```powershell
# 預覽整合設定，再套用
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

整合會備份並更新 `~/.codex/config.toml` 的 `mcp_servers.SymbolLattice` 與 `~/.codex/AGENTS.md` 的受管理區塊。設定使用 Node 和 `dist/cli/main.js` 的絕對路徑；移動或重裝 CLI 後須重新整合，再重新啟動 Codex 或開啟新 task。

整合安裝不會建立索引。需要分析時，在 repository 根目錄執行 `SymbolLattice init .`：共用 `.git` 的 monorepo 建立一次，含獨立 repository 的 workspace 則各自建立。

也可以直接啟動 MCP：

```powershell
SymbolLattice serve --mcp --project C:\path\to\project
```

- 預設提供 `SymbolLattice_explore`，回傳附行號來源與關係證據，並標示截斷和未確認之處。需要 JSON 時使用 CLI 的 `explore --json`。
- 查詢本身唯讀；server 預設可在背景更新索引，加入 `--no-auto-sync` 可停用。
- 多 repository 透過 `projectPath` 分別查詢；須先建立各自索引，查詢不會自動初始化或合併索引。
- 環境變數 `SYMBOL_LATTICE_MCP_TOOLS=node,impact` 可加入工具，設為 `all` 可提供全部工具。

移除整合：

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## 語言支援與驗證範圍

可掃描 58 種語言與格式，包括 TypeScript／JavaScript、Python、Java、Go、Rust、C／C++、C# 與 Web 模板。**各語言的解析深度不同，不代表完整語言支援。**

詳見[語言範圍與限制](src/domain/language-depth.ts)、[真實專案與效能驗證](benchmarks/README.md)。小型測試通過不代表所有大型專案都已驗證。

JavaScript／TypeScript 可保留具名函式，以及指派給靜態屬性的匿名函式來源。部分 JavaScript CommonJS 跨檔呼叫附有匯入／匯出位置；動態匯出、覆寫與循環相依仍有限制。升級後執行 `SymbolLattice sync .` 更新既有索引。

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

開發規則見 [AGENTS.md](AGENTS.md)，工具說明見 [scripts/README.md](scripts/README.md)。

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
