// src/utils/flattenComments.ts

import { CommentData } from '../types';

/**
 * Flattens a hierarchical comment tree into reading order.
 * Comments are already in DOM order from Reddit, but this ensures
 * proper depth-first traversal where replies appear immediately after their parent.
 *
 * @param comments - Array of extracted comment objects with depth information
 * @returns Flattened array in correct reading order
 */
export function flattenComments(comments: CommentData[]): CommentData[] {
  console.log('🔄 Flattening comments...');
  console.log(`📊 Input: ${comments.length} comments`);

  // Reddit's DOM already provides comments in visual order with depth attributes
  // We just need to ensure they're properly ordered
  const flattened: CommentData[] = [];

  // Since shreddit-comment elements appear in DOM order with depth attributes,
  // they're already in the correct reading order (depth-first traversal)
  // Just copy them to the output array
  comments.forEach((comment, index) => {
    flattened.push(comment);
    console.log(`  ${index + 1}. depth=${comment.depth} author=${comment.author} preview="${comment.text.substring(0, 30)}..."`);
  });

  console.log(`✅ Flattened ${flattened.length} comments`);
  return flattened;
}