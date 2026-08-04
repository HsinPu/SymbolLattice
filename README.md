<div align="center">

# SymbolLattice

**可查詢、可解釋、證據優先的本機程式碼智慧**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.251.0 是從原始碼執行的開發預覽版。MCP 查詢工具唯讀；但 `serve --mcp` 預設會啟動獨立的本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用它。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢含證據的結構脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## 核心能力

- 將多種語言與常見框架掃描成專案本機程式碼圖譜。
- 查詢 symbols、files、calls、routes、entrypoints、impact、history 與 diff。
- 每條關係保留規則、階段、候選目標、信心度、解析路徑與來源範圍。
- `files` 僅列出 active generation 已保存的檔案，並顯示語言、索引時間、圖譜計數與 freshness。
- 擴充框架的 route plugin 可精確解析同檔案與跨檔案固定 prefix mount；`explain-edge` 會顯示每段 mount 與 ESM import／re-export 路徑。動態或模糊組合不會被猜測成路由。
- 專案可註冊有版本的 reference resolver plugin，僅處理內建解析器留下的未解析關係；宿主會限制候選、驗證結果，並將衝突、例外或不安全選擇保留為可解釋的 unresolved 證據。
- framework fact plugin 可從框架語法新增受驗證的 symbols、routes、entrypoints 與 pending references。穩定 ID、containment edge、輸出上限、來源範圍與 provenance 都由宿主控制。
- framework project plugin 可在單檔抽取完成後檢視凍結的全專案 facts，新增跨檔案 pending references；不提供原始碼、raw graph mutation 或自訂信心度，最後仍由內建解析器決定證據層級。

## 框架 facts 擴充

```ts
const plugins = createFrameworkFactPluginRegistry([{
  id: "acme/framework-facts",
  version: "1.0.0",
  languages: ["typescript"],
  extract: ({ filePath, sourceText, coreFacts }) => ({
    symbols: [],
    references: []
  })
}]);

const service = new SymbolLatticeService(store, catalog, { frameworkFactPlugins: plugins });
```

跨檔案 finalizer 使用 `createFrameworkProjectPluginRegistry` 與 `frameworkProjectPlugins`；它只讀取已抽取 facts 並回傳受限 reference 描述。兩種外掛都不能直接寫入 raw graph identity。單檔外掛版本變更會重新抽取 facts；project finalizer 版本變更只重做 projection。需要處理仍未解析的目標時，可再組合 `ReferenceResolverPlugin`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `files [path]` | 列出已保存檔案與逐檔圖譜計數。 |
| `investigate <query>` | 將文字線索展開為結構脈絡。 |
| `impact <symbol>` | 沿精確靜態關係進行有限影響分析。 |
| `explain-edge <edge-id>` | 查看一條關係的完整證據。 |
| `serve --mcp` | 啟動 MCP stdio host。 |
| `mcp-doctor <target>` | 唯讀診斷 Agent MCP 設定、CLI 與索引。 |
| `mcp-install <target>` | 預覽；加上 `--apply --yes` 後安全寫入 MCP 設定。 |

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
