# 安裝與使用指南

[回到專案首頁](../README.md) · [English](getting-started.en.md)

## 安裝

需要 Git、Node.js `>=22.16 <23 || >=24 <25`、npm，以及 Windows PowerShell 5.1 或 PowerShell 7。

**0.546.0 破壞性變更（執行環境）：**使用內建 SQLite FTS5 的官方 Node.js 22.16 以上 22.x 或 24.x。舊文件允許的官方 22.13–22.15 與 23.x 缺少 FTS5，無法建立全文索引；請先升級 Node.js，再重新安裝。保留既有索引，安裝後執行 `SymbolLattice sync .`，不需因本項環境修正刪除或重建索引。

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

可掃描的語言與格式包含 TypeScript／JavaScript、Python、Java、Go、Rust、C／C++、C# 與 Web 模板。**各語言的宣告擷取、跨檔解析與框架支援深度不同。** 詳細範圍見[語言能力定義](../src/domain/language-depth.ts)。

- 動態呼叫、反射、巨集與外部依賴可能無法解析；未找到關係不代表關係不存在。
- `explore` 可限量提供索引已記錄的未解析呼叫位置與同名宣告線索；一般查詢與精確符號補查也可能附上有來源行的 Python 同類別候選宣告，並標示省略數量。這些線索不等於已確認的呼叫目標。
- 若焦點帶有 `graph-connected` 排序原因，JSON 的 `queryPlan.graphConnectionEvidence` 會列出一條確切的靜態候選關係、關係總數與省略數量；MCP 文字也會顯示來源位置。這是排序依據，不證明該關係與任務相關；需要完整關係時請依符號或檔案補查。
- `explore --json` 的來源詞彙命中若位於以 `#`（Python）或 `//` 開頭的行，會附上 `lineContext: "comment-prefixed"`；MCP 文字也會標示。這只檢查行首，不解析字串或所有註解，不能據此判定程式會執行該內容。
- MCP 的詞彙引用使用 `路徑:行:起始欄-結束欄`：欄位從 1 起算，結束欄不包含，依 UTF-16 計算。同一 token、位置與註解標記的查詢詞可共用引用；座標不完整時保留單獨的行號引用。JSON 仍保留各查詢詞的來源證據。
- 原始碼片段、關係展開與結果數量都有上限。請查看截斷資訊與後續查詢提示，不將局部結果視為完整結果。
- 查找品質與速度取決於專案和查詢。固定專案的測試結果不代表所有專案都能取得相同表現。

實測結果、已知缺口與重現方式見[驗證文件](../benchmarks/README.md)。

## 升級

使用上方安裝流程指定新的固定 commit 或既有 tag，重新安裝後執行 Codex 整合，並在各專案執行 `SymbolLattice sync .`。目前為 `0.x` 開發階段，升級前請核對對應版本的相容性與遷移說明。

### 升級至 v0.547.0

新增可選的 `queryPlan.coveredFileContextFiltering`。未套用單一焦點收斂時，若首要檔案有字面目錄詞支持、至少兩個已選宣告，且非註解前綴的來源命中共同涵蓋有界候選中全部已命中的至少 6 組概念，部分次要檔案可能不再展開。每個被省略符號的具名詞與非註解前綴命中不得超過共同涵蓋概念的一半，全部字面命中也不得涵蓋全部概念。字串或 docstring 仍可命中；這不是語法或語意上的程式碼分類。

紀錄分別列出各宣告的來源命中、非註解前綴命中、被省略符號與 `unmatchedTermGroups`；後者僅表示已選及省略候選中沒有命中，不宣稱整個專案沒有來源。具名複合操作、直接精確關係、受保護來源中未解析呼叫的同名宣告、圖展開及流程／缺口／屬性補查保留；同名保留不確認目標。指定檔案或含數字限定詞的查詢不套用此規則。必要時依符號參照或檔案補查，並查看輸入、圖與來源的截斷資訊。

這是字面覆蓋的有界輸出規則，不證明多段宣告彼此相連、檔案無關或必要證據完整。既有 `coveredContextFiltering` 的單一焦點契約保留；CLI／MCP 參數、結果上限及索引格式不變，不需因本項查詢能力重建索引。

### 升級至 v0.536.2

查詢包含至少 6 組概念，且一個主要焦點的索引來源涵蓋全部概念時，只有共用詞、涵蓋不超過一半概念的部分次要檔案可能不再展開。具名操作、直接精確關係、主要來源中未解析呼叫的同名宣告，以及保留的流程補查焦點不因此省略；同名保留不確認呼叫目標。`queryPlan.coveredContextFiltering` 列出主要來源的命中位置及每個省略符號的範圍與命中來源；MCP 文字提供檔案路徑與補查提示。

