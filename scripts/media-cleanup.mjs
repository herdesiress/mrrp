const mediaFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|gif|webp|mp3|m4a|aac|wav|ogg|flac|mp4|webm|ogv|mov)$/i;

const references = (markdown) => new Set(
  [...markdown.matchAll(/\.\/media\/([0-9a-f-]{36}\.[a-z0-9]+)/gi)].map((match) => match[1].toLowerCase())
);

export const getRemovedMediaFiles = (previousMarkdown, markdown, uploadedMedia = []) => {
  const previous = references(previousMarkdown);
  const current = references(markdown);
  return [...new Set([...uploadedMedia, ...previous])]
    .filter((filename) => mediaFilePattern.test(filename) && !current.has(filename.toLowerCase()));
};
