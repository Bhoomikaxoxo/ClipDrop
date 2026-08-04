# ClipDrop 💧

A minimalist, high-aesthetic personal web application to extract and download video content from **Instagram Reels** and **YouTube** videos. Built with React + Vite, Tailwind CSS, an interactive WebGL Ferrofluid background, Node.js + Express, and `yt-dlp`.

---

## ⚡ Key Features

- 📹 **Instagram Reels & YouTube Support**: Direct extraction with platform detection.
- 🎨 **WebGL Ferrofluid Hero**: Interactive fluid dynamics canvas background (with performance toggle for low-end mobile devices & `prefers-reduced-motion` support).
- 📊 **Dynamic Quality Selector**: Live resolution options (2160p, 1440p, 1080p, 720p, 480p, Audio Only) with approximate file size previews.
- 🚀 **Real-Time Progress**: Live extraction and download progress with Server-Sent Events (SSE).
- 🔒 **Safe & Isolated**: In-memory job lock to prevent duplicate subprocess spaws, automatic temp file cleanup, and strict URL allowlists.
- 📱 **PWA Ready**: Progressive Web App manifest & service worker enabled for installation on mobile home screens and desktop.
- 🌐 **Vercel & Railway Ready**: Architected for decoupled frontend deployment (Vercel) and binary backend hosting (Railway, Render, Fly.io, or VPS).

---

## 🛠️ System Prerequisites

ClipDrop relies on two system-level CLI binaries on the backend host:

1. **`yt-dlp`**: Extracts metadata and streams video data.
2. **`ffmpeg`**: Required to merge separate video and audio streams for high-definition YouTube videos (1080p+).

### Installing Prerequisites

####  macOS (via Homebrew)
```bash
brew install yt-dlp ffmpeg
```

#### 🐧 Linux (Ubuntu / Debian)
```bash
sudo apt update
sudo apt install -y ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### 🪟 Windows (via winget or Chocolatey)
```powershell
# Using winget
winget install yt-dlp
winget install Gyan.FFmpeg

# Or using Chocolatey
choco install yt-dlp ffmpeg
```

> 💡 **Keep `yt-dlp` Updated**: Instagram frequently updates their web endpoints. If extraction breaks, update `yt-dlp` on your server:
> ```bash
> yt-dlp -U
> ```

---

## 🚀 Quick Start (Local Development)

1. **Clone & Install Dependencies**:
   ```bash
   git clone <your-repo-url>
   cd ClipDrop
   npm run install:all
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```
   - **Frontend**: http://localhost:5173
   - **Backend API**: http://localhost:5001

---

## ⚙️ Environment Variables

### Client (`/client/.env.development` / `.env.production`)
- `VITE_API_BASE_URL`: Base URL of your Express backend (default: `http://localhost:5001` in dev).

### Server (`/server/.env`)
- `PORT`: Server port (default: `5001`).
- `ALLOWED_ORIGINS`: Comma-separated CORS allowed origins (e.g. `http://localhost:5173,https://your-app.vercel.app`).
- `YTDLP_PATH`: Optional custom path to `yt-dlp` executable.
- `FFMPEG_PATH`: Optional custom path to `ffmpeg` binary directory.

---

## 🌐 Deployment Architecture

### 1. Frontend (`/client`) -> Vercel
Deploy the `client/` directory as a static Vite application to Vercel:
- **Framework Preset**: Vite
- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variable**: `VITE_API_BASE_URL=https://your-backend.railway.app`

### 2. Backend (`/server`) -> Railway / Render / Fly.io / VPS
Vercel serverless functions cannot execute persistent subprocess binaries (`yt-dlp` / `ffmpeg`). Deploy `server/` to a standard Node runtime:
- **Build Command**: `npm install`
- **Start Command**: `node src/index.js`
- Set system packages or buildpack for `yt-dlp` and `ffmpeg`.

---

## 📁 Project Structure

```
ClipDrop/
├── package.json           # Monorepo concurrent runner
├── README.md              # Documentation & guide
├── client/                # React + Vite + Tailwind Frontend
│   ├── vercel.json        # Vercel deployment configuration
│   ├── public/            # PWA manifest & Service Worker
│   └── src/
│       ├── components/    # Ferrofluid, PreviewCard, UrlInput, ProgressBar, etc.
│       ├── App.jsx        # Main application layout
│       └── index.css      # Custom dark theme & glassmorphism
└── server/                # Express Backend
    └── src/
        ├── index.js       # Server initialization & middleware
        ├── routes/        # /api/extract, /api/download, /api/progress, /api/file
        └── utils/         # ytdlp wrapper, URL regex allowlist, temp cleanup
```
