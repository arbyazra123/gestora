#!/bin/bash
# Test production build locally to catch missing dependencies

set -e

echo "🧪 Testing Production Build Locally..."
echo ""

# Build everything
echo "📦 Building host..."
./netlify-build.sh

echo ""
echo "✅ Build complete!"
echo ""
echo "🌐 Starting local server..."
echo ""
echo "Open http://localhost:8000 in your browser"
echo "Press Ctrl+C to stop"
echo ""

# Start a simple HTTP server in dist directory
cd dist
python3 -m http.server 8000
