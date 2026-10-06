# 語言驗證程度與搜尋速度報告

文件跟隨版本：`v0.550.2`。更新日期：2026-10-06。完整主表量測產品：`v0.549.0`（`54893be20020208866c5e8daae7863196f7ccaf7`）；最新局部查找與速度補驗另列於文末。

本報告集中列出全部 58 種語言／格式的驗證範圍、查找結果與速度，後續優化更新同一份文件。所有數值均保留測量版本；純文件升版不把舊數據改稱新版本實測。

## 如何閱讀

「本輪最小驗證」來自 [58 種語言內容檢查](../benchmarks/languages/depth-matrix.mjs) 與獨立手寫的 [最小真值](../benchmarks/languages/nonempty-depth-scorer.mjs)。55 種檢查宣告／資源，7 種另檢查一個確定呼叫，3 種檢查原始模板引用；全 58 種另通過發現、掃描與檔案身分檢查。模板原始引用未經跨檔解析，小型案例不提供整個語言的 precision、recall 或速度。

「歷史證據」照錄 [能力與限制來源](../src/domain/language-depth.ts) 的版本、證據類型與最高已登記範圍。本輪沒有重新執行每個歷史外部 oracle；`project` 代表其中有部分跨檔能力。完整型別、動態行為、框架及語法覆蓋須逐項閱讀該來源的 `knownLimitations` 與 [驗證紀錄](../benchmarks/README.md)。表內分類不代表完整跨檔解析或各語言達到相同深度。

「目前固定任務」依真值預先指定的第一個必要檔案語言歸類。查詢仍在整個真實專案執行；跨語言專案及只用數個題目的速度，不能用來比較語言本身的快慢。歷史主表有 3/58 種語言的實際任務速度；本次另補驗 Go，首次局部結果見 v0.550.1 節，本批 Go 修正見 v0.550.2 節。未重新執行的最小案例、解析 oracle 與主表數值保留原版本。

## 每個語言的歷史主表（v0.549.0）

| 語言／格式 | 本輪最小驗證 | 歷史證據／關係範圍／證據版本 | 目前固定任務（v0.549.0） | 查詢上中位數（v0.549.0） |
| --- | --- | --- | --- | --- |
| `typescript` | 宣告／資源：通過 | 外部 A 級範圍／部分跨檔；0.456.0；大型已登記<br>`typescript-compiler-api` | 8 題；檔案 13/13；來源 25/25 | 1 題；918.68–918.68 ms |
| `javascript` | 宣告／資源：通過 | 有界關係／部分跨檔；0.500.0；大型已登記<br>`javascript-estree` | 25 題；檔案 39/39；來源 113/113 | 2 題；189.37–425.04 ms |
| `arkts` | 宣告／資源：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `vue` | 宣告／資源：通過 | 有界關係／部分跨檔；0.502.0；大型已登記<br>`sfc-compiler-api` | 本輪未測量 | 本輪未測量 |
| `svelte` | 宣告／資源：通過 | 有界關係／部分跨檔；0.502.0；大型已登記<br>`sfc-compiler-api` | 本輪未測量 | 本輪未測量 |
| `astro` | 宣告／資源：通過 | 有界關係／部分跨檔；0.502.0；大型已登記<br>`sfc-compiler-api` | 本輪未測量 | 本輪未測量 |
| `razor` | 宣告／資源：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `python` | 宣告／資源：通過 | 有界關係／部分跨檔；0.501.0；大型已登記<br>`python-stdlib-ast` | 22 題；檔案 34/35；來源 128/128 | 5 題；220.82–1505.93 ms |
| `go` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.513.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `rust` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.458.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `java` | 宣告／資源：通過 | 外部部分／部分跨檔；0.494.0；大型已登記<br>`javac-oracle` | 本輪未測量 | 本輪未測量 |
| `groovy` | 宣告／資源：通過 | 有界關係／同檔；0.499.0；大型已登記<br>`groovy-compiler-ast` | 本輪未測量 | 本輪未測量 |
| `fortran` | 宣告／資源：通過 | 有界關係／部分跨檔；0.507.0；大型已登記<br>`fparser-ast` | 本輪未測量 | 本輪未測量 |
| `ada` | 宣告／資源：通過 | 有界關係／部分跨檔；0.508.0；大型已登記<br>`gnat-ali-xref` | 本輪未測量 | 本輪未測量 |
| `php` | 宣告／資源：通過 | 有界關係／部分跨檔；0.475.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `blade` | 原始模板引用：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `c` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.474.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `lua` | 宣告／資源：通過 | 有界關係／同檔；0.504.0；大型已登記<br>`lua-tree-sitter-ast` | 本輪未測量 | 本輪未測量 |
| `luau` | 宣告／資源：通過 | 大型結構／同檔；0.434.0；大型已登記<br>`large-project-structural` | 本輪未測量 | 本輪未測量 |
| `pascal` | 宣告／資源：通過 | 有界關係／部分跨檔；0.511.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `objc` | 宣告／資源：通過 | 有界關係／部分跨檔；0.476.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `r` | 宣告／資源：通過 | 有界關係／同檔；0.481.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `elixir` | 宣告／資源：通過 | 有界關係／部分跨檔；0.467.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `erlang` | 宣告／資源：通過 | 有界關係／部分跨檔；0.468.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `clojure` | 宣告／資源：通過 | 有界關係／部分跨檔；0.469.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `perl` | 宣告／資源：通過 | 大型結構／框架引用；0.447.0；大型已登記<br>`large-project-structural` | 本輪未測量 | 本輪未測量 |
| `julia` | 宣告／資源：通過 | 大型結構／同檔；0.435.0；大型已登記<br>`large-project-structural` | 本輪未測量 | 本輪未測量 |
| `haskell` | 宣告／資源：通過 | 有界關係／部分跨檔；0.465.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `ocaml` | 宣告／資源：通過 | 有界關係／部分跨檔；0.464.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `fsharp` | 宣告／資源：通過 | 有界關係／部分跨檔；0.463.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `nim` | 宣告／資源：通過 | 有界關係／部分跨檔；0.471.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `cpp` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.473.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `csharp` | 宣告／資源：通過 | 有界關係／部分跨檔；0.462.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `ruby` | 宣告／資源：通過 | 有界關係／部分跨檔；0.477.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `kotlin` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.459.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `swift` | 宣告／資源：通過 | 有界關係／部分跨檔；0.460.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `dart` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.461.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `scala` | 宣告／資源：通過 | 有界關係／部分跨檔；0.466.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `terraform` | 宣告／資源：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `liquid` | 原始模板引用：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `twig` | 原始模板引用：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `solidity` | 宣告／資源：通過 | 有界關係／同檔；0.505.0；大型已登記<br>`solc-ast` | 本輪未測量 | 本輪未測量 |
| `cfml` | 宣告／資源：通過 | 特定案例／同檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `nix` | 宣告／資源：通過 | 有界關係／部分跨檔；0.470.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `vbnet` | 宣告／資源：通過 | 有界關係／同檔；0.506.0；大型已登記<br>`roslyn-vb-ast` | 本輪未測量 | 本輪未測量 |
| `cobol` | 宣告／資源：通過 | 有界關係／同檔；0.509.0；大型已登記<br>`gnucobol-xref-listing` | 本輪未測量 | 本輪未測量 |
| `zig` | 宣告、確定呼叫：通過 | 有界關係／部分跨檔；0.472.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `yaml` | 宣告／資源：通過 | 特定案例／框架引用；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `xml` | 宣告／資源：通過 | 特定案例／部分跨檔；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `html` | 宣告／資源：通過 | 大型結構／結構；0.425.0；大型已登記<br>`large-project-structural` | 本輪未測量 | 本輪未測量 |
| `jsp` | 宣告／資源：通過 | 大型結構／部分跨檔；0.428.0；大型已登記<br>`large-project-structural` | 本輪未測量 | 本輪未測量 |
| `css` | 宣告／資源：通過 | 大型結構／結構；0.426.0；大型已登記<br>`large-project-structural` | 本輪未測量 | 本輪未測量 |
| `properties` | 宣告／資源：通過 | 特定案例／框架引用；未標版；大型未登記<br>`targeted-tests` | 本輪未測量 | 本輪未測量 |
| `shell` | 宣告／資源：通過 | 有界關係／同檔；0.503.0；大型已登記<br>`shell-mvdan-ast` | 本輪未測量 | 本輪未測量 |
| `sql` | 宣告／資源：通過 | 有界關係／部分跨檔；0.478.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `graphql` | 宣告／資源：通過 | 有界關係／部分跨檔；0.484.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `proto` | 宣告／資源：通過 | 有界關係／部分跨檔；0.483.0；大型未登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |
| `markdown` | 宣告／資源：通過 | 有界關係／部分跨檔；0.482.0；大型已登記<br>`source-occurrence-oracle` | 本輪未測量 | 本輪未測量 |

