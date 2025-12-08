// Pure HTML/CSS/JS version of the app (no React/Vite).
// Keeps the original divination logic and UI flow with minimal changes.

const state = {
  mode: 'input',          // input | selection | simulated | result
  question: '',
  lines: [],
  reading: null,
  showTranslation: false,
  isShaking: false,
  isProcessing: false,
  currentResult: null,     // 当前一次摇卦的三枚铜钱结果
  aiText: '',
  aiLoading: false,
};

let guaData = null;
let threeCtx = null;
const AI_DEFAULT_ENDPOINT = 'https://api.987408.xyz/six-yao/api.php'; // 预置后端地址，可按需修改

async function loadGuaData() {
  if (guaData) return guaData;
  const res = await fetch('./gua.json');
  guaData = await res.json();
  return guaData;
}

const CoinSide = {
  Manchu: 3,
  Chinese: 2,
};

function tossCoins() {
  const coins = [
    Math.random() > 0.5 ? CoinSide.Manchu : CoinSide.Chinese,
    Math.random() > 0.5 ? CoinSide.Manchu : CoinSide.Chinese,
    Math.random() > 0.5 ? CoinSide.Manchu : CoinSide.Chinese,
  ];
  const sum = coins.reduce((a, b) => a + b, 0);
  return {
    coins,
    sum,          // 6,7,8,9
    lineType: sum // kept for compatibility
  };
}

function getHexagram(binary) {
  const found = guaData?.gua?.find((g) => g['gua-xiang'] === binary);
  if (!found) {
    return {
      id: parseInt(binary, 2),
      binary,
      name: '未知',
      gua_detail: '未知',
      gua_detail_cn: '未知',
      gua_xiang_detail: '未知',
      gua_xiang_detail_cn: '未知',
      yao_detail: [],
      yao_detail_cn: [],
      xiang_detail: [],
      xiang_detail_cn: [],
      gua_unicode: '?',
    };
  }
  return {
    id: parseInt(binary, 2),
    binary,
    name: found['gua-name'],
    gua_detail: found['gua-detail'],
    gua_detail_cn: found['gua-detail-cn'],
    gua_xiang_detail: found['gua-xiang-detail'],
    gua_xiang_detail_cn: found['gua-xiang-detail-cn'],
    yao_detail: found['yao-detail'],
    yao_detail_cn: found['yao-detail-cn'],
    xiang_detail: found['xiang-detail'],
    xiang_detail_cn: found['xiang-detail-cn'],
    gua_unicode: found['gua-unicode'],
  };
}

function interpretReading(lines) {
  let originalBinary = '';
  let transformedBinary = '';
  const changingLines = [];

  lines.forEach((res, index) => {
    const originalBit = (res.sum === 7 || res.sum === 9) ? '1' : '0';
    let transformedBit = originalBit;

    if (res.sum === 6) {
      transformedBit = '1';
      changingLines.push(index + 1);
    } else if (res.sum === 9) {
      transformedBit = '0';
      changingLines.push(index + 1);
    }

    originalBinary += originalBit;
    transformedBinary += transformedBit;
  });

  return {
    originalHexagram: getHexagram(originalBinary),
    transformedHexagram: changingLines.length > 0 ? getHexagram(transformedBinary) : null,
    lines,
    changingLines,
  };
}

function updateMode(nextMode) {
  state.mode = nextMode;
  const sections = {
    input: document.getElementById('section-input'),
    selection: document.getElementById('section-selection'),
    simulated: document.getElementById('section-simulated'),
    result: document.getElementById('section-result'),
  };
  Object.entries(sections).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', key !== nextMode);
  });

  if (nextMode === 'simulated') {
    ensureThreeScene();
    renderSimulated();
  }
  if (nextMode === 'result') renderResult();
}

