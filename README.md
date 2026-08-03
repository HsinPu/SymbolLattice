<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為核心的本機程式碼智慧工具**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.246.0 是從原始碼執行的開發預覽版。MCP 查詢工具本身唯讀；但 `serve --mcp` 預設會啟動獨立的本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可關閉它。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢可解釋的結構脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## 核心能力

- 掃描多種語言與常見框架，建立專案本機的程式碼圖譜。
- 查詢 symbol、呼叫關係、路由、入口點、影響範圍、歷史 generation 與差異。
- 每個關係保留規則、階段、候選目標、信心度與解析路徑等證據。
- 對擴充框架的固定 prefix route chain，`explain-edge` 會依順序列出每一段 mount 的 receiver、方法、prefix 與原始碼位置。

## 擴充框架路由

以受驗證、專案作用域的 descriptor 擴充靜態路由辨識。支援的 receiver route 需要精確 ESM import、`const` 零參數建構、literal path 與具名 handler。`mountMethods` 僅投影同檔案、同 descriptor、唯一且固定的非根 prefix chain（最多 16 段）；動態、重複、循環、尾端斜線、overload 或過深 chain 都不會產生 child route fact。

```ts
import {
  createFrameworkRoutePluginExtractor,
  createFrameworkRoutePluginRegistry
} from "@hsinpu/symbol-lattice";

const registry = createFrameworkRoutePluginRegistry([
  {
    id: "acme/lattice-router",
    languages: ["typescript", "javascript"],
    moduleSpecifier: "@acme/lattice-router",
    factoryExport: "Router",
    routeMethods: [{ methodName: "get", routeMethod: "GET" }],
    mountMethods: [{ methodName: "mount" }],
    surfaces: ["exact named imports", "const literal routes", "fixed prefix mounts"]
  }
]);

const extractor = createFrameworkRoutePluginExtractor(registry);
```

將 `extractor` 傳入 `SymbolLatticeService` 建構子的第三個參數。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 前景監看並同步。 |
| `investigate <query>` | 從文字證據展開結構脈絡。 |
| `impact <symbol>` | 沿著精確靜態關係分析影響。 |
| `explain-edge <edge-id>` | 查看一條關係的完整證據。 |
| `serve --mcp` | 啟動 MCP stdio host。 |
| `mcp-doctor <target>` | 唯讀檢查 Agent MCP 設定、CLI 與索引。 |
| `mcp-install <target>` | 預覽或以 `--apply --yes` 安全寫入 MCP 設定。 |

## 驗證

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
```

## 授權

[MIT](LICENSE)
