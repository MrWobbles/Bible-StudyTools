#!/usr/bin/env python3
"""Simple HTTP server for testing Bible Study pages locally."""

import http.server
import socketserver
import os
from pathlib import Path

PORT = 8000
DIRECTORY = str(Path(__file__).parent)

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
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        print(f"Serving from: {DIRECTORY}")
        print(f"\nOpen in browser:")
        print(f"  Display:  http://localhost:{PORT}/Class%201/index.html")
        print(f"  Teacher:  http://localhost:{PORT}/Class%201/teacher.html")
        print(f"\nPress Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
