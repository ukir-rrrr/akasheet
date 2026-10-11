import { router, type Href } from 'expo-router';

/** Back when there is history (the usual case), otherwise replace with `fallback` (deep link / web reload). */
export function goBackOr(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
