// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyCn2FIG7O8uM-oRB1wWTpSTabMo9oooGFw",
    authDomain: "pokemon-quiz-f061a.firebaseapp.com",
    projectId: "pokemon-quiz-f061a",
    storageBucket: "pokemon-quiz-f061a.firebasestorage.app",
    messagingSenderId: "281608737778",
    appId: "1:281608737778:web:477a49dea69080c177116b"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const UI_TITLE = document.getElementById('title-screen'); 
const UI_LEVEL_UP = document.getElementById('level-up-screen');
const UI_GAME_OVER = document.getElementById('game-over-screen');
const HUD_SCORE = document.getElementById('score-display');
const HUD_HP_FILL = document.getElementById('hp-fill');
const HUD_HP_TEXT = document.getElementById('hp-text');
const HUD_GOLD_TIMER = document.getElementById('gold-mode-timer');

let isGameOver = false;
let isPaused = true; 
let score = 0;
let frames = 0;

const images = {};
let imagesLoaded = 0;

function loadImage(key, src) {
    images[key] = new Image();
    images[key].src = src;
    images[key].onload = () => imagesLoaded++;
    images[key].onerror = () => { imagesLoaded++; images[key] = null; };
}

loadImage('player', 'player.png');
loadImage('enemy_tank', 'enemy_tank.png');
loadImage('enemy_speed', 'enemy_speed.png');
loadImage('enemy_erratic', 'enemy_erratic.png');
loadImage('culumon', 'culumon.png');
loadImage('data', 'title.png'); 
loadImage('sukamon', 'sukamon.png'); // ⭐️ 스카몬 이미지 로드

const player = {
    x: canvas.width / 2, y: canvas.height / 2, 
    size: 40, speed: 4, hp: 10, maxHp: 10,
    isGold: false, goldTimer: 0, invincibilityTimer: 0,
    flipX: false, frame: 0 
};

let poops = [];
let items = [];
let enemies = [];
let puddles = []; 

// ⭐️ 궁극기 관련 전역 변수
let ultGauge = 0;
const MAX_ULT = 100; 
let isUltActive = false;

const weapon = { speed: 7, size: 10, cooldown: 1000, lastShot: 0, damage: 1, range: 150, count: 1 };

const enemyTypes = [
    { name: "tank", hp: 2, speed: 1.5, color: '#FF8C00', size: 42, img: 'enemy_tank' }, 
    { name: "speed", hp: 1, speed: 4.5, color: '#FFD700', size: 30, img: 'enemy_speed' }, 
    { name: "erratic", hp: 1, speed: 4.0, color: '#32CD32', size: 36, img: 'enemy_erratic' } 
];

const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

window.onkeydown = e => { 
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true; 

    if (isPaused && UI_LEVEL_UP.style.display === 'flex') {
        if (e.key === '1') selectUpgrade('damage');
        if (e.key === '2') selectUpgrade('speed');
        if (e.key === '3') selectUpgrade('move');
        if (e.key === '4') selectUpgrade('range');
        if (e.key === '5') selectUpgrade('count');
    }

    // ⭐️ 스페이스바로 궁극기 발동
    if (e.code === 'Space' && ultGauge >= MAX_ULT && !isPaused && !isGameOver) {
        activateSukamonUlt();
    }
};

window.onkeyup = e => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; };
   
let isTouching = false;
let touchStartX = 0; let touchStartY = 0;
let touchCurrentX = 0; let touchCurrentY = 0;

function getCanvasTouchPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const pos = getCanvasTouchPos(e);
    isTouching = true;
    touchStartX = pos.x; touchStartY = pos.y;
    touchCurrentX = pos.x; touchCurrentY = pos.y;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isTouching) return;
    const pos = getCanvasTouchPos(e);
    touchCurrentX = pos.x; touchCurrentY = pos.y;
}, { passive: false });

canvas.addEventListener('touchend', (e) => { e.preventDefault(); isTouching = false; });

let audioCtx;
function playShootSound() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } 
        catch (e) { return; }
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine'; 
    osc.frequency.setValueAtTime(400, audioCtx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1); 
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime); 
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

