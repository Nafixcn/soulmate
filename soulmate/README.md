# 灵伴 SoulMate

AI 女友桌面陪伴应用 —— 基于 Tauri 2 + React 19 + Rust 构建。

## 功能

- **多角色管理**：创建和管理多个 AI 女友角色
- **多 API 支持**：DeepSeek / OpenAI / Qwen / GLM / Kimi / 硅基流动
- **流式对话**：SSE 实时流式输出，支持思考过程展示
- **Markdown 渲染**：富文本消息显示
- **语音输入**：macOS 原生 Speech Recognition
- **语音输出**：Web Speech API 文字转语音
- **关系推进**：每 20 条消息 AI 自动评估并推进关系阶段
- **消息搜索/导出**：全文搜索和 Markdown 导出
- **消息持久化**：SQLite 存储聊天记录
- **安全配置**：API Key 由操作系统钥匙串存储

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 前端 | React 19 + TypeScript + Vite 6 |
| 状态管理 | Zustand 5 |
| 后端 | Rust (reqwest, rusqlite, tokio) |
| 数据库 | SQLite (WAL 模式) |

## 开发

### 前置要求

- Node.js ≥ 18
- Rust toolchain (stable)
- macOS: Xcode Command Line Tools

### 安装运行

```bash
cd soulmate
npm install
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

## 项目结构

```
soulmate/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   ├── store/              # Zustand 状态
│   ├── services/           # 服务层 (TTS)
│   └── types/              # TypeScript 类型
└── src-tauri/              # Rust 后端
    └── src/
        ├── lib.rs          # 应用入口
        ├── ai.rs           # LLM 流式调用
        ├── credentials.rs  # 系统钥匙串
        ├── db.rs           # SQLite 持久化
        └── speech.rs       # macOS 语音识别
```

## License

MIT
