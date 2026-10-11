import type { Clock } from '@/shared/clock';

import type { SqlDriver } from '../db/driver';

export type RepoContext = {
  db: SqlDriver;
  clock: Clock;
  newId: () => string;
  deviceId: string;
  timeZone: () => string;
};
