import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';

/**
 * Debounced per-bullet challenge hook.
 * Fires /api/generate/bullet-challenges 1.8 s after bullets stop changing.
 * Returns a map of bullet_index → challenge, a loading-index set, a dismiss fn,
 * and a markApproved fn that prevents the hook from re-challenging AI-accepted text.
 */
export function useBulletChallenges({ projectId, jobTitle, bullets, language, debounceMs = 1800 }) {
  const [challengeMap, setChallengeMap] = useState({});
  const [loadingIndices, setLoadingIndices] = useState(new Set());
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  // { index: approvedText } — AI-accepted bullets; cleared when user manually edits
  const approvedRef = useRef({});

  const dismiss = useCallback((index) => {
    setChallengeMap((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  // Call this right before replacing a bullet with a suggestion so the hook
  // knows not to re-challenge that index until the user changes it again.
  const markApproved = useCallback((index, text) => {
    approvedRef.current[index] = text;
  }, []);

  // Stringify for stable comparison — arrays always have new references
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bulletsKey = JSON.stringify(bullets);

  useEffect(() => {
    // Clear approval for any bullet whose text has been manually changed
    for (const idx of Object.keys(approvedRef.current)) {
      const i = Number(idx);
      if (bullets[i] !== approvedRef.current[i]) {
        delete approvedRef.current[i];
      }
    }

    const filled = bullets.filter((b) => b.trim());
    if (!filled.length || !jobTitle?.trim() || !projectId) {
      clearTimeout(timerRef.current);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Only show loading spinner for non-approved filled bullets
      const loadingSet = new Set(
        bullets.reduce((acc, b, i) => {
          if (b.trim() && !(i in approvedRef.current)) acc.push(i);
          return acc;
        }, [])
      );
      setLoadingIndices(loadingSet);

      try {
        const { data } = await api.post(
          '/generate/bullet-challenges',
          { project_id: projectId, job_title: jobTitle.trim(), bullets, language },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;
        const byIndex = {};
        for (const c of (data.challenges || [])) {
          // Never challenge an AI-approved bullet — prevents the infinite loop
          if (typeof c.bullet_index === 'number' && !(c.bullet_index in approvedRef.current)) {
            byIndex[c.bullet_index] = c;
          }
        }
        setChallengeMap(byIndex);
      } catch {
        if (!controller.signal.aborted) setChallengeMap({});
      } finally {
        if (!controller.signal.aborted) setLoadingIndices(new Set());
      }
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulletsKey, jobTitle, language, projectId, debounceMs]);

  return { challengeMap, loadingIndices, dismiss, markApproved };
}
