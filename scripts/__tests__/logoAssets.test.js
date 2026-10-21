const fs = require('fs');
const path = require('path');
const appConfig = require('../../app.json');

const ROOT = path.join(__dirname, '..', '..');
const COLOR_TYPE_RGB = 2;
const COLOR_TYPE_RGBA = 6;

const resolveAsset = (relative) => path.join(ROOT, relative);

function readHeader(relative) {
  const buf = fs.readFileSync(resolveAsset(relative));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), depth: buf[24], colorType: buf[25] };
}

const splashPlugin = () =>
  appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');

describe('logo PNG assets', () => {
  it('icon.png is an opaque 1024 square (RGB, no alpha channel)', () => {
    expect(readHeader('assets/icon.png')).toMatchObject({
      width: 1024,
      height: 1024,
      depth: 8,
      colorType: COLOR_TYPE_RGB,
    });
  });

  it.each(['adaptive-icon', 'adaptive-monochrome', 'splash', 'splash-dark'])(
    '%s.png is a transparent 1024 square (RGBA)',
    (name) => {
      expect(readHeader(`assets/${name}.png`)).toMatchObject({
        width: 1024,
        height: 1024,
        depth: 8,
        colorType: COLOR_TYPE_RGBA,
      });
    },
  );

  it('notification-icon.png is a transparent 96 square', () => {
    expect(readHeader('assets/notification-icon.png')).toMatchObject({
      width: 96,
      height: 96,
      colorType: COLOR_TYPE_RGBA,
    });
  });

  it('favicon.png is a 48 square', () => {
    expect(readHeader('assets/favicon.png')).toMatchObject({ width: 48, height: 48 });
  });
});

describe('app.json logo wiring', () => {
  it('has no top-level splash key: the expo-splash-screen plugin owns the splash', () => {
    expect(appConfig.expo).not.toHaveProperty('splash');
    expect(splashPlugin()).toBeDefined();
  });

  it('sets the splash image at 200 points wide, on cream, with a dark twin on night navy', () => {
    const [, options] = splashPlugin();
    expect(options).toMatchObject({
      image: './assets/splash.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: '#F6F1E8',
      dark: { image: './assets/splash-dark.png', backgroundColor: '#0E1626' },
    });
    expect(fs.existsSync(resolveAsset(options.image))).toBe(true);
    expect(fs.existsSync(resolveAsset(options.dark.image))).toBe(true);
  });

  it('puts the splash plugin after expo-font', () => {
    const names = appConfig.expo.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
    expect(names.indexOf('expo-splash-screen')).toBe(names.indexOf('expo-font') + 1);
  });

  it('gives the adaptive icon its foreground, a monochrome layer and the cream background', () => {
    const { adaptiveIcon } = appConfig.expo.android;
    expect(adaptiveIcon).toMatchObject({
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-monochrome.png',
      backgroundColor: '#F6F1E8',
    });
    expect(fs.existsSync(resolveAsset(adaptiveIcon.foregroundImage))).toBe(true);
    expect(fs.existsSync(resolveAsset(adaptiveIcon.monochromeImage))).toBe(true);
  });

  it('colours the notification with the orange accent and points it at the white silhouette', () => {
    const notifications = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
    );
    expect(notifications[1]).toMatchObject({ icon: './assets/notification-icon.png', color: '#F08A3C' });
    expect(fs.existsSync(resolveAsset(notifications[1].icon))).toBe(true);
  });

  it('points the app and web icons at files that exist', () => {
    expect(fs.existsSync(resolveAsset(appConfig.expo.icon))).toBe(true);
    expect(fs.existsSync(resolveAsset(appConfig.expo.web.favicon))).toBe(true);
  });
});
