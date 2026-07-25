# ✅ Deployment Checklist

## Fixed Issues

### 1. ✅ Vite 8 Compatibility
- Fixed `manualChunks` to use function instead of object
- Fixed minifier to use `oxc` instead of `terser`/`esbuild`

### 2. ✅ Module Federation Issues
- Switched from Module Federation to library mode for production
- Module Federation only used in development
- Production builds are simple ES modules

### 3. ✅ Import Map for Dependencies
Added to `host/index.html`:
- `three` → CDN
- `tone` → CDN
- `tslib` → CDN (required by Tone.js)
- `@mediapipe/tasks-vision` → CDN

### 4. ✅ Build Configuration
- Games build as libraries with external dependencies
- All chunk files are copied to dist
- CSS files correctly named and loaded

### 5. ✅ Production URLs
- Updated `games-registry.json` to use `/games/{game}/game.js`
- Relative paths work with Netlify deployment

## Deployment Steps

### 1. Commit and Push
```bash
git add .
git commit -m "fix: complete production deployment setup with import maps"
git push origin main
```

### 2. Verify Netlify Build
- Build should complete successfully
- Check build logs for errors
- Verify all games are built and copied

### 3. Test Deployment
Visit your Netlify URL and check:
- [ ] Platform loads
- [ ] Games appear in hub
- [ ] Click "Play" on each game
- [ ] Hand tracking initializes
- [ ] Game runs without errors

## Expected File Structure

```
dist/
├── index.html (with import map)
├── assets/
│   ├── index-*.js
│   ├── core-services-*.js
│   └── ...
├── games-registry.json
└── games/
    ├── hand-sword/
    │   ├── game.js
    │   ├── game.css
    │   ├── hand-tracking-*.js
    │   ├── scene-*.js
    │   └── manifest.json
    ├── tennis/
    │   ├── game.js
    │   ├── game.css
    │   └── ...
    └── pong/
        ├── game.js
        ├── game.css
        └── ...
```

## Common Issues

### Issue: "tslib does not resolve to valid URL"
**Status**: ✅ Fixed
**Solution**: Added to import map

### Issue: "text/html is not valid JavaScript MIME"
**Status**: ✅ Fixed
**Solution**: Copy all dist files, not just specific ones

### Issue: CSS not loading
**Status**: ✅ Fixed
**Solution**: Corrected filename from `style.css` to `game.css`

### Issue: Module Federation errors
**Status**: ✅ Fixed
**Solution**: Use library mode in production

## Environment Variables

### Netlify
```
VITE_MULTIPLAYER_SERVER_URL=wss://manuver-api.orpheus.my.id
NODE_VERSION=22
```

### Railway
```
PORT=(auto-assigned)
SIMULATE_LATENCY_MS=0
```

## Performance Expectations

- **First Load**: ~500KB (host + shared libs from CDN)
- **Game Load**: ~50-200KB (game code only)
- **Shared Libraries**: Cached by browser after first load

## Monitoring

### Check these after deployment:
1. Browser console for errors
2. Network tab for 404s
3. CSS loading correctly
4. Import map resolving dependencies
5. WebSocket connection to Railway

## Rollback Plan

If deployment fails:
1. Check Netlify build logs
2. Revert last commit: `git revert HEAD`
3. Push: `git push origin main`
4. Wait for Netlify rebuild

## Success Criteria

✅ No console errors
✅ Games load and run
✅ Hand tracking works
✅ Multiplayer connects (if backend deployed)
✅ All assets load (no 404s)
✅ Performance is acceptable (< 3s initial load)
