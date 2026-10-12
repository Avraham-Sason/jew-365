import { CITIES, cityOf, findCityById, findCityByName, getLocationName, refreshSavedLocation } from '../cities';
import { Location } from '@/types/zmanim';

describe('cities', () => {
  it('5.x has at least 20 cities', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(20);
  });

  it('5.x first city is Jerusalem (default fallback)', () => {
    expect(CITIES[0].name).toBe('ירושלים');
    expect(CITIES[0].lat).toBeCloseTo(31.7683, 3);
    expect(CITIES[0].lng).toBeCloseTo(35.2137, 3);
    expect(CITIES[0].inIsrael).toBe(true);
    expect(CITIES[0].tz).toBe('Asia/Jerusalem');
  });

  it('5.x every city has all required fields', () => {
    for (const c of CITIES) {
      expect(c.name).toBeTruthy();
      expect(typeof c.lat).toBe('number');
      expect(typeof c.lng).toBe('number');
      expect(c.tz).toMatch(/[A-Z]/);
      expect(typeof c.inIsrael).toBe('boolean');
    }
  });

  it('5.x lat/lng within plausible bounds', () => {
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lng).toBeGreaterThanOrEqual(-180);
      expect(c.lng).toBeLessThanOrEqual(180);
    }
  });

  it('5.x findCityByName works for Hebrew name', () => {
    expect(findCityByName('ירושלים')).toEqual(CITIES[0]);
    expect(findCityByName('xyz_unknown')).toBeUndefined();
  });

  it('15.7 BUG-006 — cities expose English fallback names', () => {
    for (const c of CITIES) {
      expect(c.name).toMatch(/[\u0590-\u05FF]/); // Hebrew range
      expect(c.nameEn).toBeTruthy();
      expect(getLocationName(c, 'en')).toBe(c.nameEn);
      expect(getLocationName(c, 'he')).toBe(c.name);
    }
  });

  it('all Israel cities use Asia/Jerusalem', () => {
    const israelCities = CITIES.filter((c) => c.inIsrael);
    for (const c of israelCities) {
      expect(c.tz).toBe('Asia/Jerusalem');
    }
  });

  it('non-Israel cities have non-Israel tz', () => {
    const diaspora = CITIES.filter((c) => !c.inIsrael);
    for (const c of diaspora) {
      expect(c.tz).not.toBe('Asia/Jerusalem');
    }
  });
});

describe('city ids', () => {
  it('every city has a lowercase ASCII slug id, and no two share one', () => {
    for (const c of CITIES) {
      expect(c.cityId).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
    expect(new Set(CITIES.map((c) => c.cityId)).size).toBe(CITIES.length);
  });

  it('pins every id, so renaming a city never moves the id a saved location holds', () => {
    expect(CITIES.map((c) => `${c.nameEn}=${c.cityId}`)).toEqual([
      'Jerusalem=jerusalem',
      'Tel Aviv=tel-aviv',
      'Haifa=haifa',
      "Be'er Sheva=beer-sheva",
      'Netanya=netanya',
      'Ashdod=ashdod',
      'Petah Tikva=petah-tikva',
      'Bnei Brak=bnei-brak',
      'Safed=safed',
      'Eilat=eilat',
      'New York=new-york',
      'Lakewood=lakewood',
      'Los Angeles=los-angeles',
      'Miami=miami',
      'London=london',
      'Paris=paris',
      'Antwerp=antwerp',
      'Melbourne=melbourne',
      'Toronto=toronto',
      'Moscow=moscow',
    ]);
  });

  it('findCityById returns the entry, and undefined for an unknown id', () => {
    expect(findCityById('jerusalem')).toBe(CITIES[0]);
    expect(findCityById('beer-sheva')).toBe(CITIES[3]);
    expect(findCityById('atlantis')).toBeUndefined();
    expect(findCityById('')).toBeUndefined();
  });
});

describe('cityOf and refreshSavedLocation', () => {
  const jerusalem = CITIES[0];
  const telAviv = CITIES[1];
  const staleJerusalem: Location = {
    name: 'ירושלים',
    nameEn: 'Jerusalem',
    lat: 31.5,
    lng: 35.0,
    tz: 'Asia/Jerusalem',
    inIsrael: true,
    elevation: 700,
    candleLightingMinutes: 30,
  };
  const johannesburg: Location = {
    name: 'מיקום נוכחי',
    nameEn: 'Current location',
    lat: -26.2041,
    lng: 28.0473,
    tz: 'Africa/Johannesburg',
    inIsrael: false,
  };

  it('cityOf finds a location by its id, else by its Hebrew name, else by its English name', () => {
    expect(cityOf({ ...staleJerusalem, cityId: 'jerusalem', name: 'renamed', nameEn: 'renamed' })).toBe(jerusalem);
    expect(cityOf(staleJerusalem)).toBe(jerusalem);
    expect(cityOf({ ...staleJerusalem, name: 'renamed' })).toBe(jerusalem);
    expect(cityOf(johannesburg)).toBeUndefined();
  });

  it('cityOf trusts an id over a matching name', () => {
    expect(cityOf({ ...staleJerusalem, cityId: 'tel-aviv' })).toBe(telAviv);
    expect(cityOf({ ...staleJerusalem, cityId: 'atlantis' })).toBeUndefined();
  });

  it('a manual pick refreshes to the current entry, from an id or from an old snapshot without one', () => {
    expect(refreshSavedLocation(staleJerusalem, 'manual')).toBe(jerusalem);
    expect(refreshSavedLocation({ ...staleJerusalem, cityId: 'jerusalem' }, 'manual')).toBe(jerusalem);
    expect(
      refreshSavedLocation({ ...staleJerusalem, cityId: 'jerusalem' }, 'manual').candleLightingMinutes,
    ).toBeUndefined();
  });

  it('a GPS fix near a city keeps its coordinates and takes everything else from the entry', () => {
    const fix: Location = {
      ...staleJerusalem,
      name: 'תל אביב',
      nameEn: 'Tel Aviv',
      lat: 32.1,
      lng: 34.8,
      tz: 'Asia/Tel_Aviv',
    };
    expect(refreshSavedLocation(fix, 'gps')).toEqual({ ...telAviv, lat: 32.1, lng: 34.8 });
    expect(refreshSavedLocation({ ...fix, cityId: 'tel-aviv' }, 'gps')).toEqual({ ...telAviv, lat: 32.1, lng: 34.8 });
  });

  it('a GPS fix drops a stale elevation and candle-lighting override the city no longer has', () => {
    const refreshed = refreshSavedLocation({ ...staleJerusalem, cityId: 'jerusalem' }, 'gps');
    expect(refreshed.elevation).toBe(jerusalem.elevation);
    expect(refreshed.candleLightingMinutes).toBeUndefined();
    expect(refreshed.lat).toBe(31.5);
    expect(refreshed.lng).toBe(35.0);
  });

  it('a location that matches no city comes back untouched', () => {
    expect(refreshSavedLocation(johannesburg, 'gps')).toBe(johannesburg);
    expect(refreshSavedLocation(johannesburg, 'manual')).toBe(johannesburg);
    const removed = { ...johannesburg, cityId: 'atlantis' };
    expect(refreshSavedLocation(removed, 'gps')).toBe(removed);
  });
});
