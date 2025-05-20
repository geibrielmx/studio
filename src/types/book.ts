
export interface ChapterEntry { // For Table of Contents display
  title: string;
  estimatedPage: number;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
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
  coverFreeText?: string; 
  chapters: Chapter[]; 
  coverImage?: string | null; 
  authorImage?: string | null; 
  authorImagePosition?: AuthorImagePosition;
  titlePosition?: CoverTextPosition;
  subtitlePosition?: CoverTextPosition;
  editorialPosition?: CoverTextPosition;
  coverFreeTextPosition?: CoverTextPosition; 
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
  tocPosition: 'start' | 'end' | 'none'; 
  coverTitleFontSize?: number; // Added
  coverSubtitleFontSize?: number; // Added
}

