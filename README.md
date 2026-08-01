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
> v0.151.0 是開發者預覽版；套件尚未發佈至 npm，請由原始碼執行。

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

## v0.151.0

- 支援跨檔直連 Sanic Blueprint：來源模組的 Blueprint 與 decorator route，可透過 package-relative import 與 app.blueprint(...) 投影為精確路由。
- 僅在 import、Sanic app、Blueprint、字面 prefix/path/method、來源 handler 與未重綁定都能語法證明時產生 exact 路由。
- 跨檔投影保留註冊模組與來源模組的證據路徑；下一次明確 sync 會重建既有索引。

## 設計界線

- 所有索引與查詢皆在本機進行；不會悄悄上傳原始碼。
- 動態派發、反射、巨集、程式碼生成、DI、模糊名稱與執行期設定不會成為 exact 關係。
- 此 Sanic 版本只接受單一名稱、一層相對路徑的 Blueprint import、直接無選項 app.blueprint(...) 註冊與頂層本機函式 handler。Blueprint groups/copies、註冊選項、class views、WebSocket、add_route 與動態組合暫不推斷。

## 驗證

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~
