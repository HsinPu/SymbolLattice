<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為先的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.198.0 是開發者預覽版，請從原始碼執行。

SymbolLattice 在本機建立可查詢的程式碼符號圖譜。每一條關係都保留規則、證據階段與信心值；`exact`、`heuristic`、`unresolved` 不會混為一談。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機程式碼圖譜
node dist/cli/main.js init /path/to/project

# 以一組關鍵字取得同一個圖譜世代的結構脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# 原始碼變更後請明確同步
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 npm，請使用 `npm.cmd`。索引資料會寫入目標專案的 `.symbol-lattice/index.sqlite`。

## v0.198.0 重點

- `investigate <query>` 與 `symbol_lattice_investigate` 現會在同一個圖譜世代中回傳已選符號的宣告來源；每則最多 200 行或 16,000 個 UTF-16 字元，完整大小與截斷狀態會明示。
- 回應保留來源命中排名、候選排名、候選總數與截斷旗標；不會把模糊文字命中假裝成已證明的符號關係。
- `init` 建立本機程式碼符號圖譜快照；`sync` 才會更新它。所有 `investigate`、CLI 與 MCP 查詢皆為唯讀。

## 使用界線

- 這是本機程式碼圖譜，不是 RDF／SPARQL 或具本體推理的一般語意知識圖譜。
- `investigate` 僅依持久化的字面搜尋與重疊宣告挑選符號；不使用 LLM、PageRank 或猜測的動態關係。
- 索引與查詢都在本機執行；不會自行上傳原始碼。來源已變更時，結果會標示過期，但仍只呈現該索引世代的證據。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
