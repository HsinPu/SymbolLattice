# 語言驗證程度與搜尋速度報告

文件跟隨版本：`v0.549.1`。更新日期：2026-10-02。本次實際量測產品：`v0.549.0`（`54893be20020208866c5e8daae7863196f7ccaf7`）。

本報告集中列出全部 58 種語言／格式的驗證範圍、查找結果與速度，後續優化更新同一份文件。所有數值均保留測量版本；純文件升版不把舊數據改稱新版本實測。

## 如何閱讀

「本輪最小驗證」來自 [58 種語言內容檢查](../benchmarks/languages/depth-matrix.mjs) 與獨立手寫的 [最小真值](../benchmarks/languages/nonempty-depth-scorer.mjs)。55 種檢查宣告／資源，7 種另檢查一個確定呼叫，3 種檢查原始模板引用；全 58 種另通過發現、掃描與檔案身分檢查。模板原始引用未經跨檔解析，小型案例不提供整個語言的 precision、recall 或速度。

「歷史證據」照錄 [能力與限制來源](../src/domain/language-depth.ts) 的版本、證據類型與最高已登記範圍。本輪沒有重新執行每個歷史外部 oracle；`project` 代表其中有部分跨檔能力。完整型別、動態行為、框架及語法覆蓋須逐項閱讀該來源的 `knownLimitations` 與 [驗證紀錄](../benchmarks/README.md)。表內分類不代表完整跨檔解析或各語言達到相同深度。

「目前固定任務」依真值預先指定的第一個必要檔案語言歸類。查詢仍在整個真實專案執行；跨語言專案及只用數個題目的速度，不能用來比較語言本身的快慢。本輪有 3/58 種語言的實際任務速度；其餘 55 種未測量，後續仍需補驗。

## 每個語言的範圍與目前結果

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
  --updated-on 2026-10-02 --output docs/language-verification-and-speed.md
```
