// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyCn2FIG7O8uM-oRB1wWTpSTabMo9oooGFw",
    authDomain: "pokemon-quiz-f061a.firebaseapp.com",
    projectId: "pokemon-quiz-f061a",
    storageBucket: "pokemon-quiz-f061a.firebasestorage.app",
    messagingSenderId: "281608737778",
    appId: "1:281608737778:web:477a49dea69080c177116b"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
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
const totalImages = 6; 

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

const player = {
    x: canvas.width / 2, y: canvas.height / 2, 
    size: 40, speed: 4, hp: 10, maxHp: 10,
    isGold: false, goldTimer: 0, invincibilityTimer: 0,
    flipX: false, frame: 0 
};

let poops = [];
let items = [];
let enemies = [];

const weapon = { speed: 7, size: 10, cooldown: 1000, lastShot: 0, damage: 1, range: 150, count: 1 };

const enemyTypes = [
    { name: "tank", hp: 2, speed: 1.5, color: '#FF8C00', size: 42, img: 'enemy_tank' }, 
    { name: "speed", hp: 1, speed: 4.5, color: '#FFD700', size: 30, img: 'enemy_speed' }, 
    { name: "erratic", hp: 1, speed: 4.0, color: '#32CD32', size: 36, img: 'enemy_erratic' } 
];

const DIFFICULTY_FRAME_INTERVAL = 300; 

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
};

window.onkeyup = e => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; };
   
    let isTouching = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;

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
        touchStartX = pos.x;
        touchStartY = pos.y;
        touchCurrentX = pos.x;
        touchCurrentY = pos.y;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!isTouching) return;
        const pos = getCanvasTouchPos(e);
        touchCurrentX = pos.x;
        touchCurrentY = pos.y;
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        isTouching = false;
    });

// ⭐️ 발사 사운드 이펙트 생성기 (파일 없이 코드로 "뽁!" 소리 만들기)
let audioCtx;
function playShootSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine'; // 둥글고 경쾌한 파형
    osc.frequency.setValueAtTime(400, audioCtx.currentTime); // 시작음
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1); // 끝음 (빠르게 낮아지며 타격감 생성)
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime); // 볼륨 (배경음악 안 가리게 살짝 작게)
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// YouTube API 관련
let ytPlayer;
let isYtReady = false;

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('youtube-audio', {
        height: '0', width: '0', videoId: '7AD6tzBvBzU',
        playerVars: { 'autoplay': 0, 'controls': 0, 'loop': 1, 'playlist': '7AD6tzBvBzU' },
        events: { 'onReady': () => { isYtReady = true; } }
    });
};

window.initMusic = function() {
    if (isYtReady && ytPlayer) {
        ytPlayer.playVideo();
        const bgmBtn = document.getElementById('bgm-init-btn');
        if (bgmBtn) bgmBtn.style.display = 'none'; 
    }
};

window.startGame = function() {
    isPaused = false; 
    UI_TITLE.style.display = 'none'; 
    const bgmBtn = document.getElementById('bgm-init-btn');
    if (bgmBtn) bgmBtn.style.display = 'none';

    // ⭐️ 브라우저 오디오 시스템 시작 (사용자가 클릭했을 때 허용됨)
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    lastTime = Date.now();
    gameLoop(); 

    try {
        if (isYtReady && ytPlayer) {
            ytPlayer.loadPlaylist({
                list: 'PLVZr2XYIG0UDTTogrDKlnBsy759kEwpCc',
                listType: 'playlist'
            });
            ytPlayer.setVolume(30); // 효과음이 잘 들리게 브금 볼륨 살짝 더 낮춤
            
            setTimeout(() => {
                if (typeof ytPlayer.setShuffle === 'function') {
                    ytPlayer.setShuffle(true);
                }
            }, 1000);
        }
    } catch (error) {
        console.error("유튜브 재생 중 에러 발생 (게임은 정상 진행됨):", error);
    }
}

async function displayLeaderboard() {
    const lbDiv = document.getElementById('leaderboard');
    lbDiv.innerHTML = "<h3 style='color: white; text-align:center;'>데이터 불러오는 중... ⏳</h3>";
    
    try {
        const snapshot = await db.collection("womaemon_scores").orderBy("score", "desc").limit(5).get();
        
        if (snapshot.empty) {
            lbDiv.innerHTML = "<h3>🏆 TOP 5 랭커 🏆</h3><p style='text-align:center; color:#ccc;'>아직 등록된 랭커가 없어! 첫 1위를 차지해봐!</p>";
            return;
        }

        let html = "<h3>🏆 TOP 5 랭커 🏆</h3><ol>";
        snapshot.forEach((doc) => {
            const data = doc.data();
            html += `<li>${data.name} : <span style="color:var(--color-glow-green);">${data.score}점</span></li>`;
        });
        html += "</ol>";
        lbDiv.innerHTML = html;
        
    } catch (error) {
        console.error("랭킹 로드 에러:", error);
        lbDiv.innerHTML = "<p style='color: red; text-align:center;'>랭킹 서버와 연결할 수 없습니다 ㅠㅠ</p>";
    }
}

