<div align="center">

# SymbolLattice

**可查詢、可解釋、證據優先的本機程式碼智慧工具**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.244.0 是從原始碼執行的開發者預覽版。MCP 查詢工具唯讀；但 `serve --mcp` 預設會啟動獨立的本機自動同步 watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用它。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢可追溯的結構化脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## 框架路由擴充

可用受限、已驗證的描述支援尚未內建的框架路由。核心負責解析原始碼與寫入圖譜：TypeScript／JavaScript receiver 僅接受精確 ESM 匯入、`const` 零參數建構、字面路徑與命名處理函式；TypeScript decorator 僅接受精確匯入、具實作的非 static method 與單一字面絕對路徑。`mountMethods` 只會投影同檔、同一 descriptor、唯一且固定非根 prefix 的 `parent.mount("/prefix", child)`；動態、重複、巢狀、尾斜線或多參數掛載都不產生 child 路由。其他組合不會產生路由事實。registry 不會從專案自動載入，其指紋會納入 extractor version；描述變更後既有事實會顯示為過期。

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
    decoratorRoutes: [{ decoratorExport: "Get", routeMethod: "GET" }],
    mountMethods: [{ methodName: "mount" }],
    surfaces: ["精確 named Router 匯入", "const HTTP 路由", "TypeScript decorator 路由", "同檔固定 prefix 掛載"]
  }
]);

const extractor = createFrameworkRoutePluginExtractor(registry);
// 將 `extractor` 作為 SymbolLatticeService 的第三個建構子參數。
```

## MCP 設定

支援 `codex`、`claude`、`cursor`、`opencode`、`gemini`、`kiro`、`hermes`、`antigravity` 與 `generic-json`。

```bash
# 先預覽：不會寫入設定、備份或索引
node dist/cli/main.js mcp-install claude --project /path/to/project --json

# 確認計畫後才套用：既有檔案先完整備份，再原子更新
node dist/cli/main.js mcp-install claude --project /path/to/project --apply --yes --json

# 移除前先預覽；設定檔與其他 MCP 項目不會被刪除
node dist/cli/main.js mcp-uninstall claude --project /path/to/project --json

# 確認後才移除 SymbolLattice 自己的 MCP 項目
node dist/cli/main.js mcp-uninstall claude --project /path/to/project --apply --yes --json

# 唯讀檢查既有設定、CLI 與索引
node dist/cli/main.js mcp-doctor claude --project /path/to/project --json
```

`mcp-install` 與 `mcp-uninstall` 都預設只預覽；套用時會先完整備份、再原子更新。兩者只會變更選定 Agent 的 SymbolLattice MCP 項目，保留同檔其他項目，且移除器絕不刪除設定檔。無法安全解析的既有設定會被拒絕寫入。`mcp-config` 仍可只產生可複製的設定片段，不讀寫 Agent 設定。`generic-json` 必須明確提供 `--config /path/to/mcp.json`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `investigate <query>` | 將文字證據展開為可解釋的結構化脈絡。 |
| `impact <symbol>` | 沿著精確靜態關係追蹤有界影響範圍。 |
| `serve --mcp` | 啟動 MCP stdio 主機。 |
| `mcp-config <target>` | 產生不讀寫設定檔的 MCP 片段。 |
| `mcp-doctor <target>` | 唯讀診斷 Agent MCP 設定、CLI 與專案索引。 |
| `mcp-install <target>` | 預覽或在 `--apply --yes` 後安全寫入 MCP 設定。 |
| `mcp-uninstall <target>` | 預覽或在 `--apply --yes` 後安全移除自己的 MCP 項目。 |

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
