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
> v0.192.0 為開發者預覽版，尚未發佈至 npm；請由原始碼執行。

SymbolLattice 在本機建立可查詢的程式碼符號圖譜。每一條關係都保留規則、解析階段與信心值，嚴格區分 exact、heuristic 與 unresolved。

## 快速開始

需要 Node.js 22.13 以上、低於 25，以及 npm。

~~~bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 查詢保持唯讀；原始碼變更後明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
~~~

Windows PowerShell 若找不到 npm，請改用 npm.cmd。索引資料保存在目標專案的 .symbol-lattice/index.sqlite。

## v0.192.0 重點

- 支援 Objective-C 無參數 RCT_EXPORT_MODULE()：以實作類別名稱產生模組名，並依官方慣例移除 RCT 或 RK 前綴。
- 支援 RCT_REMAP_METHOD 的明確 JavaScript 方法名稱，並保留與 RCT_EXPORT_METHOD 不同的來源規則。
- NativeModules 呼叫會精確連到對應 iOS macro 方法，結果可經 SQLite 索引、重新開啟與 callers 查詢驗證。

## 核心原則

- 索引與查詢都在本機完成，不會悄悄上傳原始碼。
- init 與 sync 是明確寫入操作；CLI 與 MCP 查詢保持唯讀。
- 關係必須有可重現的靜態證據；無法證明時維持 unresolved，而非猜測。

## 靜態分析邊界

- Objective-C 僅接受直接 bridge header、剛好一個直接 RCT_EXPORT_MODULE，以及直接 RCT_EXPORT_METHOD 或 RCT_REMAP_METHOD；同一 JavaScript 方法名衝突時不產生原生目標。
- Android Codegen 只接受直接 Spec 父類別、可證明的 getName()、直接覆寫與唯一 TypeScript TurboModule 合約的交集。
- 不掃描建置產物，也不推斷執行期註冊、動態名稱、間接包裝、Swift 實作或自訂 macro wrapper。

## 驗證

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## 授權

[MIT](LICENSE)
