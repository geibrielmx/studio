
"use client";

import type { ChangeEvent, CSSProperties } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Book, Chapter, ChapterEntry, AuthorImagePosition, CoverTextPosition, FormattingOptions } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { UploadCloud, BookIcon, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode, FilePlus, Trash2, ChevronLeft, ChevronRight, UserSquare2, FileSearch, Building, AlignLeft, AlignCenter, AlignRight, Feather, Edit3, PlusCircle, HelpCircle, BookCopy, Bold, Italic } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const APP_VERSION = "1.2.1";
const COPYRIGHT_NOTICE = `© ${new Date().getFullYear()} GaboGmx. Todos los derechos reservados.`;

const PAGE_CONTENT_TARGET_HEIGHT_PX = 680;
const PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX = 70;
const IMAGE_LINE_EQUIVALENT = 15;
const PAGE_BREAK_MARKER = '\\newpage';

const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v7';
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit for images

interface PagePreviewData {
  pageNumber: number;
  headerLeft: string;
  headerRight: string;
  contentElements: JSX.Element[];
  rawContentLines: string[];
  footerCenter: string;
  isStartOfChapter?: boolean;
  chapterTitle?: string;
  isForceBreak?: boolean;
}

const createInitialChapter = (): Chapter => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2,7),
  title: '',
  content: '',
});

const createInitialBook = (): Book => ({
  id: Date.now().toString(),
  title: '',
  subtitle: '',
  author: '',
  editorial: '',
  coverFreeText: '',
  chapters: [createInitialChapter()],
  coverImage: null,
  authorImage: null,
  authorImagePosition: 'bottom-right',
  titlePosition: 'middle-center',
  subtitlePosition: 'middle-center',
  editorialPosition: 'bottom-center',
  coverFreeTextPosition: 'bottom-center',
  lastModified: Date.now(),
  // Back Cover Defaults
  backCoverSynopsis: '',
  backCoverSynopsisPosition: 'middle-center',
  backCoverSlogan: '',
  backCoverSloganPosition: 'bottom-center',
  backCoverImage: null,
  backCoverImagePosition: 'middle-center',
  backCoverAuthorNamePosition: 'bottom-right',
  backCoverColor: 'hsl(var(--card))',
});

const initialFormattingOptions: FormattingOptions = {
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  textColor: 'hsl(var(--foreground))',
  previewBackgroundColor: 'hsl(var(--background))',
  pageBackgroundColor: 'hsl(var(--card))',
  previewPadding: 24,
  lineHeight: 1.6,
  pageNumberAlignment: 'center',
  tocPosition: 'start',
  coverTitleFontSize: 48,
  coverSubtitleFontSize: 28,
};


function createPageContentElements(
  lines: string[],
  pageKeyPrefix: string,
  formattingOptions: FormattingOptions
): { elements: JSX.Element[], chapterTitle?: string, isStartOfChapter?: boolean } {
  let isStartOfChapter = false;
  let chapterTitle: string | undefined = undefined;
  let firstContentParagraphOnPageForDropCap = true;

  const elements = lines.map((paragraph, index) => {
    if (paragraph.trim() === PAGE_BREAK_MARKER) {
      return <p key={`${pageKeyPrefix}-line-${index}`} className="hidden-page-break-marker"></p>;
    }

    let isChapterHeadingLine = false;
    if (paragraph.startsWith('## ')) {
      // Check if all preceding lines on this page are empty or page breaks
      if (lines.slice(0, index).every(l => l.trim() === '' || l.trim() === PAGE_BREAK_MARKER)) {
        isStartOfChapter = true;
        chapterTitle = paragraph.substring(3).trim();
      }
      isChapterHeadingLine = true;
    }

    const imageMatch = paragraph.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
    if (imageMatch) {
      const [, altText, imgSrc] = imageMatch;
      // If an image is the first content, don't apply drop cap logic later
      if (firstContentParagraphOnPageForDropCap && lines.slice(0, index).every(l => l.trim() === '' || l.trim() === PAGE_BREAK_MARKER)) {
        firstContentParagraphOnPageForDropCap = false;
      }
      return (
        <div key={`${pageKeyPrefix}-line-${index}`} className="my-3 md:my-4 text-center">
          <NextImage
            src={imgSrc}
            alt={altText || 'Imagen insertada'}
            width={300}
            height={200}
            className="max-w-full h-auto inline-block rounded shadow-md"
            data-ai-hint="illustration drawing"
            style={{
              maxWidth: `calc(100% - ${formattingOptions.previewPadding * 0}px)`, // Reduced padding effect for images
            }}
          />
          {altText && <p className="text-xs italic mt-1" style={{ opacity: 0.8 }}>{altText}</p>}
        </div>
      );
    } else if (paragraph.match(/!\[(.*?)\]\((.*?)\)/)) { // Placeholder for non-base64 images
        const [, altText] = paragraph.match(/!\[(.*?)\]\((.*?)\)/)!;
        if (firstContentParagraphOnPageForDropCap && lines.slice(0, index).every(l => l.trim() === '' || l.trim() === PAGE_BREAK_MARKER)) {
           firstContentParagraphOnPageForDropCap = false;
        }
        return <p key={`${pageKeyPrefix}-line-${index}`} className="my-1.5 md:my-2 italic text-muted-foreground text-center">[Imagen: {altText || 'Referencia de imagen externa'}]</p>;
    }

    let pClassName = `my-1.5 md:my-2 book-paragraph`;

    if (isChapterHeadingLine) {
      pClassName += ' chapter-heading font-bold text-xl md:text-2xl !text-left !indent-0 !pl-0 !pt-4 !pb-2 border-b-2 border-primary mb-4';
      if (firstContentParagraphOnPageForDropCap && lines.slice(0, index).every(l => l.trim() === '' || l.trim() === PAGE_BREAK_MARKER)) {
        firstContentParagraphOnPageForDropCap = false; // Chapter heading itself is not a drop cap target
      }
    } else if (paragraph.trim() !== '' && paragraph.trim() !== '&nbsp;') { // Only apply drop cap to non-empty, non-heading paragraphs
       // Only apply drop cap if it's the first actual content line on this page
      const isEffectivelyFirstContentLine = lines.slice(0, index)
        .every(l => l.trim() === '' || l.trim() === PAGE_BREAK_MARKER || l.startsWith('## '));

      if (firstContentParagraphOnPageForDropCap && isEffectivelyFirstContentLine) {
         pClassName += ' first-letter-capital';
         firstContentParagraphOnPageForDropCap = false;
      }
    }


    // Process Markdown for bold and italics
    const pContent = isChapterHeadingLine ? paragraph.substring(3).trim() : (paragraph.trim() === '' ? <>&nbsp;</> : paragraph
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/(\s|^)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3') // Italics with *
        .replace(/(\s|^)_(.*?)_(\s|$)/g, '$1<em>$2</em>$3') // Italics with _
    );

    if (typeof pContent === 'string') {
      return <p key={`${pageKeyPrefix}-line-${index}`} className={pClassName} dangerouslySetInnerHTML={{ __html: pContent }}></p>;
    }
    return <p key={`${pageKeyPrefix}-line-${index}`} className={pClassName}>{pContent}</p>;
  });
  return { elements, chapterTitle, isStartOfChapter };
}

function createPageObject(
  pageNumber: number,
  bookTitle: string,
  currentChapterTitleForHeader: string,
  lines: string[],
  formattingOptions: FormattingOptions,
  isForceBreak: boolean = false,
): PagePreviewData {
  const pageKeyPrefix = `page-${pageNumber}`;
  const { elements, chapterTitle, isStartOfChapter } = createPageContentElements(lines, pageKeyPrefix, formattingOptions);

  const displayBookTitle = bookTitle.trim() === '' ? '\u00A0' : bookTitle;
  const displayChapterTitle = currentChapterTitleForHeader.trim() === '' ? '\u00A0' : currentChapterTitleForHeader;

  return {
    pageNumber,
    headerLeft: displayBookTitle,
    headerRight: displayChapterTitle,
    contentElements: elements,
    rawContentLines: lines,
    footerCenter: `Página ${pageNumber}`,
    isStartOfChapter: isStartOfChapter,
    chapterTitle: chapterTitle,
    isForceBreak,
  };
}

// Helper function to get the full content string from chapters
function getFullContentString(chapters: Chapter[]): string {
  return chapters.map(chapter => `## ${chapter.title}\n${chapter.content}`).join('\n\n');
}

// Function to generate page previews based on content and formatting
function generatePagePreviews(
  book: Book,
  formattingOptions: FormattingOptions
): PagePreviewData[] {
  const output: PagePreviewData[] = [];
  const fullContent = getFullContentString(book.chapters || []);
  if (!fullContent && !book.title && !book.author) return output; // Ensure at least some identifying info or content

  const allLines = (fullContent || '').split('\n');
  const { fontSize, lineHeight } = formattingOptions;

  // Estimate lines per page based on available height and line height
  const actualContentAreaHeight = PAGE_CONTENT_TARGET_HEIGHT_PX - PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX;
  const estimatedLinePixelHeight = Math.max(1, fontSize * lineHeight);
  let linesPerPage = Math.max(1, Math.floor(actualContentAreaHeight / estimatedLinePixelHeight));

  let currentPageLines: string[] = [];
  let currentPageNumber = 1;
  let currentChapterForHeader = book.chapters?.[0]?.title || "";
  let linesAccumulatedOnCurrentPage = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isChapterHeading = line.startsWith('## ');
    const isManualPageBreak = line.trim() === PAGE_BREAK_MARKER;
    let lineCost = 1; // Default cost for a line
    if (/!\[(.*?)\]\(data:image\/.*?\)/.test(line)) { // Image lines cost more
      lineCost = IMAGE_LINE_EQUIVALENT;
    } else if (isChapterHeading) { // Chapter headings also cost more
      lineCost = 2;
    }

    // Handle manual page breaks
    if (isManualPageBreak) {
        if (currentPageLines.length > 0) { // Only push if there's content
             output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions, true));
             currentPageLines = [];
             linesAccumulatedOnCurrentPage = 0;
             currentPageNumber++;
        }
        // Skip the page break marker itself from content
        continue;
    }

    // Handle chapter headings specifically for pagination
    if (isChapterHeading) {
      // If there's content on the current page, and it's not just empty lines, start a new page for the chapter
      if (currentPageLines.length > 0 && linesAccumulatedOnCurrentPage > 0) { // Ensure previous page had some content
        output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
        currentPageLines = [];
        linesAccumulatedOnCurrentPage = 0;
        currentPageNumber++;
      }
      currentChapterForHeader = line.substring(3).trim(); // Update header for subsequent pages
      currentPageLines.push(line); // Add chapter heading to the new page
      linesAccumulatedOnCurrentPage += lineCost;

      // If this is the very last line and it's a chapter heading, push it as a page
      if (i === allLines.length - 1) {
         output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
         currentPageLines = []; // Clear for safety, though loop ends
      }
      continue; // Move to next line
    }

    // If adding the current line exceeds linesPerPage, create a new page
    if (linesAccumulatedOnCurrentPage + lineCost > linesPerPage && currentPageLines.length > 0) {
      output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
      currentPageLines = [];
      linesAccumulatedOnCurrentPage = 0;
      currentPageNumber++;
    }

    currentPageLines.push(line);
    linesAccumulatedOnCurrentPage += lineCost;
  }

  // Add any remaining lines to the last page
  if (currentPageLines.length > 0) {
    output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
  }

  // If after all processing, output is empty but there was *some* book data (title/author/content), create a single blank page
  if (output.length === 0 && (book.title || book.author || fullContent)) {
     output.push(createPageObject(1, book.title, currentChapterForHeader, [""], formattingOptions)); // Default to a single empty page
  }

  return output;
}


// Function to generate the Table of Contents
function generateTableOfContents(paginatedPreview: PagePreviewData[], bookChapters: Chapter[]): ChapterEntry[] {
  const toc: ChapterEntry[] = [];
  const chapterTitlesFromContent = new Set<string>();

  // First pass: get chapters and pages from paginated preview (most reliable for page numbers)
  paginatedPreview.forEach(page => {
    if (page.isStartOfChapter && page.chapterTitle !== undefined && !chapterTitlesFromContent.has(page.chapterTitle)) {
      toc.push({
        title: page.chapterTitle.trim() === '' ? '(Capítulo sin título)' : page.chapterTitle,
        estimatedPage: page.pageNumber,
      });
      chapterTitlesFromContent.add(page.chapterTitle);
    }
  });

  // Second pass: ensure all chapters from the book structure are included, even if not detected as `isStartOfChapter`
  // This can happen if a chapter's content starts immediately without a newline or if paginator logic missed it.
  bookChapters.forEach(bookChapter => {
    const cleanBookChapterTitle = bookChapter.title.trim();
    if (cleanBookChapterTitle !== '' && !chapterTitlesFromContent.has(cleanBookChapterTitle)) {
      // Try to find this chapter in the paginated content to estimate its page
      let foundPage = -1;
      for (const page of paginatedPreview) {
        if (page.rawContentLines.some(line => line.startsWith(`## ${cleanBookChapterTitle}`))) {
          foundPage = page.pageNumber;
          break;
        }
      }
      if (foundPage !== -1) {
        toc.push({
          title: cleanBookChapterTitle,
          estimatedPage: foundPage,
        });
        chapterTitlesFromContent.add(cleanBookChapterTitle);
      } else {
        // If not found in paginated content (e.g., empty chapter), add with a placeholder page
         toc.push({
          title: cleanBookChapterTitle,
          estimatedPage: 0, // Or handle differently, e.g., Infinity to sort last
        });
        chapterTitlesFromContent.add(cleanBookChapterTitle);
      }
    }
  });


  // Sort TOC entries by their estimated page number. Chapters not found in content (page 0) go to the end.
  toc.sort((a, b) => {
    if (a.estimatedPage === 0 && b.estimatedPage > 0) return 1; // Chapters not found in content go last
    if (b.estimatedPage === 0 && a.estimatedPage > 0) return -1;
    return a.estimatedPage - b.estimatedPage;
  });

  return toc;
}

