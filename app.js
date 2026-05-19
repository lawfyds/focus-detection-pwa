const CONFIG = {
    earThreshold: 0.18,
    earConsecutiveFrames: 2,
    normalBlinkMaxFrames: 3,
    headLookUpThreshold: 0.3,
    headLookDownThreshold: 0.7,
    headTurnLeftThreshold: 0.4,
    headTurnRightThreshold: 0.6,
    headOffsetHigh: 0.6,
    headOffsetMedium: 0.5,
    headOffsetLow: 0.4,
    headOffsetPenaltyHigh: 15,
    headOffsetPenaltyMedium: 8,
    headOffsetPenaltyLow: 3,
    headTiltPenalty: 5,
    headTurnNoPenaltyFrames: 15,
    headTurnPenaltyPerFrame: 0.2,
    headTurnMaxPenalty: 10,
    gazeLeft: 0.2,
    gazeRight: 0.8,
    gazeUp: 0.3,
    gazeDown: 0.7,
    gazePenalty: 0,
    mouthDurationThreshold: 5,
    mouthPenaltyPerFrame: 1,
    mouthMaxPenalty: 10,
    mildEyeClosePerFrame: 1.5,
    severeEyeClosePerFrame: 2.5,
    eyeCloseMildThreshold: 12,
    faceNotDetectedPenalty: 50,
    stabilityHigh: 100,
    stabilityMedium: 60,
    stabilityLow: 30,
    stabilityBonusHigh: 10,
    stabilityBonusMed: 6,
    stabilityBonusLow: 3,
    compoundThreshold: 2,
    compoundModerate: 5,
    compoundStrong: 10,
    focusHigh: 80,
    focusMedium: 60,
    focusLow: 40,
    smoothAlpha: 0.5,
    gazeChangeThreshold: 0.15,
    gazeChangePenalty: 0.2,
    noFaceDropPerFrame: 1,
    lowScoreAlertThreshold: 30,
    lowScoreAlertFrames: 60,
    alertFlashDuration: 300
};

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function calculateEAR(lm, idx) {
    const v = dist(lm[idx[1]], lm[idx[5]]);
    const h = dist(lm[idx[0]], lm[idx[2]]);
    return h > 0 ? v / h : 0;
}

function calculateHeadPose(lm, w, h) {
    const lx = lm[234].x * w, rx = lm[454].x * w, nx = lm[1].x * w;
    const ey = ((lm[33].y + lm[263].y) / 2) * h;
    const ny = lm[1].y * h, cy = lm[152].y * h;
    const fw = Math.abs(rx - lx);
    const fh = Math.abs(cy - ey);
    return {
        xRatio: fw > 0 ? (nx - lx) / fw : 0.5,
        yRatio: fh > 0 ? (ny - ey) / fh : 0.5,
        faceWidth: fw
    };
}

function calculateGaze(lm, w, h) {
    const li = lm[133], lo = lm[33], ri = lm[362], ro = lm[263];
    const lp = lm[468], rp = lm[473];
    const lt1 = lm[159], lt2 = lm[160], rt1 = lm[386], rt2 = lm[385];
    const lb1 = lm[145], lb2 = lm[154], rb1 = lm[374], rb2 = lm[380];

    const lw = Math.abs(lo.x - li.x), rw = Math.abs(ro.x - ri.x);
    const lh = Math.abs(((lb1.y + lb2.y) / 2) - ((lt1.y + lt2.y) / 2));
    const rh = Math.abs(((rb1.y + rb2.y) / 2) - ((rt1.y + rt2.y) / 2));

    const gx = ((lw > 0 ? (lp.x - li.x) / lw : 0.5) + (rw > 0 ? (rp.x - ri.x) / rw : 0.5)) / 2;
    const gy = ((lh > 0 ? (lp.y - (lt1.y + lt2.y) / 2) / lh : 0.5) +
                (rh > 0 ? (rp.y - (rt1.y + rt2.y) / 2) / rh : 0.5)) / 2;

    let hDir = gx < CONFIG.gazeLeft ? '向左' : gx > CONFIG.gazeRight ? '向右' : '向前';
    let vDir = gy < CONFIG.gazeUp ? '向上' : gy > CONFIG.gazeDown ? '向下' : '';

    let dir;
    if (vDir && hDir !== '向前') dir = vDir + hDir;
    else if (vDir) dir = vDir + '看';
    else dir = hDir + '看';

    return { direction: dir, gx, gy };
}

