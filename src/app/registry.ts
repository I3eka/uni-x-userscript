/**
 * Plugin Registry — Dependency Injection container.
 *
 * This is the ONLY place where all features are imported together.
 * Adding or removing a plugin is a one-line change here.
 */

import type { IPlugin } from '@core/plugin';
import { VideoMarkerPlugin } from '@features/video-marker';
import { QuizSolverPlugin } from '@features/quiz-solver';
import { SystemToolsPlugin } from '@features/system-tools';

export const plugins: IPlugin[] = [
  new VideoMarkerPlugin(),
  new QuizSolverPlugin(),
  new SystemToolsPlugin(),
];
