import { router } from 'expo-router';

import { ALL_FOLDERS } from './constants';
import { createReviewLaunch, reviewLaunch, type ReviewLaunch } from './reviewLaunch';

function routeFolderId(folderId: string | null): string {
  return folderId ?? ALL_FOLDERS;
}

function beginReview(launch: Omit<ReviewLaunch, 'key'>) {
  reviewLaunch.set(createReviewLaunch(launch));
}

/** Opens the review modal with a full in-memory launch payload (preferred over URL params). */
export function pushReview(launch: Omit<ReviewLaunch, 'key'>) {
  beginReview(launch);
  router.push({
    pathname: '/review/[folderId]',
    params: { folderId: routeFolderId(launch.folderId) },
  });
}

/** Same as `pushReview`, but replaces the current route (e.g. summary → replay). */
export function replaceReview(launch: Omit<ReviewLaunch, 'key'>) {
  beginReview(launch);
  router.replace({
    pathname: '/review/[folderId]',
    params: { folderId: routeFolderId(launch.folderId) },
  });
}
