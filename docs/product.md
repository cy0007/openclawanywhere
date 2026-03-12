
---

# OpenClawAnywhere 产品规格说明书 (V 1.0)

## 1. 产品概述 (Product Overview)
*   **名称**：OpenClawAnywhere
*   **愿景**：让每一台运行 OpenClaw 的本地机器，通过扫码瞬间变为“随时随地可控”的私有化 AI 服务器。
*   **口号 (Tagline)**：*Your Mac/PC, Your Pocket AI Agent.*
*   **核心痛点**：本地 AI Agent 算力强大但“被锁死”在桌面；现有的移动端控制工具配置繁琐、体验割裂。

## 2. 目标用户 (Target Audience)
1.  **AI 极客/开发者**：希望随时查看 Agent 运行状态、调整 Prompt 的硬核用户。
2.  **个人自由职业者**：希望在通勤、咖啡厅等碎片时间，通过家里的高性能 PC 辅助处理业务。
3.  **小型自动化工作室 (ToB 高潜力)**：拥有多台本地 PC 节点，需要移动端进行集群化任务调度。

## 3. 功能架构 (Product Scope - MVP)

### 3.1 宿主端 (Host - Windows / macOS)
*   **一键守护进程**：支持开机自启，后台静默运行，无需人工干预。
*   **内网穿透管理**：集成 Cloudflare Tunnel，自动分配公网 HTTPS 域名。
*   **配置实时热更新**：通过 `chokidar` 监视配置文件变化，实现“手机修改 -> Mac 生效”的闭环。
*   **状态与日志转发**：将 Agent 的标准输出流 (Stdout) 实时推送到移动端。

### 3.2 移动端控制台 (Web / PWA)
*   **无感扫码直连**：基于 URL Token 鉴权，扫码即进入控制界面，无需登录、无需下载。
*   **流式交互 (Streaming UI)**：支持 Markdown 格式的 AI 思考流渲染，具备打字机效果。
*   **移动状态面板**：显示连接状态、本地 CPU/内存占用率、Agent 运行时长。
*   **参数控制台**：滑块/开关式 UI，直接修改模型参数 (Temperature, Model Switch 等)。

## 4. 技术栈栈道 (Technical Stack)
*   **后端宿主**：Node. Js + Express + Socket. Io + execa (管理子进程)。
*   **内网穿透**：Cloudflared (Quick Tunnel mode)。
*   **前端网页**：HTML 5 + TailwindCSS (轻量快速) + marked. Js (渲染) + socket. Io-client。

## 5. 路线图 (Roadmap)

### 第一阶段：MVP 验证 (Weeks 1-2)
*   完成 Node. Js 服务端的“穿透+鉴权+WS 转发”闭环。
*   上线 Web 控制台，实现“扫码->连接->聊天”的全流程。
*   **关键指标**：GitHub Star 数、用户反馈的“Aha Moment”占比。

### 第二阶段：生态完善 (Weeks 3-4)
*   引入本地 SQLite 数据库，记录聊天历史（保存在用户电脑，而非云端）。
*   增加 Windows 安装包制作 (Tauri / Electron 打包)。
*   支持“添加至主屏幕”的 PWA 功能，模拟原生 App 体验。

### 第三阶段：探索 (Month 2+)
*   开发“集群监控看板”，支持多台设备切换。
*   集成“任务完成通知”：利用 Web Push API 实现移动端提醒。

---

## 6. 核心产品原则 (The "Anywhere" Manifesto)

1.  **隐私至上**：除了必要的穿透请求，所有数据均保留在用户的本地机器，**绝不通过任何中继服务器保存聊天记录**。
2.  **零摩擦**：能扫码解决的问题，绝不让用户手动输入；能网页打开的，绝不强迫用户下载 App。
3.  **极速渲染**：UI 必须是轻量级的，打开网页即刻可用，白屏时间控制在 1 秒以内。

---
---

# OpenClawAnywhere 产品规格说明书 (V 2.0 - 全平台版)

## 1. 产品愿景
**“让每一台个人电脑，瞬间化身为触手可及的 AI 后台。”**
通过一套统一的 Node. Js 网关，实现 AI 能力在手机侧的无感移动化控制，打破操作系统壁垒。

## 2. 跨平台兼容策略 (The "Anywhere" Strategy)
*   **宿主端 (Host)**：不再依赖特定的操作系统 API，采用纯 Node. Js 运行时方案，保证代码在 Windows、macOS 和 Linux 上的一致性。
*   **通信层**：利用 Cloudflare Quick Tunnel 跨平台二进制特性，实现 3 秒内穿透任何 NAT 网络，无需手动配置路由器端口映射。
*   **移动端 (Client)**：基于 Web (PWA) 技术，只要手机有相机且能联网，即可通过扫码（URL Token）实现零安装直连。

## 3. 技术路线图 (MVP 阶段：全平台适配)

### 3.1 宿主核心 (Host Core - Node. Js)
*   **环境依赖**：仅需安装 `Node.js (LTS版本)`。
*   **守护进程实现**：采用 `execa` 调用跨平台二进制工具 (cloudflared)。
*   **自动化路径管理**：程序启动时，自动根据 `process.platform` 检测操作系统，并从官方库自动下载适配的 `cloudflared` 二进制包。

### 3.2 移动端控制台 (Web Console)
*   **扫码/链接直连**：网址格式为 `https://[tunnel-url]/?token=[token]`。
*   **智能鉴权**：页面加载时通过 `window.location.search` 获取参数，自动完成 WebSocket 握手。
*   **打字机渲染**：基于 `marked.js` 和 `highlight.js` (Markdown/代码高亮)，实现媲美原生 App 的输出流效果。

## 4. 产品功能清单 (Feature List)

| 模块 | 功能项 | 说明 |
| :--- | :--- | :--- |
| **启动中心** | `npm start` 一键启动 | 自动拉起穿透、WebSocket 和 Web 服务。 |
| **配对机制** | 魔法二维码 | 终端直接打印 URL 二维码，手机扫码即入。 |
| **实时控制** | 配置/模型热切换 | 手机端修改参数，服务端自动执行 `fs.writeFile` 并触发热重载。 |
| **状态看板** | 资源监控 | 实时展示 CPU/内存占用，确保 Agent 运行健康。 |
| **对话流** | 思考/回复分离 | 自动剥离 `<think>` 标签，以折叠 UI 展示深度思考过程。 |

## 5. 用户安装体验优化 (极简流程)

为了让“普通人”也能在 Windows 上跑通，我们采用 **“三步走”** 安装引导：

1.  **下载环境**：引导用户安装 [Node.js](https://nodejs.org/) (全平台标准)。
2.  **获取源码**：用户从 GitHub 下载项目压缩包并解压。
3.  **运行程序**：
    *   **Windows 用户**：双击 `run_windows.bat`。
    *   **macOS/Linux 用户**：在终端运行 `sh run_mac.sh`。

## 6. 开发原则 (Golden Rules)
1.  **操作系统不可见**：前端页面严禁出现任何与系统相关的路径或提示，移动端看到的只有“AI 控制面板”。
2.  **自愈能力**：一旦 WebSocket 连接中断，前端界面自动触发指数退避重连 (Exponential Backoff)，给用户“正在寻找 Mac/PC”的进度提示。
3.  **安全默认**：所有 Token 均由 `nanoid` 生成，确保每个用户的连接都是唯一的，防止他人扫描同一个 URL 恶意入侵。

---