function resetApp() {
  state.mode = 'input';
  state.question = '';
  state.lines = [];
  state.reading = null;
  state.showTranslation = false;
  state.isShaking = false;
  state.isProcessing = false;
  state.currentResult = null;
  collapseLogPanel(true);

  document.getElementById('question-input').value = '';
  document.getElementById('question-preview').textContent = '';
  document.getElementById('shake-indicator').textContent = '第 1 爻 (共6爻)';
  document.getElementById('dots').innerHTML = '';
  document.getElementById('lines-list').innerHTML = '';
  document.getElementById('result-ai-text').innerHTML = '';
  document.getElementById('hexagram-cards').innerHTML = '';
  document.getElementById('interpretation-guide').textContent = '';
  state.aiText = '';
  state.aiLoading = false;
  const aiBtn = document.getElementById('ai-btn');
  if (aiBtn) aiBtn.textContent = '点击请求解卦';
  updateMode('input');
}

async function startDivination() {
  if (!state.question.trim()) return;
  await loadGuaData();
  updateMode('selection');
  document.getElementById('question-preview').textContent = state.question;
}

async function handleInstantDivination() {
  await loadGuaData();
  state.lines = Array.from({ length: 6 }, tossCoins);
  state.reading = interpretReading(state.lines);
  updateMode('result');
}

async function handleSimulatedShake() {
  if (state.isShaking || state.isProcessing || state.lines.length >= 6) return;
  state.isShaking = true;
  state.isProcessing = true;
  state.currentResult = null;
  renderSimulated();

  // 模拟摇动与落地
  setTimeout(async () => {
    const toss = tossCoins();
    state.currentResult = toss.coins;
    state.lines = [...state.lines, toss];
    state.isShaking = false;
    state.isProcessing = false;
    renderSimulated();

    if (state.lines.length === 6) {
      await loadGuaData();
      state.reading = interpretReading(state.lines);
      updateMode('result');
    }
  }, 1600);
}

function renderSimulated() {
  const simQuestion = document.getElementById('question-preview-sim');
  if (simQuestion) simQuestion.textContent = state.question;
  document.getElementById('shake-indicator').textContent = `第 ${state.lines.length + 1} 爻 (共6爻)`;
  const dots = document.getElementById('dots');
  dots.innerHTML = '';
  Array.from({ length: 6 }).forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = `w-3 h-3 rounded-full border border-divine-gold/50 ${i < state.lines.length ? 'bg-divine-gold' : 'bg-transparent'}`;
    dots.appendChild(dot);
  });

  const linesList = document.getElementById('lines-list');
  linesList.innerHTML = '';
  [...state.lines].reverse().forEach((line, idx) => {
    const realIdx = 5 - idx;
    const isYang = (line.sum === 7 || line.sum === 9);
    const isChanging = (line.sum === 6 || line.sum === 9);
    const bar = document.createElement('div');
    bar.className = 'flex items-center gap-3 mb-2';
    bar.innerHTML = `
      <span class="text-xs text-gray-500 w-10 text-right">${realIdx + 1}爻</span>
      ${buildLineBar(isYang, isChanging)}
      <span class="text-xs text-gray-400">${line.sum === 6 ? '老阴' : line.sum === 7 ? '少阳' : line.sum === 8 ? '少阴' : '老阳'}</span>
    `;
    linesList.appendChild(bar);
  });

  const btn = document.getElementById('shake-btn');
  if (btn) {
    btn.disabled = state.isShaking || state.isProcessing || state.lines.length >= 6;
    btn.textContent = state.isShaking ? '感应中...' : state.isProcessing ? '判卦中...' : state.lines.length >= 6 ? '已完成' : '摇 卦';
  }

  // 同步 3D 场景
  ensureThreeScene()?.then(() => {
    if (threeCtx) {
      threeCtx.isShaking = state.isShaking;
      threeCtx.setResult(state.currentResult);
      if (threeCtx.overlay) {
        threeCtx.overlay.textContent = state.isShaking ? '诚心祈祷...' : '铜钱已定';
      }
    }
  });
}

function buildLineBar(isYang, isChanging) {
  const colorClass = isChanging ? 'bg-red-600' : 'bg-divine-gold';
  const pulse = isChanging ? 'animate-pulse' : '';
  if (isYang) {
    return `<div class="w-32 md:w-48 h-4 ${colorClass} ${pulse} rounded-sm shadow-md relative flex items-center justify-center">
      ${isChanging ? '<span class="absolute -right-6 text-red-500 text-xs font-bold">O</span>' : ''}
    </div>`;
  }
  return `<div class="w-32 md:w-48 h-4 flex justify-between relative">
      <div class="w-[45%] h-full ${colorClass} ${pulse} rounded-sm shadow-md"></div>
      <div class="w-[45%] h-full ${colorClass} ${pulse} rounded-sm shadow-md"></div>
      ${isChanging ? '<span class="absolute -right-6 text-red-500 text-xs font-bold">X</span>' : ''}
    </div>`;
}

