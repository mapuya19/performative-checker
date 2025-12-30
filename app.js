(() => {
  // ============================================
  // DOM REFERENCES
  // ============================================
  const banner = document.getElementById('banner');
  const bannerText = document.getElementById('bannerText');
  const bannerStatus = document.getElementById('bannerStatus');
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const toastsEl = document.getElementById('toasts');
  const switchCameraBtn = document.getElementById('switchCameraBtn');
  const toggleBoxesBtn = document.getElementById('toggleBoxesBtn');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const videoWrap = document.getElementById('videoWrap');
  const particlesContainer = document.getElementById('particles');
  const cameraSection = document.getElementById('cameraSection');
  const settingsSection = document.getElementById('settingsSection');
  const controlsEl = document.getElementById('controls');

  // ============================================
  // STATE
  // ============================================
  let model = null;
  let stream = null;
  let rafId = null;
  let isPerformativeState = false;
  let consecutiveDrinkFrames = 0;
  let consecutiveNoDrinkFrames = 0;
  let currentFacingMode = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'user' : 'environment';
  let showBoxes = false;
  let lastDetectionTime = 0;
  let hasAnimatedIn = false;

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // ============================================
  // DETECTION CLASSES
  // ============================================
  const DRINK_CLASSES = new Set(['cup', 'wine glass']);
  const BOOK_CLASSES = new Set(['book']);
  const DRINK_KEYWORDS = ['cup', 'glass', 'wine'];
  const TIN_KEYWORDS = ['tin', 'can', 'matcha'];

  const CLASS_MIN_SCORE = {
    'cup': 0.25,
    'wine glass': 0.35,
    'book': 0.4,
  };

  let settings = {
    enterScore: 0.35,
    exitScore: 0.30,
    framesEnter: 4,
    framesExit: 6,
  };

  // ============================================
  // GSAP ANIMATIONS SETUP
  // ============================================
  
  // Check if GSAP is available
  function isGsapAvailable() {
    return typeof gsap !== 'undefined';
  }

  // Page load animation timeline
  function initPageAnimations() {
    if (hasAnimatedIn) return;
    hasAnimatedIn = true;

    // Fallback if GSAP isn't loaded
    if (!isGsapAvailable()) {
      console.warn('GSAP not available, using CSS fallbacks');
      banner.style.opacity = '1';
      banner.style.transform = 'translateY(0)';
      document.querySelector('.container').style.opacity = '1';
      cameraSection.style.opacity = '1';
      cameraSection.style.transform = 'translateY(0) scale(1)';
      controlsEl.style.opacity = '1';
      controlsEl.style.transform = 'translateY(0)';
      controlsEl.querySelectorAll('.btn').forEach(btn => {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0) scale(1)';
      });
      settingsSection.style.opacity = '1';
      settingsSection.style.transform = 'translateY(0)';
      return;
    }

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' }
    });

    // Animate banner sliding down
    tl.to(banner, {
      opacity: 1,
      y: 0,
      duration: 0.8,
    });

    // Animate container fade in
    tl.to('.container', {
      opacity: 1,
      duration: 0.5,
    }, '-=0.4');

    // Animate camera section with scale and fade
    tl.to(cameraSection, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.7,
      ease: 'back.out(1.4)',
    }, '-=0.3');

    // Stagger animate controls
    tl.to(controlsEl, {
      opacity: 1,
      y: 0,
      duration: 0.5,
    }, '-=0.3');

    tl.to(controlsEl.querySelectorAll('.btn'), {
      opacity: 1,
      y: 0,
      scale: 1,
      stagger: 0.08,
      duration: 0.4,
      ease: 'back.out(1.7)',
    }, '-=0.3');

    // Animate settings section
    tl.to(settingsSection, {
      opacity: 1,
      y: 0,
      duration: 0.5,
    }, '-=0.2');
  }

  // ============================================
  // BUTTON SHINE EFFECT ON HOVER
  // ============================================
  function initButtonEffects() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(btn => {
      // Create shine element if not exists
      if (!btn.querySelector('.btn__shine')) {
        const shine = document.createElement('span');
        shine.className = 'btn__shine';
        btn.appendChild(shine);
      }
      
      btn.addEventListener('mouseenter', () => {
        const shine = btn.querySelector('.btn__shine');
        if (shine) {
          shine.classList.remove('animate');
          void shine.offsetWidth; // Force reflow
          shine.classList.add('animate');
        }
      });
    });
  }

  // ============================================
  // LOADING MODAL
  // ============================================
  let loadingModal = null;

  function createLoadingModal() {
    if (loadingModal) return loadingModal;
    
    const modal = document.createElement('div');
    modal.className = 'loading-modal';
    modal.innerHTML = `
      <div class="loading-modal__backdrop"></div>
      <div class="loading-modal__content">
        <div class="loading-modal__spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
        </div>
        <div class="loading-modal__text">
          <span class="loading-modal__title">Loading Model</span>
          <span class="loading-modal__subtitle">Preparing object detection...</span>
        </div>
        <div class="loading-modal__progress">
          <div class="loading-modal__progress-bar"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    loadingModal = modal;
    return modal;
  }

  function showLoadingModal(title = 'Loading Model', subtitle = 'Preparing object detection...') {
    const modal = createLoadingModal();
    const titleEl = modal.querySelector('.loading-modal__title');
    const subtitleEl = modal.querySelector('.loading-modal__subtitle');
    
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    
    modal.classList.add('visible');
    
    if (isGsapAvailable()) {
      gsap.fromTo(modal.querySelector('.loading-modal__backdrop'),
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
      
      gsap.fromTo(modal.querySelector('.loading-modal__content'),
        { opacity: 0, scale: 0.9, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)', delay: 0.1 }
      );
    }
  }

  function hideLoadingModal() {
    if (!loadingModal) return;
    
    if (isGsapAvailable()) {
      gsap.to(loadingModal.querySelector('.loading-modal__content'), {
        opacity: 0,
        scale: 0.95,
        y: -10,
        duration: 0.25,
        ease: 'power2.in',
      });
      
      gsap.to(loadingModal.querySelector('.loading-modal__backdrop'), {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        delay: 0.1,
        onComplete: () => {
          loadingModal.classList.remove('visible');
        }
      });
    } else {
      loadingModal.classList.remove('visible');
    }
  }

  function updateLoadingProgress(progress) {
    if (!loadingModal) return;
    const progressBar = loadingModal.querySelector('.loading-modal__progress-bar');
    if (progressBar) {
      if (isGsapAvailable()) {
        gsap.to(progressBar, {
          width: `${progress}%`,
          duration: 0.3,
          ease: 'power2.out',
        });
      } else {
        progressBar.style.width = `${progress}%`;
      }
    }
  }

  // ============================================
  // PARTICLE BURST EFFECT
  // ============================================
  function createParticleBurst(x, y, color = '#00ff88') {
    const particleCount = 12;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.cssText = `
        left: ${x}px;
        top: ${y}px;
        background: ${color};
        box-shadow: 0 0 10px ${color};
      `;
      particlesContainer.appendChild(particle);
      particles.push(particle);
    }
    
    // Animate particles outward
    particles.forEach((particle, i) => {
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = 60 + Math.random() * 40;
      const targetX = Math.cos(angle) * distance;
      const targetY = Math.sin(angle) * distance;
      
      if (isGsapAvailable()) {
        gsap.to(particle, {
          x: targetX,
          y: targetY,
          opacity: 0,
          scale: 0,
          duration: 0.8 + Math.random() * 0.4,
          ease: 'power2.out',
          onComplete: () => particle.remove(),
        });
      } else {
        particle.style.transform = `translate(${targetX}px, ${targetY}px) scale(0)`;
        particle.style.opacity = '0';
        setTimeout(() => particle.remove(), 800);
      }
    });
  }

  // Trigger particles on detection state change
  function triggerDetectionEffect() {
    const now = Date.now();
    if (now - lastDetectionTime < 1000) return; // Throttle
    lastDetectionTime = now;
    
    const rect = videoWrap.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    createParticleBurst(centerX, centerY, isPerformativeState ? '#ff3366' : '#00ff88');
  }

  // ============================================
  // CAMERA TRANSITION ANIMATIONS
  // ============================================
  function animateCameraStart() {
    // Hide placeholder
    if (isGsapAvailable()) {
      gsap.to(cameraPlaceholder, {
        opacity: 0,
        scale: 0.9,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
          cameraPlaceholder.classList.add('hidden');
        }
      });
    } else {
      cameraPlaceholder.classList.add('hidden');
    }
    
    // Show video with scale + fade
    video.classList.add('active');
    if (isGsapAvailable()) {
      gsap.fromTo(video, 
        { opacity: 0, scale: 1.1, filter: 'blur(10px)' },
        { 
          opacity: 1, 
          scale: 1, 
          filter: 'blur(0px)',
          duration: 0.6, 
          ease: 'power2.out',
          delay: 0.2
        }
      );
    }

    // Disable glow animation on start button
    startBtn.classList.add('no-glow');
  }

  function animateCameraStop() {
    video.classList.remove('active');
    
    if (isGsapAvailable()) {
      gsap.to(video, {
        opacity: 0,
        scale: 1.05,
        duration: 0.3,
        ease: 'power2.in',
      });
    }
    
    // Show placeholder
    cameraPlaceholder.classList.remove('hidden');
    if (isGsapAvailable()) {
      gsap.to(cameraPlaceholder, {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        ease: 'back.out(1.4)',
        delay: 0.2
      });
    } else {
      cameraPlaceholder.style.opacity = '1';
      cameraPlaceholder.style.transform = 'scale(1)';
    }

    // Re-enable glow animation
    startBtn.classList.remove('no-glow');
  }

  function animateCameraSwitch() {
    // Apply circular wipe class
    video.classList.add('switching');
    
    // Remove class after animation
    setTimeout(() => {
      video.classList.remove('switching');
    }, 600);
  }

  // ============================================
  // ACCORDION ANIMATION
  // ============================================
  function initAccordion() {
    const toggleBtn = document.getElementById('toggleSettings');
    const body = document.getElementById('settingsBody');
    const content = body.querySelector('.settings__content');
    
    // Set initial state
    body.style.height = '0px';
    body.style.overflow = 'hidden';
    
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;
      
      toggleBtn.setAttribute('aria-expanded', String(newState));
      toggleBtn.querySelector('.btn__text').textContent = newState ? 'Hide advanced' : 'Show advanced';
      
      if (newState) {
        // Opening
        const contentHeight = content.offsetHeight;
        body.classList.add('open');
        
        if (isGsapAvailable()) {
          gsap.to(body, {
            height: contentHeight,
            duration: 0.5,
            ease: 'power3.out',
          });
          
          // Stagger animate children
          gsap.fromTo(content.querySelectorAll('.field, .settings__actions'), 
            { opacity: 0, y: 15 },
            { 
              opacity: 1, 
              y: 0, 
              stagger: 0.05, 
              duration: 0.4,
              ease: 'power2.out',
              delay: 0.1
            }
          );
        } else {
          body.style.height = `${contentHeight}px`;
        }
      } else {
        // Closing
        if (isGsapAvailable()) {
          gsap.to(body, {
            height: 0,
            duration: 0.4,
            ease: 'power3.inOut',
            onComplete: () => {
              body.classList.remove('open');
            }
          });
        } else {
          body.style.height = '0';
          body.classList.remove('open');
        }
      }
    });
  }

  // ============================================
  // RANGE SLIDER ENHANCEMENTS
  // ============================================
  function initRangeSliders() {
    const sliders = [
      { input: 'enterThreshold', fill: 'enterThresholdFill', tooltip: 'enterThresholdTooltip' },
      { input: 'exitThreshold', fill: 'exitThresholdFill', tooltip: 'exitThresholdTooltip' },
    ];
    
    sliders.forEach(({ input, fill, tooltip }) => {
      const inputEl = document.getElementById(input);
      const fillEl = document.getElementById(fill);
      const tooltipEl = document.getElementById(tooltip);
      
      if (!inputEl || !fillEl || !tooltipEl) return;
      
      const updateSlider = () => {
        const min = parseFloat(inputEl.min);
        const max = parseFloat(inputEl.max);
        const val = parseFloat(inputEl.value);
        const percent = ((val - min) / (max - min)) * 100;
        
        fillEl.style.width = `${percent}%`;
        tooltipEl.textContent = val.toFixed(2);
        tooltipEl.style.left = `${percent}%`;
      };
      
      inputEl.addEventListener('input', updateSlider);
      
      // Initial update
      setTimeout(updateSlider, 100);
    });
  }

  // ============================================
  // TOAST WITH ANIMATIONS
  // ============================================
  function showToast(message, kind = 'info', ttlMs = 4000) {
    if (!toastsEl) return;
    
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.textContent = String(message);
    toastsEl.appendChild(el);
    
    // Trigger animation
    requestAnimationFrame(() => {
      el.classList.add('show');
    });
    
    const dismiss = () => {
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    };
    
    const t = setTimeout(dismiss, ttlMs);
    
    el.addEventListener('click', () => {
      clearTimeout(t);
      dismiss();
    });
  }

  // ============================================
  // BANNER STATE ANIMATION
  // ============================================
  function setBanner(isPerformative) {
    const performative = Boolean(isPerformative);
    const wasPerformative = banner.classList.contains('banner--performative');
    
    banner.classList.toggle('banner--performative', performative);
    banner.classList.toggle('banner--nonperformative', !performative);
    bannerText.textContent = performative ? 'Performative' : 'Non‑performative';
    
    // Update status text
    const statusText = bannerStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = performative ? 'Detected' : 'Scanning';
    }
    
    // Animate banner text on state change
    if (wasPerformative !== performative) {
      if (isGsapAvailable()) {
        gsap.fromTo(bannerText, 
          { scale: 0.9, opacity: 0.5 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }
        );
      }
      
      // Trigger particle effect
      triggerDetectionEffect();
    }
  }

  // ============================================
  // DETECTION HELPERS
  // ============================================
  function isDrinkPrediction(pred) {
    const label = (pred.class || pred.label || '').toLowerCase();
    if (DRINK_CLASSES.has(label)) return true;
    return DRINK_KEYWORDS.some(k => label.includes(k));
  }

  function isBookPrediction(pred) {
    const label = (pred.class || pred.label || '').toLowerCase();
    return BOOK_CLASSES.has(label);
  }

  function isTinPrediction(pred) {
    const label = (pred.class || pred.label || '').toLowerCase();
    return TIN_KEYWORDS.some(k => label.includes(k));
  }

  function isPerformativePrediction(pred) {
    return isDrinkPrediction(pred) || isBookPrediction(pred) || isTinPrediction(pred);
  }

  // ============================================
  // CANVAS & DETECTION
  // ============================================
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

      // Animated box with glow
      ctx.save();
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2 * DPR;
      ctx.shadowColor = 'rgba(255, 204, 0, 0.5)';
      ctx.shadowBlur = 15 * DPR;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.restore();

      // Label with modern styling
      const label = `${p.class || p.label} ${(p.score ? Math.round(p.score * 100) : 0)}%`;
      ctx.save();
      ctx.font = `${11 * DPR}px 'Space Grotesk', system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 12 * DPR;
      const th = 20 * DPR;
      
      // Label background
      ctx.fillStyle = 'rgba(5, 5, 8, 0.85)';
      ctx.beginPath();
      ctx.roundRect(sx, Math.max(0, sy - th - 6 * DPR), tw, th, 6 * DPR);
      ctx.fill();
      
      // Label border
      ctx.strokeStyle = 'rgba(255, 204, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Label text
      ctx.fillStyle = '#f0f0f5';
      ctx.fillText(label, sx + 6 * DPR, Math.max(14 * DPR, sy - 10 * DPR));
      ctx.restore();
    }
  }

  // ============================================
  // SETTINGS PERSISTENCE
  // ============================================
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
    try { 
      localStorage.setItem('performative-settings', JSON.stringify(settings)); 
    } catch (_) {}
  }

  // ============================================
  // DETECTION LOOP
  // ============================================
  async function detectLoop() {
    if (!model || video.readyState < 2) {
      rafId = requestAnimationFrame(detectLoop);
      return;
    }
    
    try {
      const predictions = await model.detect(video);
      const baseThreshold = isPerformativeState ? settings.exitScore : settings.enterScore;
      
      const filtered = predictions.filter(p => {
        if (!isPerformativePrediction(p)) return false;
        const label = (p.class || p.label || '').toLowerCase();
        const classMin = CLASS_MIN_SCORE[label] ?? 0;
        const required = Math.max(baseThreshold, classMin);
        const score = p.score || 0;
        return score >= required;
      });
      
      if (showBoxes) {
        drawDetections(filtered);
      } else {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }

      const hasPerformativeThisFrame = filtered.length > 0;
      
      if (hasPerformativeThisFrame) {
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
      console.error(err);
    } finally {
      rafId = requestAnimationFrame(detectLoop);
    }
  }

  // ============================================
  // CAMERA CONTROLS
  // ============================================
  async function startCamera() {
    startBtn.disabled = true;
    
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
      showToast('Could not access camera. Please allow permissions.', 'error');
      startBtn.disabled = false;
      return;
    }

    try {
      video.srcObject = stream;
      await video.play();
      sizeCanvasToVideo();
      
      const isFront = currentFacingMode === 'user';
      video.classList.toggle('mirrored', isFront);
      overlay.classList.toggle('mirrored', isFront);
      
      // Trigger camera start animation
      animateCameraStart();
    } catch (err) {
      console.error('Video playback error:', err);
    }

    // Load model with loading modal
    if (!model) {
      showLoadingModal('Loading Model', 'Initializing TensorFlow.js...');
      updateLoadingProgress(10);
      
      try {
        if (typeof tf !== 'undefined' && tf.getBackend() !== 'webgl') {
          await tf.setBackend('webgl');
        }
        updateLoadingProgress(25);
        
        if (typeof tf !== 'undefined') {
          await tf.ready();
        }
        updateLoadingProgress(40);
      } catch (e) {
        console.warn('TF backend selection issue:', e);
        showToast('Running without WebGL acceleration', 'info');
      }
      
      // Update modal text for model loading
      if (loadingModal) {
        const subtitleEl = loadingModal.querySelector('.loading-modal__subtitle');
        if (subtitleEl) subtitleEl.textContent = 'Downloading detection model...';
      }
      updateLoadingProgress(50);
      
      try {
        model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        updateLoadingProgress(90);
      } catch (e) {
        console.error('Model load failed:', e);
        hideLoadingModal();
        bannerText.textContent = 'Model unavailable';
        showToast(`Object detection unavailable: ${e?.message || 'see console'}`, 'error');
      }
      
      if (model) {
        // Update modal for warmup
        if (loadingModal) {
          const subtitleEl = loadingModal.querySelector('.loading-modal__subtitle');
          if (subtitleEl) subtitleEl.textContent = 'Warming up model...';
        }
        try { await model.detect(video); } catch (_) {}
        updateLoadingProgress(100);
      }
      
      // Hide modal after short delay for smooth UX
      setTimeout(() => {
        hideLoadingModal();
      }, 300);
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
    animateCameraStop();
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  // ============================================
  // SETTINGS UI
  // ============================================
  function initSettingsUI() {
    loadSettings();
    
    const enterEl = document.getElementById('enterThreshold');
    const exitEl = document.getElementById('exitThreshold');
    const enterVal = document.getElementById('enterThresholdValue');
    const exitVal = document.getElementById('exitThresholdValue');
    const framesEnterEl = document.getElementById('framesEnter');
    const framesExitEl = document.getElementById('framesExit');
    const resetBtn = document.getElementById('resetSettings');

    function syncUI() {
      enterEl.value = String(settings.enterScore);
      exitEl.value = String(settings.exitScore);
      enterVal.textContent = Number(settings.enterScore).toFixed(2);
      exitVal.textContent = Number(settings.exitScore).toFixed(2);
      framesEnterEl.value = String(settings.framesEnter);
      framesExitEl.value = String(settings.framesExit);
      
      // Update range fills
      const updateFill = (input, fillId) => {
        const fill = document.getElementById(fillId);
        if (!fill) return;
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        const val = parseFloat(input.value);
        const percent = ((val - min) / (max - min)) * 100;
        fill.style.width = `${percent}%`;
      };
      
      updateFill(enterEl, 'enterThresholdFill');
      updateFill(exitEl, 'exitThresholdFill');
    }

    function clamp(v, min, max) { 
      return Math.min(max, Math.max(min, v)); 
    }

    enterEl.addEventListener('input', () => {
      const v = parseFloat(enterEl.value);
      settings.enterScore = clamp(isNaN(v) ? settings.enterScore : v, 0.05, 0.99);
      enterVal.textContent = settings.enterScore.toFixed(2);
      
      if (settings.exitScore >= settings.enterScore) {
        settings.exitScore = Math.max(0.01, settings.enterScore - 0.05);
        exitEl.value = String(settings.exitScore);
        exitVal.textContent = settings.exitScore.toFixed(2);
      }
      saveSettings();
      syncUI();
    });
    
    exitEl.addEventListener('input', () => {
      const v = parseFloat(exitEl.value);
      settings.exitScore = clamp(isNaN(v) ? settings.exitScore : v, 0.01, settings.enterScore - 0.01);
      exitVal.textContent = settings.exitScore.toFixed(2);
      saveSettings();
      syncUI();
    });
    
    framesEnterEl.addEventListener('change', () => {
      const v = parseInt(framesEnterEl.value, 10);
      settings.framesEnter = clamp(isNaN(v) ? settings.framesEnter : v, 1, 60);
      saveSettings();
      consecutiveDrinkFrames = 0;
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
      
      // Animate reset button
      if (isGsapAvailable()) {
        gsap.to(resetBtn, {
          scale: 0.95,
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        });
      }
      
      showToast('Settings reset to defaults', 'info', 2000);
    });

    syncUI();
  }

  // ============================================
  // TOGGLE BOXES BUTTON
  // ============================================
  function initToggleBoxes() {
    if (!toggleBoxesBtn) return;
    
    toggleBoxesBtn.addEventListener('click', () => {
      showBoxes = !showBoxes;
      toggleBoxesBtn.querySelector('.btn__text').textContent = `Boxes: ${showBoxes ? 'On' : 'Off'}`;
      
      // Spring animation on toggle
      if (isGsapAvailable()) {
        gsap.to(toggleBoxesBtn, {
          scale: 1.1,
          duration: 0.15,
          ease: 'power2.out',
          onComplete: () => {
            gsap.to(toggleBoxesBtn, {
              scale: 1,
              duration: 0.4,
              ease: 'elastic.out(1, 0.5)',
            });
          }
        });
      }
      
      if (!showBoxes) {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    // Initialize all animation systems
    initPageAnimations();
    initButtonEffects();
    initAccordion();
    initRangeSliders();
  initSettingsUI();
    initToggleBoxes();

    // Core event listeners
    window.addEventListener('resize', sizeCanvasToVideo);
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    
    if (switchCameraBtn) {
      switchCameraBtn.addEventListener('click', async () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        
        if (stream) {
          for (const track of stream.getTracks()) track.stop();
        }
        
        animateCameraSwitch();
        await startCamera();
      });
    }

    // Pause detection when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    } else if (model && video.readyState >= 2) {
      rafId = requestAnimationFrame(detectLoop);
    }
  });
  }

  // Wait for DOM and GSAP to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