## 真實專案查找品質

本批 38 份固定真值包含 55 題；使用 [task-retrieval](../benchmarks/mcp/task-retrieval.mjs) 的既有計分方式。必要檔案按主要 focuses／match 計分；來源事實另包含補充 source windows，兩個分母分開呈現。TP 包含預先定義的補充脈絡，FN 只計必要檔案。未判定檔案不當作 FP。最後一欄只涵蓋已判定輸出，整體 precision 仍未測量。

| 語言 | 題數 | 必要檔案召回 | 指定來源涵蓋 | TP / FP / FN / 待核對 | 已判定 precision |
| --- | ---: | --- | --- | --- | --- |
| `python` | 22 | 34/35 | 128/128 | 36 / 0 / 1 / 45 | 36/36 |
| `javascript` | 25 | 39/39 | 113/113 | 53 / 0 / 0 / 38 | 53/53 |
| `typescript` | 8 | 13/13 | 25/25 | 17 / 0 / 0 / 13 | 17/17 |

- `sqlite-close-thread-and-memory-guards`：主要必要檔案 1/2，指定來源事實 6/6；保留原真值與失敗結果。

本批資料的來源、獨立核對、輸出成本及首次保留結果見 [v0.549.0 稽核](../benchmarks/mcp/call-source-context-audit.md)。全套測試通過與小型語言檢查通過，不會消除此處的查找缺口。

## 查詢速度

基準 `v0.548.1` 與量測產品 `v0.549.0` 使用同樣的固定原始碼與已有索引。每題一次暖機、持續存在的唯讀 reader、交替順序；統計為上中位數。範圍是完整 service `explore` 呼叫，包含 status 檢查，排除 CLI 啟動、序列化／傳輸及 Agent 思考。初次索引、增量同步、冷查詢與峰值記憶體本輪未比較。

