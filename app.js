/* ============================================================
 * 绕线计算器 —— 数学核心 + 页面逻辑
 * 数学模型：分层密绕模型（方形排列，η=π/4）+ 体积法（填充系数 η）
 * 详见同目录《绕线长度计算.md》及页面"公式与推导"折叠区
 *
 * 结构：
 *   MathCore —— 纯数学函数，无 DOM 依赖，可被 Node 直接 require 测试
 *   UI       —— 浏览器环境下的输入绑定、实时计算、SVG 剖面渲染
 * ============================================================ */
'use strict';

/* ------------------------------------------------------------
 * 数学核心（单位约定：所有长度入参/出参均为 mm，线长 L 亦为 mm）
 * ---------------------------------------------------------- */
const MathCore = (() => {
  const EPS = 1e-9;

  /**
   * 浮点安全向下取整。
   * 直接 floor(0.9/0.3) 会因二进制误差得到 floor(2.9999999999999996)=2；
   * 先按 12 位有效数字规整，抹掉浮点尾差，再补一个远小于输入精度的
   * 绝对 epsilon（本应用所有中间量 < 1e7 mm，该 epsilon 安全）。
   */
  function floorSafe(x) {
    if (!Number.isFinite(x)) return NaN;
    return Math.floor(Number(x.toPrecision(12)) + EPS);
  }

  /** 每层匝数：线并排紧贴，每匝占轴向宽度 d */
  const turnsPerLayer = (W, d) => floorSafe(W / d);
  /** 层数：每层径向增高 d */
  const layerCount = (h, d) => floorSafe(h / d);

  /** n 个整层的理想密绕线长（mm）：分层等差数列求和 L = π·N·n·(D0 + n·d) */
  const idealLength = (n, N, D0, d) => Math.PI * N * n * (D0 + n * d);
  /** n 个整层的实际估算线长（mm）：体积法 L = 4η·N·n·(D0 + n·d) */
  const practicalLength = (n, N, D0, d, eta) => 4 * eta * N * n * (D0 + n * d);

  /** 直径口径换算：outer（外缘）时 D0 = D − 2h，h 为槽深/挡边高度 */
  function resolveD0(diam, h, meaning) {
    return meaning === 'outer' ? diam - 2 * h : diam;
  }

  function validate({ d, W, eta }) {
    if (!(d > 0)) return '线径必须大于 0';
    if (!(W > 0)) return '轮宽必须大于 0';
    if (!(eta > 0 && eta <= 1)) return '填充系数 η 应在 (0, 1] 区间';
    return null;
  }

  /**
   * 正算：由几何尺寸求可绕线长。
   * @returns {N 每层匝数, n 层数, D1 绕满后外径, L_ideal 理想线长, L_practical 实际估算, warnings}
   */
  function calcForward({ d, D0, h, W, eta }) {
    const err = validate({ d, W, eta });
    if (err) return { error: err };
    if (!(D0 >= 0)) return { error: '槽底直径不能为负（外缘口径请检查 D外 ≥ 2×槽深）' };
    if (!(h >= 0)) return { error: '槽深不能为负' };

    const N = turnsPerLayer(W, d);
    const n = layerCount(h, d);
    const warnings = [];
    if (N < 1) warnings.push('轮宽小于线径：一匝都放不下，无法缠绕');
    else if (n < 1) warnings.push('槽深小于线径：绕不进任何完整一层，可绕线长为 0');

    const ok = N >= 1 && n >= 1;
    return {
      N, n,
      D1: D0 + 2 * n * d,
      L_ideal: ok ? idealLength(n, N, D0, d) : 0,
      L_practical: ok ? practicalLength(n, N, D0, d, eta) : 0,
      warnings,
    };
  }

  /**
   * 反算：由线长求占用槽深。
   * 思路：体积公式解二次方程得连续解 h_cont，
   *       再按离散式 L(n) = 4η·N·n·(D0 + n·d)（关于 n 单调递增）
   *       直接解出最大整数层 n，占用槽深 = n·d。
   * hMax 可选（外缘口径反算时传入，用于容量校验）。
   */
  function calcReverse({ d, D0, W, eta, L, hMax }) {
    const err = validate({ d, W, eta });
    if (err) return { error: err };
    if (!(D0 >= 0)) return { error: '槽底直径不能为负（外缘口径请检查 D外 ≥ 2×最大槽深）' };
    if (!(L >= 0)) return { error: '线长不能为负' };
    if (hMax != null && hMax < 0) return { error: '最大槽深不能为负' };

    const N = turnsPerLayer(W, d);
    if (N < 1) return { error: '轮宽小于线径：一匝都放不下，无法缠绕' };

    // 连续解：h² + D0·h − L·d²/(4ηW) = 0 的正根
    const b = (L * d * d) / (4 * eta * W);
    const hCont = (-D0 + Math.sqrt(D0 * D0 + 4 * b)) / 2;

    // 整数层闭式解：d·n² + D0·n − L/(4ηN) ≤ 0 的最大整数 n
    const disc = D0 * D0 + (d * L) / (eta * N);
    let n = floorSafe((-D0 + Math.sqrt(Math.max(disc, 0))) / (2 * d));
    if (!Number.isFinite(n) || n < 0) n = 0;

    // 用精确离散式修正浮点边界（最多来回一两步）
    const Lof = (k) => (k <= 0 ? 0 : practicalLength(k, N, D0, d, eta));
    while (Lof(n + 1) <= L) n += 1;
    while (n > 0 && Lof(n) > L) n -= 1;

    const hOccupied = n * d;          // 占用槽深 = n 个整层
    const used = Lof(n);              // n 层所需线长
    const remaining = L - used;       // 剩余线长（不足再绕一整层）
    const needNext = Lof(n + 1) - L;  // 距绕满下一层还差
    const nextFull = Lof(n + 1);      // 绕满下一层总共需要的线长
    const D1 = D0 + 2 * hOccupied;    // 绕线后外径

    const warnings = [];
    if (hMax != null && hOccupied > hMax + EPS) {
      warnings.push(
        `线长超出轮容量：需要约 ${hOccupied.toFixed(1)} mm 槽深，` +
        `而挡边只有 ${hMax.toFixed(1)} mm，多余的线绕不进去`
      );
    }
    return { N, n, hCont, hOccupied, used, remaining, needNext, nextFull, D1, warnings };
  }

  return { EPS, floorSafe, turnsPerLayer, layerCount, idealLength, practicalLength, resolveD0, calcForward, calcReverse };
})();