function renderResult() {
  if (!state.reading) return;
  document.getElementById('result-question').textContent = state.question;

  const cards = document.getElementById('hexagram-cards');
  cards.innerHTML = '';

  const originalCard = createHexagramCard(state.reading.originalHexagram, state.reading.lines, true);
  cards.appendChild(originalCard);

  if (state.reading.transformedHexagram) {
    const transformedLines = state.reading.lines.map((line) => {
      let newSum = line.sum;
      if (line.sum === 6) newSum = 7;
      else if (line.sum === 9) newSum = 8;
      return { ...line, sum: newSum };
    });
    const transformedCard = createHexagramCard(state.reading.transformedHexagram, transformedLines, false);
    transformedCard.classList.add('border-t', 'lg:border-t-0', 'lg:border-l', 'border-divine-gold/20', 'pt-8', 'lg:pt-0', 'lg:pl-8', 'mt-8', 'lg:mt-0');
    cards.appendChild(transformedCard);
  }

  renderInterpretationGuide();

  // AI 文本
  const aiBox = document.getElementById('result-ai-text');
  if (aiBox) {
    if (state.aiText) {
      const parser = window.marked?.parse || window.marked?.marked || null;
      if (parser) {
        aiBox.innerHTML = parser(state.aiText);
      } else {
        aiBox.innerText = state.aiText;
      }
    } else {
      aiBox.innerText = '';
    }
  }
}

function createHexagramCard(hexagram, lines, isOriginal) {
  const card = document.createElement('div');
  card.className = 'bg-divine-ink/40 p-6 rounded-xl border border-divine-gold/10 shadow-lg';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 mb-4';
  header.innerHTML = `<span class="text-4xl">${hexagram.gua_unicode}</span>
    <div class="text-2xl text-divine-gold font-bold">${isOriginal ? '本卦' : '变卦'}：${hexagram.name}</div>`;
  card.appendChild(header);

  const detail = document.createElement('div');
  detail.className = 'space-y-3 text-sm text-gray-200 leading-relaxed';
  detail.innerHTML = `
    <div>
      <div class="text-divine-gold/70 text-xs font-bold mb-1">【卦辞】</div>
      <div class="${state.showTranslation ? 'text-gray-100' : 'text-divine-paper font-serif'}">${state.showTranslation ? hexagram.gua_detail_cn : hexagram.gua_detail}</div>
    </div>
    <div>
      <div class="text-divine-gold/70 text-xs font-bold mb-1">【象辞】</div>
      <div class="${state.showTranslation ? 'text-gray-100' : 'text-divine-paper font-serif'}">${state.showTranslation ? hexagram.gua_xiang_detail_cn : hexagram.gua_xiang_detail}</div>
    </div>
  `;
  card.appendChild(detail);

  if (lines) {
    const yaoWrapper = document.createElement('div');
    yaoWrapper.className = 'mt-4';

    const toggle = document.createElement('button');
    toggle.className = 'w-full py-3 flex items-center justify-center gap-2 text-divine-gold/80 border border-divine-gold/20 rounded hover:bg-divine-gold/10 transition-colors';
    toggle.textContent = '展开爻辞详析';

    const yaoContent = document.createElement('div');
    yaoContent.className = 'max-h-0 overflow-hidden transition-all duration-500 ease-in-out';

    toggle.addEventListener('click', () => {
      const isOpen = yaoContent.classList.contains('max-h-[4000px]');
      if (isOpen) {
        yaoContent.classList.remove('max-h-[4000px]', 'opacity-100');
        yaoContent.classList.add('max-h-0', 'opacity-0');
        toggle.textContent = '展开爻辞详析';
      } else {
        yaoContent.classList.remove('max-h-0', 'opacity-0');
        yaoContent.classList.add('max-h-[4000px]', 'opacity-100');
        toggle.textContent = '收起爻辞';
      }
    });

    const lineContainer = document.createElement('div');
    lineContainer.className = 'flex flex-col gap-4 mt-3 bg-divine-ink/30 p-3 rounded-lg border border-divine-gold/20';

    [...lines].reverse().forEach((line, idx) => {
      const realIdx = 5 - idx;
      const isYang = (line.sum === 7 || line.sum === 9);
      const isChanging = (line.sum === 6 || line.sum === 9);
      const yaoText = state.showTranslation ? (hexagram.yao_detail_cn[realIdx] || '') : (hexagram.yao_detail[realIdx] || '');

      const row = document.createElement('div');
      row.className = 'flex flex-col md:flex-row items-center md:items-start gap-3 border-b border-divine-gold/5 pb-3 last:pb-0 last:border-0';
      row.innerHTML = `
        <div class="flex items-center justify-center relative mt-1">
          <span class="absolute -left-8 text-xs text-gray-600 w-6 text-right">${realIdx + 1}爻</span>
          ${buildLineBar(isYang, isChanging)}
        </div>
        <div class="flex-1 text-sm ${state.showTranslation ? 'text-gray-100' : 'text-divine-paper font-serif'}">
          ${yaoText || '—'}
        </div>
      `;
      lineContainer.appendChild(row);
    });

    yaoContent.appendChild(lineContainer);
    yaoWrapper.appendChild(toggle);
    yaoWrapper.appendChild(yaoContent);
    card.appendChild(yaoWrapper);
  }

  return card;
}

