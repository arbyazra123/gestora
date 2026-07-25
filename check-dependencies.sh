#!/bin/bash
# Check for missing dependencies in built game files

echo "🔍 Checking for external dependencies in production builds..."
echo ""

# Build games first
echo "Building games..."
cd games/hand-sword && npm run build > /dev/null 2>&1 && cd ../..
cd games/tennis && npm run build > /dev/null 2>&1 && cd ../..
cd games/pong && npm run build > /dev/null 2>&1 && cd ../..

echo "✅ Games built"
echo ""

# Search for import statements in built files
echo "📊 External dependencies found:"
echo ""

find games/*/dist -name "*.js" -exec grep -h "from[[:space:]]*['\"]" {} \; | \
  grep -o "from[[:space:]]*['\"][^'\"]*['\"]" | \
  sed "s/from[[:space:]]*['\"]//g" | \
  sed "s/['\"]//g" | \
  grep -v "^\." | \
  grep -v "^/" | \
  sort -u

echo ""
echo "💡 Make sure all of these are in the import map in host/index.html"
