# 🐾 OpenClawAnywhere

<p align="center">
  <img src="docs/images/logo.png" alt="OpenClawAnywhere Logo" width="200" />
</p>

<p align="center">
  <strong>Your Mac/PC, Your Pocket AI Agent.</strong>
</p>

<p align="center">
  Turn any local machine running OpenClaw into a remotely accessible AI server — just scan a QR code.
</p>

<p align="center">
  <a href="README.md">中文</a> | English
</p>

---

## ✨ Features

- 🔗 **One-click tunneling** — Auto-downloads Cloudflare Tunnel, gets a public HTTPS URL in seconds
- 📱 **Scan to connect** — QR code printed in terminal, scan with your phone to open the web console
- 🔒 **Token auth** — Unique session token generated on every launch
- 💬 **Streaming chat** — `<think>` tag separation + real-time Markdown rendering
- 🖥️ **Cross-platform** — Windows / macOS / Linux
- 🏠 **Privacy first** — All data stays on your machine, zero cloud relay

---

## 🚀 Getting Started

Two ways to use it:

| | Desktop App | CLI |
|---|---|---|
| Requires Node.js | ❌ No | ✅ v18+ |
| cloudflared | Built-in | Auto-downloaded on first run |
| Auto-start on boot | Toggle in settings | Manual setup |
| Best for | Everyone | Developers |

---

## 🖥️ Desktop App (Recommended)

Download the installer for your platform from [GitHub Releases](https://github.com/cy0007/openclawanywhere/releases/latest):

<p align="center">
  <img src="docs/images/download.png" alt="Download page" width="600" />
</p>

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `OpenClawAnywhere_x.x.x_aarch64.dmg` | M1/M2/M3/M4 |
| macOS (Intel) | `OpenClawAnywhere_x.x.x_x64.dmg` | Pre-2020 Macs |
| Windows | `OpenClawAnywhere_x.x.x_x64-setup.exe` | 64-bit Windows 10+ |
| Linux | `OpenClawAnywhere_x.x.x_amd64.deb` / `.AppImage` | Ubuntu / Generic |

Launch the app → tray icon appears → QR code pops up → scan with your phone.

### Build from source

```bash
# Prerequisite: install Rust (https://rustup.rs)
npm install
npm run release
```

---

## 🚀 CLI Mode (Developers)

Prerequisite: [Node.js](https://nodejs.org/) v18+

```bash
git clone https://github.com/cy0007/openclawanywhere.git
cd openclawanywhere
npm install
```

```bash
# Default (python main.py)
npm start

# Custom agent command
# Windows:
set AGENT_CMD=python
set AGENT_ARGS=main.py
set AGENT_CWD=C:\path\to\openclaw
npm start

# macOS / Linux:
AGENT_CMD=python AGENT_ARGS=main.py AGENT_CWD=/path/to/openclaw npm start
```

After launch:

```
[Gateway] Listening on 0.0.0.0:18789
[TunnelManager] ✅ Tunnel ready: https://xxx-yyy.trycloudflare.com

  Scan the QR code below to connect:

  ▄▄▄▄▄▄▄
  █ QR  █
  ▀▀▀▀▀▀▀
```

---

## 📁 Project Structure

```
openclawanywhere/
├── src/
│   ├── tunnelManager.js   # Cloudflare Tunnel download & management
│   ├── gateway.js         # Express + Socket.io gateway & token auth
│   └── agentRunner.js     # OpenClaw agent subprocess management
├── public/
│   ├── index.html         # Mobile web console
│   └── desktop.html       # Desktop status panel
├── src-tauri/             # Tauri desktop shell (Rust)
├── scripts/               # Build scripts
├── run.js                 # Entry point
└── docs/                  # Documentation
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_CMD` | Agent launch command | `python` |
| `AGENT_ARGS` | Agent command arguments | `main.py` |
| `AGENT_CWD` | Agent working directory | Project root |

---

## 🔧 How It Works

```
Phone ──HTTPS/WSS──▶ Cloudflare Tunnel ──local──▶ Node.js Gateway (18789)
                                                        │
                                                   Socket.io Auth
                                                   Token Verify
                                                        │
                                                  OpenClaw Agent (stdin/stdout)
```

1. Auto-downloads platform-specific `cloudflared` binary
2. Starts Quick Tunnel, obtains temporary public HTTPS URL
3. Generates one-time token, encodes auth URL as QR code
4. Phone scans → loads web console → WebSocket handshake with token
5. User input → stdin to agent → stdout streaming → WebSocket push to phone

---

## 🛡️ Security

- Fresh `nanoid` token generated on every launch
- WebSocket handshake enforces token verification
- All public traffic encrypted via Cloudflare HTTPS
- Zero data upload — chat history and configs stay local

---

## 📄 License

MIT

---

> *Built with ❤️ for AI enthusiasts who want their local AI, anywhere.*