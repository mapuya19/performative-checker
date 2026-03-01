(() => {
  // ============================================
  // TYPE DEFINITIONS
  // ============================================
  interface Prediction {
    bbox?: number[];
    boundingBox?: number[];
    class?: string;
    label?: string;
    score?: number;
  }

  interface Settings {
    enterScore: number;
    exitScore: number;
    framesEnter: number;
    framesExit: number;
  }

  interface ClassMinScore {
    [key: string]: number;
  }

  interface DOMElementCache {
    banner: HTMLElement;
    bannerText: HTMLElement;
    bannerStatus: HTMLElement;
    video: HTMLVideoElement;
    overlay: HTMLCanvasElement;
    startBtn: HTMLButtonElement;
    stopBtn: HTMLButtonElement;
    toastsEl: HTMLElement;
    switchCameraBtn: HTMLButtonElement;
    toggleBoxesBtn: HTMLButtonElement;
    cameraPlaceholder: HTMLElement;
    videoWrap: HTMLElement;
    particlesContainer: HTMLElement;
    cameraSection: HTMLElement;
    settingsSection: HTMLElement;
    controlsEl: HTMLElement;
  }

  // ============================================
  // DOM REFERENCES
  // ============================================
  const dom: DOMElementCache = {
    banner: document.getElementById('banner') as HTMLElement,
    bannerText: document.getElementById('bannerText') as HTMLElement,
    bannerStatus: document.getElementById('bannerStatus') as HTMLElement,
    video: document.getElementById('video') as HTMLVideoElement,
    overlay: document.getElementById('overlay') as HTMLCanvasElement,
    startBtn: document.getElementById('startBtn') as HTMLButtonElement,
    stopBtn: document.getElementById('stopBtn') as HTMLButtonElement,
    toastsEl: document.getElementById('toasts') as HTMLElement,
    switchCameraBtn: document.getElementById('switchCameraBtn') as HTMLButtonElement,
    toggleBoxesBtn: document.getElementById('toggleBoxesBtn') as HTMLButtonElement,
    cameraPlaceholder: document.getElementById('cameraPlaceholder') as HTMLElement,
    videoWrap: document.getElementById('videoWrap') as HTMLElement,
    particlesContainer: document.getElementById('particles') as HTMLElement,
    cameraSection: document.getElementById('cameraSection') as HTMLElement,
    settingsSection: document.getElementById('settingsSection') as HTMLElement,
    controlsEl: document.getElementById('controls') as HTMLElement,
  };

  // ============================================
  // STATE
  // ============================================
  let model: any = null;
  let stream: MediaStream | null = null;
  let rafId: number | null = null;
  let isPerformativeState = false;
  let consecutiveDrinkFrames = 0;
  let consecutiveNoDrinkFrames = 0;
  let currentFacingMode: 'user' | 'environment' = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'user' : 'environment';
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

  const CLASS_MIN_SCORE: ClassMinScore = {
    'cup': 0.25,
    'wine glass': 0.35,
    'book': 0.4,
  };

  let settings: Settings = {
    enterScore: 0.35,
    exitScore: 0.30,
    framesEnter: 4,
    framesExit: 6,
  };

  // ============================================
  // GSAP ANIMATIONS SETUP
  // ============================================
  
  function isGsapAvailable(): boolean {
    return typeof (globalThis as any).gsap !== 'undefined';
  }

  function initPageAnimations(): void {
    if (hasAnimatedIn) return;
    hasAnimatedIn = true;

    if (!isGsapAvailable()) {
      console.warn('GSAP not available, using CSS fallbacks');
      dom.banner.style.opacity = '1';
      dom.banner.style.transform = 'translateY(0)';
      const container = document.querySelector('.container') as HTMLElement;
      if (container) container.style.opacity = '1';
      dom.cameraSection.style.opacity = '1';
      dom.cameraSection.style.transform = 'translateY(0) scale(1)';
      dom.controlsEl.style.opacity = '1';
      dom.controlsEl.style.transform = 'translateY(0)';
      dom.controlsEl.querySelectorAll('.btn').forEach((btn) => {
        const button = btn as HTMLElement;
        button.style.opacity = '1';
        button.style.transform = 'translateY(0) scale(1)';
      });
      dom.settingsSection.style.opacity = '1';
      dom.settingsSection.style.transform = 'translateY(0)';
      return;
    }

    const gsap = (globalThis as any).gsap;
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' }
    });

    tl.to(dom.banner, {
      opacity: 1,
      y: 0,
      duration: 0.8,
    });

    tl.to('.container', {
      opacity: 1,
      duration: 0.5,
    }, '-=0.4');

    tl.to(dom.cameraSection, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.7,
      ease: 'back.out(1.4)',
    }, '-=0.3');

    tl.to(dom.controlsEl, {
      opacity: 1,
      y: 0,
      duration: 0.5,
    }, '-=0.3');

    tl.to(dom.controlsEl.querySelectorAll('.btn'), {
      opacity: 1,
      y: 0,
      scale: 1,
      stagger: 0.08,
      duration: 0.4,
      ease: 'back.out(1.7)',
    }, '-=0.3');

    tl.to(dom.settingsSection, {
      opacity: 1,
      y: 0,
      duration: 0.5,
    }, '-=0.2');
  }

  // ============================================
  // BUTTON SHINE EFFECT ON HOVER
  // ============================================
  function initButtonEffects(): void {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach((btn) => {
      if (!btn.querySelector('.btn__shine')) {
        const shine = document.createElement('span');
        shine.className = 'btn__shine';
        btn.appendChild(shine);
      }
      
      btn.addEventListener('mouseenter', () => {
        const shine = btn.querySelector('.btn__shine') as HTMLElement;
        if (shine) {
          shine.classList.remove('animate');
          void shine.offsetWidth;
          shine.classList.add('animate');
        }
      });
    });
  }

  // ============================================
  // LOADING MODAL
  // ============================================
  let loadingModal: HTMLElement | null = null;

  function createLoadingModal(): HTMLElement {
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

  function showLoadingModal(title: string = 'Loading Model', subtitle: string = 'Preparing object detection...'): void {
    const modal = createLoadingModal();
    const titleEl = modal.querySelector('.loading-modal__title') as HTMLElement;
    const subtitleEl = modal.querySelector('.loading-modal__subtitle') as HTMLElement;
    
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    
    modal.classList.add('visible');
    
    if (isGsapAvailable()) {
      const gsap = (globalThis as any).gsap;
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

  function hideLoadingModal(): void {
    if (!loadingModal) return;
    
    if (isGsapAvailable()) {
      const gsap = (globalThis as any).gsap;
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
          loadingModal!.classList.remove('visible');
        }
      });
    } else {
      loadingModal.classList.remove('visible');
    }
  }

  function updateLoadingProgress(progress: number): void {
    if (!loadingModal) return;
    const progressBar = loadingModal.querySelector('.loading-modal__progress-bar') as HTMLElement;
    if (progressBar) {
      if (isGsapAvailable()) {
        const gsap = (globalThis as any).gsap;
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
  function createParticleBurst(x: number, y: number, color: string = '#00ff88'): void {
    const particleCount = 12;
    const particles: HTMLElement[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.cssText = `
        left: ${x}px;
        top: ${y}px;
        background: ${color};
        box-shadow: 0 0 10px ${color};
      `;
      dom.particlesContainer.appendChild(particle);
      particles.push(particle);
    }
    
    particles.forEach((particle, i) => {
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = 60 + Math.random() * 40;
      const targetX = Math.cos(angle) * distance;
      const targetY = Math.sin(angle) * distance;
      
      if (isGsapAvailable()) {
        const gsap = (globalThis as any).gsap;
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

  function triggerDetectionEffect(): void {
    const now = Date.now();
    if (now - lastDetectionTime < 1000) return;
    lastDetectionTime = now;
    
    const rect = dom.videoWrap.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    createParticleBurst(centerX, centerY, isPerformativeState ? '#ff3366' : '#00ff88');
  }

  // ============================================
  // CAMERA TRANSITION ANIMATIONS
  // ============================================
  function animateCameraStart(): void {
    if (isGsapAvailable()) {
      const gsap = (globalThis as any).gsap;
      gsap.to(dom.cameraPlaceholder, {
        opacity: 0,
        scale: 0.9,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
          dom.cameraPlaceholder.classList.add('hidden');
        }
      });
    } else {
      dom.cameraPlaceholder.classList.add('hidden');
    }
    
    dom.video.classList.add('active');
    if (isGsapAvailable()) {
      const gsap = (globalThis as any).gsap;
      gsap.fromTo(dom.video, 
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

    dom.startBtn.classList.add('no-glow');
  }

  function animateCameraStop(): void {
    dom.video.classList.remove('active');
    
    if (isGsapAvailable()) {
      const gsap = (globalThis as any).gsap;
      gsap.to(dom.video, {
        opacity: 0,
        scale: 1.05,
        duration: 0.3,
        ease: 'power2.in',
      });
    }
    
    dom.cameraPlaceholder.classList.remove('hidden');
    if (isGsapAvailable()) {
      const gsap = (globalThis as any).gsap;
      gsap.to(dom.cameraPlaceholder, {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        ease: 'back.out(1.4)',
        delay: 0.2
      });
    } else {
      dom.cameraPlaceholder.style.opacity = '1';
      dom.cameraPlaceholder.style.transform = 'scale(1)';
    }

    dom.startBtn.classList.remove('no-glow');
  }

  function animateCameraSwitch(): void {
    dom.video.classList.add('switching');
    
    setTimeout(() => {
      dom.video.classList.remove('switching');
    }, 600);
  }

  // ============================================
  // ACCORDION ANIMATION
  // ============================================
  function initAccordion(): void {
    const toggleBtn = document.getElementById('toggleSettings') as HTMLButtonElement;
    const body = document.getElementById('settingsBody') as HTMLElement;
    const content = body.querySelector('.settings__content') as HTMLElement;
    
    body.style.height = '0px';
    body.style.overflow = 'hidden';
    
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;
      
      toggleBtn.setAttribute('aria-expanded', String(newState));
      const btnText = toggleBtn.querySelector('.btn__text') as HTMLElement;
      btnText.textContent = newState ? 'Hide advanced' : 'Show advanced';
      
      if (newState) {
        const contentHeight = content.offsetHeight;
        body.classList.add('open');
        
        if (isGsapAvailable()) {
          const gsap = (globalThis as any).gsap;
          gsap.to(body, {
            height: contentHeight,
            duration: 0.5,
            ease: 'power3.out',
          });
          
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
        if (isGsapAvailable()) {
          const gsap = (globalThis as any).gsap;
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
  function initRangeSliders(): void {
    const sliders = [
      { input: 'enterThreshold', fill: 'enterThresholdFill', tooltip: 'enterThresholdTooltip' },
      { input: 'exitThreshold', fill: 'exitThresholdFill', tooltip: 'exitThresholdTooltip' },
    ];
    
    sliders.forEach(({ input, fill, tooltip }) => {
      const inputEl = document.getElementById(input) as HTMLInputElement;
      const fillEl = document.getElementById(fill) as HTMLElement;
      const tooltipEl = document.getElementById(tooltip) as HTMLElement;
      
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
      
      setTimeout(updateSlider, 100);
    });
  }

  // ============================================
  // TOAST WITH ANIMATIONS
  // ============================================
  function showToast(message: string, kind: string = 'info', ttlMs: number = 4000): void {
    if (!dom.toastsEl) return;
    
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.textContent = String(message);
    dom.toastsEl.appendChild(el);
    
    requestAnimationFrame(() => {
      el.classList.add('show');
    });
    
    const dismiss = () => {
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => {
        if (el.parentNode) el.parentNode!.removeChild(el);
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
  function setBanner(isPerformative: boolean): void {
    const performative = Boolean(isPerformative);
    const wasPerformative = dom.banner.classList.contains('banner--performative');
    
    dom.banner.classList.toggle('banner--performative', performative);
    dom.banner.classList.toggle('banner--nonperformative', !performative);
    dom.bannerText.textContent = performative ? 'Performative' : 'Non‑performative';
    
    const statusText = dom.bannerStatus.querySelector('.status-text') as HTMLElement;
    if (statusText) {
      statusText.textContent = performative ? 'Detected' : 'Scanning';
    }
    
    if (wasPerformative !== performative) {
      if (isGsapAvailable()) {
        const gsap = (globalThis as any).gsap;
        gsap.fromTo(dom.bannerText, 
          { scale: 0.9, opacity: 0.5 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }
        );
      }
      
      triggerDetectionEffect();
    }
  }

  // ============================================
  // DETECTION HELPERS
  // ============================================
  function isDrinkPrediction(pred: Prediction): boolean {
    const label = (pred.class || pred.label || '').toLowerCase();
    if (DRINK_CLASSES.has(label)) return true;
    return DRINK_KEYWORDS.some(k => label.includes(k));
  }

  function isBookPrediction(pred: Prediction): boolean {
    const label = (pred.class || pred.label || '').toLowerCase();
    return BOOK_CLASSES.has(label);
  }

  function isTinPrediction(pred: Prediction): boolean {
    const label = (pred.class || pred.label || '').toLowerCase();
    return TIN_KEYWORDS.some(k => label.includes(k));
  }

  function isPerformativePrediction(pred: Prediction): boolean {
    return isDrinkPrediction(pred) || isBookPrediction(pred) || isTinPrediction(pred);
  }

  // ============================================
  // CANVAS & DETECTION
  // ============================================
  function sizeCanvasToVideo(): void {
    const rect = dom.video.getBoundingClientRect();
    dom.overlay.width = rect.width * DPR;
    dom.overlay.height = rect.height * DPR;
  }

  function drawDetections(predictions: Prediction[]): void {
    const ctx = dom.overlay.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
    if (!predictions || !predictions.length) return;

    const scaleX = dom.overlay.width / dom.video.videoWidth;
    const scaleY = dom.overlay.height / dom.video.videoHeight;

    for (const p of predictions) {
      const [x, y, w, h] = p.bbox || p.boundingBox || [];
      if ([x, y, w, h].some(v => typeof v !== 'number')) continue;

      const sx = x * scaleX;
      const sy = y * scaleY;
      const sw = w * scaleX;
      const sh = h * scaleY;

      ctx.save();
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2 * DPR;
      ctx.shadowColor = 'rgba(255, 204, 0, 0.5)';
      ctx.shadowBlur = 15 * DPR;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.restore();

      const label = `${p.class || p.label} ${(p.score ? Math.round(p.score * 100) : 0)}%`;
      ctx.save();
      ctx.font = `${11 * DPR}px 'Space Grotesk', system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 12 * DPR;
      const th = 20 * DPR;
      
      ctx.fillStyle = 'rgba(5, 5, 8, 0.85)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(sx, Math.max(0, sy - th - 6 * DPR), tw, th, 6 * DPR);
      } else {
        ctx.fillRect(sx, Math.max(0, sy - th - 6 * DPR), tw, th);
      }
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255, 204, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.fillStyle = '#f0f0f5';
      ctx.fillText(label, sx + 6 * DPR, Math.max(14 * DPR, sy - 10 * DPR));
      ctx.restore();
    }
  }

  // ============================================
  // SETTINGS PERSISTENCE
  // ============================================
  function loadSettings(): void {
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

  function saveSettings(): void {
    try { 
      localStorage.setItem('performative-settings', JSON.stringify(settings)); 
    } catch (_) {}
  }

  // ============================================
  // DETECTION LOOP
  // ============================================
  async function detectLoop(): Promise<void> {
    if (!model || dom.video.readyState < 2) {
      rafId = requestAnimationFrame(detectLoop);
      return;
    }
    
    try {
      const predictions = await model.detect(dom.video) as Prediction[];
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
        const ctx = dom.overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
        }
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
  async function startCamera(): Promise<void> {
    dom.startBtn.disabled = true;
    
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
      dom.startBtn.disabled = false;
      return;
    }

    try {
      dom.video.srcObject = stream;
      await dom.video.play();
      sizeCanvasToVideo();
      
      const isFront = currentFacingMode === 'user';
      dom.video.classList.toggle('mirrored', isFront);
      dom.overlay.classList.toggle('mirrored', isFront);
      
      animateCameraStart();
    } catch (err) {
      console.error('Video playback error:', err);
    }

    if (!model) {
      showLoadingModal('Loading Model', 'Initializing TensorFlow.js...');
      updateLoadingProgress(10);
      
      try {
        const tf = (globalThis as any).tf;
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
      
      if (loadingModal) {
        const subtitleEl = loadingModal.querySelector('.loading-modal__subtitle') as HTMLElement;
        if (subtitleEl) subtitleEl.textContent = 'Downloading detection model...';
      }
      updateLoadingProgress(50);
      
      try {
        const cocoSsd = (globalThis as any).cocoSsd;
        model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        updateLoadingProgress(90);
      } catch (e) {
        console.error('Model load failed:', e);
        hideLoadingModal();
        dom.bannerText.textContent = 'Model unavailable';
        showToast(`Object detection unavailable: ${(e as Error)?.message || 'see console'}`, 'error');
      }
      
      if (model) {
        if (loadingModal) {
          const subtitleEl = loadingModal.querySelector('.loading-modal__subtitle') as HTMLElement;
          if (subtitleEl) subtitleEl.textContent = 'Warming up model...';
        }
        try { await model.detect(dom.video); } catch (_) {}
        updateLoadingProgress(100);
      }
      
      setTimeout(() => {
        hideLoadingModal();
      }, 300);
    }

    isPerformativeState = false;
    consecutiveDrinkFrames = 0;
    consecutiveNoDrinkFrames = 0;
    setBanner(false);
    
    if (model) detectLoop();
    dom.stopBtn.disabled = false;
  }

  function stopCamera(): void {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    
    dom.video.srcObject = null;
    const ctx = dom.overlay.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
    }
    
    setBanner(false);
    animateCameraStop();
    
    dom.startBtn.disabled = false;
    dom.stopBtn.disabled = true;
  }

  // ============================================
  // SETTINGS UI
  // ============================================
  function initSettingsUI(): void {
    loadSettings();
    
    const enterEl = document.getElementById('enterThreshold') as HTMLInputElement;
    const exitEl = document.getElementById('exitThreshold') as HTMLInputElement;
    const enterVal = document.getElementById('enterThresholdValue') as HTMLElement;
    const exitVal = document.getElementById('exitThresholdValue') as HTMLElement;
    const framesEnterEl = document.getElementById('framesEnter') as HTMLInputElement;
    const framesExitEl = document.getElementById('framesExit') as HTMLInputElement;
    const resetBtn = document.getElementById('resetSettings') as HTMLButtonElement;

    function syncUI(): void {
      enterEl.value = String(settings.enterScore);
      exitEl.value = String(settings.exitScore);
      enterVal.textContent = Number(settings.enterScore).toFixed(2);
      exitVal.textContent = Number(settings.exitScore).toFixed(2);
      framesEnterEl.value = String(settings.framesEnter);
      framesExitEl.value = String(settings.framesExit);
      
      const updateFill = (input: HTMLInputElement, fillId: string) => {
        const fill = document.getElementById(fillId) as HTMLElement;
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

    function clamp(v: number, min: number, max: number): number { 
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
      
      if (isGsapAvailable()) {
        const gsap = (globalThis as any).gsap;
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
  function initToggleBoxes(): void {
    if (!dom.toggleBoxesBtn) return;
    
    dom.toggleBoxesBtn.addEventListener('click', () => {
      showBoxes = !showBoxes;
      const btnText = dom.toggleBoxesBtn.querySelector('.btn__text') as HTMLElement;
      btnText.textContent = `Boxes: ${showBoxes ? 'On' : 'Off'}`;
      
      if (isGsapAvailable()) {
        const gsap = (globalThis as any).gsap;
        gsap.to(dom.toggleBoxesBtn, {
          scale: 1.1,
          duration: 0.15,
          ease: 'power2.out',
          onComplete: () => {
            gsap.to(dom.toggleBoxesBtn, {
              scale: 1,
              duration: 0.4,
              ease: 'elastic.out(1, 0.5)',
            });
          }
        });
      }
      
      if (!showBoxes) {
        const ctx = dom.overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
        }
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function init(): void {
    initPageAnimations();
    initButtonEffects();
    initAccordion();
    initRangeSliders();
    initSettingsUI();
    initToggleBoxes();

    window.addEventListener('resize', sizeCanvasToVideo);
    dom.startBtn.addEventListener('click', () => startCamera());
    dom.stopBtn.addEventListener('click', stopCamera);
    
    if (dom.switchCameraBtn) {
      dom.switchCameraBtn.addEventListener('click', async () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        
        if (stream) {
          for (const track of stream.getTracks()) track.stop();
        }
        
        animateCameraSwitch();
        await startCamera();
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (model && dom.video.readyState >= 2) {
        rafId = requestAnimationFrame(detectLoop);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
