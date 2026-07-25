#!/bin/bash
# Netlify build script - builds host + all games into a single dist folder

set -e

echo "🏗️  Building Motion Platform for Netlify..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build host
echo "🏠 Building host platform..."
cd host
npm install
npm run build
cd ..

# Create dist directory and copy host build
echo "📁 Setting up dist directory..."
rm -rf dist
mkdir -p dist
cp -r host/dist/* dist/

# Build and copy each game
echo "🎮 Building games..."

# Hand Sword
echo "  - Building hand-sword..."
cd games/hand-sword
npm install
npm run build
cd ../..
mkdir -p dist/games/hand-sword
cp -r games/hand-sword/dist/* dist/games/hand-sword/
cp games/hand-sword/manifest.json dist/games/hand-sword/

# Tennis
echo "  - Building tennis..."
cd games/tennis
npm install
npm run build
cd ../..
mkdir -p dist/games/tennis
cp -r games/tennis/dist/* dist/games/tennis/
cp games/tennis/manifest.json dist/games/tennis/

# Pong
echo "  - Building pong..."
cd games/pong
npm install
npm run build
cd ../..
mkdir -p dist/games/pong
cp -r games/pong/dist/* dist/games/pong/
cp games/pong/manifest.json dist/games/pong/

echo "✅ Build complete! Output in ./dist"
echo "📊 Build size:"
du -sh dist
