<div align="center">

# SymbolLattice

**可查詢、可解釋、以本機為先的程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.168.0 是開發者預覽版，尚未發佈到 npm；請由原始碼執行。

SymbolLattice 為專案建立可查詢的本機程式碼符號圖譜。每一條關係都保留規則、解析階段與信心值，並嚴格區分 `exact`、`heuristic` 與 `unresolved` 證據。

## 快速開始

需要 Node.js 22.13 以上、低於 25，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；原始碼變動後，由你明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若無法使用 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.168.0 重點

- COBOL CICS 現在可辨識字面 `EXEC CICS RETURN/START TRANSID(...)`，將跨交易程式跳轉保留為可查詢的呼叫關係。
- 專案內只有一個可驗證的 `TRAN` 命名交易擁有程式時，關係會保留規則、候選程式與 `heuristic` 信心值 `0.85`。
- 動態交易碼、未完成命令、註解與字串、重複擁有者，以及不在索引內的 CSD 對應都維持未解析，不會猜測。

## 核心原則

- 索引與查詢都在本機進行；原始碼不會被自動上傳。
- `init` 與 `sync` 是明確寫入動作；CLI 和 MCP 查詢保持唯讀，不會自行更新圖譜。
- 關係必須有可重現的靜態證據；無法證明時保留為未解析，不會猜測。

## 靜態分析邊界

- Astro `.astro` 導覽分析 `src/pages` 下的靜態、整段參數與最後 rest 路徑。endpoint 僅在唯一根目錄 `astro.config.js`、`.mjs`、`.cjs`、`.ts`、`.mts` 或 `.cts` 時啟用，並限 `.ts`、`.js`、`.mjs` 的直接 HTTP 匯出；間接匯出、可變綁定、重複方法、MDX、選用參數、路由設定與 middleware 不會成為 `exact`。
- COBOL CICS 僅接受已由 `END-EXEC` 完整結束、含單一字面 `TRANSID` 的直接 `RETURN` 或 `START`。目標須是索引內唯一、在 `PROCEDURE DIVISION` 前宣告且名稱含 `TRAN` 的字面交易碼；CICS CSD 屬外部設定，因此關係保持 `heuristic`，而非執行時保證。
- Django `Class.as_view()` 僅接受未裝飾、唯一、頂層、宣告於最終 `urlpatterns` 前且未重綁定的本機類別；呼叫必須是無參數的直接形式。這不會推論繼承關係或執行時 `as_view` 實作。
- 動態組合、外部或 namespace 套件、父層相對匯入、複製或容器值、已裝飾或匯入的類別、WebSocket、`add_route`、版本設定與模糊目標，都不會成為 `exact` 結果。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
