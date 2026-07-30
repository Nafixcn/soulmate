# 灵伴 SoulMate

> AI-powered desktop companion — a native app built with Tauri 2, React 19, and Rust.

灵伴是一款运行在本地的 AI 女友桌面应用。你可以定制她的外貌、性格和说话风格，通过文字与她实时对话。应用支持流式输出、深度思考展示、语音朗读、关系阶段自动推进和可选的联网知识补充。角色、消息与设置默认保存在本机，API Key 由系统钥匙串保管；生成回复时，对话上下文会发送给你选择的模型服务商，详见[隐私说明](PRIVACY.md)。

**技术架构**：前端基于 React 19 + TypeScript + Vite 8 + Zustand 5，后端为 Rust 编写的 Tauri 2 原生层，通过 IPC 暴露异步命令。LLM 对话采用 SSE (Server-Sent Events) 流式传输，Rust 侧使用 `reqwest` 发起 HTTP 流式请求并以 `tokio` channel 桥接至前端。数据持久化使用 SQLite (WAL 模式)，通过 `rusqlite` 绑定实现 ORM-free 的 DAO 层，支持游标分页、FTS5 trigram 搜索、schema 迁移和旧版兼容。API Key 通过 `keyring` crate 按 API 主机写入操作系统钥匙串，不写入 SQLite。

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
- **消息搜索/导出**：SQLite FTS5 trigram 搜索（短查询回退 `LIKE`）+ Markdown 导出
- **数据恢复**：完整 JSON 备份导入/导出，数据库损坏时隔离原文件并安全重建
- **6 套主题**：樱花粉 / 天空蓝 / 薄荷绿 / 薰衣草 / 暖橘 / 暗夜 + 自定义颜色 + 花瓣动画
- **表情检测**：自动识别 AI 回复中的 6 种情绪（平静 / 开心 / 害羞 / 喜爱 / 惊讶 / 思考）
- **本地持久化**：SQLite 存储消息、角色和设置，WAL 模式
- **安全配置**：API Key 由操作系统钥匙串存储，不落地明文
- **可选应用锁**：4-12 位 PIN 由系统钥匙串保管，启动时在原生层验证
- **首次使用引导**：配置用户资料、交流边界和模型服务，并在进入聊天前验证连接
- **可控长期记忆**：从用户明确表达的信息中提取资料、偏好、事件与边界，支持查看、固定、手动添加和删除
- **真实主动问候**：仅根据用户资料或真实聊天主题问候，支持开关、频率和安静时段
- **可解释关系里程碑**：关系自动推进时显示基于近期真实互动的简短依据

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
npm --prefix soulmate install
node scripts/check-version.mjs

cd soulmate
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

`scripts/check-version.mjs` 会检查 `package.json`、`package-lock.json`、`Cargo.toml` 和 `tauri.conf.json` 的应用版本是否一致。发布标签还可通过 `node scripts/check-version.mjs --tag v2.0.0` 校验。

## macOS 构建与发布

`.github/workflows/macos-release.yml` 使用官方 `tauri-apps/tauri-action` 构建 Apple Silicon 和 Intel 的 `.app`/`.dmg`：

- 在 GitHub Actions 手动运行工作流时，使用 ad-hoc identity `-` 进行无 Apple Developer 凭证的 smoke build，并保存 workflow artifacts；
- 推送与应用版本一致的 `v*` 标签（例如 `v2.0.0`）时，构建产物并创建或更新 GitHub Draft Release；
- 工作流显式关闭 updater JSON 和 updater 签名产物，当前不提供自动更新。

正式分发前，可在 GitHub Actions Secrets 中配置 Tauri 官方环境变量：`APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`。未配置 Apple 凭证时产生的构建不具备 Apple Developer 签名和公证，请勿将 Draft Release 直接发布给最终用户。

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

```text
.
├── .github/workflows/         # 质量检查与 macOS 发布
├── scripts/                   # 仓库维护脚本
├── README.md                  # 项目主文档（canonical）
├── PRIVACY.md                 # 隐私说明
├── LICENSE                    # MIT License
└── soulmate/
    ├── src/                   # React 前端
    │   ├── main.tsx           # 入口
    │   ├── App.tsx            # 根组件
    │   ├── components/        # UI 组件
    │   ├── domain/            # 领域逻辑
    │   ├── hooks/             # 自定义 Hooks
    │   ├── services/          # 服务与 IPC adapter
    │   ├── store/             # Zustand 状态
    │   └── types/             # TypeScript 类型
    └── src-tauri/             # Rust 后端
        ├── tauri.conf.json    # 窗口、CSP、Bundle、权限
        ├── Cargo.toml
        └── src/
            ├── lib.rs         # 应用入口、Tauri 命令注册
            ├── ai.rs          # SSE 流式调用、关系评估
            ├── credentials.rs # 系统钥匙串 API Key 管理
            ├── db.rs          # SQLite、迁移、备份与恢复
            └── search.rs      # Wikipedia 网络搜索
```

## License

[MIT](LICENSE)
