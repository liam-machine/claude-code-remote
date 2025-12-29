# Claude Code Remote

A web interface for remotely operating [Claude Code CLI](https://claude.ai/code) from mobile devices.

## Features

- 📱 **Mobile-first** - Optimized for iPhone and touch devices
- 🔒 **Secure** - Tailscale network-only access (no exposed ports)
- 💻 **Multi-session** - Up to 3 concurrent Claude sessions with tabs
- ⚡ **Real-time** - WebSocket-based terminal streaming
- 🎨 **Dark theme** - GitHub-style dark terminal colors

## Architecture

- **Backend**: Node.js + Fastify + node-pty + WebSocket
- **Frontend**: Vanilla JS + xterm.js (no build step)
- **Host**: Raspberry Pi 5 on Tailscale network

## Quick Start

```bash
# On your Raspberry Pi
cd /home/liam/claude-code-remote
npm install
npm run dev

# Access from any Tailscale device
open http://<pi-tailscale-ip>:3000
```

## Requirements

- Node.js 18+
- Tailscale installed and configured
- Claude Code CLI installed (`claude` command available)

## License

MIT
