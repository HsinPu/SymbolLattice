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
> v0.264.0 是開發預覽版。MCP 查詢工具唯讀；但 `serve --mcp` 預設會啟動獨立的本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用它。

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

# 將不可變 Git hunk 歸因限縮到一個精確檔案或目錄
node dist/cli/main.js git-hunks /path/to/project --base origin/main --path-prefix src/domain --json

# 限縮 Git 變更，並只選指定模式的受影響測試
node dist/cli/main.js affected --working-tree --project /path/to/project --path-prefix src/domain --test-pattern "scenarios/**/*.scenario.ts" --json

# 以唯一檔名後綴定位，讀取同一 generation 的檔案證據
node dist/cli/main.js file service.ts --project /path/to/project --offset 1600 --limit 120 --json
```

也可從 [GitHub Releases](https://github.com/HsinPu/symbol-lattice/releases) 下載版本固定的 `.tgz`、SHA-256 與 manifest，再用 npm 安裝 `.tgz`。每個標籤發行都會先驗證完整測試、乾淨安裝與產物證明。

## 核心能力

- 將多種語言與常見框架掃描成專案本機程式碼圖譜。
- 查詢 symbols、files、calls、routes、entrypoints、impact、history 與 diff。
- 每條關係保留規則、階段、候選目標、信心度、解析路徑與來源範圍。
- `files` 僅查詢 active generation 已保存的檔案，支援目錄邊界正確的路徑篩選、anchored glob、flat/tree/grouped 投影與安全游標分頁；`src` 不會誤含 `src2`，游標會綁定 generation 與篩選條件。
- `file` 優先使用精確路徑，再接受唯一、不分大小寫的完整路徑或完整路徑後綴；同名衝突會列出排序候選，不會猜測。原始碼、符號與精確依賴者都綁定同一個 active generation；YAML 與 properties 只顯示結構，不洩漏內容值。
- 擴充框架的 route plugin 可精確解析同檔案與跨檔案固定 prefix mount；`explain-edge` 會顯示每段 mount 與 ESM import／re-export 路徑。動態或模糊組合不會被猜測成路由。
- 專案可註冊有版本的 reference resolver plugin，僅處理內建解析器留下的未解析關係；宿主會限制候選、驗證結果，並將衝突、例外或不安全選擇保留為可解釋的 unresolved 證據。
- framework fact plugin 可從框架語法新增受驗證的 symbols、routes、entrypoints 與 pending references。穩定 ID、containment edge、輸出上限、來源範圍與 provenance 都由宿主控制。
- framework project plugin 可在單檔抽取完成後檢視凍結的全專案 facts，新增跨檔案 pending references 與受限的 route-prefix projection；路由 ID、關係搬移、外掛 provenance 與逐段 mount 證據都由宿主建立。

## 外掛擴充

```js
// plugins/acme.mjs
export const symbolLatticePlugin = {
  schemaVersion: 1,
  frameworkFactPlugins: [{
    id: "acme/framework-facts",
    version: "1.0.0",
    languages: ["typescript"],
    extract: () => ({ symbols: [], references: [] })
  }]
};
```

```bash
node dist/cli/main.js init /path/to/project --plugin ./plugins/acme.mjs
```

同一份 manifest 可提供 `frameworkFactPlugins`、`frameworkProjectPlugins` 與 `referenceResolverPlugins`。`--plugin` 可重複使用，且會沿用至 `watch`、MCP 設定、安裝、診斷與卸載。外掛是受信任的同程序 JavaScript，不是 sandbox；SymbolLattice 不會自動探索或執行專案內的模組。預設只接受 real path 位於專案內的 `.js`、`.mjs`、`.cjs`，外部路徑必須明確加上 `--allow-external-plugin`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `files [path]` | 以 glob、投影與 generation-bound 游標分頁列出已保存檔案。 |
| `file <path>` | 從 active generation 讀取精確路徑或唯一後綴。 |
| `git-hunks [path] --base <ref>` | 以可選的 `--path-prefix` 篩選不可變 Git hunk 與宣告歸因。 |
| `affected --working-tree` | 以 `--path-prefix` 限縮 Git 變更，並可用 `--test-pattern` 取代預設測試命名規則。 |
| `investigate <query>` | 將文字線索展開為結構脈絡。 |
| `impact <symbol>` | 沿精確靜態關係進行有限影響分析。 |
| `explain-edge <edge-id>` | 查看一條關係的完整證據。 |
| `upgrade [version]` | 預覽、驗證或明確套用 GitHub Release 升級。 |
| `serve --mcp` | 啟動 MCP stdio host。 |
| `mcp-doctor <target>` | 唯讀診斷 Agent MCP 設定、CLI 與索引。 |
| `mcp-install <target>` | 預覽；加上 `--apply --yes` 後安全寫入 MCP 設定。 |
| `mcp-uninstall <target>` | 預覽；加上 `--apply --yes` 後移除相符的 MCP 設定。 |

`upgrade` 預設只產生唯讀計畫。`--verify` 會下載並核對 `.tgz`、SHA-256、manifest 與 GitHub Artifact Attestations API 證據，但不安裝；`--apply --yes` 僅支援 npm 本機或全域安裝，且只安裝已驗證的本機位元組，再確認 CLI 版本。原始碼 checkout 與 `npx` 不會自動修改；降版還需要 `--allow-downgrade`。

```bash
symbol-lattice upgrade --check
symbol-lattice upgrade 0.264.0 --verify
symbol-lattice upgrade 0.264.0 --apply --yes
```

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
