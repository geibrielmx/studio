
export interface ChapterEntry {
  title: string;
  estimatedPage: number;
}

export type AuthorImagePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

// Note: id and lastModified are no longer used for localStorage persistence of multiple books.
// They might be useful if individual TXT files adopt a metadata scheme, but for now, are simplified.
export interface Book {
  // id: string; // No longer needed for list management in localStorage
  title: string;
  subtitle?: string;
  author: string;
  content: string;
  coverImage?: string | null; // base64 string for the image or URL - session only
  authorImage?: string | null; // base64 string for the author's photo - session only
  authorImagePosition?: AuthorImagePosition;
  tableOfContents?: ChapterEntry[];
  // lastModified: number; // No longer tracked in this way
}
