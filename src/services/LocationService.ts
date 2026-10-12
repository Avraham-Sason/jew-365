import * as ExpoLocation from 'expo-location';
import { CITIES, City } from '@/data/cities';
import { Location } from '@/types/zmanim';

export type LocationStatus = 'ready' | 'denied' | 'timeout' | 'missing';
export type LocationSource = 'gps' | 'manual';

export type LocationResolution = {
  // null on every failure path. Returning CITIES[0] here made a denied/timed-out lookup
  // indistinguishable from "the user really is in Jerusalem", and callers wrote it straight into
  // the store — silently replacing a manually chosen city and flipping inIsrael with it.
  location: Location | null;
  status: LocationStatus;
  source: LocationSource;
};

const DEFAULT_TIMEOUT_MS = 10000;
const NEAREST_CITY_KM = 25;
const CURRENT_LOCATION_NAME = { he: 'מיקום נוכחי', en: 'Current location' };

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const q = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function nearestCity(lat: number, lng: number): City {
  return CITIES.reduce((best, city) => {
    const nextDistance = distanceKm(lat, lng, city.lat, city.lng);
    const bestDistance = distanceKm(lat, lng, best.lat, best.lng);
    return nextDistance < bestDistance ? city : best;
  }, CITIES[0]);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    // The old version left this pending for the full timeout even after the position resolved.
    if (timer) clearTimeout(timer);
  }
}

// Only lat/lng are real. Inheriting tz/inIsrael/elevation from the nearest of 20 hard-coded cities
// put a user in Chicago on New York time and, worse, flagged anyone nearest to Eilat as being in
// Israel — which is what hebcal uses to decide whether second-day Yom Tov exists at all.
function resolvedLocation(lat: number, lng: number): Location {
  const nearest = nearestCity(lat, lng);
  const closeEnough = distanceKm(lat, lng, nearest.lat, nearest.lng) <= NEAREST_CITY_KM;
  const deviceTz = deviceTimeZone();
  return {
    cityId: closeEnough ? nearest.cityId : undefined,
    name: closeEnough ? nearest.name : CURRENT_LOCATION_NAME.he,
    nameEn: closeEnough ? nearest.nameEn : CURRENT_LOCATION_NAME.en,
    lat,
    lng,
    tz: closeEnough ? nearest.tz : deviceTz,
    inIsrael: closeEnough ? nearest.inIsrael : isInIsrael(lat, lng),
    elevation: closeEnough ? nearest.elevation : undefined,
    candleLightingMinutes: closeEnough ? nearest.candleLightingMinutes : undefined,
  };
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || CITIES[0].tz;
  } catch {
    return CITIES[0].tz;
  }
}

function isInIsrael(lat: number, lng: number): boolean {
  return lat >= 29.4 && lat <= 33.4 && lng >= 34.2 && lng <= 35.9;
}

export const LocationService = {
  async getPermissionStatus(): Promise<LocationStatus> {
    const perm = await ExpoLocation.getForegroundPermissionsAsync();
    if (perm.granted) return 'ready';
    if (perm.canAskAgain === false) return 'denied';
    return 'missing';
  },

  async requestPermission(): Promise<LocationStatus> {
    const perm = await ExpoLocation.requestForegroundPermissionsAsync();
    if (perm.granted) return 'ready';
    return perm.canAskAgain === false ? 'denied' : 'missing';
  },

  // Always resolves, never rejects: the permission calls throw in practice (a concurrent request,
  // Play services unavailable) and an unhandled rejection here left onboarding stuck on "...".
  async getCurrentLocation(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<LocationResolution> {
    try {
      const currentStatus = await this.getPermissionStatus();
      if (currentStatus === 'missing') {
        const requested = await this.requestPermission();
        if (requested !== 'ready') {
          return { location: null, status: requested, source: 'manual' };
        }
      }
      if ((await this.getPermissionStatus()) !== 'ready') {
        return { location: null, status: 'denied', source: 'manual' };
      }

      const result = await withTimeout(
        ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }),
        timeoutMs,
      );
      return {
        location: resolvedLocation(result.coords.latitude, result.coords.longitude),
        status: 'ready',
        source: 'gps',
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.message === 'timeout';
      return { location: null, status: timedOut ? 'timeout' : 'missing', source: 'manual' };
    }
  },

  getFallbackCities(): Location[] {
    return CITIES;
  },
};
