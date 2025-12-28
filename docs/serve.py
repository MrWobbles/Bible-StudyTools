#!/usr/bin/env python3
"""Simple HTTP server for testing Bible Study pages locally."""

import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

PORT = 8000
# Serve from project root (parent of the docs folder)
DIRECTORY = str(Path(__file__).resolve().parent.parent)

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Disable caching for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    handler = MyHTTPRequestHandler
    root = Path(DIRECTORY)

    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        print(f"Serving from: {DIRECTORY}")

        print("\nOpen in browser:")
        # Admin/Start pages
        if (root / 'admin.html').exists():
            print(f"  Admin:    http://localhost:{PORT}/admin.html")
        if (root / 'start.html').exists():
            print(f"  Start:    http://localhost:{PORT}/start.html")

        # Student/Teacher views
        if (root / 'student.html').exists():
            print(f"  Student:  http://localhost:{PORT}/student.html")
        if (root / 'teacher.html').exists():
            print(f"  Teacher:  http://localhost:{PORT}/teacher.html")

        # Config JSON
        data_dir = root / 'assets' / 'data'
        if data_dir.exists():
            classes_json = data_dir / 'classes.json'
            lessonplans_json = data_dir / 'lessonPlans.json'
            if classes_json.exists():
                print(f"  Data:     http://localhost:{PORT}/assets/data/classes.json")
            if lessonplans_json.exists():
                print(f"            http://localhost:{PORT}/assets/data/lessonPlans.json")

        # Auto-open Admin in browser if present
        admin_path = root / 'admin.html'
        if admin_path.exists():
            try:
                webbrowser.open(f"http://localhost:{PORT}/admin.html")
            except Exception:
                pass

        print("\nPress Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
