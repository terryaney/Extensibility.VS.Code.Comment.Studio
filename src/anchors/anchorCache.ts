import * as vscode from 'vscode';
import { AnchorMatch } from './anchorService';

interface CacheEntry {
  filePath: string;
  anchors: AnchorMatch[];
  timestamp: number;
}

/**
 * Manages cached anchor scan results.
 */
export class AnchorCache {
  private cache = new Map<string, CacheEntry>();
  private storageKey = 'kat-comment-studio.anchorCache';

  /**
   * Updates the cache for a file.
   */
  update(filePath: string, anchors: AnchorMatch[]): void {
    this.cache.set(filePath, { filePath, anchors, timestamp: Date.now() });
  }

  /**
   * Removes a file from the cache.
   */
  remove(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Gets cached anchors for a file.
   */
  get(filePath: string): AnchorMatch[] | undefined {
    return this.cache.get(filePath)?.anchors;
  }

  /**
   * Gets all cached anchors across all files.
   */
  getAll(): AnchorMatch[] {
    const all: AnchorMatch[] = [];
    for (const entry of this.cache.values()) {
      all.push(...entry.anchors);
    }
    return all;
  }

  /**
   * Replaces the entire cache with new scan results.
   */
  replaceAll(anchors: AnchorMatch[]): void {
    this.cache.clear();
    const byFile = new Map<string, AnchorMatch[]>();
    for (const anchor of anchors) {
      const existing = byFile.get(anchor.filePath) || [];
      existing.push(anchor);
      byFile.set(anchor.filePath, existing);
    }
    for (const [filePath, fileAnchors] of byFile) {
      this.cache.set(filePath, { filePath, anchors: fileAnchors, timestamp: Date.now() });
    }
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Persists the cache to workspace state.
   */
  async save(context: vscode.ExtensionContext): Promise<void> {
    const data: { filePath: string; anchors: AnchorMatch[] }[] = [];
    for (const entry of this.cache.values()) {
      data.push({ filePath: entry.filePath, anchors: entry.anchors });
    }
    await context.workspaceState.update(this.storageKey, data);
  }

  /**
   * Loads cached data from workspace state.
   */
  load(context: vscode.ExtensionContext): void {
    const data = context.workspaceState.get<{ filePath: string; anchors: AnchorMatch[] }[]>(this.storageKey);
    if (data) {
      this.cache.clear();
      for (const entry of data) {
        this.cache.set(entry.filePath, { ...entry, timestamp: Date.now() });
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
