/**
 * run.js
 * 程序入口：启动 Gateway → 启动 Tunnel → 拼接鉴权 URL → 打印二维码。
 */

import { TunnelManager } from './src/tunnelManager.js';
import { startGateway } from './src/gateway.js';
import qrcode from 'qrcode-terminal';

const PORT = 18789;

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
  // 拼接带 Token 的完整访问地址
  const fullUrl = `${tunnelUrl}/?token=${sessionToken}`;

  console.log('\n' + '='.repeat(55));
  console.log('  OpenClawAnywhere 宿主端已就绪');
  console.log(`  公网地址：${tunnelUrl}`);
  console.log(`  鉴权地址：${fullUrl}`);
  console.log('='.repeat(55));
  console.log('\n  请用手机扫描下方二维码连接：\n');

  qrcode.generate(fullUrl, { small: true }, (code) => {
    console.log(code);
  });
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
