// src/content/content.ts

import { CommentData } from '../types';

let comments: CommentData[] = [];
let currentIndex = 0;
let playbackSpeed = 1.0;
let isPlaying = false;
let isPaused = false;
const synthesis = window.speechSynthesis;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let availableVoices: SpeechSynthesisVoice[] = [];
let filteredVoices: SpeechSynthesisVoice[] = [];
let useUniqueVoices = true;
let maxDepth = 3;
let maxTopLevelComments = 50;
let maxTotalComments = 300;
let expansionStrategy: 'breadth' | 'depth' | 'balanced' = 'balanced';
let voiceLocale = 'en-US';
let selectedVoiceNames: string[] = [];

// Post content
let postTitle = '';
let postBody = '';
let allContent: Array<{ type: 'title' | 'body' | 'comment'; text: string; author?: string | null; depth?: number; id?: string }> = [];

// Extraction state
let isExtracting = false;
let shouldStopExtraction = false;
let extractionProgress = 0;

// List of bot/moderator accounts to filter out
const FILTERED_AUTHORS = [
  'automoderator',
  'automod',
  'moderator',
  'bot',
  'modbot',
  'reddit',
];

/**
 * Check if an author should be filtered out
 */
function shouldFilterAuthor(author: string | null): boolean {
  if (!author) return false;

  const lowerAuthor = author.toLowerCase();

  if (FILTERED_AUTHORS.includes(lowerAuthor)) {
    return true;
  }

  if (lowerAuthor.includes('bot')) {
    return true;
  }

  if (lowerAuthor.endsWith('bot') || lowerAuthor.endsWith('_bot')) {
    return true;
  }

  if (lowerAuthor.startsWith('mod')) {
    return true;
  }

  return false;
}

/**
 * Remove URLs from text
 */
