
export interface ChapterEntry {
  title: string;
  estimatedPage: number;
}

export type AuthorImagePosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type CoverTextPosition = 'top-left' | 'top-center' | 'top-right' | 
                                'middle-left' | 'middle-center' | 'middle-right' |
                                'bottom-left' | 'bottom-center' | 'bottom-right';

export interface Book {
  id: string; 
  title: string;
  subtitle?: string;
  author: string;
  editorial?: string;
  content: string; // Markdown content, images are placeholders like [Imagen: alt text]
  coverImage?: string | null; // Placeholder/Marker for session, actual image handled by user
  authorImage?: string | null; // Placeholder/Marker for session
  authorImagePosition?: AuthorImagePosition;
  titlePosition?: CoverTextPosition;
  subtitlePosition?: CoverTextPosition;
  editorialPosition?: CoverTextPosition;
  tableOfContents?: ChapterEntry[];
  lastModified: number; 
}

export interface FormattingOptions {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  previewBackgroundColor: string;
  pageBackgroundColor: string;
  previewPadding: number;
  lineHeight: number;
  pageNumberAlignment: 'left' | 'center' | 'right';
  tocPosition: 'start' | 'end';
  // firstLetterUppercase: boolean; // For later implementation if clarified
  // chapterTitleLineColor?: string; // For later implementation if clarified
}
