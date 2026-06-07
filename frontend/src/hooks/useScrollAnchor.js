import { useRef, useLayoutEffect } from 'react';

/**
 * Keeps the focused element stationary when popup content (challenge cards,
 * suggestion panels) is inserted into the DOM and causes a layout shift.
 *
 * How it works:
 *   1. During render (old DOM intact): if popupCount increased, capture
 *      document.activeElement's viewport-top position.
 *   2. In useLayoutEffect (after DOM commit, before paint): measure the
 *      delta and call window.scrollBy(0, delta) to compensate.
 *
 * @param {number} popupCount — increases by 1+ when a new popup appears.
 *   Pass 0/1 for a single toggle (e.g. challenge ? 1 : 0).
 *   Pass Object.keys(map).length for multi-card maps.
 */
export function useScrollAnchor(popupCount) {
  const prevRef   = useRef(popupCount);
  const anchorRef = useRef(null);

  if (popupCount > prevRef.current) {
    const el = document.activeElement;
    if (el && el !== document.body) {
      anchorRef.current = { el, top: el.getBoundingClientRect().top };
    }
  }
  prevRef.current = popupCount;

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const { el, top: savedTop } = anchorRef.current;
    anchorRef.current = null;
    const delta = el.getBoundingClientRect().top - savedTop;
    if (Math.abs(delta) > 0) window.scrollBy(0, delta);
  }, [popupCount]);
}
