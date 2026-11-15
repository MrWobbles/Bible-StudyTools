export const WHITE: RgbColor = [255, 255, 255];
export const BLACK: RgbColor = [0, 0, 0];

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function toHex(rgb: RgbColor): string {
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

export function luminance(rgb: RgbColor): number {
  const lin = rgb.map((v) => {
    const c = Math.round(v) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a: RgbColor, b: RgbColor): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function blend(fg: RgbColor, alpha: number, bg: RgbColor): RgbColor {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha)
  ];
}

export function minContrast(rgb: RgbColor, backgrounds: readonly RgbColor[]): number {
  return Math.min(...backgrounds.map((bg) => contrast(rgb, bg)));
}

// Moves lightness in `direction` until the colour reaches `min` contrast on every background.
export function fit(
  h: number,
  s: number,
  l: number,
  backgrounds: readonly RgbColor[],
  min: number,
  direction: 1 | -1
): RgbColor {
  let current = l;
  for (let i = 0; i < 110; i += 1) {
    const rgb = hslToRgb(h, s, current);
    if (minContrast(rgb, backgrounds) >= min) return rgb;
    current += direction * 0.01;
    if (current < 0 || current > 1) break;
  }
  return hslToRgb(h, s, direction > 0 ? 1 : 0);
}

export function hsla(h: number, s: number, l: number, a: number): string {
  const rgb = hslToRgb(h, s, l).map(Math.round);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

export function rgba(rgb: RgbColor, a: number): string {
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${a})`;
}
