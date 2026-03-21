// Firebase 초기화 설정
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

// -----------------------------------------------------

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
loadImage('data', 'Title.png'); 

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

// ⭐️ YouTube API 초기화 설정
let ytPlayer;
let isYtReady = false;

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('youtube-audio', {
        height: '0',
        width: '0',
        videoId: '7AD6tzBvBzU', // 타이틀 화면 단일 영상 ID
        playerVars: {
            'autoplay': 0, // 0으로 두고 아래 클릭 이벤트로 재생
            'controls': 0,
            'disablekb': 1,
            'loop': 1,
            'playlist': '7AD6tzBvBzU' // 단일 영상 루프 필수 설정
        },
        events: {
            'onReady': () => { isYtReady = true; }
        }
    });
};

// ⭐️ 화면 첫 클릭 시 타이틀 음악 재생 시도 (브라우저 정책 우회)
window.addEventListener('click', () => {
    if (isYtReady && isPaused && UI_TITLE.style.display !== 'none') {
        ytPlayer.playVideo();
    }
}, { once: true });


window.startGame = function() {
    isPaused = false; 
    UI_TITLE.style.display = 'none'; 

    // ⭐️ 게임 시작 시 플레이리스트로 교체 및 셔플 적용
    if (isYtReady && ytPlayer) {
        ytPlayer.loadPlaylist({
            list: 'PLVZr2XYIG0UDTTogrDKlnBsy759kEwpCc', // 요청하신 플레이리스트 ID
            listType: 'playlist'
        });
        ytPlayer.setVolume(40); // 게임 효과음을 위해 볼륨 살짝 낮춤
        ytPlayer.setShuffle(true); // 랜덤 재생
    }

    gameLoop(); 
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
    const difficultyTier = Math.floor(frames / DIFFICULTY_FRAME_INTERVAL);
    let spawnCount = 1 + Math.floor(difficultyTier / 3); 
    const spawnRate = Math.max(20, 100 - Math.floor(difficultyTier * 2)); 

    let hpBonus = Math.floor(score / 15);

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
                flipX: false 
            });
        }

        if (Math.random() < 0.01) { 
            let cx = Math.random() < 0.5 ? -40 : canvas.width + 40;
            let cy = Math.random() * canvas.height;
            let cvx = cx < 0 ? 1 : -1; 
            let cvy = (Math.random() - 0.5) * 1;
            enemies.push({ x: cx, y: cy, size: 30, hp: 3, speed: 1.0, type: 'culumon', img: 'culumon', flipX: cvx < 0, vx: cvx, vy: cvy, moveTimer: 0 });
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
    
    player.x = Math.max(0, Math.min(canvas.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height, player.y));

    let currentCooldown = player.isGold ? 100 : weapon.cooldown; 
    if (Date.now() - weapon.lastShot > currentCooldown) {
        if (player.isGold) {
            for (let i = 0; i < 8; i++) {
                let angle = (Math.PI / 4) * i;
                poops.push({
                    x: player.x, y: player.y, startX: player.x, startY: player.y, maxRange: weapon.range * 1.5,
                    size: weapon.size + 5, vx: Math.cos(angle) * weapon.speed * 1.5, vy: Math.sin(angle) * weapon.speed * 1.5, 
                    damage: weapon.damage * 3, color: '#FFD700' 
                });
            }
        } else {
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

            if (e.name === 'speed') {
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
                    
                    // 게임 오버 시 랭킹보드 불러오고 음악 정지
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
        if (images[e.img]) drawSprite(e.img, e.x, e.y, e.size, e.size, e.flipX);
        else { ctx.fillStyle = e.color; ctx.fillRect(e.x-15, e.y-15, e.size, e.size); }
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

function gameLoop() {
    update(); draw();
    if(!isGameOver) requestAnimationFrame(gameLoop);
}
draw();
