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

目前版本：v0.470.0

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
| 已完成大型專案深度驗證 | TypeScript、Java、HTML、Markdown、CSS、JavaScript、JSP、Python、Ruby、Shell、Lua、Luau、Julia、Perl、R、Elixir |
| Web 與模板 | ArkTS、Vue、Svelte、Astro、Razor、PHP、Blade、Liquid、Twig、CFML |
| JVM、.NET 與應用程式 | Groovy、Kotlin、Scala、C#、F#、VB.NET、Dart |
| 系統與原生語言 | C、C++、Objective-C、Rust、Go、Swift、Zig、Nim、Fortran、Ada、Pascal、COBOL |
| 資料、設定與 schema | SQL、GraphQL、Protocol Buffers、Terraform/OpenTofu、Nix、YAML、XML、Java Properties、Solidity |
| Functional 與 BEAM | Erlang、Clojure、Haskell、OCaml |

Java 深度包含唯一專案型別的明確 import、annotation、泛型 direct heritage／object creation，以及 `build.gradle(.kts)` 或 module-named Gradle build script 證據；重複 qualified type、wildcard／static import、lambda 內建立、anonymous interface 與外部 classpath 仍保守省略。

v0.448.0 預設略過所有名稱以 `.` 開頭的目錄，以及既有 cache 與 generated directories；因此 `.github`、`.devcontainer`、`.storybook`、`.codex-tmp` 等 hidden directories 不會被自動索引。明確 scope 可選入 default-excluded 路徑，hard exclusions 仍不可覆寫；root 與非隱藏目錄內的 nested `.gitignore` 依 Git parent re-inclusion 語意套用。若非排除路徑發生 `EACCES`／`EPERM`，index／sync 不會發布 partial generation，既有 generation 會保留並標示 stale。

v0.442.0 加速 watcher reconciliation：精確、既有且已索引的 pending source path 會優先驗證；確認 stale 後重用同一份 generation-bound freshness observation，直接執行一次完整掃描與原子 generation publication。新檔、rename、directory、configuration、ignore、未知或截斷事件仍回退完整驗證；generation 已切換時也會丟棄 observation，維持既有正確性。

v0.443.0 補強受限 Agent 環境：當全域 npm CLI 因 sandbox 存取邊界而顯示找不到時，不會只憑該症狀判定 SymbolLattice 未安裝。MCP 不可用時，Agent 只可對原本已授權的同一命令與 project scope 做一次 sandbox escalation retry；不可藉此換成未授權的寫入命令。重試不可用、被拒絕或仍失敗後才明確回報存取邊界並使用限定範圍 fallback。

v0.444.0 修正 workspace 專案的 cache traversal：workspace resolver 不再另外遞迴 filesystem，而是直接使用共用 scoped walker 已套用 default exclusions、scope 與 nested `.gitignore` 後的 `package.json` candidates。因此 nested `backend/.pytest_cache` 等 excluded cache 不會被讀取，也不會因 EPERM 阻止 initial index；合法 workspace manifests 與明確 override 語意維持不變。

v0.445.0 新增預設啟用的 project-local operation journal。`init`、`index`、`sync` 與實際 watcher reconciliation 會在 `.SymbolLattice/operation-diagnostics.sqlite` 保存最新 256 筆有界、去敏的 stage 與 generation 證據；initial scan 失敗時仍可用 `SymbolLattice diagnostics . --json` 查詢。Standalone `status`、explore 與其他 read tools 不會建立或更新診斷檔；journal 寫入失敗也不會遮蔽原本操作結果。

v0.446.0 對所有即時圖查詢加入 strict freshness gate。MCP在查詢前後驗證project source、configuration、ignore與indexer policy；stale且具writer lease時先原子同步，查詢期間再變更則丟棄結果並重跑一次。CLI與`--no-auto-sync`維持唯讀，無法證明fresh時回報`FRESH_INDEX_REQUIRED`，不再回傳stale evidence；持續變動則回報`PROJECT_NOT_STABLE`。Status、diagnostics、history與diff仍可唯讀使用。

