/**
 * tunnelManager.js
 * 负责自动下载 cloudflared 二进制并拉起 Cloudflare Quick Tunnel。
 * 通过 EventEmitter 在捕获到公网 URL 时触发 'tunnel_ready' 事件。
 */

import { EventEmitter } from 'events';
import { execa } from 'execa';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const tar = require('tar');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 获取本机内网 IPv4 地址（非 127.0.0.1）。
 * 用于 cloudflared --url 参数，避免 localhost/127.0.0.1 在某些 macOS 版本上被错误解析。
 * 如果获取失败，回退到 127.0.0.1。
 */
function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过 IPv6、回环、内部地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ─── 平台映射 ────────────────────────────────────────────────────────────────

/**
 * 根据 os.platform() / os.arch() 返回 cloudflared 官方 GitHub Release 的文件名。
 * 
 * 实际文件名（来自 GitHub Releases 页面验证）：
 *   macOS:   cloudflared-darwin-arm64.tgz / cloudflared-darwin-amd64.tgz
 *   Windows: cloudflared-windows-amd64.exe / cloudflared-windows-386.exe
 *   Linux:   cloudflared-linux-amd64 / cloudflared-linux-arm64 / ...
 */
function getCloudflaredAssetInfo() {
  const platform = os.platform();
  const arch = os.arch();

  const archMap = {
    x64: 'amd64',
    arm64: 'arm64',
    arm: 'arm',
    ia32: '386',
  };

  const mappedArch = archMap[arch] ?? 'amd64';

  if (platform === 'win32') {
    return { filename: `cloudflared-windows-${mappedArch}.exe`, isTgz: false };
  }
  if (platform === 'darwin') {
    // macOS 发布格式为 .tgz 压缩包，内含 cloudflared 裸二进制
    return { filename: `cloudflared-darwin-${mappedArch}.tgz`, isTgz: true };
  }
  // Linux 为裸二进制
  return { filename: `cloudflared-linux-${mappedArch}`, isTgz: false };
}

