export interface ChapterEntry {
  title: string;
  estimatedPage: number; // Page number in the web preview
}

export type AuthorImagePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface Book {
  id: string; // Unique identifier for the book
  title: string;
  subtitle?: string;
  author: string;
  content: string;
  coverImage?: string | null; // base64 string for the image or URL
  authorImage?: string | null; // base64 string for the author's photo
  authorImagePosition?: AuthorImagePosition;
  tableOfContents?: ChapterEntry[];
  lastModified: number; // Timestamp of the last modification
}
