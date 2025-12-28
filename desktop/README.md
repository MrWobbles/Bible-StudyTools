# Bible Study Tools — Desktop

This packages your existing HTML/JS/CSS as a native desktop app using Electron, with installers for macOS and Windows.

## Prerequisites
- Node.js 18+
- macOS: Xcode Command Line Tools (for code signing optional)
- Windows: Visual Studio C++ Build Tools (electron-builder installs NSIS automatically)

## Quick Start

```bash
cd desktop
npm install
npm run dev
```

This launches the desktop app. It serves the site from the packaged `resources/site` (in production) or the project root (in dev).

## Build Installers

```bash
cd desktop
npm run dist
```

Outputs:
- macOS: `.dmg` in `desktop/dist`
- Windows: `.exe` (NSIS installer) in `desktop/dist`

## Icons
Provide high-res icons so the installers show your branding:
- macOS: `desktop/build/icon.icns`
- Windows: `desktop/build/icon.ico`
- Optional in-app PNG: `assets/images/icon.png` (used for window icon)

You can generate ICNS/ICO from a 1024x1024 PNG using tools like ImageMagick or Icon Slate.

## Packaging Files
The builder copies these into `resources/site`:
- `admin.html`, `student.html`, `teacher.html`, `index.html`
- `assets/**` (including `assets/data` JSON)

The app runs an embedded local server and opens `http://localhost:<port>/`, leveraging your current relative fetch paths.

## Auto-Update (Optional)
If you want auto-updates like Spotify, set up a release server and add electron-updater. We can wire this up later.

## Code Signing (Optional)
- macOS: Apple Developer ID certificate
- Windows: Code-signing certificate

Not required for local installs, but recommended for distribution.