export default function EscribaLibroApp() {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [currentBook, setCurrentBook] = useState<Book>(createInitialBook());
  const [formattingOptions, setFormattingOptions] = useState<FormattingOptions>(initialFormattingOptions);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(currentBook.chapters[0]?.id || null);

  const [activeTab, setActiveTab] = useState('editor');
  const [paginatedPreview, setPaginatedPreview] = useState<PagePreviewData[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [currentPreviewPageIndex, setCurrentPreviewPageIndex] = useState(0);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null); // For opening .txt files
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const chapterTextareaRef = useRef<HTMLTextAreaElement>(null);


  // Load formatting options from localStorage on mount
  const loadFormattingFromLocalStorage = useCallback(() => {
    try {
      const savedFormattingJson = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormattingJson) {
        const loadedOptions = JSON.parse(savedFormattingJson) as FormattingOptions;
        // Merge with defaults to ensure all keys are present even if saved version is older
        const mergedOptions = { ...initialFormattingOptions, ...loadedOptions };
        setFormattingOptions(mergedOptions);
      } else {
         // If nothing in localStorage, try to get initial colors from CSS variables
         if (typeof window !== 'undefined') {
          const computedStyle = window.getComputedStyle(document.documentElement);
          const fgColor = computedStyle.getPropertyValue('--foreground').trim();
          const cardBgColor = computedStyle.getPropertyValue('--card').trim();
          const bodyBgColor = computedStyle.getPropertyValue('--background').trim();

          const newInitialOptions = { ...initialFormattingOptions };
          if (fgColor) newInitialOptions.textColor = `hsl(${fgColor})`;
          if (bodyBgColor) newInitialOptions.previewBackgroundColor = `hsl(${bodyBgColor})`;
          if (cardBgColor) newInitialOptions.pageBackgroundColor = `hsl(${cardBgColor})`;
          setFormattingOptions(newInitialOptions);
        }
      }
    } catch (error) {
      console.error("Fallo al cargar opciones de formato desde localStorage", error);
      toast({ title: "Error de Carga", description: "No se pudieron cargar las opciones de formato.", variant: "destructive" });
    }
  }, [toast]);


  useEffect(() => {
    loadFormattingFromLocalStorage();
    setMounted(true);
  }, [loadFormattingFromLocalStorage]);


 // Save formatting options to localStorage when they change
 useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
      } catch (error) {
        console.error("Error saving formatting to localStorage:", error);
        // Consider a toast notification if saving fails, e.g., due to storage quota
        toast({
            title: 'Error al Guardar Formato',
            description: 'No se pudieron guardar las opciones de formato. Puede que el almacenamiento esté lleno.',
            variant: 'destructive',
        });
      }
    }
  }, [formattingOptions, mounted, toast]);


  // Regenerate paginated preview when book or formatting options change
  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(currentBook, formattingOptions);
      setPaginatedPreview(newPreview);

      // Adjust current preview page index if it's out of bounds after regeneration
      const newPageIndex = newPreview.length > 0 ? Math.min(currentPreviewPageIndex, newPreview.length - 1) : 0;
      if (newPageIndex !== currentPreviewPageIndex && newPreview.length > 0) { // ensure not to set to 0 if preview becomes empty
        setCurrentPreviewPageIndex(newPageIndex);
      } else if (newPreview.length === 0) { // if preview is empty, reset to 0
        setCurrentPreviewPageIndex(0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook, formattingOptions, mounted]); // currentPreviewPageIndex removed to prevent loops on its own change


  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4 md:p-8 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl md:text-3xl">Cargando Escribe Libro Pro...</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle saving the book to a .txt file
  const handleSaveBookAsTxt = () => {
    if (!currentBook) {
      toast({ title: "Error al Guardar", description: "No hay un libro activo para guardar.", variant: "destructive" });
      return;
    }

    // Construct the TXT content
    let txtContent = `Título: ${currentBook.title || ''}\n`;
    if(currentBook.subtitle) txtContent += `Subtítulo: ${currentBook.subtitle}\n`;
    txtContent += `Autor: ${currentBook.author || ''}\n`;
    if(currentBook.editorial) txtContent += `Editorial: ${currentBook.editorial}\n`;
    if(currentBook.coverFreeText) txtContent += `Texto Adicional Portada: ${currentBook.coverFreeText}\n`;
    txtContent += "\n";

    // Add back cover details if they exist
    if (currentBook.backCoverSynopsis) txtContent += `Sinopsis Contraportada: ${currentBook.backCoverSynopsis}\n`;
    if (currentBook.backCoverSlogan) txtContent += `Eslogan Contraportada: ${currentBook.backCoverSlogan}\n`;
    if (currentBook.backCoverSynopsis || currentBook.backCoverSlogan) txtContent += "\n";

    // Add Table of Contents (if enabled and exists)
    const tocForTxt = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
    if (tocForTxt.length > 0 && formattingOptions.tocPosition !== 'none') {
      txtContent += "Índice de Capítulos (estimado):\n";
      tocForTxt.forEach(entry => {
        const titleForToc = entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title;
        txtContent += `- ${titleForToc} (pág. ~${entry.estimatedPage})\n`;
      });
      txtContent += "\n";
    }

    txtContent += "## Contenido del Libro ##\n\n";

    // Add chapter content
    (currentBook.chapters || []).forEach(chapter => {
      const titleForChapter = chapter.title.trim() === '' ? '' : chapter.title; // Save empty title as empty
      txtContent += `## ${titleForChapter}\n`; // If title is empty, "## \n"
      // Replace base64 images with a placeholder for TXT export
      const chapterContentForTxt = (chapter.content || '').replace(/!\[(.*?)\]\(data:image\/.*?;base64,.*?\)/g, '[Imagen: $1]');
      txtContent += `${chapterContentForTxt}\n\n`;
    });

    const filename = `${(currentBook.title || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    const blob = new Blob([txtContent.trim()], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    setCurrentBook(prev => ({ ...prev, lastModified: Date.now() }));
    toast({
      title: "¡Libro Guardado!",
      description: `"${currentBook.title || 'Libro'}" se ha descargado como ${filename}. Las imágenes no se guardan en el TXT.`,
      duration: 4000,
    });
  };

  // Handle opening a book from a .txt file
  const handleOpenBookFromTxt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const newBook = createInitialBook(); // Start with a fresh book structure
          newBook.chapters = []; // Clear default chapter

          const lines = text.split('\n');
          let currentChapterTitle = ""; // Can be empty
          let currentChapterContent: string[] = [];
          let parsingContent = false; // Flag to indicate we are past headers and TOC
          let inHeaderSection = true; // Flag for parsing book metadata

          for (const line of lines) {
            if (inHeaderSection) {
              // Parse book metadata
              const titleMatch = line.match(/^Título:\s*(.*)/);
              if (titleMatch) { newBook.title = titleMatch[1].trim(); continue; }
              const subtitleMatch = line.match(/^Subtítulo:\s*(.*)/);
              if (subtitleMatch) { newBook.subtitle = subtitleMatch[1].trim(); continue; }
              const authorMatch = line.match(/^Autor:\s*(.*)/);
              if (authorMatch) { newBook.author = authorMatch[1].trim(); continue; }
              const editorialMatch = line.match(/^Editorial:\s*(.*)/);
              if (editorialMatch) { newBook.editorial = editorialMatch[1].trim(); continue; }
              const coverFreeTextMatch = line.match(/^Texto Adicional Portada:\s*(.*)/);
              if (coverFreeTextMatch) { newBook.coverFreeText = coverFreeTextMatch[1].trim(); continue; }
              const backCoverSynopsisMatch = line.match(/^Sinopsis Contraportada:\s*(.*)/);
                if (backCoverSynopsisMatch) { newBook.backCoverSynopsis = backCoverSynopsisMatch[1].trim(); continue; }
              const backCoverSloganMatch = line.match(/^Eslogan Contraportada:\s*(.*)/);
                if (backCoverSloganMatch) { newBook.backCoverSlogan = backCoverSloganMatch[1].trim(); continue; }

              // Transition to content parsing
              if (line.trim() === "## Contenido del Libro ##") {
                inHeaderSection = false;
                parsingContent = true;
                continue;
              } else if (line.startsWith('## ')) { // If a chapter starts before the "Contenido del Libro" marker
                inHeaderSection = false;
                parsingContent = true;
                // Fall through to parsing logic for the first chapter line
              }
            }

            if (parsingContent) {
              if (line.startsWith('## ')) {
                // Save previous chapter if it exists or if it's the first and has a title
                if (currentChapterContent.length > 0 || currentChapterTitle !== '' || newBook.chapters.length > 0) {
                  newBook.chapters.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                    title: currentChapterTitle, // Already trimmed from parsing
                    content: currentChapterContent.join('\n').trim(),
                  });
                }
                currentChapterTitle = line.substring(3).trim(); // Title can be empty
                currentChapterContent = [];
              } else {
                currentChapterContent.push(line);
              }
            }
          }

          // Add the last parsed chapter
          if (parsingContent || currentChapterContent.length > 0 || currentChapterTitle !== '') {
             newBook.chapters.push({
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                title: currentChapterTitle,
                content: currentChapterContent.join('\n').trim(),
              });
          }

          // If no chapters were parsed using "## " but there's content after headers (e.g., old format)
          if (newBook.chapters.length === 0 && !parsingContent) {
            // Try to find the start of the actual content, skipping headers and old TOC format
            let contentStartIndex = 0;
            for (let i=0; i < lines.length; i++) {
                if (!lines[i].match(/^(Título|Subtítulo|Autor|Editorial|Texto Adicional Portada|Sinopsis Contraportada|Eslogan Contraportada|Índice de Capítulos):\s*(.*)/) &&
                    !lines[i].startsWith("- ") && // Ignore TOC lines
                    lines[i].trim() !== ""
                   ) {
                    contentStartIndex = i;
                    break;
                }
                if (i === lines.length -1) contentStartIndex = lines.length; // If all lines are headers/TOC
            }
            const mainContent = lines.slice(contentStartIndex).join('\n');
            const firstChapter = createInitialChapter(); // title will be empty
            firstChapter.content = mainContent.trim();
            newBook.chapters.push(firstChapter);
          } else if (newBook.chapters.length === 0 ){ // Ensure at least one chapter if all parsing failed
             newBook.chapters.push(createInitialChapter());
          }

          // Reset image fields as they are not stored in TXT
          newBook.coverImage = null;
          newBook.authorImage = null;
          newBook.backCoverImage = null;
          newBook.lastModified = Date.now();

          setCurrentBook(newBook);
          setEditingChapterId(newBook.chapters[0]?.id || null);
          setActiveTab('editor');
          setCurrentPreviewPageIndex(0);
          toast({
            title: "Libro Cargado desde TXT",
            description: `"${newBook.title || 'Libro sin título'}" está listo. El contenido se ha formateado en capítulos. Sube imágenes manualmente si es necesario.`,
            duration: 5000,
          });
        } catch (error) {
          console.error("Error al parsear el archivo TXT:", error);
          toast({ title: "Error de Archivo", description: "No se pudo leer el formato del archivo TXT.", variant: "destructive" });
        }
      };
      reader.readAsText(file);
      if(event.target) event.target.value = ''; // Reset file input
    }
  };

  // Handle creating a new book
  const handleNewBook = () => {
    const newBook = createInitialBook();
    setCurrentBook(newBook);
    setEditingChapterId(newBook.chapters[0]?.id || null);
    setCurrentPreviewPageIndex(0);
    setActiveTab('editor');
    toast({
      title: "Nuevo Libro Creado",
      description: "El editor ha sido reiniciado. ¡Empieza tu nueva obra!",
      duration: 3000,
    });
  };

  // Handle changes to chapter content
  const handleChapterContentChange = (chapterId: string, newContent: string) => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => ch.id === chapterId ? { ...ch, content: newContent } : ch),
      lastModified: Date.now()
    }));
  };

  // Handle changes to chapter title
  const handleChapterTitleChange = (chapterId: string, newTitle: string) => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => ch.id === chapterId ? { ...ch, title: newTitle } : ch),
      lastModified: Date.now()
    }));
  };

  // Handle adding a new chapter
  const handleAddNewChapter = () => {
    const newChapter = createInitialChapter();
    setCurrentBook(prev => ({
      ...prev,
      chapters: [...prev.chapters, newChapter],
      lastModified: Date.now()
    }));
    setEditingChapterId(newChapter.id); // Set the new chapter as active for editing
    setActiveTab('editor'); // Switch to editor tab if not already there
  };

  // Handle deleting a chapter
  const handleDeleteChapter = (chapterIdToDelete: string) => {
    setCurrentBook(prev => {
      const updatedChapters = prev.chapters.filter(ch => ch.id !== chapterIdToDelete);
      // If all chapters are deleted, add a new default one
      if (updatedChapters.length === 0) {
        const firstChapter = createInitialChapter();
        updatedChapters.push(firstChapter);
        setEditingChapterId(firstChapter.id);
      } else {
         // If the deleted chapter was the one being edited, select the first available chapter
         setEditingChapterId(prevEditingId => {
          if (prevEditingId === chapterIdToDelete) {
            return updatedChapters[0]?.id || null;
          }
          return prevEditingId;
        });
      }

      return {
        ...prev,
        chapters: updatedChapters,
        lastModified: Date.now()
      };
    });
    toast({ title: "Capítulo Eliminado", description: "El capítulo ha sido eliminado.", duration: 2000 });
  };


  // Handle changes to book details (title, author, etc.)
  const handleBookDetailsChange = (
    field: keyof Pick<Book, 'title' | 'author' | 'subtitle' | 'editorial' | 'coverFreeText' | 'backCoverSynopsis' | 'backCoverSlogan' | 'backCoverColor'>,
    value: string
    ) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };

  // Handle changes to cover text field positions
  const handleCoverTextFieldChange = (
    field: keyof Pick<Book, 'titlePosition' | 'subtitlePosition' | 'editorialPosition' | 'coverFreeTextPosition' |
                           'backCoverSynopsisPosition' | 'backCoverSloganPosition' | 'backCoverImagePosition' | 'backCoverAuthorNamePosition'>,
    value: CoverTextPosition
    ) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };

  // Handle changes to author image position
  const handleAuthorImagePositionChange = (value: AuthorImagePosition) => {
    setCurrentBook(prev => ({ ...prev, authorImagePosition: value, lastModified: Date.now() }));
  };

  // Generic file reader with size check
  const handleFileRead = (file: File, callback: (result: string) => void) => {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast({
        title: "Imagen Demasiado Grande",
        description: `La imagen seleccionada (${(file.size / (1024*1024)).toFixed(1)}MB) excede el límite de ${MAX_IMAGE_SIZE_BYTES / (1024*1024)}MB. Intenta con una de menor tamaño.`,
        variant: "destructive",
        duration: 7000
      });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
    };
    reader.onerror = () => {
        toast({ title: "Error al Leer Archivo", description: "No se pudo leer el archivo de imagen.", variant: "destructive"});
    }
    reader.readAsDataURL(file);
  };

  // Handle cover image upload
  const handleCoverImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, coverImage: base64Image, lastModified: Date.now() }));
      });
       if(event.target) event.target.value = ''; // Reset file input
    }
  };

  // Handle author image upload
  const handleAuthorImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, authorImage: base64Image, lastModified: Date.now() }));
      });
       if(event.target) event.target.value = '';
    }
  };

  // Handle back cover image upload
  const handleBackCoverImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, backCoverImage: base64Image, lastModified: Date.now() }));
      });
       if(event.target) event.target.value = ''; // Reset file input
    }
  };

  // Handle inserting an image into chapter content
  const handleImageInsertToContent = (event: ChangeEvent<HTMLInputElement>) => {
    if (!editingChapterId) {
        toast({title: "Sin Capítulo Seleccionado", description: "Por favor, selecciona un capítulo para insertar la imagen.", variant: "destructive"});
        return;
    }
    if (event.target.files && event.target.files[0]) {
      const imageName = event.target.files[0].name.split('.')[0] || 'imagen'; // Use file name as alt text
      handleFileRead(event.target.files[0], (base64Image) => {
        const imageMarkdown = `\n![${imageName}](${base64Image})\n`; // Add newlines for better separation

        setCurrentBook(prev => {
            const targetChapter = prev.chapters.find(ch => ch.id === editingChapterId);
            if (!targetChapter) return prev;
            const newChapterContent = (targetChapter.content || '') + imageMarkdown;

            return {
                ...prev,
                chapters: prev.chapters.map(ch => ch.id === editingChapterId ? {...ch, content: newChapterContent} : ch),
                lastModified: Date.now()
            }
        });
        toast({title: "Imagen Insertada", description: "La imagen se añadió al contenido del capítulo actual.", duration: 3000});
      });
       if(event.target) event.target.value = '';
    }
  };

  // Handle changes to formatting options
  const handleFormattingChange = (field: keyof FormattingOptions, value: string | number | boolean) => {
    setFormattingOptions(prev => ({ ...prev, [field]: value }));
  };

  // Handle changing the preview page
  const handleChangePreviewPage = (direction: 'next' | 'prev') => {
    setIsPageTransitioning(true);
    setTimeout(() => {
      setCurrentPreviewPageIndex(prev => {
        const newIndex = direction === 'next' ? prev + 1 : prev - 1;
        const totalPages = paginatedPreview.length;
        if (totalPages === 0) return 0; // Should not happen if buttons are disabled
        return Math.max(0, Math.min(newIndex, totalPages - 1));
      });
      setIsPageTransitioning(false);
    }, 150); // Short delay for transition effect
  };


  // CSS styles for the simulated page in the preview
  const simulatedPageStyle: CSSProperties = {
    width: '100%',
    maxWidth: '500px', // Fixed max width for consistency
    minHeight: `${PAGE_CONTENT_TARGET_HEIGHT_PX}px`, // Ensure consistent height
    padding: `${formattingOptions.previewPadding}px`,
    color: formattingOptions.textColor,
    backgroundColor: formattingOptions.pageBackgroundColor,
    fontFamily: formattingOptions.fontFamily,
    position: 'relative', // For header/footer positioning
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', // Enhanced shadow for depth
    borderRadius: 'var(--radius)', // Use theme radius
    overflow: 'hidden', // Ensure content stays within bounds
  };

  // Helper function to get Tailwind text alignment class
  const getTextAlignClass = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'text-center';
    if (position.includes('left')) return 'text-left';
    if (position.includes('right')) return 'text-right';
    return 'text-center';
  };

  // Helper function to get Tailwind flex vertical alignment class
  const getVerticalAlignClass = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'justify-center'; // Default to center
    if (position.startsWith('top')) return 'justify-start';
    if (position.startsWith('bottom')) return 'justify-end';
    return 'justify-center'; // Default for 'middle-' positions
  };


  // Function to create the HTML for a single PDF page
  const createPdfPageHtml = (
    pageData: PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[]; pageNumberForFooter: number } | { type: 'cover' } | { type: 'backCover' },
    isToc: boolean = false,
    isCover: boolean = false,
    isBackCover: boolean = false,
  ): HTMLDivElement => {
    const pageDiv = document.createElement('div');
    const pdfPageWidthPx = 750; // A bit wider for PDF rendering relative to preview
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; // A4 aspect ratio approximation

    // Base styles for all PDF pages
    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.height = `${pdfPageHeightPx}px`; // Fixed height for html2canvas
    pageDiv.style.padding = (isCover || isBackCover) ? '0px' : `${formattingOptions.previewPadding * 1.5}px`; // More padding for PDF
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize * 1.2}px`; // Slightly larger font for PDF
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = (isCover || isBackCover) ? (isBackCover ? (currentBook.backCoverColor || formattingOptions.pageBackgroundColor) : formattingOptions.pageBackgroundColor) : formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.position = 'relative'; // For absolute positioning of elements within
    pageDiv.style.overflow = 'hidden'; // Prevent content overflow issues

    const primaryColorVal = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();


    if (isCover) {
        // Cover Image as Background
        if (currentBook.coverImage) {
            const img = document.createElement('img');
            img.src = currentBook.coverImage;
            img.style.position = 'absolute';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover'; // Cover the entire area
            img.style.zIndex = '1';
            pageDiv.appendChild(img);
        }

        // Text Overlay for Cover
        const textOverlay = document.createElement('div');
        textOverlay.style.position = 'absolute';
        textOverlay.style.inset = '0'; // Cover the whole pageDiv
        textOverlay.style.display = 'flex';
        textOverlay.style.flexDirection = 'column';
        textOverlay.style.padding = '40px'; // Consistent padding
        textOverlay.style.background = currentBook.coverImage ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0) 70%)' : 'transparent'; // Gradient for readability if image exists
        textOverlay.style.zIndex = '2'; // Above the image
        textOverlay.style.color = currentBook.coverImage ? 'white' : formattingOptions.textColor; // Text color contrast

        const createTextContainer = (textPos: CoverTextPosition | undefined, isMiddleGrow?: boolean) => {
            const container = document.createElement('div');
            container.style.width = '100%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column'; // Stack text elements if multiple in one container
            container.style.textAlign = getTextAlignClass(textPos).replace('text-', '') as any;
            container.style.justifyContent = getVerticalAlignClass(textPos).replace('justify-', '') as any;
            if (isMiddleGrow && textPos?.startsWith('middle')) container.style.flexGrow = '1'; // Allow middle section to expand
            return container;
        }

        const titleContainer = createTextContainer(currentBook.titlePosition, true);
        const titleEl = document.createElement('h1');
        titleEl.textContent = currentBook.title;
        titleEl.style.fontSize = `${formattingOptions.coverTitleFontSize || 48}px`; // Use configured or default
        titleEl.style.fontWeight = 'bold';
        titleEl.style.textShadow = currentBook.coverImage ? '2px 2px 4px rgba(0,0,0,0.7)' : 'none';
        titleEl.style.marginBottom = '15px';
        titleContainer.appendChild(titleEl);
        textOverlay.appendChild(titleContainer);

        if (currentBook.subtitle) {
            const subtitleContainer = createTextContainer(currentBook.subtitlePosition, !currentBook.titlePosition?.startsWith('middle'));
            const subtitleEl = document.createElement('h2');
            subtitleEl.textContent = currentBook.subtitle;
            subtitleEl.style.fontSize = `${formattingOptions.coverSubtitleFontSize || 28}px`;
            subtitleEl.style.fontWeight = 'normal';
            subtitleEl.style.fontStyle = 'italic';
            subtitleEl.style.textShadow = currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.6)' : 'none';
            subtitleEl.style.marginBottom = '30px'; // More space after subtitle
            subtitleContainer.appendChild(subtitleEl);
            textOverlay.appendChild(subtitleContainer);
        }

        if (currentBook.coverFreeText) {
            const freeTextContainer = createTextContainer(currentBook.coverFreeTextPosition, !(currentBook.titlePosition?.startsWith('middle') || currentBook.subtitlePosition?.startsWith('middle')));
            const freeTextEl = document.createElement('p');
            freeTextEl.textContent = currentBook.coverFreeText;
            freeTextEl.style.fontSize = '18px'; // Standard size for free text
            freeTextEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
            freeTextEl.style.marginTop = '15px'; // Space before free text if not top
            freeTextContainer.appendChild(freeTextEl);
            textOverlay.appendChild(freeTextContainer);
        }

        // Container for elements at the very bottom (Author name, potentially Editorial)
        const bottomTextContainer = document.createElement('div');
        bottomTextContainer.style.width = '100%';
        bottomTextContainer.style.display = 'flex';
        bottomTextContainer.style.flexDirection = 'column';
        bottomTextContainer.style.justifyContent = 'flex-end'; // Pushes content to bottom
        bottomTextContainer.style.flexGrow = '1'; // Takes remaining space

        const authorNameEl = document.createElement('p');
        authorNameEl.textContent = currentBook.author;
        authorNameEl.style.fontSize = '24px';
        authorNameEl.style.textAlign = 'center'; // Default author name to center if not with photo
        authorNameEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
        if (!currentBook.authorImage) { // Add padding if no author image and editorial is not at bottom center
            if (currentBook.editorialPosition !== 'bottom-center') {
                authorNameEl.style.paddingBottom = '20px';
            }
        }
        bottomTextContainer.appendChild(authorNameEl);


        if (currentBook.editorial) {
            const editorialContainer = createTextContainer(currentBook.editorialPosition);
            // Position editorial absolutely based on its setting
            editorialContainer.style.position = 'absolute';
            editorialContainer.style.left = '0'; // Take full width for alignment
            editorialContainer.style.padding = '0 40px'; // Match textOverlay padding
            editorialContainer.style.boxSizing = 'border-box';

            const editorialVerticalAlign = getVerticalAlignClass(currentBook.editorialPosition);
            if (editorialVerticalAlign === 'justify-start') editorialContainer.style.top = '40px';
            else if (editorialVerticalAlign === 'justify-end') editorialContainer.style.bottom = '40px';
            else { // Middle
                editorialContainer.style.top = '50%';
                editorialContainer.style.transform = 'translateY(-50%)';
            }

            const editorialEl = document.createElement('p');
            editorialEl.textContent = currentBook.editorial;
            editorialEl.style.fontSize = '18px';
            editorialEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
            editorialContainer.appendChild(editorialEl);
            if(currentBook.editorialPosition?.startsWith('bottom') && currentBook.editorialPosition?.includes('center')){
                bottomTextContainer.appendChild(editorialContainer) // If bottom-center, group with author name
            } else {
                 textOverlay.appendChild(editorialContainer); // Otherwise, add as separate positioned element
            }
        }
         textOverlay.appendChild(bottomTextContainer); // Add the container for bottom-aligned elements
        pageDiv.appendChild(textOverlay);


        // Author Image (if exists)
        if (currentBook.authorImage) {
            const authorPhotoContainer = document.createElement('div');
            authorPhotoContainer.style.position = 'absolute'; // Positioned relative to pageDiv
            authorPhotoContainer.style.zIndex = '3'; // Above text overlay
            authorPhotoContainer.style.width = '120px'; // Fixed width for photo container
            authorPhotoContainer.style.textAlign = 'center';

            const pos = currentBook.authorImagePosition || 'bottom-right';
            if (pos === 'bottom-right') { authorPhotoContainer.style.bottom = '30px'; authorPhotoContainer.style.right = '30px'; }
            else if (pos === 'bottom-left') { authorPhotoContainer.style.bottom = '30px'; authorPhotoContainer.style.left = '30px'; }
            else if (pos === 'top-right') { authorPhotoContainer.style.top = '30px'; authorPhotoContainer.style.right = '30px'; }
            else if (pos === 'top-left') { authorPhotoContainer.style.top = '30px'; authorPhotoContainer.style.left = '30px'; }

            const authorImg = document.createElement('img');
            authorImg.src = currentBook.authorImage;
            authorImg.style.width = '100px'; // Image size
            authorImg.style.height = '100px';
            authorImg.style.objectFit = 'cover';
            authorImg.style.borderRadius = '4px'; // Slightly rounded corners
            authorImg.style.border = currentBook.coverImage ? '3px solid white' : `3px solid ${formattingOptions.textColor}`;
            authorImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
            authorPhotoContainer.appendChild(authorImg);

            const authorPhotoNameEl = document.createElement('p'); // Name below photo
            authorPhotoNameEl.textContent = currentBook.author; // Use the book's author name
            authorPhotoNameEl.style.fontSize = '16px';
            authorPhotoNameEl.style.color = currentBook.coverImage ? 'white' : formattingOptions.textColor;
            authorPhotoNameEl.style.marginTop = '8px';
            authorPhotoNameEl.style.textShadow = currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.8)' : 'none';
            authorPhotoContainer.appendChild(authorPhotoNameEl);
            pageDiv.appendChild(authorPhotoContainer); // Add photo container to the page
        }

    } else if (isBackCover) {
        pageDiv.style.backgroundColor = currentBook.backCoverColor || formattingOptions.pageBackgroundColor;
        pageDiv.style.color = currentBook.backCoverImage ? 'white' : formattingOptions.textColor; // Contrast with background or image

        if (currentBook.backCoverImage) {
            const img = document.createElement('img');
            img.src = currentBook.backCoverImage;
            img.style.position = 'absolute';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.zIndex = '1';
            pageDiv.appendChild(img);
        }

        const textOverlay = document.createElement('div');
        textOverlay.style.position = 'absolute';
        textOverlay.style.inset = '0';
        textOverlay.style.display = 'flex';
        textOverlay.style.flexDirection = 'column';
        textOverlay.style.padding = '40px';
        textOverlay.style.zIndex = '2';
        textOverlay.style.color = currentBook.backCoverImage ? 'white' : formattingOptions.textColor; // Ensure text is visible
        textOverlay.style.background = currentBook.backCoverImage ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 100%)' : 'transparent';


        // Helper for back cover text elements
        const createTextContainer = (textPos: CoverTextPosition | undefined) => {
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.width = `calc(100% - 80px)`; // Respecting padding
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            const textAlign = getTextAlignClass(textPos).replace('text-', '');

            container.style.textAlign = textAlign as any;

            // Vertical positioning
            if (textPos?.startsWith('top')) container.style.top = '40px';
            else if (textPos?.startsWith('bottom')) container.style.bottom = '40px';
            else { // Middle
                 container.style.top = '50%';
                 container.style.transform = 'translateY(-50%)';
            }

            // Horizontal positioning based on text-align
            if (textPos?.includes('left')) container.style.left = '40px';
            else if (textPos?.includes('right')) {
                container.style.right = '40px';
                if(textAlign === 'center') container.style.left = '40px'; // Center needs left to be set for full width
            } else { // Center
                container.style.left = '40px'; // Full width for centering
            }
            return container;
        };

        if (currentBook.backCoverSynopsis) {
            const synopsisContainer = createTextContainer(currentBook.backCoverSynopsisPosition);
            const synopsisEl = document.createElement('p');
            synopsisEl.innerHTML = currentBook.backCoverSynopsis.replace(/\n/g, '<br>'); // Preserve line breaks
            synopsisEl.style.fontSize = `${formattingOptions.fontSize * 1.1}px`;
            synopsisEl.style.textShadow = currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none';
            synopsisContainer.appendChild(synopsisEl);
            textOverlay.appendChild(synopsisContainer);
        }

        if (currentBook.backCoverSlogan) {
            const sloganContainer = createTextContainer(currentBook.backCoverSloganPosition);
            const sloganEl = document.createElement('p');
            sloganEl.textContent = currentBook.backCoverSlogan;
            sloganEl.style.fontSize = `${formattingOptions.fontSize * 1.3}px`;
            sloganEl.style.fontWeight = 'bold';
            sloganEl.style.fontStyle = 'italic';
            sloganEl.style.textShadow = currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none';
            sloganContainer.appendChild(sloganEl);
            textOverlay.appendChild(sloganContainer);
        }

        if (currentBook.author) { // Using the main author field for back cover too
            const authorContainer = createTextContainer(currentBook.backCoverAuthorNamePosition);
            const authorEl = document.createElement('p');
            authorEl.textContent = currentBook.author;
            authorEl.style.fontSize = `${formattingOptions.fontSize * 1}px`;
            authorEl.style.textShadow = currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none';
            authorContainer.appendChild(authorEl);
            textOverlay.appendChild(authorContainer);
        }

        // If back cover image is not set as full background but as an element
        if (currentBook.backCoverImage && currentBook.backCoverImagePosition && !currentBook.backCoverImagePosition.includes("background") && currentBook.backCoverImagePosition !== "middle-center" ) { // 'middle-center' implies background usage
             const imageContainer = createTextContainer(currentBook.backCoverImagePosition);
             const img = document.createElement('img');
             img.src = currentBook.backCoverImage; // Assume this is a valid Data URI or URL
             img.style.maxWidth = '60%';
             img.style.maxHeight = '250px'; // Limit image height
             img.style.height = 'auto';
             img.style.margin = getTextAlignClass(currentBook.backCoverImagePosition) === 'text-center' ? '0 auto' : '0';
             if (getTextAlignClass(currentBook.backCoverImagePosition) === 'text-left') img.style.marginLeft = '0';
             if (getTextAlignClass(currentBook.backCoverImagePosition) === 'text-right') img.style.marginRight = '0';
             img.style.borderRadius = '4px';
             img.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
             imageContainer.appendChild(img);
             textOverlay.appendChild(imageContainer);
        }


        pageDiv.appendChild(textOverlay);

    } else if (isToc && 'type' in pageData && pageData.type === 'toc') {
      // Table of Contents Page
      const tocHeader = document.createElement('h2');
      tocHeader.textContent = "Índice";
      tocHeader.style.textAlign = 'center';
      tocHeader.style.fontSize = `${formattingOptions.fontSize * 2.2}px`; // Larger title for TOC
      tocHeader.style.fontWeight = 'bold';
      tocHeader.style.margin = `${formattingOptions.fontSize * 1.5}px 0`;
      tocHeader.style.paddingBottom = `${formattingOptions.fontSize * 0.5}px`;
      tocHeader.style.borderBottom = `1px solid ${formattingOptions.textColor}`;
      pageDiv.appendChild(tocHeader);

      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = `0 ${formattingOptions.previewPadding * 0.5}px`; // Indent TOC entries
      ul.style.flexGrow = '1'; // Allow TOC to fill space
      ul.style.marginTop = `${formattingOptions.fontSize}px`;

      pageData.entries.forEach(entry => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'baseline';
        li.style.padding = `${formattingOptions.fontSize * 0.5}px 0`; // Spacing for entries
        li.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.4)`; // Dotted line for entries
        li.style.fontSize = `${formattingOptions.fontSize * 1.1}px`; // Slightly larger font for TOC entries

        const titleSpan = document.createElement('span');
        titleSpan.textContent = entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title;
        titleSpan.style.marginRight = '15px'; // Space between title and page number
        titleSpan.style.flexGrow = '1'; // Allow title to take available space

        const pageSpan = document.createElement('span');
        pageSpan.textContent = String(entry.estimatedPage);
        pageSpan.style.marginLeft = '15px'; // Ensure page number is distinct
        pageSpan.style.fontWeight = 'normal'; // Normal weight for page numbers

        li.appendChild(titleSpan);
        li.appendChild(pageSpan);
        ul.appendChild(li);
      });
      pageDiv.appendChild(ul);

      // Footer for TOC page
      const footerDiv = document.createElement('div');
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`;
      footerDiv.style.opacity = '0.8';
      footerDiv.style.paddingTop = '8px';
      footerDiv.style.borderTop = `1px solid hsl(var(--border))`;
      footerDiv.style.marginTop = 'auto'; // Push to bottom
      footerDiv.style.flexShrink = '0';
      footerDiv.textContent = `Página ${pageData.pageNumberForFooter}`; // Use the passed page number

      switch (formattingOptions.pageNumberAlignment) {
        case 'left': footerDiv.style.textAlign = 'left'; break;
        case 'right': footerDiv.style.textAlign = 'right'; break;
        default: footerDiv.style.textAlign = 'center'; break;
      }
      pageDiv.appendChild(footerDiv);


    } else if (!isToc && !isCover && !isBackCover && 'rawContentLines' in pageData) {
      // Regular Content Page
      const typedPageData = pageData as PagePreviewData;

      // Header
      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; // Smaller font for header
      headerDiv.style.opacity = '0.8';
      headerDiv.style.paddingBottom = '8px'; // Space below header
      headerDiv.style.borderBottom = `1px solid hsl(var(--border))`;
      headerDiv.style.marginBottom = '20px'; // Space above content
      headerDiv.style.flexShrink = '0'; // Prevent shrinking
      const headerLeft = document.createElement('span');
      headerLeft.innerHTML = typedPageData.headerLeft.trim() === '' ? '&nbsp;' : typedPageData.headerLeft;
      const headerRight = document.createElement('span');
      headerRight.innerHTML = typedPageData.headerRight.trim() === '' ? '&nbsp;' : typedPageData.headerRight;
      headerDiv.appendChild(headerLeft);
      headerDiv.appendChild(headerRight);
      pageDiv.appendChild(headerDiv);

      // Content Area
      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1'; // Allow content to fill space
      contentAreaDiv.style.overflowY = 'hidden'; // Clip content if it overflows (shouldn't with proper pagination)
      let isFirstParagraphOnPdfPage = true; // For drop cap logic on PDF page

      typedPageData.rawContentLines.forEach((line) => {
        if (line.trim() === PAGE_BREAK_MARKER) return; // Skip page break markers

        const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = `${formattingOptions.fontSize * 1}px 0`; // Consistent image margin
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '85%'; // Max width for content images
          img.style.maxHeight = '400px'; // Max height for content images
          img.style.height = 'auto';
          img.style.borderRadius = '4px';
          img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          imgContainer.appendChild(img);
          if (altText) {
            const caption = document.createElement('p');
            caption.textContent = altText;
            caption.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; caption.style.fontStyle = 'italic'; caption.style.opacity = '0.8'; caption.style.marginTop = '0.4em'; caption.style.textAlign = 'center';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
          isFirstParagraphOnPdfPage = false; // Image resets drop cap
        } else {
          const p = document.createElement('p');
          let isChapterHeading = line.startsWith('## ');

          if (line.match(/!\[(.*?)\]\((.*?)\)/)) { // Non-base64 image placeholder
             const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
             p.innerHTML = `<span style="font-style: italic; color: #888; text-align: center; display: block;">[Imagen: ${altText || 'Referencia de imagen externa'}]</span>`;
             isFirstParagraphOnPdfPage = false;
          } else {
            let processedLine = line.trim() === '' ? '&nbsp;' : line;
            // Apply Markdown for bold and italics
            processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            processedLine = processedLine.replace(/(\s|^)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3');
            processedLine = processedLine.replace(/(\s|^)_(.*?)_(\s|$)/g, '$1<em>$2</em>$3');

            if (isChapterHeading) {
              p.style.fontSize = `${formattingOptions.fontSize * 1.8}px`; // Larger for chapter titles
              p.style.fontWeight = 'bold';
              p.style.marginTop = `${formattingOptions.fontSize * 1.5}px`; // More space above chapter title
              p.style.marginBottom = `${formattingOptions.fontSize * 0.8}px`;
              p.style.textAlign = 'left'; // Chapter titles align left
              p.style.textIndent = '0'; // No indent for chapter titles
              p.textContent = line.substring(3).trim();
              isFirstParagraphOnPdfPage = false; // Chapter heading resets drop cap for next paragraph
            } else if (line.trim() !== '' && line.trim() !== '&nbsp;') {
                // Apply drop cap logic based on if this is the first actual paragraph on the PDF page
                const isEffectivelyFirstContentLineForPdf = contentAreaDiv.children.length === 0 ||
                   Array.from(contentAreaDiv.children).every(child => (child as HTMLElement).tagName !== 'P' || (child as HTMLElement).innerHTML === '&nbsp;');

                if (isFirstParagraphOnPdfPage && isEffectivelyFirstContentLineForPdf) {
                    // Apply drop cap style manually for PDF
                    p.style.textIndent = '0';
                    const firstLetter = processedLine.charAt(0);
                    const restOfLine = processedLine.substring(1);
                    const firstLetterSpan = document.createElement('span');
                    firstLetterSpan.textContent = firstLetter;
                    firstLetterSpan.style.fontSize = `${formattingOptions.fontSize * 2.8}px`;
                    firstLetterSpan.style.fontWeight = 'bold';
                    firstLetterSpan.style.float = 'left';
                    firstLetterSpan.style.lineHeight = '0.75';
                    firstLetterSpan.style.marginRight = '0.03em';
                    firstLetterSpan.style.paddingTop = '0.05em';
                    firstLetterSpan.style.color = `hsl(${primaryColorVal})`;
                    p.appendChild(firstLetterSpan);
                    p.appendChild(document.createTextNode(restOfLine));
                    isFirstParagraphOnPdfPage = false;
                } else {
                    p.innerHTML = processedLine;
                    p.style.textIndent = '1.5em'; // Standard paragraph indent
                }
            } else { // Empty line
                p.innerHTML = '&nbsp;';
                p.style.textIndent = '0'; // No indent for empty lines
            }
          }
          p.style.margin = `${formattingOptions.fontSize * 0.4}px 0`; // Consistent paragraph margin
          p.style.textAlign = 'justify'; // Justify text for book look
          contentAreaDiv.appendChild(p);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      // Footer
      const footerDiv = document.createElement('div');
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`;
      footerDiv.style.opacity = '0.8';
      footerDiv.style.paddingTop = '8px';
      footerDiv.style.borderTop = `1px solid hsl(var(--border))`;
      footerDiv.style.marginTop = 'auto'; // Push to bottom
      footerDiv.style.flexShrink = '0'; // Prevent shrinking
      footerDiv.textContent = typedPageData.footerCenter; // Page number text
      // Align page number based on settings
      switch (formattingOptions.pageNumberAlignment) {
        case 'left': footerDiv.style.textAlign = 'left'; break;
        case 'right': footerDiv.style.textAlign = 'right'; break;
        default: footerDiv.style.textAlign = 'center'; break;
      }
      pageDiv.appendChild(footerDiv);
    }
    return pageDiv;
  };


  // Handle exporting the book to PDF
  const handleExportToPdf = async () => {
    if (!currentBook || (!getFullContentString(currentBook.chapters) && !currentBook.title && !currentBook.author)) {
       toast({ title: "Libro Vacío", description: "No hay contenido para exportar a PDF.", variant: "destructive" });
       return;
    }
    setIsExportingPdf(true);
    toast({ title: "Exportación a PDF Iniciada", description: "Generando tu libro, por favor espera..." });

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' }); // A4 standard
    const pdfWidthPt = pdf.internal.pageSize.getWidth();
    const pdfHeightPt = pdf.internal.pageSize.getHeight();

    // Create a temporary offscreen container for rendering pages to canvas
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed'; // Offscreen
    tempContainer.style.left = '-9999px'; // Way offscreen
    tempContainer.style.top = '-9999px'; // Way offscreen
    tempContainer.style.width = '750px'; // Consistent width for rendering
    tempContainer.style.height = `${750 * 1.414}px`; // Consistent height for rendering
    tempContainer.style.zIndex = '-1'; // Ensure it's not visible
    tempContainer.style.opacity = '0'; // Ensure it's not visible
    document.body.appendChild(tempContainer);


    let pagesToRender: (PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[]; pageNumberForFooter: number } | { type: 'cover' } | { type: 'backCover' })[] = [];
    let pdfPageCounter = 0; // This will be the actual page number in the PDF document

    // 1. Cover Page (if any details exist)
    if (currentBook.coverImage || currentBook.title || currentBook.author) {
      pdfPageCounter++; // Increment physical PDF page counter
      pagesToRender.push({ type: 'cover' });
    }

    // Content pages generation for TOC page number calculation *before* adding TOC itself
    const contentPagesForPdfGeneration = generatePagePreviews(currentBook, formattingOptions);

    // Calculate how many pages the TOC will take if it's at the start (usually 1, could be more for very long TOCs)
    let tocPageCountIfStart = (currentBook.chapters && currentBook.chapters.length > 0 && formattingOptions.tocPosition === 'start') ? 1 : 0;
    // Content pages will start after cover and potentially after TOC if it's at the start
    const contentStartPdfPageNumber = pdfPageCounter + tocPageCountIfStart + 1;

    // 2. Table of Contents (if at start and chapters exist)
    if (formattingOptions.tocPosition === 'start' && currentBook.chapters && currentBook.chapters.length > 0 && formattingOptions.tocPosition !== 'none') {
      pdfPageCounter++; // Increment physical PDF page counter
      const tocPdfPageNumberForFooter = pdfPageCounter; // TOC itself also gets a page number in PDF
      const tocEntriesForPdf = generateTableOfContents(contentPagesForPdfGeneration, currentBook.chapters)
        .map(entry => ({
          ...entry,
          estimatedPage: contentStartPdfPageNumber + entry.estimatedPage -1 // Adjust entry.page to be relative to PDF start
        }));
      pagesToRender.push({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter });
    }

    // 3. Content Pages
    contentPagesForPdfGeneration.forEach(pageData => {
      pdfPageCounter++; // Increment physical PDF page counter
      const actualContentPageNumberInPdf = contentStartPdfPageNumber + pageData.pageNumber -1;
      // Update the footer text to reflect the actual page number in the PDF's content section
      pagesToRender.push({ ...pageData, footerCenter: `Página ${actualContentPageNumberInPdf}` });
    });

    // 4. Table of Contents (if at end, before back cover, and chapters exist)
    if (formattingOptions.tocPosition === 'end' && currentBook.chapters && currentBook.chapters.length > 0 && formattingOptions.tocPosition !== 'none') {
      pdfPageCounter++; // Increment physical PDF page counter
      const tocPdfPageNumberForFooter = pdfPageCounter; // TOC itself gets a page number
      const tocEntriesForPdf = generateTableOfContents(contentPagesForPdfGeneration, currentBook.chapters)
        .map(entry => ({
          ...entry,
           estimatedPage: contentStartPdfPageNumber + entry.estimatedPage -1 // Adjust page numbers relative to content start
        }));
      pagesToRender.push({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter });
    }

    // 5. Back Cover Page (if any details exist)
    if (currentBook.backCoverSynopsis || currentBook.backCoverSlogan || currentBook.backCoverImage || currentBook.author) {
      pdfPageCounter++; // Increment physical PDF page counter
      pagesToRender.push({ type: 'backCover' });
    }

    // Render all pages to canvas and then to PDF
    for (let i = 0; i < pagesToRender.length; i++) {
      const pageItem = pagesToRender[i];
      let pageDiv: HTMLDivElement;

      // Create the HTML for the current page type
      if ('type' in pageItem) {
        if (pageItem.type === 'cover') { pageDiv = createPdfPageHtml(pageItem, false, true, false); }
        else if (pageItem.type === 'backCover') { pageDiv = createPdfPageHtml(pageItem, false, false, true);}
        else if (pageItem.type === 'toc') { pageDiv = createPdfPageHtml(pageItem, true, false, false);}
        else {
            // Should not happen with current logic, but handle defensively
            console.warn("Unknown page type for PDF rendering:", pageItem);
            pageDiv = document.createElement('div'); // Empty page
        }
      } else {
        // It's a regular content page (PagePreviewData)
        pageDiv = createPdfPageHtml(pageItem as PagePreviewData, false, false, false);
      }

      tempContainer.innerHTML = ''; // Clear previous page from temp container
      tempContainer.appendChild(pageDiv);
      try {
        const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
        if (i > 0) pdf.addPage(); // Add new page for subsequent pages
        const imgData = canvas.toDataURL('image/png', 0.92); // Use PNG for better quality, 0.92 is high quality

        // Calculate image dimensions to fit A4 page while maintaining aspect ratio
        const canvasAspectRatio = canvas.width / canvas.height;
        const pdfPageAspectRatio = pdfWidthPt / pdfHeightPt;
        let imgWidthPt, imgHeightPt;

        if (canvasAspectRatio > pdfPageAspectRatio) { // Image is wider than page
          imgWidthPt = pdfWidthPt;
          imgHeightPt = pdfWidthPt / canvasAspectRatio;
        } else { // Image is taller than page or same aspect ratio
          imgHeightPt = pdfHeightPt;
          imgWidthPt = pdfHeightPt * canvasAspectRatio;
        }
        const xOffset = (pdfWidthPt - imgWidthPt) / 2; // Center image on page
        const yOffset = (pdfHeightPt - imgHeightPt) / 2; // Center image on page
        pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidthPt, imgHeightPt);
      } catch (e) {
        console.error(`Error rendering page ${i + 1} for PDF:`, e);
        toast({title: `Error en Página ${i+1} del PDF`, description: "Hubo un problema al renderizar una página.", variant: "destructive"});
      }
    }


    document.body.removeChild(tempContainer); // Clean up temp container
    pdf.save(`${(currentBook.title || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };

  // Alias for TXT export
  const handleExportToTxt = handleSaveBookAsTxt;


  // Handle exporting the book to HTML
  const handleExportToHtml = () => {
    if (!currentBook || (!getFullContentString(currentBook.chapters) && !currentBook.title && !currentBook.author)) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como HTML.", variant: "destructive" });
      return;
    }
    const primaryColorVal = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();

    // Start HTML string
    let htmlString = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${currentBook.title || 'Libro'}</title>
        <style>
          body { font-family: ${formattingOptions.fontFamily}; font-size: ${formattingOptions.fontSize}px; color: ${formattingOptions.textColor}; background-color: ${formattingOptions.pageBackgroundColor}; line-height: ${formattingOptions.lineHeight}; margin: 0; padding: 0; max-width: 100%; }
          .book-container { max-width: 800px; margin: 20px auto; padding: ${formattingOptions.previewPadding}px; border: 1px solid #ddd; box-shadow: 0 0 10px rgba(0,0,0,0.1); background-color: white; }

          /* Cover and Back Cover Base Styles */
          .cover-section, .back-cover-section { min-height: 90vh; display: flex; flex-direction: column; text-align: center; position: relative; background-color: ${formattingOptions.pageBackgroundColor}; color: ${formattingOptions.textColor}; padding: 20px; box-sizing: border-box; overflow: hidden; }
          .back-cover-section { background-color: ${currentBook.backCoverColor || formattingOptions.pageBackgroundColor}; color: ${currentBook.backCoverImage ? 'white' : formattingOptions.textColor};}
          .cover-section img.cover-image-bg, .back-cover-section img.back-cover-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
          .cover-section .text-overlay, .back-cover-section .text-overlay { position: relative; z-index: 2; background: ${currentBook.coverImage || currentBook.backCoverImage ? 'rgba(0,0,0,0.6)' : 'transparent'}; color: ${currentBook.coverImage || currentBook.backCoverImage ? 'white' : formattingOptions.textColor}; padding: 40px; border-radius: 8px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
          .back-cover-section .text-overlay { background: ${currentBook.backCoverImage ? 'rgba(0,0,0,0.5)' : 'transparent'}; color: ${currentBook.backCoverImage ? 'white' : formattingOptions.textColor};}

          /* Positioning containers for cover/back-cover text elements */
          .cover-title-container, .cover-subtitle-container, .cover-editorial-container, .cover-free-text-container, .cover-author-container,
          .back-cover-synopsis-container, .back-cover-slogan-container, .back-cover-image-html-container, .back-cover-author-name-container {
            width: 100%; display: flex; flex-direction: column; position: absolute; left:0; padding: 0 40px; box-sizing: border-box;
          }

          /* Cover specific text styles */
          .cover-section h1.book-title-cover { font-size: ${formattingOptions.coverTitleFontSize || 48}px; margin-bottom: 0.2em; text-shadow: ${currentBook.coverImage ? '2px 2px 5px rgba(0,0,0,0.8)' : 'none'}; }
          .cover-section h2.book-subtitle-cover { font-size: ${formattingOptions.coverSubtitleFontSize || 28}px; font-style: italic; margin-bottom: 1em; text-shadow: ${currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.7)' : 'none'}; }
          .cover-section p.cover-free-text { font-size: ${formattingOptions.fontSize * 1.2}px; margin-top: 1em; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.6)' : 'none'}; }
          .cover-section p.author-name-main { font-size: ${formattingOptions.fontSize * 1.5}px; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.6)' : 'none'}; margin-top: 1em; }
          .cover-section p.editorial-name-cover { font-size: ${formattingOptions.fontSize * 1}px; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none'}; }

          /* Author Photo Container on Cover */
          .author-photo-container-cover {
            position: absolute;
            width: 150px; /* Container width */
            text-align: center;
            z-index: 3; /* Above text overlay if needed */
            ${currentBook.authorImagePosition === 'bottom-right' ? 'bottom: 40px; right: 40px;' : ''}
            ${currentBook.authorImagePosition === 'bottom-left' ? 'bottom: 40px; left: 40px;' : ''}
            ${currentBook.authorImagePosition === 'top-right' ? 'top: 40px; right: 40px;' : ''}
            ${currentBook.authorImagePosition === 'top-left' ? 'top: 40px; left: 40px;' : ''}
          }
          .author-photo-container-cover img.author-image-cover { width: 120px; height: 120px; object-fit: cover; border-radius: 6px; border: ${currentBook.coverImage ? '3px solid white' : `3px solid ${formattingOptions.textColor}`}; box-shadow: 0 3px 7px rgba(0,0,0,0.5); margin-bottom: 8px; }
          .author-photo-container-cover p.author-name-photo { font-size: ${formattingOptions.fontSize * 1}px; margin-top: 0; text-shadow: ${currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.8)' : 'none'}; color: ${currentBook.coverImage ? 'white' : formattingOptions.textColor}; }

          /* Content Styles */
          h1, h2, h3 { color: ${formattingOptions.textColor}; }
          h1.book-title-content { font-size: ${formattingOptions.fontSize * 2.5}px; text-align: center; margin-bottom: 0.1em; }
          h3.author-name-content { font-size: ${formattingOptions.fontSize * 1.4}px; text-align: center; font-style: italic; margin-top:0; margin-bottom: 2.5em; }
          h2.chapter-title-html { font-size: ${formattingOptions.fontSize * 1.8}px; margin-top: 2.5em; margin-bottom: 1em; padding-bottom: 0.4em; border-bottom: 2px solid ${formattingOptions.textColor}; text-indent:0; }
          .content-image { max-width: 90%; max-height: 500px; height: auto; display: block; margin: 2em auto; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.15); }

          .html-paragraph { margin-bottom: ${formattingOptions.fontSize * 0.7}px; text-align: justify; text-indent: 1.5em;}
          .html-paragraph.first-letter-capital::first-letter {
            font-size: 2.8em;
            font-weight: bold;
            float: left;
            line-height: 0.75;
            margin-right: 0.03em;
            padding-top:0.05em;
            color: hsl(${primaryColorVal});
          }
          .html-paragraph.first-letter-capital, .chapter-title-html + .html-paragraph { text-indent: 0; }


          /* Table of Contents Styles */
          .toc { border: 1px solid #e0e0e0; padding: 20px 30px; margin-bottom: 35px; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .toc h2 { text-align: center; margin-top: 0; font-size: ${formattingOptions.fontSize * 1.6}px; margin-bottom: 20px; }
          .toc ul { list-style-type: none; padding-left: 0; }
          .toc li { margin-bottom: 10px; font-size: ${formattingOptions.fontSize * 1.05}px; display: flex; justify-content: space-between; align-items: baseline; }
          .toc li .toc-title { flex-grow: 1; margin-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .toc li .toc-page { font-weight: normal; margin-left: auto; padding-left:10px; }
          .page-break-before { page-break-before: always; }
          .page-break-html { border-top: 1px dashed #ccc; margin: 2em 0; text-align: center; color: #aaa; font-size: 0.9em; }
          .page-break-html::before { content: "--- Salto de Página Manual ---"; }

          /* Back Cover Text Styles */
          .back-cover-synopsis-container .synopsis-text { font-size: ${formattingOptions.fontSize * 0.95}px; text-align: justify; text-shadow: ${currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none'};}
          .back-cover-slogan-container .slogan-text { font-size: ${formattingOptions.fontSize * 1.15}px; font-style: italic; font-weight: bold; text-shadow: ${currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none'};}
          .back-cover-author-name-container .author-name-back { font-size: ${formattingOptions.fontSize * 1}px; text-shadow: ${currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none'};}
          .back-cover-image-html-container .back-cover-image-html { max-width: 60%; max-height: 40%; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.3); margin: 0 auto; display:block;}

        </style>
      </head>
      <body>
    `;

    // Helper function for HTML text element positioning
    const getHtmlPositionStyles = (pos: CoverTextPosition | undefined, defaultVerticalAlign: string = 'center') => {
        let textAlign = 'center';
        let alignItems = 'center'; // For flex container aligning items
        let justifyContent = defaultVerticalAlign; // For flex container justifying content
        let top = 'auto', bottom = 'auto', left = '40px', right = '40px'; // Default to full width with padding
        let transform = '';

        if (pos) {
            // Vertical alignment
            if (pos.startsWith('top')) { justifyContent = 'flex-start'; top = '40px'; bottom='auto';}
            else if (pos.startsWith('middle')) { justifyContent = 'center'; top='50%'; bottom='auto'; transform = 'translateY(-50%)';}
            else if (pos.startsWith('bottom')) { justifyContent = 'flex-end'; top = 'auto'; bottom='40px';}

            // Horizontal alignment
            if (pos.includes('left')) { textAlign = 'left'; alignItems = 'flex-start'; left='40px'; right='auto';}
            else if (pos.includes('center')) { textAlign = 'center'; alignItems = 'center'; left='40px'; right='40px';} // Full width for centering text
            else if (pos.includes('right')) { textAlign = 'right'; alignItems = 'flex-end'; left='auto'; right='40px';}
        }
        // For absolute positioned containers that contain text, text-align handles the text,
        // and justify-content/align-items handle the container's internal block alignment if it's also flex.
        // The style string here is for the container div.
        return `text-align: ${textAlign}; align-items: ${alignItems}; justify-content: ${justifyContent}; top: ${top}; bottom: ${bottom}; left: ${left}; right: ${right}; transform: ${transform};`;
    };


    // Cover Section HTML
    htmlString += '<div class="cover-section">\n';
    if (currentBook.coverImage) {
      htmlString += `  <img src="${currentBook.coverImage}" alt="Portada del Libro" class="cover-image-bg" data-ai-hint="book cover"/>\n`;
    }
    htmlString += '  <div class="text-overlay">\n'; // Text overlay div
    htmlString += `    <div class="cover-title-container" style="${getHtmlPositionStyles(currentBook.titlePosition, 'center')}"><h1 class="book-title-cover">${currentBook.title || 'Libro sin Título'}</h1></div>\n`;
    if (currentBook.subtitle) {
      htmlString += `    <div class="cover-subtitle-container" style="${getHtmlPositionStyles(currentBook.subtitlePosition, 'center')}"><h2 class="book-subtitle-cover">${currentBook.subtitle}</h2></div>\n`;
    }
    if (currentBook.coverFreeText) {
      htmlString += `    <div class="cover-free-text-container" style="${getHtmlPositionStyles(currentBook.coverFreeTextPosition, 'flex-end')}"><p class="cover-free-text">${currentBook.coverFreeText}</p></div>\n`;
    }
     if (currentBook.editorial) {
        htmlString += `  <div class="cover-editorial-container" style="${getHtmlPositionStyles(currentBook.editorialPosition, 'flex-end')}"><p class="editorial-name-cover">${currentBook.editorial}</p></div>\n`;
    }

    // Author name on cover - only if no author photo, or handle differently if photo exists
    let authorMainStyle = getHtmlPositionStyles(undefined, 'flex-end'); // Default to bottom center-ish
    if (currentBook.authorImage) { // If there's an author photo, this main author name might be hidden or styled differently
         authorMainStyle = "display: none;"; // Hide if photo is present, as photo includes name
    } else if (currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) {
        // Adjust padding if editorial is also at the bottom to prevent overlap
        authorMainStyle = getHtmlPositionStyles(undefined, 'flex-end') + ` padding-bottom: ${ (formattingOptions.fontSize || 16) * 2.5}px;`;
    }
    htmlString += `    <div class="cover-author-container" style="${authorMainStyle}"><p class="author-name-main">${currentBook.author || 'Autor Desconocido'}</p></div>\n`;

    htmlString += '  </div>\n'; // Close text-overlay
    // Author Photo (if exists, placed outside text-overlay for distinct positioning)
    if (currentBook.authorImage) {
      htmlString += '  <div class="author-photo-container-cover">\n';
      htmlString += `    <img src="${currentBook.authorImage}" alt="Foto del Autor" class="author-image-cover" data-ai-hint="portrait person"/>\n`;
      htmlString += `    <p class="author-name-photo">${currentBook.author}</p>\n`; // Author name with photo
      htmlString += '  </div>\n';
    }
    htmlString += '</div>\n'; // Close cover-section

    // Table of Contents Logic for HTML
    const tocForHtml = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
    let tocPageCounterForHtml = 0; // For TOC entry page numbers (conceptual for HTML)
    let contentStartPageForHtml = 1; // Conceptual page where content starts
    if (currentBook.coverImage || currentBook.title || currentBook.author) contentStartPageForHtml++; // Cover takes a "page"

    const generateTocHtmlBlock = (isStart: boolean) => {
      if (tocForHtml.length > 0 && formattingOptions.tocPosition !== 'none') {
        if ((isStart && formattingOptions.tocPosition === 'start') || (!isStart && formattingOptions.tocPosition === 'end')) {
          let pageBreakClass = "page-break-before"; // Assume TOC needs a page break
          if (isStart && (currentBook.coverImage || currentBook.title || currentBook.author)) {
              // If TOC is first after cover, it doesn't need a page break itself.
              pageBreakClass = "";
              tocPageCounterForHtml = contentStartPageForHtml; // TOC is this conceptual page
              contentStartPageForHtml++; // Content starts on the next conceptual page
          } else if (isStart) { // TOC is the very first thing in the document
              tocPageCounterForHtml = 1;
              contentStartPageForHtml = 2;
          } else { // TOC at end
              // For HTML, page numbers are more conceptual. Let's base them on preview.
              // No explicit page break needed before end TOC if it's the last content block.
              pageBreakClass = "page-break-before";
          }

          const tocEntries = tocForHtml.map(entry => {
            let actualPageForEntry = entry.estimatedPage; // Use estimated page from preview
            // If TOC is at start, and we have a cover, we need to adjust preview page numbers.
            if(isStart && (currentBook.coverImage || currentBook.title || currentBook.author)) {
                actualPageForEntry = contentStartPageForHtml + entry.estimatedPage -1;
            } else if (isStart) { // TOC at start, no cover
                actualPageForEntry = contentStartPageForHtml + entry.estimatedPage -1;
            }
            // If TOC at end, the estimatedPage from preview is likely fine as content has "flowed"
            return `<li><span class="toc-title">${entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title}</span> <span class="toc-page">${actualPageForEntry > 0 ? actualPageForEntry : '~'}</span></li>`;
          }).join('\n');

          return `
            <div class="toc ${pageBreakClass}">
              <h2>Índice</h2>
              <ul>
                ${tocEntries}
              </ul>
            </div>
          `;
        }
      }
      return '';
    };

    let mainContentHtml = "";

    // TOC at start
    if (formattingOptions.tocPosition === 'start' && formattingOptions.tocPosition !== 'none') {
      mainContentHtml += generateTocHtmlBlock(true);
    }

    // Main Content Chapters
    let isFirstContentParagraphForHtmlPage = true; // Used for drop cap logic across chapters/breaks

    (currentBook.chapters || []).forEach((chapter, chapterIndex) => {
        const isFirstChapter = chapterIndex === 0;
        const tocWasAtStart = formattingOptions.tocPosition === 'start' && tocForHtml.length > 0 && formattingOptions.tocPosition !== 'none';
        const coverExisted = currentBook.coverImage || currentBook.title || currentBook.author;

        // Determine if this chapter needs a page break before it in HTML flow
        let chapterPageBreakClass = 'page-break-before';
        if (isFirstChapter && !tocWasAtStart && !coverExisted) { // First chapter, no TOC at start, no cover
            chapterPageBreakClass = '';
        } else if (isFirstChapter && tocWasAtStart && !coverExisted) { // First chapter, TOC at start, no cover
             chapterPageBreakClass = ''; // TOC already caused a break if needed by its own class
        } else if (isFirstChapter && !tocWasAtStart && coverExisted) { // First chapter, no TOC at start, but cover existed
             chapterPageBreakClass = 'page-break-before';
        } else if (isFirstChapter && tocWasAtStart && coverExisted) { // First chapter, TOC at start, cover existed
             chapterPageBreakClass = ''; // TOC already caused a break
        } else if (!isFirstChapter) { // Not the first chapter, always break conceptually
             chapterPageBreakClass = 'page-break-before';
        }


        mainContentHtml += `<h2 class="chapter-title-html ${chapterPageBreakClass}">${chapter.title.trim() === '' ? '&nbsp;' : chapter.title}</h2>\n`;
        isFirstContentParagraphForHtmlPage = true; // Reset for new chapter

        const chapterLines = chapter.content.split('\n');
        chapterLines.forEach(line => {
          if (line.trim() === PAGE_BREAK_MARKER) {
            mainContentHtml += `<div class="page-break-html"></div>`;
            isFirstContentParagraphForHtmlPage = true; // Reset after manual break
            return;
          }
          const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
          if (imageMatch) {
            const [, altText, imgSrc] = imageMatch;
            mainContentHtml += `<img src="${imgSrc}" alt="${altText || 'Imagen insertada'}" class="content-image" data-ai-hint="illustration drawing"/>`;
            isFirstContentParagraphForHtmlPage = false; // Image is not a drop cap target
          } else if (line.match(/!\[(.*?)\]\((.*?)\)/)) { // Placeholder for non-base64 images
              const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
              mainContentHtml += `<p style="font-style: italic; color: #888; text-align: center;">[Imagen: ${altText || 'Referencia de imagen externa'}]</p>`;
              isFirstContentParagraphForHtmlPage = false;
          } else {
            // Process Markdown for bold and italics
            let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            processedLine = processedLine.replace(/(\s|^)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3');
            processedLine = processedLine.replace(/(\s|^)_(.*?)_(\s|$)/g, '$1<em>$2</em>$3');

            let pClass = "html-paragraph";
            if (isFirstContentParagraphForHtmlPage && processedLine.trim() !== '' && processedLine.trim() !== '&nbsp;') {
              pClass += " first-letter-capital";
              isFirstContentParagraphForHtmlPage = false;
            }
            mainContentHtml += processedLine.trim() === '' ? `<p class="html-paragraph">&nbsp;</p>` : `<p class="${pClass}">${processedLine}</p>`;
          }
        });
    });


    // TOC at end
    if (formattingOptions.tocPosition === 'end' && formattingOptions.tocPosition !== 'none') {
        mainContentHtml += generateTocHtmlBlock(false);
    }

    // Determine if book-container (main content wrapper) needs a page-break-before
    let bookContainerPageBreakClass = 'page-break-before';
    if (! (currentBook.coverImage || currentBook.title || currentBook.author) && !(formattingOptions.tocPosition === 'start' && tocForHtml.length > 0 && formattingOptions.tocPosition !== 'none') ) {
      // No cover and no TOC at start, so content container doesn't need a break from body start
      bookContainerPageBreakClass = '';
    }
    htmlString += `<div class="book-container ${bookContainerPageBreakClass}">${mainContentHtml}</div>\n`;


    // Back Cover HTML
    if (currentBook.backCoverSynopsis || currentBook.backCoverSlogan || currentBook.backCoverImage || currentBook.author) {
        htmlString += `<div class="back-cover-section page-break-before">\n`; // page-break-before from main content
        if (currentBook.backCoverImage) {
            htmlString += `  <img src="${currentBook.backCoverImage}" alt="Imagen de Contraportada" class="back-cover-image-bg" data-ai-hint="texture abstract"/>\n`;
        }
        htmlString += `  <div class="text-overlay">\n`;
        if (currentBook.backCoverSynopsis) {
            htmlString += `    <div class="back-cover-synopsis-container" style="${getHtmlPositionStyles(currentBook.backCoverSynopsisPosition, 'center')}"><p class="synopsis-text">${currentBook.backCoverSynopsis.replace(/\n/g, '<br>')}</p></div>\n`;
        }
        if (currentBook.backCoverSlogan) {
            htmlString += `    <div class="back-cover-slogan-container" style="${getHtmlPositionStyles(currentBook.backCoverSloganPosition, 'flex-end')}"><p class="slogan-text">${currentBook.backCoverSlogan}</p></div>\n`;
        }
         // If back cover image is an element, not background
         if (currentBook.backCoverImage && currentBook.backCoverImagePosition && !currentBook.backCoverImagePosition.includes("background") && currentBook.backCoverImagePosition !== "middle-center") {
            htmlString += `    <div class="back-cover-image-html-container" style="${getHtmlPositionStyles(currentBook.backCoverImagePosition || 'middle-center', 'center')}"><img src="${currentBook.backCoverImage}" class="back-cover-image-html" data-ai-hint="texture design"/></div>\n`;
         }

        if (currentBook.author) {
            htmlString += `    <div class="back-cover-author-name-container" style="${getHtmlPositionStyles(currentBook.backCoverAuthorNamePosition, 'flex-end')}"><p class="author-name-back">${currentBook.author}</p></div>\n`;
        }
        htmlString += `  </div>\n`; // Close text-overlay for back cover
        htmlString += `</div>\n`; // Close back-cover-section
    }

    // End HTML string
    htmlString += `
      </body>
      </html>
    `;

    const filename = `${(currentBook.title || 'libro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({ title: "HTML Exportado", description: "Tu libro ha sido exportado como archivo HTML." });
  };

  const handleMarkdownButtonClick = (formatType: 'bold' | 'italic') => {
    const textarea = chapterTextareaRef.current;
    if (!editingChapterId || !currentEditingChapter || !textarea) {
      toast({title: "Error", description: "Selecciona un capítulo y su contenido para aplicar formato.", variant: "destructive"});
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = currentEditingChapter.content;
    const selectedText = currentText.substring(start, end);

    let prefix = "";
    let suffix = "";
    let placeholder = "";

    if (formatType === 'bold') {
      prefix = "**";
      suffix = "**";
      placeholder = "texto en negrita";
    } else if (formatType === 'italic') {
      prefix = "*";
      suffix = "*";
      placeholder = "texto en itálica";
    }

    let newText;
    let newCursorPos;

    if (selectedText) { // If text is selected, wrap it
      newText = currentText.substring(0, start) + prefix + selectedText + suffix + currentText.substring(end);
      // The cursor position after wrapping selected text would ideally be after the suffix.
      newCursorPos = start + prefix.length + selectedText.length + suffix.length;
    } else { // If no text is selected, insert markers with placeholder and select placeholder
      newText = currentText.substring(0, start) + prefix + placeholder + suffix + currentText.substring(start);
      // The cursor (selection) should be on the placeholder text.
      newCursorPos = start + prefix.length; // This is the start of the placeholder
      // We need to select the placeholder text after insertion
    }

    handleChapterContentChange(editingChapterId, newText);

    // Attempt to re-focus and set selection/cursor after React re-render
    // This is often tricky with controlled components.
    requestAnimationFrame(() => {
      if (chapterTextareaRef.current) {
        chapterTextareaRef.current.focus();
        if (selectedText) {
           chapterTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        } else {
           chapterTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos + placeholder.length);
        }
      }
    });
  };


  // Get the currently editing chapter
  const currentEditingChapter = currentBook.chapters.find(ch => ch.id === editingChapterId);
  // Generate the table of contents for display in the UI
  const displayedTableOfContents = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
  // Get the data for the current page in the live preview
  const currentPreviewPageData = paginatedPreview[currentPreviewPageIndex];

  // CSS classes for author image positioning on the cover preview
  const authorImagePositionClasses: Record<AuthorImagePosition, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  // Generate dynamic CSS classes for positioning text elements on the cover/back cover preview
  const coverTextPositionClasses = (position: CoverTextPosition | undefined, _elementType: string): string => {
    if (!position) return 'items-center justify-center text-center'; // Default if no position

    let classes = 'absolute inset-0 flex flex-col p-3 md:p-4 z-10 pointer-events-none '; // Base classes for positioning container

    // Vertical alignment
    if (position.startsWith('top')) classes += 'justify-start ';
    else if (position.startsWith('middle')) classes += 'justify-center ';
    else if (position.startsWith('bottom')) classes += 'justify-end ';

    // Horizontal alignment
    if (position.includes('left')) classes += 'items-start text-left';
    else if (position.includes('center')) classes += 'items-center text-center';
    else if (position.includes('right')) classes += 'items-end text-right';

    return classes;
  };

  // Helper to render text elements on cover/back-cover preview
  const renderTextElement = (text: string | undefined, baseFontSize: number, position: CoverTextPosition | undefined, elementType: string, additionalClasses: string = '', isHTML: boolean = false) => {
    if (!text || text.trim() === '') return null;
    return (
      <div className={`${coverTextPositionClasses(position, elementType)} ${getTextAlignClass(position)}`}>
        {isHTML ? (
          <p className={`break-words ${additionalClasses}`} style={{ fontSize: `${baseFontSize}px` }} dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br>') }} />
        ) : (
          <p className={`break-words ${additionalClasses}`} style={{ fontSize: `${baseFontSize}px` }}>{text}</p>
        )}
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans flex flex-col">
      {/* App Header */}
      <header className="mb-6 md:mb-8 pb-4 border-b border-border">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <BookIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold text-primary">Escribe Libro Pro</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleNewBook} variant="outline" size="sm">
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo Libro
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">
              <FolderOpen className="mr-2 h-4 w-4" /> Abrir Libro
            </Button>
            <Input
                type="file"
                ref={fileInputRef}
                onChange={handleOpenBookFromTxt}
                accept=".txt"
                className="hidden"
            />
            <Button onClick={handleSaveBookAsTxt} variant="outline" size="sm">
              <Save className="mr-2 h-4 w-4" /> Guardar Libro
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <FileDown className="mr-2 h-4 w-4" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportToPdf} disabled={isExportingPdf}>
                  {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {isExportingPdf ? 'Exportando PDF...' : 'Exportar como PDF'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportToTxt}>
                  <FileText className="mr-2 h-4 w-4" />
                  Exportar como TXT
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportToHtml}>
                  <FileCode className="mr-2 h-4 w-4" />
                  Exportar como HTML
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <span className="opacity-50">Exportar como DOCX (Próximamente)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm md:text-base text-muted-foreground mt-2 text-center sm:text-left container mx-auto">Crea tu historia, hermosamente.</p>
      </header>

      {/* Main Content Area with Tabs */}
      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col container mx-auto">
        {/* Tab Triggers */}
        <TabsList className="mx-auto mb-6 shadow-sm w-full max-w-4xl grid grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="editor" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <Edit3 className="mr-1.5 h-4 w-4" /> Editor
          </TabsTrigger>
           <TabsTrigger value="index" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <ListOrdered className="mr-1.5 h-4 w-4" /> Índice
          </TabsTrigger>
          <TabsTrigger value="formatting" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <Paintbrush className="mr-1.5 h-4 w-4" /> Formato
          </TabsTrigger>
          <TabsTrigger value="cover" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <Palette className="mr-1.5 h-4 w-4" /> Portada
          </TabsTrigger>
          <TabsTrigger value="backCover" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <BookCopy className="mr-1.5 h-4 w-4" /> Contraportada
          </TabsTrigger>
        </TabsList>

        {/* Panels: Left (Editor/Settings) and Right (Preview) */}
        <div className="flex flex-1 flex-col lg:flex-row gap-6">
          {/* Left Panel */}
          <div className="w-full lg:w-1/2 flex flex-col gap-6">
            {/* Editor Tab Content */}
            <TabsContent value="editor" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookIcon className="mr-2 h-5 w-5 text-primary" />Editor de Contenido</CardTitle>
                   <CardDescription>
                    Manage your chapters. Use `\newpage` in the content for manual page breaks.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 space-y-4">
                  {/* Chapter Selection and Adding */}
                  <div className="flex items-center gap-2">
                    <Select
                        value={editingChapterId || ""}
                        onValueChange={(id) => setEditingChapterId(id)}
                    >
                        <SelectTrigger className="flex-grow text-sm">
                            <SelectValue placeholder="Selecciona un capítulo para editar" />
                        </SelectTrigger>
                        <SelectContent>
                        {currentBook.chapters.map(ch => (
                            <SelectItem key={ch.id} value={ch.id}>{ch.title.trim() === '' ? '(Capítulo sin título)' : ch.title}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleAddNewChapter} variant="outline" size="sm" className="shrink-0">
                        <PlusCircle className="mr-2 h-4 w-4"/> Añadir Capítulo
                    </Button>
                  </div>

                  {/* Editing Area for Selected Chapter */}
                  {currentEditingChapter && (
                    <div className="space-y-3">
                       <div className="space-y-1 mb-2"> {/* Added mb-2 for spacing */}
                          <Label htmlFor="chapterTitle" className="text-sm font-medium">Título del Capítulo:</Label>
                          <div className="flex items-center gap-2">
                              <Input
                                  id="chapterTitle"
                                  value={currentEditingChapter.title}
                                  onChange={(e) => handleChapterTitleChange(currentEditingChapter.id, e.target.value)}
                                  placeholder="Título del Capítulo (opcional)"
                                  className="flex-grow text-sm p-2 shadow-inner"
                              />
                              {/* Delete Chapter Button (only if more than one chapter) */}
                              {currentBook.chapters.length > 1 && (
                                  <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                      <Button variant="destructive" size="icon" className="h-8 w-8 shrink-0">
                                          <Trash2 className="h-4 w-4" />
                                          <span className="sr-only">Eliminar Capítulo</span>
                                      </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader>
                                      <AlertDialogTitle>¿Estás seguro de eliminar este capítulo?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                          Esta acción no se puede deshacer. Se eliminará permanentemente el capítulo "{currentEditingChapter.title.trim() === '' ? '(Capítulo sin título)' : currentEditingChapter.title}".
                                      </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteChapter(currentEditingChapter.id)}>
                                          Eliminar
                                      </AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                                  </AlertDialog>
                              )}
                          </div>
                       </div>
                        {/* Markdown Toolbar */}
                        <div className="flex items-center gap-1 mb-2 p-1 border rounded-md bg-muted/50">
                          <Button variant="outline" size="icon" onClick={() => handleMarkdownButtonClick('bold')} title="Negrita">
                            <Bold className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => handleMarkdownButtonClick('italic')} title="Itálica">
                            <Italic className="h-4 w-4" />
                          </Button>
                          {/* Otros botones de Markdown (como listas, código, enlaces) se pueden añadir aquí en el futuro */}
                        </div>
                        {/* Chapter Content Textarea */}
                        <Textarea
                            id={`chapterContent-${currentEditingChapter.id}`}
                            ref={chapterTextareaRef}
                            value={currentEditingChapter.content}
                            onChange={(e) => handleChapterContentChange(currentEditingChapter.id, e.target.value)}
                            placeholder="Escribe el contenido de este capítulo aquí..."
                            className="w-full min-h-[250px] md:min-h-[350px] text-sm p-3 rounded-md shadow-inner bg-background/70 border-input focus:bg-background"
                        />
                    </div>
                  )}
                  {/* Placeholder if no chapter is selected */}
                  {!currentEditingChapter && currentBook.chapters.length > 0 && (
                    <div className="text-center text-muted-foreground p-8 border rounded-md bg-muted/30">
                        <Edit3 className="mx-auto h-10 w-10 opacity-50 mb-2" />
                        <p>Por favor, selecciona un capítulo de la lista para editarlo o añade uno nuevo.</p>
                    </div>
                  )}
                   {/* Placeholder if no chapters exist */}
                   {!currentEditingChapter && currentBook.chapters.length === 0 && (
                     <div className="text-center text-muted-foreground p-8 border rounded-md bg-muted/30">
                        <p>No hay capítulos. ¡Añade uno para empezar!</p>
                    </div>
                  )}
                  {/* Insert Image to Content Button */}
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insertar Imagen en Capítulo
                    </Label>
                    <Input id="insertImageContent" type="file" accept="image/*" onChange={handleImageInsertToContent} className="hidden" />
                    <p className="text-xs text-muted-foreground mt-1">Las imágenes son para esta sesión y se exportan a PDF/HTML, no se guardan en TXT.</p>
                  </div>
                  {/* Markdown Help Button */}
                  <div className="mt-auto pt-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => setShowMarkdownHelp(true)}>
                      <HelpCircle className="mr-2 h-4 w-4" /> Consejos de Formato (Markdown)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Index Tab Content */}
            <TabsContent value="index" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><ListOrdered className="mr-2 h-5 w-5 text-primary" />Índice de Capítulos</CardTitle>
                  <CardDescription>Generado de los títulos de tus capítulos. Las páginas son estimaciones de la vista previa.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {(displayedTableOfContents.length > 0) ? (
                    <ScrollArea className="h-[300px] md:h-[400px] pr-3 border rounded-md p-3 bg-background/50">
                      <ul className="space-y-2">
                        {displayedTableOfContents.map((entry, idx) => (
                          <li key={idx} className="flex justify-between items-center text-sm border-b border-dashed pb-1.5 pt-1">
                            <span className="truncate pr-2">{entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title}</span>
                            <span className="text-muted-foreground font-mono text-xs">Pág. aprox. {entry.estimatedPage > 0 ? entry.estimatedPage : '~'}</span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  ) : (
                    <div className="text-center text-muted-foreground italic py-10 h-[300px] md:h-[400px] flex flex-col justify-center items-center bg-muted/30 rounded-md">
                      <ListOrdered className="mx-auto h-12 w-12 opacity-50 mb-3" />
                      <p>Aún no se han definido capítulos o no tienen contenido.</p>
                      <p className="text-xs">Añade capítulos y contenido en el editor.</p>
                    </div>
                  )}
                   {/* TOC Position Setting */}
                   <div className="mt-4 space-y-2">
                      <Label htmlFor="tocPosition" className="text-sm font-medium">Posición del Índice (en PDF/HTML)</Label>
                      <Select onValueChange={(value) => handleFormattingChange('tocPosition', value as 'start' | 'end' | 'none')} value={formattingOptions.tocPosition}>
                        <SelectTrigger id="tocPosition" className="mt-1 text-sm">
                          <SelectValue placeholder="Seleccionar posición del índice" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="start">Al Principio del Libro</SelectItem>
                          <SelectItem value="end">Al Final del Libro</SelectItem>
                           <SelectItem value="none">No Incluir Índice</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Formatting Tab Content */}
            <TabsContent value="formatting" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl">
                    <Paintbrush className="mr-2 h-5 w-5 text-primary" /> Opciones de Formato
                  </CardTitle>
                  <CardDescription>Personaliza la apariencia. Se guardan en tu navegador.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-4 md:p-6">
                  {/* Font Family */}
                  <div className="space-y-2">
                    <Label htmlFor="fontFamily" className="text-sm font-medium">Fuente Principal (Contenido)</Label>
                    <Select onValueChange={(value) => handleFormattingChange('fontFamily', value)} value={formattingOptions.fontFamily}>
                      <SelectTrigger id="fontFamily" className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="var(--font-sans)">Sans-serif Sistema</SelectItem>
                        <SelectItem value="serif">Serif Sistema</SelectItem>
                        <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                        <SelectItem value="'Times New Roman', Times, serif">Times New Roman</SelectItem>
                        <SelectItem value="Georgia, serif">Georgia</SelectItem>
                        <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                        <SelectItem value="'Courier New', Courier, monospace">Courier New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Font Size and Line Height for Content */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fontSize" className="text-sm font-medium">Tamaño Fuente Contenido (px)</Label>
                      <Input id="fontSize" type="number" value={formattingOptions.fontSize} onChange={(e) => handleFormattingChange('fontSize', Math.max(8, parseInt(e.target.value,10)))} className="mt-1 text-sm"/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lineHeight" className="text-sm font-medium">Altura Línea Contenido (ej: 1.6)</Label>
                      <Input id="lineHeight" type="number" value={formattingOptions.lineHeight} step="0.1" min="0.5" onChange={(e) => handleFormattingChange('lineHeight', parseFloat(e.target.value))} className="mt-1 text-sm"/>
                    </div>
                  </div>

                  {/* Font Sizes for Cover Title and Subtitle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="coverTitleFontSize" className="text-sm font-medium">Tamaño Fuente Título Portada (px)</Label>
                        <Input id="coverTitleFontSize" type="number" value={formattingOptions.coverTitleFontSize || 48} onChange={(e) => handleFormattingChange('coverTitleFontSize', parseInt(e.target.value,10))} className="mt-1 text-sm"/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="coverSubtitleFontSize" className="text-sm font-medium">Tamaño Fuente Subtítulo Portada (px)</Label>
                        <Input id="coverSubtitleFontSize" type="number" value={formattingOptions.coverSubtitleFontSize || 28} onChange={(e) => handleFormattingChange('coverSubtitleFontSize', parseInt(e.target.value,10))} className="mt-1 text-sm"/>
                    </div>
                  </div>

                  {/* Color Pickers */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label htmlFor="textColor" className="text-sm font-medium">Color Texto (Contenido)</Label>
                      <Input id="textColor" type="color" value={formattingOptions.textColor} onChange={(e) => handleFormattingChange('textColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pageBackgroundColor" className="text-sm font-medium">Fondo Página (Vista Previa)</Label>
                      <Input id="pageBackgroundColor" type="color" value={formattingOptions.pageBackgroundColor} onChange={(e) => handleFormattingChange('pageBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="previewAreaBackground" className="text-sm font-medium">Fondo Área Vista Previa</Label>
                      <Input id="previewAreaBackground" type="color" value={formattingOptions.previewBackgroundColor} onChange={(e) => handleFormattingChange('previewBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                    </div>
                  </div>

                  {/* Preview Padding and Page Number Alignment */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="previewPadding" className="text-sm font-medium">Relleno Página (px en vista previa)</Label>
                        <Input id="previewPadding" type="number" value={formattingOptions.previewPadding} min="0" onChange={(e) => handleFormattingChange('previewPadding', Math.max(0, parseInt(e.target.value,10)))} className="mt-1 text-sm"/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pageNumberAlignment" className="text-sm font-medium">Alineación Número de Página</Label>
                        <Select onValueChange={(value) => handleFormattingChange('pageNumberAlignment', value as 'left' | 'center' | 'right')} value={formattingOptions.pageNumberAlignment}>
                            <SelectTrigger id="pageNumberAlignment" className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left"><AlignLeft className="inline mr-2 h-4 w-4"/>Izquierda</SelectItem>
                                <SelectItem value="center"><AlignCenter className="inline mr-2 h-4 w-4"/>Centro</SelectItem>
                                <SelectItem value="right"><AlignRight className="inline mr-2 h-4 w-4"/>Derecha</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Cover Design Tab Content */}
            <TabsContent value="cover" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Palette className="mr-2 h-5 w-5 text-primary" />Diseñador de Portada</CardTitle>
                  <CardDescription>Personaliza portada. Imágenes para esta sesión (no en TXT).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  {/* Book Title and Position */}
                  <div className="space-y-2">
                    <Label htmlFor="bookTitleInput" className="text-sm font-medium">Título del Libro</Label>
                    <Input id="bookTitleInput" value={currentBook.title} onChange={(e) => handleBookDetailsChange('title', e.target.value)} placeholder="El Título de tu Gran Libro" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="titlePosition" className="text-xs font-medium text-muted-foreground">Posición del Título</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('titlePosition', v as CoverTextPosition)} value={currentBook.titlePosition || 'middle-center'}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  {/* Book Subtitle and Position */}
                  <div className="space-y-2">
                    <Label htmlFor="bookSubtitleInput" className="text-sm font-medium">Subtítulo del Libro</Label>
                    <Input id="bookSubtitleInput" value={currentBook.subtitle || ''} onChange={(e) => handleBookDetailsChange('subtitle', e.target.value)} placeholder="Un subtítulo atractivo" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="subtitlePosition" className="text-xs font-medium text-muted-foreground">Posición del Subtítulo</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('subtitlePosition', v as CoverTextPosition)} value={currentBook.subtitlePosition || 'middle-center'}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  {/* Editorial Name and Position */}
                   <div className="space-y-2">
                    <Label htmlFor="editorialName" className="text-sm font-medium">Nombre de la Editorial</Label>
                    <Input id="editorialName" value={currentBook.editorial || ''} onChange={(e) => handleBookDetailsChange('editorial', e.target.value)} placeholder="Nombre de Editorial (Opcional)" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="editorialPosition" className="text-xs font-medium text-muted-foreground">Posición de la Editorial</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('editorialPosition', v as CoverTextPosition)} value={currentBook.editorialPosition || 'bottom-center'}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  {/* Author Name */}
                  <div className="space-y-2">
                    <Label htmlFor="authorName" className="text-sm font-medium">Nombre del Autor/a</Label>
                    <Input id="authorName" value={currentBook.author} onChange={(e) => handleBookDetailsChange('author', e.target.value)} placeholder="Tu Nombre como Autor/a" className="mt-1 text-sm p-2 shadow-inner"/>
                  </div>
                  {/* Cover Free Text and Position */}
                  <div className="space-y-2">
                    <Label htmlFor="coverFreeTextInput" className="text-sm font-medium">Texto Adicional en Portada (Opcional)</Label>
                    <Input id="coverFreeTextInput" value={currentBook.coverFreeText || ''} onChange={(e) => handleBookDetailsChange('coverFreeText', e.target.value)} placeholder="Ej: Una dedicatoria corta" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="coverFreeTextPosition" className="text-xs font-medium text-muted-foreground">Posición del Texto Adicional</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('coverFreeTextPosition', v as CoverTextPosition)} value={currentBook.coverFreeTextPosition || 'bottom-center'}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>


                  {/* Main Cover Image Upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Imagen de Portada Principal</Label>
                    <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <Label htmlFor="coverImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                        <UploadCloud className="mr-2 h-4 w-4" /> Subir Imagen Principal
                      </Label>
                       <Input id="coverImageUploadFile" type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" />
                      {currentBook.coverImage && (
                        <Button variant="outline" size="sm" onClick={() => setCurrentBook(prev => ({...prev, coverImage: null, lastModified: Date.now()}))} className="text-xs">Quitar Imagen</Button>
                      )}
                    </div>
                  </div>

                  {/* Author Photo Upload and Position */}
                  <div className="space-y-2 border-t pt-4">
                     <Label className="text-sm font-medium">Fotografía del Autor</Label>
                     <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                       <Label htmlFor="authorImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                         <UserSquare2 className="mr-2 h-4 w-4" /> Subir Foto del Autor
                       </Label>
                       <Input id="authorImageUploadFile" type="file" accept="image/*" onChange={handleAuthorImageUpload} className="hidden" />
                       {currentBook.authorImage && (
                         <Button variant="outline" size="sm" onClick={() => setCurrentBook(prev => ({...prev, authorImage: null, lastModified: Date.now()}))} className="text-xs">Quitar Foto</Button>
                       )}
                     </div>
                     {currentBook.authorImage && (
                       <div className="space-y-2 mt-2">
                         <Label htmlFor="authorImagePosition" className="text-sm font-medium">Posición de Foto del Autor</Label>
                         <Select onValueChange={(value) => handleAuthorImagePositionChange(value as AuthorImagePosition)} value={currentBook.authorImagePosition || 'bottom-right'}>
                           <SelectTrigger id="authorImagePosition" className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="bottom-right">Inferior Derecha</SelectItem>
                             <SelectItem value="bottom-left">Inferior Izquierda</SelectItem>
                             <SelectItem value="top-right">Superior Derecha</SelectItem>
                             <SelectItem value="top-left">Superior Izquierda</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                     )}
                  </div>

                  {/* Cover Thumbnail Preview */}
                  {(currentBook.coverImage || currentBook.authorImage || (currentBook.title && currentBook.title !== '') || currentBook.subtitle || currentBook.editorial || currentBook.coverFreeText) && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col shadow-inner overflow-hidden relative">
                         {/* Cover Image */}
                         {currentBook.coverImage && <NextImage src={currentBook.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>}

                         {/* Title Text */}
                         <div className={`${coverTextPositionClasses(currentBook.titlePosition, 'title')}`}>
                           <h3
                            className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight"
                            style={{ fontSize: `${Math.max(10, (formattingOptions.coverTitleFontSize || 48) * 0.4)}px`}} // Scaled font size
                           >{currentBook.title}</h3>
                         </div>
                         {/* Subtitle Text */}
                          {currentBook.subtitle && (
                            <div className={`${coverTextPositionClasses(currentBook.subtitlePosition, 'subtitle')}`}>
                                <p
                                 className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words mt-1"
                                 style={{ fontSize: `${Math.max(8, (formattingOptions.coverSubtitleFontSize || 28) * 0.4)}px`}} // Scaled font size
                                ><em>{currentBook.subtitle}</em></p>
                            </div>
                          )}
                          {/* Editorial Text */}
                          {currentBook.editorial && (
                            <div className={`${coverTextPositionClasses(currentBook.editorialPosition, 'editorial')}`}>
                                <p className="text-[10px] text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words">{currentBook.editorial}</p>
                            </div>
                          )}
                          {/* Cover Free Text */}
                           {currentBook.coverFreeText && (
                            <div className={`${coverTextPositionClasses(currentBook.coverFreeTextPosition, 'freeText')}`}>
                                <p className="text-[10px] text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words">{currentBook.coverFreeText}</p>
                            </div>
                          )}

                         {/* Author Image and Name */}
                         {currentBook.authorImage && (
                            <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-16 h-20 z-20 flex flex-col items-center text-center pointer-events-none`}>
                                <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={60} height={60} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                                <p className="text-[10px] text-white mt-0.5 [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words leading-tight">{currentBook.author}</p>
                            </div>
                         )}
                         {/* Author Name (if no image and not hidden by editorial) */}
                          {!currentBook.authorImage && currentBook.author && !(currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) && (
                             <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none items-center justify-end text-center`}>
                               <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words pb-1"><em>{currentBook.author}</em></p>
                             </div>
                          )}
                       </div>
                    )}
                    {/* Placeholder for empty cover */}
                    {!currentBook.coverImage && !currentBook.authorImage && (currentBook.title === '') && !currentBook.subtitle && !currentBook.editorial && !currentBook.coverFreeText &&(
                      <div className="mt-4 p-2 border border-dashed rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted/50 flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={36} className="mb-2 opacity-70" />
                        <p className="text-xs text-center">Sube imágenes y añade detalles para la portada.</p>
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Back Cover Design Tab Content */}
            <TabsContent value="backCover" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookCopy className="mr-2 h-5 w-5 text-primary" />Diseñador de Contraportada</CardTitle>
                  <CardDescription>Personaliza la contraportada de tu libro.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  {/* Synopsis and Position */}
                  <div className="space-y-2">
                    <Label htmlFor="backCoverSynopsis" className="text-sm font-medium">Sinopsis</Label>
                    <Textarea id="backCoverSynopsis" value={currentBook.backCoverSynopsis || ''} onChange={(e) => handleBookDetailsChange('backCoverSynopsis', e.target.value)} placeholder="Escribe la sinopsis o resumen del libro aquí..." className="mt-1 text-sm p-2 shadow-inner min-h-[100px]"/>
                    <Label htmlFor="backCoverSynopsisPosition" className="text-xs font-medium text-muted-foreground">Posición de la Sinopsis</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('backCoverSynopsisPosition', v as CoverTextPosition)} value={currentBook.backCoverSynopsisPosition || 'middle-center'}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  {/* Slogan and Position */}
                  <div className="space-y-2">
                    <Label htmlFor="backCoverSlogan" className="text-sm font-medium">Eslogan (Opcional)</Label>
                    <Input id="backCoverSlogan" value={currentBook.backCoverSlogan || ''} onChange={(e) => handleBookDetailsChange('backCoverSlogan', e.target.value)} placeholder="Un eslogan corto y atractivo" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="backCoverSloganPosition" className="text-xs font-medium text-muted-foreground">Posición del Eslogan</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('backCoverSloganPosition', v as CoverTextPosition)} value={currentBook.backCoverSloganPosition || 'bottom-center'}>
                       <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                       <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  {/* Author Name Position on Back Cover */}
                   <div className="space-y-2">
                    <Label htmlFor="backCoverAuthorNamePosition" className="text-xs font-medium">Posición Nombre del Autor</Label>
                     <Select onValueChange={(v) => handleCoverTextFieldChange('backCoverAuthorNamePosition', v as CoverTextPosition)} value={currentBook.backCoverAuthorNamePosition || 'bottom-right'}>
                       <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                       <SelectContent>
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  {/* Back Cover Image Upload and Position */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Imagen de Contraportada</Label>
                    <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <Label htmlFor="backCoverImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                        <UploadCloud className="mr-2 h-4 w-4" /> Subir Imagen
                      </Label>
                       <Input id="backCoverImageUploadFile" type="file" accept="image/*" onChange={handleBackCoverImageUpload} className="hidden" />
                      {currentBook.backCoverImage && (
                        <Button variant="outline" size="sm" onClick={() => setCurrentBook(prev => ({...prev, backCoverImage: null, lastModified: Date.now()}))} className="text-xs">Quitar Imagen</Button>
                      )}
                    </div>
                     {currentBook.backCoverImage && (
                       <div className="space-y-2 mt-2">
                         <Label htmlFor="backCoverImagePosition" className="text-sm font-medium">Posición de Imagen</Label>
                         <Select onValueChange={(value) => handleCoverTextFieldChange('backCoverImagePosition', value as CoverTextPosition)} value={currentBook.backCoverImagePosition || 'middle-center'}>
                           <SelectTrigger id="backCoverImagePosition" className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                     )}
                  </div>
                  {/* Back Cover Background Color */}
                  <div className="space-y-2">
                      <Label htmlFor="backCoverColor" className="text-sm font-medium">Color de Fondo Contraportada</Label>
                      <Input id="backCoverColor" type="color" value={currentBook.backCoverColor || '#FFFFFF'} onChange={(e) => handleBookDetailsChange('backCoverColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                  </div>

                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Right Panel: Live Preview */}
          <div className="w-full lg:w-1/2 lg:sticky lg:top-8">
            <Card className="shadow-lg h-full">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><FileSearch className="mr-2 h-5 w-5 text-primary" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Observa cómo tu libro toma forma. La paginación es aproximada.</CardDescription>
              </CardHeader>
              <CardContent
                className="p-3 md:p-4 overflow-y-auto"
                style={{
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  borderRadius: 'var(--radius)', // Use theme radius
                  maxHeight: 'calc(100vh - 220px)', // Adjusted for better fit on various screens
                }}
              >
                {/* Cover Preview */}
                {activeTab === 'cover' ? (
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col shadow-lg overflow-hidden relative"
                    style={{
                        backgroundColor: currentBook.coverImage ? '#333' : formattingOptions.pageBackgroundColor, // Darker bg if image exists for contrast
                        color: currentBook.coverImage ? 'white' : formattingOptions.textColor,
                        fontFamily: formattingOptions.fontFamily,
                    }}>
                    {/* Cover Image */}
                    {currentBook.coverImage ? (
                      <NextImage src={currentBook.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      // Placeholder if no cover image
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">{currentBook.title.trim() === '' ? 'Libro (en edición)' : 'Portada (sin imagen)'}</p>
                      </div>
                    )}
                    {/* Text Elements on Cover */}
                     <div className={`${coverTextPositionClasses(currentBook.titlePosition, 'title')}`}>
                        <h2
                            className="font-bold [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight break-words"
                            style={{ fontSize: `${formattingOptions.coverTitleFontSize || 48}px` }}
                        >{currentBook.title}</h2>
                     </div>
                     {renderTextElement(currentBook.subtitle, formattingOptions.coverSubtitleFontSize || 28, currentBook.subtitlePosition, 'subtitle', `[text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] italic`, false)}
                     {renderTextElement(currentBook.editorial, formattingOptions.fontSize * 1.1, currentBook.editorialPosition, 'editorial', `text-sm [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)]`, false)}
                     {renderTextElement(currentBook.coverFreeText, formattingOptions.fontSize * 1.1, currentBook.coverFreeTextPosition, 'freeText', `text-sm [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)]`, false)}

                     {/* Author Name (if no photo, positioned generally) */}
                     {!currentBook.authorImage && currentBook.author && !(currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) && (
                         <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none items-center justify-end text-center`}>
                            <p className="text-base md:text-lg [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] pb-2 break-words"><em>{currentBook.author}</em></p>
                         </div>
                     )}
                    {/* Author Image and Name */}
                    {currentBook.authorImage && (
                        <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-24 z-20 flex flex-col items-center text-center p-1 bg-black/20 rounded pointer-events-none`}>
                            <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={70} height={70} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                            <p className="text-xs text-white mt-1 [text-shadow:1px_1px_1px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.author}</p>
                        </div>
                    )}
                  </div>
                ) : /* Back Cover Preview */
                activeTab === 'backCover' ? (
                     <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col shadow-lg overflow-hidden relative"
                        style={{
                            backgroundColor: currentBook.backCoverColor || formattingOptions.pageBackgroundColor,
                            color: currentBook.backCoverImage ? 'white' : formattingOptions.textColor,
                            fontFamily: formattingOptions.fontFamily,
                        }}>
                        {/* Background Image for Back Cover */}
                        {currentBook.backCoverImage && (
                            <NextImage src={currentBook.backCoverImage} alt="Vista Previa de Contraportada" layout="fill" objectFit="cover" className="z-0" data-ai-hint="texture abstract"/>
                        )}
                        {/* Placeholder if back cover is empty */}
                        {!currentBook.backCoverImage && !currentBook.backCoverSynopsis && !currentBook.backCoverSlogan && (
                            <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                                <ImageIcon size={60} className="opacity-50 mb-2" />
                                <p className="text-sm">Configura la contraportada</p>
                            </div>
                        )}
                        {/* Text elements on Back Cover */}
                        {renderTextElement(currentBook.backCoverSynopsis, formattingOptions.fontSize * 0.9, currentBook.backCoverSynopsisPosition, 'backSynopsis', `text-sm ${currentBook.backCoverImage ? 'text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)]' : ''}`, true)}
                        {renderTextElement(currentBook.backCoverSlogan, formattingOptions.fontSize * 1.1, currentBook.backCoverSloganPosition, 'backSlogan', `font-semibold italic ${currentBook.backCoverImage ? 'text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)]' : ''}`)}
                        {renderTextElement(currentBook.author, formattingOptions.fontSize * 0.95, currentBook.backCoverAuthorNamePosition, 'backAuthorName', `${currentBook.backCoverImage ? 'text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)]' : ''}`)}

                        {/* Positioned Image on Back Cover (if not used as full background) */}
                        {currentBook.backCoverImage && currentBook.backCoverImagePosition && !currentBook.backCoverImagePosition.includes("background") && currentBook.backCoverImagePosition !== "middle-center" && (
                           <div className={`${coverTextPositionClasses(currentBook.backCoverImagePosition, 'backImage')} flex items-center justify-center`}>
                             <div className="relative w-[60%] h-[40%] max-w-[200px] max-h-[150px]">
                                <NextImage src={currentBook.backCoverImage} alt="Imagen Contraportada" layout="fill" objectFit="contain" className="rounded shadow-md" data-ai-hint="texture design"/>
                             </div>
                           </div>
                        )}
                    </div>
                ) : /* Paginated Content Preview */
                paginatedPreview.length > 0 && currentPreviewPageData ? (
                  <div
                    key={`${currentPreviewPageData.pageNumber}-${currentPreviewPageIndex}`} // Ensure re-render on page change
                    className="page-simulation-wrapper mx-auto my-4 prose-sm md:prose max-w-none"
                    style={{
                      ...simulatedPageStyle,
                      opacity: isPageTransitioning ? 0 : 1,
                      transition: 'opacity 0.15s ease-in-out', // Smooth transition
                    }}
                  >
                    {/* Page Header */}
                    <div className="page-header text-xs py-1.5 px-2.5 border-b" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: 'hsl(var(--border))'}}>
                      <span className="float-left truncate max-w-[45%]">{currentPreviewPageData.headerLeft}</span>
                      <span className="float-right truncate max-w-[45%]">{currentPreviewPageData.headerRight}</span>
                      <div style={{clear: 'both'}}></div>
                    </div>

                    {/* Page Content */}
                    <div className="page-content-area flex-grow overflow-hidden py-2 px-1" style={{lineHeight: formattingOptions.lineHeight, fontSize: `${formattingOptions.fontSize}px`}}>
                      {currentPreviewPageData.contentElements.length > 0 ? currentPreviewPageData.contentElements : <p className="italic text-center book-paragraph" style={{opacity: 0.6, minHeight: '2em'}}>&nbsp;</p>}
                    </div>

                    {/* Page Footer */}
                    <div className="page-footer text-xs py-1.5 px-2.5 border-t" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: 'hsl(var(--border))', textAlign: formattingOptions.pageNumberAlignment}}>
                      {currentPreviewPageData.footerCenter}
                    </div>
                  </div>
                ) : (
                  // Placeholder if no content for preview
                  <div
                    className="prose max-w-none border rounded-md min-h-[300px] shadow-inner flex flex-col justify-center items-center text-center p-6"
                    style={{
                      fontFamily: formattingOptions.fontFamily,
                      fontSize: `${formattingOptions.fontSize}px`,
                      color: formattingOptions.textColor,
                      backgroundColor: formattingOptions.pageBackgroundColor,
                      lineHeight: formattingOptions.lineHeight,
                      opacity: isPageTransitioning ? 0 : 1,
                      transition: 'opacity 0.15s ease-in-out',
                    }}
                  >
                    <ImageIcon size={48} className="text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-semibold mb-1">{currentBook.title.trim() === '' ? 'Libro (en edición)' : currentBook.title}</h3>
                    <p className="text-sm italic mb-3">por {currentBook.author.trim() === '' ? 'Autor (en edición)' : currentBook.author}</p>
                    <p className="text-xs italic text-muted-foreground">
                      La vista previa del contenido aparecerá aquí paginada.
                    </p>
                    { (getFullContentString(currentBook.chapters).trim() === "" || getFullContentString(currentBook.chapters).trim() === "## \n") &&
                      <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor para ver la vista previa)</p>
                    }
                  </div>
                )}
              </CardContent>
              {/* Pagination Controls for Content Preview */}
              {(activeTab !== 'cover' && activeTab !== 'backCover') && paginatedPreview.length > 0 && (
                 <CardFooter className="flex items-center justify-center gap-3 py-3 border-t bg-muted/50">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleChangePreviewPage('prev')}
                    disabled={currentPreviewPageIndex === 0 || isPageTransitioning}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {currentPreviewPageIndex + 1} de {paginatedPreview.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleChangePreviewPage('next')}
                    disabled={currentPreviewPageIndex >= paginatedPreview.length - 1 || isPageTransitioning}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardFooter>
              )}
               {/* Footer for empty content preview */}
               {(activeTab !== 'cover' && activeTab !== 'backCover') && paginatedPreview.length === 0 && (
                <CardFooter className="text-xs text-muted-foreground justify-center py-2.5 border-t bg-muted/50">
                  La vista previa aparecerá aquí.
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </Tabs>

      {/* Markdown Help Dialog */}
      <Dialog open={showMarkdownHelp} onOpenChange={setShowMarkdownHelp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Consejos de Formato (Markdown)</DialogTitle>
            <DialogDescription>
              Usa estos comandos básicos en el editor de capítulos para dar formato a tu texto.
              La vista previa y las exportaciones HTML/PDF intentarán interpretarlos.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <ul className="space-y-2 text-sm list-disc list-inside pl-2">
              <li><code>## Título del Capítulo</code>: Define un nuevo capítulo (automático al añadir capítulos).</li>
              <li><code>**texto en negrita**</code>: Para mostrar texto en <strong>negrita</strong>.</li>
              <li><code>*texto en itálica*</code> o <code>_texto en itálica_</code>: Para mostrar texto en <em>itálica</em>.</li>
              <li><code>\newpage</code> (en una línea separada): Para forzar un salto de página manual.</li>
              <li>Para insertar imágenes, usa el botón "Insertar Imagen en Capítulo". Se añadirá el código Markdown necesario.</li>
              <li>La justificación completa del texto no es parte de Markdown estándar y se aplica globalmente en las exportaciones (PDF/HTML) según el estilo del libro.</li>
            </ul>
          </ScrollArea>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* App Footer */}
      <footer className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
        <p>Escribe Libro Pro {APP_VERSION}</p>
        <p>{COPYRIGHT_NOTICE}</p>
      </footer>
    </div>
  );
}
