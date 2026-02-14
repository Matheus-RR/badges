import { BadgeType, LinkTo, Product } from './types';
export declare function validateProduct(name: string): boolean;
export declare function validateVersion(version: string): boolean;
export declare function validateBadgeType(type: string): type is BadgeType;
export declare function parseProducts(input: string): {
    products: Product[];
    warnings: string[];
};
export declare function parseBadgeTypes(input: string): BadgeType[];
export declare function getBadgeUrl(type: BadgeType, product: string, version?: string, style?: string, baseUrl?: string): string;
export declare function getLinkUrl(linkTo: LinkTo, product: string, badgeUrl: string): string;
export declare function getBadgeLabel(type: BadgeType, product: string, version?: string): string;
export declare function generateBadgeMarkdown(product: Product, type: BadgeType, style: string, linkTo: LinkTo, baseUrl?: string): string;
export declare function generateAllBadges(products: Product[], badgeTypes: BadgeType[], style: string, linkTo: LinkTo, baseUrl?: string): string;