function getBinaryName() {
  return os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

// ─── 下载逻辑 ────────────────────────────────────────────────────────────────

/**
 * 下载文件，带简单进度打印（每 5% 打印一次）。
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl) => {
      https.get(requestUrl, (res) => {
        // 跟随 301/302 重定向（GitHub Release 会重定向到 objects.githubusercontent.com）
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`下载失败，HTTP 状态码：${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        let lastReportedPercent = -1;

        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const percent = Math.floor((downloaded / total) * 100);
            // 每 10% 打印一次，避免刷屏
            if (percent >= lastReportedPercent + 10) {
              lastReportedPercent = percent;
              process.stdout.write(`\r  下载进度：${percent}%`);
            }
          } else {
            // 未知总大小时，打印已下载字节数
            process.stdout.write(`\r  已下载：${(downloaded / 1024).toFixed(1)} KB`);
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          process.stdout.write('\n');
          fileStream.close(resolve);
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {}); // 清理残留文件
          reject(err);
        });
      }).on('error', reject);
    };

    doRequest(url);
  });
}

/**
 * 从 .tgz 压缩包中提取 cloudflared 二进制到目标目录。
 * @param {string} tgzPath  .tgz 文件路径
 * @param {string} destDir  解压目标目录
 */
async function extractTgz(tgzPath, destDir) {
  await tar.extract({
    file: tgzPath,
    cwd: destDir,
  });
}

const GITHUB_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

/**
 * 确保 cloudflared 二进制存在于 <project_root>/bin/。
 * 若不存在则自动下载。macOS 需额外解压 .tgz。
 * @returns {Promise<string>} 二进制文件的绝对路径
 */
async function ensureCloudflared() {
  // Tauri 打包环境：cloudflared 在 Sidecar 同级的 resources 目录下
  // 通过环境变量 TAURI_RESOURCE_DIR 或检测可执行文件同级目录
  const execDir = path.dirname(process.execPath);
  const tauriBinaryPath = path.join(execDir, getBinaryName());
  if (fs.existsSync(tauriBinaryPath)) {
    console.log(`[TunnelManager] cloudflared 已就绪（Tauri 打包）：${tauriBinaryPath}`);
    return tauriBinaryPath;
  }

  // 开发环境：cloudflared 在项目根目录的 bin/ 下
  const binDir = path.join(__dirname, '..', 'bin');
  const binaryPath = path.join(binDir, getBinaryName());

  // 创建 bin 目录（若不存在）
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (fs.existsSync(binaryPath)) {
    // 额外校验可执行权限（Windows 上 fs.constants.X_OK 检查无意义，跳过）
    if (os.platform() !== 'win32') {
      try {
        fs.accessSync(binaryPath, fs.constants.X_OK);
      } catch {
        console.log(`[TunnelManager] cloudflared 存在但缺少执行权限，正在修复...`);
        fs.chmodSync(binaryPath, 0o755);
      }
    }
    console.log(`[TunnelManager] cloudflared 已就绪：${binaryPath}`);
    return binaryPath;
  }

  const { filename, isTgz } = getCloudflaredAssetInfo();
  const downloadUrl = `${GITHUB_BASE}/${filename}`;

  console.log(`[TunnelManager] 未检测到 cloudflared，开始自动下载...`);
  console.log(`[TunnelManager] 平台：${os.platform()} / 架构：${os.arch()}`);
  console.log(`[TunnelManager] 下载地址：${downloadUrl}`);

  const manualHint = () => {
    console.error(`[TunnelManager] 请手动下载 cloudflared 并放入 bin/ 目录：`);
    console.error(`  https://github.com/cloudflare/cloudflared/releases/latest`);
  };

  // 下载目标路径：如果是 tgz 先下载到临时文件，否则直接下载到最终路径
  const downloadDest = isTgz
    ? path.join(binDir, filename)  // 临时 .tgz 文件
    : binaryPath;

  try {
    await downloadFile(downloadUrl, downloadDest);
  } catch (err) {
    // 清理残留
    if (fs.existsSync(downloadDest)) fs.unlinkSync(downloadDest);
    console.error(`[TunnelManager] ❌ 下载失败：${err.message}`);
    manualHint();
    throw err;
  }

  // macOS：解压 .tgz
  if (isTgz) {
    try {
      console.log(`[TunnelManager] 正在解压 ${filename}...`);
      await extractTgz(downloadDest, binDir);
      // 清理 .tgz 压缩包
      fs.unlinkSync(downloadDest);
    } catch (err) {
      // 清理残留
      if (fs.existsSync(downloadDest)) fs.unlinkSync(downloadDest);
      if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);
      console.error(`[TunnelManager] ❌ 解压失败：${err.message}`);
      manualHint();
      throw err;
    }
  }

  // 校验解压/下载后二进制是否存在
  if (!fs.existsSync(binaryPath)) {
    console.error(`[TunnelManager] ❌ 下载/解压后未找到 cloudflared 二进制文件。`);
    manualHint();
    throw new Error('cloudflared binary not found after download');
  }

  // 赋予执行权限
  if (os.platform() !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log(`[TunnelManager] 下载完成，已保存至：${binaryPath}`);
  return binaryPath;
}

// ─── TunnelManager ───────────────────────────────────────────────────────────

const TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const LOCAL_PORT = 18789;

export class TunnelManager extends EventEmitter {
  constructor() {
    super();
    this._process = null;
  }

  /**
   * 启动隧道。
   * 成功捕获 URL 后触发 'tunnel_ready' 事件，携带公网 URL 字符串。
   */
  async start() {
    let binaryPath;

    try {
      binaryPath = await ensureCloudflared();
    } catch (err) {
      this.emit('error', err);
      return;
    }

    console.log(`[TunnelManager] 正在启动隧道，映射本地端口 ${LOCAL_PORT}...`);

    const localHost = getLocalIPv4();
    const localUrl = `http://${localHost}:${LOCAL_PORT}`;
    console.log(`[TunnelManager] 隧道目标地址：${localUrl}`);

    try {
      this._process = execa(binaryPath, [
        'tunnel',
        '--url', localUrl,
        '--protocol', 'http2',
        '--no-tls-verify',
        '--no-autoupdate',
        '--loglevel', 'debug',
      ]);

      // cloudflared 将隧道 URL 和调试日志输出到 stderr
      this._process.stderr.on('data', (chunk) => {
        const line = chunk.toString();

        // 透传 cloudflared 内部日志到终端
        process.stderr.write(`[cloudflared] ${line}`);

        const match = line.match(TUNNEL_URL_REGEX);
        if (match) {
          const tunnelUrl = match[0];
          console.log(`\n[TunnelManager] ✅ 隧道已就绪：${tunnelUrl}\n`);
          this.emit('tunnel_ready', tunnelUrl);
        }
      });

      this._process.on('error', (err) => {
        console.error(`[TunnelManager] ❌ 进程错误：${err.message}`);
        this.emit('error', err);
      });

      this._process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[TunnelManager] ⚠️  cloudflared 异常退出，退出码：${code}`);
        }
      });
    } catch (err) {
      console.error(`[TunnelManager] ❌ 启动失败：${err.message}`);
      console.error(`[TunnelManager] 请确认 bin/ 目录下存在可执行的 cloudflared 文件。`);
      this.emit('error', err);
    }
  }

  /** 停止隧道进程 */
  stop() {
    if (this._process) {
      console.log('[TunnelManager] 正在停止隧道...');
      this._process.kill('SIGTERM');

      // 兜底：如果 SIGTERM 后 3 秒进程仍存活，强制 SIGKILL
      const proc = this._process;
      const killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // 进程可能已退出，忽略
        }
      }, 3000);

      proc.on('exit', () => clearTimeout(killTimer));

      this._process = null;
      console.log('[TunnelManager] 隧道已停止。');
    }
  }
}
