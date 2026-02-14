const START_MARKER = '<!-- releaserun-badges-start -->';
const END_MARKER = '<!-- releaserun-badges-end -->';

export interface UpdateResult {
  updated: boolean;
  content: string;
  markersFound: boolean;
}

export function updateReadmeContent(readme: string, badges: string): UpdateResult {
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    return { updated: false, content: readme, markersFound: false };
  }

  if (endIdx < startIdx) {
    return { updated: false, content: readme, markersFound: false };
  }

  const before = readme.substring(0, startIdx + START_MARKER.length);
  const after = readme.substring(endIdx);

  const newContent = `${before}\n${badges}\n${after}`;

  const changed = newContent !== readme;

  return { updated: changed, content: newContent, markersFound: true };
}

export function hasMarkers(readme: string): boolean {
  return readme.includes(START_MARKER) && readme.includes(END_MARKER);
}
