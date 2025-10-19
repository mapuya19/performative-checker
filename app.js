(() => {
  const banner = document.getElementById('banner');
  const bannerText = document.getElementById('bannerText');
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const toastsEl = document.getElementById('toasts');
  const switchCameraBtn = document.getElementById('switchCameraBtn');
  const toggleBoxesBtn = document.getElementById('toggleBoxesBtn');

  let model = null;
  let stream = null;
  let rafId = null;
  let isPerformativeState = false;
  let consecutiveDrinkFrames = 0;
  let consecutiveNoDrinkFrames = 0;
  let currentFacingMode = 'environment'; // prefer rear camera on mobile
  let showBoxes = false;

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const DRINK_CLASSES = new Set([
    'cup', // many drink containers
    'bottle', // water bottle, etc.
    'wine glass',
  ]);

  const DRINK_KEYWORDS = ['cup', 'bottle', 'glass', 'wine'];

  // Detection tuning
  let settings = {
    enterScore: 0.35,
    exitScore: 0.30,
    framesEnter: 4,
    framesExit: 6,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem('performative-settings');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      settings = {
        enterScore: typeof parsed.enterScore === 'number' ? parsed.enterScore : settings.enterScore,
        exitScore: typeof parsed.exitScore === 'number' ? parsed.exitScore : settings.exitScore,
        framesEnter: Number.isInteger(parsed.framesEnter) ? parsed.framesEnter : settings.framesEnter,
        framesExit: Number.isInteger(parsed.framesExit) ? parsed.framesExit : settings.framesExit,
      };
    } catch (_) {}
  }

  function saveSettings() {
    try { localStorage.setItem('performative-settings', JSON.stringify(settings)); } catch (_) {}
  }

  function isDrinkPrediction(pred) {
    const label = (pred.class || pred.label || '').toLowerCase();
    if (DRINK_CLASSES.has(label)) return true;
    return DRINK_KEYWORDS.some(k => label.includes(k));
  }

  function setBanner(isPerformative) {
    const performative = Boolean(isPerformative);
    banner.classList.toggle('banner--performative', performative);
    banner.classList.toggle('banner--nonperformative', !performative);
    bannerText.textContent = performative ? 'Performative' : 'Non‑performative';
  }

  function sizeCanvasToVideo() {
    const rect = video.getBoundingClientRect();
    overlay.width = rect.width * DPR;
    overlay.height = rect.height * DPR;
  }

  function drawDetections(predictions) {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!predictions || !predictions.length) return;

    const scaleX = overlay.width / video.videoWidth;
    const scaleY = overlay.height / video.videoHeight;

    for (const p of predictions) {
      const [x, y, w, h] = p.bbox || p.boundingBox || [];
      if ([x, y, w, h].some(v => typeof v !== 'number')) continue;

      const sx = x * scaleX;
      const sy = y * scaleY;
      const sw = w * scaleX;
      const sh = h * scaleY;

      // box
      const ctx2 = ctx;
      ctx2.save();
      ctx2.strokeStyle = '#ffce33';
      ctx2.lineWidth = 3 * DPR;
      ctx2.strokeRect(sx, sy, sw, sh);
      ctx2.restore();

      // label
      const label = `${p.class || p.label} ${(p.score ? Math.round(p.score * 100) : 0)}%`;
      ctx2.save();
      ctx2.font = `${12 * DPR}px Inter, system-ui, sans-serif`;
      const tw = ctx2.measureText(label).width + 10 * DPR;
      const th = 18 * DPR;
      ctx2.fillStyle = 'rgba(20,20,32,0.9)';
      ctx2.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx2.lineWidth = 1;
      ctx2.beginPath();
      ctx2.roundRect(sx, Math.max(0, sy - th - 4 * DPR), tw, th, 6 * DPR);
      ctx2.fill();
      ctx2.stroke();
      ctx2.fillStyle = '#eaeaf2';
      ctx2.fillText(label, sx + 5 * DPR, Math.max(12 * DPR, sy - 6 * DPR));
      ctx2.restore();
    }
  }

  // Toast utility
  function showToast(message, kind = 'info', ttlMs = 4000) {
    if (!toastsEl) return;
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.textContent = String(message);
    toastsEl.appendChild(el);
    const t = setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ttlMs);
    el.addEventListener('click', () => {
      clearTimeout(t);
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  async function detectLoop() {
    if (!model || video.readyState < 2) {
      rafId = requestAnimationFrame(detectLoop);
      return;
    }
    try {
      const predictions = await model.detect(video);
      // Use hysteresis thresholds from settings
      const threshold = isPerformativeState ? settings.exitScore : settings.enterScore;
      const drinkPreds = predictions.filter(p => isDrinkPrediction(p) && (p.score || 0) >= threshold);
      if (showBoxes) {
        drawDetections(drinkPreds);
      } else {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }

      const hasDrinkThisFrame = drinkPreds.length > 0;
      if (hasDrinkThisFrame) {
        consecutiveDrinkFrames += 1;
        consecutiveNoDrinkFrames = 0;
      } else {
        consecutiveNoDrinkFrames += 1;
        consecutiveDrinkFrames = 0;
      }

      if (!isPerformativeState && consecutiveDrinkFrames >= settings.framesEnter) {
        isPerformativeState = true;
        setBanner(true);
      } else if (isPerformativeState && consecutiveNoDrinkFrames >= settings.framesExit) {
        isPerformativeState = false;
        setBanner(false);
      }
    } catch (err) {
      // non-fatal: keep UI usable
      console.error(err);
    } finally {
      rafId = requestAnimationFrame(detectLoop);
    }
  }

  async function startCamera() {
    startBtn.disabled = true;
    // Acquire camera first; only alert on camera errors
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
    } catch (err) {
      console.error('getUserMedia error:', err);
      alert('Could not access camera. Please allow permissions and use HTTPS or localhost.');
      startBtn.disabled = false;
      return;
    }

    try {
      video.srcObject = stream;
      await video.play();
      sizeCanvasToVideo();
    } catch (err) {
      console.error('Video playback error:', err);
    }

    // Load model (do not alert on failure; keep camera running)
    if (!model) {
      bannerText.textContent = 'Loading model…';
      try {
        if (tf.getBackend() !== 'webgl') {
          await tf.setBackend('webgl');
        }
        await tf.ready();
      } catch (e) {
        console.warn('TF backend selection issue:', e);
        showToast('Running without WebGL acceleration', 'info');
      }
      try {
        model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      } catch (e) {
        console.error('Model load failed:', e);
        bannerText.textContent = 'Model unavailable';
        showToast(`Object detection model unavailable: ${e && e.message ? e.message : 'see console'}`, 'error');
      }
      if (model) {
        try { await model.detect(video); } catch (_) {}
      }
    }

    isPerformativeState = false;
    consecutiveDrinkFrames = 0;
    consecutiveNoDrinkFrames = 0;
    setBanner(false);
    if (model) detectLoop();
    stopBtn.disabled = false;
  }

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    video.srcObject = null;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    setBanner(false);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  // Settings UI wiring
  function initSettingsUI() {
    loadSettings();
    const enterEl = document.getElementById('enterThreshold');
    const exitEl = document.getElementById('exitThreshold');
    const enterVal = document.getElementById('enterThresholdValue');
    const exitVal = document.getElementById('exitThresholdValue');
    const framesEnterEl = document.getElementById('framesEnter');
    const framesExitEl = document.getElementById('framesExit');
    const resetBtn = document.getElementById('resetSettings');
    const toggleBtn = document.getElementById('toggleSettings');
    const body = document.getElementById('settingsBody');

    function syncUI() {
      enterEl.value = String(settings.enterScore);
      exitEl.value = String(settings.exitScore);
      enterVal.textContent = Number(settings.enterScore).toFixed(2);
      exitVal.textContent = Number(settings.exitScore).toFixed(2);
      framesEnterEl.value = String(settings.framesEnter);
      framesExitEl.value = String(settings.framesExit);
    }

    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

    enterEl.addEventListener('input', () => {
      const v = parseFloat(enterEl.value);
      settings.enterScore = clamp(isNaN(v) ? settings.enterScore : v, 0.05, 0.99);
      enterVal.textContent = settings.enterScore.toFixed(2);
      // keep hysteresis: ensure exit < enter
      if (settings.exitScore >= settings.enterScore) {
        settings.exitScore = Math.max(0.01, settings.enterScore - 0.05);
        exitEl.value = String(settings.exitScore);
        exitVal.textContent = settings.exitScore.toFixed(2);
      }
      saveSettings();
    });
    exitEl.addEventListener('input', () => {
      const v = parseFloat(exitEl.value);
      settings.exitScore = clamp(isNaN(v) ? settings.exitScore : v, 0.01, settings.enterScore - 0.01);
      exitVal.textContent = settings.exitScore.toFixed(2);
      saveSettings();
    });
    framesEnterEl.addEventListener('change', () => {
      const v = parseInt(framesEnterEl.value, 10);
      settings.framesEnter = clamp(isNaN(v) ? settings.framesEnter : v, 1, 60);
      saveSettings();
      consecutiveDrinkFrames = 0; // prevent stale state
    });
    framesExitEl.addEventListener('change', () => {
      const v = parseInt(framesExitEl.value, 10);
      settings.framesExit = clamp(isNaN(v) ? settings.framesExit : v, 1, 120);
      saveSettings();
      consecutiveNoDrinkFrames = 0;
    });
    resetBtn.addEventListener('click', () => {
      settings = { enterScore: 0.35, exitScore: 0.30, framesEnter: 4, framesExit: 6 };
      saveSettings();
      syncUI();
      consecutiveDrinkFrames = 0;
      consecutiveNoDrinkFrames = 0;
    });
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const next = !expanded;
      toggleBtn.setAttribute('aria-expanded', String(next));
      toggleBtn.textContent = next ? 'Hide' : 'Show';
      body.style.display = next ? 'block' : 'none';
    });
    body.style.display = 'block';
    syncUI();
  }

  window.addEventListener('resize', sizeCanvasToVideo);
  startBtn.addEventListener('click', startCamera);
  stopBtn.addEventListener('click', stopCamera);
  if (switchCameraBtn) {
    switchCameraBtn.addEventListener('click', async () => {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      // Restart stream with the new facing mode
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      await startCamera();
    });
  }
  if (toggleBoxesBtn) {
    toggleBoxesBtn.addEventListener('click', () => {
      showBoxes = !showBoxes;
      toggleBoxesBtn.textContent = `Boxes: ${showBoxes ? 'On' : 'Off'}`;
      if (!showBoxes) {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    });
  }
  initSettingsUI();

  // Pause detection when tab hidden (saves battery on mobile)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId), rafId = null;
    } else if (model && video.readyState >= 2) {
      rafId = requestAnimationFrame(detectLoop);
    }
  });
})();


