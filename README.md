# SymbolLattice

讓 AI Agent 找到任務相關的程式碼，並帶回可核對的來源證據。

繁體中文 | [English](README.en.md)

目前版本：**v0.527.1** · Node.js **>=22.13 <25** · [MIT](LICENSE)

SymbolLattice 在本機建立程式碼索引，透過 CLI 或 MCP 提供檔案、符號與跨檔關係查詢。適合在閱讀陌生專案、定位問題或準備修改時，先找到相關實作，再沿著來源證據追查。

## 你可以用它做什麼

- **找實作**：用符號名稱、檔案路徑或自然語言描述搜尋相關程式碼。
- **核對證據**：查看來源路徑、行號、原始碼片段，以及支援關係判斷的依據。
- **追蹤關係**：查詢已解析的呼叫、匯入、繼承與框架入口，協助評估修改影響。
- **持續更新**：增量同步本機索引，查閱保留的索引歷史與差異。

索引保存在被分析專案的 `.SymbolLattice/`。結果會標示未解析關係、來源新鮮度與截斷情況；靜態分析有其範圍，搜尋結果不能當作完整的影響保證。

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

在**要分析的專案根目錄**執行，不是 SymbolLattice 的安裝目錄：

```powershell
# 建立索引並查看狀態
SymbolLattice init .
SymbolLattice status .

# 不知道符號名稱時，用任務描述探索
SymbolLattice explore "Where are incoming requests validated?" --project . --json

# 已知符號名稱時精確查找；請換成專案中的名稱
SymbolLattice find createOrder --project . --json

# 修改原始碼或升級 SymbolLattice 後，同步索引
SymbolLattice sync .
```

先查看命中的檔案與來源片段，再依關係證據追查。若結果指出索引過期，先執行 `sync` 再重新查詢；即時查詢無法確認索引新鮮度時，可能拒絕回傳結果。

| 需求 | 指令 |
| --- | --- |
| 搜尋符號、文字或讀取檔案來源 | `find`、`search`、`file` |
| 追蹤呼叫與繼承 | `callers`、`callees`、`hierarchy` |
| 評估修改影響 | `impact`、`affected` |
| 取得附來源的任務脈絡 | `explore`、`context`、`investigate` |
| 建立、更新與查看索引 | `init`、`sync`、`status` |

執行 `SymbolLattice <command> --help` 查看參數。

## 讓 AI Agent 使用

### Codex 整合

```powershell
# 先預覽，再套用設定並檢查
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

整合會備份並更新 `~/.codex/config.toml` 的 `mcp_servers.SymbolLattice`，以及 `~/.codex/AGENTS.md` 的受管理區塊。完成後重新啟動 Codex 或開啟新 task。

整合不會建立專案索引。請先在目標專案執行 `SymbolLattice init .`。共用一個 `.git` 的 monorepo 建立一次；workspace 中的獨立 repository 各自建立。

設定使用 Node 與 CLI 的絕對路徑。移動或重裝 CLI 後，請重新執行整合。需要移除時，先以 `SymbolLattice uninstall codex` 預覽，再加上 `--apply --yes` 套用。

### 其他 MCP 用戶端

使用下列指令啟動 MCP server，專案路徑請替換成實際位置：

```powershell
SymbolLattice serve --mcp --project C:\path\to\project
```

- 預設工具為 `SymbolLattice_explore`，回傳附行號來源、關係證據與限制說明的 Markdown；需要 JSON 時使用 CLI 的 `explore --json`。
- 查詢本身唯讀，server 預設可在背景更新索引；加入 `--no-auto-sync` 可停用背景更新。
- 可透過 `projectPath` 查詢不同 repository，但必須先各自建立索引；查詢不會初始化或合併索引。
- 以環境變數 `SYMBOL_LATTICE_MCP_TOOLS=node,impact` 加入工具，或設為 `all` 提供全部工具。

## 支援範圍與限制

可掃描的語言與格式包含 TypeScript／JavaScript、Python、Java、Go、Rust、C／C++、C# 與 Web 模板。**各語言的宣告擷取、跨檔解析與框架支援深度不同。** 詳細範圍見[語言能力定義](src/domain/language-depth.ts)。

- 動態呼叫、反射、巨集與外部依賴可能無法解析；未找到關係不代表關係不存在。
- `explore` 可限量提供索引已記錄的未解析呼叫位置與同名宣告線索；這些線索不等於已確認的呼叫目標。
- 原始碼片段、關係展開與結果數量都有上限。請查看截斷資訊與後續查詢提示，不將局部結果視為完整結果。
- 查找品質與速度取決於專案和查詢。固定專案的測試結果不代表所有專案都能取得相同表現。

實測結果、已知缺口與重現方式見[驗證文件](benchmarks/README.md)。

## 升級

使用上方安裝流程指定新的固定 commit 或既有 tag，重新安裝後執行 Codex 整合，並在各專案執行 `SymbolLattice sync .`。目前為 `0.x` 開發階段，升級前請核對對應版本的相容性與遷移說明。

### 從 v0.420.0 或更早版本升級

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

## 開發

在本專案 checkout 中執行：

```bash
npm ci
npm run check
npm run build
npm test
```

先建置再測試，確保 `dist/` 與 parser assets 可用。依修改範圍另執行：

```bash
npm run verify:language-depth
npm run verify:mcp-worker-generation
npm pack --dry-run
```

`npm pack --dry-run` 仍會觸發 `prepack`，執行建置與語言深度檢查。開發與驗證要求見 [AGENTS.md](AGENTS.md)，工具入口見 [scripts/README.md](scripts/README.md)。

## 授權

[MIT](LICENSE)。Parser 資產的第三方授權與來源資訊保留於 `src/assets/`。