function renderInterpretationGuide() {
  const target = document.getElementById('interpretation-guide');
  if (!state.reading) {
    target.textContent = '';
    return;
  }
  const changes = state.reading.changingLines;
  const count = changes.length;
  const allLines = [1, 2, 3, 4, 5, 6];
  const unchanging = allLines.filter((x) => !changes.includes(x));

  let title = '';
  let content = '';
  if (count === 0) {
    title = '六爻安静';
    content = '请主要参考本卦的卦辞。事物处于相对稳定状态。';
  } else if (count === 1) {
    title = '一爻变';
    content = `参考本卦第 ${changes[0]} 爻的爻辞，该爻是事情变化的关键。`;
  } else if (count === 2) {
    const upper = Math.max(...changes);
    title = '两爻变';
    content = `参考两个变爻的爻辞，以上爻（第 ${upper} 爻）为主。`;
  } else if (count === 3) {
    title = '三爻变';
    content = '综合本卦与变卦，以本卦卦辞为主。';
  } else if (count === 4) {
    const lower = Math.min(...unchanging);
    title = '四爻变';
    content = `重点参考变卦中两个不变爻（${unchanging.join(', ')}），以下爻（第 ${lower} 爻）为主。`;
  } else if (count === 5) {
    title = '五爻变';
    content = `参考变卦中唯一的不变爻（第 ${unchanging[0]} 爻）的爻辞。`;
  } else {
    title = '六爻全变';
    content = '请主要参考变卦的卦辞，事态可能出现彻底转变。';
  }

  target.innerHTML = `
    <div class="w-full max-w-4xl mx-auto p-4 bg-gradient-to-r from-divine-ink to-divine-dark border border-divine-gold/40 rounded-lg shadow-lg flex flex-col md:flex-row items-start md:items-center gap-4">
      <div class="bg-divine-gold text-divine-dark font-bold px-4 py-2 rounded">${title}</div>
      <div class="text-divine-paper/90 text-sm md:text-base leading-relaxed flex-1">
        <i class="fas fa-info-circle text-divine-gold mr-2"></i>${content}
      </div>
    </div>
  `;
}

function toggleTranslation() {
  state.showTranslation = !state.showTranslation;
  const btn = document.getElementById('toggle-translation');
  if (btn) {
    btn.textContent = state.showTranslation ? '显示古文原文' : '切换白话解释';
  }
  renderResult();
}

