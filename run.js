/**
 * run.js
 * 程序入口：启动 Gateway → 启动 Tunnel → 拼接鉴权 URL → 打印二维码。
 */

import { TunnelManager } from './src/tunnelManager.js';
import { startGateway } from './src/gateway.js';
import qrcode from 'qrcode-terminal';

const PORT = 28789;

// Agent 配置（根据实际 OpenClaw 安装路径调整）
const AGENT_OPTS = {
  command: process.env.AGENT_CMD || 'python',
  args: (process.env.AGENT_ARGS || 'main.py').split(' '),
  cwd: process.env.AGENT_CWD || undefined,  // 默认使用项目根目录
};

// 1. 先启动 Gateway（本地 HTTP + WebSocket + Agent）
const { sessionToken, agent } = startGateway(PORT, AGENT_OPTS);
console.log(`[run] 会话 Token 已生成：${sessionToken}`);

// 2. 启动隧道
const tunnel = new TunnelManager();

tunnel.on('tunnel_ready', (tunnelUrl) => {
  const fullUrl = `${tunnelUrl}/?token=${sessionToken}`;

  // 输出结构化事件供 Tauri sidecar 解析（单独一行，确保不被其他输出干扰）
  process.stdout.write('\n');
  process.stdout.write(JSON.stringify({ event: 'tunnel_ready', tunnelUrl, fullUrl }) + '\n');

  // 检测是否在 Tauri sidecar 环境（pkg 打包后 execPath 包含 openclaw-gateway）
  const isTauri = process.execPath.includes('openclaw-gateway');

  if (!isTauri) {
    // CLI 模式下打印二维码
    setTimeout(() => {
      console.log('\n' + '='.repeat(55));
      console.log('  OpenClawAnywhere 宿主端已就绪');
      console.log(`  公网地址：${tunnelUrl}`);
      console.log(`  鉴权地址：${fullUrl}`);
      console.log('='.repeat(55));

      qrcode.generate(fullUrl, { small: true }, (code) => {
        console.log(code);
      });
    }, 2000);
  } else {
    console.log('[run] 隧道已就绪，二维码将在桌面窗口中显示');
  }
});

tunnel.on('error', (err) => {
  console.error(`[run] 启动失败：${err.message}`);
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[run] 收到退出信号，正在关闭...');
  agent.stop();
  tunnel.stop();
  process.exit(0);
});

tunnel.start();
