import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.join(__dirname, '..');

function listRoutes(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...listRoutes(full, prefix + entry.name + '/'));
    } else if (entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') {
      out.push(prefix + entry.name.replace(/\.tsx$/, ''));
    }
  }
  return out;
}

describe('expo-router routes', () => {
  const routes = listRoutes(APP_DIR);

  it('discovers known top-level routes', () => {
    expect(routes).toContain('index');
    expect(routes).toContain('mitzvah/[id]');
    expect(routes).toContain('day/[date]');
    expect(routes).toContain('siddur/[id]');
    expect(routes).toContain('siddur/index');
    expect(routes).toContain('checkin');
    expect(routes).toContain('hilulot');
    expect(routes).toContain('rosh-chodesh');
    expect(routes).toContain('report');
    expect(routes).toContain('mitzvot');
  });

  it('discovers taharah routes', () => {
    expect(routes).toContain('taharah/index');
    expect(routes).toContain('taharah/log');
    expect(routes).toContain('taharah/settings');
    expect(routes).toContain('taharah/calendar');
  });

  it('discovers tabs', () => {
    expect(routes).toContain('(tabs)/home');
    expect(routes).toContain('(tabs)/schedule');
    expect(routes).toContain('(tabs)/history');
    expect(routes).toContain('(tabs)/siddur');
    expect(routes).toContain('(tabs)/settings');
    expect(routes).toContain('(tabs)/index');
  });

  it('discovers onboarding flow', () => {
    expect(routes).toContain('onboarding/index');
    expect(routes).toContain('onboarding/nusach');
    expect(routes).toContain('onboarding/location');
    expect(routes).toContain('onboarding/ready');
  });

  it('BUG-012 regression — _layout.tsx does not reference non-existent flat "onboarding" route', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, '_layout.tsx'), 'utf8');
    const referencesFlatOnboarding = /Stack\.Screen\s+name="onboarding"\s*\/>/.test(layout);
    expect(referencesFlatOnboarding).toBe(false);
  });

  it('registers every root Stack.Screen under a name expo-router resolves, and the taharah group once', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, '_layout.tsx'), 'utf8');
    const names = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((match) => match[1]);
    const unresolved = names.filter((name) => {
      const isFile = fs.existsSync(path.join(APP_DIR, `${name}.tsx`));
      const isNestedLayout = fs.existsSync(path.join(APP_DIR, name, '_layout.tsx'));
      const parent = path.dirname(name);
      const insideNestedLayout = parent !== '.' && fs.existsSync(path.join(APP_DIR, parent, '_layout.tsx'));
      return !(isFile || isNestedLayout) || insideNestedLayout;
    });
    expect(unresolved).toEqual([]);
    expect(names.filter((name) => name === 'taharah')).toHaveLength(1);
  });

  it('BUG-014 regression — (tabs)/_layout.tsx hides index tab', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, '(tabs)/_layout.tsx'), 'utf8');
    const hidesIndex = /Tabs\.Screen[^>]*name="index"[^>]*href:\s*null/.test(layout);
    expect(hidesIndex).toBe(true);
  });
});
