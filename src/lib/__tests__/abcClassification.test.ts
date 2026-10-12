import { describe, expect, it } from 'vitest';
import { classifyAbcItem } from '../abcClassification';

describe('classifyAbcItem', () => {
  it('classifies a top value item in the range it starts in, even if it crosses the threshold', () => {
    expect(classifyAbcItem(0, 100)).toBe('A');
    expect(classifyAbcItem(75, 100)).toBe('A');
    expect(classifyAbcItem(80, 100)).toBe('B');
    expect(classifyAbcItem(90, 100)).toBe('B');
    expect(classifyAbcItem(95, 100)).toBe('C');
  });
});
