<div align="center">

# SymbolLattice

**可查詢、可解釋、證據優先的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.327.0 是開發預覽版。MCP 查詢工具唯讀；但 `serve --mcp` 預設會啟動獨立的本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用它。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢含證據的結構脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 以檔案與 symbol 線索規劃跨檔案探索
node dist/cli/main.js explore "Trace src/api/orders.ts createOrder to persistOrder" --project /path/to/project --json

# 以一個共享來源預算組合多個 symbol 的脈絡
node dist/cli/main.js context "src/api.ts#route" "src/service.ts#load" --project /path/to/project --source-character-budget 12000 --json

# 分開輸出可核對的 signature 與文字命中片段，不合成不存在的原始碼
node dist/cli/main.js investigate "user token" --project /path/to/project --source-render-mode multi --json

# 將不可變 Git hunk 歸因限縮到一個精確檔案或目錄
node dist/cli/main.js git-hunks /path/to/project --base origin/main --path-prefix src/domain --json

# 限縮 Git 變更，並只選指定模式的受影響測試
node dist/cli/main.js affected --working-tree --project /path/to/project --path-prefix src/domain --test-pattern "scenarios/**/*.scenario.ts" --json

# 以唯一後綴定位，逐行閱讀同一 generation 的原始碼
node dist/cli/main.js file service.ts --project /path/to/project --offset 1600 --limit 120
```

也可從 [GitHub Releases](https://github.com/HsinPu/symbol-lattice/releases) 下載版本固定的 `.tgz`、SHA-256 與 manifest，再用 npm 安裝 `.tgz`。每個標籤發行都會先驗證完整測試、乾淨安裝與產物證明。

## 核心能力

- Java try-with-resources 支援明確型別與 `var = new DirectType(...)` receiver，並依宣告順序讓較早資源可用於後續 initializer；目前資源名稱會在自身 initializer 形成 fail-closed 遮蔽邊界。binding 延伸至對應 try body，但不會洩漏至 catch、finally 或外部；v5 receipt 保存資源序號、宣告、initializer、try body、scope 與 canonical type 證據。
- Java 未初始化的明確型別區域變數，可在同一 lexical block 的直接 `receiver = new DirectType(...)` 賦值後作為 member-call receiver；也支援完整 `if/else`、3 至 8 分支的 bounded `if/else-if/else`，以及 2 至 8 個 arrow rule、具有唯一終端 `default` 的 bounded `switch` 合流。每個分支／arm 必須只含一次相同 receiver 的直接建立物件賦值，且建立型別須與宣告型別相同或由 exact hierarchy 證明 reference widening。缺少終端分支、冒號 fallthrough、block rule、額外敘述、selector／condition 內賦值、不相容型別、超過界限及後續重新賦值都 fail closed。v6–v9 receipt 保存宣告、scope、順序、界限、selector／condition、label、賦值與 initializer range、canonical types、相容性決策及完整 hierarchy path。

- TypeScript 函式、類別與介面方法、建構子、具型別 arrow／function expression，以及函式型別變數的輸入／回傳型別會形成 exact `accepts`／`returns` 關係。只接受可證明的本機、type-only import 或 re-export 型別；外層與函式泛型參數、內建包裝型別、qualified name 與未匯入同名型別不會被猜成精確關係。
- Java 類別／介面方法與建構子會保留參數及回傳型別來源範圍，並只在明確 import、完整限定名稱或唯一同 package top-level type 可證明時形成 exact `accepts`／`returns`。泛型參數、wildcard import、未匯入同名型別、nested type 與 classpath 推測都保持不解析。
- Java 可沿 `Factory.create().execute()` 靜態 factory chain，以已證明的 top-level 回傳型別解析兩段 exact `calls`。factory method set 支援 class 繼承、hiding 與 bounded owner precedence；public、同 package package-private／protected，以及可證明 caller 為 owner subclass 的跨 package protected static 均可解析。interface static 不會被繼承；private、不合法的 package inheritance、未知型別、boxing／泛型等情況保持不解析。`callType`、`callDispatch` 與 access receipt 會揭露 invocation kind、signature、owner、package、bounds 與逐段 hierarchy edge。
- Java 明示的 `this.method()`、`super.method()`、具有直接 reference type 的 parameter／block-local／enhanced-for／catch／明示型別 lambda／field receiver、正向 `instanceof DirectType name` pattern，以及 `var receiver = new DirectType(...)`，會重用相同的 overload、method-set 與 access 證據。直接 pattern binding 只在精確 true block 內生效；pattern 位於最左側時，另支援總數 2–8 個 operands 的 `&&`，包含可由 AST 完整正規化的左右括號分組，binding 會逐段延伸至後續 leaf operand 與 true block。單一 `&&` 保留 v11 receipt，未分組多段 chain 使用 v12；含 logical grouping 的 v13 另保存每個 leaf 的 left／right／parenthesized path 與括號 ranges。`||`、pattern 非最左端、超過 8 operands、assignment、語法不完整、無大括號、泛型 pattern、false branch 與區塊外都保持不解析。欄位支援裸名稱、`this.field`、`super.field`，以及由明確 import、同 package 或完整限定名稱證明的 `TypeName.FIELD.method()`。型別限定 lookup 只接受 static field，可沿 exact class／interface 圖處理父類欄位、介面常數、hiding、class precedence 與歧義；public、同 package 連續繼承路徑及宣告類別 private-self 可解析，跨 package protected qualifier 暫時保持不解析。區域或 caller 階層的同名值遮蔽、instance field hiding、不可存取／未知型別、循環、多重 owner、界限與 static context 違規都 fail closed。`var` 只接受非泛型直接 object creation；除已證明的同區塊直接賦值與 bounded 完整 `if/else`／`if/else-if/else`／arrow-rule `switch` 合流外，迴圈、一般重賦值、nestmate private 與 classpath 推測仍保持不解析。`super.method()` 仍要求唯一 exact 直接父類並保留完整路徑。
- `explore` 同時支援精確 symbol 與有界問題模式。明示的安全專案相對路徑優先；強 lexical seeds 還可沿 `calls`、`instantiates`、`overrides`、`routes`、`handles`、`accepts`、`returns` 與繼承類 exact 關係，找回最多 2 hops 內沒有文字命中的 production 候選，上限為 8 個檔案、16 個 symbols、每檔 2 個。一般問題不會用未要求的 test／icon／localization 候選作為 seed，也不會沿 heuristic、unresolved 或低權重關係擴展。receipt 會揭露 seed、逐段方向與 edge、佐證 seed 檔案數、資源上限、拒絕原因與截斷；已納入候選的 receipt 會優先保留。之後再結合 exact one-hop graph mass、最多 4 hops 的有界 graph diffusion、persisted generated worth（`0.3`）及 test／icon／localization worth（各 `0.5`）。最終選取仍限制為 4 個檔案、8 個焦點、每檔 2 個焦點、16 條連線與 4 hops exact path。
- low-value filter 後會套用 file-level relative score floor：每檔只採最高候選分數，門檻為最高檔案分數的 20%，並限制在 80–120。薄弱結果以正分數證據為底、目標回填到 3 個檔案；不會用同檔 symbol 數灌高分數。CLI／MCP receipt 會揭露門檻、aggregation、回填與最多 16 個排除檔案。
- `explore` 的主要摘要、exact 呼叫位置與橋接視窗共用 24,000 字元硬上限。額外視窗會沿用焦點與 spine 的原始 relevance，再只套用一次相同的 persisted generated byte worth：生成來源為 `0.3`，低於最高有效權重 15%（門檻最高 10）時只保留可見 receipt，exact path spine 不受 cliff 影響。複數視窗最低 256 字元，單一視窗的基礎配置最多 70%；未選取的 exact bridge 另可透過 15%／800 字元 grace，或 60% coverage 加共享 15% buy pool 擴成同世代完整檔案。回傳會揭露 classifier 規則、權重、cliff 與整檔決策。
- `explore`、`context`、`node`、`investigate` 與 `file` 共用 session／project／generation 來源 coverage。只有 UTF-16 offsets、內容與 SHA-256 offset map 都可驗證，且符合 160 字元節省／新內容門檻與最多 4 段限制時，才回傳 back-reference 或新 fragments；否則完整重送。`sourceSessionMode: "full"` 可停用去重。
- `context` 將最多 8 個參照的 persisted source 放入同一個 2,048–64,000 字元預算，依輸入順序配置並回傳逐參照 allocation、截斷原因、實際輸出量、來源身分與 offset map；CLI 與 MCP 都可指定 `sourceCharacterBudget`。
- 每段已傳送、已覆蓋與新 fragment 都可附 `mcp-source-pointer-v1`：專案相對路徑、精確行列、原始檔 offsets、最多 5 個重疊 symbol、可讀 `file:Lx-Ly (symbol)` 與 SHA-256 receipt。CRLF、CR、Unicode 行分隔與部分片段會重新定位；顯示證據不足時只省略 pointer，不影響來源相等性判定。
- `investigate` 以 2,048–64,000 字元的共享 declaration-source 預算配置同一 active generation 的精確片段。`adaptive` 保持單一連續輸出；也可指定 `prefix`、`focused`、`signature`，或用 `multi` 分開取得最多兩段可獨立核對的 signature 與焦點原始碼。每段都有穩定 ID、SHA-256、範圍與省略 gap；不會合成不存在的文字，證據或預算不足時會明確降級。
- 將多種語言與常見框架掃描成專案本機程式碼圖譜。
- 查詢 symbols、files、calls、routes、entrypoints、impact、history 與 diff。
- 每條關係保留規則、階段、候選目標、信心度、解析路徑與來源範圍。
- 索引時會保存 generated 與 production／test／icon／localization 來源角色證據；`files` 可直接查看分類版本與命中規則。舊 generation 不會依即時路徑靜默重判，規則版本變更會要求 `sync` 重建投影。
- `files` 僅查詢 active generation 已保存的檔案，支援目錄邊界正確的路徑篩選、anchored glob、flat/tree/grouped 投影與安全游標分頁；`src` 不會誤含 `src2`，游標會綁定 generation 與篩選條件。
- `file` 預設提供精簡的逐行閱讀畫面，附依賴、選取方式、generation 與 freshness；`--json` 保留穩定機器契約。精確路徑優先、接受唯一後綴，遇到歧義不猜測，offset 超過 EOF 會明確失敗；YAML 與 properties 只顯示結構，不洩漏內容值。
- 擴充框架的 route plugin 可精確解析同檔案與跨檔案固定 prefix mount；`explain-edge` 會顯示每段 mount 與 ESM import／re-export 路徑。動態或模糊組合不會被猜測成路由。
- 專案可註冊有版本的 reference resolver plugin，僅處理內建解析器留下的未解析關係；宿主會限制候選、驗證結果，並將衝突、例外或不安全選擇保留為可解釋的 unresolved 證據。
- framework fact plugin 可從框架語法新增受驗證的 symbols、routes、entrypoints 與 pending references。穩定 ID、containment edge、輸出上限、來源範圍與 provenance 都由宿主控制。
- framework project plugin 可在單檔抽取完成後檢視凍結的全專案 facts，新增跨檔案 pending references 與受限的 route-prefix projection；路由 ID、關係搬移、外掛 provenance 與逐段 mount 證據都由宿主建立。

## 外掛擴充

```js
// plugins/acme.mjs
export const symbolLatticePlugin = {
  schemaVersion: 1,
  frameworkFactPlugins: [{
    id: "acme/framework-facts",
    version: "1.0.0",
    languages: ["typescript"],
    extract: () => ({ symbols: [], references: [] })
  }]
};
```

```bash
node dist/cli/main.js init /path/to/project --plugin ./plugins/acme.mjs
```

同一份 manifest 可提供 `frameworkFactPlugins`、`frameworkProjectPlugins` 與 `referenceResolverPlugins`。`--plugin` 可重複使用，且會沿用至 `watch`、`watch-start`、`watch-restart`、MCP 設定、安裝、診斷與卸載。外掛是受信任的同程序 JavaScript，不是 sandbox；SymbolLattice 不會自動探索或執行專案內的模組。預設只接受 real path 位於專案內的 `.js`、`.mjs`、`.cjs`，外部路徑必須明確加上 `--allow-external-plugin`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `watch-start [path]` | 預覽或明確啟動一個可管理的背景自動同步 host。 |
| `watch-restart <host-id> [path]` | 以單一核准交易安全替換一個 foreground watch host。 |
| `watch-status [path]` | 唯讀檢視索引 freshness、持久化事件與本機 host 的 live／stale／unverifiable 狀態。 |
| `watch-stop <host-id> [path]` | 預覽或明確要求一個已登錄 host 自行安全停止。 |
| `files [path]` | 以 glob、投影與 generation-bound 游標分頁列出已保存檔案。 |
| `file <path>` | 預設逐行閱讀；加上 `--json` 取得穩定契約。 |
| `git-hunks [path] --base <ref>` | 以可選的 `--path-prefix` 篩選不可變 Git hunk 與宣告歸因。 |
| `affected --working-tree` | 以 `--path-prefix` 限縮 Git 變更，並可用 `--test-pattern` 取代預設測試命名規則。 |
| `explore <query>` | 以精確 symbol 或有界問題取得排序焦點、連線與保存來源。 |
| `investigate <query>` | 將文字線索展開為結構脈絡。 |
| `context <reference...>` | 以共享來源預算組合多個 symbol 與相鄰證據路徑。 |
| `impact <symbol>` | 沿精確靜態關係進行有限影響分析。 |
| `explain-edge <edge-id>` | 查看一條關係的完整證據。 |
| `upgrade [version]` | 預覽、驗證或明確套用 GitHub Release 升級。 |
| `serve --mcp` | 啟動 MCP stdio host。 |
| `mcp-doctor <target>` | 唯讀診斷 Agent MCP 設定、CLI 與索引。 |
| `mcp-install <target>` | 預覽；加上 `--apply --yes` 後安全寫入 MCP 設定。 |
| `mcp-uninstall <target>` | 預覽；加上 `--apply --yes` 後移除相符的 MCP 設定。 |

`watch-status` 只以 PID signal-0 探測程序是否存在，不會啟動、停止或同步 watcher。PID 重用無法證明程序身分；journal 狀態也只代表有界視窗中的最新證據。

`watch-start` 預設只產生唯讀計畫。套用時必須同時提供 `--apply --yes --approval <fingerprint>`；approval 綁定專案、Node／CLI 路徑、啟動參數與可執行 JavaScript 的 SHA-256。它不經 shell 啟動背景 `watch`，並在回傳成功前核對 host ID、PID、版本與登錄狀態；若登錄逾時，不會對未知程序發送訊號。

`watch-stop` 預設只產生綁定專案真實路徑與完整 host 紀錄的 approval。套用時必須同時提供 `--apply --yes --approval <fingerprint>`；它只寫入短效本機請求，由目標 host 驗證後自行關閉，不會對 PID 發送 TERM、KILL 或其他訊號。

`watch-restart` 將目前 foreground host 的完整身分與下一個啟動命令、外掛及可執行 JavaScript SHA-256 綁入同一份 approval。套用後先 cooperative stop；只有舊 host 確認消失、啟動計畫仍完全相同且沒有競爭 host，才會啟動替代者。停止逾時或部分失敗會回傳可歸因的 receipt，不會直接對 PID 發訊號。

`upgrade` 預設只產生唯讀計畫。`--verify` 會下載並核對 `.tgz`、SHA-256、manifest 與 GitHub Artifact Attestations API 證據，但不安裝；`--apply --yes` 僅支援 npm 本機或全域安裝，且只安裝已驗證的本機位元組，再確認 CLI 版本。原始碼 checkout 與 `npx` 不會自動修改；降版還需要 `--allow-downgrade`。

```bash
symbol-lattice upgrade --check
symbol-lattice upgrade 0.267.0 --verify
symbol-lattice upgrade 0.267.0 --apply --yes
```

## 驗證

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
```

## 授權

[MIT](LICENSE)
