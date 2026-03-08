# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser — no build step, no server, no dependencies.

```bash
open index.html
```

## Architecture

Two files, everything is self-contained:

- **`index.html`** — Canvas element + minimal CSS shell. Loads `game.js` via `<script src="game.js">`.
- **`game.js`** — Entire game: state machine, entities, rendering, input, audio, level configs. Wrapped in an IIFE.

### State Machine

`gameState` is one of: `MENU | PLAYING | WAVE_CLEAR | LEVEL_COMPLETE | GAME_OVER | PAUSED`

The main loop (`requestAnimationFrame`) runs `updateGame(dt)` only in `PLAYING` state. State transitions:
- MENU → PLAYING: click PLAY
- PLAYING → WAVE_CLEAR: all enemies dead, more waves remain
- WAVE_CLEAR → PLAYING: timer expires, next wave spawns
- PLAYING → LEVEL_COMPLETE: all waves in a level cleared
- LEVEL_COMPLETE → PLAYING: click NEXT LEVEL (`initGame(levelIdx + 1)`)
- PLAYING → GAME_OVER: player HP ≤ 0
- GAME_OVER → PLAYING: click PLAY AGAIN (`initGame()`)

### Entity Model

All entities (player, enemies, bullets) are plain objects. No classes.

- **Player**: single object with `{x, y, r, angle, hp, fireCooldown, bobPhase, hitTimer, muzzleTimer, dead}`
- **Enemies**: array of objects with `{type, x, y, r, color, speed, hp, shape, hitTimer, wiggle, shootTimer, zigzagAngle, stopRange}`
- **Bullets**: array of `{x, y, vx, vy, r, damage, fromPlayer, color}`
- **Particles**: array of `{x, y, vx, vy, r, color, life, maxLife}`
- **FloatingTexts**: array of `{x, y, text, life, maxLife, color}` (score popups)

### Level / Wave System

`LEVEL_CONFIGS` is a nested array: `levels → waves → [{type, count}]`. `getLevelConfig(idx)` handles looping beyond level 5 by scaling enemy counts. `diffMult` (starts at 1, increases per level) scales enemy speed and shooter fire rate.

Wave flow: `spawnWave()` reads `LEVEL_CONFIGS[levelIdx][waveIdx]`, creates enemies off-screen edges. When `enemies.length === 0`, `checkWaveProgress()` advances `waveIdx` or triggers level complete.

### Rendering Pipeline

Each frame in `draw(t)`: background → grid → bullets → enemies → player → particles → HUD → floating texts → state overlays.

Enemy shapes are drawn with canvas path primitives based on `e.shape`: `'square' | 'triangle' | 'circle' | 'diamond'`.

### Audio

Web Audio API, created lazily on first user interaction (`ensureAudio()`). All sounds are synthesized via `playBeep(freq, dur, type, vol)` — no audio files.

## Git Workflow

Commit and push every meaningful change. The remote is `https://github.com/EmenemsSnk/SampleClaudeCodeApp.git` on branch `main`.

```bash
git add <files>
git commit -m "descriptive message"
git push
```
