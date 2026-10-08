# 語言驗證程度與搜尋速度報告

文件跟隨版本：`v0.550.4`。更新日期：2026-10-08。完整主表量測產品：`v0.549.0`（`54893be20020208866c5e8daae7863196f7ccaf7`）；最新局部查找與速度補驗另列於文末。

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


## v0.550.3：首次初始化重複工作

更新日期：2026-10-08。產品比較：v0.550.2（commit `77a8a51396889ea234e140ef2135d58da507a0e2`）與 v0.550.3；這是維持對外契約的效能修正，採 patch。既有 58 行主表、歷史查詢時間及未量測範圍不改稱本版實測。

NestJS 的診斷 CPU profile 顯示，方法呼叫的保守 mutation 判定會反覆走訪同一 AST，TypeScript 模組解析也會重複存取相同路徑。候選版重用每個 AST 根的呼叫／賦值／刪除候選，保留原有接收者、別名、prototype、escape 及巢狀類別邊界檢查；每次掃描另建立獨立 TypeScript 模組快取，原選項、移除 paths、移除 paths/baseUrl 三種解析各自隔離。下一次掃描重建快取，新增／刪除檔案與設定變更仍會重新判定。原始 facts、resolver、source-search 版本及索引格式均不變，不因本項效能修正重新初始化既有索引。

### 固定來源與首次索引時間

- nest：https://github.com/nestjs/nest；commit `35c3ded6dbf3f23f917ae88d0ed966932788cae6`。
- fastify：https://github.com/fastify/fastify；commit `70b14e92c0b55e8201f5530ba2e6bab4e928c784`。
- grpc：https://github.com/grpc/grpc-go；commit `d96c2ef4f3339142d20a47797d8a5a4fae948607`。

使用 [paired-init](../benchmarks/mcp/paired-init.mjs)，Windows x64、Node.js v24.19.0。每個專案四對交替執行，共 24 次首次初始化。每次使用新的 checkout 與不存在的索引，沒有執行其他測試或 benchmark；OS 檔案快取未清除，並非冷磁碟量測。量測後環境核對回報 Windows 10.0.19045、CPU `Genuine Intel(R) CPU 0000 @ 2.00GHz`、47.88 GiB RAM；兩次 logical CPU 回報為 16 與 64，量測時未保存 CPU affinity，不將這些後核對資料當成固定硬體條件。git clone、完整資料核對及 SQLite integrity_check 均在計時之外。下表為四筆的上中位數；CLI 時間包含啟動、索引、狀態、diagnostics 與結束，索引階段則取產品的 monotonic operationPerformance。各階段中位數不一定相加等於整體中位數。

| 專案 | 已索引檔案 | v0.550.2 CLI 秒 | v0.550.3 CLI 秒 | 變化 | 索引階段秒（舊 → 新） |
| --- | ---: | ---: | ---: | --- | --- |
| nest | 1738 | 47.89 | 37.39 | -21.94% | 47.35 → 36.78 |
| fastify | 338 | 12.56 | 12.32 | -1.92% | 12.07 → 11.79 |
| grpc | 1107 | 19.53 | 19.44 | -0.49% | 19.01 → 18.91 |

| NestJS 階段 | v0.550.2 ms | v0.550.3 ms |
| --- | ---: | ---: |
| scan | 8494.91 | 8549.00 |
| extraction | 15304.03 | 11395.77 |
| resolution | 14871.34 | 7887.12 |
| persistence | 8287.93 | 8606.84 |
| status-read | 430.04 | 427.24 |

這是三個固定來源的首次初始化結果；小樣本及檔案快取變異不建立 SLO、統計顯著性或所有語言的加速承諾。Fastify 與 grpc-go 保留作對照，較慢樣本也列在原始紀錄。修改來源的增量同步、service 查詢、CLI 查詢速度、MCP transport、完整 Agent 任務與補查成本均未在本批重新量測。累計仍只有 4/58 種語言有歷史任務查詢速度，其餘 54 種未量測。尚未取得使用者遇到 init 緩慢的專案資料及實機耗時，不能將此結果當成該專案的完成時間。

### 品質與來源核對

