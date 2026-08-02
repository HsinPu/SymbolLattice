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
> v0.195.0 是開發者預覽版，請從原始碼執行。

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

## v0.195.0 重點

- 直接的 Swift `extension TypeName` 及其直接方法現在會保留為可查詢的語法容器，不會假裝成繼承關係。
- 當同一檔案中恰有一個明確 `@objc(Class)` 的頂層 class，且 extension 方法也明確標示 `@objc(selector)` 時，`RCT_EXTERN_*` bridge 才會建立精確、可解釋的 Swift `references` 關係。
- extension 位於其他檔案、類別候選不唯一、裸 `@objc` 或推導 selector 時，都不會由名稱或慣例猜測 bridge 目標。
- 擴充後的 Swift interop 事實可保存至 SQLite；重開索引後仍可從 Objective-C bridge 查到 extension 中的 Swift 實作。

## 證據原則

- 索引與查詢都在本機執行；不會自行上傳原始碼。
- `init` 與 `sync` 是明確寫入操作；CLI 與 MCP 查詢維持唯讀。
- JavaScript 呼叫會先連到 Objective-C bridge 宣告；已證明的 bridge 再連到 Swift 原始碼，讓跨語言邊界可追溯。

## 靜態分析邊界

- 僅接受直接、單行的 `RCT_EXTERN_MODULE`、`RCT_EXTERN_REMAP_MODULE` 與對應方法巨集。
- Swift 會保留直接、頂層的 `extension TypeName` 與其直接方法。extension 方法要成為 bridge 實作，仍須同檔唯一的明確 `@objc(Class)` 類別與明確 `@objc(selector)`；不會跨檔案以型別名稱配對。
- 裸 `@objc`、推導 selector、限定或帶型別參數的 extension target、包裝巨集與動態註冊不會被推測。
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
