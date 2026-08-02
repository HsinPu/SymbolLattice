<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為核心的本機程式碼情報**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.210.0 為開發者預覽版，請從原始碼執行。

SymbolLattice 會建立可查詢的本機「程式碼符號圖譜」。每一條關係都保留規則、證據階段與信心等級；`exact`、`heuristic`、`unresolved` 絕不混為一談。

## 快速開始

需要 Node.js 22.13 以上、低於 25，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立目標專案的本機程式碼符號圖譜
node dist/cli/main.js init /path/to/project

# 從既有世代取得關鍵字對應的結構化調查結果
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 以受限、精確的反向相依證據重排候選結果
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking impact --json

# 以查詢命中的候選為種子，在受限的雙向精確靜態圖譜中重排
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking topology --json

# 查詢既有世代的反向影響；摘要只描述本次回傳的路徑
node dist/cli/main.js impact "src/handlers.ts#users" --project /path/to/project --depth 3 --limit 100 --json

# 原始碼變更後，明確更新圖譜
node dist/cli/main.js sync /path/to/project

# 啟動 MCP 主機；工具唯讀，背景自動同步預設開啟
node dist/cli/main.js serve --mcp --project /path/to/project

# 若只允許手動 init／sync，關閉背景自動同步
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

Windows PowerShell 若找不到 npm，請使用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

> [!NOTE]
> MCP 工具本身永遠不會建立或更新圖譜。`serve --mcp` 的預設自動同步是主機擁有的獨立背景監看；若需要完全手動更新，使用 `--no-auto-sync`。

## v0.210.0 重點

- `investigate --ranking topology` 現在會把已精確解析的 `extends` 與 `implements` 關係納入雙向靜態範圍；原有呼叫、引用、路由、處理器與匯入關係仍保留。
- 每個 topology 選取結果的 `topologySignals` 新增 `scopedExactIncidentEdgeKindCounts`，以固定順序列出保留範圍內各關係種類的實際邊事件數，方便稽核排序依據。
- 關聯數量只用於說明證據，不會改變以去重鄰居執行的 topology 分數；`heuristic` 與未解析關係仍完全排除。

## 範圍與限制

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識圖譜或本體推理系統。
- 圖譜查詢只讀取已保存的世代。`investigate --ranking impact` 與 `topology` 都只使用受限的 `exact` 靜態證據；`topology` 目前採用 `calls`、`references`、`routes`、`handles`、`imports`、`extends`、`implements`，不是全文 PageRank、語意排序、動態派發或執行期分析。一般 `impact` 查詢則沿用既有的已解析靜態關係，摘要不會升級或混淆邊的信心等級。
- `impact.summary` 只描述實際回傳的路徑。若使用 `--limit` 或 MCP 限制而顯示 `truncated: true`，它不是整個圖譜的完整影響聲明。
- 索引與查詢皆在本機完成。原始碼有變更時，結果會標示新鮮度，而不把即時檔案冒充為已索引證據。
- WAL 是同機本機 SQLite 的能力；網路檔案系統、手動 checkpoint 管理與多寫入端協調仍不在支援範圍。

## 驗證

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
git diff --check
```

## 授權

[MIT](LICENSE)
