const { generate, contrast } = require('../../assets/js/palette.js');

const HUE_SETS = [
  [], [0], [30], [60], [90], [120], [150], [180], [210], [240], [270], [300], [330],
  [45, 225], [15, 195], [135, 315], [75, 255], [345, 165]
];

describe('generated palettes meet WCAG AA', () => {
  for (const mode of ['dark', 'light', 'sepia', 'night', 'vivid']) {
    for (const hues of HUE_SETS) {
      it(`${mode} / hues ${JSON.stringify(hues)}`, () => {
        const { raw } = generate(mode, hues);
        const min = (rgb, bgs) => Math.min(...bgs.map((bg) => contrast(rgb, bg)));

        for (const [name, rgb] of Object.entries(raw.text)) {
          expect(min(rgb, raw.textBackgrounds), `text.${name}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const [name, rgb] of Object.entries(raw.accent)) {
          expect(min(rgb, raw.textBackgrounds), `accent.${name}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const [name, rgb] of Object.entries(raw.status)) {
          expect(min(rgb, raw.textBackgrounds), `status.${name}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast([255, 255, 255], raw.fill), 'on-accent / fill').toBeGreaterThanOrEqual(4.5);
        expect(contrast([255, 255, 255], raw.fillHover), 'on-accent / hover').toBeGreaterThanOrEqual(4.5);
        expect(min(raw.inputBorder, raw.surfaces), 'input border').toBeGreaterThanOrEqual(3);
        expect(min(raw.textInverse, [raw.accent.purple, raw.accent.blue]), 'text-inverse on accents').toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