24 次初始化的完整 raw facts、graph（符號、關係及其證據、pending references）、設定身分、來源及 FTS corpus 均與各自基準完全相同；僅排除 generation ID 及 indexedAt。三個固定專案共 3183 個已索引來源，每次均另讀 pinned checkout 核對內容，SQLite integrity_check 與 foreign_key_check 通過。完整相等只證明本次未改變既有輸出，不證明基準解析已完整或所有關係都正確。

另以既有五份固定任務 manifest 執行 [task-retrieval](../benchmarks/mcp/task-retrieval.mjs)，兩個產品讀同一個新索引，避免世代及時間戳差異。真值未調整，逐筆核對完整回應、來源片段、詞彙及圖證據。必要檔案只按主要 focuses/match 計分；來源涵蓋可包含補充 windows，不能互相替代。TP 包含預先指定補充檔案，FN 只計必要檔案；未判定輸出不當作 FP，整體 precision 未量測。

| 專案 | 題數 | 必要檔案（兩版） | 指定來源（兩版） | TP / FP / FN / 待核對（兩版） | 比較 |
| --- | ---: | --- | --- | --- | --- |
| nest | 5 | 7/7 | 13/13 | 10 / 0 / 0 / 10 | 完整回應相同 |
| fastify | 2 | 4/4 | 7/7 | 6 / 0 / 0 / 2 | 完整回應相同 |
| grpc | 2 | 2/3 | 5/13 | 2 / 0 / 1 / 6 | 完整回應相同 |

grpc-go 已知 Serve 查找與流程來源的既有缺口仍保留；回應相同不是完整任務驗收。新增測試核對同一 catalog 下一次掃描能看見 missing → present → removed → 設定重新映射；原有 runtime mutation 反例、巢狀邊界及框架測試保留。型別檢查、建置、527 項相關測試、全套 3498 項測試（四項既有略過）及 58 種最小契約通過；本批沒有重跑所有語言的大型語料 oracle。

### 產物與重跑

凍結 dist SHA-256：baseline `443be69a3d097fd95813d6ca2e31d3c842f03c657d6b40c786f96169fd743457`；candidate `6ae154f8cd69a8d3a835c8f6e75c93ad00320d2dc887f98034ae5045f23b0350`。原始來源、索引、個別樣本、完整 init JSON、parity digest、診斷 profile、固定任務結果與檢查 log 位於 `%TEMP%/SymbolLattice-v5503-init-validation`；產品在 `%TEMP%/SymbolLattice-v5502-boolean-candidate` 與 `%TEMP%/SymbolLattice-v5503-init-candidate`。原來源及舊索引未修改。profile 不納入受控速度數據。

| 產物 | SHA-256 |
| --- | --- |
| `nest-init.json` | `dd1812939a46d88ebeccdfee17e052cc3c6638421d243e0b3bdd1017004fdb97` |
| `fastify-init.json` | `fe16faa706ade19d639f9e254e8003597a335359804a505b679efc3df2e59ae2` |
| `grpc-init.json` | `17b0366ac17a4ec9cb04d97ee6b01b9b0e990f3fe2da0943853bd7e0d01084b7` |
| `quality.json` | `8cb217014b5a9908997ecc93ae47d83d682ddf98553c3ab1d2707c9691523332` |
| `final-audit.json` | `7706ed15f96a8a2229edf5b4bc7f71327c5236379c7d2fc6dc0a49dcee093529` |
| `guards.json` | `80cb14561e5c35eedb12e3a7f10886bae7127f2c44e735a20024255b78a322bd` |
| `quality.mjs` | `7dc969453aa782b7c14d93dc8565041fb8d2165e502eb66b8702c3de2e6f399e` |
| `audit.mjs` | `00ee811a91449f01a39059f744e240b0c592b3ea0a3438e9738258856d878ad0` |
| `report.mjs` | `fca275ec78e3679f18f486d29187eb399c1e3e507fe8d658d4d68f1cd3ed19ed` |

先備妥上述固定 commit 的乾淨來源、兩版獨立 built root；work 與 output 必須在產品及語料之外。每次重跑指定全新 workspace，工具拒絕覆用且不刪除既有索引。以 NestJS 為例，Fastify 與 grpc-go 換成各自 pinned checkout：