function detectMouth(lm, w, h) {
    const innerH = Math.abs(lm[14].y - lm[13].y) * h;
    const outerTop = [57, 13, 49, 181, 62].reduce((s, i) => s + lm[i].y, 0) / 5;
    const outerBot = [287, 14, 40, 175, 314].reduce((s, i) => s + lm[i].y, 0) / 5;
    const outerH = Math.abs(outerBot - outerTop) * h;
    const width = (Math.abs(lm[308].x - lm[78].x) + Math.abs(lm[291].x - lm[61].x)) / 2 * w;
    const ir = width > 0 ? innerH / width : 0;
    const or2 = width > 0 ? outerH / width : 0;
    return { open: ir > 0.22 || or2 > 0.30, ir, or: or2 };
}

function calculateFocusScore(opts) {
    const {
        headOffset, eyeCloseDur, headTurnDur, faceDetected,
        stableFrames, gazeDir, headStatus, mouthOpen, mouthDur
    } = opts;
    let s = 100;

    if (!faceDetected) return Math.max(0, s - CONFIG.faceNotDetectedPenalty);

    if (headOffset > CONFIG.headOffsetHigh) s -= CONFIG.headOffsetPenaltyHigh;
    else if (headOffset > CONFIG.headOffsetMedium) s -= CONFIG.headOffsetPenaltyMedium;
    else if (headOffset > CONFIG.headOffsetLow) s -= CONFIG.headOffsetPenaltyLow;

    if (headTurnDur > CONFIG.headTurnNoPenaltyFrames) {
        s -= Math.min(CONFIG.headTurnMaxPenalty,
            (headTurnDur - CONFIG.headTurnNoPenaltyFrames) * CONFIG.headTurnPenaltyPerFrame);
    }
    if (headStatus === '低头' || headStatus === '抬头') s -= CONFIG.headTiltPenalty;

    if (eyeCloseDur > CONFIG.normalBlinkMaxFrames) {
        if (eyeCloseDur <= CONFIG.eyeCloseMildThreshold) {
            s -= (eyeCloseDur - CONFIG.normalBlinkMaxFrames) * CONFIG.mildEyeClosePerFrame;
        } else {
            const mild = CONFIG.eyeCloseMildThreshold - CONFIG.normalBlinkMaxFrames;
            const severe = eyeCloseDur - CONFIG.eyeCloseMildThreshold;
            s -= mild * CONFIG.mildEyeClosePerFrame + severe * CONFIG.severeEyeClosePerFrame;
        }
    }

    if (mouthOpen && mouthDur > CONFIG.mouthDurationThreshold) {
        s -= Math.min(CONFIG.mouthMaxPenalty,
            (mouthDur - CONFIG.mouthDurationThreshold) * CONFIG.mouthPenaltyPerFrame);
    }

    if (gazeDir && gazeDir !== '向前看') s -= CONFIG.gazePenalty;

    if (stableFrames > CONFIG.stabilityHigh) s += CONFIG.stabilityBonusHigh;
    else if (stableFrames > CONFIG.stabilityMedium) s += CONFIG.stabilityBonusMed;
    else if (stableFrames > CONFIG.stabilityLow) s += CONFIG.stabilityBonusLow;

    let abnormal = 0;
    if (eyeCloseDur > CONFIG.normalBlinkMaxFrames) abnormal++;
    if (headTurnDur > CONFIG.headTurnNoPenaltyFrames) abnormal++;
    if (mouthOpen && mouthDur > CONFIG.mouthDurationThreshold) abnormal++;

    if (abnormal >= 3) s -= CONFIG.compoundStrong;
    else if (abnormal >= CONFIG.compoundThreshold) s -= CONFIG.compoundModerate;

    return Math.max(0, Math.min(100, Math.round(s)));
}

