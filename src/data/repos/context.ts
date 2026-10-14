import type { Scheduler } from '@/domain/scheduler/types';
import type { Clock } from '@/shared/clock';

import type { SqlDriver } from '../db/driver';
import type { FieldProtector } from '../security/fieldProtector';

export type RepoContext = {
  db: SqlDriver;
  clock: Clock;
  newId: () => string;
  deviceId: string;
  timeZone: () => string;
  /** Single scheduler for initial states, answers and replay. */
  scheduler: Scheduler;
  fields: FieldProtector;
};