```powershell
$validation = Join-Path $env:TEMP "SymbolLattice-init-rerun"
New-Item -ItemType Directory -Path $validation
node benchmarks/mcp/paired-init.mjs --source-project <PINNED_NEST_CHECKOUT> --baseline-root <V05502_BUILT_ROOT> --candidate-root <V05503_BUILT_ROOT> --workspace (Join-Path $validation "nest-pairs") --output (Join-Path $validation "nest-init.json") --pairs 4
node benchmarks/mcp/task-retrieval.mjs --project <FRESH_INDEXED_COPY> --manifest benchmarks/mcp/nest-shutdown-tasks.json --product-root <BUILT_ROOT> --output (Join-Path $validation "quality.json") --repetitions 1
```


## v0.550.4：其他語言專案的首次初始化

更新日期：2026-10-08。本批檢查混合 Python/JavaScript、Java、C#、Rust、C++，並核對 NestJS/Fastify。維持查詢契約的效能改善與有效 Cargo 設定誤拒修正採 patch。58 行總表及未重新量測的歷史結果保留原版本。

Django profile 顯示 JavaScript 詞法作用域及父節點走訪的重複成本；以 WeakMap 在同一 parsed SourceFile 重用 scope ID 與唯讀 enclosing scope list，保留同名遮蔽及具名 function expression 私有 self 環境。JUnit profile 顯示 Java modern declarations/records 取得原生子節點的成本；三個 Java inspector 重用同一原生 AST 的子節點清單。新 AST 不沿用舊樹快取。未更改 grammar、extractor v437、resolver v212、source-search v1 或索引格式。

Tokio 的有效多行 Cargo description 原先觸發 INVALID_PROJECT_CONFIGURATION。Python 3.12 標準函式庫 tomllib 獨立確認 pinned checkout 的 13 份 Cargo.toml 可解析。讀取器現在保持多行 metadata 為不解碼的文字，不把其中的章節、依賴或註解當成設定；語意名稱與路徑的多行文字仍不作已確認解析。未擴張 Rust 巨集或動態解析能力。既有索引不需重建；含多行 Cargo 設定的舊索引透過版本化設定身分偵測 project-inputs-changed，一般 sync 重新解析，其他設定維持原身分。cargo-upgrade-lifecycle.json 核對舊版假依賴解析的移除與快取 facts 重用。日常修改使用 sync。

### 固定來源與執行條件

- django：https://github.com/django/django；commit `bc833e8883db4a333a6485d91637b78c85e2b13b`。
- junit：https://github.com/junit-team/junit5.git；commit `99a00b9bb82723d5aa573942b15618ec3f3ab396`。
- dapper：https://github.com/DapperLib/Dapper.git；commit `eb47546a408bbf6c178bda4f04dc205bc51ffbfe`。
- fmt：https://github.com/fmtlib/fmt.git；commit `10cda465edf19ed0303a0655b762ea752f8a0997`。
- nest：https://github.com/nestjs/nest；commit `35c3ded6dbf3f23f917ae88d0ed966932788cae6`。
- fastify：https://github.com/fastify/fastify；commit `70b14e92c0b55e8201f5530ba2e6bab4e928c784`。
- tokio：https://github.com/tokio-rs/tokio.git；commit `3eb95a40f1b88623470c4e902e2fa90e807fdeed`。

Django、JUnit 各兩對交替執行；Dapper、fmt、NestJS、Fastify 各一對診斷，共 16 次新舊比較初始化。Tokio 舊版失敗另留原始輸出；最終建置以兩個新 checkout 完成初始化及完整結果一致核對，共另 2 次成功。全部使用不存在的索引；clone、完整比較、來源及 SQLite 核對在計時之外。OS 檔案快取未清除，未隔離使用者其他背景程式，16 次比較初始化未同時執行其他 benchmark 或測試。Tokio 最終復原樣本另與最後型別檢查重疊，只作可完成與結果一致的核對，耗時為診斷。

Node.js v24.19.0、Windows x64、OS 10.0.19045、CPU Genuine Intel(R) CPU 0000 @ 2.00GHz、logical CPU 64、availableParallelism 64、RAM 47.88 GiB。計時前後自由記憶體 4.54–10.70 GiB；逐筆時間戳及環境保存於樣本。未固定 CPU affinity，這些條件不代表硬體隔離。

### 首次初始化時間

Django/JUnit 的兩筆取上中位數（較慢的一筆）；其他專案只有單次診斷，不能據此建立加速結論。CLI 含啟動、索引、狀態、diagnostics 與結束；索引階段使用 monotonic operationPerformance。RSS 為階段邊界最大觀測值，不是連續量測的真實峰值。