這是有界的輸出收斂規則，不保證省略的檔案無關，也不證明流程完整。「全部概念」僅指詞數預算內保留的群組；若 `queryPlan.input.identifierTermsTruncated` 為 true，較後面的詞可能未參與判定，應縮短查詢再核對。需要深入核對時，使用其中的精確符號參照或指定檔案查詢。查詢詞較少、沒有完整來源涵蓋或已指定檔案時，不套用此規則。本次不改索引格式或解析版本，無須因此重建索引。

### 升級至 v0.538.1

一般查詢的排序會補強有來源支持的精確目錄詞，例如指定資料庫後端。焦點的 `directoryContext` 記錄問句詞、完整目錄元件、檔案路徑與加權；至少須有兩個不同的來源概念才會採用，檔名或部分目錄字串不算此項依據。這是相關性線索，不推定程式關係或完整流程。搜尋與來源預算維持原設定，不需重建索引。

### 升級至 v0.541.0

若長問句的補充宣告搜尋沒有從主圖取得候選，現在可在既有結果的檔案中精確補查。最多查 8 個名稱、8 個檔案、16 個宣告；只有未截斷且索引世代一致的結果可支持候選。若恰有兩個符合條件的同名宣告，會以完整候選組一起提供來源，不推定接收者型別或呼叫目標，也不搜尋新的檔案。未截斷、世代一致的查詢才可形成候選組；超過兩個、候選不符合條件或補充位置已占用時，不任意挑選其中一個。`matchingDeclarationIds` 列出整組宣告，僅適用於所查的已選檔案。

JSON 的 `queryPlan.omittedDeclarationSearch.selectedFileLookup` 記錄名稱、檔案、可用性與名稱預算截斷；補查候選的 `omittedQueryDeclaration.scope` 為 `selected-files-index`，同名數量僅適用於該補查範圍。唯一候選維持最多一個補充焦點；兩個同名候選共用原有總來源字元預算。這項查詢能力不需重建索引。

### 長問句補充宣告的結果限制

長問句中省略的概念可與來源中的未解析呼叫共同支持同名宣告候選，補上已選到檔案中的來源；不證明接收者型別或呼叫目標。JSON 的 `queryPlan.omittedDeclarationSearch` 與焦點的 `omittedQueryDeclaration` 記錄依據與截斷。

**0.541.0 破壞性變更**：完整候選組可使每檔最多回傳 4 個焦點，總焦點最多 10 個。JSON 使用者須依回傳的 `limits` 處理，移除每檔固定 2／3 項及總量 9 項的假設。既有來源字元預算不增加；這項變更不需重建索引。

### 升級至 v0.536.0

一般查詢可為部分未解析的 TypeScript optional member call 補上跨檔候選宣告。必須同時有精確的匯入、類別建構與宣告包含關係；建構可位於呼叫所在函式，或其直接呼叫的同檔函式。這是補查線索，不推定未知接收者的型別或呼叫目標。

最多檢查 8 個呼叫與 16 組來源依據，在原有最多 8 個焦點之外增加最多 1 個候選宣告；總來源字元預算不增加。JSON 的 `queryPlan.importedDeclarationSearch` 記錄搜尋範圍、可用性與截斷，焦點的 `importedCallDeclaration` 附上來源依據。結果仍可能不完整，可依回傳的精確符號參照補查。從 v0.535.0 升級不因本項查詢能力而要求重建索引；更早版本仍須依下節同步解析證據。

### 升級至 v0.535.0

本版新增 TypeScript 具名 optional member call 的來源紀錄，例如 `signal?.isCycle()`、`signal.isCycle?.()`。紀錄引用方法名稱在原始碼中的位置，目標維持未解析；不推定接收者型別，也不保證呼叫會執行。動態或字面值 computed member（例如 `signal?.[name]()`）不包含在此新增範圍。

安裝後在每個被分析的專案執行 `SymbolLattice sync .`。新的 extractor／resolver 版本會觸發必要的重新擷取與圖投影，第一次同步可能較久；索引格式未變，不需手動刪除索引。呼叫證據增加不代表已找齊任務必要檔案；已知的 Nest 循環依賴召回缺口仍記錄於驗證文件。

### 升級至 v0.532.0

`explore --json` 及 MCP `explore` 的結構化回應仍提供索引是否過期、原因、索引世代識別碼與檔案／符號／關係數量，但其 `status.lastIndexWork` 已移除。若你的腳本從查詢結果讀取上次索引作業的檔案清單，請改用 `SymbolLattice status <project-path> --json` 取得完整的 `lastIndexWork`。本次不變更索引格式，無須因此重建；一般升級後仍可執行 `sync` 檢查更新。

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

`npm pack --dry-run` 仍會觸發 `prepack`，執行建置與語言深度檢查。開發與驗證要求見 [AGENTS.md](../AGENTS.md)，工具入口見 [scripts/README.md](../scripts/README.md)。

## 授權

[MIT](../LICENSE)。Parser 資產的第三方授權與來源資訊保留於 `src/assets/`。
