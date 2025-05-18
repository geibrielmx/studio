
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
import { UploadCloud, BookOpen, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode, FilePlus, Trash2, ChevronLeft, ChevronRight, UserSquare2, FileSearch, Building, AlignLeft, AlignCenter, AlignRight, BookIcon, Feather, Edit3, PlusCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const APP_VERSION = "1.0.0";
const COPYRIGHT_NOTICE = `© ${new Date().getFullYear()} GaboGmx. Todos los derechos reservados.`;

const PAGE_CONTENT_TARGET_HEIGHT_PX = 680;
const PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX = 70;
const IMAGE_LINE_EQUIVALENT = 15; // Estimated lines an image takes
const PAGE_BREAK_MARKER = '\\newpage';

const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v7';
// const LOCALSTORAGE_BOOKS_LIST_KEY = 'escribaLibro_books_list_v5'; // No longer used for main list
// const LOCALSTORAGE_ACTIVE_BOOK_ID_KEY = 'escribaLibro_active_book_id_v5'; // No longer used

// const LOCALSTORAGE_COVER_IMAGE_PREFIX = 'escribaLibro_coverImage_'; // No longer used
// const LOCALSTORAGE_AUTHOR_IMAGE_PREFIX = 'escribaLibro_authorImage_'; // No longer used
// const COVER_IMAGE_MARKER = 'HAS_COVER_IMAGE'; // No longer used
// const AUTHOR_IMAGE_MARKER = 'HAS_AUTHOR_IMAGE'; // No longer used


interface PagePreviewData {
  pageNumber: number;
  headerLeft: string;
  headerRight: string;
  contentElements: JSX.Element[];
  rawContentLines: string[]; // Keep raw lines for PDF generation
  footerCenter: string; 
  isStartOfChapter?: boolean;
  chapterTitle?: string;
  isForceBreak?: boolean;
}

const createInitialChapter = (): Chapter => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2,7),
  title: 'Nuevo Capítulo',
  content: '',
});

const createInitialBook = (): Book => ({
  id: Date.now().toString(), 
  title: 'Libro sin Título',
  subtitle: '',
  author: 'Autor Desconocido',
  editorial: '',
  chapters: [createInitialChapter()],
  coverImage: null, 
  authorImage: null, 
  authorImagePosition: 'bottom-right',
  titlePosition: 'middle-center',
  subtitlePosition: 'middle-center',
  editorialPosition: 'bottom-center',
  lastModified: Date.now(), 
  // tableOfContents is now dynamically generated
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
};


function createPageContentElements(
  lines: string[],
  pageKeyPrefix: string,
  formattingOptions: FormattingOptions
): { elements: JSX.Element[], chapterTitle?: string, isStartOfChapter?: boolean } {
  let isStartOfChapter = false;
  let chapterTitle: string | undefined = undefined;

  const elements = lines.map((paragraph, index) => {
    if (paragraph.trim() === PAGE_BREAK_MARKER) {
      return <p key={`${pageKeyPrefix}-line-${index}`} className="hidden-page-break-marker"></p>;
    }
    let isChapterHeadingLine = false;
    if (paragraph.startsWith('## ')) {
      // A chapter heading is considered the start of a chapter if it's the first line,
      // or the line before was a page break, or all previous lines were empty.
      if (index === 0 || lines[index-1]?.trim() === PAGE_BREAK_MARKER || lines.slice(0, index).every(l => l.trim() === '')) {
        isStartOfChapter = true;
        chapterTitle = paragraph.substring(3).trim();
        isChapterHeadingLine = true;
      }
    }
    const imageMatch = paragraph.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
    if (imageMatch) {
      const [, altText, imgSrc] = imageMatch;
      return (
        <div key={`${pageKeyPrefix}-line-${index}`} className="my-3 md:my-4 text-center">
          <NextImage
            src={imgSrc}
            alt={altText || 'Imagen insertada'}
            width={300} // Default width, adjust as needed or make configurable
            height={200} // Default height
            className="max-w-full h-auto inline-block rounded shadow-md"
            data-ai-hint="illustration drawing"
            style={{
              maxWidth: `calc(100% - ${formattingOptions.previewPadding * 0}px)`, // was *2, but images should not consider padding directly
            }}
          />
          {altText && <p className="text-xs italic mt-1" style={{ opacity: 0.8 }}>{altText}</p>}
        </div>
      );
    } else if (paragraph.match(/!\[(.*?)\]\((.*?)\)/)) {
        // Placeholder for non-data URI images (e.g., external URLs not directly rendered)
        const [, altText] = paragraph.match(/!\[(.*?)\]\((.*?)\)/)!;
        return <p key={`${pageKeyPrefix}-line-${index}`} className="my-1.5 md:my-2 italic text-muted-foreground text-center">[Imagen: {altText || 'Referencia de imagen externa'}]</p>;
    }
    
    const pClassName = `my-1.5 md:my-2 book-paragraph ${isChapterHeadingLine ? 'chapter-heading font-bold text-xl md:text-2xl !text-left !indent-0 !pl-0 !pt-4 !pb-2 border-b-2 border-primary mb-4' : ''}`;
    const pContent = isChapterHeadingLine ? paragraph.substring(3).trim() : (paragraph.trim() === '' ? <>&nbsp;</> : paragraph);

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
  return {
    pageNumber,
    headerLeft: bookTitle,
    headerRight: currentChapterTitleForHeader,
    contentElements: elements,
    rawContentLines: lines,
    footerCenter: `Página ${pageNumber}`,
    isStartOfChapter: isStartOfChapter,
    chapterTitle: chapterTitle,
    isForceBreak,
  };
}

function getFullContentString(chapters: Chapter[]): string {
  return chapters.map(chapter => `## ${chapter.title}\n${chapter.content}`).join('\n\n');
}

function generatePagePreviews(
  book: Book,
  formattingOptions: FormattingOptions
): PagePreviewData[] {
  const output: PagePreviewData[] = [];
  const fullContent = getFullContentString(book.chapters || []);
  if (!fullContent && !book.title) return output;

  const allLines = (fullContent || '').split('\n');
  const { fontSize, lineHeight } = formattingOptions;

  const actualContentAreaHeight = PAGE_CONTENT_TARGET_HEIGHT_PX - PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX;
  const estimatedLinePixelHeight = Math.max(1, fontSize * lineHeight); // Ensure not zero
  let linesPerPage = Math.max(1, Math.floor(actualContentAreaHeight / estimatedLinePixelHeight)); // Ensure at least 1 line per page

  let currentPageLines: string[] = [];
  let currentPageNumber = 1;
  let currentChapterForHeader = book.chapters?.[0]?.title || "Introducción"; // Default if no chapters or first chapter has no title
  let linesAccumulatedOnCurrentPage = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isChapterHeading = line.startsWith('## ');
    const isManualPageBreak = line.trim() === PAGE_BREAK_MARKER;
    let lineCost = 1; // Default cost
    if (/!\[(.*?)\]\(data:image\/.*?\)/.test(line)) {
      lineCost = IMAGE_LINE_EQUIVALENT; // Images take more space
    } else if (isChapterHeading) {
      lineCost = 2; // Chapter headings take a bit more space
    }


    // Handle manual page break
    if (isManualPageBreak) {
        if (currentPageLines.length > 0 || isChapterHeading) { // Push existing content if any, or if it's a chapter heading needing a break
             output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions, true));
             currentPageLines = [];
             linesAccumulatedOnCurrentPage = 0;
             currentPageNumber++;
        }
        // currentChapterForHeader remains for the new page unless a new chapter starts immediately
        continue; // Skip further processing for this line
    }


    if (isChapterHeading) {
      // If a chapter heading itself needs to start a new page due to previous content
      if (currentPageLines.length > 0) { // Push current page if it has content
        output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
        currentPageLines = [];
        linesAccumulatedOnCurrentPage = 0;
        currentPageNumber++;
      }
      currentChapterForHeader = line.substring(3).trim();
      currentPageLines.push(line); // Add chapter heading line
      linesAccumulatedOnCurrentPage += lineCost;

      if (i === allLines.length - 1) { // If it's the last line and a chapter heading
         output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
         currentPageLines = []; // Clear for safety, though loop ends
      }
      continue; // Move to next line
    }

    // Check if current line exceeds page capacity and there's content on the page
    if (linesAccumulatedOnCurrentPage + lineCost > linesPerPage && currentPageLines.length > 0) {
      output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
      currentPageLines = [];
      linesAccumulatedOnCurrentPage = 0;
      currentPageNumber++;
      // currentChapterForHeader remains the same for the new page
    }

    currentPageLines.push(line);
    linesAccumulatedOnCurrentPage += lineCost;
  }

  // Add any remaining lines to the last page
  if (currentPageLines.length > 0) {
    output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
  }

  if (output.length === 0 && (book.title || fullContent)) { // Ensure at least one page if there's any book data
     output.push(createPageObject(1, book.title || "Libro sin Título", "Inicio del Libro", [""], formattingOptions));
  }

  return output;
}