v0.447.0 修正 Perl bare match expression 內含 `<<` 時被誤判為 heredoc opener 的 whole-file false negative。Assignment、return、argument與list等明確 expression-start context會先保護完整 regex；一般 division、未閉合regex與真正heredoc仍維持保守 fail-close。

v0.448.0 將所有 hidden directories 納入預設 discovery exclusion，並讓 shared walker、Cargo workspace glob 與 Xcode project discovery 共用同一集中 policy。這可避免 sandbox/test 暫存目錄的限制 ACL 阻斷索引；未來若要改回 allowlist 或精選排除，只需調整集中 policy。

v0.450.0 修正大型混合專案可靠性：重複 CSS selector occurrence 現在保留各自唯一、穩定的 semantic symbol identity；streaming freshness 與初次掃描採用相同 UTF-8 BOM 解碼／hash 契約，避免合法 scoped index 被誤判 stale。

v0.451.0 完成六個固定大型 TypeScript 專案的跨檔 relation 驗證。保守 Tier-A 契約涵蓋唯一 direct relative import／re-export、同檔 direct／未污染 member call、instantiation、heritage、signature 與 explicit override；102,537 個核准候選全部 exact，另有 150 個動態、歧義、mutation、type-space、shadow、external 與 malformed 負向案例全數 fail-close。型別參數遮蔽的 heritage 會保守省略，不錯連到同名頂層宣告。這不代表 package exports、project references、overload 或執行期 dispatch 的完整支援。

v0.452.0 強化大型 TypeScript repository 的容量觀測與保守 extraction。Next.js full-root 在 30 分鐘內成功發布 generation；大型 `src/compiled` JavaScript bundle 與 VS Code colorizer performance fixture 只保留 file identity，避免把 vendored／benchmark data 誤當成可靠跨檔語意。VS Code full-root 的 30 分鐘／4 GiB provisional ceiling 仍未完成，因此這版公開 capacity ceiling 與 unsupported breadth，不宣稱所有大型 repository 都能在相同預算內完成。

v0.453.0 開始加深 TypeScript monorepo 關係：source file 會使用最近且唯一的 package-local `tsconfig.json`／`jsconfig.json` boundary解析 `paths`與`baseUrl`，並保存完整config／extends evidence。Nested config不會污染sibling package；未被TypeScript config宣告的specifier仍可交由既有workspace package resolver處理。Project references、conditional package exports、overload與runtime dispatch仍維持後續工作或nonclaim。

v0.454.0 加深Java project relation。合法modern Java來源即使legacy parser因檔內switch expression等語法fail-close，仍可從clean modern parse保守恢復method／constructor的visibility、static／final與arity metadata，但不恢復body relations或猜測parameter type。明確import的type-name static call、source-proven field／parameter receiver，以及instance body內compile-time-bound的static／final／private bare call可建立唯一exact edge；同名local／field／inherited field、overload、一般virtual inherited dispatch、外部classpath與無法唯一證明的target維持fail-close。固定Netty、Quarkus core、Hibernate ORM truth由200 TP／100 FN改善為210 TP／90 FN，FP與evidenceInvalid皆0，150／150負向通過。

v0.455.0 加深 TypeScript project configuration evidence。經 TypeScript 6.0.3 oracle 證明不影響 module resolution 或 program structure 的 boolean `stableTypeOrdering`，可在保留原始 config hash 的前提下交由產品內 TypeScript 5.9.3 安全解析；其他未知或型別錯誤選項仍會失敗。Project references 只接受 project-local、tracked、唯一且無循環的 config chain，並將完整 evidence 帶入 unresolved workspace fallback。Workspace package exports 只對 literal root／exact subpath 建立 exact target；conditional object、array 與 wildcard 維持 nonclaim。六個固定大型 TypeScript corpus 的 102,537 個核准 relation candidates、300 個固定正向與 150 個負向案例全部通過，FP、FN 與 evidenceInvalid 皆為 0；parse-rejected files、package conditions、wildcards、overloads 與 runtime dispatch 不在完整支援宣稱內。

