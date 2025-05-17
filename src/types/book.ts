export interface Book {
  title: string;
  author: string;
  content: string; 
  coverImage?: string | null; // base64 string for the image or URL
}