const bgm = new Audio('sunset_at_the_gate.mp3');
bgm.loop = true; bgm.volume = 0.3; 

window.startGame = function() {
    isPaused = false; 
    UI_TITLE.style.display = 'none'; 
    const bgmBtn = document.getElementById('bgm-init-btn');
    if (bgmBtn) bgmBtn.style.display = 'none';

    bgm.play().catch(error => console.warn("BGM 재생 불가:", error));
    lastTime = Date.now();
    gameLoop(); 
}

// 스카몬 궁극기 발동 로직
function activateSukamonUlt() {
    ultGauge = 0;
    isUltActive = true;
    
    const sukamonX = canvas.width / 2;
    const sukamonY = canvas.height / 2;
    
    for(let i=0; i<3; i++) setTimeout(playShootSound, i * 100);

    for (let i = 0; i < 32; i++) {
        let angle = (Math.PI * 2 / 32) * i;
        poops.push({
            x: sukamonX, y: sukamonY, startX: sukamonX, startY: sukamonY, 
            maxRange: 1500, size: 35, 
            vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12, 
            damage: 100, color: '#8B4513', isUltPoop: true
        });
    }

    setTimeout(() => { isUltActive = false; }, 500);
}

async function displayLeaderboard() {
    const lbDiv = document.getElementById('leaderboard');
    lbDiv.innerHTML = "<h3 style='color: white; text-align:center;'>데이터 불러오는 중... ⏳</h3>";
    try {
        const snapshot = await db.collection("womaemon_scores").orderBy("score", "desc").limit(5).get();
        if (snapshot.empty) {
            lbDiv.innerHTML = "<h3>🏆 TOP 5 랭커 🏆</h3><p style='text-align:center; color:#ccc;'>아직 등록된 랭커가 없어!</p>";
            return;
        }
        let html = "<h3>🏆 TOP 5 랭커 🏆</h3><ol>";
        snapshot.forEach((doc) => {
            const data = doc.data();
            html += `<li>${data.name} : <span style="color:var(--color-glow-green);">${data.score}점</span></li>`;
        });
        html += "</ol>";
        lbDiv.innerHTML = html;
    } catch (error) { lbDiv.innerHTML = "<p style='color: red; text-align:center;'>서버 연결 실패</p>"; }
}

