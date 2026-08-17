import { describe, it, expect } from 'vitest';
import { parseElevationResults } from '../elevation/api';

describe('parseElevationResults', () => {
  it('parses a multipoint response with ordered results', () => {
    const json = {
      results: [
        { value: '1653.93' },
        { value: '1650.52' },
        { value: 'NoData' },
      ],
    };
    expect(parseElevationResults(json)).toEqual([1653.93, 1650.52, 0]);
  });

  it('parses a single-point response that omits the results array', () => {
    const json = { value: '1653.93' };
    expect(parseElevationResults(json)).toEqual([1653.93]);
  });

  it('maps NoData and missing values to zero', () => {
    expect(parseElevationResults({ value: 'NoData' })).toEqual([0]);
    expect(parseElevationResults({})).toEqual([0]);
  });

  it('rejects non-numeric values as zero', () => {
    expect(parseElevationResults({ value: 'not-a-number' })).toEqual([0]);
  });
});