| 語言 | 固定查詢 | 基準 ms | 量測產品 ms | 變化 | 配對數 |
| --- | --- | ---: | ---: | ---: | ---: |
| `python` | django／`database-version-cursor-temporary-connection` | 1283.82 | 1282.93 | -0.07% | 12 |
| `python` | django／`sqlite-close-thread-and-memory-guards` | 1522.36 | 1505.93 | -1.08% | 12 |
| `typescript` | nest／`constructor-dependencies` | 894.75 | 918.68 | 2.67% | 12 |
| `javascript` | fastify／`error-response-status` | 439.47 | 425.04 | -3.28% | 12 |
| `javascript` | express／`response-etag-transfer-length` | 197.03 | 189.37 | -3.89% | 12 |
| `python` | flask／`request-error-handler-priority` | 259.73 | 246.35 | -5.15% | 12 |
| `python` | flask／`unhandled-server-error-propagation` | 269.84 | 263.58 | -2.32% | 12 |
| `python` | flask／`url-defaults-build-failure` | 217.64 | 220.82 | 1.46% | 12 |

正值代表較慢，負值代表較快。保留所有快慢樣本；小差異可能是噪音，本批不宣稱全面加速、統計顯著或 SLO。上述 service 時間不等於 Agent 完成任務的總時間。完整任務的補查序列、查詢次數及 service 時間依 [對應稽核文件](../benchmarks/mcp/call-source-context-audit.md) 的實際範圍閱讀；後續仍須補上其他語言的完整任務效率。

## 固定專案與可追溯資料