class LandmarkSmoother {
    constructor(alpha) { this.alpha = alpha; this.prev = null; }
    smooth(lm) {
        if (!this.prev) { this.prev = lm.map(p => ({ x: p.x, y: p.y, z: p.z })); return lm; }
        const out = lm.map((p, i) => {
            const o = this.prev[i];
            return { x: this.alpha * p.x + (1 - this.alpha) * o.x, y: this.alpha * p.y + (1 - this.alpha) * o.y, z: this.alpha * p.z + (1 - this.alpha) * o.z };
        });
        this.prev = out;
        return out;
    }
    reset() { this.prev = null; }
}

class BlinkDetector {
    constructor() {
        this.history = [];
        this.state = 'open';
        this.closeCount = 0;
        this.blinkCount = 0;
        this.lastBlink = 0;
    }
    update(ear, detected) {
        const now = performance.now() / 1000;
        this.history.push(ear);
        if (this.history.length > 5) this.history.shift();
        let blinked = false;

        if (!detected) {
            this.closeCount++;
            if (this.closeCount >= 5) this.state = 'closed';
        } else {
            const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
            const closed = ear < CONFIG.earThreshold || ear < avg - 0.04;
            if (closed) {
                this.closeCount++;
                if (this.closeCount >= 1) this.state = 'closed';
            } else {
                if (this.state === 'closed' && this.closeCount >= 1 && this.closeCount <= 15) {
                    if (now - this.lastBlink > 0.15) { blinked = true; this.blinkCount++; this.lastBlink = now; }
                }
                this.closeCount = 0;
                this.state = 'open';
            }
        }
        return { blinked, eyeStatus: this.state === 'closed' ? '闭合' : '睁开' };
    }
}

class FocusApp {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.canvas = document.getElementById('overlayCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.smoother = new LandmarkSmoother(CONFIG.smoothAlpha);
        this.blinkDetector = new BlinkDetector();

        this.focusScore = 70;
        this.stableFrames = 0;
        this.eyeCloseDuration = 0;
        this.headTurnDuration = 0;
        this.mouthOpenDuration = 0;
        this.gazeDirection = '向前看';
        this.headStatus = '居中';
        this.eyeStatus = '睁开';
        this.mouthOpen = false;
        this.prevGaze = null;
        this.abnormalGaze = false;

        this.focusHistory = [];
        this.sessionStart = performance.now();
        this.focusDuration = 0;
        this.distractCount = 0;
        this.lastUpdate = performance.now();

        this.fpsFrames = 0;
        this.fpsTime = performance.now();
        this.fps = 0;

        this.faceMesh = null;

        this.noFaceFrames = 0;
        this.lowScoreFrames = 0;
        this.alertActive = false;
        this.alertFlashInterval = null;
    }

    async init() {
        const loadingText = document.getElementById('loadingText');
        loadingText.textContent = '正在初始化摄像头...';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            this.video.srcObject = stream;
            await new Promise(r => { this.video.onloadedmetadata = r; });
            await this.video.play();
        } catch (e) {
            loadingText.textContent = '摄像头访问失败: ' + e.message;
            return;
        }

        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        loadingText.textContent = '正在加载人脸检测模型...';

