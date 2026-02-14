export interface Product {
    product: string;
    version?: string;
}
export type BadgeType = 'health' | 'eol' | 'freshness' | 'cve' | 'cloud';
export type LinkTo = 'badge-page' | 'releaserun' | 'none';
export interface ActionInputs {
    products: Product[];
    badgeTypes: BadgeType[];
    readmePath: string;
    style: string;
    linkTo: LinkTo;
    prTitle: string;
    prBranch: string;
}
export interface Badge {
    product: string;
    version?: string;
    type: BadgeType;
    markdown: string;
}
