<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為先的本機程式碼智慧平台**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.189.0 是開發者預覽版，尚未發佈至 npm；請由原始碼執行。

SymbolLattice 在本機建立可查詢的程式碼符號圖譜。每一條關係都保留規則、解析階段與信心值，嚴格區分 `exact`、`heuristic` 與 `unresolved`。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 查詢維持唯讀；原始碼變更後再明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 `npm`，請改用 `npm.cmd`。索引資料保存在目標專案的 `.symbol-lattice/index.sqlite`。

## v0.189.0 重點

- TurboModule 預設匯入現在可跨越靜態再轉出鏈，例如 `export { default } from "./NativeCalendar"` 或「匯入後直接預設匯出」。
- 最終目標仍必須是唯一、字面的 Registry 結果或不可變 Registry 綁定；edge 會保留完整再轉出路徑，一般 wrapper 與預設匯入不會被誤當成 React Native bridge。
- `NativeModules` 與 TurboModule 都以「模組名稱＋方法名稱」解析；Android 與 iOS 的唯一實作各保留一條 `exact` 邊，同平台衝突則維持 `unresolved`。

## 設計原則

- 索引與查詢都在本機進行；原始碼不會被靜默上傳。
- `init` 與 `sync` 是明確寫入；CLI 與 MCP 查詢保持唯讀。
- 關係必須有可重現的靜態證據；否則保持未解析，不靠猜測補齊。

## 靜態分析邊界

- React Native 目前涵蓋嚴格的 `NativeModules`、直接 TurboModule Registry／TypeScript 規格，以及錨定於已證明本機預設匯出的靜態再轉出鏈；具名匯出、namespace spec 檔、Codegen 產生的原生基底類別、執行期註冊、間接或動態名稱、Swift 與自訂 macro wrapper 仍不在範圍內。
- Spring Web 支援直接 Java/Kotlin controller、字面類別前綴、HTTP shortcut 與可證明的 `RequestMethod` 集合；條件、代理與執行期路由不推斷。
- Spring `@ConfigurationProperties` 支援直接 Java/Kotlin 類別、Java `record` 與直接 `@Configuration` 類別中的 Java/Kotlin `@Bean` 成員。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
