# How to Run Locally

## Option 1: VS Code Live Server (Recommended)

1. Install the **Live Server** extension in VS Code (search "Live Server" in Extensions)
2. Right-click on `Class 1/index.html` and select "Open with Live Server"
3. This will open the display page at `http://localhost:5500/Class%201/index.html`
4. Open presenter page in another window/tab: `http://localhost:5500/Class%201/teacher.html`

## Option 2: Python 3 (if installed)

```bash
python serve.py
```

Then open:
- Display: `http://localhost:8000/Class%201/index.html`
- Teacher: `http://localhost:8000/Class%201/teacher.html`

## Option 3: npx http-server (if Node.js installed)

```bash
npx http-server
```

Then open:
- Display: `http://localhost:8080/Class%201/index.html`
- Teacher: `http://localhost:8080/Class%201/teacher.html`

---

## Why?

The YouTube API requires **HTTPS or HTTP**—it won't work with `file://` URLs due to browser security. Local HTTP server fixes this.

Once running, both pages will communicate via BroadcastChannel (or localStorage fallback).
