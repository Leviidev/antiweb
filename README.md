# AntiWeb 🌊

<div align="center">

**The Production-Quality Web Interface & Vibe Coding Studio for Antigravity CLI**

[![npm version](https://img.shields.io/npm/v/@leviidev/antiweb?color=2dd4bf&label=npm&style=flat-square)](https://www.npmjs.com/package/@leviidev/antiweb)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-blue?style=flat-square)](https://antiweb.lol)
[![License: MIT](https://img.shields.io/badge/License-MIT-fab283.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Vibe Coding](https://img.shields.io/badge/Vibe%20Coding-100%25-8b5cf6?style=flat-square)](https://antiweb.lol)
[![Linux Desktop](https://img.shields.io/badge/Linux%20Desktop-Supported-22c55e?style=flat-square)](#native-linux-desktop-app)

[🌐 Official Website (antiweb.lol)](https://antiweb.lol) • [📦 npm Registry](https://www.npmjs.com/package/@leviidev/antiweb) • [📐 Architecture](ARCHITECTURE.md)

</div>

---

## ⚡ Quickstart (One Command)

Jump into any project directory or git repository on your machine and launch AntiWeb Studio instantly:

```bash
npx @leviidev/antiweb
```

*This spins up a high-performance Fastify gateway on port `3000` and automatically connects your default browser (works seamlessly across Linux, macOS, and Windows).*

---

## 💡 What is AntiWeb? (The Vibe Coding Philosophy)

The term **vibe coding** describes a shift in how software is built: instead of getting bogged down writing manual syntax line-by-line, you focus entirely on **product vision, architecture, and aesthetics (the "vibes")**, while an autonomous AI agent writes, executes, and debugs the underlying code.

If tools like Cursor and Windsurf brought AI autocomplete to traditional editors, **AntiWeb brings full agentic vibe coding into an autonomous, desktop-grade browser studio.**

### Why Developers Love AntiWeb:
- 🌊 **High-Level Intent Over Boilerplate:** Give Antigravity CLI high-level goals. Watch it autonomously inspect your codebase, write code, spawn subagents, and build full features.
- 👁️ **Visual & Interactive Verification:** Vibe coding relies heavily on fast feedback loops. AntiWeb gives you a split-screen workspace tailored for visual verification and steering.
- 🛋️ **Zero-Friction Flow (Even from the Couch):** Run `npx @leviidev/antiweb` on your main Linux workstation and vibe code from your iPad or laptop across your home WiFi network.

---

## ✨ Key Features

### 🖥️ Dual-Mode PTY Architecture
Unlike standard chat wrappers that trap your command execution, AntiWeb uses `node-pty` to give you a real, unrestricted shell directly inside your project workspace (**Bash/Zsh** on Linux & macOS, **PowerShell/CMD** on Windows). 
- **`[ >_ Terminal ]`**: Run git commands, execute tests (`npm run test`), and start dev servers.
- **`[ ✨ AGY CLI ]`**: Toggle instantly into the underlying Antigravity CLI interactive viewport whenever you need deep agent debugging.

### 📝 Live Diff Verification & Auto-Accept
Every file modified by the AI is tracked in the **Review** tab. Inspect clean line-by-line diffs and selectively click **`[ ✓ Accept ]`** or **`[ ✕ Decline ]`** before committing your changes to git.

### 🧠 OpenCode Zen & BYOK Model Freedom
Different coding tasks require different AI reasoning capabilities. Switch effortlessly between:
- **DeepSeek V4 Flash** & **DeepSeek V4 Flash Free**
- **Claude 3.5 Sonnet** & **Claude 3 Opus**
- **Gemini 2.5 Pro** & **Gemini 2.0 Flash**
- **Local Ollama Models** (Llama 3.2, DeepSeek R1)

### 🔒 LAN Gateway & HTTP Basic Auth
Secure your studio when exposing it across your local network or VPN:
```bash
ANTIWEB_HTTP_PASSWORD="supersecretpassword" antiweb -p 5000
```
*AntiWeb automatically enforces native browser basic authentication across all incoming network requests.*

---

## 📦 Installation & CLI Guide

### Global Installation (Recommended)
Install globally with npm so the `antiweb` command is always available in your terminal path:

```bash
npm install -g @leviidev/antiweb
```

### Command Line Options

| Flag | Option | Description |
| :--- | :--- | :--- |
| *(no flags)* | `antiweb` | Start servers in interactive mode and display access URLs |
| `-p` | `--port <port>` | Specify custom public gateway port (default: `3000`) |
| `-d` | `--daemon` | Start servers detached in background daemon mode |
| `-s` | `--status` | Check running status and ports of AntiWeb Studio |
| `-k` | `--stop` | Stop running background daemon / server processes |
| | `--install-desktop`| Install Linux application launcher and menu shortcut |
| | `--uninstall-desktop`| Remove Linux desktop application shortcut |

---

## 🐧 Native Linux Desktop App

Want AntiWeb Studio in your application menu, dock, or desktop launcher? Run:

```bash
antiweb --install-desktop
antiweb --daemon
```

This generates a native `antiweb.desktop` application shortcut and symlinks the global binary. You can launch **AntiWeb Studio** directly from your Linux GUI menu while the daemon runs silently in the background!

---

## 🏗️ Architecture & Development

AntiWeb is built as a TypeScript monorepo designed for low-latency WebSocket streaming and high-concurrency terminal management:

```
antiweb/
├── bin/          # CLI launcher & Linux desktop integration script
├── shared/       # Shared TypeScript protocols, session types, and IPC schemas
├── server/       # Fastify backend, Node-PTY process manager, and WebSocket broker
└── client/       # Next.js 14 (App Router), Tailwind CSS, XTerm.js, and Radix UI
```

### Running Locally for Development

```bash
# Clone repository
git clone https://github.com/Leviidev/antiweb.git
cd antiweb

# Install dependencies and build shared workspace
npm install
npm run build:shared

# Start development servers (Fastify + Next.js concurrently)
npm run dev
```

For detailed system design, WebSocket protocol routing, and proxy architecture, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 📄 License

MIT © [Leviidev](https://github.com/Leviidev). Built for craftsmanship and high-performance AI coding.
