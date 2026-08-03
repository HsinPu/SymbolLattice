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
> v0.247.0 是從原始碼執行的開發預覽版。MCP 查詢工具唯讀；但 `serve --mcp` 預設會啟動獨立的本機 auto-sync watcher，可能更新專案的 `.symbol-lattice` 索引。加入 `--no-auto-sync` 可停用它。

## 快速開始

需要 Node.js `>=22.13 <25` 與 npm。

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# 建立專案本機圖譜
node dist/cli/main.js init /path/to/project

# 查詢可解釋的結構化脈絡
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## 核心能力

- 將多種語言與常見框架掃描成專案本機程式碼圖譜。
- 查詢 symbols、索引檔案、呼叫、路由、入口點、影響範圍、歷史 generation 與差異。
- `files` 只列出 active generation 中已保存的檔案，並提供語言、索引時間與每檔 declaration／edge／pending-reference 統計；`status.stale` 會顯示目前專案是否已與該 generation 脫節。
- 保留每條關係的規則、階段、候選目標、信心度與解析路徑。
- 對固定 prefix chain 的擴充框架路由，`explain-edge` 可顯示每個 mount segment 的 receiver、方法、prefix 與來源位置。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `init <path>` | 建立圖譜。 |
| `sync <path>` | 明確同步或修復圖譜。 |
| `watch <path>` | 在前景監看並同步。 |
| `files [path]` | 列出已保存的索引檔案與每檔圖譜統計。 |
| `investigate <query>` | 將文字證據擴展為結構化脈絡。 |
| `impact <symbol>` | 沿精確靜態關係追蹤有界影響。 |
| `explain-edge <edge-id>` | 檢視單一關係的完整證據。 |
| `serve --mcp` | 啟動 MCP stdio host。 |
| `mcp-doctor <target>` | 唯讀檢查 Agent MCP 設定、CLI 與索引。 |
| `mcp-install <target>` | 預覽，或用 `--apply --yes` 安全寫入 MCP 設定。 |

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
