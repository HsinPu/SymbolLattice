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
> v0.191.0 為開發者預覽版，尚未發佈至 npm；請由原始碼執行。

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

## v0.191.0 重點

- 支援官方 React Native Codegen 的 Java 與 Kotlin Spec 子類別：直接匯入或完全限定的 Spec 父類別、可證明的 getName() 模組名稱，以及直接覆寫的方法。
- Codegen 原生方法必須與同專案唯一的 TypeScript TurboModule module-plus-method 合約相符，才會建立跨語言呼叫邊。
- 直接 Registry、TypeScript 規格、預設匯入與靜態預設再匯出都保留可追溯的 Codegen 規則；零份或多份合約維持 unresolved。

## 核心原則

- 索引與查詢都在本機完成，不會悄悄上傳原始碼。
- init 與 sync 是明確寫入操作；CLI 與 MCP 查詢保持唯讀。
- 關係必須有可重現的靜態證據；無法證明時維持 unresolved，而非猜測。

## 靜態分析邊界

- Codegen 只接受直接父類別、字面或類別本地不可變 getName() 值、Java @Override 或 Kotlin override 方法，以及唯一 TypeScript 合約的交集。
- 不掃描建置產物，也不推斷執行期註冊、動態名稱、間接包裝、Swift 實作或自訂 macro wrapper。
- React Native 也涵蓋嚴格的 NativeModules、直接 TurboModule Registry、TypeScript 規格與已證明本機預設匯出的靜態再匯出鏈。

## 驗證

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## 授權

[MIT](LICENSE)
