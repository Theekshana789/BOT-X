const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hud = {
  level: document.getElementById('hudLevel'),
  lives: document.getElementById('hudLives'),
  coins: document.getElementById('hudCoins'),
  stars: document.getElementById('hudStars'),
  timer: document.getElementById('hudTimer'),
};
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayBtn = document.getElementById('overlayBtn');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

const world = { width: 5000, height: 720, gravity: 0.82, groundY: 620 };
const keys = {};
let running = false;
let paused = false;
let levelIndex = 0;
let totalTime = 0;
let checkpoint = 0;
let lastFrame = 0;

const player = {
  x: 120, y: 400, w: 54, h: 72,
  vx: 0, vy: 0,
  speed: 5.4, jump: 16.5, dashPower: 12,
  onGround: false, face: 1, anim: 'idle', animTime: 0,
  coins: 0, stars: 0, lives: 3, power: false, hurtTimer: 0,
};

function makeLevel(i) {
  const seed = i + 1;
  const platforms = [{ x: 0, y: 620, w: 5000, h: 100, type: 'ground' }];
  const coins = [];
  const stars = [];
  const enemies = [];
  const hazards = [];
  const powerups = [];
  const springs = [];
  const movingPlatforms = [];

  for (let s = 0; s < 10 + seed; s++) {
    const x = 280 + s * 340;
    const y = 500 - ((s + seed) % 4) * 80;
    const w = 160 + ((s + seed) % 3) * 30;
    platforms.push({ x, y, w, h: 24, type: 'platform' });
    coins.push({ x: x + w / 2, y: y - 34, r: 12, taken: false });
    if (s % 3 === 0) enemies.push({ x: x + 40, y: y - 44, w: 42, h: 42, vx: 1.5 + seed * 0.08, minX: x, maxX: x + w - 42, alive: true });
    if (s % 4 === 1) hazards.push({ x: x + 10, y: y + 10, w: Math.min(80, w - 20), h: 16 });
    if (s % 5 === 0) springs.push({ x: x + w - 34, y: y - 10, w: 24, h: 10, power: 21 });
    if (s % 5 === 2) movingPlatforms.push({ x: x + 130, y: y - 110, w: 120, h: 20, baseY: y - 110, range: 70, t: s });
  }

  for (let k = 0; k < 3; k++) stars.push({ x: 900 + k * 1250 + seed * 10, y: 240 + (k % 2) * 80, r: 14, taken: false });
  for (let p = 0; p < 4; p++) powerups.push({ x: 700 + p * 1100, y: 560 - (p % 2) * 120, w: 30, h: 30, taken: false });

  if (i > 7) {
    hazards.push({ x: 2150, y: 606, w: 140, h: 14 }, { x: 3320, y: 606, w: 180, h: 14 });
  }
  if (i > 13) {
    enemies.push({ x: 4210, y: 576, w: 56, h: 56, vx: 3.1, minX: 4050, maxX: 4500, alive: true, boss: true });
  }

  return {
    name: `Level ${seed}`,
    skyHue: 200 + i * 4,
    platforms, coins, stars, enemies, hazards, powerups, springs, movingPlatforms,
    portal: { x: 4760, y: 542, w: 52, h: 78 },
    message: [
      'Warm up in the meadow.', 'Bounce through sky bridges.', 'Time your landings over spikes.', 'Dash across long gaps.',
      'Use moving lifts.', 'Star rooms appear higher.', 'Enemies get faster now.', 'Checkpoint challenge.',
      'Twin hazard lanes ahead.', 'Rapid coin run.', 'Tower climb.', 'Spring gauntlet.',
      'Portal sprint.', 'Boss scouts appear.', 'Secret star arc.', 'Crystal cliffs.',
      'Night rush.', 'Heavy patrols.', 'Final gauntlet.', 'Kingdom gate.'
    ][i]
  };
}

const levels = Array.from({ length: 20 }, (_, i) => makeLevel(i));

