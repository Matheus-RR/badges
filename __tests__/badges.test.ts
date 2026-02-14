import {
  validateProduct,
  validateVersion,
  validateBadgeType,
  parseProducts,
  parseBadgeTypes,
  getBadgeUrl,
  getLinkUrl,
  getBadgeLabel,
  generateBadgeMarkdown,
  generateAllBadges,
} from '../src/badges';

describe('validateProduct', () => {
  it('accepts valid product names', () => {
    expect(validateProduct('python')).toBe(true);
    expect(validateProduct('node.js')).toBe(true);
    expect(validateProduct('go-lang')).toBe(true);
    expect(validateProduct('ruby_on_rails')).toBe(true);
    expect(validateProduct('3scale')).toBe(true);
  });

  it('rejects invalid product names', () => {
    expect(validateProduct('')).toBe(false);
    expect(validateProduct('.hidden')).toBe(false);
    expect(validateProduct('-dash')).toBe(false);
    expect(validateProduct('UPPER')).toBe(false);
    expect(validateProduct('has space')).toBe(false);
    expect(validateProduct('injection;rm')).toBe(false);
    expect(validateProduct('../traversal')).toBe(false);
  });
});

describe('validateVersion', () => {
  it('accepts valid versions', () => {
    expect(validateVersion('3.12')).toBe(true);
    expect(validateVersion('20.11.0')).toBe(true);
    expect(validateVersion('latest')).toBe(true);
    expect(validateVersion('v1.0.0')).toBe(true);
    expect(validateVersion('3.12-rc1')).toBe(true);
  });

  it('rejects invalid versions', () => {
    expect(validateVersion('')).toBe(false);
    expect(validateVersion('.1')).toBe(false);
    expect(validateVersion('-1')).toBe(false);
    expect(validateVersion('1;echo')).toBe(false);
  });
});

describe('validateBadgeType', () => {
  it('accepts valid badge types', () => {
    expect(validateBadgeType('health')).toBe(true);
    expect(validateBadgeType('eol')).toBe(true);
    expect(validateBadgeType('freshness')).toBe(true);
    expect(validateBadgeType('cve')).toBe(true);
    expect(validateBadgeType('cloud')).toBe(true);
  });

  it('rejects invalid badge types', () => {
    expect(validateBadgeType('invalid')).toBe(false);
    expect(validateBadgeType('security')).toBe(false);
    expect(validateBadgeType('')).toBe(false);
  });
});

describe('parseProducts', () => {
  it('parses product:version pairs', () => {
    const input = 'python:3.12\nnode:20.11';
    const { products } = parseProducts(input);
    expect(products).toEqual([
      { product: 'python', version: '3.12' },
      { product: 'node', version: '20.11' },
    ]);
  });

  it('parses products without versions', () => {
    const { products } = parseProducts('python\nnode');
    expect(products).toEqual([
      { product: 'python', version: undefined },
      { product: 'node', version: undefined },
    ]);
  });

  it('skips empty lines', () => {
    const { products } = parseProducts('python:3.12\n\nnode:20\n  ');
    expect(products).toHaveLength(2);
  });

  it('skips invalid product names and returns warnings', () => {
    const { products, warnings } = parseProducts('python:3.12\nINVALID:1.0\nnode:20');
    expect(products).toHaveLength(2);
    expect(products[0].product).toBe('python');
    expect(products[1].product).toBe('node');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Skipping invalid product name');
  });

  it('warns and truncates on too many products', () => {
    const lines = Array.from({ length: 51 }, (_, i) => `product${i}:1.0`).join('\n');
    const { products, warnings } = parseProducts(lines);
    expect(products).toHaveLength(50);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Maximum of 50 products allowed');
  });

  it('skips versions with invalid characters like colons and returns warnings', () => {
    const { products, warnings } = parseProducts('python:3.12:extra');
    expect(products).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Skipping invalid version');
  });

  it('returns empty warnings when all products are valid', () => {
    const { products, warnings } = parseProducts('python:3.12\nnode:20');
    expect(products).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });
});

