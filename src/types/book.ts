export interface ChapterEntry {
  title: string;
  estimatedPage: number; // Page number in the web preview
  // pdfPage?: number; // Actual page number in the generated PDF's content section
}

export interface Book {
  title: string;
  author: string;
  content: string;
  coverImage?: string | null; // base64 string for the image or URL
  tableOfContents?: ChapterEntry[];
}
