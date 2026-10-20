import type { Visual } from '../core/types';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** SVG markup is produced by our own generators, never from user input. */
export function renderVisual(visual: Visual, className = ''): string {
  return visual.type === 'svg'
    ? `<div class="visual visual--svg ${className}" style="${svgScaleStyle(visual.svg)}">${visual.svg}</div>`
    : `<div class="visual visual--text ${className}">${escapeHtml(visual.text)}</div>`;
}

/**
 * Exposes the viewBox size as CSS variables so every figure is drawn at the same
 * pixels-per-unit. Size is a scored attribute, so the question and options must match in scale.
 */
export function svgScaleStyle(svg: string): string {
  const match = svg.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
  return match ? `--vw:${match[1]};--vh:${match[2]}` : '';
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function ordinal(n: number): string {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rounded % 10] ?? 'th'}`;
}

export function difficultyLabel(b: number): string {
  if (b < -1.5) return 'Very easy';
  if (b < -0.5) return 'Easy';
  if (b < 0.5) return 'Moderate';
  if (b < 1.5) return 'Hard';
  return 'Very hard';
}