function resetPlayer(full = false) {
  player.x = 120;
  player.y = 400;
  player.vx = 0;
  player.vy = 0;
  player.hurtTimer = 0;
  if (full) {
    player.coins = 0; player.stars = 0; player.lives = 3; player.power = false;
    levelIndex = 0; totalTime = 0; checkpoint = 0;
    levels.forEach(level => {
      level.coins.forEach(c => c.taken = false);
      level.stars.forEach(s => s.taken = false);
      level.powerups.forEach(p => p.taken = false);
      level.enemies.forEach(e => e.alive = true);
    });
  }
}

function currentLevel() { return levels[levelIndex]; }
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function circleHit(entity, circle) {
  const cx = Math.max(entity.x, Math.min(circle.x, entity.x + entity.w));
  const cy = Math.max(entity.y, Math.min(circle.y, entity.y + entity.h));
  return (circle.x - cx) ** 2 + (circle.y - cy) ** 2 < circle.r ** 2;
}

function startGame() {
  running = true; paused = false;
  overlay.classList.remove('visible');
  requestAnimationFrame(loop);
}

function showOverlay(title, text, btn = 'Continue') {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayBtn.textContent = btn;
  overlay.classList.add('visible');
}

function damagePlayer(reason) {
  if (player.hurtTimer > 0) return;
  player.hurtTimer = 90;
  if (player.power) {
    player.power = false;
  } else {
    player.lives -= 1;
    if (player.lives <= 0) {
      running = false;
      showOverlay('Game Over', `Marion fell to ${reason}. Restart from level ${checkpoint + 1}?`, 'Try Again');
      levelIndex = checkpoint;
      player.lives = 3;
      resetPlayer(false);
      return;
    }
  }
  resetPlayer(false);
}

function update(dt) {
  const lvl = currentLevel();
  totalTime += dt;
  player.animTime += dt;
  if (player.hurtTimer > 0) player.hurtTimer -= 1;

  const move = (keys['KeyA'] ? -1 : 0) + (keys['KeyD'] ? 1 : 0);
  const accel = player.power ? 0.95 : 0.72;
  player.vx += move * accel;
  player.vx *= player.onGround ? 0.82 : 0.9;
  player.vx = Math.max(- (player.power ? 9 : 7), Math.min((player.power ? 9 : 7), player.vx));
  if (move !== 0) player.face = move;
  if ((keys['Space'] || keys['KeyW']) && player.onGround) {
    player.vy = -player.jump - (player.power ? 2.5 : 0);
    player.onGround = false;
  }
  if (keys['ShiftLeft'] || keys['ShiftRight']) {
    player.vx = player.face * player.dashPower;
  }
  player.vy += world.gravity;
  player.x += player.vx;
  player.y += player.vy;
  player.onGround = false;

  [...lvl.platforms, ...lvl.movingPlatforms].forEach(p => {
    if (p.baseY !== undefined) {
      p.t += dt * 2;
      p.y = p.baseY + Math.sin(p.t) * p.range;
    }
    if (rectsOverlap(player, p)) {
      const prevBottom = player.y + player.h - player.vy;
      if (prevBottom <= p.y + 16 && player.vy >= 0) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
        if (p.baseY !== undefined) player.x += Math.sin(p.t) * 0.4;
      } else if (player.x + player.w / 2 < p.x + p.w / 2) {
        player.x = p.x - player.w;
        player.vx *= -0.2;
      } else {
        player.x = p.x + p.w;
        player.vx *= -0.2;
      }
    }
  });

  lvl.springs.forEach(s => {
    if (rectsOverlap(player, s) && player.vy >= 0) {
      player.vy = -s.power;
      player.onGround = false;
    }
  });

  lvl.coins.forEach(c => { if (!c.taken && circleHit(player, c)) { c.taken = true; player.coins += 1; } });
  lvl.stars.forEach(s => { if (!s.taken && circleHit(player, s)) { s.taken = true; player.stars += 1; } });
  lvl.powerups.forEach(p => { if (!p.taken && rectsOverlap(player, p)) { p.taken = true; player.power = true; } });
  lvl.hazards.forEach(h => { if (rectsOverlap(player, h)) damagePlayer('a hazard'); });

  lvl.enemies.forEach(e => {
    if (!e.alive) return;
    e.x += e.vx;
    if (e.x <= e.minX || e.x >= e.maxX) e.vx *= -1;
    if (rectsOverlap(player, e)) {
      if (player.vy > 1 && player.y + player.h - e.y < 32) {
        e.alive = false; player.vy = -11;
      } else {
        damagePlayer(e.boss ? 'the guardian' : 'an enemy');
      }
    }
  });

  if (rectsOverlap(player, lvl.portal)) {
    if (levelIndex === levels.length - 1) {
      running = false;
      showOverlay('You Won!', `Super Marion cleared all 20 levels in ${totalTime.toFixed(1)} seconds with ${player.coins} coins and ${player.stars} stars.`, 'Play Again');
      return;
    }
    levelIndex += 1;
    if (levelIndex % 5 === 0) checkpoint = levelIndex;
    resetPlayer(false);
    showOverlay(levels[levelIndex].name, levels[levelIndex].message, 'Enter Level');
    running = false;
  }

  if (player.y > world.height + 120 || player.x < -200) damagePlayer('the abyss');
  player.x = Math.max(0, Math.min(world.width - player.w, player.x));
  player.anim = player.hurtTimer > 0 ? 'hurt' : !player.onGround ? 'jump' : Math.abs(player.vx) > 5 ? 'dash' : Math.abs(player.vx) > 1 ? 'run' : player.power ? 'power' : 'idle';

  hud.level.textContent = String(levelIndex + 1);
  hud.lives.textContent = String(player.lives);
  hud.coins.textContent = String(player.coins);
  hud.stars.textContent = String(player.stars);
  hud.timer.textContent = totalTime.toFixed(1);
}

