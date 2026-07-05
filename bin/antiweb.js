#!/usr/bin/env node

/**
 * AntiWeb CLI Launcher & Desktop App Manager
 * Usage: antiweb [options]
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const DATA_DIR = path.join(os.homedir(), '.gemini', 'antiweb-data');
const PID_FILE = path.join(DATA_DIR, 'antiweb.pid');
const LOG_FILE = path.join(DATA_DIR, 'antiweb.log');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function printHelp() {
  console.log(`
\x1b[36m\x1b[1mAntiWeb Studio - Antigravity CLI Web Interface\x1b[0m

\x1b[1mUSAGE:\x1b[0m
  antiweb [options]
  ANTIWEB_HTTP_PASSWORD="secret" antiweb -p 5080

\x1b[1mOPTIONS:\x1b[0m
  (no flags)            Start AntiWeb servers (if not running) and display access URLs
  -p, --port <port>     Specify public access port (default: 3000)
  -d, --daemon          Start servers detached in background daemon mode
  -s, --status          Check status of AntiWeb studio
  -k, --stop            Stop running background daemon / servers
  --install-desktop     Install Linux desktop launcher (~/.local/share/applications/antiweb.desktop)
                        and create global symlink in ~/.local/bin/antiweb
  --uninstall-desktop   Remove Linux desktop launcher and symlink
  -h, --help            Show this help message

\x1b[1mENVIRONMENT VARIABLES:\x1b[0m
  ANTIWEB_HTTP_PASSWORD   Set password for native browser HTTP Basic Auth popup alert
  ANTIWEB_HTTP_USER       Set username for Basic Auth (default: "antiweb")
`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

function printBanner(publicPort) {
  const interfaces = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }

  const httpUser = process.env.ANTIWEB_HTTP_USER || process.env.ANTIWEB_USER || 'antiweb';
  const httpPass = process.env.ANTIWEB_HTTP_PASSWORD || process.env.ANTIWEB_PASSWORD || process.env.PASSWORD;

  console.log(`\n\x1b[36m\x1b[1m============================================================\x1b[0m`);
  console.log(`        🚀 \x1b[1m\x1b[32mANTIWEB STUDIO IS LIVE AND READY!\x1b[0m`);
  console.log(`\x1b[36m\x1b[1m============================================================\x1b[0m\n`);
  console.log(`  Access AntiWeb in your web browser at:\n`);
  console.log(`    👉 \x1b[1mLocalhost:\x1b[0m   \x1b[36m\x1b[4mhttp://localhost:${publicPort}\x1b[0m`);
  console.log(`    👉 \x1b[1mLocal IP:\x1b[0m    \x1b[36m\x1b[4mhttp://127.0.0.1:${publicPort}\x1b[0m`);
  
  if (lanIps.length > 0) {
    for (const ip of lanIps) {
      console.log(`    👉 \x1b[1mNetwork IP:\x1b[0m  \x1b[33m\x1b[4mhttp://${ip}:${publicPort}\x1b[0m  \x1b[90m(for remote/LAN access)\x1b[0m`);
    }
  } else {
    console.log(`    👉 \x1b[1mNetwork IP:\x1b[0m  \x1b[90m(No LAN interfaces found)\x1b[0m`);
  }

  console.log();
  if (httpPass) {
    console.log(`  \x1b[32m🔒 HTTP Basic Auth Enabled (Browser Popup Alert):\x1b[0m`);
    console.log(`     👤 Username: \x1b[1m${httpUser}\x1b[0m`);
    console.log(`     🔑 Password: \x1b[1m(configured via environment)\x1b[0m`);
  } else {
    console.log(`  \x1b[90m🔓 HTTP Basic Auth: Disabled (using standard form login)\x1b[0m`);
  }
  console.log(`\x1b[36m\x1b[1m============================================================\x1b[0m\n`);
}

function openApp(url) {
  const hasGui = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!hasGui) {
    console.log(`ℹ️ No GUI display detected on this machine. Use the URL above in your browser!`);
    return;
  }

  const browsers = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'brave-browser'
  ];
  for (const b of browsers) {
    const res = spawnSync('which', [b], { stdio: 'ignore' });
    if (res.status === 0) {
      console.log(`🚀 Launching desktop app window via \x1b[32m${b}\x1b[0m...`);
      const child = spawn(b, [`--app=${url}`], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
  }
  console.log(`🌐 Launching default web browser via \x1b[32mxdg-open\x1b[0m...`);
  const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function status(publicPort = 3000, internalPort = 3001) {
  const publicUp = await checkPort(publicPort);
  const internalUp = await checkPort(internalPort);

  console.log(`\n\x1b[1mAntiWeb Studio Status:\x1b[0m`);
  console.log(`  Public Gateway (Port ${publicPort}):   ${publicUp ? `\x1b[32m● Running\x1b[0m` : '\x1b[31m○ Stopped\x1b[0m'}`);
  console.log(`  Internal UI App (Port ${internalPort}):  ${internalUp ? `\x1b[32m● Running\x1b[0m` : '\x1b[31m○ Stopped\x1b[0m'}`);
  
  if (fs.existsSync(PID_FILE)) {
    try {
      const pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
      console.log(`  Daemon PIDs:       Server=${pids.serverPid || 'N/A'}, Client=${pids.clientPid || 'N/A'}`);
    } catch (e) {
      // ignore
    }
  }
  
  if (publicUp) {
    printBanner(publicPort);
  }
  console.log();
}

async function stop(publicPort = 3000, internalPort = 3001) {
  console.log(`🛑 Stopping AntiWeb Studio...`);
  let stopped = false;

  if (fs.existsSync(PID_FILE)) {
    try {
      const pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
      if (pids.serverPid) {
        try { process.kill(pids.serverPid, 'SIGTERM'); stopped = true; } catch (e) {}
      }
      if (pids.clientPid) {
        try { process.kill(pids.clientPid, 'SIGTERM'); stopped = true; } catch (e) {}
      }
      fs.unlinkSync(PID_FILE);
    } catch (e) {}
  }

  const publicUp = await checkPort(publicPort);
  const internalUp = await checkPort(internalPort);
  if (publicUp || internalUp) {
    try {
      spawnSync('fuser', ['-k', `${publicPort}/tcp`, `${internalPort}/tcp`], { stdio: 'ignore' });
      stopped = true;
    } catch (e) {}
  }

  if (stopped) {
    console.log(`✨ AntiWeb servers stopped cleanly.`);
  } else {
    console.log(`ℹ️ AntiWeb was not running.`);
  }
}

function installDesktop() {
  console.log(`📦 Installing AntiWeb as a Linux Desktop Application...`);

  const localBin = path.join(os.homedir(), '.local', 'bin');
  if (!fs.existsSync(localBin)) {
    fs.mkdirSync(localBin, { recursive: true });
  }
  const symlinkPath = path.join(localBin, 'antiweb');
  const targetScript = path.resolve(__filename);

  try {
    if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
      fs.unlinkSync(symlinkPath);
    }
  } catch (e) {}

  try {
    fs.symlinkSync(targetScript, symlinkPath);
    fs.chmodSync(targetScript, '755');
    console.log(`  ✔ Created command symlink: \x1b[36m${symlinkPath}\x1b[0m -> \x1b[33m${targetScript}\x1b[0m`);
  } catch (err) {
    console.error(`  ❌ Failed to create symlink in ${localBin}:`, err.message);
  }

  const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
  if (!fs.existsSync(appsDir)) {
    fs.mkdirSync(appsDir, { recursive: true });
  }
  const desktopFile = path.join(appsDir, 'antiweb.desktop');
  const iconPath = path.join(CLIENT_DIR, 'public', 'logo.svg');

  const desktopContent = `[Desktop Entry]
Name=AntiWeb Studio
Comment=Production-quality web interface for Antigravity CLI
Exec=${symlinkPath} --daemon
Icon=${iconPath}
Terminal=false
Type=Application
Categories=Development;IDE;Utility;
StartupNotify=true
`;

  try {
    fs.writeFileSync(desktopFile, desktopContent, 'utf-8');
    fs.chmodSync(desktopFile, '755');
    console.log(`  ✔ Created desktop shortcut: \x1b[36m${desktopFile}\x1b[0m`);
  } catch (err) {
    console.error(`  ❌ Failed to create desktop file:`, err.message);
  }

  console.log(`\n🎉 \x1b[1mAntiWeb is now installed as an app!\x1b[0m`);
  console.log(`You can now type \x1b[32mantiweb\x1b[0m in any terminal or launch \x1b[32mAntiWeb Studio\x1b[0m directly from your Linux application menu / dock!\n`);
}

function uninstallDesktop() {
  console.log(`🗑️ Uninstalling AntiWeb desktop integration...`);
  const symlinkPath = path.join(os.homedir(), '.local', 'bin', 'antiweb');
  const desktopFile = path.join(os.homedir(), '.local', 'share', 'applications', 'antiweb.desktop');

  try { if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) fs.unlinkSync(symlinkPath); } catch (e) {}
  try { if (fs.existsSync(desktopFile)) fs.unlinkSync(desktopFile); } catch (e) {}

  console.log(`✨ Desktop shortcut and symlinks removed.`);
}

async function start(publicPort, internalPort, isDaemon = false) {
  const appUrl = `http://localhost:${publicPort}`;
  const publicUp = await checkPort(publicPort);
  const internalUp = await checkPort(internalPort);

  if (publicUp && internalUp) {
    console.log(`⚡ AntiWeb Studio is already running!`);
    printBanner(publicPort);
    openApp(appUrl);
    return;
  }

  const serverDist = path.join(SERVER_DIR, 'dist', 'index.js');
  const clientBuild = path.join(CLIENT_DIR, '.next');
  if (!fs.existsSync(serverDist) || !fs.existsSync(clientBuild)) {
    console.log(`📦 Project not built yet. Running production build...`);
    const buildRes = spawnSync('npm', ['run', 'build'], { cwd: ROOT_DIR, stdio: 'inherit' });
    if (buildRes.status !== 0) {
      console.error(`❌ Build failed! Cannot start AntiWeb.`);
      process.exit(1);
    }
  }

  console.log(`🚀 Starting AntiWeb Studio ${isDaemon ? '(Daemon Mode)' : '(Interactive Mode)'}...`);
  const logStream = fs.openSync(LOG_FILE, 'a');

  // 1. Start Fastify Server on the Public Gateway Port (acts as frontdoor + API + WS)
  const serverChild = spawn('node', ['dist/index.js'], {
    cwd: SERVER_DIR,
    detached: isDaemon,
    stdio: isDaemon ? ['ignore', logStream, logStream] : 'inherit',
    env: {
      ...process.env,
      PORT: String(publicPort),
      PORT_CLIENT: String(internalPort),
      HOST: process.env.HOST || '127.0.0.1'
    }
  });

  // 2. Start Next.js Client on Internal Loopback Port (proxied by Fastify)
  const nextBin = path.join(ROOT_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
  const clientChild = spawn('node', [nextBin, 'start', '-p', String(internalPort), '-H', '127.0.0.1'], {
    cwd: CLIENT_DIR,
    detached: isDaemon,
    stdio: isDaemon ? ['ignore', logStream, logStream] : 'inherit',
    env: { ...process.env, PORT: String(internalPort) }
  });

  if (isDaemon) {
    fs.writeFileSync(PID_FILE, JSON.stringify({ serverPid: serverChild.pid, clientPid: clientChild.pid }, null, 2));
    serverChild.unref();
    clientChild.unref();
  } else {
    process.on('SIGINT', () => {
      console.log(`\n🛑 Shutting down AntiWeb Studio...`);
      try { serverChild.kill('SIGTERM'); } catch (e) {}
      try { clientChild.kill('SIGTERM'); } catch (e) {}
      process.exit(0);
    });
  }

  // Wait for public port to be ready
  process.stdout.write(`⏳ Waiting for servers to initialize... `);
  let attempts = 0;
  while (attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    const up = await checkPort(publicPort);
    if (up) {
      console.log(`\x1b[32mReady!\x1b[0m`);
      break;
    }
    attempts++;
    process.stdout.write('.');
  }

  printBanner(publicPort);
  openApp(appUrl);

  if (isDaemon) {
    console.log(`ℹ️ Servers running in background. Type \x1b[33mantiweb --stop\x1b[0m to stop.\n`);
    process.exit(0);
  } else {
    console.log(`ℹ️ Press \x1b[33mCtrl+C\x1b[0m to shut down servers.\n`);
  }
}

// Main CLI Router
const args = process.argv.slice(2);
let publicPort = 3000;

// Parse custom port flag
const portIdx = args.findIndex(a => a === '-p' || a === '--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  const parsed = parseInt(args[portIdx + 1], 10);
  if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
    publicPort = parsed;
  }
}
const internalPort = publicPort + 1;

if (args.includes('-h') || args.includes('--help')) {
  printHelp();
} else if (args.includes('-s') || args.includes('--status')) {
  status(publicPort, internalPort);
} else if (args.includes('-k') || args.includes('--stop')) {
  stop(publicPort, internalPort);
} else if (args.includes('--install-desktop')) {
  installDesktop();
} else if (args.includes('--uninstall-desktop')) {
  uninstallDesktop();
} else {
  const isDaemon = args.includes('-d') || args.includes('--daemon');
  start(publicPort, internalPort, isDaemon);
}
