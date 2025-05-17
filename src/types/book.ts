export interface ChapterEntry {
  title: string;
  estimatedPage: number; // Page number in the web preview
}

export interface Book {
  id: string; // Unique identifier for the book
  title: string;
  author: string;
  content: string;
  coverImage?: string | null; // base64 string for the image or URL
  tableOfContents?: ChapterEntry[];
  lastModified: number; // Timestamp of the last modification
}
