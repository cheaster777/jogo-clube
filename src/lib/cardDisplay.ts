import { WATER_QUALITY_DATA } from '../constants';

export function getWaterQuality(score: number) {
  return WATER_QUALITY_DATA.find(q => score >= q.minScore && score <= q.maxScore) || WATER_QUALITY_DATA[WATER_QUALITY_DATA.length - 1];
}

// WCAG relative luminance + contrast ratio, used to pick whichever of
// black/white text actually reads better against a given background color
// (a fixed luminance threshold doesn't reliably predict real AA contrast).
function srgbChannelToLinear(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Determine if badge text should be dark, by picking whichever of black/white
// text yields the higher WCAG contrast ratio against the background.
export function shouldUseDarkText(hexColor: string): boolean {
  const bgLuminance = relativeLuminance(hexColor);
  const contrastWithBlack = contrastRatio(bgLuminance, relativeLuminance('#1C1917'));
  const contrastWithWhite = contrastRatio(bgLuminance, relativeLuminance('#FFFFFF'));
  return contrastWithBlack >= contrastWithWhite;
}
