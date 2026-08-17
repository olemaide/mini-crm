import * as React from "react";

/**
 * Local rewrite of shadcn's `use-mobile` hook.
 *
 * The upstream version calls `setState` synchronously inside an effect, which
 * triggers a cascading render on every mount and is flagged by the React
 * Compiler lint rules. `useSyncExternalStore` is the purpose-built API for
 * subscribing to an external source like `matchMedia`, and it also gives a
 * defined server snapshot instead of an `undefined` first render.
 *
 * Re-running `shadcn add sidebar --overwrite` restores the upstream version;
 * reapply this if that happens.
 */

const MOBILE_BREAKPOINT = 768;
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MEDIA_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(MEDIA_QUERY).matches;
}

/** Desktop-first on the server; corrected on hydration. */
function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
