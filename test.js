/* 绕线计算器数学核心单元测试 —— node test.js */
'use strict';
const M = require('./app.js');

let passed = 0, failed = 0;
function eq(name, actual, expected, tol = 1e-6) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected))
    : Object.is(actual, expected);
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}: 期望 ${expected}，实际 ${actual}`); }
}

console.log('— 浮点安全取整 —');
eq('floorSafe(0.9/0.3) = 3（经典二进制误差案例）', M.floorSafe(0.9 / 0.3), 3);
eq('floorSafe(0.3/0.1) = 3', M.floorSafe(0.3 / 0.1), 3);
eq('floorSafe(2.5) = 2（真分数不误进）', M.floorSafe(2.5), 2);
eq('floorSafe(49.99999999999999) = 50', M.floorSafe(49.99999999999999), 50);
eq('floorSafe(50) = 50', M.floorSafe(50), 50);
eq('floorSafe(2.999999) = 2（非误差尾差不得抹平）', M.floorSafe(2.999999), 2);

console.log('— 文档算例：d=1, D0=100, h=20, W=50 —');
const f = M.calcForward({ d: 1, D0: 100, h: 20, W: 50, eta: Math.PI / 4 });
eq('每层匝数 N = 50', f.N, 50);
eq('总层数 n = 20', f.n, 20);
eq('理想线长 ≈ 376991.12 mm（377 m）', f.L_ideal, 376991.11843077515, 1e-9);
eq('η=π/4 时实际估算 = 理想', f.L_practical, f.L_ideal, 1e-12);
eq('绕满后外径 D1 = 140', f.D1, 140);
const f7 = M.calcForward({ d: 1, D0: 100, h: 20, W: 50, eta: 0.7 });
eq('η=0.7 时实际估算 = 336000 mm（336 m）', f7.L_practical, 336000, 1e-9);

console.log('— 外缘口径换算 —');
eq('resolveD0(140, 20, outer) = 100', M.resolveD0(140, 20, 'outer'), 100);
eq('resolveD0(100, 20, root) = 100', M.resolveD0(100, 20, 'root'), 100);
const fo = M.calcForward({ d: 1, D0: M.resolveD0(140, 20, 'outer'), h: 20, W: 50, eta: Math.PI / 4 });
eq('外缘口径正算与槽底口径一致', fo.L_ideal, f.L_ideal, 1e-12);

console.log('— 浮点线径正算：d=0.3, W=30 → N=100（而非 99）—');
const fp = M.calcForward({ d: 0.3, D0: 100, h: 9, W: 30, eta: Math.PI / 4 });
eq('N = 100', fp.N, 100);
eq('n = 30', fp.n, 30);

console.log('— 反算：整卷回代 —');
const r1 = M.calcReverse({ d: 1, D0: 100, W: 50, eta: Math.PI / 4, L: f.L_ideal });
eq('层数 n = 20', r1.n, 20);
eq('占用槽深 = 20 mm', r1.hOccupied, 20, 1e-9);
eq('连续解 hCont ≈ 20', r1.hCont, 20, 1e-9);
eq('耗线 = 全部线长', r1.used, f.L_ideal, 1e-9);
eq('剩余线长 ≈ 0', r1.remaining, 0, 1e-6);

console.log('— 反算：半卷线 —');
const r2 = M.calcReverse({ d: 1, D0: 100, W: 50, eta: Math.PI / 4, L: f.L_ideal / 2 });
eq('层数 n = 10（π·50·11·111 > L > π·50·10·110）', r2.n, 10);
eq('占用槽深 = 10 mm', r2.hOccupied, 10, 1e-9);
eq('剩余线长 = L − L(10)', r2.remaining, f.L_ideal / 2 - M.practicalLength(10, 50, 100, 1, Math.PI / 4), 1e-6);
eq('下一层共需 = L(11)', r2.nextFull, M.practicalLength(11, 50, 100, 1, Math.PI / 4), 1e-9);

console.log('— 反算：浮点线径回代 —');
const Lf = M.calcForward({ d: 0.3, D0: 80, h: 15, W: 30, eta: 0.85 });
const r3 = M.calcReverse({ d: 0.3, D0: 80, W: 30, eta: 0.85, L: Lf.L_practical });
eq('浮点参数反算层数一致（n=50）', r3.n, 50);
eq('浮点参数反算占用槽深 = 15 mm', r3.hOccupied, 15, 1e-9);

console.log('— 反算：容量溢出校验（外缘口径）—');
const r4 = M.calcReverse({ d: 1, D0: 100, W: 50, eta: 0.7, L: 8e6, hMax: 20 });
eq('溢出时产生警告', r4.warnings.length > 0, true);

console.log('— 边界与错误 —');
const fw = M.calcForward({ d: 5, D0: 100, h: 20, W: 4, eta: 0.7 });
eq('d > W：N=0、线长 0 + 警告', fw.N === 0 && fw.L_ideal === 0 && fw.warnings.length > 0, true);
const e1 = M.calcForward({ d: 0, D0: 100, h: 20, W: 50, eta: 0.7 });
eq('线径 0 报错', e1.error !== undefined, true);
const e2 = M.calcReverse({ d: 1, D0: 100, W: 0.5, eta: 0.7, L: 1e5 });
eq('轮宽 < 线径反算报错（W=0.5 < d=1）', e2.error !== undefined, true);
const e3 = M.calcReverse({ d: 1, D0: 100, W: 50, eta: 0.7, L: 0 });
eq('L=0 → n=0，占用槽深 0', e3.hOccupied, 0);
eq('L=0 → 距下一层 = L(1)', e3.needNext, M.practicalLength(1, 50, 100, 1, 0.7), 1e-9);
const f0 = M.calcForward({ d: 1, D0: 100, h: 0.5, W: 50, eta: 0.7 });
eq('槽深 < 线径 → n=0、线长 0 + 警告', f0.n === 0 && f0.L_ideal === 0 && f0.warnings.length > 0, true);

console.log('— 单调性抽查（反算闭式解与暴力搜索一致）—');
let monoOk = true;
const monoCases = [
  { d: 1, D0: 100, W: 50, eta: 0.7 },
  { d: 0.3, D0: 80, W: 30, eta: 0.85 },
  { d: 0.5, D0: 40, W: 20, eta: 0.9 },
  { d: 2, D0: 200, W: 80, eta: 0.6 },
];
for (const c of monoCases) {
  const N = M.turnsPerLayer(c.W, c.d);
  const L = M.practicalLength(37, N, c.D0, c.d, c.eta) * 0.83;
  const r = M.calcReverse({ ...c, L });
  let brute = 0;
  while (M.practicalLength(brute + 1, N, c.D0, c.d, c.eta) <= L) brute++;
  if (r.n !== brute) { monoOk = false; console.error(`  ✗ d=${c.d}: 闭式解 ${r.n} ≠ 暴力 ${brute}`); }
}
eq('四组参数闭式解 = 暴力搜索', monoOk, true);

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