| 專案 | 固定 commit |
| --- | --- |
| [django](https://github.com/django/django) | `bc833e8883db4a333a6485d91637b78c85e2b13b` |
| [nest](https://github.com/nestjs/nest) | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` |
| [fastify](https://github.com/fastify/fastify) | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` |
| [express](https://github.com/expressjs/express) | `7ef98448f8b38099ab1ded55e458538ad47a51e7` |
| [flask](https://github.com/pallets/flask) | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` |

原始 JSON、索引、凍結產品、全部逐次時間與失敗產物保留於專案外的驗證工作區。以下 SHA-256 對應本次生成報告實際讀取的摘要；生成器還核對每份任務真值、原始結果與每次速度樣本，不只讀取通過旗標。

| 摘要來源 | SHA-256 |
| --- | --- |
| `SymbolLattice-v5490-language-overview-depth.json` | `8dbd2143de8b00b041d805949fda96c4857ee9ac87e86b1939347e4350bbe0db` |
| `SymbolLattice-v5490-retrieval/summary.json` | `40b808690826d4904ac3c6738111f0c5788dd9d79ab5a88ebfeb42bdac270a12` |
| `SymbolLattice-v5490-timing/summary.json` | `ef83ed6f3447f0f9fac52632daf7f7852fffdf638d64994cf06999dd7ed17d1e` |
| `SymbolLattice-v5490-build-identity.json` | `a7c23158e17201e0fce64e60662dda1161760fb1807909f1bafee49e6d91e8ab` |
| `SymbolLattice-v5481-build-identity.json` | `689887495828384beb7251fcd98164e4ee526004a9be486428d0c9d78f1e4e91` |

## 後續更新方式

每次優化完成前，更新本報告的文件版本、受影響語言的查找／關係驗證、速度與已知缺口。沒有執行的範圍保留版本並寫未測量；失敗結果與舊基準保留。變更真值須另附獨立核對依據，不能為符合輸出而修改答案。

先依 [benchmark 入口](../benchmarks/README.md) 執行必要驗證，將原始資料放在獨立工作區，再用以下指令生成本表。輸入需要同一量測產品版本、完整最小內容檢查、可核對的固定任務結果、速度原始樣本及凍結產品身分。若其中有缺漏或版本不一致，生成器停止，不覆寫報告。

```powershell
node benchmarks/languages/evidence-speed-report.mjs `
  --depth (Join-Path $env:TEMP 'SymbolLattice-v5490-language-overview-depth.json') `
  --quality (Join-Path $env:TEMP 'SymbolLattice-v5490-retrieval\summary.json') `
  --timing (Join-Path $env:TEMP 'SymbolLattice-v5490-timing\summary.json') `
  --identity (Join-Path $env:TEMP 'SymbolLattice-v5490-build-identity.json') `
  --baseline-identity (Join-Path $env:TEMP 'SymbolLattice-v5481-build-identity.json') `
  --audit 'benchmarks/mcp/call-source-context-audit.md' `
  --updated-on 2026-10-05 --output docs/language-verification-and-speed.md
```

## v0.549.2：過期索引的同步鎖恢復補驗

本節實際量測 `v0.549.2`，基準為 `v0.549.1`（`29f4ee542c919f64b5af82619be828f1087b8562`），日期 2026-10-05，Windows／Node.js v24.19.0。完整主表仍保留 v0.549.0 的 58 語言資料；本次沒有重新量測其他 55 種語言，也沒有重跑語言解析 oracle。固定 commit、編譯產品 SHA、完整命令、條件與限制見[同步鎖恢復驗證](../benchmarks/mcp/strict-fresh-read-recovery-audit.md)。

修正同一 Windows 專案因大小寫或目錄別名不同而與 MCP host 自己的同步鎖競爭，以及前／後新鮮度檢查失敗後未釋放臨時鎖的問題。三個固定大型專案以獨立撰寫的暫時宣告產生過期狀態，再由持有真實 SQLite 鎖的 host 以大寫路徑查詢；舊版三次皆回傳 `FRESH_INDEX_REQUIRED`、不執行查詢，修正版三次皆同步一次並回傳新來源。此驗證隔離背景 watcher 排程；不證明所有拒絕都有相同原因。

| 語言／固定專案 | 查找任務 | 必要檔案命中 | 指定來源事實 | 1 題 service 查詢上中位數（v0.549.1 → v0.549.2） |
| --- | --- | --- | --- | --- |
| TypeScript／Nest | 4 | 6/6 | 8/8 | 874.94 → 917.69 ms（+4.89%） |
| JavaScript／Fastify | 1 | 2/2 | 4/4 | 382.97 → 383.18 ms（+0.05%） |
| Python／Flask | 3 | 6/6 | 38/38 | 260.46 → 255.31 ms（-1.98%） |

八題各版本各執行三次新的 CLI process，共 48 次；完整查詢結果皆與基準深度相等。原真值與 scorer 未修改，必要檔案分母為固定任務要求的 distinct task-file instances，未把補充 source windows 當成主要檔案命中。合計必要檔案 14/14、指定來源事實 50/50，另獨立核對 111 份回傳來源片段。部分判定為 TP 17／FP 0／FN 0，15 筆待核對；已判定 precision 為 17/17，判定覆蓋為 17/32，不是完整專案 precision。上方 Django SQLite 任務的歷史必要檔案 1/2 缺口仍保留，本次沒有補驗或改善宣稱。

速度另使用每題每版本一次暖身、八對交替暖查詢及 persistent read-only reader，共 48 次 service 呼叫。這些時間不包含 host 新鮮度准入、MCP transport、sync、首次索引、記憶體峰值或 Agent 完整任務；修正沒有更改 service 查找路徑。保留兩個較慢樣本，不據此宣稱通用速度改善。也未重新驗證 Node.js 22、其他作業系統或別名重新指向的情況。

`npm run check`、`npm run build`、141 項相關測試、全套 3,478 項測試（四項既有略過）及 MCP worker 世代檢查通過。仍維持前後完整新鮮度與 generation 檢查；未啟用同步、其他 host 未能完成、來源讀取失敗或專案持續變動時，仍可能正當拒絕。升級後重新啟動 MCP host；既有索引毋須重建。

原始資料位於 `%TEMP%/SymbolLattice-v5492-validation`；歷史索引與固定 tracked source 未更動。以下摘要皆對應本節實際讀取的資料；`quality.json` 各列再用固定真值、原始結果及實際來源重算，`timing.json` 上中位數再由逐次樣本核對。

| 補驗來源 | SHA-256 |
| --- | --- |
| `identity.json` | `e38d98962fe34f7615f6dcd0711535f2574f6034612ce04b7c3f9e6869429241` |
| `recovery.json` | `c11ba658bf8d140b6e0ccf7fc84513049c6e9ca174c1b1bb74d21a1ac1cd3cd1` |
| `quality.json` | `b483526b6ecef7d891302a55596a0ad185843672a5d9f3d15476d1b7d8b179d9` |
| `timing.json` | `04be376857125332f8ca62be22aa481083931dacdfda5ae7f3e22ce79336ee80` |
| `complete.json` | `e9c30295faf0a81170c038e8d8a070e6ce389b23b797803a7b3c65a5417c9d4a` |
| `validate.mjs` | `e352888578fa2169e39d308e1d7973afab23efc6f92c10e0e8c953786ef1aaef` |

完整主表由上述生成器更新；局部補驗須另核對原始資料並保留本節與對應 audit，不能用舊的全語言輸入覆寫或重新標記局部新實測。

## v0.550.0：CLI 過期索引的可選同步恢復

本節實際量測 `v0.550.0`，基準為 `v0.549.2`（`25d5d8630cd7886783265f8391bf948ae8630b6c`），日期 2026-10-05，Windows／Node.js v24.19.0。新增即時 CLI 查詢的 `--sync-if-stale`，保留不加選項的唯讀查詢與查找契約，依版本規則升 minor。固定 commit、獨立真值、產品 SHA、命令與範圍見 [CLI 恢復驗證](../benchmarks/mcp/cli-sync-recovery-audit.md)。完整 58 語言主表、歷史解析 oracle 與上節 service 時間保留原量測版本；其他 55 種語言未重新量測。

三個固定專案各加入一份獨立撰寫的暫時宣告。舊版與新版的普通 CLI 皆回傳 `FRESH_INDEX_REQUIRED`／`writerState=disabled`，保留原世代；新版加上選項後皆發布增量世代並回傳新宣告的來源，接著的新鮮查詢不再同步，完整輸出相等。暫時宣告移除後再次同步，固定 tracked source 與受保護的歷史索引 bytes 未更動。測試另涵蓋來源／設定／索引器版本同時過期、保留範圍、缺少索引、不安全路徑、其他 host 持鎖、外掛保留及持續變動時拒絕結果；不繞過前後新鮮度或 generation 檢查。

| 語言／固定專案 | 查找任務 | 必要檔案命中 | 指定來源事實 | 回傳來源片段核對 | 單次 CLI 恢復樣本（含 sync） | 接著的新鮮 CLI 樣本 |
| --- | --- | --- | --- | --- | --- | --- |
| TypeScript／Nest | 4 | 6/6 | 8/8 | 50 | 46,581.30 ms | 1,210.32 ms |
| JavaScript／Fastify | 1 | 2/2 | 4/4 | 17 | 10,961.70 ms | 754.57 ms |
| Python／Flask | 3 | 6/6 | 38/38 | 44 | 4,473.06 ms | 665.92 ms |

八題每版各使用三個新 CLI process，另每題加選項執行一次，共 56 次查詢。使用原 `task-retrieval.mjs` 與未修改的真值，完整基準／新版／加選項結果皆深度相等；合計必要檔案 14/14、指定來源事實 50/50，獨立核對加選項結果的 111 份來源片段。必要檔案分母為 distinct task-file instances，補充 source windows 不計為主要檔案命中。部分判定 TP 17／FP 0／FN 0，15 筆待核對；已判定 precision 17/17，判定覆蓋 17/32，不代表完整專案 precision。Django SQLite 任務的歷史必要檔案 1/2 缺口仍保留，本次沒有補驗或改善宣稱。

表內時間每格只有一次 CLI 診斷樣本，包含 process 啟動及前後來源核對；恢復樣本另包含普通增量同步的完整專案解析。全套測試同時執行，未控制 CPU／I/O 負載，因此不能用這些值比較速度或宣稱通用改善。原始拒絕與查找時間亦保留於 JSON。service 延遲、首次索引、記憶體峰值及 Agent 完整任務補查成本本批未重新量測。

`npm run check`、`npm run build`、34 項相關測試及全套 3,486 項測試通過（四項既有略過）。本批未重新執行 Node.js 22、其他作業系統，也無法直接驗證另一台電腦的 CMA122X。升級後須重新套用 Codex 整合並重啟 host，才能載入新的 Agent 指引；明確唯讀／禁止同步仍保留拒絕，既有索引毋須手動重建。

原始資料與 runner 位於 `%TEMP%/SymbolLattice-v5500-validation`；凍結產品位於 `%TEMP%/SymbolLattice-v5492-strict-candidate` 與 `%TEMP%/SymbolLattice-v5500-cli-candidate`。本節直接核對局部補驗，未用全語言生成器重新標記歷史資料。以下 SHA-256 對應實際讀取的產物；原始結果與固定真值可重算每一列。

| 補驗來源 | SHA-256 |
| --- | --- |
| `identity.json` | `125383dd0c8133274da41fd4102a77cb8a4f5d78ab52186bfde5a1583f43be86` |
| `recovery.json` | `403957182e290e17c772444356240be4b2d88eb6102e56ccb8c81c81f0448384` |
| `quality.json` | `d42d7e7a78b2d465052570805b57d5848b6b23211738b442cda8524e24203dd9` |
| `complete.json` | `f988426210972b1bea3fc69ff5a14796db2c4862b84273862e4d637e52833445` |
| `validate.mjs` | `a94047e4ef38dfd4c692124411b100e0f26a524e87281643d53a9cb143e8dcb9` |

## v0.550.1：複合查詢來源證據修正與 Go 補驗

本節實際量測 `v0.550.1`，基準為 `v0.550.0`（`044c7e7ca37bf333586306fd3610dad49bcc974f`），日期 2026-10-06，Windows／Node.js v24.19.0。修正既有複合查詢的連接詞誤命中，維持 CLI／MCP 介面、來源欄位、索引格式與查詢上限，依規則升 patch。固定專案、commit、獨立真值、原始產物與重現命令見 [複合查詢證據驗證](../benchmarks/mcp/compound-query-evidence-audit.md)。其他語言的最小案例、歷史解析 oracle 與上方完整主表保留原量測版本。

### 必要檔案與來源事實

沿用五個固定專案的 38 份真值、55 題回歸任務，另在首次產品查詢前固定 [Gin 三題真值](../benchmarks/mcp/gin-handler-flow-tasks.json)。共 39 份 manifest、58 題，每題每版本執行三次新的 CLI process（348 次）；舊、新產品讀取相同的新鮮驗證索引。原有 55 題的必要檔案為 87/87、指定來源事實 266/266，沒有遺失舊版已找到的正向檔案、事實或指定未解析呼叫／引用。58 題中 57 題完整結果相同；只有 Django 複合詞題改變結果。

| 語言 | 題數 | 必要檔案（v0.550.0 → v0.550.1） | 指定來源事實（v0.550.1） | 獨立核對來源片段 |
| --- | --- | --- | --- | --- |
| python | 22 | 34/35 → 35/35 | 128/128 | 255 |
| javascript | 25 | 39/39 → 39/39 | 113/113 | 310 |
| typescript | 8 | 13/13 → 13/13 | 25/25 | 87 |
| go | 3 | 5/5 → 5/5 | 8/18 | 31 |

Django 原題仍為「When closing a SQLite connection, where are thread ownership and the guard against closing an in-memory database checked?」，真值未改。必要主要檔案由 1/2 提升到 2/2，指定事實仍為 6/6；以往只有 supplementary source window 的 `django/db/backends/base/base.py` 現在也成為主要 focus。v0.549.0 的首次 held-out 失敗仍保留，本次將它視為開發／回歸案例。工作程序設定函式仍排在首位，未宣稱排序或無關結果已全面解決。

原因是 `in-memory` 的原始拼法再次被 SQLite 查詢拆成 `in` 與 `memory`，使一般 `in` token 被標成 `inmemory` 證據。修正以既有 tokenizer 提取可用部分並排除既有 stop words，保留完整識別字及真正的文字位置。該題文字命中符號由 147 降到 81；掃描檔案 76 → 73、符號 1,783 → 1,934，字元仍為 1,048,576 且截斷。候選減少不代表所有掃描成本減少，也不表示只出現 `memory` 就能證明程式的 in-memory 語意。

新增 Gin 為固定 commit 的實際函式庫樣本（99 個 Go 原始碼檔案），不是大型 Go 語料或完整語言驗收。三題主要檔案均找到（5/5），但來源事實只有 8/18：已知 `Engine.ServeHTTP` 為 5/5，無提示 middleware 中止題為 3/6，無提示 URL 到 handler 流程為 0/7。中止題缺少 `context.go:199/201/209`；流程題缺少 `gin.go:744/749/751`、`tree.go:418/616`、`context.go:199/201` 的指定來源。這些是實際證據缺口，並非環境問題；兩版結果相同，保留首次結果且本批未依其輸出調整規則。未執行 Go compiler／型別或 runtime dispatch oracle，沒有據此提高歷史解析深度宣告。

合計主要檔案 92/92、指定事實 274/284，另核對 683 份來源片段及 1,318 筆文字位置。部分檔案判定為 TP 112／FP 0／FN 0，101 筆待核對；已判定 precision 為 112/112，判定覆蓋為 112/213。未判定結果不能直接視為 FP，這不是完整專案 precision；來源片段座標正確，也不能替代任務所需事實或主要檔案召回。

### 查詢速度與尚未量測範圍

每題每版本一次暖身，再執行八對交替查詢，使用 persistent read-only SQLite reader；七題共 112 次量測，另有 14 次暖身與 14 次完整結果核對。測試、建置與索引作業未並行。下表為每版本八筆時間的上中位數，改善後的 Django 輸出另以固定檔案／來源真值驗證，其餘六題要求完整輸出相等。

| 語言／任務 | v0.550.0 service ms | v0.550.1 service ms | 變化 | 證據比較 |
| --- | --- | --- | --- | --- |
| Python／Django 關閉 SQLite 連線 | 1558.59 | 1227.25 | -21.26% | 輸出改善，固定真值另驗 |
| TypeScript／Nest 建立 provider | 928.72 | 921.68 | -0.76% | 完整輸出相等 |
| JavaScript／Fastify 錯誤狀態 | 402.43 | 386.07 | -4.06% | 完整輸出相等 |
| Python／Flask 選擇錯誤 handler | 269.79 | 251.54 | -6.76% | 完整輸出相等 |
| Go／Gin 已知請求入口 | 67.55 | 70.21 | +3.93% | 完整輸出相等 |
| Go／Gin middleware 中止 | 193.63 | 190.20 | -1.77% | 完整輸出相等 |
| Go／Gin URL 到 handler 流程 | 219.78 | 215.85 | -1.79% | 完整輸出相等 |

Django 此題 service 時間改善約 21.26%，seed retrieval 上中位數 867.89 → 483.34 ms。Gin 已知入口變慢的樣本照錄；未更改輸出的其他題目只有小幅波動，不宣稱全部語言或所有查詢都加速。時間不含 host 新鮮度准入、CLI 啟動、同步、MCP transport 或 Agent 完整任務；Go 的流程題仍欠來源事實，其 215.85 ms 不能稱為完成任務的時間。

目前有 4/58 種語言的實際任務速度樣本：TypeScript、JavaScript、Python、Go，其餘 54 種仍未測量。本次只重測所選七題，不能用不同大小專案、不同任務或歷史版本的範圍比較語言本身的快慢。

Gin 初次索引由 `v0.550.0` 執行，同一 Node／Windows 條件下單次 CLI 為 4,111.34 ms，索引工作 3,586.30 ms，共 111 個已登記格式檔案、1,726 個符號、2,192 條邊。這些保留其實際產品版本，未比較首次索引優劣。本批未量測修改來源的增量同步、記憶體峰值、完整 Agent 補查時間或查詢次數；沒有以 service 時間補值。

### 檢查與可追溯資料

`npm run check`、`npm run build`、174 項相關測試、全套 3,488 項測試（四項既有略過）、版本一致性及 `git diff --check` 通過。Gin 的 8/18 來源事實保留為待改善的驗證結果；本版不宣稱其流程驗收通過。索引器與 worker 世代載入未改，既有索引毋須重建。此處沒有驗證另一台電腦的 CMA122X，也未重測 Node.js 22 或其他作業系統。

凍結產品 dist 指紋為 baseline `45924903d280db54d0218af3fb29f47199f985ccbd584413b0d9e9ef7d07cd14`、candidate `4ce75792e19647aa135b59f6389dda02b9651c30aeecce54fcf4e9b3a2784b12`；原始資料位於 `%TEMP%/SymbolLattice-v5501-validation`。既有全語言生成器重新核對並生成外部的 `historical-overview-regenerated.md`，維持原 v0.549.0 數據；本節另由固定真值、全部原始結果與個別時間樣本重算。所有受保護歷史索引與 pinned tracked source 均未更動。

| 補驗來源 | SHA-256 |
| --- | --- |
| `identity.json` | `2e3875c25feb95fa4e421d40ed494d3b136b85bf350e49605c1a7d35a513b9e4` |
| `gin-prequery-truth.json` | `f2dbba436edf9d6431feb8332e7e1cc8aa5eec175cd22273f67d93ad1fa72067` |
| `quality.json` | `5c300d0b0c5999ea422cd8d45dae0ac5cb5a15eb7d01c83f748fe4c189e0b3e9` |
| `timing.json` | `78de9b2bd2d3ecf7d4e946ab3dd4ac31b679eaa363dda689e0973db42cb197f0` |
| `complete.json` | `b9d0327a869b70b1eed3ce7861ba52d85ba4dde5b130e88a2ad1cc7bed4294b5` |
| `raw-recheck.json` | `74f07f23055fa78cb90077bd6a6988f086250b745b60f247c687b6a1ebc98e51` |
| `gin-init.json` | `67fbafcc44caa3dca0188fff670958c49a43ece22805d62ecf02154ff8d5133a` |
| `gin-init-process.json` | `00da8f23b2f805c4bff4fd69a2e370005bd5f16dbf16518282e72baaa646c779` |
| `historical-overview-recheck.json` | `540ec2595139a2514d5833f9f4128de18ea8f2eccbb243e1cbf14e5c8b5c822c` |
| `validate.mjs` | `a1ef272941a71a2a1208bb3db08143ef19542717934c7aa0d1783fd575a24488` |
| `audit-raw.mjs` | `df4e0e3b27c554f8140781370a4c50f1e694362c6c4b2a97e5be55c53127e49b` |
| `report-supplement.mjs` | `44ccaa5157c651f302e33ce096eddf28d76b9658bd43dd8cea853b6db80db6a0` |

重跑命令見對應 audit。更新完整主表時保留所有局部補驗與原測量版本；局部數據不得替代或重新標記其餘 54 種未測量語言。

## v0.550.2：Go 布林值換行的宣告漏判修正

本節實際量測 `v0.550.2`，基準為 `v0.550.1`（`cc75b4fb55485d12c9dd900d046d5c057e7b2a51`），日期 2026-10-06，Windows／Node.js v24.19.0。修正既有 Go 宣告擷取遇到布林值換行時的誤判，維持查詢介面、證據欄位與上限，依規則升 patch。固定來源、獨立 oracle、初次失敗、重現命令見 [Go 分號驗證](../benchmarks/go/boolean-semicolon-audit.md)。本批沒有改排序；下列查找退步與較慢樣本均保留，查找驗收仍未通過。

### 獨立宣告與原始座標核對

使用官方 Go `go1.27.1 windows/amd64` 的 `go/parser`／`go/ast`，不執行外部專案、不下載其依賴，也不執行型別檢查。以官方 AST 的頂層 `FuncDecl`、一般具名／指標 receiver、宣告名稱與原始 UTF-16 起訖位置為真值；排除介面成員、其他符號與泛型 receiver。此分母是宣告，不能當作關係解析或任務檔案召回。

| 固定專案 | Go 檔案 | 已評估宣告 | TP／FP／FN：v0.550.1 → v0.550.2 | 產品 parser 有錯誤的檔案 |
| --- | --- | --- | --- | --- |
| Gin／`43fe48e8a0f44af783116cdb010725e6bb50255f` | 99 | 1,340 | 1277／0／63 → 1340／0／0 | 18 → 0 |
| grpc-go／`d96c2ef4f3339142d20a47797d8a5a4fae948607` | 1,003 | 9,792 | 9532／0／260 → 9792／0／0 | 137 → 1 |

兩個固定專案共 1,102 個 Go 檔案皆通過官方語法解析；受評估的 11,132 個宣告中，漏判由 323 降至 0，兩版 FP 均為 0。另排除 grpc-go 的 19 個泛型 receiver 宣告。這個限定宣告樣本的 precision／recall 為 11132/11132；不代表完整 Go 語法、型別、建置條件、跨檔關係或框架覆蓋。candidate 的 `channelz/grpc_channelz_v1/channelz.pb.go` 仍有兩個 parser error，此缺口保留；該檔受評估的函式宣告有正確來源，不據此宣稱整檔完整解析。948/1102 個檔案的完整 raw facts 未改；其餘包含恢復的宣告與既有規則產生的關係，沒有對全部關係執行獨立型別 oracle。

原本 Go lexer 將 `true`／`false` 分成專用 token，分號追蹤卻只保留一般 identifier，遇到換行與後續敘述時產生錯誤，整個方法被擷取器的既有語法安全檢查排除。生成器現在明確匯出布林值 token 並追蹤分號；保留固定 upstream grammar、裸 range 修正、原始 CRLF／UTF-16 位置與錯誤拒絕。Gin 的 `gin.go:719–789 Engine.handleHTTPRequest`、`tree.go:418–673 node.getValue`，以及 grpc-go 的 `server.go:869–961 Server.Serve` 均有獨立 AST 宣告證據。

### 原題回歸與新的 held-out 查找

Gin 三題沿用原 `v0.550.1` 真值及首次結果，本批作為開發／回歸題。[grpc-go 兩題](../benchmarks/mcp/grpc-server-lifecycle-tasks.json) 在首次產品查詢前獨立閱讀來源、固定必要檔案與事實，作為新 held-out 樣本；未依這兩題調整本批規則。每題每版一次新的 CLI process，五題共十次；這些 CLI 時間可與測試並行，只用於正確性核對，不作速度宣稱。

| 任務 | 必要主要檔案：v0.550.1 → v0.550.2 | 指定來源事實：v0.550.1 → v0.550.2 |
| --- | --- | --- |
| Gin／`known-request-entry-context-pool` | 1/1 → 1/1 | 5/5 → 5/5 |
| Gin／`unhinted-middleware-aborted-response` | 1/1 → 1/1 | 3/6 → 3/6 |
| Gin／`unhinted-url-handler-execution-flow` | 3/3 → 2/3 | 0/7 → 5/7 |
| grpc-go／`known-server-listener-entry` | 0/1 → 0/1 | 0/5 → 0/5 |
| grpc-go／`unhinted-graceful-server-stop` | 2/2 → 2/2 | 5/8 → 5/8 |

合計主要檔案 7/8 → 6/8、來源事實 13/31 → 18/31；這不是查找驗收通過。Gin 流程題恢復五個 `gin.go`／`tree.go` 來源事實，但 `context.go` 被新候選擠出主要檔案，`context.go:199/201` 仍缺少。middleware 題仍缺少 `context.go:199/201/209`。grpc-go 的 `Server.Serve` 已恢復宣告，原始查詢仍未找到必要 `server.go`，缺少全部五個事實；關閉服務題仍缺少 `server.go:1934/1935/1973`。排序、查詢候選與來源選取缺口列為後續開發案例，沒有改題、加答案線索或當作環境問題略過。

新結果另核對 52 份來源片段、89 筆文字位置及回傳關係的來源座標；這些核對不能補成未回傳的必要事實，也不證明 runtime dispatch。選取結果在目前真值下為 6 TP／0 FP／2 FN，12 筆待核對；沒有負向檔案真值，不能由 6/6 的已判定 precision 宣稱完整精確率。其他語言與上方歷史主表保留原測量版本，本批沒有重跑其大型語料查找。

### 隔離查詢速度與升級成本

每題每版一次暖身，再執行八對交替查詢，使用 persistent read-only SQLite reader 與分離的舊、新索引；五題共 80 次量測、10 次暖身、10 次最終比較。測試、建置、oracle、索引與其他查找作業均已結束。下表是八筆 service 時間的上中位數；兩版完整輸出不同，品質另以固定真值核對。

| Go 任務 | v0.550.1 service ms | v0.550.2 service ms | 變化 |
| --- | --- | --- | --- |
| Gin／已知請求入口 | 68.70 | 68.75 | +0.08% |
| Gin／middleware 中止 | 200.69 | 223.82 | +11.52% |
| Gin／URL 到 handler | 227.14 | 244.93 | +7.83% |
| grpc-go／已知服務入口 | 484.78 | 508.27 | +4.85% |
| grpc-go／關閉服務流程 | 835.41 | 855.96 | +2.46% |

五題都較慢，不能宣稱此版搜尋加速。恢復的宣告及其關係增加查詢候選與來源輸出，仍須改善查找效率；八對樣本不建立 SLO、統計顯著性或所有查詢的速度。上述時間不含 host 新鮮度准入、CLI 啟動、同步、MCP transport、Agent 完整任務時間或補查次數；欠缺必要檔案／事實的查詢時間不能稱為完成任務的時間。最新批次只實測 Go；累計仍有 4/58 種語言的任務速度樣本，另外 54 種未測量。

擷取版本 `multi-language-ast-v436 → v437` 會使既有索引過期；索引格式與 resolver v212 不變。保留索引，在專案根目錄執行 `SymbolLattice sync .`，或在允許更新時加入 `--sync-if-stale`；首次升級同步會重新擷取既有檔案，可能較久。Gin 舊索引複本確實先回覆 `FRESH_INDEX_REQUIRED / writerState=disabled`，再以 opt-in 查詢完成同步，新 generation 為 fresh，包含新增方法。grpc-go 另以普通 sync 完成升級。原 Gin baseline 與已記錄的保護索引保持原 hash；未刪除或重建原始索引。索引與同步作業曾與正確性測試並行，原始耗時只作診斷，沒有受控的首次索引、修改來源增量同步或記憶體量測。

### 檢查與原始產物

型別檢查、建置、80 項 Go 相關測試、全套 3,497 項測試（四項既有略過）、`verify:language-depth` 的 58 種最小契約、版本一致性與 `git diff --check` 通過。第一次全套測試的 21 個失敗保留在 `full-test-first-failed.log`：20 個舊擷取版本斷言及一個新增 Go 驗證目錄清單，均同步修正後重跑。獨立 oracle 另核對 CRLF／UTF-16 正例及錯誤語法反例。這些通過不替代上述查找題的實際失敗。另一台電腦 CMA122X 的實機狀態仍未驗證。

凍結 dist SHA-256：baseline `4ce75792e19647aa135b59f6389dda02b9651c30aeecce54fcf4e9b3a2784b12`、candidate `443be69a3d097fd95813d6ca2e31d3c842f03c657d6b40c786f96169fd743457`。大型來源、SDK、索引、完整原始結果、個別時間、失敗與核對腳本位於 `%TEMP%/SymbolLattice-v5502-validation` 及對應外部產品／語料目錄。完整歷史生成器與 58 行主表均保留原版；本節由獨立 AST、固定任務真值及個別時間重算。

| 補驗來源 | SHA-256 |
| --- | --- |
| `identity.json` | `f1b81c6ac67ab19355a9c149db262178f44bb929733aeca8732c2c26c13fdb7a` |
| `grpc-prequery-truth.json` | `e2913657cccf3f7dc7d6dbcca69f00aa4417fccf21e5d51772afc52a2e56462a` |
| `gin-declarations.json` | `9ef39e4564e8b793189bfda3d122fcf1597ded4cfd8fa8dd01fa80030c2b2e82` |
| `grpc-declarations.json` | `6311641de9d1de544012d92868286f9eb72b3eb34e2f8317b7b66c08cc8650eb` |
| `oracle-contract.json` | `6ed8c7847cba637a394caf86f92863e430047fb6982543bd42aa9c699f8745e1` |
| `quality.json` | `250d8a13ddce420a54832f68038649ff2894ce7cf2e30b8773bdd337195d593c` |
| `quality-summary.json` | `c9882dd9cbce113159211e99a303b46cffef1d6aabce962e32000bd5cc0d784d` |
| `timing.json` | `edf163cdcb111932ec213580baff75bceaf2c2d76383513c87375f9d7f25857a` |
| `recovery-recheck.json` | `35a8cd293c1417e4f2f85b4d90f4a764ea2e02055aa36b49afb56be5eac16826` |
| `quality.mjs` | `983f2a7ebfb8dc30a9a90da52141393a6af286c513595a4edf6224bbe6cff089` |
| `timing.mjs` | `895e774587289cb0b4a6bbfed9270b232f4c4643412b33e35b7ca8951c566cdb` |

重跑命令見 [Go audit](../benchmarks/go/boolean-semicolon-audit.md)。後續優化更新同一份報告，保留原始失敗、較慢樣本與不同測量版本。