| 專案 | 每版樣本 | 已索引來源 | 舊版 CLI 秒 | 本批 CLI 秒 | 差異 | 索引秒（舊 → 新） | RSS 邊界 GiB（舊 → 新） |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| django | 2 | 3366 | 147.77 | 78.39 | -46.95% | 147.17 → 77.79 | 0.85 → 0.81 |
| junit | 2 | 2021 | 255.89 | 140.65 | -45.04% | 252.81 → 138.59 | 6.47 → 2.85 |
| dapper | 1 | 169 | 8.97 | 8.31 | -7.40%（單次） | 8.45 → 7.72 | 0.50 → 0.49 |
| fmt | 1 | 70 | 3.54 | 3.30 | -6.77%（單次） | 3.03 → 2.78 | 0.26 → 0.20 |
| nest | 1 | 1738 | 39.32 | 35.81 | -8.92%（單次） | 38.69 → 35.24 | 0.49 → 0.44 |
| fastify | 1 | 338 | 13.45 | 11.05 | -17.87%（單次） | 12.93 → 10.51 | 0.30 → 0.31 |
| tokio | 舊版失敗；修正版 2 次 | 833 | 無有效索引 | 11.46、10.43 | 無可比較基準 | 10.97、9.95 | 見原始階段資料 |

這是固定混合語言專案的完整 init，不能比較語言本身快慢，也不是統計顯著性、SLO 或所有專案加速承諾。Django 的改善來自其中的 JavaScript，沒有修改 Python parser。較慢階段及單次樣本均保留。

| 專案 | 實際索引語言／格式與檔案數 |
| --- | --- |
| django | python 2817、html 368、javascript 113、css 47、xml 14、markdown 4、yaml 3 |
| junit | java 1793、kotlin 154、markdown 26、properties 20、xml 16、yaml 5、groovy 4、css 1、html 1、shell 1 |
| dapper | csharp 157、markdown 7、xml 2、yaml 2、html 1 |
| fmt | cpp 47、markdown 9、python 4、c 3、properties 2、css 1、javascript 1、shell 1、xml 1、yaml 1 |
| nest | typescript 1606、javascript 53、markdown 44、proto 12、graphql 8、yaml 7、html 4、shell 4 |
| fastify | javascript 248、markdown 51、typescript 35、yaml 3、shell 1 |

| 專案 | 階段 | 舊版 ms | 本批 ms |
| --- | --- | ---: | ---: |
| django | scan | 21430.18 | 20193.19 |
| django | extraction | 94205.16 | 26461.04 |
| django | resolution | 5044.76 | 5509.86 |
| django | persistence | 25617.82 | 25574.23 |
| django | status-read | 1028.75 | 1100.80 |
| junit | scan | 8807.68 | 7055.80 |
| junit | extraction | 133272.69 | 75774.46 |
| junit | resolution | 25839.60 | 30781.89 |
| junit | persistence | 24267.81 | 16345.83 |
| junit | status-read | 72284.83 | 8627.01 |
| dapper | scan | 1645.12 | 1157.23 |
| dapper | extraction | 4844.07 | 4607.98 |
| dapper | resolution | 247.90 | 253.03 |
| dapper | persistence | 557.38 | 566.91 |
| dapper | status-read | 1158.18 | 1132.21 |
| fmt | scan | 1219.40 | 1008.29 |
| fmt | extraction | 833.04 | 827.01 |
| fmt | resolution | 168.86 | 174.45 |
| fmt | persistence | 468.42 | 430.82 |
| fmt | status-read | 339.51 | 342.82 |
| nest | scan | 11506.82 | 8630.01 |
| nest | extraction | 11405.90 | 10460.54 |
| nest | resolution | 8007.59 | 8260.15 |
| nest | persistence | 7488.20 | 7461.60 |
| nest | status-read | 277.32 | 428.60 |
| fastify | scan | 3096.78 | 1929.33 |
| fastify | extraction | 6079.09 | 4893.46 |
| fastify | resolution | 883.07 | 851.40 |
| fastify | persistence | 2766.07 | 2735.11 |
| fastify | status-read | 101.92 | 95.40 |

### 品質、版本與限制