window.saveScore = async function() {
    const nameInput = document.getElementById('player-name').value.trim();
    if(!nameInput) return alert('이름을 입력해줘!');
    document.getElementById('name-input-section').style.display = 'none'; 
    const lbDiv = document.getElementById('leaderboard');
    lbDiv.innerHTML = "<h3 style='color: white; text-align:center;'>전송 중... 🚀</h3>";
    try {
        await db.collection("womaemon_scores").add({
            name: nameInput, score: score, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        displayLeaderboard(); 
    } catch (error) {
        alert("저장 실패"); document.getElementById('name-input-section').style.display = 'flex'; displayLeaderboard();
    }
}

function updateHUD() {
    HUD_SCORE.innerText = '점수: ' + score;
    HUD_HP_TEXT.innerText = `HP: ${player.hp} / ${player.maxHp}`;
    HUD_HP_FILL.style.width = (player.hp / player.maxHp * 100) + '%';
    if (player.isGold) {
        HUD_GOLD_TIMER.style.display = 'block';
        HUD_GOLD_TIMER.innerText = `진화 유지: ${(player.goldTimer/60).toFixed(1)}초`;
    } else {
        HUD_GOLD_TIMER.style.display = 'none';
    }
}

function drawSprite(imgKey, x, y, width, height, flipX = false) {
    const img = images[imgKey];
    if (img && img.complete && img.width > 0) {
        ctx.save();
        ctx.translate(x, y);
        if (flipX) ctx.scale(-1, 1);
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        ctx.restore();
    } else {
        ctx.fillStyle = 'magenta'; ctx.fillRect(x - width/2, y - height/2, width, height);
    }
}

function createPuddle(x, y) { puddles.push({ x: x, y: y, radius: 35, timer: 120 }); }

function spawnEnemy() {
    const difficultyTier = Math.floor(frames / 60); 
    let spawnCount = 1 + Math.floor(difficultyTier / 15); 
    const spawnRate = Math.max(20, 100 - Math.floor(difficultyTier * 2)); 
    let hpBonus = Math.floor(score / 30);

    if (frames % spawnRate === 0) {
        for (let i = 0; i < spawnCount; i++) {
            const typeInfo = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
            let ex = Math.random() < 0.5 ? -30 : canvas.width + 30;
            let ey = Math.random() * canvas.height;
            enemies.push({ 
                ...typeInfo, x: ex, y: ey, hp: typeInfo.hp + hpBonus, 
                moveTimer: Math.floor(Math.random() * 60), flipX: false, hitTimer: 0 
            });
        }
    }

    // ⭐️ 동글몬 확정 등장 (30초 / 1800프레임 주기)
    if (frames % 1800 === 0 && frames > 0) {
        let cx = Math.random() < 0.5 ? -40 : canvas.width + 40;
        let cy = Math.random() * (canvas.height - 100) + 50; 
        let cvx = cx < 0 ? 1.5 : -1.5; 
        let cvy = (Math.random() - 0.5) * 1;
        enemies.push({ x: cx, y: cy, size: 30, hp: 3, speed: 1.0, type: 'culumon', img: 'culumon', flipX: cvx < 0, vx: cvx, vy: cvy, moveTimer: 0, hitTimer: 0 });
    }
}

// ⭐️ 타겟팅 최적화된 발사 로직
function throwPoop() {
    if (enemies.length === 0) return;
    
    let target = null;
    let minDist = Infinity;
    
    for (let e of enemies) {
        if (e.type === 'culumon') {
            target = e; break; // 동글몬 최우선 타겟팅
        }
    }
    
    function throwPoop() {
    if (enemies.length === 0) return;
    
    let target = enemies[0];
    let minDist = Infinity;
    
    // 무조건 가장 가까운 적을 조준 (동글몬 강제 고정 해제)
    enemies.forEach(e => {
        let d = Math.hypot(e.x - player.x, e.y - player.y);
        if(d < minDist) { minDist = d; target = e; }
    });

    if(!target) return;

    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    for(let i = 0; i < weapon.count; i++) {
        const spread = (i - (weapon.count - 1) / 2) * 0.3;
        poops.push({
            x: player.x, y: player.y, startX: player.x, startY: player.y, maxRange: weapon.range,
            size: weapon.size, vx: Math.cos(angle + spread) * weapon.speed, vy: Math.sin(angle + spread) * weapon.speed, 
            damage: weapon.damage, color: '#FF69B4', isUltPoop: false
        });
    }
}

window.selectUpgrade = function(type) {
    if (type === 'damage') weapon.damage += 1; 
    if (type === 'speed') weapon.cooldown = Math.max(200, weapon.cooldown - 200); 
    if (type === 'move') player.speed += 0.5; 
    if (type === 'range') weapon.range += 300; 
    if (type === 'count') weapon.count += 1; 
    
    UI_LEVEL_UP.style.display = 'none'; isPaused = false;
}

// ⭐️ 완벽하게 통합 및 수정된 update 함수
function update() {
    if (isGameOver || isPaused) return; 
    frames++;
    updateHUD();

    if (keys.ArrowUp) player.y -= player.speed;
    if (keys.ArrowDown) player.y += player.speed;
    if (keys.ArrowLeft) { player.x -= player.speed; player.flipX = true; }
    if (keys.ArrowRight) { player.x += player.speed; player.flipX = false; }
    if (isTouching) {
        const dx = touchCurrentX - touchStartX; const dy = touchCurrentY - touchStartY; const dist = Math.hypot(dx, dy);
        if (dist > 10) {
            player.x += (dx / dist) * player.speed; player.y += (dy / dist) * player.speed;
            if (dx < 0) player.flipX = true; if (dx > 0) player.flipX = false;
        }
    }
    player.x = Math.max(0, Math.min(canvas.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height, player.y));

    let currentCooldown = player.isGold ? 100 : weapon.cooldown; 
    if (Date.now() - weapon.lastShot > currentCooldown) {
        if (player.isGold) {
            playShootSound(); 
            for (let i = 0; i < 8; i++) {
                let angle = (Math.PI / 4) * i;
                poops.push({
                    x: player.x, y: player.y, startX: player.x, startY: player.y, maxRange: weapon.range * 1.5,
                    size: weapon.size + 5, vx: Math.cos(angle) * weapon.speed * 1.5, vy: Math.sin(angle) * weapon.speed * 1.5, 
                    damage: weapon.damage * 3, color: '#FFD700', isUltPoop: false
                });
            }
        } else {
            playShootSound(); 
            throwPoop(); 
        }
        weapon.lastShot = Date.now();
    }

    // 1. 투사체 이동 및 사거리 소멸 루프
    for (let i = poops.length - 1; i >= 0; i--) {
        const p = poops[i]; 
        p.x += p.vx; p.y += p.vy;
        if (Math.hypot(p.x - p.startX, p.y - p.startY) > p.maxRange) {
            if (!p.isUltPoop) { createPuddle(p.x, p.y); }
            poops.splice(i, 1);
        }
    }

    for (let i = puddles.length - 1; i >= 0; i--) {
        puddles[i].timer--;
        if (puddles[i].timer <= 0) puddles.splice(i, 1);
    }

    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]; item.timer--;
        if (item.timer <= 0) { items.splice(i, 1); continue; }
        if (Math.hypot(item.x - player.x, item.y - player.y) < (player.size/2 + item.size/2)) {
            player.hp = Math.min(player.maxHp, player.hp + 3);
            player.isGold = true; player.goldTimer = 600; 
            items.splice(i, 1);
        }
    }

    spawnEnemy();
    
    // 2. 적군 이동 및 충돌 루프
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.moveTimer++; 
        
        if (e.type === 'culumon') {
            e.x += e.vx; e.y += e.vy; e.flipX = e.vx < 0;
            if (e.x < -100 || e.x > canvas.width + 100) { enemies.splice(i, 1); continue; }
        } else {
            const angle = Math.atan2(player.y - e.y, player.x - e.x); e.flipX = Math.cos(angle) < 0;
            let inPuddle = false;
            for (let p of puddles) {
                if (Math.hypot(e.x - p.x, e.y - p.y) < p.radius + e.size / 2) { inPuddle = true; break; }
            }
            let currentSpeed = e.speed;
            if (inPuddle) currentSpeed *= 0.4; 
            if (e.name === 'erratic') { if (e.moveTimer % 60 > 40) currentSpeed = 0; }
            e.x += Math.cos(angle) * currentSpeed; e.y += Math.sin(angle) * currentSpeed;
        }

        let isDead = false;
        
        // 투사체 충돌 로직
        for (let j = poops.length - 1; j >= 0; j--) {
            const p = poops[j];
            if (Math.hypot(e.x - p.x, e.y - p.y) < (e.size/2 + p.size/2)) {
                let dealtDamage = Math.min(e.hp, p.damage); 
                e.hp -= dealtDamage; p.damage -= dealtDamage; 
                e.hitTimer = 5; 
                const kbAngle = Math.atan2(p.vy, p.vx); e.x += Math.cos(kbAngle) * 8; e.y += Math.sin(kbAngle) * 8;

                if (p.damage <= 0) {
                    if (!p.isUltPoop) { createPuddle(p.x, p.y); }
                    poops.splice(j, 1); 
                }

                if (e.hp <= 0) {
                    isDead = true;
                    if (e.type === 'culumon') {
                        items.push({ x: e.x, y: e.y, size: 20, timer: 600 });
                    } else {
                        score++; 
                        ultGauge = Math.min(MAX_ULT, ultGauge + 1); // ⭐️ 게이지 충전
                        if(score % 10 === 0) { isPaused = true; UI_LEVEL_UP.style.display = 'flex'; }
                    }
                    enemies.splice(i, 1); 
                    break; 
                }
            }
        }

        if (isDead) continue; 

        if (e.type !== 'culumon' && Math.hypot(e.x - player.x, e.y - player.y) < (player.size/2 + e.size/2 - 10)) {
            if (player.invincibilityTimer <= 0 && !player.isGold) {
                player.hp--; player.invincibilityTimer = 30;
                if (player.hp <= 0) { 
                    isGameOver = true; 
                    UI_GAME_OVER.style.display = 'flex'; 
                    document.getElementById('final-score').innerText = `최종 점수: ${score}점`; 
                    displayLeaderboard(); 
                }
            }
        }
    }
    
    if (player.invincibilityTimer > 0) player.invincibilityTimer--;
    if (player.isGold) {
        player.goldTimer--;
        if (player.goldTimer <= 0) player.isGold = false; 
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    puddles.forEach(p => {
        ctx.fillStyle = 'rgba(255, 105, 180, 0.2)'; 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    });

    poops.forEach(p => {
        ctx.fillStyle = p.color; 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size/2, 0, Math.PI*2); ctx.fill();
    });

    items.forEach(item => {
        ctx.save(); ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 15; ctx.shadowColor = "white";
        ctx.beginPath(); ctx.arc(item.x, item.y, item.size/2, 0, Math.PI*2); ctx.fill(); ctx.restore();
    });

    enemies.forEach(e => {
        if (e.hitTimer > 0) { e.hitTimer--; ctx.globalAlpha = 0.4; }
        if (images[e.img]) drawSprite(e.img, e.x, e.y, e.size, e.size, e.flipX);
        else { ctx.fillStyle = e.color; ctx.fillRect(e.x-15, e.y-15, e.size, e.size); }
        ctx.globalAlpha = 1.0; 
    });

    if (player.isGold) {
        ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = "gold"; 
        drawSprite('player', player.x, player.y, player.size, player.size, player.flipX); ctx.restore();
    } else if (player.invincibilityTimer % 10 < 5) {
        drawSprite('player', player.x, player.y, player.size, player.size, player.flipX);
    }
     // ⭐️ [신규 추가] 동글몬 위치 추적 화살표 (레이더)
    let culumon = enemies.find(e => e.type === 'culumon');
    if (culumon) {
        // 플레이어와 동글몬 사이의 각도 계산
        const angle = Math.atan2(culumon.y - player.y, culumon.x - player.x);
        const radius = 60; // 화살표가 플레이어를 맴도는 궤도 반경
        const arrowX = player.x + Math.cos(angle) * radius;
        const arrowY = player.y + Math.sin(angle) * radius;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle);
        
        // 반투명한 황금색 화살표 그리기
        ctx.fillStyle = 'rgba(255, 215, 0, 0.8)'; 
        ctx.beginPath();
        ctx.moveTo(12, 0);   // 화살표 뾰족한 끝
        ctx.lineTo(-8, 8);   // 화살표 윗쪽 꼬리
        ctx.lineTo(-8, -8);  // 화살표 아랫쪽 꼬리
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }

    
    // ⭐️ 궁극기 UI 및 연출 렌더링
    ctx.fillStyle = "white";
    ctx.font = "16px Courier New";
    ctx.fillText(`궁극기(Space): ${Math.floor((ultGauge/MAX_ULT)*100)}%`, 15, 60);

    if (isUltActive) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        drawSprite('sukamon', canvas.width / 2, canvas.height / 2, 120, 120, false);
        ctx.restore();

        
    }
}

let lastTime = Date.now();
const FPS = 60;
const frameInterval = 1000 / FPS;

function gameLoop() {
    if(!isGameOver) requestAnimationFrame(gameLoop);
    let currentTime = Date.now();
    let deltaTime = currentTime - lastTime;
    if (deltaTime >= frameInterval) {
        lastTime = currentTime - (deltaTime % frameInterval); 
        update(); draw();
    }
}
draw();
