/**
 * Strongly-typed event map.
 *
 * Every event the system can emit is declared here with its payload type.
 * This is the "contract" between the Network Sniffer (producer) and
 * Feature Plugins (consumers).
 */

import type {
  LessonData,
  QuizQuestionsData,
  QuizResultData,
} from '@shared/types/api.types';

export interface EventMap {
  'network:lessonDataLoaded': LessonData;
  'network:quizQuestionsLoaded': QuizQuestionsData;
  'network:quizResultLoaded': QuizResultData;
}