function buildReadingPayload() {
  if (!state.reading) return null;
  const orig = state.reading.originalHexagram;
  const trans = state.reading.transformedHexagram;
  return {
    originalHexagram: {
      name: orig.name,
      gua_detail_cn: orig.gua_detail_cn,
      gua_xiang_detail_cn: orig.gua_xiang_detail_cn,
      yao_detail_cn: orig.yao_detail_cn,
      gua_unicode: orig.gua_unicode,
    },
    transformedHexagram: trans
      ? {
          name: trans.name,
          gua_detail_cn: trans.gua_detail_cn,
          gua_xiang_detail_cn: trans.gua_xiang_detail_cn,
          yao_detail_cn: trans.yao_detail_cn,
          gua_unicode: trans.gua_unicode,
        }
      : null,
    changingLines: state.reading.changingLines,
  };
}

async function handleAIRequest() {
  if (!state.reading) {
    alert('请先完成起卦再请求 AI 解卦。');
    return;
  }
  const endpoint = AI_DEFAULT_ENDPOINT;

  const aiBtn = document.getElementById('ai-btn');
  if (aiBtn) {
    aiBtn.textContent = '请求中...';
    aiBtn.disabled = true;
  }
  state.aiLoading = true;

  const payload = {
    question: state.question,
    reading: buildReadingPayload(),
  };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error('bad status');
    const data = await resp.json();
    if (!data.text) throw new Error('no text');
    state.aiText = data.text;
  } catch (e) {
    alert('AI解卦暂不可用，请稍后再试。');
    state.aiText = '';
  } finally {
    state.aiLoading = false;
    if (aiBtn) {
      aiBtn.textContent = '点击请求解卦';
      aiBtn.disabled = false;
    }
    renderResult();
  }
}

