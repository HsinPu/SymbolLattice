<div align="center">

# SymbolLattice

**可驗證、可查詢的本機程式碼情報圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.154.0 是開發者預覽版；套件尚未發佈至 npm，請由原始碼執行。

SymbolLattice 為專案建立可查詢的本機程式碼符號圖譜。每條關係都保留規則、解析階段與信心值；它明確區分 exact、heuristic 與 unresolved，不會把猜測升格為事實。

## 快速開始

需要 Node.js 22.13 以上且低於 25，以及 npm。

~~~bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；來源變更後才明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
~~~

Windows PowerShell 若無法使用 npm，請改用 npm.cmd。索引資料保留在目標專案的 .symbol-lattice/index.sqlite。

## v0.154.0

- 支援同檔、遞迴巢狀的 Sanic `Blueprint.group(...)`：每層群組 prefix、Blueprint prefix、`app.blueprint(..., url_prefix=...)` 與 decorator path 會組合為 exact 路徑。
- 每個群組、每個成員 Blueprint 都必須可語法證明且未重綁定；群組樹若循環或同一 Blueprint 被掛載兩次，便不會產生精確路由。
- 下一次明確 `sync` 會重新擷取既有 Python 事實並重建受影響的路由。

## 設計界線

- 所有索引與查詢皆在本機進行；不會悄悄上傳原始碼。
- 動態派發、反射、巨集、程式碼生成、DI、模糊名稱與執行期設定不會成為 exact 關係。
- 跨檔 Sanic 支援仍限單一名稱、一層相對路徑的直接 Blueprint import。群組僅限同檔、直接 Blueprint 或群組變數與最多一個字面 `url_prefix`；跨檔群組、copies、陣列成員、`name_prefix`、版本或其他註冊選項、class views、WebSocket、`add_route` 與動態組合暫不推斷。

## 驗證

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~