v0.456.0 加深 TypeScript namespace member call。`import * as ns` 的靜態 property call 只有在 module target 唯一、exported member 為 value-space 且 callable、沒有 shadow／mutation／computed／optional／ambiguous evidence 時，才建立既有 `calls` exact edge；同樣規則可沿單一路徑穿過 explicit re-export。Type-only namespace、動態或歧義 namespace 維持 unresolved，沒有新增 GraphEdge kind 或 runtime dispatch 推測。

v0.457.0 加深 Go 的 bounded project relations。四個固定大型、乾淨 checkout（Kubernetes、Prometheus、etcd、Hugo）以獨立 masked-source truth 驗證 300 個正向候選全部 exact，並以 150 個 disposable 負向案例守住 dynamic／computed call、receiver mutation／escape、shadow、interface dispatch、build constraint、nested module、replaced module 與 malformed source 的 fail-closed 行為。產品現在可在唯一 package-local function、唯一 concrete receiver method、唯一 struct construction，以及 root `go.mod` 未被對應 `replace` 影響的 local import 上建立既有 exact edge；parser-recovery、test／ignored／conditional files、embedding／interface／reflection／cgo／runtime dispatch 維持 unresolved。大型 corpus 的 unsupported breadth 與 parser-rejected files 另列在 Graph 根目錄 benchmark，不把核准 subset 包裝成完整 Go 語言支援。

v0.458.0 加深 Rust 的 bounded crate relations。Tokio、Rust core／alloc／std 四個固定大型 source scope，加上一個乾淨 crate contract fixture，驗證 module／use／trait／impl identity、唯一 inherent method／associated function、struct／enum construction 與既有 `implements` edge；300 個核准正向與 150 個 disposable 負向均通過。Trait-object dispatch、deref／embedding ambiguity、cfg、complex generics、macro／proc-macro、build script、FFI、generated code 與 runtime dispatch 維持 unresolved 或 nonclaim；大型 corpus 的 parser-rejected 與 unsupported breadth 另列，不宣稱完整 Rust compiler 語意。

v0.459.0 加深 Kotlin 的 bounded JVM relations。固定 Kotlin compiler、Ktor、kotlinx.coroutines 三個大型 source scope，加上一個乾淨 synthetic project，驗證 class／object／interface／enum／typealias identity、explicit import、唯一 direct／member／extension call、constructor instantiation、heritage 與 explicit override；300 個核准正向與 150 個 disposable 負向均通過。Overload、default parameter、extension ambiguity、generic／reified、delegation、sealed/interface dispatch、compiler plugin、coroutine runtime、generated/reflection、Java interop 與 external dependency linkage 維持 unresolved 或 nonclaim；大型 corpus unsupported breadth 與 parser-rejected files 另列，不宣稱完整 Kotlin compiler 支援。

v0.460.0 加深 Swift bounded project relations。固定 Swift 標準庫 core／Concurrency、SwiftNIO 與 Swift Collections 三個大型、乾淨、可核對 checkout，加入 class／struct／enum／protocol／actor／typealias identity、explicit import、唯一 direct／member／extension call、explicit initializer instantiation、heritage／conformance、signature accepts／returns 與明確 override。合成 oracle 的 300 個核准正向與 150 個 disposable 負向均通過，所有 exact edge 都帶 singleton target evidence；protocol witness／dynamic dispatch、generic／associatedtype、property wrapper／macro／result builder、async actor runtime、Objective-C／SDK、generated／reflection／conditional compilation 與 external module 維持 unresolved 或 nonclaim。三個大型 corpus 的 parser-rejected files 與 unsupported breadth recall 另列，Windows 無 Swift／Xcode toolchain，因此不宣稱完整 Swift compiler 語意。

