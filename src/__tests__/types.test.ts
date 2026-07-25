import { describe, it, expect } from 'vitest';
import { pointKey } from '../graph/types';

describe('pointKey', () => {
  it('generates a string key from lat/lng', () => {
    const key = pointKey(40.123456, -105.654321);
    expect(key).toBe('40.123456,-105.654321');
  });

  it('rounds to 6 decimal places', () => {
    const key = pointKey(40.123456789, -105.987654321);
    expect(key).toBe('40.123457,-105.987654');
  });

  it('produces same key for very close points', () => {
    const k1 = pointKey(40, -105);
    const k2 = pointKey(40.0000001, -105.0000001);
    expect(k1).toBe(k2);
  });

  it('produces different keys for distinct points', () => {
    const k1 = pointKey(40, -105);
    const k2 = pointKey(40.0001, -105);
    expect(k1).not.toBe(k2);
  });
});
