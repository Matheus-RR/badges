import { Badge, BadgeType, LinkTo, Product } from './types';

const PRODUCT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const VALID_BADGE_TYPES: BadgeType[] = ['health', 'eol', 'freshness', 'cve', 'cloud'];
const MAX_PRODUCTS = 50;

export function validateProduct(name: string): boolean {
  return PRODUCT_PATTERN.test(name);
}

export function validateVersion(version: string): boolean {
  return version === 'latest' || VERSION_PATTERN.test(version);
}

export function validateBadgeType(type: string): type is BadgeType {
  return VALID_BADGE_TYPES.includes(type as BadgeType);
}

export function parseProducts(input: string): { products: Product[], warnings: string[] } {
  const lines = input
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const products: Product[] = [];
  const warnings: string[] = [];

  if (lines.length > MAX_PRODUCTS) {
    warnings.push(`Maximum of ${MAX_PRODUCTS} products allowed. Only the first ${MAX_PRODUCTS} will be processed.`);
  }

  const linesToProcess = lines.slice(0, MAX_PRODUCTS);

  for (const line of linesToProcess) {
    const colonIdx = line.indexOf(':');
    let name: string;
    let version: string | undefined;

    if (colonIdx === -1) {
      name = line;
    } else {
      name = line.substring(0, colonIdx);
      version = line.substring(colonIdx + 1);
    }

    if (!validateProduct(name)) {
      warnings.push(`Skipping invalid product name: "${name}"`);
      continue;
    }

    if (version && !validateVersion(version)) {
      warnings.push(`Skipping invalid version "${version}" for product "${name}"`);
      continue;
    }

    products.push({ product: name, version: version || undefined });
  }

  return { products, warnings };
}

export function parseBadgeTypes(input: string): BadgeType[] {
  const types = input
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);

  const valid: BadgeType[] = [];
  for (const t of types) {
    if (validateBadgeType(t)) {
      valid.push(t);
    }
  }

  return valid.length > 0 ? valid : ['health'];
}

export function getBadgeUrl(type: BadgeType, product: string, version?: string, style?: string, baseUrl?: string): string {
  const base = baseUrl || 'https://img.releaserun.com/badge';
  const path = version
    ? `${type}/${product}/${version}.svg`
    : `${type}/${product}.svg`;
  let url = `${base}/${path}`;
  if (style && style !== 'flat') {
    url += `?style=${encodeURIComponent(style)}`;
  }
  return url;
}

export function getLinkUrl(linkTo: LinkTo, product: string, badgeUrl: string): string {
  switch (linkTo) {
    case 'badge-page':
      return `https://releaserun.com/badges/${product}/`;
    case 'releaserun':
      return 'https://releaserun.com';
    case 'none':
      return badgeUrl;
  }
}

export function getBadgeLabel(type: BadgeType, product: string, version?: string): string {
  const versionSuffix = version ? ` ${version}` : '';
  switch (type) {
    case 'health':
      return `${product}${versionSuffix} health`;
    case 'eol':
      return `${product}${versionSuffix} EOL`;
    case 'freshness':
      return `${product}${versionSuffix} freshness`;
    case 'cve':
      return `${product}${versionSuffix} CVEs`;
    case 'cloud':
      return `${product}${versionSuffix} cloud`;
  }
}

export function generateBadgeMarkdown(
  product: Product,
  type: BadgeType,
  style: string,
  linkTo: LinkTo,
  baseUrl?: string,
): string {
  const badgeUrl = getBadgeUrl(type, product.product, product.version, style, baseUrl);
  const linkUrl = getLinkUrl(linkTo, product.product, badgeUrl);
  const label = getBadgeLabel(type, product.product, product.version);
  return `[![${label}](${badgeUrl})](${linkUrl})`;
}

export function generateAllBadges(
  products: Product[],
  badgeTypes: BadgeType[],
  style: string,
  linkTo: LinkTo,
  baseUrl?: string,
): string {
  const lines: string[] = [];

  for (const product of products) {
    const badges = badgeTypes.map(type =>
      generateBadgeMarkdown(product, type, style, linkTo, baseUrl),
    );
    lines.push(badges.join(' '));
  }

  return lines.join('\n');
}
