"""
serve.py
--------
A tiny web server for running the ASL Fingerspelling Coach offline.

Usage (from this folder):
    python3 serve.py          (Mac / Linux)
    python serve.py           (Windows)
Then open http://localhost:8000 in Chrome.

Why not just "python -m http.server"? That usually works too. But on some
Windows computers, Python reads the wrong file types from the Windows
registry and serves .js files as "text/plain". Chrome then refuses to run
the app's JavaScript modules. This script forces the correct types, so the
app works the same on every laptop.

It only listens on this computer (127.0.0.1), so nobody else on the
network can open it.
"""

import http.server
import os
import sys

PORT = 8000

# The correct "content type" for each kind of file the app uses.
CONTENT_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".task": "application/octet-stream",
    ".md": "text/markdown",
}


class CoachRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Serves files from this folder with the right content types."""

    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **CONTENT_TYPES}

    def end_headers(self):
        """Tells the browser to re-check files each time, so edits show up on reload."""
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class CoachServer(http.server.ThreadingHTTPServer):
    """A server that can queue up many connections at once.

    Python's default queue holds only 5 waiting connections. Chrome loads all
    of the app's JavaScript modules at the same moment, which can overflow
    that queue and make a file fail to load ("connection reset").
    """

    request_queue_size = 64


def main():
    """Starts the server in the folder that contains this file."""
    # Serve the folder this script is in, even if it was started from elsewhere.
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server = CoachServer(("127.0.0.1", port), CoachRequestHandler)
    print(f"ASL Fingerspelling Coach is running at http://localhost:{port}")
    print("Open that address in Chrome. Press Ctrl+C here to stop the server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