v0.461.0 加深 Dart／Flutter bounded project relations。固定 Dart SDK 3.9.4、Flutter 3.35.2 與 flutter/packages 固定 commit 三個大型 source scope，加入 class／mixin／enum／extension／typedef identity、literal import／export、唯一 direct／typed member／extension call、constructor instantiation、extends／with／implements、signature accepts／returns 與明確 `@override`。合成 oracle 的 300 個正向與 150 個 disposable 負向均通過；dynamic／noSuchMethod、generic／tear-off、mixin runtime dispatch、late／mutation／escape、async／isolate、build_runner／generated／reflection、conditional import、Flutter platform channel 與 external package 維持 unresolved 或 nonclaim。parser-rejected files 與 unsupported breadth recall 另列，Windows 無 Dart／Flutter toolchain，因此不宣稱完整 analyzer／Flutter 語意。

v0.462.0 加深 C#／.NET bounded project relations。固定 .NET runtime、ASP.NET Core 與 EF Core v9.0.10 三個大型、乾淨 source scope，加入 namespace、class／record／struct／interface／enum／delegate identity、explicit using、唯一 project-local direct／member／constructor call、extends／implements、signature accepts／returns 與明確 `override`。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close。overload／generic／LINQ runtime、dynamic／reflection、extension ambiguity、nullable flow、delegate／event dispatch、partial／source-generator／generated／conditional code、async runtime、NuGet／external assembly 與 project references 維持 unresolved 或 nonclaim；三個大型 corpus 的 parser-rejected files 與 unsupported breadth recall 另列。Windows 本次沒有 dotnet／Roslyn compiler validation，因此不宣稱完整 C# compiler 語意。

v0.463.0 加深 F# bounded project relations。固定 dotnet/fsharp v15.2.400、Fable 5.9.0 與 FAKE 6.1.4 三個大型、乾淨 source scope，加入 module／namespace、class／record／struct／union／interface／enum／delegate／type alias identity、explicit `open`、唯一 project-local direct／pipeline／member／constructor call、extends／implements、signature accepts／returns 與明確 `override`。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close。型別推導、pipeline／composition ambiguity、pattern matching runtime、generic／inline、active pattern、computation expression、async/task runtime、reflection／quotation、type provider、generated／conditional code、NuGet／external assembly 與 project references 維持 unresolved 或 nonclaim；parser-rejected files 與 unsupported breadth recall 另列。Windows 沒有可用 .NET SDK／F# compiler validation，因此不宣稱完整 F# compiler 語意。

v0.464.0 加深 OCaml bounded project relations。固定 OCaml 5.5.0、Dune 3.9.3 與 Jane Street Core v0.17.2 三個大型、乾淨 source scope，加入 module／class／record／variant／object／signature／type alias identity、explicit `open`、唯一 project-local direct／module／typed member call、class construction、extends／implements、signature accepts／returns 與明確 `method!` override。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close。型別推導、higher-order／partial application、functor／module signature strengthening、polymorphic variants／GADT、object subtyping、pattern matching runtime、PPX／generated code、async／reflection、opam／Dune dependency resolution、external package、conditional compilation 與 ambiguous opens 維持 unresolved 或 nonclaim；parser-rejected files 與 unsupported breadth recall 另列。Windows 沒有 OCaml／Merlin toolchain validation，因此不宣稱完整 OCaml compiler 語意。

v0.465.0 加深 Haskell bounded project relations。固定 GHC 9.14.1、Cabal 3.18.1.0 與 Pandoc 3.9 三個大型、乾淨 source scope，加入 module、data／newtype／record／variant／type alias、class／instance identity、explicit import、唯一 project-local direct／qualified module call、constructor creation、typeclass implements 與簡單 signature accepts／returns。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close。型別推導、overloading／dictionary passing、higher-order／partial application、lazy runtime、pattern dispatch、GADT／existential／type family、Template Haskell／quasiquote／CPP、FFI、package resolver、external module、reflection、ambiguous export 與 dynamic dispatch 維持 unresolved 或 nonclaim；parser-rejected files 與 unsupported breadth recall 另列。Windows 沒有 GHC／Cabal／Stack／HLS toolchain validation，因此不宣稱完整 Haskell compiler 語意。

