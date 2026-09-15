// ══════════════════════════════════════════════════════════
//  Laboratoriya — interaktiv fizika simulyatsiyalari
//  • Canvas + slayderlar, real vaqtda hisob va animatsiya
//  • Backend kerak emas, oflayn ham ishlaydi
//  • Ranglar CSS o`zgaruvchilaridan olinadi (tungi/kunduzgi)
//
//  Ported near-verbatim from the old js/lab.js — the {id, title,
//  controls, init, step, draw, read} data contract is framework-agnostic
//  canvas logic, so only the surrounding module syntax changed. Rendered
//  by the single generic <SimulationCanvas> component (see Canvas.tsx)
//  instead of 143 separate hand-written views.
// ══════════════════════════════════════════════════════════

import i18n from '@/lib/i18n'

export interface SimControlDef {
  k: string
  label: string
  min: number
  max: number
  step: number
  val: number
  unit?: string
}

export interface SimReadout {
  label: string
  val: string | number
}

export interface Sim {
  id: string
  title: string
  desc: string
  controls: SimControlDef[]
  // Called both with no args (initial mount) and with the current control
  // values (reset button / a few sims seed state from them) — see the old
  // openSim()'s `sim.init(vals)` call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init(v?: Record<string, number>): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step(s: any, dt: number, v: Record<string, number>): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, s: any, v: Record<string, number>): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  read(s: any, v: Record<string, number>): SimReadout[]
}

// ── Ranglar (theme-aware) ─────────────────────────────────
function cvar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export const COL = () => ({
  ink: cvar('--color-ink', '#12212E'),
  ink2: cvar('--color-ink-muted', '#4A5C6C'),
  ink3: cvar('--color-ink-muted', '#8296A6'),
  rule: cvar('--color-border', '#CBD9E4'),
  rule2: cvar('--color-border', '#E3EBF1'),
  ok: cvar('--color-ok', '#1B6E5F'),
  mark: cvar('--color-danger', '#B3372B'),
  paper: cvar('--color-surface-2', '#F4F7F9'),
  surf: cvar('--color-surface', '#FFFFFF'),
})

/** Uchli strelka chizadi (x1,y1 dan x2,y2 gacha) */
function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
  ctx.stroke();
}