describe('parseBadgeTypes', () => {
  it('parses comma-separated types', () => {
    expect(parseBadgeTypes('health,eol,cve')).toEqual(['health', 'eol', 'cve']);
  });

  it('filters invalid types', () => {
    expect(parseBadgeTypes('health,invalid,eol')).toEqual(['health', 'eol']);
  });

  it('defaults to health when all invalid', () => {
    expect(parseBadgeTypes('invalid,nope')).toEqual(['health']);
  });

  it('trims whitespace', () => {
    expect(parseBadgeTypes(' health , eol ')).toEqual(['health', 'eol']);
  });
});

describe('getBadgeUrl', () => {
  it('generates URL with version', () => {
    expect(getBadgeUrl('health', 'python', '3.12')).toBe(
      'https://img.releaserun.com/badge/health/python/3.12.svg',
    );
  });

  it('generates health URL without version', () => {
    expect(getBadgeUrl('health', 'python')).toBe(
      'https://img.releaserun.com/badge/health/python.svg',
    );
  });

  it('generates eol URL with version', () => {
    expect(getBadgeUrl('eol', 'node', '18')).toBe(
      'https://img.releaserun.com/badge/eol/node/18.svg',
    );
  });

  it('appends style if not flat', () => {
    expect(getBadgeUrl('health', 'python', '3.12', 'for-the-badge')).toBe(
      'https://img.releaserun.com/badge/health/python/3.12.svg?style=for-the-badge',
    );
  });

  it('omits style param for flat (default)', () => {
    expect(getBadgeUrl('health', 'python', '3.12', 'flat')).toBe(
      'https://img.releaserun.com/badge/health/python/3.12.svg',
    );
  });

  it('uses custom base URL when provided', () => {
    expect(getBadgeUrl('health', 'python', '3.12', undefined, 'https://custom.example.com/badge')).toBe(
      'https://custom.example.com/badge/health/python/3.12.svg',
    );
  });

  it('encodes style parameter in URL', () => {
    expect(getBadgeUrl('health', 'python', '3.12', 'for-the-badge')).toBe(
      'https://img.releaserun.com/badge/health/python/3.12.svg?style=for-the-badge',
    );
  });
});

describe('getLinkUrl', () => {
  it('returns badge-page URL', () => {
    expect(getLinkUrl('badge-page', 'python', 'http://badge')).toBe(
      'https://releaserun.com/badges/python/',
    );
  });

  it('returns releaserun URL', () => {
    expect(getLinkUrl('releaserun', 'python', 'http://badge')).toBe(
      'https://releaserun.com',
    );
  });

  it('returns badge URL for none', () => {
    expect(getLinkUrl('none', 'python', 'http://badge.svg')).toBe(
      'http://badge.svg',
    );
  });
});

describe('getBadgeLabel', () => {
  it('generates label with version', () => {
    expect(getBadgeLabel('health', 'python', '3.12')).toBe('python 3.12 health');
  });

  it('generates label without version', () => {
    expect(getBadgeLabel('eol', 'node')).toBe('node EOL');
  });

  it('generates cve label', () => {
    expect(getBadgeLabel('cve', 'python', '3.12')).toBe('python 3.12 CVEs');
  });
});

describe('generateBadgeMarkdown', () => {
  it('generates correct markdown', () => {
    const result = generateBadgeMarkdown(
      { product: 'python', version: '3.12' },
      'health',
      'flat',
      'badge-page',
    );
    expect(result).toBe(
      '[![python 3.12 health](https://img.releaserun.com/badge/health/python/3.12.svg)](https://releaserun.com/badges/python/)',
    );
  });
});

describe('generateAllBadges', () => {
  it('generates badges for multiple products and types', () => {
    const result = generateAllBadges(
      [
        { product: 'python', version: '3.12' },
        { product: 'node', version: '20' },
      ],
      ['health', 'eol'],
      'flat',
      'badge-page',
    );
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('python');
    expect(lines[0]).toContain('health');
    expect(lines[0]).toContain('eol');
    expect(lines[1]).toContain('node');
  });
});