function drawBackground(lvl, cameraX) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `hsl(${lvl.skyHue} 90% 73%)`);
  grad.addColorStop(.6, '#f8fdff');
  grad.addColorStop(.601, '#7fd96d');
  grad.addColorStop(1, '#4fa445');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 6; i++) {
    const x = (i * 260 - cameraX * 0.2) % (canvas.width + 260);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.arc(x + 60, 110 + i * 10, 38, 0, Math.PI * 2);
    ctx.arc(x + 100, 100 + i * 10, 52, 0, Math.PI * 2);
    ctx.arc(x + 150, 115 + i * 10, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(30,90,130,.15)';
  for (let i = 0; i < 7; i++) {
    const px = i * 220 - (cameraX * 0.45 % 220);
    ctx.beginPath();
    ctx.moveTo(px, 620);
    ctx.lineTo(px + 90, 360 - (i % 2) * 40);
    ctx.lineTo(px + 190, 620);
    ctx.fill();
  }
}

function drawPlayer(cameraX) {
  const px = player.x - cameraX;
  const bounce = Math.sin(player.animTime * 14) * 3;
  ctx.save();
  ctx.translate(px + player.w / 2, player.y + player.h / 2 + (player.anim === 'run' ? bounce : 0));
  ctx.scale(player.face, 1);
  ctx.translate(-player.w / 2, -player.h / 2);

  ctx.fillStyle = player.hurtTimer > 0 ? '#fff' : '#d63447';
  ctx.fillRect(12, 0, 30, 16);
  ctx.fillStyle = '#ffd168';
  ctx.fillRect(15, 15, 24, 24);
  ctx.fillStyle = player.power ? '#ffdd57' : '#c62828';
  ctx.fillRect(0, 18, 54, 28);
  ctx.fillStyle = '#1f5fbf';
  ctx.fillRect(9, 46, 14, 26);
  ctx.fillRect(31, 46, 14, 26);
  ctx.fillStyle = '#633a19';
  const legOffset = player.anim === 'run' || player.anim === 'dash' ? Math.sin(player.animTime * 18) * 8 : 0;
  ctx.fillRect(8, 70, 16, 8 + Math.abs(legOffset));
  ctx.fillRect(30, 70, 16, 8 + Math.abs(-legOffset));
  ctx.fillStyle = '#fff';
  ctx.fillRect(30, 22, 12, 8);
  ctx.fillStyle = '#111';
  ctx.fillRect(36, 24, 4, 4);
  ctx.restore();
}

function draw(dt) {
  const lvl = currentLevel();
  const cameraX = Math.max(0, Math.min(world.width - canvas.width, player.x - canvas.width * 0.35));
  drawBackground(lvl, cameraX);

  const drawRect = (r, fill) => { ctx.fillStyle = fill; ctx.fillRect(r.x - cameraX, r.y, r.w, r.h); };
  lvl.platforms.forEach(p => drawRect(p, p.type === 'ground' ? '#6e4324' : '#7a4e2e'));
  lvl.movingPlatforms.forEach(p => drawRect(p, '#4a637f'));
  lvl.springs.forEach(s => drawRect(s, '#ef476f'));
  lvl.hazards.forEach(h => {
    const sx = h.x - cameraX;
    ctx.fillStyle = '#8e5cff';
    for (let i = 0; i < h.w; i += 16) {
      ctx.beginPath();
      ctx.moveTo(sx + i, h.y + h.h);
      ctx.lineTo(sx + i + 8, h.y);
      ctx.lineTo(sx + i + 16, h.y + h.h);
      ctx.fill();
    }
  });
  lvl.coins.forEach(c => {
    if (c.taken) return;
    ctx.fillStyle = '#ffd84f';
    ctx.beginPath(); ctx.arc(c.x - cameraX, c.y + Math.sin(totalTime * 8 + c.x) * 4, c.r, 0, Math.PI * 2); ctx.fill();
  });
  lvl.stars.forEach(s => {
    if (s.taken) return;
    const x = s.x - cameraX, y = s.y + Math.sin(totalTime * 6 + s.x) * 6;
    ctx.fillStyle = '#8ef0ff';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 0.8;
      const angle2 = angle + Math.PI * 0.4;
      const r1 = s.r, r2 = s.r * 0.45;
      if (i === 0) ctx.moveTo(x + Math.cos(angle) * r1, y + Math.sin(angle) * r1);
      ctx.lineTo(x + Math.cos(angle2) * r2, y + Math.sin(angle2) * r2);
      ctx.lineTo(x + Math.cos(angle + Math.PI * 0.8) * r1, y + Math.sin(angle + Math.PI * 0.8) * r1);
    }
    ctx.fill();
  });
  lvl.powerups.forEach(p => { if (!p.taken) drawRect(p, '#ff3d81'); });
  lvl.enemies.forEach(e => {
    if (!e.alive) return;
    ctx.fillStyle = e.boss ? '#5c1c8c' : '#ff697d';
    ctx.fillRect(e.x - cameraX, e.y, e.w, e.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(e.x - cameraX + 8, e.y + 10, 10, 10);
    ctx.fillRect(e.x - cameraX + e.w - 18, e.y + 10, 10, 10);
  });

  ctx.strokeStyle = '#5be7ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(lvl.portal.x - cameraX, lvl.portal.y, lvl.portal.w, lvl.portal.h);
  ctx.fillStyle = 'rgba(91,231,255,.3)';
  ctx.fillRect(lvl.portal.x - cameraX, lvl.portal.y, lvl.portal.w, lvl.portal.h);

  drawPlayer(cameraX);

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(22, 22, 340, 86);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(lvl.name, 36, 54);
  ctx.font = '18px Arial';
  ctx.fillStyle = '#d9ecff';
  ctx.fillText(lvl.message, 36, 84);
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 56px Arial'; ctx.fillText('Paused', canvas.width / 2 - 90, canvas.height / 2);
  }
}

function loop(ts) {
  if (!lastFrame) lastFrame = ts;
  const dt = Math.min(0.033, (ts - lastFrame) / 1000);
  lastFrame = ts;
  if (running && !paused) update(dt);
  draw(dt);
  if (running || paused) requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP') {
    paused = !paused;
    if (running || paused) requestAnimationFrame(loop);
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

[startBtn, overlayBtn].forEach(btn => btn.addEventListener('click', () => {
  if (!running) startGame();
}));
restartBtn.addEventListener('click', () => {
  resetPlayer(true);
  showOverlay('Fresh Run', 'The full 20-level adventure has been reset.', 'Play');
  running = false;
  draw(0);
});

draw(0);