// ----- Three.js 3D 铜钱场景 -----
function lerpAngle(a, b, t) {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

async function ensureThreeScene() {
  if (threeCtx) return threeCtx;
  const container = document.getElementById('three-container');
  if (!container) return null;

  const THREE = await import('./assets/three.module.js');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2623');

  const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 6, 4);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '12px';
  overlay.style.textAlign = 'center';
  overlay.style.pointerEvents = 'none';
  overlay.style.color = '#f1d48cbf';
  overlay.style.fontFamily = '"Noto Serif SC", serif';
  overlay.style.fontSize = '16px';
  overlay.style.letterSpacing = '0.12em';
  overlay.textContent = '铜钱已定';
  container.appendChild(overlay);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xe7dfc6, 0x111111, 0.5);
  scene.add(hemi);

  const spot = new THREE.SpotLight(0xffffff, 2.5, 24, 0.55, 0.4);
  spot.position.set(5, 10, 5);
  spot.castShadow = true;
  scene.add(spot);

  const point = new THREE.PointLight('#e9c46a', 1.2, 14);
  point.position.set(-3, 4, -3);
  scene.add(point);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#2d2a28', roughness: 0.55, metalness: 0.12 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  // Coin geometry & materials
  const coinGeometry = (() => {
    const shape = new THREE.Shape();
    const radius = 0.6;
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    const s = 0.16;
    hole.moveTo(-s, -s);
    hole.lineTo(s, -s);
    hole.lineTo(s, s);
    hole.lineTo(-s, s);
    hole.closePath();
    shape.holes.push(hole);
    const settings = { depth: 0.04, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 };
    return new THREE.ExtrudeGeometry(shape, settings);
  })();

  const texture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);
    ctx.font = 'bold 110px "Noto Serif SC","STKaiti","KaiTi","楷体",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3e2b15';
    const cx = 256;
    const cy = 256;
    const r = 145;
    ctx.fillText('康', cx, cy - r);
    ctx.fillText('熙', cx, cy + r);
    ctx.fillText('通', cx + r, cy);
    ctx.fillText('寶', cx - r, cy);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  const brassMaterial = new THREE.MeshStandardMaterial({
    color: '#d4af37',
    roughness: 0.35,
    metalness: 0.85,
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    roughness: 0.8,
    depthWrite: false,
  });

  function createCoin(basePosition) {
    const group = new THREE.Group();
    group.position.set(basePosition[0], 0.04, basePosition[2]);

    const body = new THREE.Mesh(coinGeometry, brassMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.z = -0.02;
    group.add(body);

    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), faceMaterial);
    face.position.z = 0.042;
    group.add(face);

    scene.add(group);

    return {
      group,
      base: new THREE.Vector3(basePosition[0], 0.04, basePosition[2]),
      targetPos: new THREE.Vector3(basePosition[0], 0.04, basePosition[2]),
      targetRot: new THREE.Euler(-Math.PI / 2, 0, 0),
    };
  }

  const coins = [
    createCoin([-1.0, 0, 0]),
    createCoin([0, 0, 1.0]),
    createCoin([1.0, 0, 0]),
  ];

  function setResult(result) {
    coins.forEach((coin, idx) => {
      const randomSpin = Math.random() * Math.PI * 2;
      const targetFace = result ? result[idx] : CoinSide.Manchu;
      const rotX = targetFace === CoinSide.Chinese ? -Math.PI / 2 : Math.PI / 2;
      coin.targetRot = new THREE.Euler(rotX, 0, randomSpin);
      coin.targetPos = new THREE.Vector3(
        coin.base.x * 1.1 + (Math.random() - 0.5) * 0.3,
        0.04,
        coin.base.z * 1.1 + (Math.random() - 0.5) * 0.3
      );
    });
  }

  const clock = new THREE.Clock();
  function animate() {
    const delta = clock.getDelta();
    const t = clock.elapsedTime;
    coins.forEach((coin, idx) => {
      if (threeCtx && threeCtx.isShaking) {
        coin.group.position.y = 1.8 + Math.sin(t * 25 + idx) * 0.2;
        coin.group.position.x = Math.cos(t * 15 + idx) * 0.5;
        coin.group.position.z = Math.sin(t * 20 + idx) * 0.5;
        coin.group.rotation.x += 0.8 * (delta * 60);
        coin.group.rotation.y += 0.5 * (delta * 60);
        coin.group.rotation.z += 0.6 * (delta * 60);
      } else {
        coin.group.position.lerp(coin.targetPos, 0.12);
        coin.group.rotation.x = lerpAngle(coin.group.rotation.x, coin.targetRot.x, 0.18);
        coin.group.rotation.y = lerpAngle(coin.group.rotation.y, coin.targetRot.y, 0.18);
        coin.group.rotation.z = lerpAngle(coin.group.rotation.z, coin.targetRot.z, 0.18);
      }
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  function handleResize() {
    if (!container) return;
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', handleResize);

  threeCtx = {
    scene,
    renderer,
    camera,
    coins,
    overlay,
    isShaking: false,
    setResult,
  };
  setResult(null);
  return threeCtx;
}

function bindEvents() {
  document.getElementById('question-input')?.addEventListener('input', (e) => {
    state.question = e.target.value || '';
  });

  document.getElementById('question-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startDivination();
  });

  document.getElementById('start-btn')?.addEventListener('click', startDivination);
  document.getElementById('auto-btn')?.addEventListener('click', handleInstantDivination);
  document.getElementById('simulate-btn')?.addEventListener('click', () => updateMode('simulated'));
  document.getElementById('shake-btn')?.addEventListener('click', handleSimulatedShake);
  document.getElementById('reset-btn')?.addEventListener('click', resetApp);
  document.getElementById('reset-btn-secondary')?.addEventListener('click', resetApp);
  document.getElementById('toggle-translation')?.addEventListener('click', toggleTranslation);
  document.getElementById('log-toggle')?.addEventListener('click', toggleLogPanel);
  document.getElementById('ai-btn')?.addEventListener('click', handleAIRequest);
}

function toggleLogPanel() {
  const panel = document.getElementById('log-panel');
  const icon = document.getElementById('log-toggle-icon');
  if (!panel) return;
  const isOpen = panel.classList.contains('max-h-[400px]');
  if (isOpen) {
    panel.classList.remove('max-h-[400px]', 'opacity-100');
    panel.classList.add('max-h-0', 'opacity-0');
    if (icon) icon.classList.remove('rotate-180');
  } else {
    panel.classList.remove('max-h-0', 'opacity-0');
    panel.classList.add('max-h-[400px]', 'opacity-100');
    if (icon) icon.classList.add('rotate-180');
  }
}

function collapseLogPanel(force = false) {
  const panel = document.getElementById('log-panel');
  const icon = document.getElementById('log-toggle-icon');
  if (!panel) return;
  panel.classList.remove('max-h-[400px]', 'opacity-100');
  panel.classList.add('max-h-0', 'opacity-0');
  if (icon) icon.classList.remove('rotate-180');
  if (!force) return;
}

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  resetApp();
});