function generateTableOfContents(paginatedPreview: PagePreviewData[], bookChapters: Chapter[]): ChapterEntry[] {
  const toc: ChapterEntry[] = [];
  const chapterTitlesFromContent = new Set<string>();

  // First, get chapter titles as they appear in the paginated content
  paginatedPreview.forEach(page => {
    if (page.isStartOfChapter && page.chapterTitle && !chapterTitlesFromContent.has(page.chapterTitle)) {
      toc.push({
        title: page.chapterTitle,
        estimatedPage: page.pageNumber, 
      });
      chapterTitlesFromContent.add(page.chapterTitle);
    }
  });
  
  // Ensure all chapters from the book structure are included, even if empty or not making a page break
  // This is more robust if chapter management changes
  bookChapters.forEach(bookChapter => {
    if (!chapterTitlesFromContent.has(bookChapter.title)) {
      // Find its potential page if it exists, or estimate
      const existingEntry = toc.find(t => t.title === bookChapter.title);
      if (!existingEntry) {
        // If not found, it means it might be an empty chapter or merged. Add with a placeholder page or try to find its line.
        // For simplicity now, we only add if it created a page. This can be enhanced.
        // Or, we can just add it and its page will be the one of the *next* found chapter if it's empty.
        // For now, rely on paginatedPreview to have caught it if it has content.
      }
    }
  });

  // Sort TOC by estimated page number
  toc.sort((a, b) => a.estimatedPage - b.estimatedPage);
  
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

  // Load formatting options from localStorage on mount
  const loadFormattingFromLocalStorage = useCallback(() => {
    try {
      const savedFormattingJson = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormattingJson) {
        const loadedOptions = JSON.parse(savedFormattingJson) as FormattingOptions;
         // Ensure all keys from initialFormattingOptions are present, overriding with loaded ones
        const mergedOptions = { ...initialFormattingOptions, ...loadedOptions };
        setFormattingOptions(mergedOptions);
      } else {
         // If nothing in localStorage, try to use computed styles for initial theme colors
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
    // No automatic book loading from localStorage, user must use "Open Book (TXT)"
    setMounted(true);
  }, [loadFormattingFromLocalStorage]);


 useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
      } catch (error) {
        console.error("Error saving formatting to localStorage:", error);
        // Not showing toast for this as it can be spammy
      }
    }
  }, [formattingOptions, mounted]);


  // Effect for regenerating previews and TOC when content or formatting changes
  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(currentBook, formattingOptions);
      setPaginatedPreview(newPreview);
      
      // Adjust current preview page index if it's out of bounds
      const newPageIndex = newPreview.length > 0 ? Math.min(currentPreviewPageIndex, newPreview.length - 1) : 0;
      if (newPageIndex !== currentPreviewPageIndex) {
        setCurrentPreviewPageIndex(newPageIndex);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook, formattingOptions, mounted]); // currentBook directly, as chapters array or title change matters


  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4 md:p-8 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl md:text-3xl">Cargando EscribaLibro...</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const handleSaveBookAsTxt = () => {
    if (!currentBook) {
      toast({ title: "Error al Guardar", description: "No hay un libro activo para guardar.", variant: "destructive" });
      return;
    }

    let txtContent = `Título: ${currentBook.title || 'Sin Título'}\n`;
    if(currentBook.subtitle) txtContent += `Subtítulo: ${currentBook.subtitle}\n`;
    txtContent += `Autor: ${currentBook.author || 'Desconocido'}\n`;
    if(currentBook.editorial) txtContent += `Editorial: ${currentBook.editorial}\n`;
    txtContent += "\n";
    
    const tocForTxt = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
    if (tocForTxt.length > 0) {
      txtContent += "Índice de Capítulos (estimado):\n";
      tocForTxt.forEach(entry => {
        txtContent += `- ${entry.title} (pág. ~${entry.estimatedPage})\n`;
      });
      txtContent += "\n";
    }

    txtContent += "## Contenido del Libro ##\n\n";
    
    (currentBook.chapters || []).forEach(chapter => {
      txtContent += `## ${chapter.title}\n`;
      // Replace data URI images with a placeholder in TXT
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
      description: `"${currentBook.title}" se ha descargado como ${filename}. Las imágenes no se incluyen en TXT.`,
      duration: 4000,
    });
  };
  
  const handleOpenBookFromTxt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const newBook = createInitialBook(); 
          newBook.chapters = []; // Start with empty chapters

          const lines = text.split('\n');
          let currentChapterTitle = "Capítulo sin Título";
          let currentChapterContent: string[] = [];
          let parsingContent = false;
          let inHeaderSection = true;

          for (const line of lines) {
            if (inHeaderSection) {
              const titleMatch = line.match(/^Título:\s*(.*)/);
              if (titleMatch) { newBook.title = titleMatch[1].trim(); continue; }
              const subtitleMatch = line.match(/^Subtítulo:\s*(.*)/);
              if (subtitleMatch) { newBook.subtitle = subtitleMatch[1].trim(); continue; }
              const authorMatch = line.match(/^Autor:\s*(.*)/);
              if (authorMatch) { newBook.author = authorMatch[1].trim(); continue; }
              const editorialMatch = line.match(/^Editorial:\s*(.*)/);
              if (editorialMatch) { newBook.editorial = editorialMatch[1].trim(); continue; }
              if (line.trim() === "## Contenido del Libro ##") {
                inHeaderSection = false;
                parsingContent = true;
                continue;
              }
              // If no specific header, assume content might start or it's part of a preamble.
              // For simplicity, if we hit a line that's not a known header and not content marker,
              // and not yet parsing content, we might assume content starts loosely.
              // However, the "## Contenido del Libro ##" marker is preferred.
              // If this marker is missing, parsing chapters becomes ambiguous from metadata.
            }
            
            if (parsingContent) {
              if (line.startsWith('## ')) {
                if (currentChapterContent.length > 0 || newBook.chapters.length > 0 || currentChapterTitle !== "Capítulo sin Título") { // Push previous chapter if exists
                  newBook.chapters.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                    title: currentChapterTitle,
                    content: currentChapterContent.join('\n').trim(),
                  });
                }
                currentChapterTitle = line.substring(3).trim();
                currentChapterContent = [];
              } else {
                currentChapterContent.push(line);
              }
            }
          }
          // Push the last chapter
          if (currentChapterTitle || currentChapterContent.length > 0) {
             newBook.chapters.push({
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                title: currentChapterTitle || "Capítulo Final", // Default title if somehow empty
                content: currentChapterContent.join('\n').trim(),
              });
          }
          
          if (newBook.chapters.length === 0) { // If no chapters parsed (e.g. old format or empty content section)
            // Try to put all non-metadata text into a single chapter
            const contentHeaderMarker = "## Contenido del Libro ##\n";
            let contentStartIndex = text.indexOf(contentHeaderMarker);
            let mainContent = "";
            if (contentStartIndex !== -1) {
                mainContent = text.substring(contentStartIndex + contentHeaderMarker.length);
            } else {
                // Fallback: assume everything after metadata is content for one chapter
                const metadataLines = text.split('\n').filter(l => 
                    l.startsWith("Título:") || l.startsWith("Subtítulo:") || l.startsWith("Autor:") || l.startsWith("Editorial:") || l.startsWith("Índice de Capítulos") || (l.startsWith("- ") && l.includes("(pág. ~")) || l.trim() === ""
                );
                mainContent = text.split('\n').slice(metadataLines.length).join('\n');
            }
             newBook.chapters.push({
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                title: 'Contenido Principal',
                content: mainContent.trim(),
             });
          }

          newBook.coverImage = null; 
          newBook.authorImage = null;
          newBook.lastModified = Date.now(); 

          setCurrentBook(newBook);
          setEditingChapterId(newBook.chapters[0]?.id || null);
          setActiveTab('editor');
          setCurrentPreviewPageIndex(0);
          toast({
            title: "Libro Cargado desde TXT",
            description: `"${newBook.title}" está listo. Imágenes no se cargan desde TXT.`,
            duration: 4000,
          });
        } catch (error) {
          console.error("Error al parsear el archivo TXT:", error);
          toast({ title: "Error de Archivo", description: "No se pudo leer el formato del archivo TXT.", variant: "destructive" });
        }
      };
      reader.readAsText(file);
      if(event.target) event.target.value = ''; 
    }
  };

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

  const handleChapterContentChange = (chapterId: string, newContent: string) => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => ch.id === chapterId ? { ...ch, content: newContent } : ch),
      lastModified: Date.now()
    }));
  };

  const handleChapterTitleChange = (chapterId: string, newTitle: string) => {
    setCurrentBook(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => ch.id === chapterId ? { ...ch, title: newTitle } : ch),
      lastModified: Date.now()
    }));
  };
  
  const handleAddNewChapter = () => {
    const newChapter = createInitialChapter();
    setCurrentBook(prev => ({
      ...prev,
      chapters: [...prev.chapters, newChapter],
      lastModified: Date.now()
    }));
    setEditingChapterId(newChapter.id); // Switch to edit the new chapter
    setActiveTab('editor'); // Ensure editor tab is active
  };

  const handleDeleteChapter = (chapterIdToDelete: string) => {
    setCurrentBook(prev => {
      const updatedChapters = prev.chapters.filter(ch => ch.id !== chapterIdToDelete);
      // If all chapters are deleted, add a new empty one
      if (updatedChapters.length === 0) {
        updatedChapters.push(createInitialChapter());
      }
      // If the deleted chapter was being edited, switch to the first available chapter
      let newEditingChapterId = editingChapterId;
      if (editingChapterId === chapterIdToDelete) {
        newEditingChapterId = updatedChapters[0]?.id || null;
      }
      setEditingChapterId(newEditingChapterId);

      return {
        ...prev,
        chapters: updatedChapters,
        lastModified: Date.now()
      };
    });
    toast({ title: "Capítulo Eliminado", description: "El capítulo ha sido eliminado.", duration: 2000 });
  };


  const handleBookDetailsChange = (field: keyof Pick<Book, 'title' | 'author' | 'subtitle' | 'editorial'>, value: string) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };
  
  const handleCoverTextFieldChange = (field: keyof Pick<Book, 'titlePosition' | 'subtitlePosition' | 'editorialPosition'>, value: CoverTextPosition) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };

  const handleAuthorImagePositionChange = (value: AuthorImagePosition) => {
    setCurrentBook(prev => ({ ...prev, authorImagePosition: value, lastModified: Date.now() }));
  };

  const handleFileRead = (file: File, callback: (result: string) => void) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if ((reader.result as string).length > 2 * 1024 * 1024) { // Limit image size to 2MB for base64
        toast({
          title: "Imagen Demasiado Grande",
          description: "La imagen seleccionada es muy grande (máx 2MB). Intenta con una de menor tamaño.",
          variant: "destructive",
          duration: 5000
        });
        return;
      }
      callback(reader.result as string);
    };
    reader.onerror = () => {
        toast({ title: "Error al Leer Archivo", description: "No se pudo leer el archivo de imagen.", variant: "destructive"});
    }
    reader.readAsDataURL(file);
  };

  const handleCoverImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, coverImage: base64Image, lastModified: Date.now() }));
      });
       if(event.target) event.target.value = ''; 
    }
  };

  const handleAuthorImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, authorImage: base64Image, lastModified: Date.now() }));
      });
       if(event.target) event.target.value = '';
    }
  };

  const handleImageInsertToContent = (event: ChangeEvent<HTMLInputElement>) => {
    if (!editingChapterId) {
        toast({title: "Sin Capítulo Seleccionado", description: "Por favor, selecciona un capítulo para insertar la imagen.", variant: "destructive"});
        return;
    }
    if (event.target.files && event.target.files[0]) {
      const imageName = event.target.files[0].name.split('.')[0] || 'imagen'; 
      handleFileRead(event.target.files[0], (base64Image) => {
        const imageMarkdown = `\n![${imageName}](${base64Image})\n`;
        
        setCurrentBook(prev => {
            const targetChapter = prev.chapters.find(ch => ch.id === editingChapterId);
            if (!targetChapter) return prev;

            // A bit complex: if textarea is focused and has selection, insert there.
            // For simplicity now, just append to the current chapter's content.
            // Proper cursor insertion would require direct textarea ref and manipulation.
            const newChapterContent = (targetChapter.content || '') + imageMarkdown;

            return {
                ...prev,
                chapters: prev.chapters.map(ch => ch.id === editingChapterId ? {...ch, content: newChapterContent} : ch),
                lastModified: Date.now()
            }
        });
        toast({title: "Imagen Insertada", description: "La imagen se añadió al capítulo actual. Recuerda que no se guarda en TXT.", duration: 3000});
      });
       if(event.target) event.target.value = '';
    }
  };

  const handleFormattingChange = (field: keyof FormattingOptions, value: string | number | boolean) => {
    setFormattingOptions(prev => ({ ...prev, [field]: value }));
  };

  const handleChangePreviewPage = (direction: 'next' | 'prev') => {
    setIsPageTransitioning(true);
    setTimeout(() => {
      setCurrentPreviewPageIndex(prev => {
        const newIndex = direction === 'next' ? prev + 1 : prev - 1;
        const totalPages = paginatedPreview.length;
        if (totalPages === 0) return 0;
        return Math.max(0, Math.min(newIndex, totalPages - 1));
      });
      setIsPageTransitioning(false);
    }, 150); // Small delay for transition effect
  };


  // Styles for the simulated page in the preview
  const simulatedPageStyle: CSSProperties = {
    width: '100%', // Takes full width of its container
    maxWidth: '500px', // Max width for readability
    minHeight: `${PAGE_CONTENT_TARGET_HEIGHT_PX}px`, // Simulate A4-like height
    padding: `${formattingOptions.previewPadding}px`,
    color: formattingOptions.textColor,
    backgroundColor: formattingOptions.pageBackgroundColor,
    fontFamily: formattingOptions.fontFamily,
    position: 'relative', // For absolute positioning of header/footer if needed
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', // More pronounced shadow
    borderRadius: 'var(--radius)', // Use theme radius
    overflow: 'hidden', // Ensure content doesn't spill
  };

  const getTextAlignClass = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'text-center';
    if (position.includes('left')) return 'text-left';
    if (position.includes('right')) return 'text-right';
    return 'text-center';
  };
  
  const getVerticalAlignClass = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'justify-center'; // Default to middle if not specified for vertical
    if (position.startsWith('top')) return 'justify-start';
    if (position.startsWith('bottom')) return 'justify-end';
    return 'justify-center'; // Middle
  };


  const createPdfPageHtml = (
    pageData: PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[]; pageNumberForFooter: number } | { type: 'cover' },
    isToc: boolean = false,
    isCover: boolean = false
  ): HTMLDivElement => {
    const pageDiv = document.createElement('div');
    // Approximate A4 aspect ratio for PDF rendering canvas
    const pdfPageWidthPx = 750; // Fixed width for rendering to canvas
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; // A4 aspect ratio

    // Base styles for all PDF pages
    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.height = `${pdfPageHeightPx}px`; // Ensures consistent page size for canvas
    pageDiv.style.padding = isCover ? '0px' : `${formattingOptions.previewPadding * 1.5}px`; // More padding for PDF text
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize * 1.2}px`; // Slightly larger for PDF
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.position = 'relative'; // Important for absolute positioned elements within
    pageDiv.style.overflow = 'hidden'; // Clip content to page boundaries

    if (isCover) {
        // Background Image for Cover
        if (currentBook.coverImage) {
            const img = document.createElement('img');
            img.src = currentBook.coverImage;
            img.style.position = 'absolute';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover'; // Cover the whole area
            img.style.zIndex = '1';
            pageDiv.appendChild(img);
        }

        // Text Overlay Container
        const textOverlay = document.createElement('div');
        textOverlay.style.position = 'absolute';
        textOverlay.style.inset = '0'; // Cover the entire page
        textOverlay.style.display = 'flex';
        textOverlay.style.flexDirection = 'column';
        textOverlay.style.padding = '40px'; // Padding for text elements
        textOverlay.style.background = currentBook.coverImage ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0) 70%)' : 'transparent'; // Gradient for readability if image exists
        textOverlay.style.zIndex = '2'; // Above image
        textOverlay.style.color = currentBook.coverImage ? 'white' : formattingOptions.textColor; // Text color based on image presence
        
        // Helper to create text containers for title, subtitle, editorial
        const createTextContainer = (textPos: CoverTextPosition | undefined, isMiddleGrow?: boolean) => {
            const container = document.createElement('div');
            container.style.width = '100%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column'; // Stack text items if multiple in one block
            container.style.textAlign = getTextAlignClass(textPos).replace('text-', '') as any;
            container.style.justifyContent = getVerticalAlignClass(textPos).replace('justify-', '') as any;
            if (isMiddleGrow && textPos?.startsWith('middle')) container.style.flexGrow = '1'; // Allow middle content to expand
            return container;
        }

        // Title
        const titleContainer = createTextContainer(currentBook.titlePosition, true);
        const titleEl = document.createElement('h1');
        titleEl.textContent = currentBook.title;
        titleEl.style.fontSize = '48px'; // Larger for PDF
        titleEl.style.fontWeight = 'bold';
        titleEl.style.textShadow = currentBook.coverImage ? '2px 2px 4px rgba(0,0,0,0.7)' : 'none';
        titleEl.style.marginBottom = '15px';
        titleContainer.appendChild(titleEl);
        textOverlay.appendChild(titleContainer);

        // Subtitle (if exists)
        if (currentBook.subtitle) {
            const subtitleContainer = createTextContainer(currentBook.subtitlePosition, !currentBook.titlePosition?.startsWith('middle'));
            const subtitleEl = document.createElement('h2');
            subtitleEl.textContent = currentBook.subtitle;
            subtitleEl.style.fontSize = '28px';
            subtitleEl.style.fontWeight = 'normal';
            subtitleEl.style.fontStyle = 'italic';
            subtitleEl.style.textShadow = currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.6)' : 'none';
            subtitleEl.style.marginBottom = '30px'; // Space after subtitle
            subtitleContainer.appendChild(subtitleEl);
            textOverlay.appendChild(subtitleContainer);
        }
        
        // Container for bottom elements (Author name, potentially Editorial)
        const bottomTextContainer = document.createElement('div');
        bottomTextContainer.style.width = '100%';
        bottomTextContainer.style.display = 'flex';
        bottomTextContainer.style.flexDirection = 'column';
        bottomTextContainer.style.justifyContent = 'flex-end'; // Push to bottom
        bottomTextContainer.style.flexGrow = '1'; // Take remaining space

        // Author Name (main, not with photo)
        const authorNameEl = document.createElement('p');
        authorNameEl.textContent = currentBook.author;
        authorNameEl.style.fontSize = '24px';
        authorNameEl.style.textAlign = 'center'; // Usually centered if not with photo
        authorNameEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
        if (!currentBook.authorImage) { // Add padding if no author photo to push it up from edge
            if (currentBook.editorialPosition !== 'bottom-center') { // Unless editorial is already there
                authorNameEl.style.paddingBottom = '20px';
            }
        }
        bottomTextContainer.appendChild(authorNameEl);


        // Editorial (if exists)
        if (currentBook.editorial) {
            const editorialContainer = createTextContainer(currentBook.editorialPosition);
            // Position editorial absolutely within textOverlay to allow any corner/side
            editorialContainer.style.position = 'absolute'; 
            editorialContainer.style.left = '0'; // Full width to allow text-align to work
            editorialContainer.style.padding = '0 40px'; // Match overlay padding
            editorialContainer.style.boxSizing = 'border-box';

            const editorialVerticalAlign = getVerticalAlignClass(currentBook.editorialPosition);
            if (editorialVerticalAlign === 'justify-start') editorialContainer.style.top = '40px';
            else if (editorialVerticalAlign === 'justify-end') editorialContainer.style.bottom = '40px';
            else { // Middle vertical align
                editorialContainer.style.top = '50%';
                editorialContainer.style.transform = 'translateY(-50%)';
            }
            
            const editorialEl = document.createElement('p');
            editorialEl.textContent = currentBook.editorial;
            editorialEl.style.fontSize = '18px';
            editorialEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
            editorialContainer.appendChild(editorialEl);
            // If editorial is specifically bottom-center, nest it within bottomTextContainer for flow.
            // Otherwise, append directly to textOverlay for absolute positioning.
            if(currentBook.editorialPosition?.startsWith('bottom') && currentBook.editorialPosition?.includes('center')){
                bottomTextContainer.appendChild(editorialContainer)
            } else {
                 textOverlay.appendChild(editorialContainer);
            }
        }
         textOverlay.appendChild(bottomTextContainer); // Add bottom container (with author name) to overlay
        pageDiv.appendChild(textOverlay); // Add text overlay to page


        // Author Photo (if exists)
        if (currentBook.authorImage) {
            const authorPhotoContainer = document.createElement('div');
            authorPhotoContainer.style.position = 'absolute'; // Position relative to pageDiv
            authorPhotoContainer.style.zIndex = '3'; // Above textOverlay
            authorPhotoContainer.style.width = '120px'; // Container width for photo and name
            authorPhotoContainer.style.textAlign = 'center';

            const pos = currentBook.authorImagePosition || 'bottom-right';
            if (pos === 'bottom-right') { authorPhotoContainer.style.bottom = '30px'; authorPhotoContainer.style.right = '30px'; }
            else if (pos === 'bottom-left') { authorPhotoContainer.style.bottom = '30px'; authorPhotoContainer.style.left = '30px'; }
            else if (pos === 'top-right') { authorPhotoContainer.style.top = '30px'; authorPhotoContainer.style.right = '30px'; }
            else if (pos === 'top-left') { authorPhotoContainer.style.top = '30px'; authorPhotoContainer.style.left = '30px'; }

            const authorImg = document.createElement('img');
            authorImg.src = currentBook.authorImage;
            authorImg.style.width = '100px'; // Photo size
            authorImg.style.height = '100px';
            authorImg.style.objectFit = 'cover';
            authorImg.style.borderRadius = '4px'; // Slightly rounded corners
            authorImg.style.border = currentBook.coverImage ? '3px solid white' : `3px solid ${formattingOptions.textColor}`;
            authorImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
            authorPhotoContainer.appendChild(authorImg);

            const authorPhotoNameEl = document.createElement('p'); // Name under author photo
            authorPhotoNameEl.textContent = currentBook.author; // Use main author name
            authorPhotoNameEl.style.fontSize = '16px';
            authorPhotoNameEl.style.color = currentBook.coverImage ? 'white' : formattingOptions.textColor;
            authorPhotoNameEl.style.marginTop = '8px';
            authorPhotoNameEl.style.textShadow = currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.8)' : 'none';
            authorPhotoContainer.appendChild(authorPhotoNameEl);
            pageDiv.appendChild(authorPhotoContainer); // Add photo container to page
        }

    } else if (isToc && 'type' in pageData && pageData.type === 'toc') {
      // Table of Contents Page
      const tocHeader = document.createElement('h2');
      tocHeader.textContent = "Índice";
      tocHeader.style.textAlign = 'center';
      tocHeader.style.fontSize = `${formattingOptions.fontSize * 2.2}px`; // Larger TOC title
      tocHeader.style.fontWeight = 'bold';
      tocHeader.style.margin = `${formattingOptions.fontSize * 1.5}px 0`;
      tocHeader.style.paddingBottom = `${formattingOptions.fontSize * 0.5}px`;
      tocHeader.style.borderBottom = `1px solid ${formattingOptions.textColor}`;
      pageDiv.appendChild(tocHeader);

      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = `0 ${formattingOptions.previewPadding * 0.5}px`; // Indent TOC list
      ul.style.flexGrow = '1'; // Allow list to take available space
      ul.style.marginTop = `${formattingOptions.fontSize}px`;

      pageData.entries.forEach(entry => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'baseline';
        li.style.padding = `${formattingOptions.fontSize * 0.5}px 0`; // Spacing for TOC items
        li.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.4)`; // Dotted line separator
        li.style.fontSize = `${formattingOptions.fontSize * 1.1}px`; // Slightly larger TOC items

        const titleSpan = document.createElement('span');
        titleSpan.textContent = entry.title;
        titleSpan.style.marginRight = '15px'; // Space before dots/page number
        titleSpan.style.flexGrow = '1'; // Allow title to take space
        // Add dot leader simulation if possible (complex, skipping for now for directness)
        // titleSpan.style.overflow = 'hidden';
        // titleSpan.style.textOverflow = 'ellipsis'; // if too long
        // titleSpan.style.whiteSpace = 'nowrap';

        const pageSpan = document.createElement('span');
        pageSpan.textContent = String(entry.estimatedPage);
        pageSpan.style.marginLeft = '15px'; // Space after dots/title
        pageSpan.style.fontWeight = 'normal'; // Page number normal weight

        li.appendChild(titleSpan);
        li.appendChild(pageSpan);
        ul.appendChild(li);
      });
      pageDiv.appendChild(ul);
      
      // Footer for TOC page (just page number)
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


    } else if (!isToc && !isCover && 'rawContentLines' in pageData) {
      // Regular Content Page
      const typedPageData = pageData as PagePreviewData;

      // Header
      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; // Smaller header text
      headerDiv.style.opacity = '0.8';
      headerDiv.style.paddingBottom = '8px'; // Space below header line
      headerDiv.style.borderBottom = `1px solid hsl(var(--border))`;
      headerDiv.style.marginBottom = '20px'; // Space between header and content
      headerDiv.style.flexShrink = '0'; // Prevent header from shrinking
      const headerLeft = document.createElement('span');
      headerLeft.textContent = typedPageData.headerLeft;
      const headerRight = document.createElement('span');
      headerRight.textContent = typedPageData.headerRight;
      headerDiv.appendChild(headerLeft);
      headerDiv.appendChild(headerRight);
      pageDiv.appendChild(headerDiv);

      // Content Area
      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1'; // Allow content to fill space
      contentAreaDiv.style.overflowY = 'hidden'; // Prevent internal scrollbars on canvas
      let isAfterChapterHeading = false; // Track if current paragraph follows a heading

      typedPageData.rawContentLines.forEach((line, lineIdx) => {
        if (line.trim() === PAGE_BREAK_MARKER) return; // Skip page break markers

        const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = `${formattingOptions.fontSize * 1}px 0`; // Space around image
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '85%'; // Limit image width in PDF
          img.style.maxHeight = '400px'; // Limit image height
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
          isAfterChapterHeading = false; // Reset for next paragraph
        } else {
          const p = document.createElement('p');
          if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
             // Placeholder for non-data URI images
             const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
             p.innerHTML = `<span style="font-style: italic; color: #888; text-align: center; display: block;">[Imagen: ${altText || 'Referencia de imagen externa'}]</span>`;
             isAfterChapterHeading = false;
          } else {
            p.innerHTML = line.trim() === '' ? '&nbsp;' : line; // Handle empty lines
            if (line.trim() !== '') {
                 p.style.textIndent = isAfterChapterHeading ? '0' : '1.5em'; // No indent after chapter heading
                 isAfterChapterHeading = false; // Reset for next paragraph
            }
          }
          p.style.margin = `${formattingOptions.fontSize * 0.4}px 0`; // Paragraph margin
          p.style.textAlign = 'justify'; // Justify text for book look

          if (line.startsWith('## ')) {
            p.style.fontSize = `${formattingOptions.fontSize * 1.8}px`; // Larger chapter titles
            p.style.fontWeight = 'bold';
            p.style.marginTop = `${formattingOptions.fontSize * 1.5}px`; // More space above chapter title
            p.style.marginBottom = `${formattingOptions.fontSize * 0.8}px`;
            p.style.textAlign = 'left'; // Chapter titles usually left-aligned
            p.style.textIndent = '0'; // No indent for chapter titles
            p.textContent = line.substring(3).trim();
            isAfterChapterHeading = true; // Next paragraph should not be indented
          }
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
      footerDiv.style.flexShrink = '0'; // Prevent footer from shrinking
      footerDiv.textContent = typedPageData.footerCenter; // Page number
      switch (formattingOptions.pageNumberAlignment) {
        case 'left': footerDiv.style.textAlign = 'left'; break;
        case 'right': footerDiv.style.textAlign = 'right'; break;
        default: footerDiv.style.textAlign = 'center'; break;
      }
      pageDiv.appendChild(footerDiv);
    }
    return pageDiv;
  };


  const handleExportToPdf = async () => {
    if (!currentBook || (!getFullContentString(currentBook.chapters) && !currentBook.title)) {
       toast({ title: "Libro Vacío", description: "No hay contenido para exportar a PDF.", variant: "destructive" });
       return;
    }
    setIsExportingPdf(true);
    toast({ title: "Exportación a PDF Iniciada", description: "Generando tu libro, por favor espera..." });

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' }); // Standard A4 size
    const pdfWidthPt = pdf.internal.pageSize.getWidth();
    const pdfHeightPt = pdf.internal.pageSize.getHeight();
    
    // Temporary container for rendering pages to canvas
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed'; // Off-screen
    tempContainer.style.left = '-9999px'; 
    tempContainer.style.top = '-9999px'; 
    tempContainer.style.width = '750px'; // Match PDF page rendering width
    tempContainer.style.height = `${750 * 1.414}px`; // Match PDF page rendering height
    tempContainer.style.zIndex = '-1'; // Ensure it's not visible
    tempContainer.style.opacity = '0'; // Ensure it's not visible
    document.body.appendChild(tempContainer);

    const renderedCanvases: { type: 'cover' | 'toc' | 'content', canvas: HTMLCanvasElement, originalPageNumber: number }[] = [];
    let pdfPageCounter = 0; // Tracks the actual page number in the PDF document

    // 1. Render Cover Page (if applicable)
    if (currentBook.coverImage || currentBook.title) { // Condition to render a cover
        pdfPageCounter++;
        const coverPageDiv = createPdfPageHtml({ type: 'cover' }, false, true);
        tempContainer.innerHTML = ''; // Clear previous content
        tempContainer.appendChild(coverPageDiv);
        try {
            const coverCanvas = await html2canvas(coverPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: coverPageDiv.scrollWidth, windowHeight: coverPageDiv.scrollHeight });
            renderedCanvases.push({ type: 'cover', canvas: coverCanvas, originalPageNumber: pdfPageCounter });
        } catch (e) {
            console.error("Error rendering cover for PDF:", e);
            toast({title: "Error Portada PDF", description: "Hubo un problema al renderizar la portada.", variant: "destructive"});
        }
    }
    
    // 2. Paginate content for PDF generation (this gives us the structure and page numbers for TOC)
    const contentPagesForPdfGeneration = generatePagePreviews(currentBook, formattingOptions); 
    
    // Calculate where content pages will start in PDF to adjust TOC page numbers
    let tocPageCount = (currentBook.chapters && currentBook.chapters.length > 0 && formattingOptions.tocPosition !== 'none') ? 1 : 0; // Assuming TOC is one page for now
    let contentStartPdfPageAfterToc = pdfPageCounter + tocPageCount + 1;


    // 3. Render Table of Contents Page (if 'start' and applicable)
    if (formattingOptions.tocPosition === 'start' && currentBook.chapters && currentBook.chapters.length > 0) {
        pdfPageCounter++;
        const tocPdfPageNumberForFooter = pdfPageCounter; // TOC page's own number in PDF
        // Generate TOC entries with page numbers relative to content start in PDF
        const tocEntriesForPdf = generateTableOfContents(contentPagesForPdfGeneration, currentBook.chapters)
            .map(entry => ({
                ...entry,
                estimatedPage: contentStartPdfPageAfterToc + entry.estimatedPage -1 
            }));


        const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter }, true);
        tempContainer.innerHTML = '';
        tempContainer.appendChild(tocPageDiv);
        const tocCanvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
        renderedCanvases.push({ type: 'toc', canvas: tocCanvas, originalPageNumber: tocPdfPageNumberForFooter });
    }

    // 4. Render Content Pages
    for (const pageData of contentPagesForPdfGeneration) {
      pdfPageCounter++;
      const actualPdfPageForThisContent = pdfPageCounter; // The true page number in the final PDF
      // Update footer text for this specific PDF page
      const pdfPageData = { ...pageData, footerCenter: `Página ${actualPdfPageForThisContent}` }; 
      
      const pageDiv = createPdfPageHtml(pdfPageData);
      tempContainer.innerHTML = '';
      tempContainer.appendChild(pageDiv);
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
      renderedCanvases.push({ type: 'content', canvas, originalPageNumber: actualPdfPageForThisContent });
    }
    
    // 5. Render Table of Contents Page (if 'end' and applicable)
    if (formattingOptions.tocPosition === 'end' && currentBook.chapters && currentBook.chapters.length > 0) {
        pdfPageCounter++;
        const tocPdfPageNumberForFooter = pdfPageCounter;
        
        // Content start page needs to be determined based on whether a cover was present
        let contentStartPageNumberInPdfActual = 1; 
        if (renderedCanvases.find(rc => rc.type === 'cover')) contentStartPageNumberInPdfActual++;
        // If TOC was at start, it would have already been counted by contentStartPdfPageAfterToc logic

        const tocEntriesForPdf = generateTableOfContents(contentPagesForPdfGeneration, currentBook.chapters)
            .map(entry => ({
                ...entry,
                // Page numbers for TOC at end refer to pages *before* the TOC itself
                estimatedPage: contentStartPageNumberInPdfActual + entry.estimatedPage -1
            }));

        const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter }, true);
        tempContainer.innerHTML = '';
        tempContainer.appendChild(tocPageDiv);
        const tocCanvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
        renderedCanvases.push({ type: 'toc', canvas: tocCanvas, originalPageNumber: tocPdfPageNumberForFooter });
    }

    // Sort all rendered canvases by their intended original page number
    renderedCanvases.sort((a,b) => a.originalPageNumber - b.originalPageNumber);

    // Add canvases to PDF
    renderedCanvases.forEach((render, index) => {
      if (index > 0) pdf.addPage();
      const canvas = render.canvas;
      const imgData = canvas.toDataURL('image/png', 0.92); // High quality PNG
      
      // Scale image to fit PDF page while maintaining aspect ratio
      const canvasAspectRatio = canvas.width / canvas.height;
      const pdfPageAspectRatio = pdfWidthPt / pdfHeightPt;
      let imgWidthPt, imgHeightPt;

      if (canvasAspectRatio > pdfPageAspectRatio) { // Canvas is wider than PDF page
          imgWidthPt = pdfWidthPt;
          imgHeightPt = pdfWidthPt / canvasAspectRatio;
      } else { // Canvas is taller or same aspect ratio
          imgHeightPt = pdfHeightPt;
          imgWidthPt = pdfHeightPt * canvasAspectRatio;
      }
      
      // Center image on PDF page
      const xOffset = (pdfWidthPt - imgWidthPt) / 2;
      const yOffset = (pdfHeightPt - imgHeightPt) / 2;

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidthPt, imgHeightPt);
    });

    document.body.removeChild(tempContainer); // Clean up
    pdf.save(`${(currentBook.title || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };

  const handleExportToTxt = handleSaveBookAsTxt; // Re-use the same function


  const handleExportToHtml = () => {
    if (!currentBook || (!getFullContentString(currentBook.chapters) && !currentBook.title && !currentBook.author)) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como HTML.", variant: "destructive" });
      return;
    }

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
          
          .cover-section { height: 100vh; display: flex; flex-direction: column; text-align: center; position: relative; background-color: #333; color: white; padding: 20px; box-sizing: border-box; overflow: hidden; }
          .cover-section img.cover-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
          .cover-section .text-overlay { position: relative; z-index: 2; background: ${currentBook.coverImage ? 'rgba(0,0,0,0.6)' : 'transparent'}; color: ${currentBook.coverImage ? 'white' : formattingOptions.textColor}; padding: 40px; border-radius: 8px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
          
          .cover-title-container { width: 100%; display: flex; flex-direction: column; text-align: ${getTextAlignClass(currentBook.titlePosition).replace('text-','')}; justify-content: ${getVerticalAlignClass(currentBook.titlePosition).replace('justify-','')}; ${currentBook.titlePosition?.startsWith('middle') ? 'flex-grow: 1;' : ''} }
          .cover-section h1.book-title-cover { font-size: ${formattingOptions.fontSize * 3.5}px; margin-bottom: 0.2em; text-shadow: ${currentBook.coverImage ? '2px 2px 5px rgba(0,0,0,0.8)' : 'none'}; }
          
          .cover-subtitle-container { width: 100%; display: flex; flex-direction: column; text-align: ${getTextAlignClass(currentBook.subtitlePosition).replace('text-','')}; justify-content: ${getVerticalAlignClass(currentBook.subtitlePosition).replace('justify-','')}; ${currentBook.subtitlePosition?.startsWith('middle') && !currentBook.titlePosition?.startsWith('middle') ? 'flex-grow: 1;' : ''} }
          .cover-section h2.book-subtitle-cover { font-size: ${formattingOptions.fontSize * 2}px; font-style: italic; margin-bottom: 1em; text-shadow: ${currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.7)' : 'none'}; }
          
          .cover-author-container { width: 100%; display: flex; flex-direction: column; text-align: center; justify-content: flex-end; flex-grow: 1; }
          .cover-section p.author-name-main { font-size: ${formattingOptions.fontSize * 1.5}px; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.6)' : 'none'}; margin-top: 1em; ${!currentBook.authorImage && currentBook.editorialPosition !== 'bottom-center' ? `padding-bottom: ${formattingOptions.fontSize * 1.5}px;` /* More space if no photo and editorial not at bottom center */ : ''} }

          .cover-editorial-container { width: 100%; position: absolute; left: 0; padding: 0 40px; box-sizing: border-box; text-align: ${getTextAlignClass(currentBook.editorialPosition).replace('text-','')}; z-index: 3;
            ${(() => { const v = getVerticalAlignClass(currentBook.editorialPosition); if (v === 'justify-start') return 'top: 40px;'; if (v === 'justify-end') return 'bottom: 40px;'; return 'top: 50%; transform: translateY(-50%);'; })()}
          }
          .cover-section p.editorial-name-cover { font-size: ${formattingOptions.fontSize * 1}px; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none'}; }

          .author-photo-container-cover {
            position: absolute;
            width: 150px; /* Container for photo and name */
            text-align: center;
            z-index: 3; /* Above text overlay gradient */
            ${currentBook.authorImagePosition === 'bottom-right' ? 'bottom: 40px; right: 40px;' : ''}
            ${currentBook.authorImagePosition === 'bottom-left' ? 'bottom: 40px; left: 40px;' : ''}
            ${currentBook.authorImagePosition === 'top-right' ? 'top: 40px; right: 40px;' : ''}
            ${currentBook.authorImagePosition === 'top-left' ? 'top: 40px; left: 40px;' : ''}
          }
          .author-photo-container-cover img.author-image-cover { width: 120px; height: 120px; object-fit: cover; border-radius: 6px; border: ${currentBook.coverImage ? '3px solid white' : `3px solid ${formattingOptions.textColor}`}; box-shadow: 0 3px 7px rgba(0,0,0,0.5); margin-bottom: 8px; }
          .author-photo-container-cover p.author-name-photo { font-size: ${formattingOptions.fontSize * 1}px; margin-top: 0; text-shadow: ${currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.8)' : 'none'}; color: ${currentBook.coverImage ? 'white' : formattingOptions.textColor}; }
          
          h1, h2, h3 { color: ${formattingOptions.textColor}; }
          h1.book-title-content { font-size: ${formattingOptions.fontSize * 2.5}px; text-align: center; margin-bottom: 0.1em; }
          h3.author-name-content { font-size: ${formattingOptions.fontSize * 1.4}px; text-align: center; font-style: italic; margin-top:0; margin-bottom: 2.5em; }
          h2.chapter-title-html { font-size: ${formattingOptions.fontSize * 1.8}px; margin-top: 2.5em; margin-bottom: 1em; padding-bottom: 0.4em; border-bottom: 2px solid ${formattingOptions.textColor}; text-indent:0; }
          .content-image { max-width: 90%; height: auto; display: block; margin: 2em auto; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.15); }
          
          .html-paragraph { margin-bottom: ${formattingOptions.fontSize * 0.7}px; text-align: justify; text-indent: 1.5em; }
          .html-paragraph:first-of-type, .chapter-title-html + .html-paragraph { text-indent: 0; } 
          
          .toc { border: 1px solid #e0e0e0; padding: 20px 30px; margin-bottom: 35px; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .toc h2 { text-align: center; margin-top: 0; font-size: ${formattingOptions.fontSize * 1.6}px; margin-bottom: 20px; }
          .toc ul { list-style-type: none; padding-left: 0; }
          .toc li { margin-bottom: 10px; font-size: ${formattingOptions.fontSize * 1.05}px; display: flex; justify-content: space-between; align-items: baseline; }
          .toc li .toc-title { flex-grow: 1; margin-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .toc li .toc-page { font-weight: normal; margin-left: auto; padding-left:10px; }
          .page-break-before { page-break-before: always; }
          .page-break-html { border-top: 1px dashed #ccc; margin: 2em 0; text-align: center; color: #aaa; font-size: 0.9em; }
          .page-break-html::before { content: "--- Salto de Página Manual ---"; }
        </style>
      </head>
      <body>
    `;

    // Cover Section
    htmlString += '<div class="cover-section">\n';
    if (currentBook.coverImage) {
      htmlString += `  <img src="${currentBook.coverImage}" alt="Portada del Libro" class="cover-image-bg" data-ai-hint="book cover" />\n`;
    }
    htmlString += '  <div class="text-overlay">\n'; // Text overlay for readability
    htmlString += `    <div class="cover-title-container"><h1 class="book-title-cover">${currentBook.title || 'Libro sin Título'}</h1></div>\n`;
    if (currentBook.subtitle) {
      htmlString += `    <div class="cover-subtitle-container"><h2 class="book-subtitle-cover">${currentBook.subtitle}</h2></div>\n`;
    }
     // Add editorial to cover if present
     if (currentBook.editorial) { 
        // This container is absolutely positioned by CSS based on editorialPosition
        htmlString += `  <div class="cover-editorial-container"><p class="editorial-name-cover">${currentBook.editorial}</p></div>\n`;
    }
    // Author name at the bottom (main one, not with photo)
    // Adjust padding if editorial is at bottom center to avoid overlap
    if (!(currentBook.editorial && currentBook.editorialPosition === 'bottom-center')) {
        htmlString += `    <div class="cover-author-container"><p class="author-name-main">${currentBook.author || 'Autor Desconocido'}</p></div>\n`;
    } else if (!currentBook.authorImage && currentBook.editorial && currentBook.editorialPosition === 'bottom-center') {
         // If editorial is at bottom-center AND no author image, add more padding to author name
         htmlString += `    <div class="cover-author-container" style="padding-bottom: ${formattingOptions.fontSize * 2.5}px;"><p class="author-name-main">${currentBook.author || 'Autor Desconocido'}</p></div>\n`;
    } else {
        htmlString += `    <div class="cover-author-container"><p class="author-name-main">${currentBook.author || 'Autor Desconocido'}</p></div>\n`;
    }

    htmlString += '  </div>\n'; // End text-overlay
    // Author photo on top of everything if exists
    if (currentBook.authorImage) {
      htmlString += '  <div class="author-photo-container-cover">\n';
      htmlString += `    <img src="${currentBook.authorImage}" alt="Foto del Autor" class="author-image-cover" data-ai-hint="portrait person" />\n`;
      htmlString += `    <p class="author-name-photo">${currentBook.author}</p>\n`; // Name under photo
      htmlString += '  </div>\n';
    }
    htmlString += '</div>\n'; // End cover-section

    // Table of Contents HTML
    const tocForHtml = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
    const tocHtml = (tocForHtml.length > 0) ? `
      <div class="toc ${formattingOptions.tocPosition === 'start' ? '' : 'page-break-before'}">
        <h2>Índice</h2>
        <ul>
          ${tocForHtml.map(entry => `<li><span class="toc-title">${entry.title}</span> <span class="toc-page">${entry.estimatedPage}</span></li>`).join('\n')}
        </ul>
      </div>
    ` : '';
    
    // Book Content Container
    if (formattingOptions.tocPosition === 'start') {
      htmlString += `<div class="book-container page-break-before">${tocHtml}`;
    } else {
      htmlString += '<div class="book-container page-break-before">\n'; // Add page break before content if TOC is not first
    }

    // Process and add content from chapters
    const fullContentForHtml = (currentBook.chapters || [])
      .map(chapter => {
        let chapterHtml = `<h2 class="chapter-title-html page-break-before">${chapter.title}</h2>\n`;
        chapterHtml += chapter.content.split('\n').map(line => {
          if (line.trim() === PAGE_BREAK_MARKER) {
            return `<div class="page-break-html"></div>`;
          }
          const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
          if (imageMatch) {
            const [, altText, imgSrc] = imageMatch;
            return `<img src="${imgSrc}" alt="${altText || 'Imagen insertada'}" class="content-image" data-ai-hint="illustration drawing" />`;
          } else if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
              const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
              return `<p style="font-style: italic; color: #888; text-align: center;">[Imagen: ${altText || 'Referencia de imagen externa'}]</p>`;
          }
          return line.trim() === '' ? `<p class="html-paragraph">&nbsp;</p>` : `<p class="html-paragraph">${line}</p>`;
        }).join('\n');
        return chapterHtml;
      })
      .join('\n');

    htmlString += fullContentForHtml;

    if (formattingOptions.tocPosition === 'end') {
      htmlString += tocHtml;
    }

    htmlString += '</div>\n'; // End book-container
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


  const currentEditingChapter = currentBook.chapters.find(ch => ch.id === editingChapterId);
  const displayedTableOfContents = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
  const currentPreviewPageData = paginatedPreview[currentPreviewPageIndex];

  // For cover preview
  const authorImagePositionClasses: Record<AuthorImagePosition, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };
  
  // Helper for positioning text elements on the cover preview
  const coverTextPositionClasses = (position: CoverTextPosition | undefined, elementType : 'title' | 'subtitle' | 'editorial'): string => {
    if (!position) return 'items-center justify-center text-center'; // Default if undefined
    
    let classes = 'absolute inset-0 flex flex-col p-3 md:p-4 z-10 pointer-events-none '; // Base for absolute positioning

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


  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans">
      <header className="mb-6 md:mb-8 pb-4 border-b border-border">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <BookIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold text-primary">EscribaLibro</h1>
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

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col container mx-auto">
        <TabsList className="mx-auto mb-6 shadow-sm w-full max-w-3xl grid grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="editor" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <BookOpen className="mr-1.5 h-4 w-4" /> Editor
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
        </TabsList>

        <div className="flex flex-1 flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/2 flex flex-col gap-6">
            <TabsContent value="editor" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookOpen className="mr-2 h-5 w-5 text-primary" />Editor de Contenido</CardTitle>
                   <CardDescription>
                    Gestiona tus capítulos. Usa `\newpage` en el contenido para saltos de página manuales.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 md:p-6 space-y-4">
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
                            <SelectItem key={ch.id} value={ch.id}>{ch.title}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleAddNewChapter} variant="outline" size="sm" className="shrink-0">
                        <PlusCircle className="mr-2 h-4 w-4"/> Añadir Capítulo
                    </Button>
                  </div>

                  {currentEditingChapter && (
                    <div className="space-y-3 flex-1 flex flex-col">
                         <div className="flex items-center gap-2">
                            <Label htmlFor="chapterTitle" className="text-sm font-medium whitespace-nowrap">Título del Capítulo:</Label>
                            <Input
                                id="chapterTitle"
                                value={currentEditingChapter.title}
                                onChange={(e) => handleChapterTitleChange(currentEditingChapter.id, e.target.value)}
                                placeholder="Título del Capítulo"
                                className="flex-grow text-sm p-2 shadow-inner"
                            />
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
                                        Esta acción no se puede deshacer. Se eliminará permanentemente el capítulo "{currentEditingChapter.title}".
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
                        <Textarea
                            id={`chapterContent-${currentEditingChapter.id}`}
                            value={currentEditingChapter.content}
                            onChange={(e) => handleChapterContentChange(currentEditingChapter.id, e.target.value)}
                            placeholder="Escribe el contenido de este capítulo aquí..."
                            className="flex-1 w-full min-h-[250px] md:min-h-[350px] text-sm p-3 rounded-md shadow-inner bg-background/70 border-input focus:bg-background"
                        />
                    </div>
                  )}
                  {!currentEditingChapter && currentBook.chapters.length > 0 && (
                    <div className="text-center text-muted-foreground p-8 border rounded-md bg-muted/30">
                        <Edit3 className="mx-auto h-10 w-10 opacity-50 mb-2" />
                        <p>Por favor, selecciona un capítulo de la lista para editarlo o añade uno nuevo.</p>
                    </div>
                  )}
                   {!currentEditingChapter && currentBook.chapters.length === 0 && (
                     <div className="text-center text-muted-foreground p-8 border rounded-md bg-muted/30">
                        <p>No hay capítulos. ¡Añade uno para empezar!</p>
                    </div>
                  )}
                   <p className="text-xs text-muted-foreground mt-2">Consejo: Escribe `\newpage` en una línea dentro del contenido del capítulo para forzar un salto de página.</p>
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insertar Imagen en Capítulo
                    </Label>
                    <Input id="insertImageContent" type="file" accept="image/*" onChange={handleImageInsertToContent} className="hidden" />
                    <p className="text-xs text-muted-foreground mt-1">Las imágenes son para esta sesión y se exportan a PDF/HTML, no se guardan en TXT.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

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
                            <span className="truncate pr-2">{entry.title}</span>
                            <span className="text-muted-foreground font-mono text-xs">Pág. aprox. {entry.estimatedPage}</span>
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
                   <div className="mt-4 space-y-2">
                      <Label htmlFor="tocPosition" className="text-sm font-medium">Posición del Índice (en PDF/HTML)</Label>
                      <Select onValueChange={(value) => handleFormattingChange('tocPosition', value as 'start' | 'end')} value={formattingOptions.tocPosition}>
                        <SelectTrigger id="tocPosition" className="mt-1 text-sm">
                          <SelectValue placeholder="Seleccionar posición del índice" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="start">Al Principio del Libro</SelectItem>
                          <SelectItem value="end">Al Final del Libro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="formatting" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl">
                    <Paintbrush className="mr-2 h-5 w-5 text-primary" /> Opciones de Formato
                  </CardTitle>
                  <CardDescription>Personaliza la apariencia. Se guardan en tu navegador.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-4 md:p-6">
                  <div className="space-y-2">
                    <Label htmlFor="fontFamily" className="text-sm font-medium">Fuente Principal</Label>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fontSize" className="text-sm font-medium">Tamaño Fuente (px)</Label>
                      <Input id="fontSize" type="number" value={formattingOptions.fontSize} onChange={(e) => handleFormattingChange('fontSize', Math.max(8, parseInt(e.target.value,10)))} className="mt-1 text-sm"/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lineHeight" className="text-sm font-medium">Altura Línea (ej: 1.6)</Label>
                      <Input id="lineHeight" type="number" value={formattingOptions.lineHeight} step="0.1" min="0.5" onChange={(e) => handleFormattingChange('lineHeight', parseFloat(e.target.value))} className="mt-1 text-sm"/>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label htmlFor="textColor" className="text-sm font-medium">Color Texto</Label>
                      <Input id="textColor" type="color" value={formattingOptions.textColor} onChange={(e) => handleFormattingChange('textColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pageBackgroundColor" className="text-sm font-medium">Fondo Página (Vista)</Label>
                      <Input id="pageBackgroundColor" type="color" value={formattingOptions.pageBackgroundColor} onChange={(e) => handleFormattingChange('pageBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="previewAreaBackground" className="text-sm font-medium">Fondo Área Vista Previa</Label>
                      <Input id="previewAreaBackground" type="color" value={formattingOptions.previewBackgroundColor} onChange={(e) => handleFormattingChange('previewBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="previewPadding" className="text-sm font-medium">Relleno Página (px en vista)</Label>
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

            <TabsContent value="cover" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Palette className="mr-2 h-5 w-5 text-primary" />Diseñador de Portada</CardTitle>
                  <CardDescription>Personaliza portada. Imágenes para esta sesión (no en TXT).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  <div className="space-y-2">
                    <Label htmlFor="bookTitleInput" className="text-sm font-medium">Título del Libro</Label>
                    <Input id="bookTitleInput" value={currentBook.title || ''} onChange={(e) => handleBookDetailsChange('title', e.target.value)} placeholder="El Título de tu Gran Libro" className="mt-1 text-sm p-2 shadow-inner"/>
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
                  <div className="space-y-2">
                    <Label htmlFor="authorName" className="text-sm font-medium">Nombre del Autor/a</Label>
                    <Input id="authorName" value={currentBook.author || ''} onChange={(e) => handleBookDetailsChange('author', e.target.value)} placeholder="Tu Nombre como Autor/a" className="mt-1 text-sm p-2 shadow-inner"/>
                  </div>

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

                  {/* Mini Preview of Cover in Cover Tab */}
                  {(currentBook.coverImage || currentBook.authorImage || currentBook.title) && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col shadow-inner overflow-hidden relative">
                         {currentBook.coverImage && <NextImage src={currentBook.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />}
                         
                         {/* Title on Mini Preview */}
                         <div className={`${coverTextPositionClasses(currentBook.titlePosition, 'title')}`}>
                           <h3 className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.title}</h3>
                         </div>
                          {/* Subtitle on Mini Preview */}
                          {currentBook.subtitle && (
                            <div className={`${coverTextPositionClasses(currentBook.subtitlePosition, 'subtitle')}`}>
                                <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words mt-1"><em>{currentBook.subtitle}</em></p>
                            </div>
                          )}
                          {/* Editorial on Mini Preview */}
                           {currentBook.editorial && (
                            <div className={`${coverTextPositionClasses(currentBook.editorialPosition, 'editorial')}`}>
                                <p className="text-[10px] text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words">{currentBook.editorial}</p>
                            </div>
                          )}

                         {/* Author Image on Mini Preview */}
                         {currentBook.authorImage && (
                            <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-16 h-20 z-20 flex flex-col items-center text-center pointer-events-none`}>
                                <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={60} height={60} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                                <p className="text-[10px] text-white mt-0.5 [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words leading-tight">{currentBook.author}</p>
                            </div>
                         )}
                          {/* Author Name (if no image and editorial not at bottom) on Mini Preview */}
                          {!currentBook.authorImage && !(currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) && ( 
                             <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none items-center justify-end text-center`}>
                               <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words pb-1"><em>{currentBook.author}</em></p>
                             </div>
                          )}
                       </div>
                    )}
                    {/* Placeholder if no cover elements */}
                    {!currentBook.coverImage && !currentBook.authorImage && !currentBook.title && (
                      <div className="mt-4 p-2 border border-dashed rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted/50 flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={36} className="mb-2 opacity-70" />
                        <p className="text-xs text-center">Sube imágenes y añade detalles para la portada.</p>
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Right Panel: Live Preview */}
          <div className="w-full lg:w-1/2 lg:sticky lg:top-8"> 
            <Card className="shadow-lg h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><FileSearch className="mr-2 h-5 w-5 text-primary" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Observa cómo tu libro toma forma. La paginación es aproximada.</CardDescription>
              </CardHeader>
              <CardContent
                className="overflow-y-auto p-3 md:p-4 flex-grow" // Added flex-grow
                style={{
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  borderRadius: 'var(--radius)', // Consistent rounding
                }}
              >
                {activeTab === 'cover' ? (
                  // Cover Preview
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col shadow-lg overflow-hidden relative" 
                    style={{
                        backgroundColor: currentBook.coverImage ? '#333' : formattingOptions.pageBackgroundColor, // Dark bg if image, else theme
                        color: currentBook.coverImage ? 'white' : formattingOptions.textColor // White text on image
                    }}>
                    {currentBook.coverImage ? (
                      <NextImage src={currentBook.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">Sin imagen de portada</p>
                      </div>
                    )}
                    {/* Cover Text Elements - Title */}
                     <div className={`${coverTextPositionClasses(currentBook.titlePosition, 'title')}`}>
                        <h2 className="text-xl md:text-2xl font-bold [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight break-words">{currentBook.title}</h2>
                     </div>
                     {/* Cover Text Elements - Subtitle */}
                     {currentBook.subtitle && (
                       <div className={`${coverTextPositionClasses(currentBook.subtitlePosition, 'subtitle')}`}>
                          <p className="text-base md:text-lg [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] italic break-words">{currentBook.subtitle}</p>
                       </div>
                     )}
                     {/* Cover Text Elements - Editorial */}
                     {currentBook.editorial && (
                        <div className={`${coverTextPositionClasses(currentBook.editorialPosition, 'editorial')}`}>
                            <p className="text-sm [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words">{currentBook.editorial}</p>
                        </div>
                     )}
                     {/* Cover Text Elements - Author Name (if no author photo and editorial not at bottom) */}
                     {!currentBook.authorImage && !(currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) && (
                         <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none items-center justify-end text-center`}>
                            <p className="text-base md:text-lg [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] pb-2 break-words"><em>{currentBook.author}</em></p>
                         </div>
                     )}
                    {/* Author Image on Cover Preview */}
                    {currentBook.authorImage && (
                        <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-24 z-20 flex flex-col items-center text-center p-1 bg-black/20 rounded pointer-events-none`}>
                            <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={70} height={70} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                            <p className="text-xs text-white mt-1 [text-shadow:1px_1px_1px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.author}</p>
                        </div>
                    )}
                  </div>
                ) : paginatedPreview.length > 0 && currentPreviewPageData ? (
                  // Paginated Content Preview
                  <div
                    key={`${currentPreviewPageData.pageNumber}-${currentPreviewPageIndex}`} // Ensure re-render on page change for animation
                    className="page-simulation-wrapper mx-auto my-4 prose-sm md:prose max-w-none" // prose for basic text styling
                    style={{
                      ...simulatedPageStyle,
                      opacity: isPageTransitioning ? 0 : 1,
                      transition: 'opacity 0.15s ease-in-out', // Fade transition
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
                  // Fallback for empty content preview
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
                    <h3 className="text-lg font-semibold mb-1">{currentBook.title || 'Libro sin Título'}</h3>
                    <p className="text-sm italic mb-3">por {currentBook.author || 'Autor Desconocido'}</p>
                    <p className="text-xs italic text-muted-foreground">
                      La vista previa del contenido aparecerá aquí paginada.
                    </p>
                    { (getFullContentString(currentBook.chapters).trim() === "") &&
                      <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor para ver la vista previa)</p>
                    }
                  </div>
                )}
              </CardContent>
              {/* Pagination Controls for Content Preview */}
              {activeTab !== 'cover' && paginatedPreview.length > 0 && (
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
               {activeTab !== 'cover' && paginatedPreview.length === 0 && (
                <CardFooter className="text-xs text-muted-foreground justify-center py-2.5 border-t bg-muted/50">
                  La vista previa aparecerá aquí.
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </Tabs>
      <footer className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
        <p>EscribaLibro {APP_VERSION}</p>
        <p>{COPYRIGHT_NOTICE}</p>
      </footer>
    </div>
  );
}

