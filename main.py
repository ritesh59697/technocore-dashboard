#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError
import json
import os
from pathlib import Path

PORT = 8080
DIRECTORY = Path(__file__).parent / "static"
TARGET_HOST = "https://technocore.chat"

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Initialize with the correct directory path for static files
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def do_GET(self):
        # Check if the path is an API call
        if self.path.startswith("/api/"):
            self.handle_api()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.handle_api(method="POST")
        else:
            self.send_error(404, "File not found")

    def handle_api(self, method="GET"):
        # Map /api/rooms to https://technocore.chat/rooms
        # Map /api/r/lobby to https://technocore.chat/r/lobby
        # Map /api/kv/did/xxx to https://technocore.chat/kv/did/xxx
        api_path = self.path[4:]  # Remove '/api' prefix
        target_url = f"{TARGET_HOST}{api_path}"
        
        # Read request body for POST requests
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else None
        
        req = urllib.request.Request(
            target_url,
            data=post_data,
            method=method,
            headers={
                "User-Agent": "technocore-dashboard-proxy/1.0.0",
                "Accept": "application/json",
            }
        )
        
        # Copy Content-Type header if present
        if 'Content-Type' in self.headers:
            req.add_header('Content-Type', self.headers['Content-Type'])

        try:
            with urllib.request.urlopen(req, timeout=30.0) as response:
                self.send_response(response.status)
                
                # Copy response headers from origin, handling CORS
                for header, value in response.getheaders():
                    # We will override Access-Control headers to allow local development access
                    if header.lower() not in ['access-control-allow-origin', 'content-length']:
                        self.send_header(header, value)
                        
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                
                body = response.read()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                
        except HTTPError as e:
            self.send_response(e.code)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            
            try:
                error_body = e.read()
                self.send_header("Content-Length", str(len(error_body)))
                self.end_headers()
                self.wfile.write(error_body)
            except Exception:
                self.end_headers()
                
        except URLError as e:
            self.send_response(504)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            err_msg = json.dumps({"error": f"Gateway Timeout: {e.reason}"}).encode("utf-8")
            self.wfile.write(err_msg)
            
        except Exception as e:
            self.send_response(500)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            err_msg = json.dumps({"error": f"Internal Server Error: {str(e)}"}).encode("utf-8")
            self.wfile.write(err_msg)

    def do_OPTIONS(self):
        # Handle pre-flight requests for CORS
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def main():
    # Make sure static directory exists
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    
    # Simple check-in index file if not exists
    index_file = DIRECTORY / "index.html"
    if not index_file.exists():
        index_file.write_text("<h1>Technocore Dashboard</h1>", encoding="utf-8")
        
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Technocore Dashboard running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.server_close()

if __name__ == "__main__":
    main()