function removeLinks(text: string): string {
  // Remove markdown links [text](url)
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // Remove plain URLs (http, https, www)
  text = text.replace(/https?:\/\/[^\s]+/g, '');
  text = text.replace(/www\.[^\s]+/g, '');

  // Remove subreddit links (r/something)
  text = text.replace(/\br\/\w+/g, '');

  // Remove user mentions (u/someone)
  text = text.replace(/\bu\/\w+/g, '');

  // Clean up extra spaces
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// Load available voices and filter by locale
function loadVoices() {
  availableVoices = synthesis.getVoices();
  filterVoicesByLocale(voiceLocale);
}

function filterVoicesByLocale(locale: string) {
  voiceLocale = locale;

  // Don't filter by locale anymore - allow mixing
  // Just get all English voices
  filteredVoices = availableVoices.filter(voice =>
    voice.lang.startsWith('en-') || voice.lang === 'en'
  );

  if (filteredVoices.length === 0) {
    filteredVoices = availableVoices;
  }

  console.log(`🎤 Total voices: ${availableVoices.length}`);
  console.log(`🌍 English voices available: ${filteredVoices.length}`);
}

loadVoices();
if (synthesis.onvoiceschanged !== undefined) {
  synthesis.onvoiceschanged = loadVoices;
}

/**
 * Auto-expand "More replies" buttons with strategy support
 */
async function expandCommentsToDepth(
  targetDepth: number,
  maxTopLevel: number,
  maxTotal: number,
  strategy: 'breadth' | 'depth' | 'balanced'
): Promise<void> {
  console.log(`🔄 Expanding comments (depth: ${targetDepth}, topLevel: ${maxTopLevel}, total: ${maxTotal}, strategy: ${strategy})...`);

  isExtracting = true;
  shouldStopExtraction = false;

  // Check initial state
  const initialComments = document.querySelectorAll('shreddit-comment');
  const initialTopLevel = document.querySelectorAll('shreddit-comment[depth="0"]');
  extractionProgress = initialComments.length;
  console.log(`📊 Initial state: ${extractionProgress} total, ${initialTopLevel.length} top-level`);

  // If we already have too many, don't expand at all
  if (initialComments.length >= maxTotal) {
    console.log(`⚠️  Already at/over limit (${initialComments.length}/${maxTotal}). Not expanding.`);
    isExtracting = false;
    return;
  }

  if (initialTopLevel.length >= maxTopLevel) {
    console.log(`⚠️  Already at/over top-level limit (${initialTopLevel.length}/${maxTopLevel}). Only expanding depth.`);
  }

  let iterations = 0;
  const maxIterations = 50;

  while (iterations < maxIterations && !shouldStopExtraction) {
    // Count current comments FIRST before finding buttons
    const allComments = document.querySelectorAll('shreddit-comment');
    const currentTotal = allComments.length;
    extractionProgress = currentTotal;

    const topLevelComments = document.querySelectorAll('shreddit-comment[depth="0"]');
    const topLevelCount = topLevelComments.length;

    console.log(`   Iteration ${iterations + 1}: ${currentTotal}/${maxTotal} total, ${topLevelCount}/${maxTopLevel} top-level`);

    // STOP if we've hit ANY limit
    if (currentTotal >= maxTotal) {
      console.log(`✅ Reached max total comments: ${maxTotal}`);
      break;
    }

    if (shouldStopExtraction) {
      console.log(`⏹️  User stopped extraction at ${currentTotal} comments`);
      break;
    }

    if (topLevelCount >= maxTopLevel && strategy !== 'depth') {
      // For non-depth strategies, check if there are still depth buttons to click
      const hasDepthButtons = Array.from(document.querySelectorAll('faceplate-partial')).some(partial => {
        const button = partial.querySelector('button');
        if (!button) return false;

        const text = button.textContent?.toLowerCase() || '';
        if (!text.includes('more replies') && !text.includes('more comment')) {
          return false;
        }

        let depth = 0;
        let parent = partial.parentElement;
        while (parent) {
          if (parent.tagName.toLowerCase() === 'shreddit-comment') {
            depth = parseInt(parent.getAttribute('depth') || '0', 10) + 1;
            break;
          }
          parent = parent.parentElement;
        }
        return depth > 0;
      });

      if (!hasDepthButtons) {
        console.log(`✅ Reached max top-level comments: ${maxTopLevel}`);
        break;
      }
    }

    // Find all "More replies" buttons with their depths
    const moreButtons = Array.from(document.querySelectorAll('faceplate-partial'))
      .map(partial => {
        const button = partial.querySelector('button');
        if (!button) return null;

        const text = button.textContent?.toLowerCase() || '';
        if (!text.includes('more replies') && !text.includes('more comment')) {
          return null;
        }

        let depth = 0;
        let parent = partial.parentElement;
        while (parent) {
          if (parent.tagName.toLowerCase() === 'shreddit-comment') {
            const commentDepth = parseInt(parent.getAttribute('depth') || '0', 10);
            depth = commentDepth + 1;
            break;
          }
          parent = parent.parentElement;
        }

        return { button: button as HTMLElement, depth };
      })
      .filter((item): item is { button: HTMLElement; depth: number } => item !== null)
      .filter(item => {
        switch (strategy) {
          case 'breadth':
            if (item.depth === 0 && topLevelCount >= maxTopLevel) {
              return false;
            }
            return item.depth <= Math.min(2, targetDepth);

          case 'depth':
            if (item.depth === 0 && topLevelCount >= Math.min(10, maxTopLevel)) {
              return false;
            }
            return item.depth < targetDepth;

          case 'balanced':
          default:
            if (item.depth === 0 && topLevelCount >= maxTopLevel) {
              return false;
            }
            return item.depth < targetDepth;
        }
      })
      .sort((a, b) => {
        switch (strategy) {
          case 'breadth':
            return a.depth - b.depth;
          case 'depth':
            return b.depth - a.depth;
          case 'balanced':
          default:
            return a.depth - b.depth;
        }
      });

    console.log(`   Found ${moreButtons.length} "More replies" buttons (after filtering)`);

    if (moreButtons.length === 0) {
      console.log(`✅ No more buttons to click`);
      break;
    }

    const remainingBudget = maxTotal - currentTotal;
    console.log(`   Remaining budget: ${remainingBudget} comments`);

    if (remainingBudget <= 0) {
      console.log(`✅ Budget exhausted`);
      break;
    }

    const batchSize = strategy === 'breadth' ? 3 : 2;
    const estimatedCommentsPerButton = 7;
    const maxButtonsToClick = Math.max(1, Math.floor(remainingBudget / estimatedCommentsPerButton));
    const buttonsToClick = moreButtons.slice(0, Math.min(moreButtons.length, maxButtonsToClick));

    console.log(`   Clicking ${buttonsToClick.length} buttons`);

    for (let i = 0; i < buttonsToClick.length; i += batchSize) {
      if (shouldStopExtraction) break;

      const currentCount = document.querySelectorAll('shreddit-comment').length;
      extractionProgress = currentCount;

      if (currentCount >= maxTotal) {
        console.log(`   Stopping: reached ${maxTotal} total comments`);
        break;
      }

      const batch = buttonsToClick.slice(i, i + batchSize);
      batch.forEach(item => {
        console.log(`   Clicking "More replies" at depth ${item.depth}`);
        item.button.click();
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    iterations++;
  }

  if (iterations >= maxIterations) {
    console.warn('⚠️  Stopped after max iterations');
  }

  const finalCount = document.querySelectorAll('shreddit-comment').length;
  const finalTopLevel = document.querySelectorAll('shreddit-comment[depth="0"]').length;
  extractionProgress = finalCount;
  console.log(`📊 Final: ${finalCount} total comments, ${finalTopLevel} top-level`);

  if (finalCount > maxTotal) {
    console.log(`⚠️  Note: Loaded ${finalCount} comments (target was ${maxTotal}). Some were pre-loaded by Reddit.`);
  }

  isExtracting = false;
}

function getVoiceForIndex(index: number): SpeechSynthesisVoice | null {
  if (filteredVoices.length === 0) {
    return null;
  }

  if (!useUniqueVoices) {
    return filteredVoices[0];
  }

  // If user has selected specific voices, use only those
  let voicesToUse = filteredVoices;
  if (selectedVoiceNames.length > 0) {
    voicesToUse = filteredVoices.filter(v => selectedVoiceNames.includes(v.name));
    if (voicesToUse.length === 0) {
      voicesToUse = filteredVoices;
    }
  }

  const voiceIndex = index % voicesToUse.length;
  return voicesToUse[voiceIndex];
}

function cleanup() {
  console.log('🧹 Cleaning up...');
  synthesis.cancel();
  clearHighlight();
  isPlaying = false;
  isPaused = false;
  currentUtterance = null;
  console.log('✅ Cleanup complete');
}

function extractPostContent(): { title: string; body: string } {
  console.log('📰 Extracting post title and body...');

  const titleElement = document.querySelector('shreddit-post h1') ||
                       document.querySelector('[slot="title"]') ||
                       document.querySelector('h1');
  let title = titleElement?.textContent?.trim() || '';
  title = removeLinks(title);

  const bodyElement = document.querySelector('shreddit-post div[slot="text-body"]') ||
                      document.querySelector('[data-click-id="text"]') ||
                      document.querySelector('div[data-test-id="post-content"]');
  let body = bodyElement?.textContent?.trim() || '';
  body = removeLinks(body);

  console.log('📰 Title:', title.substring(0, 100));
  console.log('📰 Body:', body ? body.substring(0, 100) : '(none)');

  return { title, body };
}

function extractComments(): CommentData[] {
  console.log('🔍 Starting comment extraction...');

  const extractedComments: CommentData[] = [];
  const commentElements = document.querySelectorAll('shreddit-comment');
  console.log(`📊 Found ${commentElements.length} shreddit-comment elements`);

  let filteredCount = 0;

  commentElements.forEach((element) => {
    const commentEl = element as HTMLElement;

    const thingId = commentEl.getAttribute('thingid') || '';
    const id = thingId || `comment-${extractedComments.length}`;
    const author = commentEl.getAttribute('author') || null;
    const depth = parseInt(commentEl.getAttribute('depth') || '0', 10);

    if (shouldFilterAuthor(author)) {
      console.log(`🚫 Filtered out comment from: ${author}`);
      filteredCount++;
      return;
    }

    const contentDiv = commentEl.querySelector('[id$="-comment-rtjson-content"]');
    let text = contentDiv?.textContent?.trim() || '';

    // Remove links from comment text
    text = removeLinks(text);

    if (!text) {
      return;
    }

    const permalink = commentEl.getAttribute('permalink') || `#${id}`;

    extractedComments.push({
      id,
      text,
      author,
      depth,
      permalink,
      element: commentEl
    });
  });

  console.log(`🎉 Extraction complete! Total: ${extractedComments.length} (filtered out ${filteredCount} bot/mod comments)`);
  return extractedComments;
}

function highlightComment(commentId: string) {
  clearHighlight();

  const comment = document.querySelector(`shreddit-comment[thingid="${commentId}"]`);
  if (!comment) return;

  const el = comment as HTMLElement;

  el.classList.add('reddit-reader-highlight');
  el.setAttribute('data-reddit-out-loud-active', 'true');

  let indicator = document.getElementById('reddit-out-loud-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'reddit-out-loud-indicator';
    indicator.style.cssText = `
      position: absolute;
      left: -8px;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, #ffc107 0%, #ff9800 100%);
      border-radius: 2px;
      box-shadow: 0 0 8px rgba(255, 193, 7, 0.6);
      z-index: 10;
      pointer-events: none;
      animation: reddit-out-loud-pulse 1.5s ease-in-out infinite;
    `;
  }

  const originalPosition = el.style.position;
  el.setAttribute('data-original-position', originalPosition || 'static');
  el.style.position = 'relative';

  el.style.backgroundColor = 'rgba(255, 243, 205, 0.3)';
  el.style.transition = 'background-color 0.3s ease';

  el.appendChild(indicator);

  if (!document.getElementById('reddit-out-loud-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'reddit-out-loud-animation-styles';
    style.textContent = `
      @keyframes reddit-out-loud-pulse {
        0%, 100% { opacity: 1; transform: scaleX(1); }
        50% { opacity: 0.7; transform: scaleX(1.2); }
      }
    `;
    document.head.appendChild(style);
  }

  el.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  console.log('✨ Highlighted comment:', commentId);
}

function highlightPost() {
  const postElement = document.querySelector('shreddit-post');
  if (postElement) {
    const el = postElement as HTMLElement;
    el.style.backgroundColor = '#fff3cd';
    el.style.outline = '3px solid #ffc107';
    el.style.transition = 'all 0.3s ease';

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}

function clearHighlight() {
  const indicator = document.getElementById('reddit-out-loud-indicator');
  if (indicator) {
    indicator.remove();
  }

  const highlighted = document.querySelector('[data-reddit-out-loud-active="true"]');
  if (highlighted) {
    const el = highlighted as HTMLElement;
    el.classList.remove('reddit-reader-highlight');
    el.removeAttribute('data-reddit-out-loud-active');
    el.style.backgroundColor = '';
    el.style.transition = '';

    const originalPosition = el.getAttribute('data-original-position');
    if (originalPosition) {
      el.style.position = originalPosition === 'static' ? '' : originalPosition;
      el.removeAttribute('data-original-position');
    }
  }

  const postElement = document.querySelector('shreddit-post');
  if (postElement) {
    const el = postElement as HTMLElement;
    el.style.backgroundColor = '';
    el.style.outline = '';
    el.style.transition = '';
  }
}

function readContent(index: number) {
  if (index >= allContent.length || index < 0) return;

  const item = allContent[index];
  const voice = getVoiceForIndex(index);

  console.log(`🗣️  Reading ${item.type} ${index + 1}/${allContent.length}`);

  if (item.type === 'title') {
    highlightPost();
  } else if (item.type === 'body') {
    highlightPost();
  } else {
    if (item.id) {
      highlightComment(item.id);
    }
  }

  currentUtterance = new SpeechSynthesisUtterance(item.text);
  currentUtterance.rate = playbackSpeed;
  currentUtterance.lang = voiceLocale;

  if (voice) {
    currentUtterance.voice = voice;
  }

  currentUtterance.onend = () => {
    if (currentIndex < allContent.length - 1) {
      currentIndex++;
      setTimeout(() => readContent(currentIndex), 100);
    } else {
      console.log('🎉 Finished all content');
      isPlaying = false;
      clearHighlight();
    }
  };

  currentUtterance.onerror = () => {
    isPlaying = false;
  };

  synthesis.speak(currentUtterance);
  isPlaying = true;
  isPaused = false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request);

  switch (request.action) {
    case 'extractComments':
      (async () => {
        try {
          const depth = request.maxDepth !== undefined ? request.maxDepth : maxDepth;
          const maxTopLevel = request.maxTopLevelComments !== undefined ? request.maxTopLevelComments : maxTopLevelComments;
          const maxTotal = request.maxTotalComments !== undefined ? request.maxTotalComments : maxTotalComments;
          const strategy = request.expansionStrategy || expansionStrategy;
          const locale = request.voiceLocale || voiceLocale;
          const selectedVoices = request.selectedVoices || [];

          maxDepth = depth;
          maxTopLevelComments = maxTopLevel;
          maxTotalComments = maxTotal;
          expansionStrategy = strategy;
          selectedVoiceNames = selectedVoices;

          if (locale !== voiceLocale) {
            filterVoicesByLocale(locale);
          }

          await expandCommentsToDepth(depth, maxTopLevel, maxTotal, strategy);

          const postContent = extractPostContent();
          postTitle = postContent.title;
          postBody = postContent.body;

          comments = extractComments();
          currentIndex = 0;

          allContent = [];

          if (postTitle) {
            allContent.push({ type: 'title', text: postTitle });
          }

          if (postBody) {
            allContent.push({ type: 'body', text: postBody });
          }

          comments.forEach(comment => {
            allContent.push({
              type: 'comment',
              text: comment.text,
              author: comment.author,
              depth: comment.depth,
              id: comment.id
            });
          });

          console.log(`📚 Total: ${allContent.length} items (${comments.length} comments)`);

          sendResponse({
            success: true,
            count: comments.length,
            totalItems: allContent.length,
            hasTitle: !!postTitle,
            hasBody: !!postBody,
            title: postTitle,
            maxDepth: depth,
            maxTopLevelComments: maxTopLevel,
            maxTotalComments: maxTotal,
            expansionStrategy: strategy,
            voiceLocale: locale,
            comments: comments.map(c => ({
              id: c.id,
              author: c.author,
              depth: c.depth,
              text: c.text,
              permalink: c.permalink
            }))
          });
        } catch (error) {
          console.error('❌ Error during extraction:', error);
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return true;

    case 'stopExtraction':
      shouldStopExtraction = true;
      sendResponse({ success: true, stopped: true });
      break;

    case 'getExtractionProgress':
      sendResponse({
        isExtracting,
        progress: extractionProgress,
        canStop: isExtracting
      });
      break;

    case 'play':
      if (synthesis.paused) {
        console.log('▶️ Resuming from pause');
        synthesis.resume();
        isPaused = false;
        isPlaying = true;
      } else if (!synthesis.speaking) {
        console.log('▶️ Starting playback');
        readContent(currentIndex);
      }
      sendResponse({ success: true, isPlaying: true });
      break;

    case 'pause':
      if (synthesis.speaking) {
        synthesis.pause();
        isPaused = true;
        isPlaying = false;
      }
      sendResponse({ success: true, isPaused: true });
      break;

    case 'stop':
      synthesis.cancel();
      currentIndex = 0;
      isPlaying = false;
      isPaused = false;
      clearHighlight();
      sendResponse({ success: true });
      break;

    case 'next':
      synthesis.cancel();
      if (currentIndex < allContent.length - 1) {
        currentIndex++;
        readContent(currentIndex);
      }
      sendResponse({ success: true, currentIndex });
      break;

    case 'previous':
      synthesis.cancel();
      if (currentIndex > 0) {
        currentIndex--;
      }
      readContent(currentIndex);
      sendResponse({ success: true, currentIndex });
      break;

    case 'setSpeed':
      playbackSpeed = request.speed;
      sendResponse({ success: true });
      break;

    case 'toggleUniqueVoices':
      useUniqueVoices = request.enabled;
      sendResponse({ success: true, enabled: useUniqueVoices });
      break;

    case 'setVoiceLocale':
      filterVoicesByLocale(request.locale);
      sendResponse({ success: true, voiceLocale });
      break;

    case 'getState':
      const currentItem = allContent[currentIndex];

      // Calculate selected voice count
      let selectedVoiceCount = filteredVoices.length;
      if (selectedVoiceNames.length > 0) {
        const matchingVoices = filteredVoices.filter(v => selectedVoiceNames.includes(v.name));
        selectedVoiceCount = matchingVoices.length;
      }

      sendResponse({
        isPlaying: synthesis.speaking && !synthesis.paused,
        isPaused: synthesis.paused,
        currentIndex,
        totalComments: comments.length,
        totalItems: allContent.length,
        speed: playbackSpeed,
        useUniqueVoices,
        voiceCount: selectedVoiceCount,
        currentType: currentItem?.type || null,
        hasTitle: !!postTitle,
        hasBody: !!postBody,
        title: postTitle,
        maxDepth,
        maxTopLevelComments,
        maxTotalComments,
        expansionStrategy,
        voiceLocale,
        isExtracting,
        extractionProgress,
        comments: comments.map(c => ({
          id: c.id,
          author: c.author,
          depth: c.depth,
          text: c.text,
          permalink: c.permalink
        }))
      });
      break;

    case 'cleanup':
      cleanup();
      sendResponse({ success: true });
      break;
  }

  return true;
});

window.addEventListener('beforeunload', () => {
  cleanup();
});

// REMOVED: Don't pause on visibility change - keep playing!
// document.addEventListener('visibilitychange', () => { ... });

let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    cleanup();
    comments = [];
    allContent = [];
    postTitle = '';
    postBody = '';
    currentIndex = 0;
    lastUrl = currentUrl;
  }
}).observe(document, { subtree: true, childList: true });

console.log('🚀 Reddit Out Loud - Content Script Loaded');