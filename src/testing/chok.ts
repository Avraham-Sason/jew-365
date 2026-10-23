import { CHOK_PARASHIYOT } from '@/data/chok';
import { IDLE_DOWNLOAD, useChokStore } from '@/stores/useChokStore';
import { ChokInstall } from '@/types/chok';

export function installChokFixture(parashiyot: readonly string[] = CHOK_PARASHIYOT, version = 1): ChokInstall {
  const installed: ChokInstall = {
    version,
    bytes: 18_600_000,
    installedAt: 0,
    files: Object.fromEntries(parashiyot.map((parasha, index) => [parasha, `fixture-${index}.json`])),
  };
  useChokStore.setState({ installed, latestVersion: version, checkedAt: Date.now(), download: IDLE_DOWNLOAD });
  return installed;
}
