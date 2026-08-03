<div align="center">

# SymbolLattice

**可查詢、可解釋、以證據為核心的本機程式碼情報**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

繁體中文 | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.239.0 為開發者預覽版，從原始碼執行。MCP 查詢工具是唯讀的；但 `serve --mcp` 預設會啟動獨立的自動同步 watcher，可能更新專案的 `.symbol-lattice` 索引。加上 `--no-auto-sync` 即可停用。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢有證據支撐的結構化脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## MCP 設定

`mcp-config` 只產生可貼上的設定片段：不偵測、不讀取，也不改寫任何 Agent 設定檔。支援 `codex`、`claude`、`cursor`、`opencode`、`gemini`、`kiro`、`hermes`、`antigravity` 與 `generic-json`。

```bash
# Claude 的專案設定（預設為 local）
node dist/cli/main.js mcp-config claude --project /path/to/project --print-snippet

# Cursor 的全域設定會使用 ${workspaceFolder} 綁定目前開啟的工作區
node dist/cli/main.js mcp-config cursor --location global --project /path/to/project --print-snippet

# Codex 是全域設定；--source 會固定使用這個 checkout 的 Node 入口點
node dist/cli/main.js mcp-config codex --project /path/to/project --source --print-snippet
```

`claude`、`cursor`、`opencode`、`gemini` 與 `kiro` 預設產生專案設定，也可加 `--location global`。`codex`、`hermes`、`antigravity` 僅支援全域設定。若要完全手動更新圖譜，產生設定時加上 `--no-auto-sync`，之後執行：

對 OpenCode 與 Antigravity，先省略 `--print-snippet` 取得包含 `destination` 的輸出；其中會列出既有設定檔或 migration 狀態所需的替代路徑。

```bash
node dist/cli/main.js sync /path/to/project
```

`mcp-doctor` 只讀取所選的 Agent 設定，檢查預期項目、CLI 可執行性與專案索引；不會執行 MCP、更新設定檔或寫入索引。

```bash
# 使用 Agent 的預設設定路徑診斷
node dist/cli/main.js mcp-doctor claude --project /path/to/project

# generic JSON 必須明確指定要讀取的設定檔
node dist/cli/main.js mcp-doctor generic-json --config /path/to/mcp.json --project /path/to/project
```

## 提供的能力

- 每條關係都保留規則、證據階段、解析狀態與信心度；不混淆 `exact`、`heuristic` 與 `unresolved`。
- SQLite immutable generation 保存圖譜歷史、diff、Git hunk、受影響範圍與測試建議。
- 多語言、框架感知的 capability catalog，可證明路由、入口點、跨檔案匯入與 re-export。
- MCP 讀取查詢使用獨立 worker pool；查詢 handler 不取得索引寫入能力。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `investigate <query>` | 將文字線索展開為可解釋的結構脈絡。 |
| `impact <symbol>` | 透過精確靜態關係追蹤有限範圍影響。 |
| `serve --mcp` | 啟動 MCP stdio host。 |
| `mcp-config <target>` | 產生指定 Agent 的純輸出 MCP 設定片段。 |
| `mcp-doctor <target>` | 唯讀診斷 Agent MCP 設定、CLI 與專案索引。 |

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
