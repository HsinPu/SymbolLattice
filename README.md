<div align="center">

# SymbolLattice

**可查詢、可解釋、以本機優先的程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.174.0 是開發者預覽版，尚未發佈至 npm；請由原始碼執行。

SymbolLattice 為專案建立可查詢的本機程式碼符號圖譜。每條關係都保留規則、解析階段與信心值，並嚴格區分 `exact`、`heuristic` 與 `unresolved` 證據。

## 快速開始

需要 Node.js 22.13 以上、低於 25，及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 唯讀查詢；原始碼異動後再明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若無法使用 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.174.0 重點

- Spring `@Value` 現可從 Java 直接類別建構子參數與 Kotlin primary constructor 參數建立設定關係；Kotlin 也支援省略 class body 的有效頂層類別。
- 精確鍵維持 `exact`；唯一 relaxed spelling 建立 `heuristic 0.75` 關係；正規化後有多個候選時仍保持 `unresolved`。

## 核心原則

- 索引與查詢都在本機進行；原始碼不會被靜默上傳。
- `init` 與 `sync` 是明確寫入操作；CLI 與 MCP 查詢保持唯讀，不會自行更新圖譜。
- 關係必須有可重現的靜態證據；否則維持未解析，不猜測。

## 靜態分析邊界

- Spring Boot `@Value` 僅連結 Java 直接頂層類別的欄位或建構子參數，或 Kotlin 直接頂層類別的屬性或 primary constructor 參數；必須是精確 import／完整名稱與單一字面 placeholder，且 Kotlin 必須使用跳脫 `$` 的規則字串。`@ConfigurationProperties` 僅接受單一字面位置參數或 `prefix =` 參數。方法參數、secondary constructor、use-site target、別名／wildcard import、欄位／集合綁定、列表、合併鍵、動態值、設定匯入、profile 啟用與執行時優先順序都不支援。
- COBOL CICS 僅接受已由 `END-EXEC` 完整結束、含單一字面 `TRANSID` 的直接 `RETURN` 或 `START`。目標須是索引內唯一、在 `PROCEDURE DIVISION` 前宣告且名稱含 `TRAN` 的字面交易碼；CICS CSD 屬外部設定，因此關係保持 `heuristic`，而非執行時保證。
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
