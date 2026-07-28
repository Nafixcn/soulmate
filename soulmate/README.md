# 灵伴 SoulMate

> AI-powered desktop companion — a native app built with Tauri 2, React 19, and Rust.

灵伴是一款运行在本地的 AI 女友桌面应用。你可以定制她的外貌、性格和说话风格，通过文字与她实时对话。应用支持流式输出、深度思考展示、语音朗读、关系阶段自动推进、联网知识补充，所有数据本地存储，API Key 由系统钥匙串安全保管。

**技术架构**：前端基于 React 19 + TypeScript + Vite 8 + Zustand 5，后端为 Rust 编写的 Tauri 2 原生层，通过 IPC 暴露异步命令。LLM 对话采用 SSE (Server-Sent Events) 流式传输，Rust 侧使用 `reqwest` 发起 HTTP 流式请求并以 `tokio` channel 桥接至前端。数据持久化使用 SQLite (WAL 模式)，通过 `rusqlite` 绑定实现 ORM-free 的 DAO 层，支持游标分页、全文搜索、schema 迁移和 v1→v2 旧版兼容。API Key 通过 `keyring` crate 写入操作系统钥匙串（macOS Keychain），全程无明文落地。

## 功能

- **多角色管理**：创建、编辑、切换多个 AI 女友角色，自定义名称、年龄、性格、爱好、说话风格、称呼、头像、发色瞳色
- **6 种人格**：温柔体贴 / 傲娇毒舌 / 高冷冷艳 / 元气活泼 / 成熟知性 / 软萌害羞
- **多 API 支持**：DeepSeek / OpenAI / 阿里百炼 Qwen / 智谱 GLM / Moonshot Kimi / 硅基流动 / 自定义 OpenAI 兼容端点
- **流式对话**：SSE 实时流式输出，支持思考过程展示（reasoning），可中途取消
- **防幻觉系统**：强力 prompt 约束模型不编造信息，不确定时坦诚告知
- **Markdown 渲染**：GitHub Flavored Markdown 富文本消息显示
- **语音输出**：Web Speech API 文字转语音，自动朗读 AI 回复，可调节语速语调
- **关系推进系统**：5 阶段（刚认识 → 朋友 → 暧昧 → 热恋 → 老夫老妻），AI 自动评估推进
- **联网搜索**：Wikipedia 知识检索，仅在用户提问时触发
- **每日问候**：随机定时通知（9:00-21:00，每天 4-6 次）
- **消息搜索/导出**：SQLite 全文搜索 + Markdown 导出
- **6 套主题**：樱花粉 / 天空蓝 / 薄荷绿 / 薰衣草 / 暖橘 / 暗夜 + 自定义颜色 + 花瓣动画
- **表情检测**：自动识别 AI 回复中的 6 种情绪（平静 / 开心 / 害羞 / 喜爱 / 惊讶 / 思考）
- **本地持久化**：SQLite 存储消息、角色和设置，WAL 模式
- **安全配置**：API Key 由操作系统钥匙串存储，不落地明文

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 前端 | React 19 + TypeScript + Vite 8 |
| UI 图标 | Lucide React |
| 状态管理 | Zustand 5 |
| Markdown | react-markdown + remark-gfm |
| 后端 | Rust (tokio, reqwest, rusqlite, keyring, serde) |
| 数据库 | SQLite (WAL 模式) |
| 网络搜索 | Wikipedia API |
| 语音 | Web Speech API |
| 测试 | Vitest + Playwright |
| CI/CD | GitHub Actions |

## 开发

### 前置要求

- Node.js ≥ 22.12
- Rust toolchain (stable)
- macOS: Xcode Command Line Tools

### 安装运行

```bash
cd soulmate
npm install
npm run tauri dev
```

Dev server 运行于 `http://localhost:1420`。

### 构建

```bash
npm run tauri build
```

### 质量检查

```bash
npm run lint            # ESLint
npm test                # Vitest 单元测试
npm run test:e2e        # Playwright 端到端测试
npm run format:check    # Prettier 格式检查
npm run format          # Prettier 自动格式化
```

