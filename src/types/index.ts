// src/types/index.ts

export interface CommentData {
  id: string;
  text: string;
  author: string | null;
  depth: number;
  permalink: string;
  element: HTMLElement;
}

interface Settings {
  maxDepth: number;
  maxTopLevelComments: number;
  maxTotalComments: number;        // NEW
  expansionStrategy: 'breadth' | 'depth' | 'balanced';  // NEW
  voiceLocale: string;
  hasCompletedSetup: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  maxDepth: 3,
  maxTopLevelComments: 50,
  maxTotalComments: 300,           // NEW
  expansionStrategy: 'balanced',   // NEW
  voiceLocale: 'en-US',
  hasCompletedSetup: false
};