window.saveScore = async function() {
    const nameInput = document.getElementById('player-name').value.trim();
    if(!nameInput) return alert('이름을 입력해줘!');
    
    document.getElementById('name-input-section').style.display = 'none'; 
    const lbDiv = document.getElementById('leaderboard');
    lbDiv.innerHTML = "<h3 style='color: white; text-align:center;'>기록 전송 중... 🚀</h3>";
    
    try {
        await db.collection("womaemon_scores").add({
            name: nameInput,
            score: score,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        displayLeaderboard(); 
    } catch (error) {
        console.error("점수 저장 에러:", error);
        alert("점수 저장에 실패했어! 네트워크를 확인해줘.");
        document.getElementById('name-input-section').style.display = 'flex'; 
        displayLeaderboard();
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
        ctx.fillStyle = 'magenta'; 
        ctx.fillRect(x - width/2, y - height/2, width, height);
    }
}

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
                ...typeInfo, 
                x: ex, y: ey, 
                hp: typeInfo.hp + hpBonus, 
                moveTimer: Math.floor(Math.random() * 60), 
                flipX: false,
                hitTimer: 0 // ⭐️ 피격 리액션용 타이머 추가
            });
        }

        if (Math.random() < 0.01) { 
            let cx = Math.random() < 0.5 ? -40 : canvas.width + 40;
            let cy = Math.random() * canvas.height;
            let cvx = cx < 0 ? 1 : -1; 
            let cvy = (Math.random() - 0.5) * 1;
            enemies.push({ x: cx, y: cy, size: 30, hp: 3, speed: 1.0, type: 'culumon', img: 'culumon', flipX: cvx < 0, vx: cvx, vy: cvy, moveTimer: 0, hitTimer: 0 });
        }
    }
}

function throwPoop() {
    if (enemies.length === 0) return;
    let target = enemies[0];
    let minDist = Infinity;
    enemies.forEach(e => {
        let d = Math.hypot(e.x - player.x, e.y - player.y);
        if(d < minDist) { minDist = d; target = e; }
    });

    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    for(let i = 0; i < weapon.count; i++) {
        const spread = (i - (weapon.count - 1) / 2) * 0.3;
        poops.push({
            x: player.x, y: player.y, startX: player.x, startY: player.y, maxRange: weapon.range,
            size: weapon.size, vx: Math.cos(angle + spread) * weapon.speed, vy: Math.sin(angle + spread) * weapon.speed, 
            damage: weapon.damage, color: '#FF69B4' 
        });
    }
}

window.selectUpgrade = function(type) {
    if (type === 'damage') weapon.damage += 1; 
    if (type === 'speed') weapon.cooldown = Math.max(200, weapon.cooldown - 200); 
    if (type === 'move') player.speed += 0.5; 
    if (type === 'range') weapon.range += 50; 
    if (type === 'count') weapon.count += 1; 
    
    UI_LEVEL_UP.style.display = 'none';
    isPaused = false;
}

