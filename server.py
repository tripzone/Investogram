#!/usr/bin/env python3
"""
Simple proxy server for stock dashboard
Fetches Yahoo Finance data server-side to avoid CORS issues
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
from http import HTTPStatus

PORT = 8000

class StockProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL
        parsed_path = urllib.parse.urlparse(self.path)

        # Check if this is a proxy request for Yahoo Finance
        if parsed_path.path.startswith('/api/stock/'):
            self.handle_stock_request(parsed_path)
        else:
            # Serve static files normally
            super().do_GET()

    def handle_stock_request(self, parsed_path):
        try:
            # Extract stock symbol from path: /api/stock/AAPL
            symbol = parsed_path.path.split('/')[-1]

            # Get query parameters for range and interval
            query_params = urllib.parse.parse_qs(parsed_path.query)
            range_param = query_params.get('range', ['1mo'])[0]
            interval_param = query_params.get('interval', ['1d'])[0]

            # Fetch from Yahoo Finance
            yahoo_url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range_param}&interval={interval_param}&indicators=quote&includeTimestamps=true'

            req = urllib.request.Request(
                yahoo_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
            )

            with urllib.request.urlopen(req) as response:
                data = response.read()

            # Send response with CORS headers
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            # Send error response
            self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_data = json.dumps({'error': str(e)}).encode('utf-8')
            self.wfile.write(error_data)

    def end_headers(self):
        # Add CORS headers to all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), StockProxyHandler) as httpd:
        print(f"🚀 Stock Dashboard server running at http://localhost:{PORT}")
        print(f"📈 Dashboard: http://localhost:{PORT}")
        print(f"Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")
