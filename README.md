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
> v0.203.0 為開發者預覽版，請從原始碼執行。

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

## v0.203.0 重點

- 預設專案的每位 MCP 工作者會在首次資料庫讀取後保留一個唯讀 SQLite 連線；每次查詢仍使用獨立已提交快照，因此後續查詢可看見 `sync` 發布的新世代。
- 覆寫 `projectPath` 的查詢維持短暫唯讀連線，避免工作者無上限快取跨專案連線。
- 工作者的 SQLite store 同時拒絕架構與圖譜寫入，即使未來程式碼誤觸 `init`／`index`／`sync` 路徑也不會改寫資料庫。
- `npm run benchmark:mcp` 仍可量測固定暫存圖譜的 P50／P95、回退、錯誤、工作池與事件迴圈；結果是同機比較基線，不是效能承諾。
- 這不是 WAL 或跨程序快取層；沒有隱藏的重建、同步或即時原始碼讀取。

## 範圍與限制

- 這是本機程式碼圖譜，不是 RDF／SPARQL 知識圖譜或本體推理系統。
- 圖譜查詢只讀取已保存的世代；不使用 LLM、PageRank、執行期猜測或未揭露權重。
- 索引與查詢皆在本機完成。原始碼有變更時，結果會標示新鮮度，而不把即時檔案冒充為已索引證據。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
