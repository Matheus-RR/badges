export interface UpdateResult {
    updated: boolean;
    content: string;
    markersFound: boolean;
}
export declare function updateReadmeContent(readme: string, badges: string): UpdateResult;
export declare function hasMarkers(readme: string): boolean;
