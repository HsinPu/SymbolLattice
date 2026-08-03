<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為核心的本機程式碼智慧圖譜**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.237.0 是開發者預覽版，請由原始碼執行。MCP 查詢工具本身唯讀；但 `serve --mcp` 預設會啟動獨立的本機自動同步 watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可關閉它。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案的本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢已索引的程式碼證據
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## MCP 設定

`mcp-config` 只產生可複製的設定，絕不修改任何 Agent 設定檔。

```bash
# 將輸出貼到 ~/.codex/config.toml；預設假設 symbol-lattice 已在 PATH 中
node dist/cli/main.js mcp-config codex --project /path/to/project --print-snippet

# 直接從目前的原始碼 checkout 啟動，不依賴 PATH
node dist/cli/main.js mcp-config codex --project /path/to/project --source --print-snippet

# 產生通用 MCP JSON 片段
node dist/cli/main.js mcp-config generic-json --project /path/to/project --print-snippet
```

設定輸出的 `--project` 是明確的絕對路徑。若保留預設自動同步，背景 watcher 會做啟動時補齊與增量更新；要改成完全手動更新，產生設定時加入 `--no-auto-sync`，之後執行：

```bash
node dist/cli/main.js sync /path/to/project
```

## 重點能力

- 每一條關係保留規則、證據階段、解析狀態與信心度，不混淆 `exact`、`heuristic`、`unresolved`。
- 以 SQLite immutable generation 保存圖譜與差異，可查詢歷史、diff、Git hunk、影響範圍與受影響測試。
- 支援多語言與框架能力目錄，以及可驗證的路由、入口點、跨檔案匯入與 re-export 關係。
- MCP 讀取工作由獨立 worker pool 執行；寫入 watcher 不會交給查詢 handler。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `investigate <query>` | 從文字證據延伸至可解釋的結構化上下文。 |
| `impact <symbol>` | 以有界的精確靜態關係追蹤影響。 |
| `serve --mcp` | 啟動 MCP stdio 主機。 |
| `mcp-config <target>` | 產生 Codex 或通用 JSON 的安全設定片段。 |

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
