/**
 * gateway.js
 * Express + Socket.io 网关服务，负责 Token 鉴权与 WebSocket 握手。
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentRunner } from './agentRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 启动 Gateway 服务。
 * @param {number} port 监听端口
 * @param {object} [agentOpts] AgentRunner 配置项
 * @param {string} [agentOpts.command] 启动命令，如 'python'
 * @param {string[]} [agentOpts.args] 命令参数，如 ['main.py']
 * @param {string} [agentOpts.cwd] 工作目录
 * @returns {{ io: Server, httpServer: import('http').Server, sessionToken: string, agent: AgentRunner }}
 */
export function startGateway(port, agentOpts = {}) {
  const sessionToken = nanoid();

  const app = express();

  // 静态文件服务（移动端 Web 控制台）
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 调试路由：浏览器直接访问根路径时可快速确认 HTTP 层是否通畅
  app.get('/ping', (_req, res) => {
    res.send('Gateway is online');
  });

  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  // ─── Token 鉴权中间件 ──────────────────────────────────────────────────

  io.use((socket, next) => {
    const clientToken = socket.handshake.auth?.token;
    const clientIP =
      socket.handshake.headers['x-forwarded-for'] ||
      socket.handshake.address;

    if (!clientToken || clientToken !== sessionToken) {
      console.warn(
        `[警告] 未经授权的连接尝试，源 IP: ${clientIP}`
      );
      return next(new Error('Authentication failed'));
    }

    console.log(`[Gateway] 客户端鉴权通过，IP: ${clientIP}`);
    next();
  });

  // ─── Agent 子进程 ───────────────────────────────────────────────────

  const agent = new AgentRunner(agentOpts);

  // Agent 退出时通知所有已连接的客户端
  agent.on('exit', ({ code, signal }) => {
    io.emit('agent_error', { text: `Agent 已退出 (code=${code}, signal=${signal})` });
  });

  // 启动 Agent
  agent.start();

  // ─── 连接事件 ──────────────────────────────────────────────────────────

  // 调试日志：监控 Engine.IO 握手请求
  io.engine.on('initial_headers', (headers, req) => {
    console.log(`[Gateway] 收到握手请求，来源: ${req.headers['user-agent'] || 'unknown'}`);
  });

  io.on('connection', (socket) => {
    console.log(`[Gateway] 新客户端已连接：${socket.id}`);

    // 通知移动端连接成功
    socket.emit('connection_success', {
      message: '已连接到 OpenClawAnywhere 宿主端',
      timestamp: Date.now(),
      agentRunning: agent.running,
    });

    // ── Agent 输出 → 前端流式推送 ──

    const onStreamStart = () => socket.emit('ai_stream_start');
    const onStreamChunk = (text) => socket.emit('ai_stream_chunk', { text });
    const onStreamEnd = () => socket.emit('ai_stream_end');
    const onAgentError = (text) => socket.emit('agent_error', { text });

    agent.on('stream_start', onStreamStart);
    agent.on('stream_chunk', onStreamChunk);
    agent.on('stream_end', onStreamEnd);
    agent.on('agent_error', onAgentError);

    // ── 前端指令 → Agent stdin ──

    socket.on('command', (data) => {
      if (data?.action === 'ping') {
        console.log('[DEBUG] 收到前端心跳指令');
        socket.emit('command_response', { action: 'pong', timestamp: Date.now() });
        return;
      }

      if (data?.action === 'chat' && data.text) {
        console.log(`[Gateway] 转发用户指令到 Agent：${data.text}`);
        const sent = agent.sendInput(data.text);
        if (!sent) {
          socket.emit('agent_error', { text: 'Agent 未运行，请检查宿主端。' });
        }
        return;
      }
    });

    // 断开时清理事件监听，防止内存泄漏
    socket.on('disconnect', (reason) => {
      console.log(`[Gateway] 客户端断开：${socket.id}，原因：${reason}`);
      agent.off('stream_start', onStreamStart);
      agent.off('stream_chunk', onStreamChunk);
      agent.off('stream_end', onStreamEnd);
      agent.off('agent_error', onAgentError);
    });
  });

  // ─── 启动 HTTP 服务 ────────────────────────────────────────────────────

  // 极简 HTTP 流量调试日志（确认 cloudflared 流量是否到达 Node.js）
  httpServer.on('request', (req) => {
    console.log(`[HTTP DEBUG] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[Gateway] 服务已启动，监听 0.0.0.0:${port}`);
  });

  return { io, httpServer, sessionToken, agent };
}
