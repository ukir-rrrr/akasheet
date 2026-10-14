import { DataProtectionError } from '@/shared/errors';

import type { CardRepo } from '../repos/cardRepo';
import type { FolderRepo } from '../repos/folderRepo';
import type { ReviewRepo } from '../repos/reviewRepo';

const DENY_MSG = 'この端末ではデータ保護キーを利用できないため、新しいカードや変更を保存できません。';

async function deny(): Promise<never> {
  throw new DataProtectionError(DENY_MSG);
}

export function guardFoldersWhenReadOnly(repo: FolderRepo, mutate: boolean): FolderRepo {
  if (mutate) return repo;
  return { ...repo, create: deny, ensurePath: deny, rename: deny, remove: deny };
}

export function guardCardsWhenReadOnly(repo: CardRepo, mutate: boolean): CardRepo {
  if (mutate) return repo;
  return { ...repo, create: deny, remove: deny, move: deny };
}

export function guardReviewsWhenReadOnly(repo: ReviewRepo, mutate: boolean): ReviewRepo {
  if (mutate) return repo;
  return { ...repo, answer: deny, undo: deny };
}