        this.faceMesh = new FaceMesh({
            locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        this.faceMesh.onResults(r => this.onResults(r));

        const camera = new Camera(this.video, {
            onFrame: async () => { await this.faceMesh.send({ image: this.video }); },
            width: 640,
            height: 480
        });

        loadingText.textContent = '启动中...';
        await camera.start();

        document.getElementById('loadingOverlay').classList.add('hidden');
        this.loop();
    }

    onResults(results) {
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        this.fpsFrames++;
        const now = performance.now();
        if (now - this.fpsTime >= 1000) {
            this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsTime));
            this.fpsFrames = 0;
            this.fpsTime = now;
        }

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            this.noFaceFrames++;
            this.stableFrames = Math.max(0, this.stableFrames - 5);
            this.eyeCloseDuration = 0;
            this.headTurnDuration = 0;
            this.mouthOpenDuration = 0;
            this.gazeDirection = '向前看';
            this.headStatus = '居中';
            this.eyeStatus = '睁开';
            this.mouthOpen = false;
            this.updateScore(false);
            return;
        }

        this.noFaceFrames = 0;

        this.stableFrames++;
        const lm = this.smoother.smooth(results.multiFaceLandmarks[0]);

        this.drawMesh(lm, w, h);

        const hp = calculateHeadPose(lm, w, h);
        const headXOff = Math.abs(hp.xRatio - 0.5) * 2;
        const headYOff = Math.abs(hp.yRatio - 0.5) * 2;
        const headOffset = Math.max(headXOff, headYOff);

        if (hp.yRatio < CONFIG.headLookUpThreshold) { this.headStatus = '抬头'; this.headTurnDuration++; }
        else if (hp.yRatio > CONFIG.headLookDownThreshold) { this.headStatus = '低头'; this.headTurnDuration++; }
        else if (hp.xRatio < CONFIG.headTurnLeftThreshold) { this.headStatus = '向左转'; this.headTurnDuration++; }
        else if (hp.xRatio > CONFIG.headTurnRightThreshold) { this.headStatus = '向右转'; this.headTurnDuration++; }
        else { this.headStatus = '居中'; this.headTurnDuration = 0; }

        const leftEAR = calculateEAR(lm, LEFT_EYE);
        const rightEAR = calculateEAR(lm, RIGHT_EYE);
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (avgEAR < CONFIG.earThreshold) {
            this.eyeCloseDuration++;
            if (this.eyeCloseDuration >= CONFIG.earConsecutiveFrames) this.eyeStatus = '闭合';
        } else {
            if (this.eyeCloseDuration >= CONFIG.earConsecutiveFrames) {
                const blinkResult = this.blinkDetector.update(avgEAR, true);
            } else {
                this.blinkDetector.update(avgEAR, true);
            }
            this.eyeCloseDuration = 0;
            this.eyeStatus = '睁开';
        }

        const gz = calculateGaze(lm, w, h);
        this.gazeDirection = gz.direction;

        if (this.prevGaze) {
            const dx = Math.abs(gz.gx - this.prevGaze.gx);
            const dy = Math.abs(gz.gy - this.prevGaze.gy);
            this.abnormalGaze = dx > CONFIG.gazeChangeThreshold || dy > CONFIG.gazeChangeThreshold;
        }
        this.prevGaze = { gx: gz.gx, gy: gz.gy };

        const md = detectMouth(lm, w, h);
        this.mouthOpen = md.open;
        if (md.open) this.mouthOpenDuration++;
        else this.mouthOpenDuration = 0;

        this.currentHeadOffset = headOffset;
        this.updateScore(true);
    }

    updateScore(faceDetected) {
        let newScore;

        if (!faceDetected) {
            newScore = Math.max(0, this.focusScore - CONFIG.noFaceDropPerFrame);
        } else {
            const raw = calculateFocusScore({
                headOffset: this.currentHeadOffset || 0,
                eyeCloseDur: this.eyeCloseDuration,
                headTurnDur: this.headTurnDuration,
                faceDetected: faceDetected,
                stableFrames: this.stableFrames,
                gazeDir: this.gazeDirection,
                headStatus: this.headStatus,
                mouthOpen: this.mouthOpen,
                mouthDur: this.mouthOpenDuration
            });
            newScore = Math.round(CONFIG.smoothAlpha * raw + (1 - CONFIG.smoothAlpha) * this.focusScore);
        }

        this.focusScore = Math.max(0, Math.min(100, newScore));

        this.focusHistory.push(this.focusScore);
        if (this.focusHistory.length > 100) this.focusHistory.shift();

        const dt = (performance.now() - this.lastUpdate) / 1000;
        this.lastUpdate = performance.now();
        if (this.focusScore >= 60) this.focusDuration += dt;
        else this.distractCount++;

        this.handleAlert();

        this.updateUI();
    }

    handleAlert() {
        if (this.focusScore < CONFIG.lowScoreAlertThreshold) {
            this.lowScoreFrames++;
            if (this.lowScoreFrames >= CONFIG.lowScoreAlertFrames && !this.alertActive) {
                this.startAlert();
            }
        } else {
            this.lowScoreFrames = 0;
            if (this.alertActive) {
                this.stopAlert();
            }
        }
    }

    startAlert() {
        this.alertActive = true;
        let flashOn = false;
        this.alertFlashInterval = setInterval(() => {
            flashOn = !flashOn;
            if (flashOn) {
                document.body.style.boxShadow = 'inset 0 0 100px rgba(255, 23, 68, 0.6)';
            } else {
                document.body.style.boxShadow = 'none';
            }
        }, CONFIG.alertFlashDuration);
    }

    stopAlert() {
        this.alertActive = false;
        if (this.alertFlashInterval) {
            clearInterval(this.alertFlashInterval);
            this.alertFlashInterval = null;
        }
        document.body.style.boxShadow = 'none';
    }

    drawMesh(lm, w, h) {
        const ctx = this.ctx;
        const pts = lm.map(p => ({ x: p.x * w, y: p.y * h }));

        ctx.fillStyle = 'rgba(0,255,0,0.6)';
        for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const x1 = Math.min(...xs), y1 = Math.min(...ys);
        const x2 = Math.max(...xs), y2 = Math.max(...ys);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        const drawDot = (idx, color, r) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(pts[idx].x, pts[idx].y, r, 0, Math.PI * 2);
            ctx.fill();
        };
        drawDot(1, '#ffff00', 4);
        drawDot(33, '#00aaff', 3);
        drawDot(263, '#00aaff', 3);
    }

    updateUI() {
        const s = this.focusScore;
        const arc = document.getElementById('scoreArc');
        const circumference = 2 * Math.PI * 30;
        const offset = circumference * (1 - s / 100);
        arc.style.strokeDashoffset = offset;

        let color;
        if (s >= CONFIG.focusHigh) color = '#00e676';
        else if (s >= CONFIG.focusLow) color = '#ffeb3b';
        else color = '#ff1744';
        arc.style.stroke = color;

        document.getElementById('scoreValue').textContent = s;
        document.getElementById('scoreValue').style.color = color;

        let eval2, evalColor;
        if (s >= CONFIG.focusHigh) { eval2 = '高度专注'; evalColor = '#00e676'; }
        else if (s >= CONFIG.focusMedium) { eval2 = '一般专注'; evalColor = '#ffeb3b'; }
        else if (s >= CONFIG.focusLow) { eval2 = '轻度分心'; evalColor = '#ff9800'; }
        else { eval2 = '严重分心'; evalColor = '#ff1744'; }

        const evalEl = document.getElementById('evaluationText');
        evalEl.textContent = eval2;
        evalEl.style.color = evalColor;

        document.getElementById('tagEye').textContent = '眼睛: ' + this.eyeStatus;
        document.getElementById('tagHead').textContent = '头部: ' + this.headStatus;
        document.getElementById('tagMouth').textContent = '嘴部: ' + (this.mouthOpen ? '张开' : '闭合');
        document.getElementById('tagGaze').textContent = '视线: ' + this.gazeDirection;

        document.getElementById('blinkCount').textContent = this.blinkDetector.blinkCount;
        document.getElementById('fpsBadge').textContent = this.fps + ' FPS';

        const elapsed = ((performance.now() - this.sessionStart) / 1000) | 0;
        const m = (elapsed / 60) | 0, sec = elapsed % 60;
        document.getElementById('elapsed').textContent = m > 0 ? m + 'm' + sec + 's' : sec + 's';

        const totalTime = (performance.now() - this.sessionStart) / 1000;
        const ratio = totalTime > 0 ? Math.round(this.focusDuration / totalTime * 100) : 0;
        document.getElementById('focusRatio').textContent = ratio + '%';

        this.drawTrend();
    }

    drawTrend() {
        const canvas = document.getElementById('trendCanvas');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const cw = rect.width, ch = rect.height;

        ctx.clearRect(0, 0, cw, ch);
        const data = this.focusHistory;
        if (data.length < 2) return;

        for (let i = 1; i < data.length; i++) {
            const x1 = (i - 1) / (data.length - 1) * cw;
            const x2 = i / (data.length - 1) * cw;
            const y1 = ch - (data[i - 1] / 100) * ch;
            const y2 = ch - (data[i] / 100) * ch;

            if (data[i] >= CONFIG.focusHigh) ctx.strokeStyle = '#00e676';
            else if (data[i] >= CONFIG.focusLow) ctx.strokeStyle = '#ffeb3b';
            else ctx.strokeStyle = '#ff1744';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        const thresholds = [CONFIG.focusHigh, CONFIG.focusMedium, CONFIG.focusLow];
        for (const t of thresholds) {
            const y = ch - (t / 100) * ch;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(cw, y);
            ctx.stroke();
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop());
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const app = new FocusApp();
app.init();