16 次比較的完整 raw facts、graph（符號、關係及來源、pending references）、index inputs、source documents 與 source-search corpus 均與各自基準相同，排除世代及 indexedAt；Tokio 兩次修正版也相同。每份 source document 另讀 pinned checkout 核對 UTF-8，SQLite integrity/FK 通過。這是保留既有結果的證據，不是解析完整性的獨立真值。

建置依修正階段凍結：Django/JUnit/Dapper 使用 scope/Java 快取階段；fmt/NestJS/Fastify 使用修正 Cargo description、尚未加入設定身分升級的階段；Tokio 的本表使用含快速新鮮度升級的最終建置。獨立比較先前 764 個 dist 檔案與最終 767 個檔案，只有 Cargo reader、project-inputs、configuration-discovery 及其 source map 改變，另新增 cargo-manifest-identity 三個產物；所有 extraction/query 資產完全一致。各筆 init JSON 固定並保存實際 fingerprint。沒有把前階段計時冒充最終整包量測；新舊完整查詢回應核對使用最終建置，Tokio 沒有可用舊版回應。

[task-retrieval](../benchmarks/mcp/task-retrieval.mjs) 共 17 題。Django/NestJS/Fastify 使用既有固定真值；Java/C#/Rust/C++ 八題在第一次產品查詢前獨立讀來源固定，涵蓋已知符號與未提示答案符號的探索。新題只驗證有界檔案／來源保留，不是編譯器、型別、巨集或完整跨檔流程 oracle。主要 focuses/match 才計必要檔案；補充 source windows 不補入主要 recall。未判定結果不作 FP，整體 precision 未量測。

| 專案 | 題數 | 必要檔案 | 指定來源 | TP / FP / FN / 待核對 | 完整回應比較 |
| --- | ---: | --- | --- | --- | --- |
| django | 2 | 4/4 | 11/11 | 4 / 0 / 0 / 3 | 兩版相同 |
| nest | 5 | 7/7 | 13/13 | 10 / 0 / 0 / 10 | 兩版相同 |
| fastify | 2 | 4/4 | 7/7 | 6 / 0 / 0 / 2 | 兩版相同 |
| junit | 2 | 1/2 | 0/3 | 1 / 0 / 1 / 7 | 兩版相同 |
| dapper | 2 | 0/2 | 0/4 | 0 / 0 / 2 / 8 | 兩版相同 |
| tokio | 2 | 1/2 | 2/5 | 1 / 0 / 1 / 5 | 僅修正版，舊版無法初始化 |
| fmt | 2 | 0/2 | 0/2 | 0 / 0 / 2 / 4 | 兩版相同 |

- dapper / `known-query-implementation`：嚴格來源核對失敗，Source text mismatch: Dapper.Rainbow/Database.cs；片段缺少起始空白行；新舊回應相同，保留 actual/expected，未列為驗證通過。
- dapper / `unhinted-database-reader-query`：嚴格來源核對失敗，Source text mismatch: Dapper/SqlMapper.Async.cs；片段缺少起始空白行；新舊回應相同，保留 actual/expected，未列為驗證通過。
- junit / `known-equality-assertion`：必要檔案 recall 1，指定來源 recall 0，已判定 FP 0；首輪缺口保留。
- junit / `unhinted-integer-assertion-failure`：必要檔案 recall 0，指定來源 recall 0，已判定 FP 0；首輪缺口保留。
- dapper / `known-query-implementation`：必要檔案 recall 0，指定來源 recall 0，已判定 FP 0；首輪缺口保留。
- dapper / `unhinted-database-reader-query`：必要檔案 recall 0，指定來源 recall 0，已判定 FP 0；首輪缺口保留。
- tokio / `unhinted-duration-timer-future`：必要檔案 recall 0，指定來源 recall 0，已判定 FP 0；首輪缺口保留。
- fmt / `known-formatting-error`：必要檔案 recall 0，指定來源 recall 0，已判定 FP 0；首輪缺口保留。
- fmt / `unhinted-format-error-exception`：必要檔案 recall 0，指定來源 recall 0，已判定 FP 0；首輪缺口保留。