function update() {
    if (isGameOver || isPaused) return; 
    frames++;
    updateHUD();

    if (keys.ArrowUp) player.y -= player.speed;
    if (keys.ArrowDown) player.y += player.speed;
    if (keys.ArrowLeft) { player.x -= player.speed; player.flipX = true; }
    if (keys.ArrowRight) { player.x += player.speed; player.flipX = false; }
    if (isTouching) {
        const dx = touchCurrentX - touchStartX;
        const dy = touchCurrentY - touchStartY;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 10) {
            player.x += (dx / dist) * player.speed;
            player.y += (dy / dist) * player.speed;
            
            if (dx < 0) player.flipX = true;
            if (dx > 0) player.flipX = false;
        }
    }
    player.x = Math.max(0, Math.min(canvas.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height, player.y));

    let currentCooldown = player.isGold ? 100 : weapon.cooldown; 
    if (Date.now() - weapon.lastShot > currentCooldown) {
        if (player.isGold) {
            playShootSound(); // ⭐️ 황금똥 발사 소리
            for (let i = 0; i < 8; i++) {
                let angle = (Math.PI / 4) * i;
                poops.push({
                    x: player.x, y: player.y, startX: player.x, startY: player.y, maxRange: weapon.range * 1.5,
                    size: weapon.size + 5, vx: Math.cos(angle) * weapon.speed * 1.5, vy: Math.sin(angle) * weapon.speed * 1.5, 
                    damage: weapon.damage * 3, color: '#FFD700' 
                });
            }
        } else {
            playShootSound(); // ⭐️ 일반똥 발사 소리
            throwPoop(); 
        }
        weapon.lastShot = Date.now();
    }

    for (let i = poops.length - 1; i >= 0; i--) {
        const p = poops[i]; p.x += p.vx; p.y += p.vy;
        if (Math.hypot(p.x - p.startX, p.y - p.startY) > p.maxRange) poops.splice(i, 1);
    }

    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.timer--;
        if (item.timer <= 0) { items.splice(i, 1); continue; }

        if (Math.hypot(item.x - player.x, item.y - player.y) < (player.size/2 + item.size/2)) {
            player.hp = Math.min(player.maxHp, player.hp + 3);
            player.isGold = true;
            player.goldTimer = 600; 
            items.splice(i, 1);
        }
    }

    spawnEnemy();
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.moveTimer++; 
        
        if (e.type === 'culumon') {
            e.x += e.vx; 
            e.y += e.vy;
            e.flipX = e.vx < 0;
            if (e.x < -100 || e.x > canvas.width + 100) { enemies.splice(i, 1); continue; }
        } else {
            const angle = Math.atan2(player.y - e.y, player.x - e.x);
            e.flipX = Math.cos(angle) < 0;

            let currentSpeed = e.speed;

            if (e.name === 'erratic') {
                if (e.moveTimer % 60 > 40) {
                    currentSpeed = 0; 
                }
            }

            e.x += Math.cos(angle) * currentSpeed; 
            e.y += Math.sin(angle) * currentSpeed;
        }

        let isDead = false;
        for (let j = poops.length - 1; j >= 0; j--) {
            const p = poops[j];
            if (Math.hypot(e.x - p.x, e.y - p.y) < (e.size/2 + p.size/2)) {
                let dealtDamage = Math.min(e.hp, p.damage); 
                
                e.hp -= dealtDamage; 
                p.damage -= dealtDamage; 

                // ⭐️ 타격 리액션 1: 맞았을 때 넉백 (투사체가 날아가는 방향으로 몹이 살짝 밀림)
                e.hitTimer = 5; // 5프레임 동안 리액션 작동
                const kbAngle = Math.atan2(p.vy, p.vx);
                e.x += Math.cos(kbAngle) * 8; 
                e.y += Math.sin(kbAngle) * 8;

                if (p.damage <= 0) {
                    poops.splice(j, 1); 
                }

                if (e.hp <= 0) {
                    isDead = true;
                    if (e.type === 'culumon') {
                        items.push({ x: e.x, y: e.y, size: 20, timer: 600 });
                    } else {
                        score++; if(score % 10 === 0) { isPaused = true; UI_LEVEL_UP.style.display = 'flex'; }
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
                    
                    if(isYtReady && ytPlayer) ytPlayer.pauseVideo();
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

    poops.forEach(p => {
        ctx.fillStyle = p.color; 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size/2, 0, Math.PI*2); ctx.fill();
    });

    items.forEach(item => {
        ctx.save();
        ctx.fillStyle = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.shadowColor = "white";
        ctx.beginPath(); ctx.arc(item.x, item.y, item.size/2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    });

    enemies.forEach(e => {
        // ⭐️ 타격 리액션 2: 맞았을 때 순간적으로 깜빡임
        if (e.hitTimer > 0) {
            e.hitTimer--;
            ctx.globalAlpha = 0.4; // 이미지를 반투명하게 만듦
        }

        if (images[e.img]) drawSprite(e.img, e.x, e.y, e.size, e.size, e.flipX);
        else { ctx.fillStyle = e.color; ctx.fillRect(e.x-15, e.y-15, e.size, e.size); }
        
        ctx.globalAlpha = 1.0; // 원상복구
    });

    if (player.isGold) {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = "gold"; 
        drawSprite('player', player.x, player.y, player.size, player.size, player.flipX);
        ctx.restore();
    } else if (player.invincibilityTimer % 10 < 5) {
        drawSprite('player', player.x, player.y, player.size, player.size, player.flipX);
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
        update(); 
        draw();
    }
}
draw();
