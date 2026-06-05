import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';

/**
 * Debounced per-bullet challenge hook.
 * Fires /api/generate/bullet-challenges 1.8 s after bullets stop changing.
 * Returns a map of bullet_index → challenge, a loading-index set, a dismiss fn,
 * and a markApproved fn that prevents the hook from re-challenging AI-accepted text.
 *
 * Key invariants:
 * - loadingIndices only contains bullets whose text changed since the last
 *   successful API response (not all bullets on every state change).
 * - challengeMap is merged, not replaced, so challenges on unchanged bullets
 *   remain visible while a new bullet is being checked.
 * - Changing jobTitle / language / projectId resets the check-cache so all
 *   bullets are re-evaluated against the new context.
 */
export function useBulletChallenges({ projectId, jobTitle, bullets, language, debounceMs = 1800 }) {
  const [challengeMap, setChallengeMap] = useState({});
  const [loadingIndices, setLoadingIndices] = useState(new Set());
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  // { index: approvedText } — AI-accepted bullets; cleared when user manually edits
  const approvedRef = useRef({});
  // { index: text } — bullet text at the time of the last successful API call
  const lastCheckedRef = useRef({});
  // Track job-title / language / project so a change in any of them resets lastCheckedRef
  const lastContextRef = useRef({ jobTitle: null, language: null, projectId: null });

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
    // If job context changed, all bullets must be re-evaluated
    if (
      lastContextRef.current.jobTitle !== jobTitle ||
      lastContextRef.current.language !== language ||
      lastContextRef.current.projectId !== projectId
    ) {
      lastCheckedRef.current = {};
      lastContextRef.current = { jobTitle, language, projectId };
    }

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

    // Only queue a re-check for bullets that changed since the last API call
    // AND are not AI-approved. Unchanged bullets keep their current challenge.
    const changedIndices = new Set(
      bullets.reduce((acc, b, i) => {
        if (b.trim() && !(i in approvedRef.current) && b !== lastCheckedRef.current[i]) {
          acc.push(i);
        }
        return acc;
      }, [])
    );

    // Nothing actually changed — no need to hit the API
    if (changedIndices.size === 0) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Only show spinners on the bullets that triggered this call
      setLoadingIndices(new Set(changedIndices));

      try {
        const { data } = await api.post(
          '/generate/bullet-challenges',
          { project_id: projectId, job_title: jobTitle.trim(), bullets, language },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        // Record checked text for all non-approved filled bullets
        for (let i = 0; i < bullets.length; i++) {
          if (bullets[i]?.trim() && !(i in approvedRef.current)) {
            lastCheckedRef.current[i] = bullets[i];
          }
        }

        const newChallenges = {};
        for (const c of (data.challenges || [])) {
          if (typeof c.bullet_index === 'number' && !(c.bullet_index in approvedRef.current)) {
            newChallenges[c.bullet_index] = c;
          }
        }

        // Merge: only touch the indices that were re-checked this round.
        // Challenges on unchanged bullets stay intact.
        setChallengeMap((prev) => {
          const next = { ...prev };
          for (const idx of changedIndices) {
            if (idx in newChallenges) {
              next[idx] = newChallenges[idx];
            } else {
              // Was re-checked and came back clean — clear any stale challenge
              delete next[idx];
            }
          }
          return next;
        });
      } catch {
        if (!controller.signal.aborted) {
          // On error, clear only the indices we attempted to check
          setChallengeMap((prev) => {
            const next = { ...prev };
            for (const idx of changedIndices) delete next[idx];
            return next;
          });
        }
      } finally {
        if (!controller.signal.aborted) setLoadingIndices(new Set());
      }
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulletsKey, jobTitle, language, projectId, debounceMs]);

  return { challengeMap, loadingIndices, dismiss, markApproved };
}