保留第一次結果，未依產品輸出重寫真值或調整查找規則。完全相同不代表通過完整任務驗收；quality.json 保存實際 taskRetrievalAcceptancePassed。C# 原工具嚴格核對的失敗保留於 quality-first-failure.log；外部觀測副本只攔截該特定錯誤，記錄 failed 及 actual/expected，沒有降低通過標準，也未改產品或已提交的驗證工具。原工具與副本 hash 見 observer-provenance.json。未量測修改來源的增量 sync、service 查詢速度、MCP transport 或完整 Agent 補查成本；單次 CLI 查詢時間只供診斷。歷史 service 速度仍為 4/58，其餘 54 種未量測；本批沒有重跑全部語言大型 oracle，也未直接量測使用者另一台電腦的原專案。

### 檢查與原始產物

兩項具名 callback 編輯／遮蔽回歸測試及九項 Cargo 多行文字反例與兩項舊設定身分回歸已新增；相關測試 126、38 項（有重疊）及 Cargo/input/configuration 的相關測試通過。型別檢查與建置通過；全套 3,511 項通過、4 項略過；58 種最小語言契約及 benchmark 拒絕覆用／保護產品目錄的檢查通過，見以下 log；最小契約不代表全部大型語料驗證。

預備 scope-only 建置的 Django 三對保留於 django-init.json，不併入正式統計。初次 JUnit candidate checkout 因 Windows 檔名過長失敗，還沒開始 init；checkout-failure.json 及該次 baseline 保留。工具以 local core.longpaths=true 建立新 checkout。兩份 CPU profile 只作診斷，不計入時間樣本。Tokio 原始失敗亦保留，沒有當成環境缺失略過。Cargo 修正中途兩組 Tokio 重複 init 另存 tokio-recovery-init.json 與 tokio-upgrade-init.json，均不併入最終初始化統計。

baseline dist SHA-256：`6ae154f8cd69a8d3a835c8f6e75c93ad00320d2dc887f98034ae5045f23b0350`。快取階段 candidate：`294e39236099f2309c7d720d81f9aa0e4d4c295148887f935934ec154e21e923`；含新鮮度處理的最終 candidate：`eb7c393584b3b5ef31078cf8c67be1a299a959d8bc1caf0123aa8426fd2f9d97`。根目錄依序為 `%TEMP%/SymbolLattice-v5503-init-candidate`、`%TEMP%/SymbolLattice-v5504-native-candidate`、`%TEMP%/SymbolLattice-v5504-freshness-candidate`。全部來源、索引、JSON、profile、環境與 log 位於 `%TEMP%/SymbolLattice-v5504-init-validation`。

