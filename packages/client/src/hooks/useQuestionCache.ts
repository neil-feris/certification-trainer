import { useState, useEffect, useCallback } from 'react';
import { questionApi } from '../api/client';
import { useOnlineStatus } from './useOnlineStatus';
import {
  cacheQuestions,
  getCachedQuestionCount,
  getCachedQuestions,
  pruneCache,
} from '../services/offlineStorage';
import { showToast } from '../components/common';
import type { Question } from '@ace-prep/shared';

const MAX_CACHE_SIZE = 500;

interface UseQuestionCacheResult {
  cachedCount: number;
  isCaching: boolean;
  cacheQuestionsForTopics: (topicIds: number[]) => Promise<void>;
  getCachedQuestionsForTopic: (topicId: number) => Promise<Question[]>;
}

export function useQuestionCache(): UseQuestionCacheResult {
  const [cachedCount, setCachedCount] = useState(0);
  const [isCaching, setIsCaching] = useState(false);
  const { isOnline } = useOnlineStatus();

  // Load cached count on mount
  useEffect(() => {
    const loadCount = async () => {
      const count = await getCachedQuestionCount();
      setCachedCount(count);
    };
    loadCount();
  }, []);

  // Cache questions for specific topics
  const cacheQuestionsForTopics = useCallback(
    async (topicIds: number[]) => {
      if (!isOnline || topicIds.length === 0) return;

      setIsCaching(true);
      let totalCached = 0;

      try {
        // Fetch questions for each topic
        for (const topicId of topicIds) {
          const response = await questionApi.list({
            topicId,
            limit: 50, // Limit per topic to avoid overwhelming cache
          });

          if (response.items.length > 0) {
            await cacheQuestions(response.items);
            totalCached += response.items.length;
          }
        }

        // Prune if over limit
        await pruneCache(MAX_CACHE_SIZE);

        // Update count
        const newCount = await getCachedQuestionCount();
        setCachedCount(newCount);

        if (totalCached > 0) {
          showToast({
            message: `${totalCached} questions cached for offline use`,
            type: 'success',
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('Failed to cache questions:', error);
      } finally {
        setIsCaching(false);
      }
    },
    [isOnline]
  );

  // Get cached questions for a specific topic (for offline use)
  const getCachedQuestionsForTopic = useCallback(async (topicId: number): Promise<Question[]> => {
    return getCachedQuestions(topicId);
  }, []);

  return {
    cachedCount,
    isCaching,
    cacheQuestionsForTopics,
    getCachedQuestionsForTopic,
  };
}
