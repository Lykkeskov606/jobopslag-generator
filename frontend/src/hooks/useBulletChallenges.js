import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';

/**
 * Debounced per-bullet challenge hook.
 * Fires /api/generate/bullet-challenges 1.8 s after bullets stop changing.
 * Returns a map of bullet_index → challenge, a loading-index set, and a dismiss fn.
 */
export function useBulletChallenges({ projectId, jobTitle, bullets, language, debounceMs = 1800 }) {
  const [challengeMap, setChallengeMap] = useState({});
  const [loadingIndices, setLoadingIndices] = useState(new Set());
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const dismiss = useCallback((index) => {
    setChallengeMap((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  // Stringify for stable comparison — arrays always have new references
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bulletsKey = JSON.stringify(bullets);

  useEffect(() => {
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

      const loadingSet = new Set(
        bullets.reduce((acc, b, i) => { if (b.trim()) acc.push(i); return acc; }, [])
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
          if (typeof c.bullet_index === 'number') byIndex[c.bullet_index] = c;
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

  return { challengeMap, loadingIndices, dismiss };
}
