// The Y.A.I.R.O.S logo — an arc-reactor galaxy drawn on a canvas.
// Round with a transparent outside, so it drops straight into circular
// avatar slots (Gmail, WhatsApp, socials). Downloadable from Settings.

import { AGENTS } from "../agents/registry";

const TAU = Math.PI * 2;

export function drawLogo(size = 1024): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const cx = size / 2;
  const R = size / 2;
  const core = { x: cx, y: size * 0.4 };

  g.save();
  g.beginPath();
  g.arc(cx, cx, R, 0, TAU);
  g.clip();

  // Deep-space disc
  const bg = g.createRadialGradient(cx, size * 0.35, R * 0.1, cx, cx, R);
  bg.addColorStop(0, "#0d1b36");
  bg.addColorStop(0.7, "#060b18");
  bg.addColorStop(1, "#03060d");
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);

  // Star field
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * TAU;
    const d = Math.sqrt(Math.random()) * R * 0.96;
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, (Math.random() * 1.4 + 0.4) * (size / 512), 0, TAU);
    g.fillStyle = `rgba(190, 225, 255, ${0.12 + Math.random() * 0.35})`;
    g.fill();
  }

  // Outer glow ring
  g.strokeStyle = "rgba(55, 214, 255, 0.9)";
  g.lineWidth = size * 0.008;
  g.shadowColor = "rgba(55, 214, 255, 0.9)";
  g.shadowBlur = size * 0.03;
  g.beginPath();
  g.arc(core.x, core.y, size * 0.27, 0, TAU);
  g.stroke();

  // Segmented reactor ring
  g.lineWidth = size * 0.03;
  g.strokeStyle = "rgba(31, 111, 184, 0.95)";
  g.shadowBlur = size * 0.02;
  const SEGS = 12;
  for (let i = 0; i < SEGS; i++) {
    const start = (i / SEGS) * TAU;
    g.beginPath();
    g.arc(core.x, core.y, size * 0.215, start + 0.06, start + TAU / SEGS - 0.06);
    g.stroke();
  }

  // Inner thin ring
  g.lineWidth = size * 0.005;
  g.strokeStyle = "rgba(140, 231, 255, 0.8)";
  g.shadowBlur = size * 0.015;
  g.beginPath();
  g.arc(core.x, core.y, size * 0.15, 0, TAU);
  g.stroke();

  // Glowing core
  const coreGrad = g.createRadialGradient(core.x, core.y, 0, core.x, core.y, size * 0.13);
  coreGrad.addColorStop(0, "#ffffff");
  coreGrad.addColorStop(0.35, "#aef0ff");
  coreGrad.addColorStop(0.75, "rgba(55, 214, 255, 0.55)");
  coreGrad.addColorStop(1, "rgba(55, 214, 255, 0)");
  g.shadowBlur = 0;
  g.fillStyle = coreGrad;
  g.beginPath();
  g.arc(core.x, core.y, size * 0.13, 0, TAU);
  g.fill();

  // The seven department stars orbiting the reactor
  AGENTS.forEach((agent, i) => {
    const a = -Math.PI / 2 + (i / AGENTS.length) * TAU;
    const x = core.x + Math.cos(a) * size * 0.27;
    const y = core.y + Math.sin(a) * size * 0.27;
    g.beginPath();
    g.arc(x, y, size * 0.014, 0, TAU);
    g.fillStyle = agent.color;
    g.shadowColor = agent.color;
    g.shadowBlur = size * 0.02;
    g.fill();
  });

  // Wordmark
  g.shadowColor = "rgba(55, 214, 255, 0.8)";
  g.shadowBlur = size * 0.025;
  g.fillStyle = "#c9f2ff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold ${size * 0.072}px 'Courier New', monospace`;
  try {
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${size * 0.014}px`;
  } catch {
    /* older browsers — draw without extra spacing */
  }
  g.fillText("Y.A.I.R.O.S", cx + size * 0.007, size * 0.78);

  g.restore();
  return c;
}

export function logoDataUrl(size = 512): string {
  return drawLogo(size).toDataURL("image/png");
}

export function downloadLogo(size = 1024): void {
  const a = document.createElement("a");
  a.href = drawLogo(size).toDataURL("image/png");
  a.download = "yairos-logo.png";
  a.click();
}
