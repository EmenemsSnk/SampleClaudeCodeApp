// GUNNER — Top-Down Shooter
// Self-contained, no external dependencies

(function () {
  'use strict';

  // ─── Canvas Setup ──────────────────────────────────────────────────────────
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const W = 900;
  const H = 650;
  canvas.width = W;
  canvas.height = H;

  // ─── Game States ───────────────────────────────────────────────────────────
  const STATE = { MENU: 0, PLAYING: 1, WAVE_CLEAR: 2, LEVEL_COMPLETE: 3, GAME_OVER: 4, PAUSED: 5 };
  let gameState = STATE.MENU;

  // ─── Input ─────────────────────────────────────────────────────────────────
  const keys = {};
  const mouse = { x: W / 2, y: H / 2, down: false };

  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === 'Escape') togglePause();
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) mouse.down = true;
  });
  canvas.addEventListener('mouseup', e => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('click', e => {
    handleClick(e.clientX - canvas.getBoundingClientRect().left,
                e.clientY - canvas.getBoundingClientRect().top);
  });

  // ─── Audio (Web Audio API — retro beeps) ───────────────────────────────────
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function playBeep(freq, dur, type = 'square', vol = 0.15) {
    try {
      ensureAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  // ─── Level Configs ─────────────────────────────────────────────────────────
  // Each level = array of waves; each wave = array of { type, count }
  const LEVEL_CONFIGS = [
    // Level 1
    [
      [{ type: 'grunt', count: 4 }],
      [{ type: 'grunt', count: 6 }],
      [{ type: 'grunt', count: 8 }],
    ],
    // Level 2
    [
      [{ type: 'grunt', count: 4 }, { type: 'runner', count: 2 }],
      [{ type: 'grunt', count: 5 }, { type: 'runner', count: 3 }],
      [{ type: 'grunt', count: 6 }, { type: 'runner', count: 4 }],
    ],
    // Level 3
    [
      [{ type: 'grunt', count: 4 }, { type: 'runner', count: 2 }, { type: 'tank', count: 1 }, { type: 'shooter', count: 1 }],
      [{ type: 'grunt', count: 4 }, { type: 'runner', count: 3 }, { type: 'tank', count: 1 }, { type: 'shooter', count: 2 }],
      [{ type: 'grunt', count: 5 }, { type: 'runner', count: 3 }, { type: 'tank', count: 2 }, { type: 'shooter', count: 2 }],
      [{ type: 'grunt', count: 5 }, { type: 'runner', count: 4 }, { type: 'tank', count: 2 }, { type: 'shooter', count: 3 }],
    ],
    // Level 4
    [
      [{ type: 'grunt', count: 5 }, { type: 'runner', count: 3 }, { type: 'tank', count: 2 }, { type: 'shooter', count: 2 }],
      [{ type: 'grunt', count: 5 }, { type: 'runner', count: 4 }, { type: 'tank', count: 2 }, { type: 'shooter', count: 3 }],
      [{ type: 'grunt', count: 6 }, { type: 'runner', count: 4 }, { type: 'tank', count: 2 }, { type: 'shooter', count: 4 }],
      [{ type: 'grunt', count: 6 }, { type: 'runner', count: 5 }, { type: 'tank', count: 3 }, { type: 'shooter', count: 4 }],
    ],
    // Level 5 — Boss wave mix
    [
      [{ type: 'grunt', count: 6 }, { type: 'runner', count: 5 }, { type: 'tank', count: 3 }, { type: 'shooter', count: 4 }],
      [{ type: 'grunt', count: 7 }, { type: 'runner', count: 5 }, { type: 'tank', count: 3 }, { type: 'shooter', count: 5 }],
      [{ type: 'grunt', count: 8 }, { type: 'runner', count: 6 }, { type: 'tank', count: 4 }, { type: 'shooter', count: 5 }],
      [{ type: 'grunt', count: 8 }, { type: 'runner', count: 6 }, { type: 'tank', count: 4 }, { type: 'shooter', count: 6 }],
      [{ type: 'grunt', count: 8 }, { type: 'runner', count: 7 }, { type: 'tank', count: 5 }, { type: 'shooter', count: 7 }],
    ],
  ];

  // ─── Enemy Definitions ─────────────────────────────────────────────────────
  const ENEMY_DEFS = {
    grunt:   { color: '#ff3333', size: 16, speed: 1.2, hp: 30,  score: 10,  shape: 'square'   },
    runner:  { color: '#ff8800', size: 12, speed: 2.5, hp: 15,  score: 15,  shape: 'triangle' },
    tank:    { color: '#aa44ff', size: 24, speed: 0.6, hp: 100, score: 50,  shape: 'circle'   },
    shooter: { color: '#ffee00', size: 14, speed: 0.8, hp: 25,  score: 25,  shape: 'diamond'  },
  };

  // ─── Game State Variables ──────────────────────────────────────────────────
  let player, bullets, enemies, particles, floatingTexts;
  let score, levelIdx, waveIdx, diffMult;
  let waveClearTimer, levelCompleteTimer;
  let stateTimer;

  // ─── Starfield (Menu) ──────────────────────────────────────────────────────
  const stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.5 + 0.3,
    speed: Math.random() * 0.3 + 0.05,
    alpha: Math.random() * 0.6 + 0.3,
  }));

  // Menu state
  let showHowTo = false;
  let menuLogoFlicker = 0;
  let menuSpinAngle = 0;

  // Menu buttons (computed each draw)
  const menuButtons = [
    { id: 'play', label: 'PLAY' },
    { id: 'howto', label: 'HOW TO PLAY' },
  ];
  let menuButtonRects = [];

  // ─── Init / Reset ──────────────────────────────────────────────────────────
  function initGame(fromLevel) {
    if (fromLevel !== undefined) {
      levelIdx = fromLevel;
      diffMult = 1 + levelIdx * 0.15;
    } else {
      levelIdx = 0;
      diffMult = 1;
      score = 0;
    }
    waveIdx = 0;

    player = {
      x: W / 2, y: H / 2,
      r: 18,
      angle: 0,
      hp: 100, maxHp: 100,
      speed: 3,
      fireCooldown: 0,
      fireRate: 200,
      bobPhase: 0,
      hitTimer: 0,
      muzzleTimer: 0,
      dead: false,
    };

    bullets = [];
    enemies = [];
    particles = [];
    floatingTexts = [];

    spawnWave();
    gameState = STATE.PLAYING;
  }

  function spawnWave() {
    const levelConfig = getLevelConfig(levelIdx);
    const waveDef = levelConfig[waveIdx];
    waveDef.forEach(group => {
      for (let i = 0; i < group.count; i++) {
        spawnEnemy(group.type);
      }
    });
  }

  function getLevelConfig(idx) {
    if (idx < LEVEL_CONFIGS.length) return LEVEL_CONFIGS[idx];
    // Loop: scale beyond level 5
    const base = LEVEL_CONFIGS[LEVEL_CONFIGS.length - 1];
    const extra = idx - LEVEL_CONFIGS.length + 1;
    return base.map(wave => wave.map(g => ({ type: g.type, count: g.count + extra * 2 })));
  }

  function spawnEnemy(type) {
    const def = ENEMY_DEFS[type];
    // Pick random edge
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const margin = def.size + 10;
    if (side === 0) { x = Math.random() * W; y = -margin; }
    else if (side === 1) { x = W + margin; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + margin; }
    else { x = -margin; y = Math.random() * H; }

    enemies.push({
      type, x, y,
      r: def.size,
      color: def.color,
      speed: def.speed * diffMult,
      hp: def.hp,
      maxHp: def.hp,
      score: def.score,
      shape: def.shape,
      hitTimer: 0,
      angle: 0,
      wiggle: 0,
      wiggleDir: 1,
      shootTimer: type === 'shooter' ? 1500 : 0,
      zigzagAngle: Math.random() * Math.PI * 2,
      stopRange: type === 'shooter' ? 220 : 0,
    });
  }

  // ─── Toggle Pause ──────────────────────────────────────────────────────────
  function togglePause() {
    if (gameState === STATE.PLAYING) gameState = STATE.PAUSED;
    else if (gameState === STATE.PAUSED) gameState = STATE.PLAYING;
  }

  // ─── Click Handler ─────────────────────────────────────────────────────────
  function handleClick(cx, cy) {
    if (gameState === STATE.MENU) {
      menuButtonRects.forEach(btn => {
        if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
          if (btn.id === 'play') {
            ensureAudio();
            initGame();
          } else if (btn.id === 'howto') {
            showHowTo = !showHowTo;
          }
        }
      });
    } else if (gameState === STATE.GAME_OVER) {
      // Check restart button
      const bx = W / 2 - 100, by = H / 2 + 100, bw = 200, bh = 50;
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        initGame();
      }
    } else if (gameState === STATE.LEVEL_COMPLETE) {
      // Check continue button
      const bx = W / 2 - 100, by = H / 2 + 80, bw = 200, bh = 50;
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        initGame(levelIdx + 1);
      }
    }
  }

  // ─── Game Logic ────────────────────────────────────────────────────────────
  function updateGame(dt) {
    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateParticles(dt);
    updateFloatingTexts(dt);
    checkCollisions();
    checkWaveProgress();
  }

  function updatePlayer(dt) {
    if (player.dead) return;

    // Movement
    let dx = 0, dy = 0;
    if (keys['ArrowLeft']  || keys['a']) dx -= 1;
    if (keys['ArrowRight'] || keys['d']) dx += 1;
    if (keys['ArrowUp']    || keys['w']) dy -= 1;
    if (keys['ArrowDown']  || keys['s']) dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    player.x = Math.max(player.r, Math.min(W - player.r, player.x + dx * player.speed));
    player.y = Math.max(player.r, Math.min(H - player.r, player.y + dy * player.speed));

    // Aim toward mouse
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    // Bobbing
    player.bobPhase += dt * 0.003;

    // Fire
    player.fireCooldown -= dt;
    if (mouse.down && player.fireCooldown <= 0) {
      firePlayerBullet();
      player.fireCooldown = player.fireRate;
      player.muzzleTimer = 80;
    }
    if (player.muzzleTimer > 0) player.muzzleTimer -= dt;
    if (player.hitTimer > 0) player.hitTimer -= dt;
  }

  function firePlayerBullet() {
    const barrelLen = player.r + 10;
    const bx = player.x + Math.cos(player.angle) * barrelLen;
    const by = player.y + Math.sin(player.angle) * barrelLen;
    bullets.push({
      x: bx, y: by,
      vx: Math.cos(player.angle) * 9,
      vy: Math.sin(player.angle) * 9,
      r: 5,
      damage: 10,
      fromPlayer: true,
      color: '#ffffaa',
    });
    playBeep(880, 0.05, 'square', 0.1);
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        bullets.splice(i, 1);
      }
    }
  }

  function updateEnemies(dt) {
    enemies.forEach(e => {
      if (e.hitTimer > 0) e.hitTimer -= dt;

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      e.wiggle += dt * 0.005 * e.wiggleDir;
      if (Math.abs(e.wiggle) > 0.3) e.wiggleDir *= -1;

      if (e.type === 'runner') {
        // Zigzag
        e.zigzagAngle += dt * 0.004;
        const baseAngle = Math.atan2(dy, dx);
        const zigzag = Math.sin(e.zigzagAngle) * 0.6;
        e.x += Math.cos(baseAngle + zigzag) * e.speed;
        e.y += Math.sin(baseAngle + zigzag) * e.speed;
      } else if (e.type === 'shooter') {
        // Approach until in range, then stop and shoot
        if (dist > e.stopRange) {
          e.x += (dx / dist) * e.speed;
          e.y += (dy / dist) * e.speed;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && dist < 400) {
          fireEnemyBullet(e);
          e.shootTimer = 1800 / diffMult;
        }
      } else {
        // Grunt / Tank: beeline
        if (dist > 0) {
          e.x += (dx / dist) * e.speed;
          e.y += (dy / dist) * e.speed;
        }
      }

      e.angle = Math.atan2(dy, dx) + e.wiggle;
    });
  }

  function fireEnemyBullet(enemy) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    bullets.push({
      x: enemy.x, y: enemy.y,
      vx: (dx / dist) * 3.5,
      vy: (dy / dist) * 3.5,
      r: 6,
      damage: 12,
      fromPlayer: false,
      color: '#ff4444',
    });
    playBeep(220, 0.08, 'sawtooth', 0.08);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateFloatingTexts(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y -= 0.5;
      ft.life -= dt;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
  }

  function checkCollisions() {
    if (player.dead) return;

    // Player bullets → enemies
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (!b.fromPlayer) continue;
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        if (circleHit(b, e)) {
          e.hp -= b.damage;
          e.hitTimer = 120;
          // Knockback
          const dx = e.x - b.x, dy = e.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          e.x += (dx / d) * 4;
          e.y += (dy / d) * 4;

          bullets.splice(bi, 1);
          if (e.hp <= 0) {
            killEnemy(ei, e);
          }
          break;
        }
      }
    }

    // Enemy bullets → player
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (b.fromPlayer) continue;
      if (circleHit(b, player)) {
        player.hp -= b.damage;
        player.hitTimer = 200;
        bullets.splice(bi, 1);
        spawnHitSparks(player.x, player.y, '#ff4444', 5);
        playBeep(160, 0.15, 'sawtooth', 0.2);
        if (player.hp <= 0) killPlayer();
      }
    }

    // Enemy bodies → player
    enemies.forEach(e => {
      if (circleHit(e, player)) {
        player.hp -= 0.08;
        player.hitTimer = 100;
        if (player.hp <= 0) killPlayer();
      }
    });
  }

  function circleHit(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const sumR = a.r + b.r;
    return dx * dx + dy * dy < sumR * sumR;
  }

  function killEnemy(idx, e) {
    score += e.score;
    spawnExplosion(e.x, e.y, e.color);
    floatingTexts.push({ x: e.x, y: e.y, text: '+' + e.score, life: 900, maxLife: 900, color: '#ffff88' });
    enemies.splice(idx, 1);
    playBeep(440, 0.1, 'square', 0.12);
  }

  function killPlayer() {
    if (player.dead) return;
    player.dead = true;
    player.hp = 0;
    spawnExplosion(player.x, player.y, '#00ffff', 40);
    playBeep(110, 0.8, 'sawtooth', 0.3);
    setTimeout(() => { gameState = STATE.GAME_OVER; }, 1200);
  }

  function spawnExplosion(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        r: Math.random() * 4 + 2,
        life: Math.random() * 600 + 300,
        maxLife: 900,
      });
    }
  }

  function spawnHitSparks(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        r: 2,
        life: 200,
        maxLife: 200,
      });
    }
  }

  function checkWaveProgress() {
    if (gameState !== STATE.PLAYING) return;
    if (enemies.length === 0) {
      const levelConfig = getLevelConfig(levelIdx);
      score += 100; // wave bonus
      if (waveIdx + 1 >= levelConfig.length) {
        // Level complete
        score += 500;
        gameState = STATE.LEVEL_COMPLETE;
        playBeep(660, 0.5, 'square', 0.15);
      } else {
        // Wave clear
        gameState = STATE.WAVE_CLEAR;
        stateTimer = 1800;
        playBeep(550, 0.3, 'square', 0.12);
      }
    }
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────
  function draw(t) {
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, W, H);

    if (gameState === STATE.MENU) {
      drawMenu(t);
      return;
    }

    drawGrid();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawHUD();
    drawFloatingTexts();

    if (gameState === STATE.WAVE_CLEAR) drawWaveClear();
    if (gameState === STATE.LEVEL_COMPLETE) drawLevelComplete();
    if (gameState === STATE.GAME_OVER) drawGameOver();
    if (gameState === STATE.PAUSED) drawPaused();
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x <= W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function drawPlayer() {
    if (player.dead) return;
    const bob = Math.sin(player.bobPhase) * 2;
    const px = player.x, py = player.y + bob;

    ctx.save();
    ctx.translate(px, py);

    // Hit flash
    if (player.hitTimer > 0) {
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 20;
    }

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    const bodyColor = player.hitTimer > 0 ? '#ff6666' : '#00eeff';
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gun barrel
    ctx.rotate(player.angle);
    ctx.fillStyle = '#88ddff';
    ctx.fillRect(player.r - 2, -4, 16, 8);
    ctx.fillStyle = '#aaeeff';
    ctx.fillRect(player.r + 10, -3, 6, 6);

    // Muzzle flash
    if (player.muzzleTimer > 0) {
      const alpha = player.muzzleTimer / 80;
      ctx.beginPath();
      ctx.arc(player.r + 16, 0, 8 * alpha, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,150,${alpha})`;
      ctx.fill();
    }

    ctx.restore();

    // Neon glow ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, player.r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,238,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemies() {
    enemies.forEach(e => {
      ctx.save();
      ctx.translate(e.x, e.y);

      const hit = e.hitTimer > 0;
      const col = hit ? '#ffffff' : e.color;

      if (hit) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 15;
      } else {
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 8;
      }

      ctx.rotate(e.angle);
      ctx.fillStyle = col;

      switch (e.shape) {
        case 'square':
          ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.strokeRect(-e.r, -e.r, e.r * 2, e.r * 2);
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(0, -e.r);
          ctx.lineTo(e.r * 0.9, e.r * 0.8);
          ctx.lineTo(-e.r * 0.9, e.r * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, e.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 3;
          ctx.stroke();
          break;
        case 'diamond':
          ctx.beginPath();
          ctx.moveTo(0, -e.r);
          ctx.lineTo(e.r, 0);
          ctx.lineTo(0, e.r);
          ctx.lineTo(-e.r, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
      }

      ctx.restore();

      // Health bar (no rotation)
      drawHealthBar(e.x, e.y - e.r - 8, e.r * 2, e.hp, e.maxHp);
    });
  }

  function drawHealthBar(cx, cy, width, hp, maxHp) {
    const bw = Math.max(width, 30);
    const bh = 4;
    const bx = cx - bw / 2;
    const frac = Math.max(0, hp / maxHp);

    ctx.fillStyle = '#333';
    ctx.fillRect(bx, cy, bw, bh);

    const barColor = frac > 0.5 ? '#44ff44' : frac > 0.25 ? '#ffee00' : '#ff4444';
    ctx.fillStyle = barColor;
    ctx.fillRect(bx, cy, bw * frac, bh);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, cy, bw, bh);
  }

  function drawBullets() {
    bullets.forEach(b => {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawHUD() {
    // Health bar
    const hbx = 20, hby = 20, hbw = 180, hbh = 18;
    const hpFrac = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = '#111';
    ctx.fillRect(hbx, hby, hbw, hbh);
    const hpColor = hpFrac > 0.5 ? '#00ff88' : hpFrac > 0.25 ? '#ffee00' : '#ff4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(hbx, hby, hbw * hpFrac, hbh);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(hbx, hby, hbw, hbh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`, hbx + 4, hby + 13);

    // Score
    ctx.fillStyle = '#ffee44';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE  ${score}`, W - 20, 38);

    // Level / Wave
    const levelConfig = getLevelConfig(levelIdx);
    ctx.fillStyle = '#88ccff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${levelIdx + 1}  |  WAVE ${waveIdx + 1} / ${levelConfig.length}`, W / 2, H - 14);

    // Enemies remaining
    ctx.fillStyle = 'rgba(255,100,100,0.8)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ENEMIES: ${enemies.length}`, 20, H - 14);
  }

  function drawFloatingTexts() {
    floatingTexts.forEach(ft => {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }

  // ─── State Overlays ────────────────────────────────────────────────────────
  function drawWaveClear() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#00ffaa';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 30;
    ctx.fillText(`WAVE ${waveIdx + 1} CLEAR!`, W / 2, H / 2);
    ctx.fillStyle = '#aaffdd';
    ctx.font = '20px monospace';
    ctx.shadowBlur = 0;
    ctx.fillText('+100 BONUS', W / 2, H / 2 + 40);
    ctx.restore();
  }

  function drawLevelComplete() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffee00';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffee00';
    ctx.shadowBlur = 40;
    ctx.fillText(`LEVEL ${levelIdx + 1} COMPLETE`, W / 2, H / 2 - 60);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px monospace';
    ctx.fillText(`SCORE: ${score}`, W / 2, H / 2);
    ctx.fillText('+500 LEVEL BONUS', W / 2, H / 2 + 34);

    // Continue button
    const bx = W / 2 - 100, by = H / 2 + 80, bw = 200, bh = 50;
    ctx.fillStyle = '#ffee00';
    roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('NEXT LEVEL', W / 2, by + 32);
    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 50;
    ctx.fillText('GAME OVER', W / 2, H / 2 - 80);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px monospace';
    ctx.fillText(`FINAL SCORE: ${score}`, W / 2, H / 2);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '18px monospace';
    ctx.fillText(`Reached Level ${levelIdx + 1}`, W / 2, H / 2 + 36);

    // Restart button
    const bx = W / 2 - 100, by = H / 2 + 100, bw = 200, bh = 50;
    ctx.fillStyle = '#ff4444';
    roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PLAY AGAIN', W / 2, by + 32);
    ctx.restore();
  }

  function drawPaused() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#aaaaff';
    ctx.shadowBlur = 20;
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '18px monospace';
    ctx.fillText('Press ESC to resume', W / 2, H / 2 + 50);
    ctx.restore();
  }

  // ─── Menu Screen ───────────────────────────────────────────────────────────
  function drawMenu(t) {
    // Scrolling starfield
    stars.forEach(s => {
      s.y += s.speed;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
      ctx.fill();
    });

    // Title
    menuLogoFlicker += 0.05;
    const flicker = 0.85 + Math.sin(menuLogoFlicker * 3.7) * 0.08 + (Math.random() < 0.03 ? 0.1 : 0);
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.fillStyle = '#00eeff';
    ctx.font = 'bold 96px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00eeff';
    ctx.shadowBlur = 40;
    ctx.fillText('GUNNER', W / 2, 160);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaeeff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('TOP-DOWN SHOOTER', W / 2, 200);
    ctx.restore();

    // Spinning player demo
    menuSpinAngle += 0.02;
    ctx.save();
    ctx.translate(W / 2, 280);
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#00eeff';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(menuSpinAngle);
    ctx.fillStyle = '#88ddff';
    ctx.fillRect(16, -4, 16, 8);
    ctx.restore();

    // Buttons
    menuButtonRects = [];
    const btns = [
      { id: 'play', label: 'PLAY', color: '#00eeff', textColor: '#000' },
      { id: 'howto', label: 'HOW TO PLAY', color: showHowTo ? '#ffee00' : '#224466', textColor: showHowTo ? '#000' : '#88ccff' },
    ];
    btns.forEach((btn, i) => {
      const bw = 200, bh = 50;
      const bx = W / 2 - bw / 2;
      const by = 330 + i * 70;
      menuButtonRects.push({ id: btn.id, x: bx, y: by, w: bw, h: bh });

      ctx.fillStyle = btn.color;
      roundRect(bx, by, bw, bh, 10);
      ctx.fill();
      ctx.fillStyle = btn.textColor;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, W / 2, by + 32);
    });

    // How to play overlay
    if (showHowTo) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,10,30,0.92)';
      roundRect(W / 2 - 250, 490, 500, 145, 12);
      ctx.fill();
      ctx.strokeStyle = '#224488';
      ctx.lineWidth = 1;
      roundRect(W / 2 - 250, 490, 500, 145, 12);
      ctx.stroke();
      ctx.fillStyle = '#88ccff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      const lines = [
        'ARROW KEYS / WASD — Move',
        'MOUSE — Aim    CLICK — Shoot',
        'ESC — Pause',
        '',
        'Destroy enemies to earn points!',
        'Clear all waves to advance levels.',
      ];
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, 515 + i * 20);
      });
      ctx.restore();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ─── Main Loop ─────────────────────────────────────────────────────────────
  let lastTime = 0;

  function loop(t) {
    const dt = Math.min(t - lastTime, 50); // cap at 50ms to avoid spiral of death
    lastTime = t;

    if (gameState === STATE.PLAYING) {
      updateGame(dt);
    } else if (gameState === STATE.WAVE_CLEAR) {
      stateTimer -= dt;
      updateParticles(dt);
      updateFloatingTexts(dt);
      if (stateTimer <= 0) {
        waveIdx++;
        spawnWave();
        gameState = STATE.PLAYING;
      }
    }

    draw(t);
    requestAnimationFrame(loop);
  }

  // Kick off
  requestAnimationFrame(t => { lastTime = t; requestAnimationFrame(loop); });

})();