Rust 侧：

```bash
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

## 配置

首次启动需在 **设置 → AI** 面板配置 API Key，选择模型提供商和模型。支持的预设提供商：

| 提供商 | API 地址 | 可用模型 |
|---|---|---|
| DeepSeek | api.deepseek.com | chat / reasoner / v4-pro / v4-flash |
| OpenAI | api.openai.com | gpt-4o / gpt-4o-mini / gpt-4.1 / o4-mini |
| 阿里百炼 | dashscope.aliyuncs.com | qwen3-235b / qwen3-max / qwen-plus / qwen-turbo |
| 智谱 GLM | open.bigmodel.cn | glm-4.5 / glm-4-plus / glm-4-flash / glm-z1-air |
| Moonshot | api.moonshot.cn | moonshot-v1-8k/32k/128k |
| 硅基流动 | api.siliconflow.cn | DeepSeek-V3 / GLM-4.5 / Qwen3-235B |
| 自定义 | 任意地址 | 任意 OpenAI 兼容模型 |

## 项目结构

```
soulmate/
├── src/                       # React 前端
│   ├── main.tsx               # 入口
│   ├── App.tsx                # 根组件，主题 CSS 变量
│   ├── index.css              # 全局样式
│   ├── components/            # UI 组件
│   │   ├── ChatWindow.tsx     # 主聊天视图
│   │   ├── ChatHeader.tsx     # 顶部角色信息、关系徽章
│   │   ├── ChatInput.tsx      # 消息输入栏
│   │   ├── MessageBubble.tsx  # 消息气泡（复制/删除/重生成）
│   │   ├── PersonaEditor.tsx  # 角色编辑器
│   │   ├── PersonaManager.tsx # 多角色管理
│   │   ├── SettingsPanel.tsx  # AI/语音/主题/关于 设置
│   │   ├── SearchPanel.tsx    # 消息搜索
│   │   └── ErrorBoundary.tsx  # 错误边界
│   ├── store/                 # Zustand 状态
│   │   ├── chatStore.ts       # 聊天/消息/流式状态
│   │   └── settingsStore.ts   # 设置/角色/主题状态
│   ├── services/              # 服务层
│   │   ├── conversationGateway.ts  # 消息、流式 AI 与搜索 IPC adapter
│   │   ├── conversationTurn.ts     # 完整对话轮次编排、重试与回复持久化
│   │   ├── conversationService.ts  # 系统 prompt 与知识检索组装
│   │   ├── greetingService.ts      # 每日问候调度
│   │   ├── chatExport.ts           # Markdown 导出
│   │   ├── ttsService.ts           # Web Speech API 封装
│   │   ├── settingsGateway.ts      # 设置与钥匙串 IPC adapter
│   │   └── settingsPersistence.ts  # 持久化与迁移
│   ├── domain/                # 领域逻辑
│   │   ├── conversation.ts    # Prompt 构建、表情检测
│   │   └── persona.ts         # 角色标准化
│   ├── hooks/                 # 自定义 Hooks
│   │   ├── useChatLifecycle.ts # 角色切换副作用
│   │   ├── useChatScroll.ts   # 滚动自动跟随 + 加载更多
│   │   └── useChatShortcuts.ts # 键盘快捷键
│   └── types/                 # TypeScript 类型定义
│       └── index.ts           # 类型 + API/THEME/DEFAULT_PERSONA 常量
└── src-tauri/                 # Rust 后端
    ├── tauri.conf.json        # 窗口、CSP、Bundle、权限
    ├── Cargo.toml
    └── src/
        ├── lib.rs             # 应用入口、Tauri 命令注册
        ├── ai.rs              # SSE 流式调用、关系评估
        ├── credentials.rs     # 系统钥匙串 API Key 管理
        ├── db.rs              # SQLite 建表/CRUD/分页/迁移/设置
        └── search.rs          # Wikipedia 网络搜索
```

## License

MIT