v0.466.0 加深 Scala bounded project relations。固定 Scala 3.9.0、Scala 2.13.18 與 sbt 1.12.15 三個大型、乾淨 source scope，加入 package／object／class／case class／trait／enum／type alias identity、explicit import、唯一 project-local direct／object／typed member call、constructor／case-class creation、single inheritance／trait implementation、簡單 signature accepts／returns 與明確 `override`。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close。overload／default／given／implicit、extension、higher-order／partial application、generic／type member、path-dependent／opaque／match type、inline／quoted／macro／TASTy、pattern／async／Akka runtime、reflection、Java linkage、sbt/generated code、conditional compilation、ambiguous import 與 external dependency 維持 unresolved 或 nonclaim；parser-rejected files 與 unsupported breadth recall 另列。Windows 沒有 Scala／scalac／sbt／Java toolchain validation，因此不宣稱完整 Scala compiler 語意。

v0.467.0 加深 Elixir bounded project relations。固定 Elixir v1.20.4、Phoenix v1.8.13、Ecto v3.14.2 與 Livebook v0.19.9 四個大型、乾淨 source scope，加入 module／protocol／struct／exception／type／behaviour identity、explicit alias／import、唯一 project-local direct／qualified module call、struct creation、behaviour／protocol implementation 與簡單 `@spec` accepts／returns。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close；macro／quote／unquote／sigil、pattern／guard／多 clause dispatch、protocol consolidation、OTP／GenServer／process runtime、NIF／FFI／Erlang interop、Mix／Hex／umbrella／external package、conditional compilation、reopened module、ambiguous alias 與 dynamic dispatch 維持 unresolved 或 nonclaim。四個大型 corpus 的 parser-rejected files 與 unsupported breadth recall 另列；Windows 沒有 Elixir／Erlang／OTP toolchain，因此不宣稱完整 Elixir compiler 語意。

v0.470.0 加深 Nix bounded project relations。保留既有 attrset／let／inherit／literal `import` 掃描，新增 function attribute facts、單一 identifier lambda 的唯一 local call，以及 `binding = import ./file.nix` 後唯一 `binding.attr` project-local call；所有 exact edge 都帶 singleton evidence。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close。`with`／`rec`／dynamic attr、derivation／`mkDerivation`／`callPackage`、flake inputs、fetcher／固定點、覆寫／merge、Nix evaluator、依賴／overlay／外部 package 與 generated／conditional code 維持 unresolved 或 nonclaim；四個大型 corpus 的 parser-rejected files 與 unsupported breadth recall 另列，Windows 沒有 Nix evaluator/toolchain，因此不宣稱完整 Nix 語意。

v0.469.0 加深 Clojure bounded project relations。固定 Clojure 1.12.5、Ring 1.10.0、Reitit 0.9.2 與 tools.reader 1.6.0 四個 production source scope，加入 namespace／record／protocol identity、明確 `ns :require` alias／`:refer`、唯一 project-local local／referred／qualified call、`->Type`／`map->Type` record construction、record-to-protocol `implements` 與簡單 `^Type` accepts／returns。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close；macro／reader conditional／metadata、dynamic var／rebind、`eval`／`apply`／`resolve`、higher-order／destructuring／threading、protocol／multimethod runtime dispatch、Java interop／reflection、Leiningen／deps.edn dependency、generated code 與 external namespace 維持 unresolved 或 nonclaim。四個大型 corpus 的 parser-rejected files 與 unsupported breadth recall 另列；Windows 沒有 Clojure／JVM／Leiningen／Babashka toolchain，因此不宣稱完整 Clojure compiler 語意。