/* ------------------------------------------------------------
 * Node 测试出口（浏览器中 module 未定义，自动跳过）
 * ---------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathCore;
}

/* ------------------------------------------------------------
 * 页面逻辑（仅浏览器环境执行）
 * ---------------------------------------------------------- */
if (typeof document !== 'undefined') {

  const $ = (id) => document.getElementById(id);

  /* ---------- 格式化工具 ---------- */
  function fmtNum(x, frac = 2) {
    if (x == null || !Number.isFinite(x)) return '—';
    const abs = Math.abs(x);
    if (abs !== 0 && (abs >= 1e9 || abs < 1e-3)) return x.toExponential(2);
    return x.toLocaleString('zh-CN', { maximumFractionDigits: frac });
  }
  const fmtM = (mm) => `${fmtNum(mm / 1000, 2)} m`;
  const fmtMm = (mm, frac = 1) => `${fmtNum(mm, frac)} mm`;

  /* ---------- 状态 ---------- */
  const state = {
    mode: 'forward',     // forward | reverse
    meaning: 'root',     // root | outer
  };
  const UNIT_MM = { mm: 1, m: 1000, km: 1e6 };
  const STORE_KEY = 'winding-calc-v1';

  /* ---------- 输入读取与校验 ---------- */
  function readNum(el) {
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : NaN;
  }

  function readState() {
    return {
      d: readNum($('inD')),
      dia: readNum($('inDia')),
      h: readNum($('inH')),
      hMax: readNum($('inHmax')),
      W: readNum($('inW')),
      L: readNum($('inL')),
      unit: $('inUnit').value,
      eta: readNum($('inEta')),
    };
  }

  const missingFields = (s) =>
    state.mode === 'forward'
      ? ['d', 'dia', 'h', 'W', 'eta'].filter((k) => !Number.isFinite(s[k]))
      : ['d', 'dia', 'W', 'eta', 'L'].concat(
          state.meaning === 'outer' ? ['hMax'] : []
        ).filter((k) => !Number.isFinite(s[k]));

  /* ---------- 主计算 ---------- */
  function recalc() {
    const s = readState();
    const miss = missingFields(s);
    if (miss.length) {
      showEmpty(`请完整填写参数后实时计算（缺：${miss.join('、')}）`);
      return;
    }
    if (!(s.eta > 0 && s.eta <= 1)) {
      showError(`填充系数 η 应在 (0, 1] 区间，当前为 ${s.eta}`);
      return;
    }

    if (state.mode === 'forward') {
      const D0 = MathCore.resolveD0(s.dia, s.h, state.meaning);
      if (state.meaning === 'outer' && D0 <= 0) {
        showError('外缘直径必须大于 2×槽深，否则槽底直径 ≤ 0');
        return;
      }
      const r = MathCore.calcForward({ d: s.d, D0, h: s.h, W: s.W, eta: s.eta });
      if (r.error) return showError(r.error);
      renderForward(r, s);
      renderSpool({ D0, hAvail: s.h, hOcc: r.n * s.d, W: s.W, d: s.d });
    } else {
      let D0, hAvail;
      if (state.meaning === 'outer') {
        D0 = MathCore.resolveD0(s.dia, s.hMax, 'outer');
        if (D0 <= 0) { showError('外缘直径必须大于 2×最大槽深，否则槽底直径 ≤ 0'); return; }
        hAvail = s.hMax;
      } else {
        D0 = s.dia;
        hAvail = null; // 未知，可视化时让挡边贴住绕线
      }
      const Lmm = s.L * UNIT_MM[s.unit];
      const r = MathCore.calcReverse({ d: s.d, D0, W: s.W, eta: s.eta, L: Lmm, hMax: hAvail });
      if (r.error) return showError(r.error);
      renderReverse(r, s, Lmm);
      renderSpool({ D0, hAvail: hAvail == null ? r.hOccupied : hAvail, hOcc: r.hOccupied, W: s.W, d: s.d });
    }
    saveState(s);
  }

  /* ---------- 结果渲染 ---------- */
  const warnHtml = (ws) => ws.length
    ? `<div class="warnbox" role="alert">${ws.map((w) => `<p>${svgIcon('alert')}${w}</p>`).join('')}</div>`
    : '';

  function statCard(label, value, sub, cls = '') {
    return `<div class="stat ${cls}"><div class="stat-label">${label}</div>
      <div class="stat-value num">${value}</div>
      ${sub ? `<div class="stat-sub num">${sub}</div>` : ''}</div>`;
  }

  function renderForward(r, s) {
    $('errBox').hidden = true;
    $('resEmpty').hidden = true;
    $('resReverse').hidden = true;
    const box = $('resForward');
    box.hidden = false;
    box.innerHTML = `
      <div class="stat-row">
        ${statCard('可绕线长（当前 η 估算）', fmtM(r.L_practical), `≈ ${fmtMm(r.L_practical, 0)}`, 'primary')}
        ${statCard('理想密绕线长', fmtM(r.L_ideal), `≈ ${fmtMm(r.L_ideal, 0)} · η=π/4`, '')}
      </div>
      <div class="stat-grid">
        ${statCard('每层匝数 N', r.N, `${fmtMm(s.W)} ÷ ${fmtMm(s.d)}`)}
        ${statCard('总层数 n', r.n, `${fmtMm(s.h)} ÷ ${fmtMm(s.d)}`)}
        ${statCard('绕满后外径 D₁', fmtMm(r.D1), `D₀ + 2·n·d`)}
        ${statCard('填充系数 η', fmtNum(s.eta, 3), '可在左侧调整')}
      </div>
      ${warnHtml(r.warnings)}`;
  }

  function renderReverse(r, s, Lmm) {
    $('errBox').hidden = true;
    $('resEmpty').hidden = true;
    $('resForward').hidden = true;
    const box = $('resReverse');
    box.hidden = false;
    box.innerHTML = `
      <div class="stat-row">
        ${statCard('占用槽深（整层）', fmtMm(r.hOccupied), `${r.n} 层 × ${fmtMm(s.d)}`, 'primary')}
        ${statCard('连续估算槽深', fmtMm(r.hCont), '体积方程的实数解', '')}
      </div>
      <div class="stat-grid">
        ${statCard('总层数 n', r.n, `每层 ${fmtMm(s.d)}`)}
        ${statCard('绕线后外径 D₁', fmtMm(r.D1), `D₀ + 2·h`)}
        ${statCard('已耗线长', fmtM(r.used), `≈ ${fmtMm(r.used, 0)}`)}
        ${statCard('剩余线长', fmtM(r.remaining), '不足再绕一整层')}
        ${statCard('距绕满下一层还差', fmtM(r.needNext), `下一层共需 ${fmtM(r.nextFull)}`)}
        ${statCard('填充系数 η', fmtNum(s.eta, 3), '可在左侧调整')}
      </div>
      ${warnHtml(r.warnings)}
      <p class="fineprint">占用槽深按整层数计：不足一层的余线不会增加层数。</p>`;
  }

  function showEmpty(msg) {
    $('errBox').hidden = true;
    $('resForward').hidden = true;
    $('resReverse').hidden = true;
    const el = $('resEmpty');
    el.hidden = false;
    el.textContent = msg;
  }

  function showError(msg) {
    $('resForward').hidden = true;
    $('resReverse').hidden = true;
    $('resEmpty').hidden = true;
    const el = $('errBox');
    el.hidden = false;
    el.innerHTML = `<p>${svgIcon('alert')}${msg}</p>`;
  }

  /* ---------- SVG 剖面可视化 ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const VB = { w: 480, h: 300 };

  function setAttrs(el, attrs) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  }

  function renderSpool({ D0, hAvail, hOcc, W, d }) {
    const drawL = 96, drawR = 386;              // 左右留白给尺寸标注
    const drawT = 24, drawB = VB.h - 24 - 34;   // 底部留 W 标注
    const ft = Math.max(2, W * 0.06);           // 挡边厚度（mm）
    const s = Math.min(
      (drawR - drawL - 8) / (W + 2 * ft),
      (drawB - drawT - 8) / (D0 + 2 * Math.max(hAvail, hOcc, 0.001)),
    );
    const cx = (drawL + drawR) / 2, cy = (drawT + drawB) / 2;
    const halfW = (W * s) / 2, ftPx = ft * s;

    // 线圈截面圆 pattern：示意尺寸钳制在可读范围，不随缩放消失
    const tile = Math.min(26, Math.max(6, s * d));
    setAttrs($('wirePat'), { width: tile, height: tile });
    setAttrs($('patCircle'), { cx: tile / 2, cy: tile / 2, r: tile * 0.44 });

    // 槽底（芯轴）
    setAttrs($('coreRect'), {
      x: cx - halfW, width: W * s,
      y: cy - (D0 * s) / 2, height: Math.max(D0 * s, 1),
    });
    // 挡边（左右）
    const flangeH = (D0 + 2 * hAvail) * s;
    for (const [id, sign] of [['flangeL', -1], ['flangeR', 1]]) {
      setAttrs($(id), {
        x: cx + sign * halfW - (sign < 0 ? ftPx : 0),
        width: ftPx, y: cy - flangeH / 2, height: flangeH,
      });
    }
    // 线圈（上下两条带）
    const bandH = hOcc * s;
    setAttrs($('bandTop'), { x: cx - halfW, width: W * s, y: cy - (D0 / 2 + hOcc) * s, height: bandH });
    setAttrs($('bandBot'), { x: cx - halfW, width: W * s, y: cy + (D0 / 2) * s, height: bandH });

    // 溢出警示：绕线超出挡边
    const overflow = hOcc > hAvail + MathCore.EPS;
    const ol = $('overflowLine');
    ol.style.display = overflow ? '' : 'none';
    if (overflow) {
      const y = cy - (D0 / 2 + hAvail) * s;
      setAttrs(ol, { x1: cx - halfW - ftPx - 4, x2: cx + halfW + ftPx + 4, y1: y, y2: y });
    }

    // 尺寸标注：D₀（左）、D₁（右）、W（下）
    const xL = cx - halfW - ftPx - 12;
    setAttrs($('dimD0Line'), { x1: xL, x2: xL, y1: cy - (D0 * s) / 2, y2: cy + (D0 * s) / 2 });
    const t0 = $('dimD0Text');
    t0.textContent = `D₀ ${fmtNum(D0, 1)}`;
    t0.setAttribute('x', xL - 6); t0.setAttribute('y', cy + 4);

    const showD1 = hOcc > MathCore.EPS;
    const d1 = D0 + 2 * hOcc;
    const xR = cx + halfW + ftPx + 12;
    setAttrs($('dimD1Line'), {
      x1: xR, x2: xR, y1: cy - (d1 * s) / 2, y2: cy + (d1 * s) / 2,
      display: showD1 ? '' : 'none',
    });
    const t1 = $('dimD1Text');
    t1.textContent = `D₁ ${fmtNum(d1, 1)}`;
    t1.setAttribute('x', xR + 6); t1.setAttribute('y', cy + 4);
    t1.style.display = showD1 ? '' : 'none';

    const yW = cy + ((D0 / 2 + Math.max(hOcc, hAvail)) * s) + 12;
    setAttrs($('dimWLine'), { x1: cx - halfW, x2: cx + halfW, y1: yW, y2: yW });
    const tw = $('dimWText');
    tw.textContent = `W ${fmtNum(W, 1)}`;
    tw.setAttribute('x', cx); tw.setAttribute('y', yW + 14);

    // 图例数值
    $('legD0').textContent = fmtNum(D0, 1);
    $('legW').textContent = fmtNum(W, 1);
    $('legH').textContent = fmtNum(hAvail, 1);
    $('legOcc').textContent = fmtNum(hOcc, 1);
  }

  /* ---------- 内联 SVG 图标（Lucide 风格，24 viewBox） ---------- */
  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    spool: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/><rect x="7" y="9" width="10" height="6" rx="1"/><path d="M7 12h10"/>',
  };
  function svgIcon(name, cls = 'icon') {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  /* ---------- 主题切换 ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('themeToggle').setAttribute('aria-pressed', String(t === 'dark'));
  }
  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('winding-theme', next); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------- 输入持久化 ---------- */
  function saveState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...s, mode: state.mode, meaning: state.meaning })); }
    catch (e) { /* 忽略 */ }
  }
  function restoreState() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return; }
    if (!saved) return;
    const map = { inD: 'd', inDia: 'dia', inH: 'h', inHmax: 'hMax', inW: 'W', inL: 'L', inEta: 'eta' };
    for (const [id, key] of Object.entries(map)) {
      if (Number.isFinite(saved[key])) $(id).value = String(saved[key]);
    }
    if (saved.unit && UNIT_MM[saved.unit]) $('inUnit').value = saved.unit;
    if (saved.mode === 'reverse') setMode('reverse');
    if (saved.meaning === 'outer') setMeaning('outer');
  }

  /* ---------- 模式与口径切换 ---------- */
  function setMode(mode) {
    state.mode = mode;
    $('modeForward').classList.toggle('active', mode === 'forward');
    $('modeReverse').classList.toggle('active', mode === 'reverse');
    $('modeForward').setAttribute('aria-pressed', String(mode === 'forward'));
    $('modeReverse').setAttribute('aria-pressed', String(mode === 'reverse'));
    $('fieldH').hidden = mode !== 'forward';
    $('fieldL').hidden = mode !== 'reverse';
    updateMeaningUi();
  }

  function setMeaning(meaning) {
    state.meaning = meaning;
    $('meaningRoot').classList.toggle('active', meaning === 'root');
    $('meaningOuter').classList.toggle('active', meaning === 'outer');
    $('meaningRoot').setAttribute('aria-pressed', String(meaning === 'root'));
    $('meaningOuter').setAttribute('aria-pressed', String(meaning === 'outer'));
    updateMeaningUi();
  }

  function updateMeaningUi() {
    const root = state.meaning === 'root';
    $('diaLabel').textContent = root ? '轮的直径（槽底 D₀）' : '轮的直径（外缘 D外）';
    const needHmax = state.mode === 'reverse' && !root;
    $('fieldHmax').hidden = !needHmax;
    $('hmaxHint').hidden = !needHmax;
    $('diaHint').textContent =
      state.mode === 'forward'
        ? (root
          ? '第一层线贴着的圆柱面直径'
          : '含槽深的外缘直径，将按 D₀ = D外 − 2×槽深 换算')
        : (root
          ? '绕线起始的槽底（芯轴）直径'
          : '挡边外缘直径，需配合最大槽深推算槽底 D₀ = D外 − 2×h_max');
  }

  /* ---------- η 预设 ---------- */
  const ETA_PRESETS = [
    ['理想密绕 0.785', 0.785],
    ['手工乱绕 0.70', 0.70],
    ['机器排线 0.85', 0.85],
    ['精密排线 0.90', 0.90],
  ];
  function renderEtaPresets() {
    $('etaPresets').innerHTML = ETA_PRESETS.map(([label, v], i) =>
      `<button type="button" class="chip" data-eta="${v}" ${i === 0 ? 'data-default="1"' : ''}>${label}</button>`
    ).join('');
  }
  function refreshEtaChips() {
    const v = readNum($('inEta'));
    document.querySelectorAll('#etaPresets .chip').forEach((c) => {
      c.classList.toggle('active', Math.abs(parseFloat(c.dataset.eta) - v) < 1e-9);
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    renderEtaPresets();
    restoreState();

    $('themeToggle').addEventListener('click', toggleTheme);
    $('modeForward').addEventListener('click', () => { setMode('forward'); recalc(); });
    $('modeReverse').addEventListener('click', () => { setMode('reverse'); recalc(); });
    $('meaningRoot').addEventListener('click', () => { setMeaning('root'); recalc(); });
    $('meaningOuter').addEventListener('click', () => { setMeaning('outer'); recalc(); });
    $('etaPresets').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      $('inEta').value = btn.dataset.eta;
      refreshEtaChips();
      recalc();
    });

    for (const id of ['inD', 'inDia', 'inH', 'inHmax', 'inW', 'inL', 'inEta', 'inUnit']) {
      $(id).addEventListener('input', () => { refreshEtaChips(); recalc(); });
    }

    applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
    refreshEtaChips();
    updateMeaningUi();
    recalc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
