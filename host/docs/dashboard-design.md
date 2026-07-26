# Dashboard UI — design spec

Source: a lo-fi wireframe provided by the user (2026-07-26), describing a
revamp of the host's game hub from a card grid into a two-tab dashboard.
Implemented the same day in `host/src/ui/GameHub.js` — see that file's
`renderGamesTab()`/`renderRoomsTab()` for the actual markup.

## Layout shared by both tabs

A single bordered panel containing:

- **Top bar**: a search input (placeholder "Search games / room") on the
  left; a two-item tab switcher — **Games** / **Rooms** — centered; a brand
  wordmark ("Gestora") on the right.
- **Body**: swaps entirely based on the active tab (see below). The search
  input filters whichever tab is currently showing.

## Games tab — master/detail library browser

Replaces the old grid-of-cards. Two columns:

- **Left column** (narrower): a vertical, scrollable list of games. Each row
  shows the game's name (bold) and description (muted, smaller). The
  currently-selected game's row is visually filled/highlighted. Clicking a
  row selects that game and updates the right column — it does **not**
  launch anything by itself.
- **Right column** (wider), stacked into two panels:
  - **Preview panel** (top): a video/thumbnail area for the selected game.
    No real trailer assets exist yet (`manifest.thumbnail` paths are
    placeholders, no files on disk) — renders a placeholder icon/label
    until real media exists; the `<img>` tag is wired so a real thumbnail
    "just works" the moment one is added, no code change needed.
  - **Detail panel** (bottom): free-text description ("how to play, genre,
    offline/online support, etc." — sourced from the registry entry) plus
    the action buttons, anchored bottom-right. The wireframe shows a single
    "Play" button; the actual implementation keeps all three existing
    launch modes for multiplayer-capable games — **▶ Play** (solo),
    **⚡ Quick Match**, **🎮 Play Online** — since collapsing those into one
    button would regress the multiplayer work from earlier the same
    session. Non-multiplayer games just show **▶ Play**.

## Rooms tab — global open-rooms table

A **platform-wide** table (every game, not filtered to one) — distinct from
the existing per-game Room List modal (`RoomListModal.js`, still used by the
Games tab's "🎮 Play Online" button for browsing/creating/joining one
specific game's rooms). Columns:

| Game | Room ID | Players | (action) |
|---|---|---|---|

- **Game** — which game the room belongs to.
- **Room ID** — the room's own Colyseus id (same "code" concept as the
  Room List modal — see [[room-list-passcode-idea]] memory).
- **Players** — `clients/maxClients`.
- **Action** — **JOIN** button if the room still has an open seat, or a
  plain **FULL** badge (not clickable) if it doesn't. Unlike the per-game
  modal (which only lists still-joinable rooms), this table deliberately
  shows full rooms too, marked FULL — it's meant as a "what's happening
  right now" overview, not just a join picker.

Clicking **JOIN** joins that room directly (prompting for a password first
if the room has one) and launches straight into that game — same
join-then-load flow the modal and Quick Match already use; the target game
adopts the already-joined room exactly the same way regardless of which of
these three paths (modal / quick match / rooms table) produced it.

## Out of scope / deliberately not built

- No real video/trailer playback — the preview panel is a placeholder until
  real per-game media exists.
- The Rooms tab doesn't replace the per-game Room List modal — creating a
  room (with a password/name) still goes through "🎮 Play Online", since
  that flow needs a specific game context the global table doesn't have.