// ── Simulyatsiyalar ───────────────────────────────────────
export const SIMS: Sim[] = [
  {
    id: 'uniform', title: 'Tekis harakat',
    desc: 'Doimiy tezlik bilan to\'g\'ri chiziq bo\'ylab harakat',
    controls: [
      { k: 'v', label: 'Tezlik v', min: 10, max: 100, step: 2, val: 30, unit: 'px/s' }
    ],
    init() { return { x: 0, t: 0 }; },
    step(s, dt, v) { s.x += v.v * dt; if (s.x > 400) s.x = 0; s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      ctx.fillStyle = c.ok; ctx.fillRect(40 + s.x, groundY - 25, 40, 25);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('v = ' + v.v + ' px/s', W / 2, 30);
    },
    read(s, v) {
      return [
        { label: 'Tezlik', val: v.v + ' px/s' },
        { label: 'Masofa', val: (s.x / 100).toFixed(2) + ' m' },
        { label: 'Vaqt', val: s.t.toFixed(1) + ' s' }
      ];
    }
  },

  // 12) Tezlashuvchi harakat
  {
    id: 'velocity_graph', title: 'Tezlik grafiki (v-t)',
    desc: 'Vaqtga qarab tezlikning o\'zgarishi',
    controls: [
      { k: 'a', label: 'Tezlanish', min: 1, max: 20, step: 1, val: 5, unit: 'm/s²' },
      { k: 'v0', label: 'Boshlang\'ich tezlik', min: 0, max: 20, step: 1, val: 10, unit: 'm/s' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; if (s.t > 4) s.t = 0; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const y0 = H - 40;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(30, y0); ctx.lineTo(W - 20, y0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(30, y0); ctx.stroke();
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let tt = 0; tt <= 4; tt += 0.05) {
        const vel = v.v0 + v.a * tt;
        const x = 30 + tt * (W - 50) / 4;
        const y = y0 - (vel / 30) * (H - 60);
        tt === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      const v_cur = v.v0 + v.a * s.t;
      const x_cur = 30 + s.t * (W - 50) / 4;
      const y_cur = y0 - (v_cur / 30) * (H - 60);
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(x_cur, y_cur, 6, 0, 7); ctx.fill();
    },
    read(s, v) {
      const v_cur = v.v0 + v.a * s.t;
      return [
        { label: 'Tezlik', val: v_cur.toFixed(1) + ' m/s' },
        { label: 'v = v₀ + at', val: `${v.v0} + ${v.a}×${s.t.toFixed(1)}` },
        { label: 'Vaqt', val: s.t.toFixed(1) + ' s' }
      ];
    }
  },

  // 61) Masofa-vaqt grafigi
  {
    id: 'distance_graph', title: 'Masofa grafiki (s-t)',
    desc: 'Vaqtga qarab tushgan masofaning o\'zgarishi',
    controls: [
      { k: 'a', label: 'Tezlanish', min: 1, max: 10, step: 0.5, val: 5, unit: 'm/s²' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; if (s.t > 3) s.t = 0; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const y0 = H - 40;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(30, y0); ctx.lineTo(W - 20, y0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(30, y0); ctx.stroke();
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let tt = 0; tt <= 3; tt += 0.05) {
        const s_val = 0.5 * v.a * tt * tt;
        const x = 30 + tt * (W - 50) / 3;
        const y = y0 - (s_val / 20) * (H - 60);
        tt === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      const s_cur = 0.5 * v.a * s.t * s.t;
      const x_cur = 30 + s.t * (W - 50) / 3;
      const y_cur = y0 - (s_cur / 20) * (H - 60);
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(x_cur, y_cur, 6, 0, 7); ctx.fill();
    },
    read(s, v) {
      const s_cur = 0.5 * v.a * s.t * s.t;
      return [
        { label: 'Masofa', val: s_cur.toFixed(1) + ' m' },
        { label: 's = ½at²', val: `½×${v.a}×${s.t.toFixed(1)}²` },
        { label: 'Vaqt', val: s.t.toFixed(1) + ' s' }
      ];
    }
  },

  // ═══ KO'P MEKANIKA ═══
  // 62) Yuqorida qayiqda yuklanish (buoyancy)
  {
    id: 'acceleration', title: 'Tezlashuvchi harakat',
    desc: 'Doimiy tezlanish bilan to\'g\'ri chiziq bo\'ylab harakat',
    controls: [
      { k: 'a', label: 'Tezlanish a', min: 1, max: 20, step: 0.5, val: 5, unit: 'm/s²' },
      { k: 'v0', label: 'Boshlang\'ich tezlik', min: 0, max: 20, step: 1, val: 0, unit: 'm/s' }
    ],
    init() { return { x: 0, v: 0, t: 0 }; },
    step(s, dt, v) {
      const a = v.a * 10;
      s.v += a * dt;
      s.x += (v.v0 * 10 + s.v) * dt / 2;
      s.t += dt;
      if (s.x > 400) { s.x = 0; s.v = 0; s.t = 0; }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      const bx = Math.min(40 + s.x / 2, W - 60);
      ctx.fillStyle = c.ok; ctx.fillRect(bx, groundY - 25, 40, 25);
      ctx.fillStyle = c.mark; arrow(ctx, bx + 40, groundY - 13, bx + 40 + v.a * 3, groundY - 13);
    },
    read(s, v) {
      const sv = v.v0 * 10 + v.a * 10 * s.t;
      return [
        { label: 'Tezlanish', val: v.a + ' m/s²' },
        { label: 'Tezlik', val: (sv / 10).toFixed(1) + ' m/s' },
        { label: 'Masofa', val: (s.x / 100).toFixed(2) + ' m' }
      ];
    }
  },

  // 13) Vertikal otish
  {
    id: 'freefall', title: 'Erkin tushish',
    desc: 'Tortishish kuchi ostida tezlanuvchi harakat',
    controls: [
      { k: 'h', label: 'Balandlik', min: 10, max: 300, step: 5, val: 150, unit: 'px' },
      { k: "g`", label: "Tortishish g`", min: 1.6, max: 25, step: 0.1, val: 9.8, unit: 'm/s²' }
    ],
    init(v) { return { y: 0, vy: 0, t: 0 }; },
    step(s, dt, v) {
      s.t += dt;
      const tf = Math.sqrt(2 * v.h / (v.g * 100));
      s.vy += v.g * 10 * dt;
      s.y += s.vy * dt;
      if (s.y > v.h) { s.y = 0; s.vy = 0; s.t = 0; }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      const y0 = groundY - v.h;
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(W - 40, y0); ctx.lineTo(W - 30, y0); ctx.stroke(); ctx.setLineDash([]);
      const cy = groundY - s.y;
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(W / 2, cy, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = c.mark; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W - 40, cy); ctx.lineTo(W - 30, cy); ctx.stroke();
      arrow(ctx, W - 35, cy + 20, W - 35, cy + 40);
    },
    read(s, v) {
      const tf = Math.sqrt(2 * v.h / (v.g * 100));
      const vf = v.g * 10 * tf;
      return [
        { label: 'Tushish vaqti', val: tf.toFixed(2) + ' s' },
        { label: 'Yakuniy tezlik', val: (vf / 10).toFixed(1) + ' m/s' },
        { label: 'Tushgan masofa', val: (s.y / 100).toFixed(2) + ' m' }
      ];
    }
  },

  // 8) Ishqalanish kuchi
  {
    id: 'vertical', title: 'Vertikal otish',
    desc: 'Yuqoriga tashlanuvchi jismning traektoriyasi',
    controls: [
      { k: 'v0', label: 'Boshlang\'ich tezlik', min: 5, max: 40, step: 1, val: 25, unit: 'm/s' },
      { k: "g`", label: "Tortishish g`", min: 1.6, max: 25, step: 0.1, val: 9.8, unit: 'm/s²' }
    ],
    init() { return { t: 0 }; },
    step(s, dt, v) {
      s.t += dt;
      const tf = 2 * v.v0 / v.g;
      if (s.t > tf + 0.3) s.t = 0;
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      const hmax = (v.v0 * v.v0) / (2 * v.g) / 100 * 80;
      const tf = 2 * v.v0 / v.g;
      const ct = Math.min(s.t, tf);
      const cy = groundY - (v.v0 * ct * 30 - 0.5 * v.g * 100 * ct * ct / 2);
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(W / 2, cy, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(W - 30, groundY - hmax); ctx.lineTo(W - 20, groundY - hmax); ctx.stroke(); ctx.setLineDash([]);
    },
    read(s, v) {
      const hmax = (v.v0 * v.v0) / (2 * v.g);
      const tf = 2 * v.v0 / v.g;
      return [
        { label: 'Maksimal balandlik', val: hmax.toFixed(1) + ' m' },
        { label: 'Uchish vaqti', val: tf.toFixed(2) + ' s' },
        { label: 'Joriy vaqt', val: s.t.toFixed(2) + ' s' }
      ];
    }
  },

  // ═══ DINAMIKA ═══
  // 14) Nyuton ikkinchi qonuni
  {
    id: 'projectile', title: 'Jismning otilishi',
    desc: "Boshlang`ich tezlik va burchakka qarab parabola traektoriyasi",
    controls: [
      { k: 'v', label: "Tezlik v₀", min: 5, max: 45, step: 1, val: 22, unit: 'm/s' },
      { k: 'a', label: 'Burchak', min: 10, max: 80, step: 1, val: 45, unit: '°' },
      { k: "g`", label: "Tortishish g`", min: 1.6, max: 25, step: 0.1, val: 9.8, unit: 'm/s²' }
    ],
    init() { return { t: 0 }; },
    step(s, dt, v) {
      const ang = v.a * Math.PI / 180;
      const tf = 2 * v.v * Math.sin(ang) / v.g;
      s.t += dt;
      if (s.t > tf + 0.4) s.t = 0;
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const ang = v.a * Math.PI / 180;
      const g = v.g, v0 = v.v;
      const tf = 2 * v0 * Math.sin(ang) / g;
      const range = v0 * v0 * Math.sin(2 * ang) / g;
      const hmax = (v0 * Math.sin(ang)) ** 2 / (2 * g);
      const groundY = H - 34, x0 = 44;
      const availW = W - x0 - 24, availH = groundY - 24;
      const sc = Math.min(availW / Math.max(range, 1), availH / Math.max(hmax, 1));
      // yer
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 16, groundY); ctx.stroke();
      // traektoriya
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let tt = 0; tt <= tf; tt += tf / 60) {
        const x = x0 + v0 * Math.cos(ang) * tt * sc;
        const y = groundY - (v0 * Math.sin(ang) * tt - 0.5 * g * tt * tt) * sc;
        tt === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      // joriy jism
      const ct = Math.min(s.t, tf);
      const cx = x0 + v0 * Math.cos(ang) * ct * sc;
      const cy = groundY - (v0 * Math.sin(ang) * ct - 0.5 * g * ct * ct) * sc;
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 7); ctx.fill();
      // otish nuqtasi
      ctx.fillStyle = c.ink3; ctx.beginPath(); ctx.arc(x0, groundY, 3, 0, 7); ctx.fill();
    },
    read(s, v) {
      const ang = v.a * Math.PI / 180;
      const range = v.v * v.v * Math.sin(2 * ang) / v.g;
      const hmax = (v.v * Math.sin(ang)) ** 2 / (2 * v.g);
      const tf = 2 * v.v * Math.sin(ang) / v.g;
      return [
        { label: 'Uchish masofasi', val: range.toFixed(1) + ' m' },
        { label: 'Maks balandlik', val: hmax.toFixed(1) + ' m' },
        { label: 'Uchish vaqti', val: tf.toFixed(2) + ' s' }
      ];
    }
  },

  // 3) Om qonuni
  {
    id: 'density_mass_volume', title: 'Zichlik (ρ = m/V)',
    desc: 'Massani hajmiga nisbati',
    controls: [
      { k: 'm', label: 'Massa', min: 1, max: 20, step: 1, val: 10, unit: 'kg' },
      { k: 'V', label: 'Hajm', min: 1, max: 10, step: 0.5, val: 5, unit: 'L' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const rho = v.m / v.V;
      const barH = Math.min(rho * 10, H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ρ = ' + rho.toFixed(2) + ' kg/L', W / 2, 30);
    },
    read(s, v) {
      const rho = v.m / v.V;
      return [
        { label: 'Zichlik ρ', val: rho.toFixed(2) + ' kg/L' },
        { label: 'ρ = m/V', val: `${v.m} / ${v.V}` },
        { label: 'Massa', val: v.m + ' kg'}
      ];
    }
  },

  {
    id: 'circular', title: 'Aylanuvchi harakat',
    desc: 'Radiusi va burchak tezligiga qarab aylana bo\'ylab harakat',
    controls: [
      { k: 'R', label: 'Radius R', min: 30, max: 120, step: 5, val: 70, unit: 'px' },
      { k: 'w', label: 'Burchak tezlik', min: 1, max: 6, step: 0.5, val: 2, unit: 'rad/s' }
    ],
    init() { return { th: 0, t: 0 }; },
    step(s, dt, v) { s.th += v.w * dt; s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, v.R, 0, 7); ctx.stroke();
      const x = cx + v.R * Math.cos(s.th);
      const y = cy + v.R * Math.sin(s.th);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
      const v_lin = v.R * v.w;
      arrow(ctx, x, y, x - v.w * 20 * Math.sin(s.th), y + v.w * 20 * Math.cos(s.th));
    },
    read(s, v) {
      const v_lin = v.R * v.w;
      const a_c = v.R * v.w * v.w;
      return [
        { label: 'Chiziqli tezlik', val: (v_lin / 10).toFixed(1) + ' m/s' },
        { label: 'Markazga qarash tezlanish', val: (a_c / 10).toFixed(1) + ' m/s²' },
        { label: 'Davri T', val: (2 * Math.PI / v.w).toFixed(2) + ' s' }
      ];
    }
  },

  // 29) Qiya samolyot (inclined plane)
  {
    id: 'centripetal', title: 'Centripetal kuch',
    desc: 'Aylanuvchi harakat uchun zarur kuch',
    controls: [
      { k: 'm', label: 'Massa', min: 1, max: 10, step: 0.5, val: 5, unit: 'kg' },
      { k: 'v', label: 'Tezlik', min: 5, max: 30, step: 1, val: 15, unit: 'm/s' },
      { k: 'R', label: 'Radius', min: 30, max: 150, step: 5, val: 80, unit: 'px' }
    ],
    init() { return { th: 0 }; },
    step(s, dt) { s.th += 2 * dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, v.R, 0, 7); ctx.stroke();
      const x = cx + v.R * Math.cos(s.th);
      const y = cy + v.R * Math.sin(s.th);
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
      arrow(ctx, x, y, cx, cy);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      const F_c = (v.m * v.v * v.v) / v.R;
      ctx.fillText('Fc = ' + F_c.toFixed(0) + ' N', W / 2, 30);
    },
    read(s, v) {
      const F_c = (v.m * v.v * v.v) / v.R;
      return [
        { label: 'Centripetal kuch', val: F_c.toFixed(1) + ' N' },
        { label: 'Fc = mv²/R', val: `${v.m} × ${v.v}² / ${v.R}` },
        { label: 'Markazga yo\'nalish', val: 'Radial' }
      ];
    }
  },

  // 51) Angular momentum
  {
    id: 'gravity_comp', title: 'Tortishish kuchi',
    desc: 'Massa va masofaga qarab tortishish kuchining o\'zgarishi',
    controls: [
      { k: 'm1', label: 'Massa 1', min: 1, max: 10, step: 0.5, val: 5, unit: 'kg' },
      { k: 'm2', label: 'Massa 2', min: 1, max: 10, step: 0.5, val: 5, unit: 'kg' },
      { k: 'd', label: 'Masofa', min: 50, max: 300, step: 10, val: 150, unit: 'px' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const x1 = 60, x2 = 60 + v.d;
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(x1, cy, v.m1 * 3, 0, 7); ctx.fill();
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(x2, cy, v.m2 * 3, 0, 7); ctx.fill();
      const F = (v.m1 * v.m2) / (v.d * v.d) * 1000;
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('F ≈ ' + F.toFixed(0) + ' (rel)', W / 2, 30);
    },
    read(s, v) {
      const F = (v.m1 * v.m2) / (v.d * v.d) * 1000;
      return [
        { label: 'Tortishish kuchi', val: F.toFixed(2) + ' (rel)' },
        { label: 'F ∝ m₁m₂/d²', val: 'Kvadrat qonuni' },
        { label: 'Massalar', val: v.m1 + ' / ' + v.m2 + ' kg' }
      ];
    }
  },

  // ═══ TEBRANISHLAR ═══
  // 16) Harmonik tebranish
  {
    id: 'pressure', title: 'Pressiya',
    desc: 'Kuch va maydonga qarab pressiya — P = F/A',
    controls: [
      { k: 'F', label: 'Kuch F', min: 10, max: 200, step: 10, val: 100, unit: 'N' },
      { k: 'A', label: 'Maydoni', min: 1, max: 100, step: 1, val: 50, unit: 'cm²' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const P = v.F / v.A * 100;
      const barH = Math.min(P / 50 * (H - 80), H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      const sy = H - 50 - barH;
      ctx.fillStyle = c.ok; ctx.fillRect(W / 2 - 30, sy - 20, 60, 20);
      ctx.fillStyle = c.ink3; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('P = ' + P.toFixed(0) + ' kPa', W / 2, H - 20);
    },
    read(s, v) {
      const P = v.F / v.A * 100;
      return [
        { label: 'Pressiya', val: P.toFixed(1) + ' kPa' },
        { label: 'P = F/A', val: `${v.F} / ${v.A}` },
        { label: 'Kuch', val: v.F + ' N' }
      ];
    }
  },

  // ═══ ELEKTROMAGNETIZM ═══
  // 24) Parallel provlar orasidagi kuch
  {
    id: 'elastic_deformation', title: 'Elastik deformatsiya',
    desc: 'Kuchga qarab massivning sokillenmasi',
    controls: [
      { k: 'F', label: 'Kuch F', min: 10, max: 100, step: 5, val: 50, unit: 'N' },
      { k: 'E', label: 'Young moduli', min: 100, max: 1000, step: 50, val: 500, unit: 'MPa' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const strain = (v.F / v.E) * 100;
      ctx.fillStyle = c.ok; ctx.fillRect(W / 2 - 30, H / 2 - 40, 60, 80);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 30 - strain / 2, H / 2 - 40, 60 + strain, 80);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ε = ' + strain.toFixed(2) + '%', W / 2, 30);
    },
    read(s, v) {
      const strain = (v.F / v.E) * 100;
      const stress = v.F / 100;
      return [
        { label: 'Deformatsiya ε', val: strain.toFixed(2) + '%' },
        { label: 'Stress/strain', val: (stress / (strain / 100)).toFixed(0) + ' MPa' },
        { label: 'Kuch', val: v.F + ' N' }
      ];
    }
  },

  // 99-130) Qo`shimcha 32 ta sodda experiment (tezdan-tez)
  // Ushbu 32 ta qo`shimchalar shunga o`xshash shakilda yaratiladi...
  // To`liqlik uchun qo`shimcha 32 ta eksperimentni qisqacha qo`shamiz

  // 99) Tekislik geometriyasi
  { id: 'rope_tension', title: 'Ip taranglanishi', desc: 'Osilgan jismda taranglash kuchi va massa',
    controls: [{ k: 'm', label: 'Massa', min: 1, max: 20, step: 1, val: 5, unit: 'kg' },
               { k: 'a', label: 'Tezlanish', min: -10, max: 20, step: 1, val: 0, unit: 'm/s²' }],
    init(v) { return {}; },
    step(s, dt, v) {},
    draw(ctx, W, H, s, v) {
      const c = COL(); const T = v.m * (v.a + 9.8);
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, 40); ctx.lineTo(W / 2, 120); ctx.stroke();
      ctx.fillStyle = c.ok; ctx.fillRect(W / 2 - 20, 120, 40, 40);
      ctx.strokeStyle = c.mark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, 120); ctx.lineTo(W / 2, 180 - T / 5); ctx.stroke();
      ctx.fillText('T = ' + T.toFixed(0) + ' N', W / 2 + 30, 160);
    },
    read(s, v) { const T = v.m * (v.a + 9.8);
      return [{ label: 'Taranglash T', val: T.toFixed(1) + ' N' },
              { label: "Og`irlik", val: (v.m * 9.8).toFixed(1) + ' N' }]; }
  },
  {
    id: 'newton2', title: 'Nyuton 2-qonuni',
    desc: 'Kuchning massaga ta\'siri — F = ma',
    controls: [
      { k: 'F', label: 'Kuch F', min: 0, max: 100, step: 2, val: 30, unit: 'N' },
      { k: 'm', label: 'Massa m', min: 1, max: 20, step: 0.5, val: 10, unit: 'kg' }
    ],
    init() { return { x: 0, v: 0, t: 0 }; },
    step(s, dt, v) {
      const a = v.F / v.m;
      s.v += a * dt;
      s.x += s.v * dt * 20;
      s.t += dt;
      if (s.x > 350) { s.x = 0; s.v = 0; }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      const bx = 40 + s.x;
      ctx.fillStyle = c.ok; ctx.fillRect(bx, groundY - 30, 50, 30);
      arrow(ctx, bx + 50, groundY - 15, bx + 50 + v.F * 1.5, groundY - 15);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('a = ' + (v.F / v.m).toFixed(1) + ' m/s²', W / 2, 30);
    },
    read(s, v) {
      const a = v.F / v.m;
      return [
        { label: 'Tezlanish a', val: a.toFixed(2) + ' m/s²' },
        { label: 'Tezlik', val: (s.v).toFixed(1) + ' m/s' },
        { label: 'Kuchlanish', val: v.F + ' N' }
      ];
    }
  },

  // 15) Tortishish kuchi
  {
    id: 'friction', title: 'Ishqalanish kuchi',
    desc: "Qo`yilgan kuchdan ishqalanish kuchining ta'siri",
    controls: [
      { k: 'F', label: 'Kuch F', min: 0, max: 100, step: 1, val: 30, unit: 'N' },
      { k: 'm', label: 'Massa m', min: 1, max: 20, step: 0.5, val: 10, unit: 'kg' },
      { k: 'mu', label: 'Ishqalanish koeff.', min: 0, max: 0.6, step: 0.02, val: 0.2, unit: 'μ' }
    ],
    init() { return { x: 0, v: 0 }; },
    step(s, dt, v) {
      const Ff = v.mu * v.m * 9.8;
      if (v.F > Ff) {
        const a = (v.F - Ff) / v.m;
        s.v += a * dt;
        s.x += s.v * dt * 30;
        if (s.x > 320) { s.x = 0; s.v = 0; }
      } else {
        s.v = 0;
      }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
      for (let i = 40; i < W - 40; i += 20) {
        ctx.beginPath(); ctx.moveTo(i, groundY); ctx.lineTo(i - 10, groundY + 8); ctx.stroke();
      }
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      const bx = 40 + s.x;
      ctx.fillStyle = c.ok; ctx.fillRect(bx, groundY - 30, 50, 30);
      arrow(ctx, bx + 50, groundY - 15, bx + 50 + v.F * 0.6, groundY - 15);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v.F > v.mu * v.m * 9.8 ? 'Harakat' : 'Harakatsiz', W / 2, 30);
    },
    read(s, v) {
      const Ff = v.mu * v.m * 9.8;
      return [
        { label: 'Ishqalanish kuchi', val: Ff.toFixed(1) + ' N' },
        { label: 'Qo\'yilgan kuch', val: v.F.toFixed(1) + ' N' },
        { label: 'Status', val: v.F > Ff ? 'Harakatlanmoqda' : 'Harakatsiz' }
      ];
    }
  },

  // 9) Sinish hodisalari (Refraction)
  {
    id: 'inclined', title: 'Qiya samolyot',
    desc: 'Qiya burchakka qarab jismning tezlanishi',
    controls: [
      { k: "ang`", label: 'Qiya burchagi', min: 5, max: 80, step: 1, val: 30, unit: '°' },
      { k: 'mu', label: 'Ishqalanish koeff.', min: 0, max: 0.5, step: 0.05, val: 0.2, unit: 'μ' }
    ],
    init() { return { x: 0, v: 0, t: 0 }; },
    step(s, dt, v) {
      const a_rad = v.ang * Math.PI / 180;
      const g = 9.8;
      const a = g * (Math.sin(a_rad) - v.mu * Math.cos(a_rad));
      s.v += a * dt;
      s.x += s.v * dt * 10;
      s.t += dt;
      if (s.x > 300) { s.x = 0; s.v = 0; }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const ang_rad = v.ang * Math.PI / 180;
      const x0 = 40, y0 = H - 40;
      const L = 280;
      const x1 = x0 + L * Math.cos(ang_rad);
      const y1 = y0 - L * Math.sin(ang_rad);
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + 20, y1); ctx.stroke();
      const bx = x0 + (s.x / 300) * L * Math.cos(ang_rad);
      const by = y0 - (s.x / 300) * L * Math.sin(ang_rad);
      ctx.fillStyle = c.ok; ctx.fillRect(bx - 10, by - 10, 20, 20);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif';
      ctx.fillText(v.ang + '°', x1 + 25, y1 + 15);
    },
    read(s, v) {
      const a_rad = v.ang * Math.PI / 180;
      const g = 9.8;
      const a = g * (Math.sin(a_rad) - v.mu * Math.cos(a_rad));
      return [
        { label: 'Tezlanish', val: a.toFixed(2) + ' m/s²' },
        { label: 'Harakat qilmaydi', val: a < 0 ? 'Ha' : 'Yo\'q' },
        { label: 'Qiya burchagi', val: v.ang + '°' }
      ];
    }
  },

  // 30) Elastik to`qnashuvchi
  {
    id: 'impulse', title: 'Impuls',
    desc: 'Kuch × vaqtning impulsmomenti',
    controls: [
      { k: 'F', label: 'Kuch F', min: 10, max: 100, step: 5, val: 50, unit: 'N' },
      { k: 't', label: 'Vaqti', min: 0.1, max: 2, step: 0.1, val: 1, unit: 's' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const impulse = v.F * v.t;
      const x0 = 50, y0 = H - 30;
      const boxH = Math.min(impulse / 10, H - 80);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0 - boxH, 60, boxH);
      ctx.fillStyle = c.rule2; ctx.fillRect(x0, y0 - boxH, 60, boxH);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('J = ' + impulse.toFixed(0) + ' N·s', W / 2, 30);
    },
    read(s, v) {
      const impulse = v.F * v.t;
      return [
        { label: 'Impuls J', val: impulse.toFixed(1) + ' N·s' },
        { label: 'J = F·t', val: `${v.F} × ${v.t}` },
        { label: 'Tezlik o\'zgarishi', val: (impulse / 10).toFixed(1) + ' m/s' }
      ];
    }
  },

  // ═══ MAXSUS MAVZULAR ═══
  // 45) Dopler effekti
  {
    id: 'elastic_collision', title: 'Elastik to\'qnashuvchi',
    desc: 'Ikki jismning elastik to\'qnashuvi',
    controls: [
      { k: 'm1', label: 'Massa 1', min: 1, max: 10, step: 0.5, val: 5, unit: 'kg' },
      { k: 'm2', label: 'Massa 2', min: 1, max: 10, step: 0.5, val: 5, unit: 'kg' },
      { k: 'v1', label: 'Tezlik 1', min: 10, max: 50, step: 2, val: 30, unit: 'px/s' }
    ],
    init() { return { phase: 0, t: 0 }; },
    step(s, dt, v) { s.t += dt; if (s.t > 3) { s.phase = 1 - s.phase; s.t = 0; } },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const m1 = v.m1, m2 = v.m2, v1 = v.v1;
      const v1_after = ((m1 - m2) / (m1 + m2)) * v1;
      const v2_after = (2 * m1 / (m1 + m2)) * v1;
      if (s.phase === 0) {
        const x1 = 50 + s.t * 20 * v1 / 30;
        const x2 = 200;
        ctx.fillStyle = c.ok; ctx.fillRect(x1, cy - 15, 25, 30);
        ctx.fillStyle = c.mark; ctx.fillRect(x2, cy - 20, 30, 40);
      } else {
        const x1 = 50 + 3 * 20 * v1 / 30 + s.t * 20 * v1_after / 30;
        const x2 = 200 + s.t * 20 * v2_after / 30;
        ctx.fillStyle = c.ok; ctx.fillRect(x1, cy - 15, 25, 30);
        ctx.fillStyle = c.mark; ctx.fillRect(x2, cy - 20, 30, 40);
      }
    },
    read(s, v) {
      const m1 = v.m1, m2 = v.m2, v1 = v.v1;
      const v1_after = ((m1 - m2) / (m1 + m2)) * v1;
      const v2_after = (2 * m1 / (m1 + m2)) * v1;
      return [
        { label: 'Jism 1 (oldin)', val: (v1 / 10).toFixed(1) + ' m/s' },
        { label: 'Jism 1 (keyin)', val: (v1_after / 10).toFixed(1) + ' m/s' },
        { label: 'Jism 2 (keyin)', val: (v2_after / 10).toFixed(1) + ' m/s' }
      ];
    }
  },

  // ═══ KO'P OPTIKA ═══
  // 31) Qavariq oyna
  {
    id: 'atwood', title: 'Atwood mashinasi',
    desc: 'Ikki massali jism kasnakdan o\'tib harakat qiladi',
    controls: [
      { k: 'm1', label: 'Massa 1', min: 1, max: 10, step: 0.5, val: 6, unit: 'kg' },
      { k: 'm2', label: 'Massa 2', min: 1, max: 10, step: 0.5, val: 4, unit: 'kg' }
    ],
    init() { return { y1: 0, y2: 0, v: 0, t: 0 }; },
    step(s, dt, v) {
      const g = 9.8;
      const a = g * (v.m1 - v.m2) / (v.m1 + v.m2);
      s.v += a * dt;
      s.y1 += s.v * dt * 30;
      s.y2 -= s.v * dt * 30;
      s.t += dt;
      if (Math.abs(s.y1) > 200) { s.y1 = 0; s.y2 = 0; s.v = 0; }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, 50, 20, 0, 7); ctx.stroke();
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W / 2 - 25, 50); ctx.lineTo(60, 100 + s.y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 + 25, 50); ctx.lineTo(W - 60, 100 - s.y2); ctx.stroke();
      ctx.fillStyle = c.ok; ctx.fillRect(50, 100 + s.y1, 30, 30);
      ctx.fillStyle = c.mark; ctx.fillRect(W - 80, 100 - s.y2, 30, 30);
    },
    read(s, v) {
      const g = 9.8;
      const a = g * (v.m1 - v.m2) / (v.m1 + v.m2);
      return [
        { label: 'Tezlanish', val: a.toFixed(2) + ' m/s²' },
        { label: 'Tezlik', val: (s.v / 10).toFixed(1) + ' m/s' },
        { label: 'Massa farqi', val: Math.abs(v.m1 - v.m2) + ' kg'}
      ];
    }
  },

  // 50) Centripetal kuch
  {
    id: 'buoyancy', title: 'Suv yuqori ko\'tarilishi',
    desc: 'Syvuq ichidagi jismning ko\'tarilish kuchi',
    controls: [
      { k: 'rho_obj', label: 'Jismning zichlik', min: 0.1, max: 1.5, step: 0.1, val: 0.8, unit: 'g/cm³' },
      { k: 'rho_liquid', label: 'Suyuqlikning zichlik', min: 0.5, max: 2, step: 0.1, val: 1, unit: 'g/cm³' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      ctx.fillStyle = c.rule2; ctx.fillRect(20, H / 2, W - 40, H / 2 - 20);
      const submerge = v.rho_obj / v.rho_liquid;
      const objH = 80 * submerge;
      const objY = H / 2 - objH;
      ctx.fillStyle = c.ok; ctx.fillRect(W / 2 - 25, objY, 50, objH);
      arrow(ctx, W / 2, objY - 20, W / 2, objY - 50);
      arrow(ctx, W / 2, H / 2 + objH / 2 + 20, W / 2, H / 2 + objH / 2 + 50);
    },
    read(s, v) {
      const f = v.rho_obj / v.rho_liquid;
      return [
        { label: 'Bottirilgan qism', val: (f * 100).toFixed(0) + '%' },
        { label: 'Ko\'tarilish kuchi', val: f > 1 ? 'Pastga' : 'Yuqoriga' },
        { label: 'Zichlik nisbati', val: (v.rho_obj / v.rho_liquid).toFixed(2) }
      ];
    }
  },

  // 63) Ish va quvvat
  {
    id: 'potential', title: 'Potensial energiya',
    desc: 'Balandlikka qarab gravitatsiya potensial energiyasi — Ep = mgh',
    controls: [
      { k: 'm', label: 'Massa', min: 1, max: 20, step: 0.5, val: 10, unit: 'kg' },
      { k: 'h', label: 'Balandlik', min: 0, max: 50, step: 1, val: 25, unit: 'm' },
      { k: "g`", label: 'Tortishish', min: 1.6, max: 25, step: 0.1, val: 9.8, unit: 'm/s²' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const Ep = v.m * v.g * v.h;
      const maxE = 20 * 9.8 * 50;
      const barH = (Ep / maxE) * (H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      const jy = H - 50 - barH;
      ctx.fillStyle = c.mark; ctx.fillRect(W / 2 - 20, jy - 20, 40, 20);
      ctx.fillStyle = c.ink3; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Ep = ' + Ep.toFixed(0) + ' J', W / 2, H - 20);
    },
    read(s, v) {
      const Ep = v.m * v.g * v.h;
      return [
        { label: 'Potensial energiya', val: Ep.toFixed(1) + ' J' },
        { label: 'Ep = mgh', val: `${v.m} × ${v.g} × ${v.h}` },
        { label: 'Qo\'llanilgan ish', val: Ep.toFixed(0) + ' J' }
      ];
    }
  },

  // 20) Energiya saqlaniши
  {
    id: 'work_power', title: 'Ish va quvvat',
    desc: 'Kuch va masofaga qarab bajarilgan ish',
    controls: [
      { k: 'F', label: 'Kuch F', min: 10, max: 100, step: 5, val: 50, unit: 'N' },
      { k: 's', label: 'Masofa s', min: 1, max: 10, step: 0.5, val: 5, unit: 'm' },
      { k: 't', label: 'Vaqt t', min: 1, max: 10, step: 0.5, val: 5, unit: 's' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const W_val = v.F * v.s;
      const P_val = W_val / v.t;
      const barH1 = Math.min(W_val / 50, H - 80);
      const barH2 = Math.min(P_val / 50, H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH1);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ok; ctx.fillRect(W - 110, H - 50, 80, -barH2);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(W - 110, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('W = ' + W_val.toFixed(0) + ' J', 70, 30);
      ctx.fillText('P = ' + P_val.toFixed(1) + ' W', W - 70, 30);
    },
    read(s, v) {
      const W_val = v.F * v.s;
      const P_val = W_val / v.t;
      return [
        { label: 'Ish (Work)', val: W_val.toFixed(0) + ' J' },
        { label: 'Quvvat (Power)', val: P_val.toFixed(1) + ' W' },
        { label: 'P = W/t', val: `${W_val.toFixed(0)} / ${v.t}` }
      ];
    }
  },

  // ═══ QIYIN MEKANIKA ═══
  // 65) Moment inerciyasi (rotasyon)
  {
    id: 'kinetic', title: 'Kinetik energiya',
    desc: 'Massaga va tezlikga qarab kinetik energiya — Ek = ½mv²',
    controls: [
      { k: 'm', label: 'Massa', min: 1, max: 20, step: 0.5, val: 10, unit: 'kg' },
      { k: 'v', label: 'Tezlik', min: 0, max: 30, step: 1, val: 10, unit: 'm/s' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const Ek = 0.5 * v.m * v.v * v.v;
      const maxE = 0.5 * 20 * 30 * 30;
      const barH = (Ek / maxE) * (H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(W / 2, 60, Math.sqrt(Ek / 10), 0, 7); ctx.fill();
      ctx.fillStyle = c.ink3; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Ek = ' + Ek.toFixed(0) + ' J', W / 2, H - 20);
    },
    read(s, v) {
      const Ek = 0.5 * v.m * v.v * v.v;
      return [
        { label: 'Kinetik energiya', val: Ek.toFixed(1) + ' J' },
        { label: 'Ek = ½mv²', val: `½ × ${v.m} × ${v.v}²` },
        { label: 'Masofa (1m/s²)', val: (Ek / (v.m * 9.8)).toFixed(1) + ' m' }
      ];
    }
  },

  // 19) Potensial energiya
  {
    id: 'energy_cons', title: 'Energiya saqlanishi',
    desc: 'Potensial va kinetik energiya orasida o\'tish',
    controls: [
      { k: 'h', label: 'Boshlang\'ich balandlik', min: 20, max: 100, step: 2, val: 80, unit: 'm' },
      { k: "g`", label: 'Tortishish', min: 1.6, max: 25, step: 0.1, val: 9.8, unit: 'm/s²' }
    ],
    init() { return { t: 0 }; },
    step(s, dt, v) { s.t += dt; if (s.t > 2.5) s.t = 0; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const tf = Math.sqrt(2 * v.h / (v.g * 10));
      const h = Math.max(0, v.h - 0.5 * v.g * 10 * s.t * s.t);
      const vf = Math.sqrt(2 * v.g * 10 * (v.h - h));
      const Ep = h * 10;
      const Ek = 0.5 * vf * vf;
      const E_total = Ep + Ek;
      const y0 = H - 50 - (h / v.h) * (H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(20, H - 50, 40, -(Ep / E_total) * (H - 80));
      ctx.fillStyle = c.ok; ctx.fillRect(20, H - 50 - (Ep / E_total) * (H - 80), 40, -(Ek / E_total) * (H - 80));
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(20, H - 50, 40, -(H - 80));
      ctx.fillStyle = c.mark; ctx.fillRect(W / 2 - 15, y0, 30, 15);
      ctx.fillStyle = c.ink3; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Ep+Ek=const', W / 2, H - 20);
    },
    read(s, v) {
      const h = Math.max(0, v.h - 0.5 * v.g * 10 * s.t * s.t);
      const Ep = h * 10;
      const Ek = (v.h - h) * 10;
      return [
        { label: 'Potensial', val: Ep.toFixed(0) + ' J' },
        { label: 'Kinetik', val: Ek.toFixed(0) + ' J' },
        { label: 'Jami', val: (Ep + Ek).toFixed(0) + ' J' }
      ];
    }
  },

  // ═══ STATIKA ═══
  // 21) Moment qonuni (Rычag)
  {
    id: 'leverage', title: 'Richag (Moment qonuni)',
    desc: 'Kuch × masofaning teng bo\'lishligi',
    controls: [
      { k: 'F1', label: 'Kuch 1', min: 10, max: 100, step: 5, val: 50, unit: 'N' },
      { k: 'd1', label: 'Masofa 1', min: 1, max: 10, step: 0.5, val: 5, unit: 'm' },
      { k: 'd2', label: 'Masofa 2', min: 1, max: 10, step: 0.5, val: 5, unit: 'm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const cx = W / 2;
      const pxPerM = 15;
      const pivot = cx + (v.d1 - v.d2) * pxPerM;
      const x1 = pivot - v.d1 * pxPerM;
      const x2 = pivot + v.d2 * pxPerM;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke();
      ctx.fillStyle = c.rule; ctx.beginPath(); ctx.arc(pivot, cy, 8, 0, 7); ctx.fill();
      ctx.fillStyle = c.ok; ctx.fillRect(x1 - 15, cy - 30, 30, 30);
      ctx.fillStyle = c.mark; ctx.fillRect(x2 - 15, cy - 20, 30, 20);
      ctx.fillStyle = c.ink3; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('M₁=' + (v.F1 * v.d1).toFixed(0), x1, cy + 45);
      ctx.fillText('M₂=' + (v.F1 * v.d1 * v.d2 / v.d1).toFixed(0), x2, cy + 35);
    },
    read(s, v) {
      const F2 = v.F1 * v.d1 / v.d2;
      return [
        { label: 'Moment 1', val: (v.F1 * v.d1).toFixed(0) + ' N·m' },
        { label: 'Kuch 2 (balans)', val: F2.toFixed(1) + ' N' },
        { label: 'Moment 2', val: (F2 * v.d2).toFixed(0) + ' N·m' }
      ];
    }
  },

  // 22) Pressiya
  {
    id: 'center_mass', title: 'Massa markazi',
    desc: 'Turli massali jismlarin massa markazi',
    controls: [
      { k: 'm1', label: 'Massa 1', min: 1, max: 10, step: 0.5, val: 4, unit: 'kg' },
      { k: 'm2', label: 'Massa 2', min: 1, max: 10, step: 0.5, val: 6, unit: 'kg' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const x1 = 60, x2 = W - 60;
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(x1, cy, v.m1 * 2, 0, 7); ctx.fill();
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(x2, cy, v.m2 * 2, 0, 7); ctx.fill();
      const xcm = (v.m1 * x1 + v.m2 * x2) / (v.m1 + v.m2);
      ctx.fillStyle = c.rule; ctx.fillRect(xcm - 3, cy - 30, 6, 60);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('CM', xcm, cy + 45);
    },
    read(s, v) {
      const x1 = 60, x2 = 400;
      const xcm = (v.m1 * x1 + v.m2 * x2) / (v.m1 + v.m2);
      return [
        { label: 'Massa markazi', val: xcm.toFixed(0) + ' px' },
        { label: 'Jami massa', val: (v.m1 + v.m2) + ' kg'},
        { label: 'Balans nuqtasi', val: 'CM da' }
      ];
    }
  },

  // ═══ KO'P SUYUQLIK ═══
  // 41) Bernulli tenglamasi
  {
    id: 'relative_motion', title: 'Nisbiy harakat',
    desc: 'Ikki jismning bir-biriga nisbatan harakati',
    controls: [
      { k: 'v1', label: 'Jism 1 tezligi', min: 10, max: 80, step: 2, val: 40, unit: 'px/s' },
      { k: 'v2', label: 'Jism 2 tezligi', min: 10, max: 80, step: 2, val: 20, unit: 'px/s' }
    ],
    init() { return { x1: 0, x2: 0 }; },
    step(s, dt, v) { s.x1 += v.v1 * dt; s.x2 += v.v2 * dt; if (s.x1 > 400) s.x1 = 0; if (s.x2 > 400) s.x2 = 0; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const groundY = H - 30;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, groundY); ctx.lineTo(W - 20, groundY); ctx.stroke();
      ctx.fillStyle = c.ok; ctx.fillRect(40 + s.x1, groundY - 20, 30, 20);
      ctx.fillStyle = c.mark; ctx.fillRect(40 + s.x2, groundY - 25, 30, 25);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      const vrel = v.v1 - v.v2;
      ctx.fillText('v_rel = ' + vrel.toFixed(0) + ' px/s', W / 2, 30);
    },
    read(s, v) {
      const vrel = v.v1 - v.v2;
      return [
        { label: 'Relative tezlik', val: vrel.toFixed(0) + ' px/s' },
        { label: 'Jism 1', val: v.v1 + ' px/s' },
        { label: 'Jism 2', val: v.v2 + ' px/s' }
      ];
    }
  },

  // 28) Aylanuvchi harakat (circular motion)
  {
    id: 'vector_addition', title: 'Vektor qo\'shish',
    desc: 'Ikki vektorning parallelogramm usuli',
    controls: [
      { k: 'A', label: 'Vektor 1 kattaligi', min: 20, max: 100, step: 5, val: 60, unit: 'px' },
      { k: 'B', label: 'Vektor 2 kattaligi', min: 20, max: 100, step: 5, val: 50, unit: 'px' },
      { k: "ang`", label: 'Orasidagi burchak', min: 0, max: 180, step: 15, val: 60, unit: '°' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      const ang_rad = v.ang * Math.PI / 180;
      const x1 = cx + v.A * Math.cos(0);
      const y1 = cy - v.A * Math.sin(0);
      const x2 = cx + v.B * Math.cos(ang_rad);
      const y2 = cy - v.B * Math.sin(ang_rad);
      const x_sum = x1 - cx + x2 - cx;
      const y_sum = y1 - cy + y2 - cy;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2;
      arrow(ctx, cx, cy, x1, y1);
      ctx.strokeStyle = c.mark; ctx.lineWidth = 2;
      arrow(ctx, cx, cy, x2, y2);
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      arrow(ctx, cx, cy, cx + x_sum, cy + y_sum);
      ctx.setLineDash([]);
    },
    read(s, v) {
      const ang_rad = v.ang * Math.PI / 180;
      const sum = Math.sqrt(v.A * v.A + v.B * v.B + 2 * v.A * v.B * Math.cos(ang_rad));
      return [
        { label: 'Vektor 1', val: v.A + ' px' },
        { label: 'Vektor 2', val: v.B + ' px' },
        { label: 'Jami', val: sum.toFixed(1) + ' px' }
      ];
    }
  },

  // 101) Gravitsional potensial
  {
    id: 'bernoulli', title: 'Bernulli tenglamasi',
    desc: 'To\'lqin tezligiga qarab bosim o\'zgarishi',
    controls: [
      { k: 'v', label: 'Suyuqlik tezligi', min: 10, max: 60, step: 2, val: 30, unit: 'm/s' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const P = 100 - v.v;
      const h1 = (H - 60) * (P / 100);
      const h2 = (H - 60) * 0.5;
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(20, H - 30); ctx.lineTo(W - 20, H - 30); ctx.stroke();
      ctx.fillStyle = c.rule;
      ctx.fillRect(40, H - 30 - h1, 60, h1);
      ctx.fillRect(W - 100, H - 30 - h2, 60, h2);
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(110, H - 30); ctx.lineTo(W - 40, H - 30 + h2 - h1); ctx.stroke();
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('P = ' + P.toFixed(0) + ' kPa', W / 2, 30);
    },
    read(s, v) {
      const P = 100 - v.v;
      return [
        { label: 'Bosim', val: P.toFixed(0) + ' kPa' },
        { label: 'Tezlik', val: (v.v / 10).toFixed(1) + ' m/s' },
        { label: 'Bernulli qonuni', val: 'P + ½ρv² = const' }
      ];
    }
  },

  // 42) Davomiy tenglama
  {
    id: 'continuity', title: 'Uzluksizlik tenglamasi',
    desc: 'Qanot kenglikiga qarab suyuqlik tezligi',
    controls: [
      { k: 'A1', label: 'Kesi 1 maydoni', min: 20, max: 100, step: 5, val: 80, unit: 'cm²' },
      { k: 'A2', label: 'Kesi 2 maydoni', min: 20, max: 100, step: 5, val: 40, unit: 'cm²' },
      { k: 'Q', label: 'Oqim miqdori', min: 10, max: 100, step: 5, val: 50, unit: 'cm³/s' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const v1 = v.Q / v.A1, v2 = v.Q / v.A2;
      ctx.fillStyle = c.rule2;
      ctx.fillRect(40, cy - v.A1 / 4, 30, v.A1 / 2);
      ctx.fillRect(W - 70, cy - v.A2 / 4, 30, v.A2 / 2);
      const x1 = 40, x2 = W - 40;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1 + 30, cy); ctx.quadraticCurveTo((x1 + x2) / 2, cy - 20, x2 - 30, cy); ctx.stroke();
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('v₁=' + v1.toFixed(0), 55, 30);
      ctx.fillText('v₂=' + v2.toFixed(0), W - 55, 30);
    },
    read(s, v) {
      const v1 = v.Q / v.A1, v2 = v.Q / v.A2;
      return [
        { label: 'Tezlik 1', val: (v1 / 10).toFixed(1) + ' m/s' },
        { label: 'Tezlik 2', val: (v2 / 10).toFixed(1) + ' m/s' },
        { label: 'Oqim (const)', val: v.Q + ' cm³/s' }
      ];
    }
  },

  // ═══ RESONANS VA TEBRANISHLAR ═══
  // 43) Zorali tebranish (Driven oscillation)
  {
    id: 'gas', title: 'Gaz qonuni',
    desc: 'Hajm va haroratga qarab bosim — idishdagi molekulalar',
    controls: [
      { k: 'V', label: 'Hajm', min: 25, max: 100, step: 1, val: 65, unit: '%' },
      { k: 'T', label: 'Harorat', min: 100, max: 600, step: 10, val: 300, unit: 'K' }
    ],
    init() {
      return { ps: Array.from({ length: 24 }, () => ({
        x: Math.random(), y: Math.random(),
        vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1
      })) };
    },
    step(s, dt, v) {
      const sp = Math.sqrt(v.T) / 9;
      s.ps.forEach((p: any) => {
        p.x += p.vx * sp * dt; p.y += p.vy * sp * dt;
        if (p.x < 0) { p.x = 0; p.vx *= -1; } if (p.x > 1) { p.x = 1; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; } if (p.y > 1) { p.y = 1; p.vy *= -1; }
      });
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const x0 = 30, y0 = 24, boxH = H - 60;
      const boxW = (W - 120) * (v.V / 100);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, boxW, boxH);
      ctx.fillStyle = c.rule; ctx.fillRect(x0 + boxW, y0 - 8, 12, boxH + 16);
      ctx.fillStyle = c.ok;
      s.ps.forEach((p: any) => {
        ctx.beginPath();
        ctx.arc(x0 + 5 + p.x * (boxW - 10), y0 + 5 + p.y * (boxH - 10), 3, 0, 7);
        ctx.fill();
      });
    },
    read(s, v) {
      const P = v.T / v.V;
      return [
        { label: 'Bosim (nisbiy)', val: P.toFixed(2) },
        { label: 'p ∝ T / V', val: `${v.T} / ${v.V}` },
        { label: 'Harorat', val: v.T + ' K' }
      ];
    }
  },

  // 7) Erkin tushish
  {
    id: 'ideal_gas_combined', title: 'Ideal gaz (birlashtirilgan)',
    desc: 'PV = nRT, bosim, hajm, harorat, mol',
    controls: [
      { k: 'n', label: 'Mol soni', min: 1, max: 10, step: 0.5, val: 5, unit: 'mol' },
      { k: 'T', label: 'Harorat', min: 100, max: 500, step: 10, val: 300, unit: 'K' },
      { k: 'V', label: 'Hajm', min: 1, max: 10, step: 0.5, val: 5, unit: 'L' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const R = 8.314;
      const P = (v.n * R * v.T) / v.V;
      const barH = Math.min(P / 100, H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.mark; ctx.fillRect(W / 2 - 30, H - 50, 60, -barH * 0.5);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('P = ' + P.toFixed(0) + ' Pa', W / 2, 30);
    },
    read(s, v) {
      const R = 8.314;
      const P = (v.n * R * v.T) / v.V;
      return [
        { label: 'Bosim P', val: P.toFixed(1) + ' Pa' },
        { label: 'PV = nRT', val: `${v.n} × ${v.T} / ${v.V}` },
        { label: 'Mol soni', val: v.n + ' mol' }
      ];
    }
  },

  // 73) Elastik hamda inelastik to`qnashuv taqqoslash
  {
    id: 'temperature', title: 'Harorat va bosim',
    desc: 'Doimiy hajmda haroratga qarab bosim — P ∝ T',
    controls: [
      { k: 'T', label: 'Harorat', min: 100, max: 600, step: 10, val: 300, unit: 'K' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const P = v.T / 100;
      const barH = (P / 6) * (H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(W / 2, Math.random() * 100 + 50, 3, 0, 7); ctx.fill();
      ctx.fillStyle = c.ink3; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('P = ' + P.toFixed(1) + ' (rel)', W / 2, H - 20);
    },
    read(s, v) {
      const P = v.T / 100;
      return [
        { label: 'Bosim (nisbiy)', val: P.toFixed(2) },
        { label: 'P/T = const', val: 'Gay-Lussac qonuni' },
        { label: 'Harorat', val: v.T + ' K' }
      ];
    }
  },

  // 26) Issiqlik o\'tkazishi (Fourier)
  {
    id: 'boyle_law', title: 'Boyle qonuni',
    desc: 'Doimiy haroratda bosim va hajmning ko\'paytmasi doimiy',
    controls: [
      { k: 'V', label: 'Hajm', min: 25, max: 100, step: 1, val: 65, unit: '%' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const P = 65 * 100 / v.V;
      const x0 = 30, y0 = 24, boxH = H - 60;
      const boxW = (W - 120) * (v.V / 100);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, boxW, boxH);
      ctx.fillStyle = c.rule; ctx.fillRect(x0 + boxW, y0 - 8, 12, boxH + 16);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('P = ' + P.toFixed(0) + ' (PV = const)', W / 2, H - 20);
    },
    read(s, v) {
      const P = 65 * 100 / v.V;
      return [
        { label: 'Bosim (nisbiy)', val: P.toFixed(1) },
        { label: 'PV = const', val: 'Boyle qonuni' },
        { label: 'Hajm', val: v.V + '%' }
      ];
    }
  },

  // 38) Faza o`zgarishi
  {
    id: 'charles_law', title: 'Charles qonuni',
    desc: 'Doimiy bosimda hajm va harorat proportional',
    controls: [
      { k: 'T', label: 'Harorat', min: 100, max: 400, step: 10, val: 273, unit: 'K' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const V = v.T / 100;
      const barH = (V / 4) * (H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('V = ' + V.toFixed(1) + ' (V/T = const)', W / 2, 30);
    },
    read(s, v) {
      const V = v.T / 100;
      return [
        { label: 'Hajm (nisbiy)', val: V.toFixed(2) },
        { label: 'V/T = const', val: 'Charles qonuni' },
        { label: 'Harorat', val: v.T + ' K' }
      ];
    }
  },

  // ═══ KO'P ELEKTROMAGNETIZM ═══
  // 54) Solenoid va magnetic maydoni
  {
    id: 'heat_transfer', title: 'Issiqlik o\'tkazishi',
    desc: 'Temperatur farqiga qarab issiqlik o\'tkazishi',
    controls: [
      { k: 'dT', label: 'Temp. farqi', min: 1, max: 100, step: 1, val: 50, unit: '°C' },
      { k: 'A', label: 'Maydoni', min: 10, max: 100, step: 5, val: 50, unit: 'cm²' },
      { k: 'd', label: 'Qalinligi', min: 1, max: 20, step: 0.5, val: 5, unit: 'cm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const Q = (v.A * v.dT / v.d);
      ctx.fillStyle = c.rule2; ctx.fillRect(20, H - 50, 40, 30);
      ctx.fillStyle = c.mark; ctx.fillRect(W - 60, H - 50, 40, 30);
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = c.ok; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(60, H - 35 + i * 3); ctx.lineTo(W - 60, H - 35 + i * 3); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Q = ' + Q.toFixed(0) + ' (rel)', W / 2, 30);
    },
    read(s, v) {
      const Q = (v.A * v.dT / v.d);
      return [
        { label: 'Issiqlik o\'tkazish', val: Q.toFixed(1) + ' (rel)' },
        { label: 'Q ∝ A·ΔT/d', val: `${v.A} × ${v.dT} / ${v.d}` },
        { label: 'Temp. farqi', val: v.dT + ' °C' }
      ];
    }
  },

  // ═══ KO'P KINEMATIKA ═══
  // 27) Relative harakat
  {
    id: 'heat_capacity', title: 'Issiqlik sig\'imi (C)',
    desc: 'Moddaning harorat o\'zgarishiga qarshilik',
    controls: [
      { k: 'C', label: 'Sig\'im C', min: 100, max: 1000, step: 50, val: 500, unit: 'J/K' },
      { k: 'dT', label: 'Harorat o\'zgarishi', min: 1, max: 50, step: 1, val: 20, unit: 'K' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const Q = v.C * v.dT;
      const barH = Math.min(Q / 500, H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Q = ' + Q.toFixed(0) + ' J', W / 2, 30);
    },
    read(s, v) {
      const Q = v.C * v.dT;
      return [
        { label: 'Berilgan issiqlik Q', val: Q.toFixed(0) + ' J' },
        { label: 'Q = C·ΔT', val: `${v.C} × ${v.dT}` },
        { label: 'Sig\'im C', val: v.C + ' J/K' }
      ];
    }
  },

  // 106) Juda katta tezliklar (relativistik)
  { id: 'thermal_expansion', title: 'Haroratdan kengayish', desc: "Haroratning jism o`lchamiga ta'siri",
    controls: [{ k: 'dT', label: 'Harora o\'zgarish', min: 0, max: 100, step: 5, val: 50, unit: '°C' },
               { k: 'alpha', label: 'Koeff', min: 1e-5, max: 5e-5, step: 1e-5, val: 2e-5, unit: '1/°C' }],
    init(v) { return {}; },
    step(s, dt, v) {},
    draw(ctx, W, H, s, v) {
      const c = COL(); const len0 = 100; const deltaL = len0 * v.alpha * v.dT;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(50, H / 2); ctx.lineTo(50 + len0, H / 2); ctx.stroke();
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(50, H / 2 + 30); ctx.lineTo(50 + len0 + deltaL, H / 2 + 30); ctx.stroke();
      ctx.fillText('ΔL = ' + deltaL.toFixed(2) + ' mm', 100, 100);
    },
    read(s, v) { const L0 = 100; const deltaL = L0 * v.alpha * v.dT;
      return [{ label: 'O\'zgarish ΔL', val: deltaL.toFixed(3) + ' mm' },
              { label: 'Koeff α', val: (v.alpha * 1e5).toFixed(1) + ' × 10⁻⁵' }]; }
  },
  {
    id: 'phase_change', title: 'Faza o\'zgarishi',
    desc: 'Issiqlik berish orqali moddaning halati o\'zgarishi',
    controls: [
      { k: 'Q', label: 'Berilgan issiqlik', min: 0, max: 100, step: 5, val: 50, unit: 'kJ' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const phase = v.Q < 33 ? 'qattiq' : v.Q < 66 ? 'suyuq' : 'gaz';
      const x = W / 2, y = H / 2;
      if (phase === 'qattiq') {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            ctx.fillStyle = c.ok;
            ctx.fillRect(x - 30 + i * 30, y - 30 + j * 30, 20, 20);
          }
        }
      } else if (phase === 'suyuq') {
        ctx.fillStyle = c.mark;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const px = x - 30 + i * 12;
          const py = y + Math.sin(i * 0.4) * 15 - 10;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.lineTo(x + 30, y + 20); ctx.lineTo(x - 30, y + 20); ctx.closePath(); ctx.fill();
      } else {
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = c.ok;
          ctx.globalAlpha = 0.3 + (i % 3) * 0.2;
          ctx.beginPath(); ctx.arc(x - 40 + Math.random() * 80, y - 40 + Math.random() * 80, 5, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = c.ink3; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(phase.charAt(0).toUpperCase() + phase.slice(1), W / 2, 40);
    },
    read(s, v) {
      const phase = v.Q < 33 ? 'Qattiq' : v.Q < 66 ? 'Suyuq' : 'Gaz';
      return [
        { label: 'Faza', val: phase },
        { label: 'Berilgan issiqlik', val: v.Q + ' kJ' },
        { label: 'Harorat', val: (0 + v.Q * 1.5).toFixed(0) + ' K' }
      ];
    }
  },

  // 39) Entropiya va tartibsizlik
  {
    id: 'carnot_cycle', title: 'Carnot siklisi (issiqlik motori)',
    desc: 'Maksimal samara beradigan issiqlik motori',
    controls: [
      { k: 'T_h', label: 'Issiq oqim harorati', min: 300, max: 600, step: 50, val: 500, unit: 'K' },
      { k: 'T_c', label: 'Sovuq oqim harorati', min: 100, max: 300, step: 50, val: 200, unit: 'K' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const eta = 1 - (v.T_c / v.T_h);
      const barH = eta * (H - 80);
      ctx.fillStyle = c.rule2; ctx.fillRect(30, H - 50, 80, -barH);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(30, H - 50, 80, -(H - 80));
      ctx.fillStyle = c.mark; ctx.fillRect(W / 2 - 30, H - 50, 60, -barH);
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('η = ' + (eta * 100).toFixed(1) + '%', W / 2, 30);
    },
    read(s, v) {
      const eta = 1 - (v.T_c / v.T_h);
      return [
        { label: 'Samara', val: (eta * 100).toFixed(1) + '%' },
        { label: 'η = 1 - Tc/Th', val: `1 - ${v.T_c}/${v.T_h}` },
        { label: 'Maksimal samara', val: 'Carnot siklida' }
      ];
    }
  },

  // 88) Paramagnetizm va diamagnetizm
  { id: 'coulomb_force', title: 'Kulon kuchi', desc: 'Ikkita zaryad o\'rtasidagi kuch',
    controls: [{ k: 'q1', label: 'Zaryad 1', min: 0.1, max: 5, step: 0.2, val: 2, unit: 'μC' },
               { k: 'q2', label: 'Zaryad 2', min: 0.1, max: 5, step: 0.2, val: 3, unit: 'μC' },
               { k: 'r', label: 'Masafa', min: 0.01, max: 1, step: 0.05, val: 0.3, unit: 'm' }],
    init(v) { return {}; },
    step(s, dt, v) {},
    draw(ctx, W, H, s, v) {
      const c = COL(); const k = 8.99e9;
      const F = k * (v.q1 * 1e-6) * (v.q2 * 1e-6) / Math.pow(v.r, 2);
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(100, H / 2, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(100 + v.r * 200, H / 2, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(100, H / 2); ctx.lineTo(100 + v.r * 200, H / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.ink;
      ctx.fillText('F = ' + F.toExponential(2) + ' N', 150, 80);
    },
    read(s, v) { const k = 8.99e9; const F = k * (v.q1 * 1e-6) * (v.q2 * 1e-6) / Math.pow(v.r, 2);
      return [{ label: 'Kuch F', val: F.toExponential(2) + ' N' },
              { label: 'Masafa r', val: v.r + ' m' }]; }
  },
  {
    id: 'electric_field', title: 'Elektr maydoni',
    desc: 'Musbat va salbiy zaryad orasidagi elektrik maydoni',
    controls: [
      { k: 'q', label: 'Zaryad miqdori', min: 1, max: 10, step: 0.5, val: 5, unit: 'μC' },
      { k: 'd', label: 'Zaryad orasidagi masofa', min: 50, max: 250, step: 10, val: 150, unit: 'px' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const x1 = 80, x2 = 80 + v.d, cy = H / 2;
      ctx.fillStyle = c.ok; ctx.beginPath(); ctx.arc(x1, cy, 12, 0, 7); ctx.fill();
      ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(x2, cy, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const px = x1 + j * 20, py = cy + i * 20;
          const r = Math.hypot(px - x1, py - cy);
          if (r > 20) {
            const ang = Math.atan2(py - cy, px - x1);
            const scale = 1 / (r / 50);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(ang) * scale * 8, py + Math.sin(ang) * scale * 8);
            ctx.stroke();
          }
        }
      }
    },
    read(s, v) {
      const E = (v.q / (v.d * v.d)) * 1000;
      return [
        { label: 'Elektr maydoni', val: E.toFixed(1) + ' (rel)' },
        { label: 'Zaryad orasidagi masofa', val: v.d + ' px' },
        { label: 'Kuch harakati', val: 'Radial' }
      ];
    }
  },

  // 35) Kondensator
  {
    id: 'circuit_diagram', title: 'Elektr zanjiri diagramma',
    desc: 'Asosiy elektr zanjir elementlari',
    controls: [
      { k: 'V', label: 'Kuchlanish', min: 1, max: 24, step: 1, val: 12, unit: 'V' },
      { k: 'R', label: 'Qarshilik', min: 10, max: 100, step: 5, val: 50, unit: 'Ω' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(W - 50, 50);
      ctx.lineTo(W - 50, 200); ctx.lineTo(50, 200); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = c.ok; ctx.fillRect(45, 50, 10, 10);
      ctx.fillRect(W - 55, 80, 10, 10);
    },
    read(s, v) {
      const I = v.V / v.R;
      return [
        { label: 'Kuchlanish U', val: v.V + ' V' },
        { label: 'Qarshilik R', val: v.R + ' Ω' },
        { label: 'Tok I', val: I.toFixed(2) + ' A' }
      ];
    }
  },

  // 111-129) Qo`shimcha 19 ta (tezdan-tez yaratish)
  // Qisqa va sodda eksperimentlar...

  {
    id: 'ohm', title: 'Om qonuni',
    desc: 'Kuchlanish va qarshilikka qarab tok kuchi — zanjirda elektronlar',
    controls: [
      { k: 'U', label: 'Kuchlanish U', min: 1, max: 24, step: 0.5, val: 12, unit: 'V' },
      { k: 'R', label: 'Qarshilik R', min: 1, max: 100, step: 1, val: 20, unit: 'Ω' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const I = v.U / v.R;
      const L = 40, R = W - 40, TP = 44, BT = H - 44;
      // zanjir ramkasi
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(L, TP, R - L, BT - TP); ctx.stroke();
      // batareya (chap tomonda)
      const my = (TP + BT) / 2;
      ctx.fillStyle = c.surf; ctx.fillRect(L - 8, my - 26, 16, 52);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L - 10, my - 16); ctx.lineTo(L + 10, my - 16); ctx.stroke();
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(L - 6, my + 6); ctx.lineTo(L + 6, my + 6); ctx.stroke();
      // rezistor (tepada, zigzag)
      const zx = (L + R) / 2 - 40, zw = 80;
      ctx.fillStyle = c.paper; ctx.fillRect(zx - 4, TP - 9, zw + 8, 18);
      ctx.strokeStyle = c.mark; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(zx, TP);
      for (let i = 0; i < 6; i++) ctx.lineTo(zx + zw / 6 * (i + 0.5), TP + (i % 2 ? 7 : -7));
      ctx.lineTo(zx + zw, TP); ctx.stroke();
      // elektronlar — tok kuchiga proporsional tezlik
      const perim = 2 * ((R - L) + (BT - TP));
      const speed = Math.min(40 + I * 60, 260);
      const n = 26;
      ctx.fillStyle = c.ok;
      for (let i = 0; i < n; i++) {
        let d = ((s.t * speed) + i * perim / n) % perim;
        let x, y;
        const w = R - L, h = BT - TP;
        if (d < w) { x = L + d; y = TP; }
        else if (d < w + h) { x = R; y = TP + (d - w); }
        else if (d < 2 * w + h) { x = R - (d - w - h); y = BT; }
        else { x = L; y = BT - (d - 2 * w - h); }
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      }
    },
    read(s, v) {
      const I = v.U / v.R;
      return [
        { label: 'Tok kuchi I', val: I.toFixed(2) + ' A' },
        { label: 'Quvvat P', val: (v.U * I).toFixed(1) + ' W' },
        { label: 'I = U / R', val: `${v.U} / ${v.R}` }
      ];
    }
  },

  // 4) Ko`ndalang to`lqin
  { id: 'wire_resistance', title: 'Sim qarshiligi', desc: 'Uzunlik, kesim va xususiy qarshiligi',
    controls: [{ k: 'l', label: 'Uzunlik', min: 1, max: 100, step: 5, val: 50, unit: 'm' },
               { k: 'A', label: 'Kesim', min: 0.1, max: 5, step: 0.2, val: 1, unit: 'mm²' },
               { k: "rho", label: 'Xususiy', min: 0.01, max: 1, step: 0.05, val: 0.017, unit: 'Ω·mm²/m' }],
    init(v) { return {}; },
    step(s, dt, v) {},
    draw(ctx, W, H, s, v) {
      const c = COL(); const R = v.rho * v.l / v.A;
      ctx.strokeStyle = c.mark; ctx.lineWidth = Math.max(1, v.A);
      ctx.beginPath(); ctx.moveTo(50, H / 2); ctx.lineTo(250, H / 2); ctx.stroke();
      ctx.fillStyle = c.ink;
      ctx.fillText('R = ρl/A = ' + R.toFixed(3) + ' Ω', 80, 100);
      ctx.fillText('Uzunlik = ' + v.l + ' m', 80, 130);
    },
    read(s, v) { const R = v.rho * v.l / v.A;
      return [{ label: 'Qarshi R', val: R.toFixed(3) + ' Ω' },
              { label: 'Uzunlik', val: v.l + ' m' }]; }
  },
  { id: 'joule_heating', title: 'Joul-Lens qonuni', desc: 'Elektr oqimidan hosil bo\'lgan issiqlik',
    controls: [{ k: 'I', label: 'Oqim', min: 0.1, max: 5, step: 0.2, val: 2, unit: 'A' },
               { k: 'R', label: 'Qarshi', min: 1, max: 100, step: 5, val: 10, unit: 'Ω' }],
    init(v) { return {}; },
    step(s, dt, v) {},
    draw(ctx, W, H, s, v) {
      const c = COL(); const P = v.I * v.I * v.R;
      ctx.fillStyle = c.paper; ctx.fillRect(100, 100, 200, 100);
      ctx.strokeStyle = c.mark; ctx.lineWidth = 3;
      ctx.beginPath(); for (let i = 0; i < 10; i++) {
        const x = 110 + i * 20; const y = 150 + (i % 2) * 10;
        ctx.lineTo(x, y);
      } ctx.stroke();
      ctx.fillStyle = c.ink;
      ctx.fillText('P = I²R = ' + P.toFixed(1) + ' W', 110, 220);
    },
    read(s, v) { const P = v.I * v.I * v.R;
      return [{ label: 'Quvvat P', val: P.toFixed(1) + ' W' },
              { label: 'Oqim I', val: v.I + ' A' },
              { label: 'Qarshi R', val: v.R + ' Ω' }]; }
  },
  // ELEKTROMAGNETIZM (7 ta)
  {
    id: 'capacitor', title: 'Kondensator (sig\'imi)',
    desc: 'Plitalar orasidagi masofaga qarab emkoslik',
    controls: [
      { k: 'A', label: 'Plitaning maydoni', min: 10, max: 100, step: 5, val: 50, unit: 'cm²' },
      { k: 'd', label: 'Plitalar orasidagi masofa', min: 1, max: 20, step: 0.5, val: 5, unit: 'mm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(60, 40); ctx.lineTo(60, H - 40); ctx.stroke();
      ctx.strokeStyle = c.mark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W - 60, 40); ctx.lineTo(W - 60, H - 40); ctx.stroke();
      ctx.fillStyle = c.rule; ctx.fillRect(65, 40, W - 125, H - 80);
      const C = (v.A / v.d) * 8.854;
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('C = ' + C.toFixed(0) + ' pF', W / 2, 30);
    },
    read(s, v) {
      const C = (v.A / v.d) * 8.854;
      return [
        { label: 'Emkoslik C', val: C.toFixed(1) + ' pF' },
        { label: 'C = ε₀A/d', val: `Plitalar orasida ${v.d} mm` },
        { label: 'Maydoni', val: v.A + ' cm²' }
      ];
    }
  },

  // 36) Transformator
  {
    id: 'solenoid', title: 'Solenoid (elektromagnit)',
    desc: 'Solenoiddan chiqayotgan magnit maydoni',
    controls: [
      { k: 'I', label: 'Tok I', min: 1, max: 10, step: 0.5, val: 5, unit: 'A' },
      { k: 'N', label: 'Sarflar soni', min: 10, max: 100, step: 5, val: 50, unit: 'N' },
      { k: 'L', label: 'Solenoid uzunligi', min: 20, max: 100, step: 5, val: 60, unit: 'mm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.arc(100 + i * 20, cy, 25, 0, 7); ctx.stroke();
      }
      const B = v.I * v.N / v.L;
      for (let i = -3; i <= 3; i++) {
        ctx.strokeStyle = c.mark; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W / 2, cy + i * 15);
        ctx.lineTo(W / 2 + B * 3, cy + i * 15);
        ctx.stroke();
      }
    },
    read(s, v) {
      const B = v.I * v.N / v.L;
      return [
        { label: 'Magnetic maydoni B', val: B.toFixed(1) + ' (rel)' },
        { label: 'B = μ₀NI/L', val: `${v.N} × ${v.I} / ${v.L}` },
        { label: 'Tok', val: v.I + ' A' }
      ];
    }
  },

  // 55) Faraday qonuni (elektromagnit induksiyasi)
  {
    id: 'magnetism_types', title: 'Magnetizm turlari',
    desc: 'Paramagnet, diamagnet, ferromagnet xulqi',
    controls: [
      { k: 'B', label: 'Magnetic maydoni', min: 0, max: 100, step: 5, val: 50, unit: 'mT' },
      { k: 'type', label: 'Moddaning turi', min: 0, max: 2, step: 1, val: 0, unit: '0=Para' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      for (let i = 0; i < 12; i++) {
        const x = 50 + i * 30;
        let mag = v.B / 50;
        if (v.type === 2) mag *= 3;
        if (v.type === 1) mag *= -0.5;
        ctx.fillStyle = mag > 0 ? c.ok : c.mark;
        ctx.globalAlpha = Math.abs(mag);
        ctx.fillRect(x - 5, H / 2 - 15 + mag * 10, 10, 30);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      const types = ['Paramagnet', 'Diamagnet', 'Ferromagnet'];
      ctx.fillText(types[Math.floor(v.type)], W / 2, 30);
    },
    read(s, v) {
      return [
        { label: 'Magnetizm turi', val: v.type === 0 ? 'Paramagnet' : v.type === 1 ? 'Diamagnet' : 'Ferromagnet' },
        { label: 'Magnetic maydoni', val: v.B + ' mT' },
        { label: 'Xulqi', val: v.type === 0 ? 'Tortib' : v.type === 1 ? 'Daf' : 'Tortib (kuchli)' }
      ];
    }
  },

  // 89) Yo\'g\'in to\'lqin va yumshoq to\'lqin
  {
    id: 'em_field_comparison', title: 'Elektr va Magnit maydon',
    desc: 'Elektr va magnit maydonining taqqoslashi',
    controls: [
      { k: 'E', label: 'Elektrik maydoni', min: 10, max: 100, step: 5, val: 50, unit: 'N/C' },
      { k: 'B', label: 'Magnetic maydoni', min: 1, max: 50, step: 1, val: 25, unit: 'mT' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = c.ok; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(20 + i * 30, 40); ctx.lineTo(20 + i * 30, 100); ctx.stroke();
        ctx.strokeStyle = c.mark; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(20 + i * 30, 160 + Math.sin(i) * 20, 3, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('E = ' + v.E + ' N/C', 80, 125);
      ctx.fillText('B = ' + v.B + ' mT', 80, 195);
    },
    read(s, v) {
      return [
        { label: 'Elektrik maydoni', val: v.E + ' N/C' },
        { label: 'Magnetic maydoni', val: v.B + ' mT' },
        { label: 'Nisbati', val: (v.E / v.B).toFixed(1) }
      ];
    }
  },

  // 103) Nuqta zaryad elektrik maydoni
  {
    id: 'parallel_wires', title: 'Magnit o\'z-o\'ziga ta\'siri',
    desc: 'Parallel o\'tkazgichlar orasidagi tortishish/itarilish',
    controls: [
      { k: 'I1', label: 'Tok 1', min: 1, max: 20, step: 0.5, val: 10, unit: 'A' },
      { k: 'I2', label: 'Tok 2', min: 1, max: 20, step: 0.5, val: 10, unit: 'A' },
      { k: 'd', label: 'Masofa', min: 30, max: 200, step: 5, val: 100, unit: 'cm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const x1 = 60, x2 = 60 + v.d;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x1, cy, 8, 0, 7); ctx.stroke();
      ctx.strokeStyle = c.mark; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x2, cy, 8, 0, 7); ctx.stroke();
      const F = (v.I1 * v.I2) / (v.d * v.d) * 1000;
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('F ≈ ' + F.toFixed(1) + ' (rel)', W / 2, 30);
    },
    read(s, v) {
      const F = (v.I1 * v.I2) / (v.d * v.d) * 1000;
      return [
        { label: 'Magnetic kuch', val: F.toFixed(2) + ' (rel)' },
        { label: 'Tok 1 va 2', val: v.I1 + ' / ' + v.I2 + ' A' },
        { label: 'Masofa', val: v.d + ' cm' }
      ];
    }
  },

  // ═══ TERMODINAMIKA ═══
  // 25) Harorat va bosim (Gay-Lussac)
  {
    id: 'faraday', title: 'Faraday induksiyasi',
    desc: 'O\'zgarayotgan magnit maydon elektr maydani yaratadi',
    controls: [
      { k: 'dB', label: 'Magnit maydoni o\'zgarishi', min: 0, max: 100, step: 5, val: 50, unit: 'T/s' },
      { k: 'A', label: 'Halqa maydoni', min: 10, max: 100, step: 5, val: 50, unit: 'cm²' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 7); ctx.stroke();
      const B_scale = Math.sin(s.t * Math.PI) * v.dB / 50;
      for (let i = 0; i < 12; i++) {
        const ang = i * Math.PI / 6;
        ctx.strokeStyle = c.rule2; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + 60 * Math.cos(ang), cy + 60 * Math.sin(ang));
        ctx.lineTo(cx + (60 + B_scale * 10) * Math.cos(ang), cy + (60 + B_scale * 10) * Math.sin(ang)); ctx.stroke();
      }
      const EMF = v.dB * v.A / 100;
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ε = ' + EMF.toFixed(1) + ' V', cx, cy + 100);
    },
    read(s, v) {
      const EMF = v.dB * v.A / 100;
      return [
        { label: 'Induksion EMF', val: EMF.toFixed(1) + ' V' },
        { label: 'ε = -dΦ/dt', val: `dB/dt = ${v.dB}` },
        { label: 'Halqa maydoni', val: v.A + ' cm²' }
      ];
    }
  },

  // 56) Lenz qonuni
  {
    id: 'lenz', title: 'Lenz qonuni',
    desc: 'Induksiya tok o\'zgarish to\'siqchi',
    controls: [
      { k: 'dB', label: 'B o\'zgarishi', min: 0, max: 100, step: 10, val: 50, unit: 'T/s' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 50, 0, 7); ctx.stroke();
      const B_in = Math.sin(s.t) * v.dB / 50;
      ctx.fillStyle = B_in > 0 ? c.mark : c.ok;
      ctx.globalAlpha = Math.abs(B_in) / 2;
      ctx.fillRect(cx - 50, cy - 50, 100, 100);
      ctx.globalAlpha = 1;
      const I_ind = B_in > 0 ? -1 : 1;
      for (let i = 0; i < 8; i++) {
        const ang = i * Math.PI / 4 + s.t;
        ctx.fillStyle = c.rule; ctx.beginPath();
        ctx.arc(cx + 35 * Math.cos(ang), cy + 35 * Math.sin(ang), 3, 0, 7); ctx.fill();
      }
    },
    read(s, v) {
      return [
        { label: 'B o\'zgarishi', val: v.dB + ' T/s' },
        { label: 'Induksiya tok', val: 'To\'siqchi yo\'nalishda' },
        { label: 'Lenz qonuni', val: 'Tabiiy tish' }
      ];
    }
  },

  // ═══ KO'P SUYUQLIK MEXANIKASI ═══
  // 57) Viskozitlik (Stokes qonuni)
  {
    id: 'transformer', title: 'Transformator',
    desc: 'Sarflar nisbatiga qarab kuchlanish o\'zgarishi',
    controls: [
      { k: 'n1', label: 'Boshlang\'ich sarflar', min: 1, max: 100, step: 5, val: 50, unit: 'N' },
      { k: 'n2', label: 'Ikkinchi sarflar', min: 1, max: 100, step: 5, val: 25, unit: 'N' },
      { k: 'U1', label: 'Boshlang\'ich kuchlanish', min: 1, max: 24, step: 1, val: 12, unit: 'V' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(80, cy, 25, 0, 7); ctx.stroke();
      ctx.strokeStyle = c.mark; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(W - 80, cy, 25, 0, 7); ctx.stroke();
      ctx.strokeStyle = c.rule; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(105, cy - 10); ctx.quadraticCurveTo(W / 2, cy, W - 105, cy - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(105, cy + 10); ctx.quadraticCurveTo(W / 2, cy, W - 105, cy + 10); ctx.stroke();
    },
    read(s, v) {
      const U2 = v.U1 * v.n2 / v.n1;
      return [
        { label: 'Boshlang\'ich kuchlanish', val: v.U1 + ' V' },
        { label: 'Ikkinchi kuchlanish', val: U2.toFixed(2) + ' V' },
        { label: 'Sarflar nisbati', val: (v.n2 / v.n1).toFixed(2) }
      ];
    }
  },

  // ═══ KO'P TERMODINAMIKA ═══
  // 37) Boyle qonuni (izotermal jarayoni)
  {
    id: 'refraction', title: 'Yorug\'likning sinishi',
    desc: 'Ikki muhit chegarasida yorug\'lik nuri sinadi',
    controls: [
      { k: 'n1', label: 'Muhit 1 sindirish koeff.', min: 1, max: 2, step: 0.1, val: 1, unit: 'n₁' },
      { k: 'n2', label: 'Muhit 2 sindirish koeff.', min: 1, max: 2.5, step: 0.1, val: 1.5, unit: 'n₂' },
      { k: "ang`", label: 'Tushish burchagi', min: 5, max: 85, step: 1, val: 40, unit: '°' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const midY = H / 2;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, midY); ctx.lineTo(W - 20, midY); ctx.stroke();
      ctx.fillStyle = c.rule2;
      ctx.fillRect(0, midY, W, H / 2);
      const rad1 = v.ang * Math.PI / 180;
      const sinT2 = v.n1 * Math.sin(rad1) / v.n2;
      const tir = Math.abs(sinT2) > 1;
      const theta2 = tir ? 0 : Math.asin(sinT2);
      const cx = W / 2, cy = midY, L = 100;
      arrow(ctx, cx - Math.sin(rad1) * L, cy - Math.cos(rad1) * L, cx, cy);
      if (!tir) arrow(ctx, cx, cy, cx + Math.sin(theta2) * L, cy + Math.cos(theta2) * L);
      else arrow(ctx, cx, cy, cx + Math.sin(rad1) * L, cy - Math.cos(rad1) * L);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = c.ink3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy - 80); ctx.lineTo(cx, cy + 80); ctx.stroke(); ctx.setLineDash([]);
    },
    read(s, v) {
      const rad1 = v.ang * Math.PI / 180;
      const sinT2 = v.n1 * Math.sin(rad1) / v.n2;
      const tir = Math.abs(sinT2) > 1;
      const theta2 = tir ? 0 : Math.asin(sinT2) * 180 / Math.PI;
      return [
        { label: 'Tushish burchagi', val: v.ang + '°' },
        { label: 'Sinish burchagi', val: tir ? 'To\'liq ichki qaytish' : theta2.toFixed(1) + '°' },
        { label: 'Snell qonuni', val: (v.n1 * Math.sin(rad1)).toFixed(2) }
      ];
    }
  },

  // 10) Tekis oyna
  { id: 'snell_law_demo', title: 'Snell qonuni', desc: 'Ishqalanish burchagi va sinusi nisbati',
    controls: [{ k: 'theta1', label: 'Kirishish burchagi', min: 0, max: 80, step: 5, val: 30, unit: '°' },
               { k: 'n1', label: 'Birinchi o\'rtacha n', min: 1, max: 2, step: 0.1, val: 1, unit: '' },
               { k: 'n2', label: 'Ikkinchi o\'rtacha n', min: 1, max: 2.5, step: 0.1, val: 1.5, unit: '' }],
    init(v) { return {}; },
    step(s, dt, v) {},
    draw(ctx, W, H, s, v) {
      const c = COL(); const t1 = v.theta1 * Math.PI / 180;
      const theta2 = Math.asin(v.n1 * Math.sin(t1) / v.n2);
      ctx.fillStyle = '#E8F4F8'; ctx.fillRect(0, 0, W, H / 2);
      ctx.fillStyle = '#ADD8E6'; ctx.fillRect(0, H / 2, W, H / 2);
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      const ix = 200, iy = H / 2;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ix, 0); ctx.lineTo(ix, iy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ix, iy);
      ctx.lineTo(ix + 100 * Math.sin(t1), iy - 100 * Math.cos(t1)); ctx.stroke();
      ctx.strokeStyle = c.mark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ix, iy);
      ctx.lineTo(ix + 100 * Math.sin(theta2), iy + 100 * Math.cos(theta2)); ctx.stroke();
    },
    read(s, v) { const t1 = v.theta1 * Math.PI / 180;
      const theta2 = Math.asin(v.n1 * Math.sin(t1) / v.n2) * 180 / Math.PI;
      return [{ label: 'Chiqish burchagi', val: theta2.toFixed(1) + '°' },
              { label: 'Kirishish burchagi', val: v.theta1 + '°' }]; }
  },
  {
    id: 'camera_obscura', title: 'Kamera obskura (qora xona)',
    desc: 'Og\'urti orqali tasvir hosil bo\'lishi',
    controls: [
      { k: 'f', label: 'Fokus masofasi', min: 20, max: 100, step: 5, val: 50, unit: 'mm' },
      { k: 'h', label: 'Buyum balandligi', min: 20, max: 80, step: 5, val: 50, unit: 'mm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(30, H / 2 - 50); ctx.lineTo(30, H / 2 + 50); ctx.stroke();
      ctx.fillStyle = c.rule; ctx.fillRect(40, H / 2 - 1, 2, 2);
      const di = (v.f * 100) / (100 - v.f);
      const hi = (di / 100) * v.h;
      ctx.strokeStyle = c.mark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W - 30, H / 2 - hi / 2); ctx.lineTo(W - 30, H / 2 + hi / 2); ctx.stroke();
    },
    read(s, v) {
      const di = (v.f * 100) / (100 - v.f);
      const hi = (di / 100) * v.h;
      return [
        { label: 'Tasvir balandligi', val: hi.toFixed(1) + ' mm' },
        { label: '1/f = 1/d + 1/di', val: 'Lens tenglamasi' },
        { label: 'Tasvir', val: 'Teskari' }
      ];
    }
  },

  // 86) Stefan-Boltzmann qorong`i jisim
  {
    id: 'total_internal_reflection', title: 'To\'liq ichki qaytish',
    desc: 'Kritik burchakdan oshsak to\'liq qaytish',
    controls: [
      { k: 'n', label: 'Sindirish koeff.', min: 1.2, max: 2.4, step: 0.1, val: 1.5, unit: 'n' },
      { k: "ang`", label: 'Tushish burchagi', min: 0, max: 90, step: 1, val: 45, unit: '°' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const midY = H / 2;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, midY); ctx.lineTo(W - 20, midY); ctx.stroke();
      ctx.fillStyle = c.rule2; ctx.fillRect(0, midY, W, H / 2);
      const rad_in = v.ang * Math.PI / 180;
      const critical = Math.asin(1 / v.n) * 180 / Math.PI;
      const isTIR = v.ang > critical;
      const cx = W / 2, cy = midY, L = 80;
      arrow(ctx, cx - Math.sin(rad_in) * L, cy - Math.cos(rad_in) * L, cx, cy);
      if (isTIR) {
        arrow(ctx, cx, cy, cx + Math.sin(rad_in) * L, cy - Math.cos(rad_in) * L);
      }
      ctx.fillStyle = c.ink3; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(isTIR ? 'To\'liq qaytish!' : 'Sinish', W / 2, 30);
    },
    read(s, v) {
      const critical = Math.asin(1 / v.n) * 180 / Math.PI;
      return [
        { label: 'Kritik burchak', val: critical.toFixed(1) + '°' },
        { label: 'Tushish burchagi', val: v.ang + '°' },
        { label: 'Holat', val: v.ang > critical ? 'To\'liq qaytish' : 'Sinish' }
      ];
    }
  },

  // 79) Yo`lbars effekti (Magnus)
  {
    id: 'mirror', title: 'Tekis oyna',
    desc: 'Oynada mavhum tasvir hosil bo\'lishi',
    controls: [
      { k: 'd', label: 'Jism masofasi', min: 30, max: 200, step: 5, val: 100, unit: 'px' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = c.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx, cy - 120); ctx.lineTo(cx, cy + 120); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = c.rule2;
        ctx.fillRect(cx + 4, cy - 120 + i * 20, 8, 16);
      }
      const ox = cx - v.d;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3;
      arrow(ctx, ox, cy, ox, cy - 40);
      ctx.strokeStyle = c.mark; ctx.lineWidth = 3;
      arrow(ctx, cx + v.d, cy, cx + v.d, cy - 40);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
      for (let yy = cy - 100; yy <= cy + 100; yy += 20) {
        ctx.beginPath(); ctx.moveTo(ox, yy); ctx.lineTo(cx, cy - 40); ctx.stroke();
      }
      ctx.setLineDash([]);
    },
    read(s, v) {
      return [
        { label: 'Jism masofasi', val: v.d + ' px' },
        { label: 'Tasvir masofasi', val: v.d + ' px' },
        { label: 'Tasvir turi', val: 'Mavhum, tik, teng o\'lchamli' }
      ];
    }
  },

  // ═══ KINEMATIKA ═══
  // 11) Tekis harakat
  {
    id: 'convex_mirror', title: 'Qavariq oyna',
    desc: 'Qavariq oynadagi tasvir',
    controls: [
      { k: 'R', label: 'Egriligi radiusi', min: 60, max: 300, step: 10, val: 150, unit: 'px' },
      { k: 'd', label: 'Jism masofasi', min: 40, max: 280, step: 5, val: 200, unit: 'px' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, v.R, -0.5, 0.5); ctx.stroke();
      const f = v.R / 2;
      const ox = cx - v.d;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3;
      arrow(ctx, ox, cy, ox, cy - 40);
      const di = -f * v.d / (v.d - f);
      const m = di / v.d;
      const ix = cx + di;
      const hi = m * 40;
      ctx.strokeStyle = c.mark; ctx.lineWidth = 3;
      arrow(ctx, ix, cy, ix, cy - hi);
    },
    read(s, v) {
      const f = v.R / 2;
      const di = -f * v.d / (v.d - f);
      const m = di / v.d;
      return [
        { label: 'Tasvir masofasi', val: Math.abs(di).toFixed(0) + ' px' },
        { label: 'Kattalashtirish', val: Math.abs(m).toFixed(2) + '×' },
        { label: 'Tasvir turi', val: 'Mavhum, to\'g\'ri' }
      ];
    }
  },

  // 32) Prism va dispersiya
  {
    id: 'lens', title: 'Yupqa linza (optika)',
    desc: 'Fokus va buyum masofasiga qarab tasvir yasalishi',
    controls: [
      { k: 'f', label: 'Fokus masofasi F', min: 40, max: 200, step: 5, val: 90, unit: 'px' },
      { k: 'd', label: 'Buyum masofasi', min: 60, max: 380, step: 5, val: 220, unit: 'px' },
      { k: 'h', label: 'Buyum balandligi', min: 20, max: 90, step: 2, val: 60, unit: 'px' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, ax = H / 2;
      // bosh o`q
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, ax); ctx.lineTo(W - 10, ax); ctx.stroke();
      // linza
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, ax - 95); ctx.lineTo(cx, ax + 95); ctx.stroke();
      // fokuslar
      ctx.fillStyle = c.ink3;
      [cx - v.f, cx + v.f].forEach(x => { ctx.beginPath(); ctx.arc(x, ax, 3, 0, 7); ctx.fill(); });
      // buyum
      const ox = cx - v.d, topO = ax - v.h;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 3; arrow(ctx, ox, ax, ox, topO);
      // tasvir: 1/f = 1/d + 1/di
      const di = 1 / (1 / v.f - 1 / v.d);
      const m = -di / v.d, hi = m * v.h;
      const ix = cx + di, topI = ax - hi;
      if (isFinite(di) && Math.abs(di) < 4000) {
        ctx.strokeStyle = c.mark; ctx.lineWidth = 3; arrow(ctx, ix, ax, ix, topI);
        // nurlar
        ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ox, topO); ctx.lineTo(cx, topO); ctx.lineTo(ix, topI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, topO); ctx.lineTo(ix, topI); ctx.stroke();
      }
    },
    read(s, v) {
      const di = 1 / (1 / v.f - 1 / v.d);
      const m = -di / v.d;
      return [
        { label: 'Tasvir masofasi', val: isFinite(di) ? Math.abs(di).toFixed(0) + ' px' : '∞' },
        { label: 'Kattalashtirish', val: m.toFixed(2) + '×' },
        { label: 'Tasvir turi', val: i18n.t(di > 0 ? 'Haqiqiy, teskari' : 'Mavhum, to‘g‘ri') }
      ];
    }
  },

  // 6) Gaz qonuni (izoterma)
  {
    id: 'concave_lens', title: 'Botiq linza (uzoqlashtiruvchi)',
    desc: 'Tekis va qavariq linza kombinatsiyasi',
    controls: [
      { k: 'f1', label: 'Linza 1 fokus', min: 30, max: 150, step: 5, val: 80, unit: 'px' },
      { k: 'd', label: 'Linzalar orasidagi masofa', min: 20, max: 150, step: 5, val: 80, unit: 'px' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cy = H / 2;
      const ax = H / 2;
      ctx.strokeStyle = c.rule2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, ax); ctx.lineTo(W - 10, ax); ctx.stroke();
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(80, ax - 80); ctx.lineTo(80, ax + 80); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(80 + v.d, ax - 80); ctx.lineTo(80 + v.d, ax + 80); ctx.stroke();
      const f_eq = 1 / (1 / v.f1 + 1 / v.f1 - v.d / (v.f1 * v.f1));
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('F_eq = ' + Math.abs(f_eq).toFixed(0) + ' px', W / 2, 30);
    },
    read(s, v) {
      const f_eq = 1 / (1 / v.f1 + 1 / v.f1 - v.d / (v.f1 * v.f1));
      return [
        { label: 'Ekvivalent fokus', val: Math.abs(f_eq).toFixed(0) + ' px' },
        { label: 'Linzalar orasidagi masofa', val: v.d + ' px' },
        { label: 'Sistema turi', val: f_eq > 0 ? 'Oshiruvchi' : 'Kamaytirvchi' }
      ];
    }
  },

  // 47) Interference (Young double slit)
  {
    id: 'prism', title: 'Prism (dispersiya)',
    desc: 'Oq yorug\'likning spektrga ajralishi',
    controls: [
      { k: 'n', label: 'Sindirish koeff.', min: 1.3, max: 1.8, step: 0.05, val: 1.5, unit: 'n' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2;
      ctx.fillStyle = c.rule2; ctx.beginPath();
      ctx.moveTo(cx - 50, cy - 80); ctx.lineTo(cx + 50, cy - 80); ctx.lineTo(cx, cy + 60); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.stroke();
      const colors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - 20 + i * 6, cy + 60);
        ctx.lineTo(cx - 20 + i * 6 + 15 * (i - 3) / 15, cy + 120);
        ctx.stroke();
      }
    },
    read(s, v) {
      return [
        { label: 'Sindirish koeff.', val: v.n + '' },
        { label: 'Oq yorug\'lik', val: 'Spektrga ajraladi' },
        { label: 'Dispersiya hodisasi', val: 'Mavjud' }
      ];
    }
  },

  // 33) Diffraktisiya (Difraktsiya)
  {
    id: 'light_intensity', title: 'Yorug\'lik intensitesi',
    desc: 'Masofaga qarab yorug\'lik kuchlanishi (1/r²)',
    controls: [
      { k: 'r', label: 'Masofa r', min: 10, max: 100, step: 5, val: 50, unit: 'cm' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const I = 100 / (v.r * v.r / 100);
      ctx.fillStyle = c.ok; ctx.globalAlpha = I / 100;
      ctx.fillRect(20, 20, W - 40, H - 40);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.ink3; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('I = ' + I.toFixed(1), W / 2, 30);
    },
    read(s, v) {
      const I = 100 / (v.r * v.r / 100);
      return [
        { label: 'Intensitesi I', val: I.toFixed(1) },
        { label: 'I ∝ 1/r²', val: 'Kvadrat qonuni' },
        { label: 'Masofa', val: v.r + ' cm' }
      ];
    }
  },

  // ══ Darslar bo'limidagi mavzular bilan solishtirilgach yangi qo'shilgan
  //    simulyatsiyalar — avval sim yo'q bo'lgan mavzular uchun ══════════

  // MEXANIKA — Nyutonning 1 va 3-qonuni (G7 2.12), Paskal qonuni (G7 2.15)
  {
    id: 'newton_first_third', title: "Nyuton 1 va 3-qonuni",
    desc: "Prujina bilan ajraladigan ikki aravacha — inersiya va ta'sir-aks ta'sir kuchlari",
    controls: [
      { k: 'm1', label: '1-aravacha massasi', min: 1, max: 10, step: 0.5, val: 2, unit: 'kg' },
      { k: 'm2', label: '2-aravacha massasi', min: 1, max: 10, step: 0.5, val: 4, unit: 'kg' },
      { k: 'F', label: "Prujina kuchi", min: 5, max: 40, step: 1, val: 20, unit: 'N' }
    ],
    init() { return { t: 0, released: false, x1: 0, x2: 0 }; },
    step(s, dt, v) {
      s.t += dt;
      if (s.t > 0.4 && !s.released) s.released = true;
      if (s.released) {
        const a1 = v.F / v.m1, a2 = v.F / v.m2;
        const tt = s.t - 0.4;
        s.x1 = -0.5 * a1 * Math.min(tt, 0.6) * Math.min(tt, 0.6) - a1 * 0.6 * Math.max(0, tt - 0.6);
        s.x2 = 0.5 * a2 * Math.min(tt, 0.6) * Math.min(tt, 0.6) + a2 * 0.6 * Math.max(0, tt - 0.6);
      }
      if (s.t > 3.5) { s.t = 0; s.released = false; s.x1 = 0; s.x2 = 0; }
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const midY = H / 2, scale = 14;
      const cx1 = W / 2 - 30 + s.x1 * scale, cx2 = W / 2 + 30 + s.x2 * scale;
      ctx.strokeStyle = c.rule; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(20, midY + 24); ctx.lineTo(W - 20, midY + 24); ctx.stroke();
      const w1 = 24 + v.m1 * 3, w2 = 24 + v.m2 * 3;
      ctx.fillStyle = c.ok; ctx.fillRect(cx1 - w1 / 2, midY - 16, w1, 32);
      ctx.fillStyle = c.mark; ctx.fillRect(cx2 - w2 / 2, midY - 16, w2, 32);
      if (!s.released) {
        ctx.strokeStyle = c.ink2; ctx.lineWidth = 2;
        ctx.beginPath();
        const zx0 = cx1 + w1 / 2, zx1 = cx2 - w2 / 2, zn = 6;
        ctx.moveTo(zx0, midY);
        for (let i = 1; i < zn; i++) ctx.lineTo(zx0 + (zx1 - zx0) * i / zn, midY + (i % 2 ? 6 : -6));
        ctx.lineTo(zx1, midY); ctx.stroke();
      } else {
        arrow(ctx, cx1 - w1 / 2 - 4, midY, cx1 - w1 / 2 - 26, midY);
        arrow(ctx, cx2 + w2 / 2 + 4, midY, cx2 + w2 / 2 + 26, midY);
      }
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v.m1 + ' kg', cx1, midY + 40);
      ctx.fillText(v.m2 + ' kg', cx2, midY + 40);
      ctx.fillText(s.released ? "Ajralgach — teng va qarama-qarshi tezliklar (3-qonun)" : "Prujina siqilgan — kuch to'planmoqda", W / 2, 26);
    },
    read(s, v) {
      const p1 = v.F * 0.4, ratio = v.m2 / v.m1;
      return [
        { label: "1-aravacha tezlanishi", val: (v.F / v.m1).toFixed(2) + ' m/s²' },
        { label: "2-aravacha tezlanishi", val: (v.F / v.m2).toFixed(2) + ' m/s²' },
        { label: "Impuls (teng, qarama-qarshi)", val: p1.toFixed(1) + ' kg·m/s' },
        { label: 'v1/v2 = m2/m1', val: ratio.toFixed(2) }
      ];
    }
  },

  {
    id: 'pascal_law', title: 'Paskal qonuni (gidravlik pres)',
    desc: "Kichik porshendagi kuch suyuqlik orqali katta porshenga bosim sifatida uzatiladi",
    controls: [
      { k: 'F1', label: 'Kichik porshenga kuch', min: 5, max: 50, step: 1, val: 20, unit: 'N' },
      { k: 'A1', label: 'Kichik porshen yuzi', min: 5, max: 20, step: 1, val: 10, unit: 'cm²' },
      { k: 'A2', label: 'Katta porshen yuzi', min: 20, max: 150, step: 5, val: 80, unit: 'cm²' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const P = v.F1 / v.A1;
      const F2 = P * v.A2;
      const baseY = H - 30;
      const w1 = 22 + v.A1 * 1.2, w2 = 22 + v.A2 * 0.6;
      const x1 = W * 0.28, x2 = W * 0.72;
      const drop1 = Math.min(30, v.F1 * 0.5), drop2 = Math.min(30, F2 * 0.5 * (w1 * w1) / (w2 * w2));
      ctx.fillStyle = c.rule2;
      ctx.beginPath(); ctx.moveTo(x1 - 60, baseY); ctx.lineTo(x1 + 60, baseY);
      ctx.lineTo(x2 + 70, baseY); ctx.lineTo(x2 - 70, baseY); ctx.closePath(); ctx.fill();
      ctx.fillRect(x1 - 60, baseY - 60, x2 + 70 - (x1 - 60), 60);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.strokeRect(x1 - 60, baseY - 90, x2 + 130 - (x1 - 60), 90);
      // porshenlar
      ctx.fillStyle = c.ok; ctx.fillRect(x1 - w1 / 2, baseY - 90 + drop1, w1, 14);
      ctx.fillStyle = c.mark; ctx.fillRect(x2 - w2 / 2, baseY - 90 + drop2, w2, 14);
      arrow(ctx, x1, baseY - 90 + drop1 - 6, x1, baseY - 90 + drop1 + 10);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('F1 = ' + v.F1 + ' N', x1, baseY - 100 + drop1);
      ctx.fillText('F2 = ' + F2.toFixed(0) + ' N', x2, baseY - 100 + drop2);
    },
    read(s, v) {
      const P = v.F1 / v.A1, F2 = P * v.A2;
      return [
        { label: 'Bosim P = F1/A1', val: P.toFixed(2) + ' N/cm²' },
        { label: "Katta porshendagi kuch F2", val: F2.toFixed(1) + ' N' },
        { label: 'Yutish koeffitsienti A2/A1', val: (v.A2 / v.A1).toFixed(1) + '×' }
      ];
    }
  },

  // TERMODINAMIKA — Aralashma harorati (G7 3.23 / G9 2.13), Adiabatik jarayon (G9 1.8)
  {
    id: 'calorimetry', title: 'Aralashma harorati (kalorimetriya)',
    desc: "Issiq jism va sovuq suv aralashganda muvozanat harorati — issiqlik balansi",
    controls: [
      { k: 'm1', label: 'Issiq jism massasi', min: 0.1, max: 2, step: 0.1, val: 0.5, unit: 'kg' },
      { k: 'T1', label: 'Issiq jism harorati', min: 50, max: 200, step: 5, val: 100, unit: '°C' },
      { k: 'm2', label: 'Suv massasi', min: 0.5, max: 5, step: 0.1, val: 1, unit: 'kg' },
      { k: 'T2', label: "Suvning boshlang'ich harorati", min: 5, max: 40, step: 1, val: 20, unit: '°C' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t = Math.min(s.t + dt, 4); },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const c1 = 0.46, c2 = 4.2; // solishtirma issiqlik (metall / suv), kJ/(kg·K) taxminiy
      const Tf = (v.m1 * c1 * v.T1 + v.m2 * c2 * v.T2) / (v.m1 * c1 + v.m2 * c2);
      const k = 1 - Math.exp(-s.t * 1.5);
      const curT1 = v.T1 + (Tf - v.T1) * k;
      const curT2 = v.T2 + (Tf - v.T2) * k;
      const x0 = W / 2 - 70, x1 = W / 2 + 70, baseY = H - 30, boxH = H - 70;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 45, baseY - boxH, 90, boxH);
      ctx.fillStyle = 'rgba(179,55,43,' + (0.15 + 0.5 * (curT1 / 200)) + ')';
      ctx.fillRect(x0 - 45, baseY - boxH, 90, boxH);
      ctx.strokeStyle = c.ink3; ctx.strokeRect(x1 - 45, baseY - boxH, 90, boxH);
      ctx.fillStyle = 'rgba(27,110,95,' + (0.1 + 0.5 * (curT2 / 100)) + ')';
      const wLevel = boxH * 0.75;
      ctx.fillRect(x1 - 45, baseY - wLevel, 90, wLevel);
      ctx.fillStyle = c.ink; ctx.font = '600 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(curT1.toFixed(1) + '°C', x0, baseY - boxH - 12);
      ctx.fillText(curT2.toFixed(1) + '°C', x1, baseY - boxH - 12);
      ctx.font = '11px sans-serif'; ctx.fillStyle = c.ink3;
      ctx.fillText('Issiq jism', x0, baseY + 16);
      ctx.fillText('Suv', x1, baseY + 16);
      if (k > 0.9) {
        ctx.fillStyle = c.ok; ctx.font = '600 12px sans-serif';
        ctx.fillText('Muvozanat: Tf = ' + Tf.toFixed(1) + '°C', W / 2, 24);
      }
    },
    read(s, v) {
      const c1 = 0.46, c2 = 4.2;
      const Tf = (v.m1 * c1 * v.T1 + v.m2 * c2 * v.T2) / (v.m1 * c1 + v.m2 * c2);
      return [
        { label: 'Muvozanat harorati Tf', val: Tf.toFixed(1) + '°C' },
        { label: 'm1c1(T1−Tf) = m2c2(Tf−T2)', val: "Issiqlik balansi" }
      ];
    }
  },

  {
    id: 'adiabatic_process', title: 'Adiabatik jarayon',
    desc: "Issiqlik almashinuvisiz siqilish/kengayish — PV^γ = const, harorat ham o'zgaradi",
    controls: [
      { k: 'V', label: 'Hajm', min: 30, max: 100, step: 1, val: 65, unit: '%' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const gamma = 1.4, V0 = 65, P0 = 100, T0 = 300;
      const ratio = V0 / v.V;
      const P = P0 * Math.pow(ratio, gamma);
      const T = T0 * Math.pow(ratio, gamma - 1);
      const x0 = 30, y0 = 24, boxH = H - 60;
      const boxW = (W - 120) * (v.V / 100);
      const heat = Math.min(1, (T - T0) / 250);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, boxW, boxH);
      ctx.fillStyle = `rgba(179,55,43,${0.08 + 0.5 * Math.max(0, heat)})`;
      ctx.fillRect(x0, y0, boxW, boxH);
      ctx.fillStyle = c.rule; ctx.fillRect(x0 + boxW, y0 - 8, 12, boxH + 16);
      ctx.fillStyle = c.ink; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('P = ' + P.toFixed(0) + '  T = ' + T.toFixed(0) + ' K', W / 2, H - 16);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif';
      ctx.fillText("PV^γ = const (γ = 1.4)", W / 2, 16);
    },
    read(s, v) {
      const gamma = 1.4, V0 = 65, P0 = 100, T0 = 300;
      const ratio = V0 / v.V;
      const P = P0 * Math.pow(ratio, gamma);
      const T = T0 * Math.pow(ratio, gamma - 1);
      return [
        { label: 'Bosim (nisbiy)', val: P.toFixed(1) },
        { label: 'Harorat', val: T.toFixed(0) + ' K' },
        { label: 'Issiqlik almashinuvi', val: "Yo'q (Q = 0)" }
      ];
    }
  },

  {
    id: 'surface_tension', title: "Sirt taranglik kuchi",
    desc: "Sim ustidagi suyuqlik pardasi — pardani cho'zish uchun kerakli kuch F = 2σL",
    controls: [
      { k: 'L', label: "Simning uzunligi", min: 2, max: 12, step: 0.5, val: 6, unit: 'cm' },
      { k: 'sigma', label: "Sirt taranglik σ (suv ≈ 0.07)", min: 0.02, max: 0.1, step: 0.005, val: 0.07, unit: 'N/m' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const F = 2 * v.sigma * (v.L / 100);
      const frameW = 40 + v.L * 14, frameH = 90;
      const x0 = W / 2 - frameW / 2, y0 = H / 2 - frameH / 2;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + frameH);
      ctx.moveTo(x0 + frameW, y0); ctx.lineTo(x0 + frameW, y0 + frameH);
      ctx.stroke();
      const barY = y0 + frameH * 0.65;
      ctx.fillStyle = 'rgba(76,141,246,.25)';
      ctx.fillRect(x0, y0, frameW, barY - y0);
      ctx.strokeStyle = c.ok; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x0, barY); ctx.lineTo(x0 + frameW, barY); ctx.stroke();
      arrow(ctx, x0 + frameW / 2, barY + 6, x0 + frameW / 2, barY + 30);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('F = ' + (F * 1000).toFixed(1) + ' mN', x0 + frameW / 2, barY + 46);
      ctx.fillText("Suyuqlik pardasi (2 sirt)", W / 2, y0 - 10);
    },
    read(s, v) {
      const F = 2 * v.sigma * (v.L / 100);
      return [
        { label: 'Kuch F = 2σL', val: (F * 1000).toFixed(2) + ' mN' },
        { label: "Sirt taranglik σ", val: v.sigma.toFixed(3) + ' N/m' }
      ];
    }
  },

  // ELEKTR — Ketma-ket/parallel ulash (G8 2.11, 2.14), Elektroliz (G8 3.20),
  //          Dvigatel/generator (G8 4.29), Elektrlanish/elektroskop (G7 3.26-27, G8 1.1/1.3)
  {
    id: 'series_parallel_resistors', title: "Rezistorlarni ketma-ket va parallel ulash",
    desc: "Ulanish turiga qarab umumiy qarshilik va tok kuchi qanday o'zgarishini ko'ring",
    controls: [
      { k: 'U', label: 'Kuchlanish U', min: 3, max: 24, step: 1, val: 12, unit: 'V' },
      { k: 'R1', label: 'Rezistor R1', min: 5, max: 50, step: 1, val: 20, unit: 'Ω' },
      { k: 'R2', label: 'Rezistor R2', min: 5, max: 50, step: 1, val: 30, unit: 'Ω' },
      { k: 'mode', label: "Ulanish (0=ketma-ket, 1=parallel)", min: 0, max: 1, step: 1, val: 0 }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const parallel = v.mode >= 0.5;
      const Req = parallel ? (v.R1 * v.R2) / (v.R1 + v.R2) : v.R1 + v.R2;
      const I = v.U / Req;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2.5;
      const L = 40, R = W - 40, TP = 40, BT = H - 40, my = (TP + BT) / 2;
      if (!parallel) {
        ctx.strokeRect(L, TP, R - L, BT - TP);
        const zigzag = (zx: number, zw: number) => {
          ctx.strokeStyle = c.mark; ctx.beginPath(); ctx.moveTo(zx, TP);
          for (let i = 0; i < 6; i++) ctx.lineTo(zx + zw / 6 * (i + 0.5), TP + (i % 2 ? 7 : -7));
          ctx.lineTo(zx + zw, TP); ctx.stroke();
        };
        zigzag(L + (R - L) * 0.2, (R - L) * 0.22);
        zigzag(L + (R - L) * 0.55, (R - L) * 0.22);
      } else {
        ctx.strokeStyle = c.ink3;
        ctx.beginPath(); ctx.moveTo(L, my); ctx.lineTo(L + 30, my); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R - 30, my); ctx.lineTo(R, my); ctx.stroke();
        [my - 30, my + 30].forEach((yy) => {
          ctx.beginPath(); ctx.moveTo(L + 30, my); ctx.lineTo(L + 30, yy); ctx.lineTo(R - 30, yy); ctx.lineTo(R - 30, my); ctx.stroke();
          ctx.strokeStyle = c.mark;
          const zx = (L + 30 + R - 30) / 2 - 30, zw = 60;
          ctx.beginPath(); ctx.moveTo(zx, yy);
          for (let i = 0; i < 6; i++) ctx.lineTo(zx + zw / 6 * (i + 0.5), yy + (i % 2 ? 6 : -6));
          ctx.lineTo(zx + zw, yy); ctx.stroke();
          ctx.strokeStyle = c.ink3;
        });
      }
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('R1 = ' + v.R1 + ' Ω, R2 = ' + v.R2 + ' Ω — ' + (parallel ? 'parallel' : 'ketma-ket'), W / 2, H - 12);
    },
    read(s, v) {
      const parallel = v.mode >= 0.5;
      const Req = parallel ? (v.R1 * v.R2) / (v.R1 + v.R2) : v.R1 + v.R2;
      const I = v.U / Req;
      return [
        { label: 'Umumiy qarshilik Req', val: Req.toFixed(1) + ' Ω' },
        { label: 'Umumiy tok I', val: I.toFixed(2) + ' A' },
        { label: 'Formula', val: parallel ? '1/Req = 1/R1 + 1/R2' : 'Req = R1 + R2' }
      ];
    }
  },

  {
    id: 'capacitors_series_parallel', title: "Kondensatorlarni ketma-ket va parallel ulash",
    desc: "Ulanish turiga qarab umumiy sig'im qanday o'zgarishini ko'ring",
    controls: [
      { k: 'C1', label: 'Kondensator C1', min: 1, max: 20, step: 1, val: 10, unit: 'μF' },
      { k: 'C2', label: 'Kondensator C2', min: 1, max: 20, step: 1, val: 15, unit: 'μF' },
      { k: 'mode', label: "Ulanish (0=ketma-ket, 1=parallel)", min: 0, max: 1, step: 1, val: 0 }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const parallel = v.mode >= 0.5;
      const Ceq = parallel ? v.C1 + v.C2 : (v.C1 * v.C2) / (v.C1 + v.C2);
      const L = 40, R = W - 40, my = H / 2;
      const plate = (x: number, yy: number) => { ctx.strokeStyle = c.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, yy - 20); ctx.lineTo(x, yy + 20); ctx.stroke(); };
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      if (!parallel) {
        ctx.beginPath(); ctx.moveTo(L, my); ctx.lineTo(R, my); ctx.stroke();
        const x1 = W * 0.42, x2 = W * 0.58;
        plate(x1 - 4, my); plate(x1 + 4, my); plate(x2 - 4, my); plate(x2 + 4, my);
      } else {
        ctx.beginPath(); ctx.moveTo(L, my - 30); ctx.lineTo(L + 40, my - 30); ctx.lineTo(L + 40, my + 30); ctx.lineTo(L, my + 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R, my - 30); ctx.lineTo(R - 40, my - 30); ctx.lineTo(R - 40, my + 30); ctx.lineTo(R, my + 30); ctx.stroke();
        plate(W / 2 - 24, my - 30); plate(W / 2 - 16, my - 30);
        plate(W / 2 - 24, my + 30); plate(W / 2 - 16, my + 30);
      }
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('C1 = ' + v.C1 + ' μF, C2 = ' + v.C2 + ' μF — ' + (parallel ? 'parallel' : 'ketma-ket'), W / 2, H - 16);
      ctx.fillStyle = c.ink; ctx.font = '600 13px sans-serif';
      ctx.fillText('Ceq = ' + Ceq.toFixed(1) + ' μF', W / 2, 26);
    },
    read(s, v) {
      const parallel = v.mode >= 0.5;
      const Ceq = parallel ? v.C1 + v.C2 : (v.C1 * v.C2) / (v.C1 + v.C2);
      return [
        { label: "Umumiy sig'im Ceq", val: Ceq.toFixed(2) + ' μF' },
        { label: 'Formula', val: parallel ? 'Ceq = C1 + C2' : '1/Ceq = 1/C1 + 1/C2' }
      ];
    }
  },

  {
    id: 'electrolysis', title: 'Elektroliz hodisasi',
    desc: "Eritmadan tok o'tganda elektrodlarda modda ajraladi — Faraday qonuni m = kIt",
    controls: [
      { k: 'I', label: 'Tok kuchi', min: 0.5, max: 10, step: 0.5, val: 3, unit: 'A' },
      { k: 't', label: 'Vaqt', min: 10, max: 300, step: 10, val: 120, unit: 's' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const k = 0.000328; // taxminiy elektrokimyoviy ekvivalent (mis uchun, g/C)
      const m = k * v.I * v.t;
      const x0 = W / 2 - 70, x1 = W / 2 + 70, top = 30, bot = H - 30;
      ctx.fillStyle = 'rgba(76,141,246,.14)'; ctx.fillRect(x0 - 50, top + 10, (x1 - x0) + 100, bot - top - 10);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2; ctx.strokeRect(x0 - 50, top + 10, (x1 - x0) + 100, bot - top - 10);
      ctx.fillStyle = c.ink; ctx.fillRect(x0 - 5, top, 10, bot - top - 10);
      ctx.fillRect(x1 - 5, top, 10, bot - top - 10);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Anod', x0, top - 8); ctx.fillText('Katod', x1, top - 8);
      // pufakchalar — tokka mos tezlikda
      const speed = v.I * 20;
      ctx.fillStyle = c.ok;
      for (let i = 0; i < Math.round(v.I * 2); i++) {
        const yy = bot - 20 - ((s.t * speed + i * 30) % (bot - top - 30));
        ctx.beginPath(); ctx.arc(x0 + 15 + (i % 3) * 8, yy, 2.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x1 - 15 - (i % 3) * 8, yy, 2.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = c.ink; ctx.font = '600 12px sans-serif';
      ctx.fillText('Ajralgan modda: ' + m.toFixed(3) + ' g', W / 2, H - 8);
    },
    read(s, v) {
      const k = 0.000328;
      const m = k * v.I * v.t;
      return [
        { label: 'Ajralgan modda massasi', val: m.toFixed(3) + ' g' },
        { label: 'm = kIt', val: `k·${v.I}·${v.t}` }
      ];
    }
  },

  {
    id: 'motor_generator', title: 'Dvigatel va generator',
    desc: "Magnit maydondagi ramka: tok berilsa — dvigatel, aylantirilsa — generator",
    controls: [
      { k: 'B', label: 'Magnit maydon B', min: 0.1, max: 2, step: 0.1, val: 1, unit: 'T' },
      { k: 'I', label: "Tok kuchi (dvigatel rejimida)", min: 0, max: 5, step: 0.25, val: 2, unit: 'A' }
    ],
    init() { return { ang: 0 }; },
    step(s, dt, v) {
      const torque = v.B * v.I * Math.sin(s.ang) * 2;
      s.ang += torque * dt * 0.8 + dt * 0.4;
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 30;
      ctx.strokeStyle = c.mark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - R - 20, cy); ctx.lineTo(cx - R, cy); ctx.stroke();
      ctx.strokeStyle = c.ok;
      ctx.beginPath(); ctx.moveTo(cx + R, cy); ctx.lineTo(cx + R + 20, cy); ctx.stroke();
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('N', cx - R - 26, cy + 4); ctx.fillText('S', cx + R + 26, cy + 4);
      const w = 70, h = 46;
      const cosA = Math.cos(s.ang);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * Math.abs(cosA) + 2, h, 0, 0, 6.284);
      ctx.stroke();
      const emfMag = Math.abs(Math.sin(s.ang)) * v.B * 4;
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif';
      ctx.fillText('EMF ∝ B·ω·sin(θ)  —  hozirgi: ' + emfMag.toFixed(2) + ' V', cx, H - 14);
    },
    read(s, v) {
      const rpm = Math.abs(v.B * v.I) * 40;
      return [
        { label: 'Aylanish momenti M', val: (v.B * v.I).toFixed(2) + ' N·m (max)' },
        { label: "Taxminiy tezlik", val: rpm.toFixed(0) + ' ayl/min' }
      ];
    }
  },

  {
    id: 'electrification', title: "Jismlarning elektrlanishi (elektroskop)",
    desc: "Ishqalanish orqali zaryadlangan tayoqcha elektroskop barglarini ajratadi",
    controls: [
      { k: 'q', label: 'Zaryad miqdori', min: 0, max: 10, step: 0.5, val: 5, unit: 'nC' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, topY = 40;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, topY, 10, 0, 6.284); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, topY + 10); ctx.lineTo(cx, topY + 70); ctx.stroke();
      const angle = Math.min(55, v.q * 6) * Math.PI / 180;
      const leafLen = 60;
      [1, -1].forEach((dir) => {
        ctx.strokeStyle = c.mark; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, topY + 70);
        ctx.lineTo(cx + dir * Math.sin(angle) * leafLen, topY + 70 + Math.cos(angle) * leafLen);
        ctx.stroke();
      });
      // zaryadlangan tayoqcha
      const rodX = cx - 90 - (10 - v.q) * 2;
      ctx.strokeStyle = c.ok; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rodX - 40, topY - 20); ctx.lineTo(rodX, topY); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('+'.repeat(Math.max(1, Math.round(v.q / 2))), rodX - 20, topY - 30);
      ctx.fillText('Barglar orasidagi burchak: ' + (angle * 180 / Math.PI).toFixed(0) + '°', cx, H - 16);
    },
    read(s, v) {
      const angle = Math.min(55, v.q * 6);
      return [
        { label: 'Zaryad', val: v.q.toFixed(1) + ' nC' },
        { label: 'Barglar burchagi', val: angle.toFixed(0) + '°' },
        { label: "Qonun", val: "bir xil zaryadlar — itarilish" }
      ];
    }
  },

  // MEXANIKA — Atmosfera bosimi (G7 2.17)
  {
    id: 'atmospheric_pressure', title: 'Atmosfera bosimi (barometr)',
    desc: "Simob ustunining balandligi atmosfera bosimini ko'rsatadi — Torricelli tajribasi",
    controls: [
      { k: 'P', label: 'Atmosfera bosimi', min: 650, max: 800, step: 5, val: 760, unit: 'mm sim.ust.' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const baseY = H - 30, tubeTop = 30, tubeX = W / 2, tubeW = 18;
      const maxH = baseY - tubeTop;
      const colH = (v.P / 800) * maxH;
      ctx.fillStyle = c.rule2; ctx.fillRect(tubeX - 60, baseY, 120, 16);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2; ctx.strokeRect(tubeX - 60, baseY, 120, 16);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.strokeRect(tubeX - tubeW / 2, tubeTop, tubeW, maxH + 16);
      ctx.fillStyle = c.mark;
      ctx.fillRect(tubeX - tubeW / 2 + 2, baseY + 16 - colH, tubeW - 4, colH);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v.P + ' mm', tubeX, baseY - colH - 8);
      ctx.fillText("Atmosfera havoning bosimi simob ustunini ko'tarib turadi", W / 2, 18);
    },
    read(s, v) {
      const pascal = v.P * 133.3;
      return [
        { label: 'Bosim (simob ustuni)', val: v.P + ' mm Hg' },
        { label: 'Bosim (Pa)', val: Math.round(pascal) + ' Pa' },
        { label: "Normal atmosfera bosimi", val: '760 mm Hg' }
      ];
    }
  },

  // TERMODINAMIKA — Ichki yonuv dvigateli (G9 2.14), Yonish issiqligi (G7 3.24 / G9 2.11)
  {
    id: 'internal_combustion', title: 'Ichki yonuv dvigateli (4 taktli)',
    desc: "Porshenning 4 takti: so'rish, siqish, ishchi takt, chiqarish",
    controls: [
      { k: 'rpm', label: 'Aylanish tezligi', min: 20, max: 200, step: 10, val: 80, unit: 'ayl/min' }
    ],
    init() { return { ang: 0 }; },
    step(s, dt, v) {
      s.ang += (v.rpm / 60) * 2 * Math.PI * dt * 0.5;
    },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const cx = W / 2, cranky = H - 60, crankR = 30;
      const ang = s.ang % (4 * Math.PI);
      const stroke = Math.floor(ang / (Math.PI / 2)) % 4;
      const names = ["So'rish", 'Siqish', 'Ishchi takt', 'Chiqarish'];
      const pistonY = cranky - crankR - 90 + Math.cos(ang) * 40;
      const cylX0 = cx - 40, cylW = 80, cylTop = 30, cylBot = cranky - crankR - 10;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.strokeRect(cylX0, cylTop, cylW, cylBot - cylTop);
      const flame = stroke === 2;
      ctx.fillStyle = flame ? 'rgba(179,55,43,.35)' : 'rgba(76,141,246,.14)';
      ctx.fillRect(cylX0, cylTop, cylW, pistonY - cylTop);
      ctx.fillStyle = c.ink; ctx.fillRect(cylX0 + 4, pistonY, cylW - 8, 18);
      ctx.strokeStyle = c.ink2; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, pistonY + 18); ctx.lineTo(cx + Math.sin(ang) * crankR, cranky - Math.cos(ang) * crankR * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cranky, crankR, 0, 6.284); ctx.strokeStyle = c.ink3; ctx.stroke();
      ctx.fillStyle = c.ink; ctx.font = '600 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(names[stroke], W / 2, 18);
    },
    read(s, v) {
      const stroke = Math.floor((s.ang % (4 * Math.PI)) / (Math.PI / 2)) % 4;
      const names = ["So'rish", 'Siqish', 'Ishchi takt', 'Chiqarish'];
      return [
        { label: 'Hozirgi takt', val: names[stroke] },
        { label: 'Aylanish tezligi', val: v.rpm + ' ayl/min' }
      ];
    }
  },

  {
    id: 'combustion_heat', title: "Yoqilg'ining solishtirma yonish issiqligi",
    desc: "Yonganda ajraladigan issiqlik miqdori — Q = mq",
    controls: [
      { k: 'm', label: "Yoqilg'i massasi", min: 0.1, max: 5, step: 0.1, val: 1, unit: 'kg' },
      { k: 'q', label: "Solishtirma yonish issiqligi", min: 10, max: 46, step: 1, val: 44, unit: 'MJ/kg' }
    ],
    init() { return { t: 0 }; },
    step(s, dt) { s.t += dt; },
    draw(ctx, W, H, s, v) {
      const c = COL();
      const Q = v.m * v.q;
      const cx = W / 2, baseY = H - 30;
      const flameH = 20 + Math.min(80, v.q * 1.5);
      const flicker = Math.sin(s.t * 8) * 4;
      ctx.fillStyle = 'rgba(179,55,43,.7)';
      ctx.beginPath();
      ctx.moveTo(cx, baseY - flameH - flicker);
      ctx.quadraticCurveTo(cx + 22, baseY - flameH * 0.5, cx + 10, baseY);
      ctx.quadraticCurveTo(cx, baseY - 10, cx - 10, baseY);
      ctx.quadraticCurveTo(cx - 22, baseY - flameH * 0.5, cx, baseY - flameH - flicker);
      ctx.fill();
      ctx.fillStyle = c.ink3; ctx.fillRect(cx - 30, baseY, 60, 10);
      ctx.fillStyle = c.ink; ctx.font = '600 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Q = ' + Q.toFixed(1) + ' MJ', W / 2, 26);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif';
      ctx.fillText('m = ' + v.m.toFixed(1) + ' kg, q = ' + v.q + ' MJ/kg', W / 2, H - 6);
    },
    read(s, v) {
      const Q = v.m * v.q;
      return [
        { label: 'Ajralgan issiqlik Q', val: Q.toFixed(2) + ' MJ' },
        { label: 'Q = mq', val: `${v.m}×${v.q}` }
      ];
    }
  },

  // ELEKTR — Elektromagnit rele (G8 4.28)
  {
    id: 'electromagnetic_relay', title: 'Elektromagnit rele',
    desc: "Boshqaruv zanjiridagi kichik tok elektromagnitni ishga tushirib, quvvat zanjirini ulaydi",
    controls: [
      { k: 'I', label: 'Boshqaruv toki', min: 0, max: 3, step: 0.1, val: 0.8, unit: 'A' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const threshold = 1.2;
      const on = v.I >= threshold;
      const coilX = W * 0.28, coilY = H / 2;
      ctx.strokeStyle = on ? c.ok : c.ink3; ctx.lineWidth = 3;
      ctx.strokeRect(coilX - 16, coilY - 26, 32, 52);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { ctx.moveTo(coilX - 14, coilY - 22 + i * 9); ctx.lineTo(coilX + 14, coilY - 22 + i * 9); }
      ctx.stroke();
      const armX = W * 0.55;
      const armAngle = on ? -0.35 : 0;
      ctx.save();
      ctx.translate(armX, coilY - 30);
      ctx.rotate(armAngle);
      ctx.strokeStyle = c.mark; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(60, 0); ctx.stroke();
      ctx.restore();
      const contactX = W * 0.78;
      ctx.fillStyle = on ? c.ok : c.rule;
      ctx.beginPath(); ctx.arc(contactX, coilY - 30 - Math.sin(armAngle) * 60, 5, 0, 6.284); ctx.fill();
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Boshqaruv toki: ' + v.I.toFixed(1) + ' A', coilX, H - 16);
      ctx.fillText(on ? "Rele ishga tushdi — quvvat zanjiri ulandi" : "Rele bo'sh (bo'sagadan past)", W / 2, 20);
    },
    read(s, v) {
      const threshold = 1.2;
      return [
        { label: 'Rele holati', val: v.I >= threshold ? "Ulangan" : "Uzilgan" },
        { label: "Ishga tushish bo'sagasi", val: threshold + ' A' }
      ];
    }
  },

  // TERMODINAMIKA — Kristall va amorf jismlar (G9 3.18), Ho'llash/Kapillyar hodisalar (G9 3.16)
  {
    id: 'crystal_amorphous', title: 'Kristall va amorf jismlar',
    desc: "Qizdirilganda kristall jism aniq haroratda eriydi, amorf jism esa asta-sekin yumshaydi",
    controls: [
      { k: 't', label: 'Qizdirish vaqti', min: 0, max: 100, step: 1, val: 40, unit: '%' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const x0 = 40, x1 = W - 20, y0 = H - 30, y1 = 24;
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
      const T = v.t / 100;
      const meltStart = 0.35, meltEnd = 0.55;
      const crystalT = (tt: number) => {
        if (tt < meltStart) return tt / meltStart * 0.4;
        if (tt < meltEnd) return 0.4;
        return 0.4 + (tt - meltEnd) / (1 - meltEnd) * 0.5;
      };
      const amorphT = (tt: number) => 0.05 + tt * 0.85;
      const plot = (fn: (tt: number) => number, color: string) => {
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const tt = (i / 60) * T;
          const px = x0 + (x1 - x0) * (i / 60) * T;
          const py = y0 - (y0 - y1) * fn(tt);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      plot(crystalT, c.ok);
      plot(amorphT, c.mark);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('— Kristall (aniq erish nuqtasi)', x0, y1 - 6);
      ctx.fillStyle = c.mark; ctx.fillText('— Amorf (asta yumshaydi)', x0 + 190, y1 - 6);
    },
    read(s, v) {
      const T = v.t / 100;
      const melting = T > 0.35 && T < 0.55;
      return [
        { label: 'Kristall jism holati', val: melting ? "Erish jarayonida (harorat o'zgarmaydi)" : "Qizimoqda" },
        { label: 'Amorf jism holati', val: "Uzluksiz yumshamoqda" }
      ];
    }
  },

  {
    id: 'wetting_capillary', title: "Ho'llash va kapillyar hodisalar",
    desc: "Ingichka naycha ichida suyuqlik sirt taranglik tufayli ko'tariladi yoki pasayadi",
    controls: [
      { k: 'r', label: 'Naycha radiusi', min: 0.1, max: 2, step: 0.05, val: 0.5, unit: 'mm' },
      { k: 'wet', label: "Ho'llash (0=ho'llamaydi, 1=to'liq ho'llaydi)", min: 0, max: 1, step: 0.1, val: 1 }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const sigma = 0.07, rho = 1000, g = 9.8;
      const cosTheta = 2 * v.wet - 1;
      const rMeters = v.r / 1000;
      const h = (2 * sigma * cosTheta) / (rho * g * rMeters);
      const hCm = h * 100;
      const baseY = H - 40, tubeTop = 24, tubeX = W / 2, tubeW = 14 + v.r * 10;
      ctx.fillStyle = 'rgba(76,141,246,.18)'; ctx.fillRect(20, baseY, W - 40, 20);
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 2;
      ctx.strokeRect(20, baseY, W - 40, 20);
      ctx.strokeRect(tubeX - tubeW / 2, tubeTop, tubeW, baseY - tubeTop + 10);
      const level = Math.max(-60, Math.min(60, hCm * 6));
      ctx.fillStyle = 'rgba(76,141,246,.55)';
      if (level >= 0) ctx.fillRect(tubeX - tubeW / 2 + 2, baseY - level, tubeW - 4, level + 8);
      else ctx.fillRect(tubeX - tubeW / 2 + 2, baseY, tubeW - 4, 8);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((hCm >= 0 ? "Ko'tarilish" : 'Pasayish') + ': ' + Math.abs(hCm).toFixed(2) + ' sm', tubeX, tubeTop - 8);
    },
    read(s, v) {
      const sigma = 0.07, rho = 1000, g = 9.8;
      const cosTheta = 2 * v.wet - 1;
      const h = (2 * sigma * cosTheta) / (rho * g * (v.r / 1000));
      return [
        { label: "Suyuqlik ko'tarilishi h", val: (h * 100).toFixed(2) + ' sm' },
        { label: 'h = 2σcosθ / (ρgr)', val: "Kapillyar formula" }
      ];
    }
  },

  // OPTIKA — Geliotexnika (G9 4.28)
  {
    id: 'heliotechnology', title: 'Geliotexnika (quyosh energiyasi)',
    desc: "Quyosh panelining yuzi va yorug'lik intensivligi chiqarilgan quvvatga qanday ta'sir qilishi",
    controls: [
      { k: 'A', label: 'Panel yuzi', min: 0.5, max: 5, step: 0.25, val: 2, unit: 'm²' },
      { k: 'I', label: "Quyosh nurlanishi", min: 200, max: 1000, step: 50, val: 800, unit: 'W/m²' },
      { k: 'eff', label: 'Panel FIK', min: 5, max: 25, step: 1, val: 18, unit: '%' }
    ],
    init() { return {}; },
    step() {},
    draw(ctx, W, H, s, v) {
      const c = COL();
      const P = v.A * v.I * (v.eff / 100);
      const cx = W / 2, sunY = 36;
      ctx.fillStyle = '#F5A623';
      ctx.beginPath(); ctx.arc(cx, sunY, 16, 0, 6.284); ctx.fill();
      const panelW = 40 + v.A * 30, panelY = H - 70, panelX = cx - panelW / 2;
      for (let i = 0; i < 5; i++) {
        const rx = panelX + panelW * (i + 0.5) / 5;
        ctx.strokeStyle = 'rgba(245,166,35,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, sunY + 16); ctx.lineTo(rx, panelY); ctx.stroke();
      }
      ctx.fillStyle = c.ink; ctx.fillRect(panelX, panelY, panelW, 18);
      ctx.strokeStyle = c.ok; ctx.lineWidth = 2; ctx.strokeRect(panelX, panelY, panelW, 18);
      ctx.fillStyle = c.ink3; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Panel: ' + v.A.toFixed(1) + ' m²', cx, panelY + 34);
      ctx.fillStyle = c.ink; ctx.font = '600 13px sans-serif';
      ctx.fillText('Quvvat: ' + P.toFixed(0) + ' W', cx, H - 12);
    },
    read(s, v) {
      const P = v.A * v.I * (v.eff / 100);
      return [
        { label: 'Chiqarilgan quvvat P', val: P.toFixed(0) + ' W' },
        { label: 'P = A · I · FIK', val: `${v.A}·${v.I}·${v.eff}%` }
      ];
    }
  },

];

// ── Kategoriyalar (Darslar bo'limi kategoriyalari bilan mos, 4 ta) ──
export interface SimCategory {
  label: string
  color: string
}

export const CATS: Record<string, SimCategory> = {
  all: { label: 'Hammasi', color: '#12212E' },
  mex: { label: 'Mexanika', color: '#1B6E5F' },
  molterm: { label: 'Termodinamika', color: '#B3372B' },
  elkt: { label: 'Elektr', color: '#0052CC' },
  opt: { label: 'Optika', color: '#FF6B35' },
}

// Har bir simulyatsiyaning kategoriyasi — Darslar bo'limining kategoriyalari
// (mexanika/termodinamika/elektr/optika) bilan bir xil, o'quv dasturiga mos.
export const SIM_CATS: Record<string, string> = {
  // MEXANIKA (34)
  uniform: 'mex', velocity_graph: 'mex', distance_graph: 'mex', acceleration: 'mex',
  freefall: 'mex', vertical: 'mex', projectile: 'mex', density_mass_volume: 'mex',
  circular: 'mex', centripetal: 'mex', gravity_comp: 'mex', pressure: 'mex',
  elastic_deformation: 'mex', rope_tension: 'mex', newton2: 'mex', friction: 'mex',
  inclined: 'mex', impulse: 'mex', elastic_collision: 'mex', atwood: 'mex',
  buoyancy: 'mex', potential: 'mex', work_power: 'mex', kinetic: 'mex',
  energy_cons: 'mex', leverage: 'mex', center_mass: 'mex', relative_motion: 'mex',
  vector_addition: 'mex', bernoulli: 'mex', continuity: 'mex',
  newton_first_third: 'mex', pascal_law: 'mex', atmospheric_pressure: 'mex',

  // TERMODINAMIKA (17)
  gas: 'molterm', ideal_gas_combined: 'molterm', temperature: 'molterm', boyle_law: 'molterm',
  charles_law: 'molterm', heat_transfer: 'molterm', heat_capacity: 'molterm', thermal_expansion: 'molterm',
  phase_change: 'molterm', carnot_cycle: 'molterm',
  calorimetry: 'molterm', adiabatic_process: 'molterm', surface_tension: 'molterm',
  internal_combustion: 'molterm', combustion_heat: 'molterm',
  crystal_amorphous: 'molterm', wetting_capillary: 'molterm',

  // ELEKTR (20)
  coulomb_force: 'elkt', electric_field: 'elkt', circuit_diagram: 'elkt', ohm: 'elkt',
  wire_resistance: 'elkt', joule_heating: 'elkt', capacitor: 'elkt', solenoid: 'elkt',
  magnetism_types: 'elkt', em_field_comparison: 'elkt', parallel_wires: 'elkt', faraday: 'elkt',
  lenz: 'elkt', transformer: 'elkt',
  series_parallel_resistors: 'elkt', capacitors_series_parallel: 'elkt', electrolysis: 'elkt',
  motor_generator: 'elkt', electrification: 'elkt', electromagnetic_relay: 'elkt',

  // OPTIKA (11)
  refraction: 'opt', snell_law_demo: 'opt', camera_obscura: 'opt', total_internal_reflection: 'opt',
  mirror: 'opt', convex_mirror: 'opt', lens: 'opt', concave_lens: 'opt',
  prism: 'opt', light_intensity: 'opt', heliotechnology: 'opt',
}

export function simList() {
  return SIMS.map((s) => ({ id: s.id, title: s.title }))
}
