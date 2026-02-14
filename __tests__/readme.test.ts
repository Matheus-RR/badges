import { updateReadmeContent, hasMarkers } from '../src/readme';

describe('hasMarkers', () => {
  it('returns true when both markers present', () => {
    const readme = `# Hello
<!-- releaserun-badges-start -->
old badges
<!-- releaserun-badges-end -->
rest`;
    expect(hasMarkers(readme)).toBe(true);
  });

  it('returns false when start marker missing', () => {
    expect(hasMarkers('# Hello\n<!-- releaserun-badges-end -->')).toBe(false);
  });

  it('returns false when end marker missing', () => {
    expect(hasMarkers('# Hello\n<!-- releaserun-badges-start -->')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasMarkers('')).toBe(false);
  });
});

describe('updateReadmeContent', () => {
  it('replaces content between markers', () => {
    const readme = `# My Project

<!-- releaserun-badges-start -->
old badges here
<!-- releaserun-badges-end -->

## Description
Some text`;

    const newBadges = '[![health](https://img.releaserun.com/badge/health/python/3.12.svg)](https://releaserun.com/badges/python/)';

    const result = updateReadmeContent(readme, newBadges);
    expect(result.markersFound).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.content).toContain(newBadges);
    expect(result.content).not.toContain('old badges here');
    expect(result.content).toContain('## Description');
    expect(result.content).toContain('<!-- releaserun-badges-start -->');
    expect(result.content).toContain('<!-- releaserun-badges-end -->');
  });

  it('returns markersFound=false when no markers', () => {
    const result = updateReadmeContent('# No markers here', 'badges');
    expect(result.markersFound).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.content).toBe('# No markers here');
  });

  it('returns updated=false when content unchanged', () => {
    const badges = '[![test](http://test.svg)](http://test)';
    const readme = `<!-- releaserun-badges-start -->\n${badges}\n<!-- releaserun-badges-end -->`;
    const result = updateReadmeContent(readme, badges);
    expect(result.markersFound).toBe(true);
    expect(result.updated).toBe(false);
  });

  it('handles empty content between markers', () => {
    const readme = `<!-- releaserun-badges-start -->
<!-- releaserun-badges-end -->`;
    const result = updateReadmeContent(readme, 'new badges');
    expect(result.markersFound).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.content).toContain('new badges');
  });

  it('handles markers with no newline between', () => {
    const readme = '<!-- releaserun-badges-start --><!-- releaserun-badges-end -->';
    const result = updateReadmeContent(readme, 'badges');
    expect(result.markersFound).toBe(true);
    expect(result.updated).toBe(true);
  });

  it('preserves content before and after markers', () => {
    const readme = `Before
<!-- releaserun-badges-start -->
old
<!-- releaserun-badges-end -->
After`;

    const result = updateReadmeContent(readme, 'new');
    expect(result.content).toMatch(/^Before\n/);
    expect(result.content).toMatch(/\nAfter$/);
  });

  it('handles end marker before start marker', () => {
    const readme = '<!-- releaserun-badges-end -->\n<!-- releaserun-badges-start -->';
    const result = updateReadmeContent(readme, 'badges');
    expect(result.markersFound).toBe(false);
  });

  it('handles multiple badge lines', () => {
    const readme = `# Project
<!-- releaserun-badges-start -->
old
<!-- releaserun-badges-end -->`;

    const badges = '[![a](http://a.svg)](http://a)\n[![b](http://b.svg)](http://b)';
    const result = updateReadmeContent(readme, badges);
    expect(result.updated).toBe(true);
    expect(result.content).toContain('[![a]');
    expect(result.content).toContain('[![b]');
  });
});
