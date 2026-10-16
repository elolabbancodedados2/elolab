import { describe, expect, it, vi } from 'vitest';
import { resolveBuildId } from '../../../scripts/resolve-build-id.mjs';

describe('resolveBuildId', () => {
  it('uses the Easypanel Git SHA when the source archive has no Git metadata', () => {
    const readGitMetadata = vi.fn(() => {
      throw new Error('git metadata unavailable');
    });

    const buildId = resolveBuildId({
      env: { GIT_SHA: 'b128889258a6ef7aa0e5eadf198b00fce61a3562' },
      readGitMetadata,
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    });

    expect(buildId).toBe('b128889258a6ef7aa0e5eadf198b00fce61a3562');
    expect(readGitMetadata).not.toHaveBeenCalled();
  });

  it('preserves explicit build ID overrides ahead of the Git SHA', () => {
    expect(resolveBuildId({
      env: {
        APP_BUILD_ID: 'release-canary-7',
        VITE_APP_BUILD_ID: 'vite-canary-7',
        GIT_SHA: 'commit-sha',
      },
      readGitMetadata: () => { throw new Error('Git should not be read'); },
    })).toBe('release-canary-7');

    expect(resolveBuildId({
      env: { VITE_APP_BUILD_ID: 'vite-canary-7', GIT_SHA: 'commit-sha' },
      readGitMetadata: () => { throw new Error('Git should not be read'); },
    })).toBe('vite-canary-7');
  });

  it('keeps the existing timestamp fallback when Git metadata is unavailable', () => {
    expect(resolveBuildId({
      env: {},
      readGitMetadata: () => { throw new Error('git metadata unavailable'); },
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    })).toBe('local-20261014T000000000Z');
  });
});
