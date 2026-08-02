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
> v0.194.0 是開發者預覽版，請從原始碼執行。

SymbolLattice 在本機建立可查詢的程式碼符號圖譜。每一條關係都保留規則、證據階段與信心值；`exact`、`heuristic`、`unresolved` 不會混為一談。

## 快速開始

需要 Node.js 22.13 以上、25 以下，以及 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 明確建立本機索引
node dist/cli/main.js init /path/to/project

# 查詢維持唯讀；原始碼變更後請明確同步
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# 啟動唯讀 MCP 主機
node dist/cli/main.js serve --mcp --project /path/to/project
```

Windows PowerShell 若找不到 npm，請使用 `npm.cmd`。索引資料會寫入目標專案的 `.symbol-lattice/index.sqlite`。

## v0.194.0 重點

- React Native 的 `RCT_EXTERN_*` Objective-C bridge 會保留完整 selector，例如 `createEvent:withFoo:bar:`。
- Swift 僅在同時出現明確的 `@objc(Class)` 與 `@objc(selector)` 時，才會建立 bridge 宣告到 Swift 實作的精確 `references` 關係。
- 找不到或有多個 Swift 候選時，關係會保留為 `unresolved` 並附上候選符號，不會由 Swift 名稱或慣例猜測。
- 原始 bridge 與 Swift interop 事實可保存至 SQLite，重新開啟索引後仍可從 bridge 查到 Swift 實作。

## 證據原則

- 索引與查詢都在本機執行；不會自行上傳原始碼。
- `init` 與 `sync` 是明確寫入操作；CLI 與 MCP 查詢維持唯讀。
- JavaScript 呼叫會先連到 Objective-C bridge 宣告；已證明的 bridge 再連到 Swift 原始碼，讓跨語言邊界可追溯。

## 靜態分析邊界

- 僅接受直接、單行的 `RCT_EXTERN_MODULE`、`RCT_EXTERN_REMAP_MODULE` 與對應方法巨集。
- Swift 僅接受頂層 class 中直接宣告、明確命名的 `@objc` 類別與 selector；裸 `@objc`、推導 selector、extension、包裝巨集與動態註冊不會被推測。
- 不掃描建置產物，也不將執行期註冊、反射、程式碼產生或模糊候選標示為精確關係。

## 驗證

```bash
npm run check
npm test
npm run build
git diff --check
```

## 授權

[MIT](LICENSE)
