# SymbolLattice

**讓 AI Agent 找到相關程式碼，也找到判斷的依據。**

SymbolLattice 是提供給開發者與 AI Agent 的本機程式碼搜尋工具。透過 CLI 或 MCP，用任務描述、符號名稱或檔案路徑查詢專案，取得原始碼、行號與跨檔關係證據。

[English](README.en.md) · [開始使用](docs/getting-started.md) · [驗證與限制](benchmarks/README.md) · [回報問題](https://github.com/HsinPu/SymbolLattice/issues)

`v0.528.1` · Node.js `>=22.13 <25` · MIT

## 從「這段功能在哪裡？」開始

接手陌生專案、追查錯誤或準備修改時，往往需要先找到實作，再確認它和其他檔案的關係。SymbolLattice 將程式碼建立為本機索引，讓這些查詢可以沿著來源繼續追查。

```powershell
SymbolLattice explore "Where are incoming requests validated?" --project . --json
```

查詢結果可包含：

- **相關檔案與符號**：從任務描述找到可能需要閱讀的實作。
- **可核對的來源**：檔案路徑、行號與原始碼片段，方便確認判斷是否成立。
- **程式碼之間的關係**：已解析的呼叫、匯入、來源引用、繼承與框架入口。
- **仍需追查的部分**：未解析呼叫、來源新鮮度與結果截斷資訊。

你可以直接在終端機查詢，也可以讓支援 MCP 的 Agent 使用這些證據。

## 快速開始

需要 Git、npm、Node.js `>=22.13 <25`，以及 Windows PowerShell 5.1 或 PowerShell 7。目前透過 GitHub 原始碼安裝，尚未發布至 npm Registry。

### 1. 安裝

在 PowerShell 執行。以下會 clone 專案，取得該 checkout 的完整 commit，並用固定 commit 安裝：

```powershell
git clone https://github.com/HsinPu/SymbolLattice.git
if ($LASTEXITCODE -ne 0) { throw "Clone failed" }
Set-Location SymbolLattice
$ref = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve commit" }

# 先預覽安裝計畫，確認後再執行下一行
.\install.ps1 -Ref $ref
.\install.ps1 -Ref $ref -Apply -Yes
```

安裝器使用完整 commit 或既有版本 tag，不接受 `main` 等浮動 ref。指定版本與安裝細節見[安裝指南](docs/getting-started.md#安裝)。

### 2. 查詢你的專案

切換到**要分析的專案根目錄**，建立索引後開始查詢：

```powershell
SymbolLattice init .
SymbolLattice explore "Where are incoming requests validated?" --project . --json
```

索引保存在該專案的 `.SymbolLattice/`。修改原始碼或升級後，執行 `SymbolLattice sync .` 更新索引；已知符號名稱時，也可使用 `SymbolLattice find <name> --project . --json`。

### 3. 接上 AI Agent

Codex 使用者可預覽並套用整合設定：

```powershell
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

整合會備份並更新 Codex 設定與受管理的 AGENTS 區塊；完成後重新啟動 Codex 或開啟新 task。專案仍須先建立索引。

其他 MCP 用戶端可使用 `SymbolLattice serve --mcp --project <project-path>` 啟動 server。預設提供 `SymbolLattice_explore`；查詢本身唯讀，server 預設可在背景同步索引。設定與停用方式見 [MCP 使用指南](docs/getting-started.md#其他-mcp-用戶端)。

## 支援範圍

涵蓋 TypeScript／JavaScript、Python、Java、Go、Rust、C／C++、C# 與多種模板、設定格式。**各語言的解析深度不同**，可掃描不代表完整支援其型別、框架或跨檔語意。

SymbolLattice 使用靜態分析。動態呼叫、反射與外部依賴可能無法解析，同名宣告也不代表已確認的呼叫目標。結果有數量與來源片段上限；未找到關係不能用來保證修改或刪除安全。索引過期時請先同步，無法確認新鮮度的即時查詢可能拒絕回傳結果。

詳見[語言能力與限制](src/domain/language-depth.ts)及[真實專案驗證](benchmarks/README.md)。查找品質與速度依專案及查詢而異。

## 文件與參與

| 想了解什麼 | 從這裡開始 |
| --- | --- |
| 安裝、指令、MCP 設定與移除 | [使用指南](docs/getting-started.md) |
| 更新既有安裝 | [升級指南](docs/getting-started.md#升級) |
| 品質、效能與已知缺口 | [驗證文件](benchmarks/README.md) |
| 回報錯誤或提出需求 | [GitHub Issues](https://github.com/HsinPu/SymbolLattice/issues) |

目前為 `0.x` 開發階段，升級前請確認相容性說明。**v0.420.0 或更早版本的套件名稱與索引不會自動遷移**，請依升級指南處理。

## 開發

```bash
npm ci
npm run check
npm run build
npm test
```

先建置再測試。完整檢查要求見 [AGENTS.md](AGENTS.md)，其他驗證與打包步驟見[開發指南](docs/getting-started.md#開發)，工具入口見 [scripts/README.md](scripts/README.md)。

## 授權

[MIT](LICENSE)。Parser 資產另附第三方授權與來源資訊，保留於 `src/assets/`。