v0.468.0 加深 Erlang bounded project relations。固定 Erlang/OTP OTP-29.0.4、RabbitMQ v4.3.1、rebar3 3.27.0 與 Cowboy 2.18.0 四個大型、乾淨 source scope，加入 module／export／export_type／record／type／behaviour／callback identity、explicit `-import`／`-include` facts、唯一 project-local local／qualified function call、record construction、behaviour implementation 與簡單 `-spec` accepts／returns。300 個 synthetic 正向為 TP300／FP0／FN0／evidenceInvalid0，150 個 disposable 負向全數 fail-close；guard／pattern／多 clause dispatch、macro／parse transform、OTP／GenServer／message／process runtime、NIF／port／FFI、rebar3／Hex dependency、generated／conditional code、reflection、ambiguous import、dynamic `apply` 與 hot code loading 維持 unresolved 或 nonclaim。四個大型 corpus 的 parser-rejected files 與 unsupported breadth recall 另列；Windows 沒有 Erlang／OTP／rebar3 toolchain，因此不宣稱完整 Erlang compiler 語意。

v0.449.0 新增 `.md`／`.markdown` 基礎圖譜：ATX／Setext heading 會形成可搜尋的 resource 與階層 `contains`，完整的 project-local 相對檔案連結會在唯一命中 indexed file 時形成 exact `references`。Fenced／indented／inline code、HTML block、external／root-relative／reference-style／image／dynamic links、heading anchor 與 `.mdx` 維持 opaque、unresolved 或 nonclaim，不推測執行期文件行為。

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

`install codex` 會在執行時動態寫入目前 Node 與這次安裝之 `dist/cli/main.js` 的絕對路徑，不依賴 PATH，也不寫死使用者名稱、磁碟或 npm prefix；重新安裝或移動套件後請再執行一次。

它只管理全域 `~/.codex/config.toml` 中的 `mcp_servers.SymbolLattice`，以及 `~/.codex/AGENTS.md` 中由 `SYMBOL_LATTICE_START`／`SYMBOL_LATTICE_END` 包住的區塊。寫入前會建立備份；安裝流程本身不會立即建立或刪除專案索引。安裝後，當 Agent 辨識到軟體 repository 且任務需要理解或修改程式碼時，若索引缺失，指示會要求它從 repository root 自動執行 `SymbolLattice init .`。共用一個外層 `.git` 的 monorepo 只在外層建立一次；包含多個獨立 repo 的 workspace 不在容器根層建立，而是依任務範圍逐 repo 建立。檔案系統根目錄、Home、Desktop 根層、暫存與 dependency 目錄不會自動初始化。

設定完成後，請重新啟動 Codex 或開啟新的 task。移除整合時同樣先預覽：

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init` / `sync` | 建立或明確更新程式碼圖。 |
| `diagnostics` | 唯讀查看 operation 與 auto-sync journals，可依 operation／outcome 篩選。 |
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

MCP 預設只暴露主要的 `SymbolLattice_explore`，降低 Agent 選錯工具的機率；它會回傳精簡 Markdown 與附行號來源，而不是完整診斷 JSON，CLI `explore --json` 仍保留機器可讀契約。v0.442.0 保留 SQLite 有界局部子圖、request-scoped adjacency、resilient filesystem discovery 與原子 generation publication，並加速 watcher reconciliation。其他工具仍完整保留，可透過 `SYMBOL_LATTICE_MCP_TOOLS=node,impact` 選擇性加入，或設為 `all` 恢復完整 surface。MCP query handlers 不會直接執行 `init`。MCP host 的啟動目錄沒有索引時仍會註冊工具，但不會為該目錄啟動 watcher；呼叫端應傳入實際 repository 的 `projectPath`。MCP initialize instructions 與 Codex 安裝區塊會指示具備 shell 能力的 Agent 在符合安全條件且索引缺失時自動呼叫 CLI。查詢整個 workspace 時，Agent 會對每個相關 repo 分別傳入 `projectPath` 並彙整結果；SymbolLattice 不會把多個獨立索引冒充成一張具有跨 repo edge 的圖。索引寫入、手動同步與 watcher lifecycle 仍由 CLI 控制。

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
