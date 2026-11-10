import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveRevision,
  collectToolVersions,
  resolveSampleCount,
  buildPageReport,
  buildSummary,
  sanitizeReports,
  assertNoSecrets,
} from './report.js';

describe('resolveRevision', () => {
  it('prefers GITHUB_SHA, then GIT_SHA, then unknown', () => {
    expect(resolveRevision({ GITHUB_SHA: 'a' })).toBe('a');
    expect(resolveRevision({ GIT_SHA: 'b' })).toBe('b');
    expect(resolveRevision({})).toBe('unknown');
  });
});

describe('resolveSampleCount', () => {
  it('defaults to 3', () => {
    expect(resolveSampleCount(undefined)).toBe(3);
  });
  it('parses a positive integer', () => {
    expect(resolveSampleCount('5')).toBe(5);
  });
  it.each(['0', '-1', 'abc', '2.5'])('throws on %s', (v) => {
    expect(() => resolveSampleCount(v)).toThrow();
  });
});

describe('collectToolVersions', () => {
  it('passes versions through with unknown fallback', () => {
    expect(
      collectToolVersions({
        lighthouseVersion: '13.3.0',
        playwrightVersion: '1.60.0',
      }),
    ).toEqual({ lighthouse: '13.3.0', playwright: '1.60.0', node: 'unknown' });
  });
});

describe('buildPageReport', () => {
  it('attaches the median and throws on no samples', () => {
    const m = (fcp) => ({ fcp, lcp: 1, tbt: 1, cls: 0, performanceScore: 90 });
    const r = buildPageReport({
      name: 'clusters',
      url: 'u',
      samples: [m(100), m(300), m(200)],
    });
    expect(r.median.fcp).toBe(200);
    expect(() =>
      buildPageReport({ name: 'x', url: 'u', samples: [] }),
    ).toThrow();
  });
});

describe('buildSummary', () => {
  it('includes metadata and throws on empty pages', () => {
    const summary = buildSummary({
      revision: 'sha',
      toolVersions: { lighthouse: '13' },
      settings: { samples: 3 },
      pages: [{ name: 'clusters', url: 'u', samples: [], median: {} }],
      generatedAt: 't',
    });
    expect(summary).toMatchObject({
      revision: 'sha',
      settings: { samples: 3 },
      generatedAt: 't',
    });
    expect(() =>
      buildSummary({
        revision: 'sha',
        toolVersions: {},
        settings: {},
        pages: [],
      }),
    ).toThrow();
  });
});

describe('sanitizeReports', () => {
  let dir;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));
  it('redacts secret strings and reports modified file count', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'san-'));
    fs.writeFileSync(path.join(dir, 'a.json'), '{"token":"SECRET123","x":1}');
    fs.writeFileSync(path.join(dir, 'b.html'), '<p>nothing here</p>');
    const n = sanitizeReports({
      directory: dir,
      secrets: ['SECRET123', '', '  '],
    });
    expect(n).toBe(1);
    const a = fs.readFileSync(path.join(dir, 'a.json'), 'utf8');
    expect(a).not.toContain('SECRET123');
    expect(a).toContain('***REDACTED***');
  });
});

describe('assertNoSecrets', () => {
  let dir;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));
  it('throws when a file still contains a secret', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosec-'));
    fs.writeFileSync(path.join(dir, 'leak.json'), '{"k":"SECRET123"}');
    expect(() =>
      assertNoSecrets({ directory: dir, secrets: ['SECRET123'] }),
    ).toThrow(/SECRET123|leak\.json/);
  });
  it('passes when no file contains any secret', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosec-'));
    fs.writeFileSync(path.join(dir, 'clean.json'), '{"k":"***REDACTED***"}');
    expect(() =>
      assertNoSecrets({ directory: dir, secrets: ['SECRET123', '', '  '] }),
    ).not.toThrow();
  });
});
