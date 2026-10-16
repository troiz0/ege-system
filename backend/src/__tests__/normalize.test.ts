import { describe, it, expect } from 'vitest';
import { normalizePercent } from '../lib/normalize';

describe('Core normalization functions', () => {
  describe('normalizePercent', () => {
    it('should normalize 5-point scale correctly', () => {
      expect(normalizePercent(3, 5)).toBe(60);
      expect(normalizePercent(5, 5)).toBe(100);
      expect(normalizePercent(2, 5)).toBe(40);
    });

    it('should normalize 10-point scale correctly', () => {
      expect(normalizePercent(7, 10)).toBe(70);
      expect(normalizePercent(10, 10)).toBe(100);
    });

    it('should normalize 100-point scale correctly', () => {
      expect(normalizePercent(85, 100)).toBe(85);
      expect(normalizePercent(56, 100)).toBe(56);
    });

    it('should handle edge cases', () => {
      expect(normalizePercent(0, 5)).toBe(0);
      expect(normalizePercent(0, 0)).toBe(0);
    });

    it('should clamp values between 0 and 100', () => {
      expect(normalizePercent(6, 5)).toBe(100);
      expect(normalizePercent(-1, 5)).toBe(0);
    });
  });
});
