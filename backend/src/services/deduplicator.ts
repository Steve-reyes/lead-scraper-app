/**
 * Data deduplication service.
 * Uses normalized Business Name + Postal Code as the dedup key.
 */

import { Lead, DedupKey } from '../types';
import { normalizeBusinessName, extractPostalCode } from '../utils/validators';

export class Deduplicator {
  private seen: Set<string> = new Set();

  /**
   * Generate a dedup key from a lead.
   */
  private makeKey(name: string, address?: string): string {
    const normalized = normalizeBusinessName(name);
    const postalCode = extractPostalCode(address || '');
    return `${normalized}::${postalCode || 'nopc'}`;
  }

  /**
   * Check if a lead already exists.
   */
  isDuplicate(name: string, address?: string): boolean {
    const key = this.makeKey(name, address);
    return this.seen.has(key);
  }

  /**
   * Register a lead as seen.
   */
  markSeen(name: string, address?: string): void {
    const key = this.makeKey(name, address);
    this.seen.add(key);
  }

  /**
   * Check if a lead exists and register it in one call.
   * Returns true if it's a new unique lead.
   */
  tryAdd(name: string, address?: string): boolean {
    const key = this.makeKey(name, address);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  /**
   * Reset the dedup cache (for new searches).
   */
  reset(): void {
    this.seen.clear();
  }

  /**
   * Get current dedup count.
   */
  get size(): number {
    return this.seen.size;
  }
}

// Singleton for the app
export const globalDeduplicator = new Deduplicator();