| 產物 | SHA-256 |
| --- | --- |
| `django-final-init.json` | `d1ceda92e59081acf4d03661282ed7fcbb2191ff743a1818f0db9bee85cf31db` |
| `junit-final-init.json` | `35780ecc36c565d7923ecbc1256ed981c814e903b3e41e881eedf3501dc1260e` |
| `dapper-final-init.json` | `db017b5773b3699d71620ad1297ffd3a4ebf5142276b115c9e0a28d45c4fd771` |
| `fmt-final-init.json` | `d27c78e5a13470e5535f891f67f9fe848e78e05608921ed7cb1c925431857994` |
| `nest-final-init.json` | `3b1f2da56bbd340f68955d64adda790989ac76106f8d3f9f98cb20c994a42433` |
| `fastify-final-init.json` | `7130a69d40785d205f7d1e8d42ef9c9437af6e303d672ad6514a33d5558af09e` |
| `quality.json` | `5cef4e799bd28eddb34d3fab49f2369cc8a599e150bc6444d83215b5a008efb8` |
| `quality.mjs` | `02387b997c91e5c3452e13c167cbec0e1af2eff3a499cb3be2190babfa23ad15` |
| `profile-summary.mjs` | `644c354d89cc6a3ac2fe5ede8e353198e86dc6fdf8f571bc1891161ae2dd04cb` |
| `django-baseline-init.json` | `4188aae9759c043220c54cdf339bca9703bc55c7c030e5e6eb105dc67761f90b` |
| `django-baseline.cpuprofile` | `ef65fd8374d8d4c310d35b95a3abfaa6f80add970acb986c712885d9a8a3b783` |
| `django-init.json` | `ff8d7ff7cb96137d9931cd5d408a0ba48869880fd87a10ea0f19f2773b315c8c` |
| `junit-baseline.cpuprofile` | `7c9155aa853d5cb4caf774c8fce5f9214610d3d84c0038e865d3415cb8f8f6bf` |
| `junit-profile-summary.json` | `84e6153eccde7a306f25c770b9eae72bfe31c01316b344083292f97d457d4588` |
| `junit-baseline-profile-init.json` | `3f5ebdcf37427004f0bf04f59cb13cb9a805b9c0a547716aa0aa0b7d53da6fa3` |
| `checkout-failure.json` | `90d60a787840ce35cfaeb2f8e06e901dfde62f965cfbced8f89ed8added7c9bc` |
| `tokio-final-validation-init.json` | `799dd9f3d970f1ccf318cacc26e0603937ea4b3561c75710ef28e0cfe022f209` |
| `tokio-baseline-failure.json` | `ee2b3da76938a10909ffe12c3a62fa65318d3d9e45f8e8543c1f265df2bd5684` |
| `cargo-independent-validation.json` | `a024fabbece5889a9b836d45119933091084f801d8b29c518794bae3071b457a` |
| `build-stage-bridge.json` | `059f00927e4146db3405d3f8d97905273699d9c1248ed48660d0c5cf8160a39a` |
| `cargo-upgrade-lifecycle.json` | `a95cacf79d1590bb2a23d33c77ad78dfc517999be0902aa567bfd6c3318f04f6` |
| `quality-first-failure.log` | `be33d3357c935b45cd2ad8fa641ac5f3d4776841c9c3897f281788dbe68f33d5` |
| `observer-provenance.json` | `3b2e7b84bac28b40887d47713b3168d9be4cc17d5a7d3f87074bf5742e562764` |
| `task-retrieval-observed.mjs` | `6f7c677cfb8e9823c547e7e46ce991b5f53af8c18aa9aeb26a47724a0cfc098d` |
| `final-bridge.py` | `9ba16729b593837081f562e8e16e8b6ea767fe66db016d086b8572064f55d323` |
| `summary.json` | `b76f0e8c19421f523a01f9e0924a42b7456f8b9a4a69be963d25dbd3ef1dddfc` |
| `audit.mjs` | `d9e52f2b515a485523c7dcc2fde26a829ba7abc1801359291d6ebb8ae6325f86` |
| `document-audit.mjs` | `a7e763ca07bc3ebe219fb7d4713a56482fdcb82973c0f7e573472cd694a75fc7` |
| `check.log` | `6dd53f1eb7a88d261e9a9cddce139862204aa34c454f081cef45f13e783b7417` |
| `build.log` | `39c96357f3442e84797d1ac299825ab00d9656767434c6abc5dd182625e4d180` |
| `focused-test.log` | `a821f8a06c6627408516915f9cb639d95a1804d077b422052fafa53a1604544f` |
| `native-focused-test.log` | `d3ed7d71e9f4d2386962c39d55eea4b0c3497e996fa2e9ce99b3fcf01327f0c8` |
| `cargo-focused-test.log` | `0bdcba56207ab63ded9983442cf4b59c3e2a419cf0d6db9b4a859b16e7b81390` |
| `full-test.log` | `8854aab80b252f683d67774f7a262ec7e23c7baa6d9c3c7bae8fd1e5f27aef75` |
| `language-depth.log` | `9d396426cdb02e6130185a10feb8042b0d0a374f9ec9f0422c9b776b2f44ee44` |
| `guards.json` | `d7befc6fa791929d046e854cb90a8e826b0465a7b3e4532a48d930193333bd65` |

備妥 pinned checkout 及相應凍結建置，指定尚不存在的外部 workspace。Django/JUnit 用兩對，其餘單次診斷用一對；Tokio 重跑用最終建置同時作 baseline/candidate，只檢查重複結果，不能作新舊速度比較。

```powershell
node benchmarks/mcp/paired-init.mjs --source-project <PINNED_CHECKOUT> --baseline-root <BASELINE_BUILT_ROOT> --candidate-root <CANDIDATE_BUILT_ROOT> --workspace <NEW_EXTERNAL_WORKSPACE> --output <EXTERNAL_REPORT.json> --pairs 2
node benchmarks/mcp/task-retrieval.mjs --project <FRESH_INDEXED_COPY> --manifest benchmarks/mcp/dapper-init-retention-tasks.json --product-root <BUILT_ROOT> --output <EXTERNAL_TASK_REPORT.json> --repetitions 1
```
