**English** | [中文](./README_zh.md)

# PinWall

> A transparent sticky-note wall that pins your notes right onto the desktop.

PinWall is a sticky-note app that lives directly on your macOS desktop. Transparent windows, free dragging, smart reminders — make every note feel present.

## Desktop App (Core Product)

A native macOS desktop app built with [Tauri v2](https://tauri.app/).

### Core Features

- **Transparent Desktop Window** — Fully transparent window; notes float directly on your wallpaper
- **Click-Through** — Clicking blank areas drops the window to the bottom layer, no desktop interference
- **Free Drag & Position** — Drag any note anywhere on screen; click to bring it to front
- **Smart Reminder Notifications** — Set reminder times; a standalone notification window pops up with a sound alert
- **Card Stack & Stash** — Stash unused notes into the stack area; expand and pin back with one click
- **8 Gradient Color Themes** — Choose or randomly assign gradient colors when creating notes
- **macOS Window Controls** — Traffic-light buttons for close / minimize / fullscreen
- **Custom Backgrounds** — Upload background images with auto-rotation support
- **Opacity Control** — Slider to adjust window transparency
- **Keyboard Shortcuts** — `⌘⇧N` to quick-create, `Esc` to close
- **Local Persistence** — All data saved to local disk, privacy-first
- **Tray Icon** — Always accessible from the system tray

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite |
| State Management | Zustand + [tauri-store](https://github.com/you-want/tauri-store) |
| Desktop Framework | Tauri v2 (Rust) |
| Cross-Window Sync | Zustand shared stores |
| Local Storage | tauri-plugin-fs (disk JSON) |

### Getting Started

**Prerequisites**

- macOS 13+
- Node.js 18+
- pnpm
- Rust (install via [rustup](https://rustup.rs/))

**Install & Run**

```bash
# 1. Enter the desktop directory
cd desktop

# 2. Install dependencies
pnpm install

# 3. Start dev mode (frontend + Rust window)
pnpm tauri dev
```

Dev mode opens a transparent window covering the desktop with hot-reload support.

**Build for Release**

```bash
cd desktop
pnpm tauri build
```

Build artifacts (`.dmg` / `.app`) are output to `desktop/src-tauri/target/release/bundle/`.

## Other Modules

### Web App (`/frontend`)

Live: https://pinwall.raingpt.top

The web version of PinWall, offering online sticky-note functionality.

- React 18 + Vite + TailwindCSS + Zustand
- Masonry layout, drag-and-drop sorting, keyboard search (`⌘K`)
- Note sharing via links, Markdown / JSON export

```bash
cd frontend
pnpm install
pnpm dev          # http://localhost:5173
```

### Backend (`/backend`)

Provides API services for the Web App.

- Flask + SQLAlchemy + JWT
- SQLite (dev) / PostgreSQL (production)

```bash
cd backend
pip install -r requirements.txt
python3 main.py   # http://localhost:8000
```

### Website (`/website`)

Product landing page with i18n support (Chinese & English).

- React 19 + Vite + TypeScript
- Deployed on Vercel

```bash
cd website
pnpm install
pnpm dev          # http://localhost:9123
```

## Project Structure

```
PinWall/
├── desktop/          # 🖥️ Desktop App (Tauri v2, core product)
│   ├── src/          #   React frontend
│   ├── src-tauri/    #   Rust native layer
│   └── package.json
├── frontend/         # 🌐 Web App
│   ├── src/
│   └── package.json
├── backend/          # ⚙️ Backend API (Flask)
│   ├── app/
│   └── main.py
├── website/          # 📄 Product Website
│   ├── src/
│   └── package.json
└── flutter-template/ # 📱 Flutter Template (experimental)
```

## Download

- **macOS**: [GitHub Releases](https://github.com/you-want/PinWall/releases)
- **Web App**: Visit the live site (see deployment config)

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the full deployment workflow.

- **Desktop App**: GitHub Actions auto-build → Releases
- **Web App**: Auto-deployed on Vercel
- **Backend**: Render / self-hosted + Gunicorn
- **Website**: Vercel

## License

MIT License — see [LICENSE](./LICENSE).
