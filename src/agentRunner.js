/**
 * agentRunner.js
 * 负责启动 OpenClaw Agent 子进程，管理 stdin/stdout 双向数据流。
 * 通过 EventEmitter 将 Agent 输出转化为流式事件。
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/**
 * Agent 输出流的状态：
 *   idle     → 等待新一轮输出
 *   streaming → 正在接收 Agent 输出（一次完整回复）
 */

export class AgentRunner extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.command  启动命令，如 'python' 或 'node'
   * @param {string[]} opts.args  命令参数，如 ['main.py'] 或 ['index.js']
   * @param {string} [opts.cwd]   工作目录，默认项目根目录
   */
  constructor(opts = {}) {
    super();
    this._command = opts.command || 'python';
    this._args = opts.args || ['main.py'];
    this._cwd = opts.cwd || path.join(_dirname, '..');
    this._process = null;
    this._outputBuffer = '';
  }

  /** 启动 Agent 子进程 */
  start() {
    if (this._process) {
      console.warn('[AgentRunner] Agent 已在运行中，跳过重复启动。');
      return;
    }

    console.log(`[AgentRunner] 启动 Agent：${this._command} ${this._args.join(' ')}`);
    console.log(`[AgentRunner] 工作目录：${this._cwd}`);

    this._process = spawn(this._command, this._args, {
      cwd: this._cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // ─── stdout：Agent 的主要输出流 ──────────────────────────────────────

    this._process.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      this._handleOutput(text);
    });

    // ─── stderr：Agent 的错误/调试输出 ──────────────────────────────────

    this._process.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      console.error(`[AgentRunner:stderr] ${text.trimEnd()}`);
      this.emit('agent_error', text);
    });

    // ─── 进程生命周期 ───────────────────────────────────────────────────

    this._process.on('error', (err) => {
      console.error(`[AgentRunner] 进程启动失败：${err.message}`);
      this.emit('error', err);
    });

    this._process.on('exit', (code, signal) => {
      console.log(`[AgentRunner] Agent 已退出，code=${code}, signal=${signal}`);
      this._process = null;
      this.emit('exit', { code, signal });
    });

    this.emit('started');
    console.log(`[AgentRunner] Agent 进程已启动，PID: ${this._process.pid}`);
  }

  /**
   * 处理 Agent 输出。
   * 将原始 stdout 数据作为流式 token 透传（包括 <think> 标签）。
   *
   * 事件流：
   *   'stream_start'  → 一轮新回复开始
   *   'stream_chunk'  → 一个数据片段（原样透传，保留 <think> 标签）
   *   'stream_end'    → 一轮回复结束
   *
   * 结束检测策略：
   *   使用 debounce —— 如果 500ms 内没有新数据，认为本轮输出结束。
   *   这适用于大多数流式 LLM 输出场景。
   */
  _handleOutput(text) {
    // 首次收到数据，触发 stream_start
    if (!this._streaming) {
      this._streaming = true;
      this.emit('stream_start');
    }

    // 透传数据片段（保留 <think> 标签原样）
    this.emit('stream_chunk', text);

    // 重置 debounce 计时器
    if (this._endTimer) clearTimeout(this._endTimer);
    this._endTimer = setTimeout(() => {
      this._streaming = false;
      this.emit('stream_end');
    }, 500);
  }

  /**
   * 向 Agent 子进程的 stdin 写入数据。
   * @param {string} input 用户输入的指令文本
   */
  sendInput(input) {
    if (!this._process) {
      console.error('[AgentRunner] Agent 未运行，无法发送指令。');
      return false;
    }

    const line = input.endsWith('\n') ? input : input + '\n';
    this._process.stdin.write(line);
    console.log(`[AgentRunner] 已发送指令：${input.trim()}`);
    return true;
  }

  /** 停止 Agent 子进程 */
  stop() {
    if (this._process) {
      console.log('[AgentRunner] 正在停止 Agent...');
      this._process.kill('SIGTERM');

      const proc = this._process;
      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 3000);
      proc.on('exit', () => clearTimeout(killTimer));

      this._process = null;
    }
  }

  /** Agent 是否正在运行 */
  get running() {
    return this._process !== null;
  }
}
