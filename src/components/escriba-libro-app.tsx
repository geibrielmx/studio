
"use client";

import { useState, useEffect, type ChangeEvent, type CSSProperties, useCallback, useRef } from 'react';
import type { Book, ChapterEntry, AuthorImagePosition } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { UploadCloud, BookOpen, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode, FilePlus, Trash2, ChevronLeft, ChevronRight, UserSquare2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface FormattingOptions {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  previewBackgroundColor: string;
  pageBackgroundColor: string;
  previewPadding: number;
  lineHeight: number;
}

interface PagePreviewData {
  pageNumber: number;
  headerLeft: string;
  headerRight: string;
  contentElements: JSX.Element[];
  rawContentLines: string[];
  footerCenter: string;
  isStartOfChapter?: boolean;
  chapterTitle?: string;
}

const PAGE_CONTENT_TARGET_HEIGHT_PX = 680;
const PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX = 70;
const IMAGE_LINE_EQUIVALENT = 15; // Approximate lines an image might occupy

const LOCALSTORAGE_BOOKS_LIST_KEY = 'escribaLibro_books_list_v5';
const LOCALSTORAGE_ACTIVE_BOOK_ID_KEY = 'escribaLibro_activeBookId_v5';
const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v5';

const createInitialBook = (): Book => ({
  id: Date.now().toString() + Math.random().toString(36).substring(2, 9), // More unique ID
  title: 'Libro sin Título',
  subtitle: '',
  author: 'Autor Desconocido',
  content: '',
  coverImage: null,
  authorImage: null,
  authorImagePosition: 'bottom-right',
  tableOfContents: [],
  lastModified: Date.now(),
});


function createPageContentElements(
  lines: string[],
  pageKeyPrefix: string,
  formattingOptions: FormattingOptions
): { elements: JSX.Element[], chapterTitle?: string, isStartOfChapter?: boolean } {
  let isStartOfChapter = false;
  let chapterTitle: string | undefined = undefined;

  const elements = lines.map((paragraph, index) => {
    if (index === 0 && paragraph.startsWith('## ')) {
      isStartOfChapter = true;
      chapterTitle = paragraph.substring(3).trim();
    }
    const imageMatch = paragraph.match(/!\[(.*?)\]\((.*?)\)/);
    if (imageMatch) {
      const [, altText, imgSrc] = imageMatch;
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
              maxWidth: `calc(100% - ${formattingOptions.previewPadding * 0}px)`, // Was * 2, but padding is on pageDiv
            }}
          />
          {altText && <p className="text-xs italic mt-1" style={{ opacity: 0.8 }}>{altText}</p>}
        </div>
      );
    }
    return <p key={`${pageKeyPrefix}-line-${index}`} className="my-1.5 md:my-2">{paragraph.trim() === '' ? <>&nbsp;</> : paragraph}</p>;
  });
  return { elements, chapterTitle, isStartOfChapter };
}

function createPageObject(
  pageNumber: number,
  bookTitle: string,
  currentChapterTitleForHeader: string,
  lines: string[],
  formattingOptions: FormattingOptions
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
    isStartOfChapter: isStartOfChapter || (lines.length > 0 && lines[0].startsWith('## ')),
    chapterTitle: chapterTitle || (lines.length > 0 && lines[0].startsWith('## ') ? lines[0].substring(3).trim() : undefined),
  };
}

function generatePagePreviews(
  book: Book,
  formattingOptions: FormattingOptions
): PagePreviewData[] {
  const output: PagePreviewData[] = [];
  if (!book.content && !book.title) return output; // Guard clause for empty book

  const allLines = (book.content || '').split('\n'); // Handle null content
  const { fontSize, lineHeight } = formattingOptions;

  const actualContentAreaHeight = PAGE_CONTENT_TARGET_HEIGHT_PX - PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX;
  const estimatedLinePixelHeight = Math.max(1, fontSize * lineHeight);
  let linesPerPage = Math.max(1, Math.floor(actualContentAreaHeight / estimatedLinePixelHeight));

  let currentPageLines: string[] = [];
  let currentPageNumber = 1;
  let currentChapterForHeader = "Introducción";
  let linesAccumulatedOnCurrentPage = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isChapterHeading = line.startsWith('## ');
    let lineCost = 1;
    if (/!\[(.*?)\]\((.*?)\)/.test(line)) {
      lineCost = IMAGE_LINE_EQUIVALENT;
    }

    if (isChapterHeading) {
      if (currentPageLines.length > 0) { // If there's pending content, push it as a page
        output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
        currentPageLines = [];
        linesAccumulatedOnCurrentPage = 0;
        currentPageNumber++;
      }
      // Chapter heading always starts a new "section" for header purposes
      currentChapterForHeader = line.substring(3).trim();
      currentPageLines.push(line); // Add chapter heading to its new page
      linesAccumulatedOnCurrentPage += lineCost; // Cost of the heading line

      // If this is the last line of the book, push current page
      if (i === allLines.length - 1) {
         output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
         currentPageLines = []; // Clear for safety, though loop ends
      }
      continue; // Move to next line
    }

    // If current line would overflow the page AND there's existing content on the page
    if (linesAccumulatedOnCurrentPage + lineCost > linesPerPage && currentPageLines.length > 0) {
      output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
      currentPageLines = [];
      linesAccumulatedOnCurrentPage = 0;
      currentPageNumber++;
    }

    currentPageLines.push(line);
    linesAccumulatedOnCurrentPage += lineCost;
  }

  // Push any remaining lines as the last page
  if (currentPageLines.length > 0) {
    output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
  }

  // Ensure there's at least one page, even for an empty book, for preview consistency
  if (output.length === 0) {
     output.push(createPageObject(1, book.title || "Libro sin Título", "Inicio del Libro", [""], formattingOptions));
  }

  return output;
}

function generateTableOfContents(paginatedPreview: PagePreviewData[]): ChapterEntry[] {
  const toc: ChapterEntry[] = [];
  const chapterTitles = new Set<string>();

  paginatedPreview.forEach(page => {
    if (page.isStartOfChapter && page.chapterTitle && !chapterTitles.has(page.chapterTitle)) {
      toc.push({
        title: page.chapterTitle,
        estimatedPage: page.pageNumber,
      });
      chapterTitles.add(page.chapterTitle);
    }
  });
  return toc;
}


export default function EscribaLibroApp() {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<Book>(() => createInitialBook()); // Initialize with a function to avoid re-creation on every render

  const [formattingOptions, setFormattingOptions] = useState<FormattingOptions>({
    fontFamily: 'var(--font-sans)',
    fontSize: 16,
    textColor: 'hsl(var(--foreground))',
    previewBackgroundColor: 'hsl(var(--background))',
    pageBackgroundColor: 'hsl(var(--card))',
    previewPadding: 24,
    lineHeight: 1.6,
  });

  const [activeTab, setActiveTab] = useState('editor');
  const [paginatedPreview, setPaginatedPreview] = useState<PagePreviewData[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isBookListDialogOpen, setIsBookListDialogOpen] = useState(false);
  const [currentPreviewPageIndex, setCurrentPreviewPageIndex] = useState(0);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);

  // Ref to store the previous stringified version of currentBook for comparison in effects
  const prevCurrentBookStrRef = useRef<string | null>(null);


  const loadDataFromLocalStorage = useCallback(() => {
    try {
      const savedBooksListJson = localStorage.getItem(LOCALSTORAGE_BOOKS_LIST_KEY);
      const savedActiveBookId = localStorage.getItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY);
      const savedFormattingJson = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);

      let loadedBooks: Book[] = [];
      if (savedBooksListJson) {
        loadedBooks = JSON.parse(savedBooksListJson).map((book: Book) => ({
          ...createInitialBook(), // provides defaults for new fields
          ...book,
          tableOfContents: book.tableOfContents || [], // Ensure TOC exists
        }));
      }
      setBooks(loadedBooks);

      let bookToLoad: Book | undefined;
      if (savedActiveBookId && loadedBooks.length > 0) {
        bookToLoad = loadedBooks.find(b => b.id === savedActiveBookId);
      }

      if (!bookToLoad && loadedBooks.length > 0) {
        bookToLoad = [...loadedBooks].sort((a, b) => b.lastModified - a.lastModified)[0];
      }

      if (bookToLoad) {
        setCurrentBook(bookToLoad);
        setActiveBookId(bookToLoad.id);
      } else {
        const newBook = createInitialBook();
        setCurrentBook(newBook);
        setActiveBookId(newBook.id);
        setBooks([newBook]); // Start with one book if none loaded
      }

      if (savedFormattingJson) {
        setFormattingOptions(JSON.parse(savedFormattingJson));
      } else {
         if (typeof window !== 'undefined') {
          const computedStyle = window.getComputedStyle(document.documentElement);
          const fgColor = computedStyle.getPropertyValue('--foreground').trim();
          const cardBgColor = computedStyle.getPropertyValue('--card').trim();
          const bodyBgColor = computedStyle.getPropertyValue('--background').trim();
          setFormattingOptions(prev => ({
              ...prev,
              textColor: fgColor ? `hsl(${fgColor})` : prev.textColor,
              previewBackgroundColor: bodyBgColor ? `hsl(${bodyBgColor})` : prev.previewBackgroundColor,
              pageBackgroundColor: cardBgColor ? `hsl(${cardBgColor})` : prev.pageBackgroundColor,
          }));
        }
      }
    } catch (error) {
      console.error("Fallo al cargar datos desde localStorage", error);
      toast({ title: "Error de Carga", description: "No se pudieron cargar los datos guardados. Se iniciará con un libro nuevo.", variant: "destructive" });
      const newBook = createInitialBook();
      setCurrentBook(newBook);
      setActiveBookId(newBook.id);
      setBooks([newBook]);
    }
  }, [toast]); // toast is stable from useToast

  // Effect 1: Run on mount to load data
  useEffect(() => {
    loadDataFromLocalStorage();
    setMounted(true);
  }, [loadDataFromLocalStorage]);


  // Effect 2: Persist critical state to LocalStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LOCALSTORAGE_BOOKS_LIST_KEY, JSON.stringify(books));
      if (activeBookId) {
        localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, activeBookId);
      }
      localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
    }
  }, [books, activeBookId, formattingOptions, mounted]);


  // Effect 3: Update currentBook in state when activeBookId changes or the 'books' array changes affecting the active book
  useEffect(() => {
    if (mounted && activeBookId) {
      const bookFromList = books.find(b => b.id === activeBookId);
      if (bookFromList) {
        const currentBookStr = JSON.stringify(currentBook);
        if (currentBook.id !== bookFromList.id || currentBookStr !== JSON.stringify(bookFromList)) {
          setCurrentBook(bookFromList);
          prevCurrentBookStrRef.current = JSON.stringify(bookFromList);
        }
      } else if (books.length > 0) {
        // ActiveBookId points to a non-existent book, switch to the most recent one.
        const mostRecentBook = [...books].sort((a, b) => b.lastModified - a.lastModified)[0];
        setActiveBookId(mostRecentBook.id); // This will re-trigger this effect
      } else {
        // No books, and activeBookId might be stale. Create a new one.
        handleNewBook();
      }
    }
  }, [activeBookId, books, mounted]); // currentBook is intentionally not a direct dependency here

  // Effect 4: Sync changes from currentBook (edited by user or TOC update) back into the books array
  useEffect(() => {
    if (mounted && activeBookId && currentBook && currentBook.id === activeBookId) {
      const currentBookStr = JSON.stringify(currentBook);
      if (prevCurrentBookStrRef.current !== null && prevCurrentBookStrRef.current !== currentBookStr) {
        setBooks(prevBooks =>
          prevBooks.map(b => (b.id === activeBookId ? currentBook : b))
        );
      }
      prevCurrentBookStrRef.current = currentBookStr; // Update ref after potential update
    }
  }, [currentBook, activeBookId, mounted]);


  // Effect 5: Generate page previews and Table of Contents
  useEffect(() => {
    if (mounted && currentBook.id && activeBookId && currentBook.id === activeBookId) {
      const newPreview = generatePagePreviews(currentBook, formattingOptions);
      setPaginatedPreview(newPreview);
      // Reset to first page if preview changes significantly, unless it's empty
      setCurrentPreviewPageIndex(prevIdx => newPreview.length > 0 ? Math.min(prevIdx, newPreview.length - 1) : 0);

      const newToc = generateTableOfContents(newPreview);
      if (JSON.stringify(newToc) !== JSON.stringify(currentBook.tableOfContents)) {
        // Update TOC on currentBook. This will trigger Effect 4 to sync to `books`.
        // DO NOT update lastModified here to prevent loops.
        setCurrentBook(prev => ({ ...prev, tableOfContents: newToc }));
      }
    }
  }, [currentBook.content, currentBook.title, formattingOptions, mounted, currentBook.id, activeBookId]);


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

  const handleSaveData = () => {
    if (!activeBookId || !currentBook) {
      toast({ title: "Error al Guardar", description: "No hay un libro activo para guardar.", variant: "destructive" });
      return;
    }
    // The effects should handle updating 'books' array and localStorage.
    // This function can just provide user feedback.
    toast({
      title: "¡Progreso Guardado!",
      description: `El libro "${currentBook.title}" y las preferencias de formato se han guardado.`,
      duration: 3000,
    });
  };

  const handleOpenBookList = () => {
    setIsBookListDialogOpen(true);
  };

  const handleSelectBookToOpen = (bookId: string) => {
    const bookToOpen = books.find(b => b.id === bookId);
    if (bookToOpen) {
      setActiveBookId(bookId); // This will trigger Effect 3 to update currentBook
      setIsBookListDialogOpen(false);
      setActiveTab('editor');
      setCurrentPreviewPageIndex(0);
      toast({
        title: "Libro Cargado",
        description: `"${bookToOpen.title}" ahora está activo en el editor.`,
        duration: 3000,
      });
    }
  };

  const handleNewBook = () => {
    const newBook = createInitialBook();
    setBooks(prevBooks => [...prevBooks, newBook]);
    setActiveBookId(newBook.id); // This will trigger Effect 3 to set currentBook
    setCurrentPreviewPageIndex(0);
    setActiveTab('editor');
    toast({
      title: "Nuevo Libro Creado",
      description: "El editor ha sido reiniciado. ¡Empieza tu nueva obra!",
      duration: 3000,
    });
  };

  const handleDeleteBook = (bookIdToDelete: string) => {
    const bookToDelete = books.find(b => b.id === bookIdToDelete);
    if (!bookToDelete) return;

    const updatedBooks = books.filter(b => b.id !== bookIdToDelete);
    setBooks(updatedBooks); // This will trigger Effect 2 (localStorage) and Effect 3 if activeBookId changes

    if (activeBookId === bookIdToDelete) {
      if (updatedBooks.length > 0) {
        const mostRecentBook = [...updatedBooks].sort((a,b) => b.lastModified - a.lastModified)[0];
        setActiveBookId(mostRecentBook.id); // Triggers Effect 3
      } else {
        handleNewBook(); // Creates a new book and sets it active
      }
    }
    setCurrentPreviewPageIndex(0);
    toast({
      title: "Libro Eliminado",
      description: `El libro "${bookToDelete.title}" ha sido eliminado.`,
      variant: "destructive",
      duration: 3000,
    });
  };


  const handleContentChange = (newContent: string) => {
    setCurrentBook(prev => ({ ...prev, content: newContent, lastModified: Date.now() }));
  };

  const handleBookDetailsChange = (field: keyof Pick<Book, 'title' | 'author' | 'subtitle'>, value: string) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };

  const handleAuthorImagePositionChange = (value: AuthorImagePosition) => {
    setCurrentBook(prev => ({ ...prev, authorImagePosition: value, lastModified: Date.now() }));
  };

  const handleFileRead = (file: File, callback: (result: string) => void) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCoverImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, coverImage: base64Image, lastModified: Date.now() }));
      });
    }
  };

  const handleAuthorImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, authorImage: base64Image, lastModified: Date.now() }));
      });
    }
  };

  const handleImageInsertToContent = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const imageName = event.target.files[0].name || 'imagen';
      handleFileRead(event.target.files[0], (base64Image) => {
        const imageMarkdown = `\n![${imageName}](${base64Image})\n`;
        setCurrentBook(prev => ({ ...prev, content: prev.content + imageMarkdown, lastModified: Date.now() }));
      });
    }
  };

  const handleFormattingChange = (field: keyof FormattingOptions, value: string | number) => {
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
    }, 150);
  };

  const simulatedPageStyle: CSSProperties = {
    width: '100%',
    maxWidth: '500px',
    minHeight: `${PAGE_CONTENT_TARGET_HEIGHT_PX}px`,
    padding: `${formattingOptions.previewPadding}px`,
    color: formattingOptions.textColor,
    backgroundColor: formattingOptions.pageBackgroundColor,
    fontFamily: formattingOptions.fontFamily,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden', // Ensure content doesn't spill
  };

  const createPdfPageHtml = (
    pageData: PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[] } | { type: 'cover' },
    isToc: boolean = false,
    isCover: boolean = false
  ): HTMLDivElement => {
    const pageDiv = document.createElement('div');
    const pdfPageWidthPx = 750; // A bit wider for better PDF rendering from canvas
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; // A4 aspect ratio

    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.height = `${pdfPageHeightPx}px`; // Fixed height for html2canvas
    pageDiv.style.padding = isCover ? '0px' : `${formattingOptions.previewPadding * 1.5}px`; // Adjust padding for PDF scale
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize * 1.2}px`; // Slightly larger for PDF
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.position = 'relative';
    pageDiv.style.overflow = 'hidden'; // Important for html2canvas

    if (isCover) {
        pageDiv.style.alignItems = 'center';
        pageDiv.style.justifyContent = 'center';

        if (currentBook.coverImage) {
            const img = document.createElement('img');
            img.src = currentBook.coverImage;
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
        textOverlay.style.alignItems = 'center';
        textOverlay.style.justifyContent = 'center';
        textOverlay.style.padding = '40px';
        textOverlay.style.textAlign = 'center';
        textOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 100%)';
        textOverlay.style.zIndex = '2';

        const titleEl = document.createElement('h1');
        titleEl.textContent = currentBook.title;
        titleEl.style.fontSize = '48px';
        titleEl.style.fontWeight = 'bold';
        titleEl.style.color = 'white';
        titleEl.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
        titleEl.style.marginBottom = '15px';
        textOverlay.appendChild(titleEl);

        if (currentBook.subtitle) {
            const subtitleEl = document.createElement('h2');
            subtitleEl.textContent = currentBook.subtitle;
            subtitleEl.style.fontSize = '28px';
            subtitleEl.style.fontWeight = 'normal';
            subtitleEl.style.fontStyle = 'italic';
            subtitleEl.style.color = '#f0f0f0';
            subtitleEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.6)';
            subtitleEl.style.marginBottom = '30px';
            textOverlay.appendChild(subtitleEl);
        }
        
        const authorNameEl = document.createElement('p');
        authorNameEl.textContent = currentBook.author;
        authorNameEl.style.fontSize = '24px';
        authorNameEl.style.color = '#e0e0e0';
        authorNameEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
       
        if (currentBook.authorImage) {
             authorNameEl.style.marginTop = '20px'; // Space above author name if photo is also there
        } else {
             authorNameEl.style.position = 'absolute'; // Position main author name at bottom if no author photo
             authorNameEl.style.bottom = '40px';
             authorNameEl.style.left = '0';
             authorNameEl.style.right = '0';
        }
        textOverlay.appendChild(authorNameEl);
        pageDiv.appendChild(textOverlay);


        if (currentBook.authorImage) {
            const authorPhotoContainer = document.createElement('div');
            authorPhotoContainer.style.position = 'absolute';
            authorPhotoContainer.style.zIndex = '3'; // Above textOverlay gradient
            authorPhotoContainer.style.width = '120px'; // Slightly larger for PDF
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
            authorImg.style.borderRadius = '4px';
            authorImg.style.border = '3px solid white';
            authorImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
            authorPhotoContainer.appendChild(authorImg);

            const authorPhotoNameEl = document.createElement('p');
            authorPhotoNameEl.textContent = currentBook.author; // Display author name under photo too
            authorPhotoNameEl.style.fontSize = '16px';
            authorPhotoNameEl.style.color = 'white';
            authorPhotoNameEl.style.marginTop = '8px';
            authorPhotoNameEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.8)';
            authorPhotoContainer.appendChild(authorPhotoNameEl);
            pageDiv.appendChild(authorPhotoContainer);
        }

    } else if (isToc && 'type' in pageData && pageData.type === 'toc') {
      const tocHeader = document.createElement('h2');
      tocHeader.textContent = "Índice";
      tocHeader.style.textAlign = 'center';
      tocHeader.style.fontSize = `${formattingOptions.fontSize * 2.2}px`; // Larger TOC title
      tocHeader.style.fontWeight = 'bold';
      tocHeader.style.margin = `${formattingOptions.fontSize * 2}px 0`;
      tocHeader.style.paddingBottom = `${formattingOptions.fontSize * 0.5}px`;
      tocHeader.style.borderBottom = `1px solid ${formattingOptions.textColor}`;
      pageDiv.appendChild(tocHeader);

      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = `0 ${formattingOptions.previewPadding}px`; // Consistent padding
      ul.style.flexGrow = '1';
      ul.style.marginTop = `${formattingOptions.fontSize}px`;

      pageData.entries.forEach(entry => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'baseline';
        li.style.padding = `${formattingOptions.fontSize * 0.5}px 0`; // More spacing
        li.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.4)`;
        li.style.fontSize = `${formattingOptions.fontSize * 1.1}px`; // Slightly larger TOC entries

        const titleSpan = document.createElement('span');
        titleSpan.textContent = entry.title;
        titleSpan.style.marginRight = '15px'; // More space for dots
        titleSpan.style.flexGrow = '1';
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';


        const dots = document.createElement('span');
        // Create dots manually for better control if needed, or rely on flexbox
        dots.style.flexGrow = '10'; // Fill remaining space
        dots.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.4)`;
        dots.style.margin = `0 5px -${formattingOptions.fontSize * 0.3}px 5px`; // Align dots with text baseline
        dots.style.height = `${formattingOptions.fontSize * 0.5}px`;


        const pageSpan = document.createElement('span');
        pageSpan.textContent = String(entry.estimatedPage);
        pageSpan.style.marginLeft = '15px'; // More space from dots
        pageSpan.style.fontWeight = 'normal'; // TOC page numbers usually not bold

        li.appendChild(titleSpan);
        // li.appendChild(dots); // Using flex for dots instead of textContent
        li.appendChild(pageSpan);
        ul.appendChild(li);
      });
      pageDiv.appendChild(ul);

      // Add a placeholder at the bottom to push footer down if TOC is short
      const spacer = document.createElement('div');
      spacer.style.flexGrow = '1';
      pageDiv.appendChild(spacer);


    } else if (!isToc && !isCover && 'rawContentLines' in pageData) {
      const typedPageData = pageData as PagePreviewData;

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; // Slightly larger header/footer
      headerDiv.style.opacity = '0.8';
      headerDiv.style.paddingBottom = '8px'; // More space
      headerDiv.style.borderBottom = `1px solid hsl(var(--border))`;
      headerDiv.style.marginBottom = '20px'; // More space
      headerDiv.style.flexShrink = '0';
      const headerLeft = document.createElement('span');
      headerLeft.textContent = typedPageData.headerLeft;
      const headerRight = document.createElement('span');
      headerRight.textContent = typedPageData.headerRight;
      headerDiv.appendChild(headerLeft);
      headerDiv.appendChild(headerRight);
      pageDiv.appendChild(headerDiv);

      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1';
      contentAreaDiv.style.overflowY = 'hidden'; // Prevent internal scrollbars for canvas
      typedPageData.rawContentLines.forEach(line => {
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = `${formattingOptions.fontSize * 1}px 0`; // More margin for images
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '85%'; // Slightly more constrained
          img.style.maxHeight = '400px'; // Max height for PDF page
          img.style.height = 'auto';
          img.style.borderRadius = '4px';
          img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          imgContainer.appendChild(img);
          if (altText) {
            const caption = document.createElement('p');
            caption.textContent = altText;
            caption.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; caption.style.fontStyle = 'italic'; caption.style.opacity = '0.8'; caption.style.marginTop = '0.4em';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
        } else {
          const p = document.createElement('p');
          p.innerHTML = line.trim() === '' ? '&nbsp;' : line; // Keep &nbsp; for empty lines
          p.style.margin = `${formattingOptions.fontSize * 0.4}px 0`; // Consistent paragraph margin
          p.style.textAlign = 'justify'; // Justify text for book feel
          if (line.startsWith('## ')) {
            p.style.fontSize = `${formattingOptions.fontSize * 1.8}px`; // Larger chapter titles
            p.style.fontWeight = 'bold';
            p.style.marginTop = `${formattingOptions.fontSize * 1.5}px`; // More space above chapter titles
            p.style.marginBottom = `${formattingOptions.fontSize * 0.8}px`;
            p.style.textAlign = 'left'; // Chapter titles usually left-aligned
            p.textContent = line.substring(3).trim();
          }
          contentAreaDiv.appendChild(p);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      const footerDiv = document.createElement('div');
      footerDiv.style.textAlign = 'center';
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`;
      footerDiv.style.opacity = '0.8';
      footerDiv.style.paddingTop = '8px';
      footerDiv.style.borderTop = `1px solid hsl(var(--border))`;
      footerDiv.style.marginTop = 'auto'; // Pushes footer to bottom
      footerDiv.style.flexShrink = '0';
      footerDiv.textContent = typedPageData.footerCenter;
      pageDiv.appendChild(footerDiv);
    }
    return pageDiv;
  };


  const handleExportToPdf = async () => {
    setIsExportingPdf(true);
    toast({ title: "Exportación a PDF Iniciada", description: "Generando tu libro, por favor espera..." });

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pdfWidthPt = pdf.internal.pageSize.getWidth();
    const pdfHeightPt = pdf.internal.pageSize.getHeight();
    
    const tempContainer = document.createElement('div');
    // Important: Make tempContainer visible for html2canvas to calculate dimensions correctly, then hide.
    // Or ensure fixed dimensions on 'pageDiv' elements passed to html2canvas.
    tempContainer.style.position = 'fixed'; // Use fixed to ensure it's in viewport for measurements
    tempContainer.style.left = '0px'; // Can be off-screen if dimensions are explicit
    tempContainer.style.top = '0px';
    tempContainer.style.width = '750px'; // Match createPdfPageHtml width
    tempContainer.style.height = `${750 * 1.414}px`; // Match createPdfPageHtml height
    tempContainer.style.zIndex = '-1'; // Render off-screen
    tempContainer.style.opacity = '0'; // Hide it visually
    document.body.appendChild(tempContainer);

    const renderedCanvases: { type: 'cover' | 'toc' | 'content', canvas: HTMLCanvasElement, originalPageNumber?: number }[] = [];
    const chapterPdfPageMap: ChapterEntry[] = [];
    let pdfPageCounter = 0;

    // Render Cover Page
    if (currentBook.coverImage || currentBook.title) { // Only add cover if there's something to show
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

    // Generate content pages and map chapter start pages for TOC
    // The page numbers for TOC should be relative to the start of the content section.
    let contentStartPdfPage = pdfPageCounter + 1; // TOC will be inserted before content, so content starts after cover + TOC page
    if (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) contentStartPdfPage++;


    for (const pageData of paginatedPreview) {
      const actualPdfPageForThisContent = contentStartPdfPage + pageData.pageNumber -1;
      const pdfPageData = { ...pageData, footerCenter: `Página ${actualPdfPageForThisContent}` };
      
      const pageDiv = createPdfPageHtml(pdfPageData);
      tempContainer.innerHTML = '';
      tempContainer.appendChild(pageDiv);
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
      renderedCanvases.push({ type: 'content', canvas, originalPageNumber: actualPdfPageForThisContent });

      if (pageData.isStartOfChapter && pageData.chapterTitle) {
        chapterPdfPageMap.push({ title: pageData.chapterTitle, estimatedPage: actualPdfPageForThisContent });
      }
    }

    // Render TOC Page if chapters exist
    if (chapterPdfPageMap.length > 0) {
        pdfPageCounter++; // Increment for the TOC page itself
        const tocPdfPageNumber = pdfPageCounter; // This is the actual PDF page number for the TOC
        const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: chapterPdfPageMap }, true);
        tocPageDiv.appendChild(Object.assign(document.createElement('div'), { // Footer for TOC page
            style: `text-align: center; font-size: ${formattingOptions.fontSize * 0.85}px; opacity: 0.8; padding-top: 8px; border-top: 1px solid hsl(var(--border)); margin-top: auto; flex-shrink: 0;`,
            textContent: `Página ${tocPdfPageNumber}`
        }));

        tempContainer.innerHTML = '';
        tempContainer.appendChild(tocPageDiv);
        const tocCanvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
        
        // Insert TOC canvas after cover (if cover exists)
        const tocInsertIndex = renderedCanvases.findIndex(rc => rc.type === 'content');
        if (tocInsertIndex !== -1) {
            renderedCanvases.splice(tocInsertIndex, 0, { type: 'toc', canvas: tocCanvas, originalPageNumber: tocPdfPageNumber });
        } else { // Only cover exists or no content
            renderedCanvases.push({ type: 'toc', canvas: tocCanvas, originalPageNumber: tocPdfPageNumber });
        }
    }
    
    // Sort all rendered canvases by their intended PDF page number before adding to PDF
    renderedCanvases.sort((a,b) => (a.originalPageNumber || 0) - (b.originalPageNumber || 0));

    renderedCanvases.forEach((render, index) => {
      if (index > 0) pdf.addPage();
      const canvas = render.canvas;
      const imgData = canvas.toDataURL('image/png', 0.92); // Slightly better quality
      
      // Scale image to fit A4, maintaining aspect ratio
      const canvasAspectRatio = canvas.width / canvas.height;
      const pdfPageAspectRatio = pdfWidthPt / pdfHeightPt;
      let imgWidthPt, imgHeightPt;

      if (canvasAspectRatio > pdfPageAspectRatio) { // Canvas is wider than PDF page
          imgWidthPt = pdfWidthPt;
          imgHeightPt = pdfWidthPt / canvasAspectRatio;
      } else { // Canvas is taller or same aspect ratio as PDF page
          imgHeightPt = pdfHeightPt;
          imgWidthPt = pdfHeightPt * canvasAspectRatio;
      }
      
      const xOffset = (pdfWidthPt - imgWidthPt) / 2;
      const yOffset = (pdfHeightPt - imgHeightPt) / 2;

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidthPt, imgHeightPt);
    });

    document.body.removeChild(tempContainer);
    pdf.save(`${currentBook.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'libro_escribalibro'}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };

  const handleExportToTxt = () => {
    if (!currentBook.content && !currentBook.title && !currentBook.author) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como TXT.", variant: "destructive" });
      return;
    }

    let txtContent = `Título: ${currentBook.title || 'Sin Título'}\n`;
    if(currentBook.subtitle) txtContent += `Subtítulo: ${currentBook.subtitle}\n`;
    txtContent += `Autor: ${currentBook.author || 'Desconocido'}\n\n`;
    
    if (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) {
      txtContent += "Índice:\n";
      currentBook.tableOfContents.forEach(entry => {
        txtContent += `- ${entry.title}\n`; // Page numbers are not very relevant for TXT
      });
      txtContent += "\n";
    }

    txtContent += "Contenido:\n";
    txtContent += currentBook.content.replace(/!\[.*?\]\(data:image\/.*?;base64,.*?\)/g, '[Imagen Omitida]'); // More specific regex for base64 images

    const filename = `${currentBook.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'libro'}.txt`;
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({ title: "TXT Exportado", description: "Tu libro ha sido exportado como archivo TXT." });
  };

  const handleExportToHtml = () => {
    if (!currentBook.content && !currentBook.title && !currentBook.author) {
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
          .book-container { max-width: 800px; margin: 20px auto; padding: ${formattingOptions.previewPadding}px; border: 1px solid #ddd; box-shadow: 0 0 10px rgba(0,0,0,0.1); background-color: white; /* Ensure content area has a distinct background if page background is different */ }
          .cover-section { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative; background-color: #333; color: white; padding: 20px; box-sizing: border-box; overflow: hidden; }
          .cover-section img.cover-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
          .cover-section .text-overlay { position: relative; z-index: 2; background: rgba(0,0,0,0.6); padding: 40px; border-radius: 8px; }
          .cover-section h1.book-title-cover { font-size: ${formattingOptions.fontSize * 3.5}px; margin-bottom: 0.2em; text-shadow: 2px 2px 5px rgba(0,0,0,0.8); }
          .cover-section h2.book-subtitle-cover { font-size: ${formattingOptions.fontSize * 2}px; font-style: italic; margin-bottom: 1em; text-shadow: 1px 1px 3px rgba(0,0,0,0.7); }
          .cover-section p.author-name-main { font-size: ${formattingOptions.fontSize * 1.5}px; color: #f0f0f0; text-shadow: 1px 1px 2px rgba(0,0,0,0.6); margin-top: 1em;}
          .author-photo-container-cover {
            position: absolute;
            width: 150px; /* Slightly larger for HTML view */
            text-align: center;
            z-index: 3; /* Above text overlay's potential full background */
            ${currentBook.authorImagePosition === 'bottom-right' ? 'bottom: 40px; right: 40px;' : ''}
            ${currentBook.authorImagePosition === 'bottom-left' ? 'bottom: 40px; left: 40px;' : ''}
            ${currentBook.authorImagePosition === 'top-right' ? 'top: 40px; right: 40px;' : ''}
            ${currentBook.authorImagePosition === 'top-left' ? 'top: 40px; left: 40px;' : ''}
          }
          .author-photo-container-cover img.author-image-cover { width: 120px; height: 120px; object-fit: cover; border-radius: 6px; border: 3px solid white; box-shadow: 0 3px 7px rgba(0,0,0,0.5); margin-bottom: 8px; }
          .author-photo-container-cover p.author-name-photo { font-size: ${formattingOptions.fontSize * 1}px; margin-top: 0; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); color: white; }
          h1, h2, h3 { color: ${formattingOptions.textColor}; }
          h1.book-title-content { font-size: ${formattingOptions.fontSize * 2.5}px; text-align: center; margin-bottom: 0.1em; }
          h3.author-name-content { font-size: ${formattingOptions.fontSize * 1.4}px; text-align: center; font-style: italic; margin-top:0; margin-bottom: 2.5em; }
          h2.chapter-title { font-size: ${formattingOptions.fontSize * 1.8}px; margin-top: 2.5em; margin-bottom: 1em; padding-bottom: 0.4em; border-bottom: 2px solid ${formattingOptions.textColor};}
          .content-image { max-width: 90%; height: auto; display: block; margin: 2em auto; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.15); }
          p { margin-bottom: ${formattingOptions.fontSize * 0.7}px; text-align: justify; }
          .toc { border: 1px solid #e0e0e0; padding: 20px 30px; margin-bottom: 35px; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .toc h2 { text-align: center; margin-top: 0; font-size: ${formattingOptions.fontSize * 1.6}px; margin-bottom: 20px; }
          .toc ul { list-style-type: none; padding-left: 0; }
          .toc li { margin-bottom: 10px; font-size: ${formattingOptions.fontSize * 1.05}px; display: flex; justify-content: space-between; align-items: baseline; }
          .toc li .toc-title { flex-grow: 1; margin-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .toc li .toc-dots { flex-grow: 10; border-bottom: 1px dotted #aaa; margin: 0 5px -4px 5px; }
          .toc li .toc-page { font-weight: normal; }
          .page-break-before { page-break-before: always; } /* For printing HTML */
        </style>
      </head>
      <body>
    `;

    htmlString += '<div class="cover-section">\n';
    if (currentBook.coverImage) {
      htmlString += `  <img src="${currentBook.coverImage}" alt="Portada del Libro" class="cover-image-bg" data-ai-hint="book cover" />\n`;
    }
    htmlString += '  <div class="text-overlay">\n';
    htmlString += `    <h1 class="book-title-cover">${currentBook.title || 'Libro sin Título'}</h1>\n`;
    if (currentBook.subtitle) {
      htmlString += `    <h2 class="book-subtitle-cover">${currentBook.subtitle}</h2>\n`;
    }
    htmlString += `    <p class="author-name-main">${currentBook.author || 'Autor Desconocido'}</p>\n`;
    htmlString += '  </div>\n';
    if (currentBook.authorImage) {
      htmlString += '  <div class="author-photo-container-cover">\n';
      htmlString += `    <img src="${currentBook.authorImage}" alt="Foto del Autor" class="author-image-cover" data-ai-hint="portrait person" />\n`;
      htmlString += `    <p class="author-name-photo">${currentBook.author}</p>\n`; // Author name with photo
      htmlString += '  </div>\n';
    }
    htmlString += '</div>\n';

    htmlString += '<div class="book-container page-break-before">\n'; // Main content container with page break for printing
    // Add Title and Author again for content section if desired
    // htmlString += `<h1 class="book-title-content">${currentBook.title || 'Libro sin Título'}</h1>\n`;
    // htmlString += `<h3 class="author-name-content">${currentBook.author || 'Autor Desconocido'}</h3>\n`;


    if (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) {
      htmlString += '  <div class="toc page-break-before">\n'; // TOC also on new page if printed
      htmlString += '    <h2>Índice</h2>\n';
      htmlString += '    <ul>\n';
      currentBook.tableOfContents.forEach(entry => { // For HTML, page numbers might not be accurate if content reflows
        htmlString += `      <li><span class="toc-title">${entry.title}</span> <span class="toc-dots"></span> <span class="toc-page">${entry.estimatedPage}</span></li>\n`;
      });
      htmlString += '    </ul>\n';
      htmlString += '  </div>\n';
    }

    const contentParagraphs = (currentBook.content || '') // Handle null content
      .split('\n')
      .map(line => {
        if (line.startsWith('## ')) {
          return `<h2 class="chapter-title page-break-before">${line.substring(3).trim()}</h2>`;
        }
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          return `<img src="${imgSrc}" alt="${altText || 'Imagen insertada'}" class="content-image" data-ai-hint="illustration drawing" />`;
        }
        return line.trim() === '' ? '<p>&nbsp;</p>' : `<p>${line}</p>`;
      })
      .join('\n');

    htmlString += contentParagraphs;
    htmlString += '</div>\n';
    htmlString += `
      </body>
      </html>
    `;

    const filename = `${currentBook.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'libro'}.html`;
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

  const BookListDialog = () => (
    <Dialog open={isBookListDialogOpen} onOpenChange={setIsBookListDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mis Libros</DialogTitle>
          <DialogDescription>Selecciona un libro para abrirlo en el editor o elimina los que ya no necesites.</DialogDescription>
        </DialogHeader>
        {books.length > 0 ? (
          <ScrollArea className="max-h-[60vh] my-4 pr-4">
            <ul className="space-y-2">
              {[...books].sort((a, b) => b.lastModified - a.lastModified).map((bookItem) => (
                <li key={bookItem.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50">
                  <div>
                    <p className="font-semibold">{bookItem.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Modificado: {new Date(bookItem.lastModified).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleSelectBookToOpen(bookItem.id)}>
                      <BookOpen className="mr-2 h-4 w-4" /> Abrir
                    </Button>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" disabled={books.length <= 1 && activeBookId === bookItem.id}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar Libro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Estás a punto de eliminar el libro "{bookItem.title}". Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteBook(bookItem.id)}>
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground text-center py-8">No tienes libros guardados. ¡Empieza a escribir!</p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const currentPreviewPageData = paginatedPreview[currentPreviewPageIndex];

  const authorImagePositionClasses: Record<AuthorImagePosition, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans">
      <header className="mb-6 md:mb-8 pb-4 border-b border-border">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-bold text-primary">EscribaLibro</h1>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleNewBook} variant="outline" size="sm">
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo Libro
            </Button>
            <Button onClick={handleOpenBookList} variant="outline" size="sm">
              <FolderOpen className="mr-2 h-4 w-4" /> Mis Libros
            </Button>
            <Button onClick={handleSaveData} variant="outline" size="sm" disabled={!activeBookId}>
              <Save className="mr-2 h-4 w-4" /> Guardar Progreso
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm">
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
                  Exportar como DOCX (Próximamente)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm md:text-base text-muted-foreground mt-2 text-center sm:text-left container mx-auto">Crea tu historia, hermosamente.</p>
      </header>

      <BookListDialog />

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col container mx-auto">
        <TabsList className="mx-auto mb-6 shadow-sm w-full max-w-xl grid grid-cols-2 sm:grid-cols-4">
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
                  <CardDescription>Escribe y formatea el contenido de tu libro. Usa `## Título del Capítulo` para nuevos capítulos.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 md:p-6">
                  <Label htmlFor="bookContent" className="mb-2 font-semibold text-sm">Contenido del Libro</Label>
                  <Textarea
                    id="bookContent"
                    value={currentBook.content || ''}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Empieza a escribir tu obra maestra... Usa `## Título del Capítulo` para definir nuevos capítulos."
                    className="flex-1 w-full min-h-[300px] md:min-h-[400px] text-sm p-3 rounded-md shadow-inner"
                  />
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insertar Imagen en Contenido
                    </Label>
                    <Input id="insertImageContent" type="file" accept="image/*" onChange={handleImageInsertToContent} className="hidden" />
                    <p className="text-xs text-muted-foreground mt-1">Las imágenes se añaden como enlaces estilo Markdown al final del contenido actual.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="index" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><ListOrdered className="mr-2 h-5 w-5 text-primary" />Índice de Capítulos</CardTitle>
                  <CardDescription>Generado automáticamente basado en `## Título del Capítulo`. Las páginas son estimaciones de la vista previa.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {(currentBook.tableOfContents && currentBook.tableOfContents.length > 0) ? (
                    <ScrollArea className="h-[300px] md:h-[400px] pr-3 border rounded-md p-3">
                      <ul className="space-y-2">
                        {currentBook.tableOfContents.map((entry, idx) => (
                          <li key={idx} className="flex justify-between items-center text-sm border-b border-dashed pb-1.5 pt-1">
                            <span className="truncate pr-2">{entry.title}</span>
                            <span className="text-muted-foreground font-mono text-xs">Pág. {entry.estimatedPage}</span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  ) : (
                    <div className="text-center text-muted-foreground italic py-10">
                      <ListOrdered className="mx-auto h-12 w-12 opacity-50 mb-3" />
                      <p>Aún no se han definido capítulos.</p>
                      <p className="text-xs">Usa `## Título del Capítulo` en el editor para crear capítulos.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="formatting" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl">
                    <Paintbrush className="mr-2 h-5 w-5 text-primary" /> Opciones de Formato
                  </CardTitle>
                  <CardDescription>Personaliza la apariencia de tu libro en la vista previa y el PDF.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-4 md:p-6">
                  <div className="space-y-2">
                    <Label htmlFor="fontFamily" className="text-sm font-medium">Fuente Principal</Label>
                    <Select onValueChange={(value) => handleFormattingChange('fontFamily', value)} value={formattingOptions.fontFamily}>
                      <SelectTrigger id="fontFamily" className="mt-1 text-sm">
                        <SelectValue placeholder="Seleccionar fuente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="var(--font-sans)">Sans-serif del Sistema</SelectItem>
                        <SelectItem value="serif">Serif del Sistema</SelectItem>
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
                      <Label htmlFor="fontSize" className="text-sm font-medium">Tamaño de Fuente (px)</Label>
                      <Input
                        id="fontSize" type="number" value={formattingOptions.fontSize}
                        onChange={(e) => handleFormattingChange('fontSize', Math.max(8, parseInt(e.target.value, 10) || formattingOptions.fontSize))}
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lineHeight" className="text-sm font-medium">Altura de Línea (ej: 1.6)</Label>
                      <Input
                        id="lineHeight" type="number" value={formattingOptions.lineHeight} step="0.1" min="0.5"
                        onChange={(e) => handleFormattingChange('lineHeight', parseFloat(e.target.value) || formattingOptions.lineHeight)}
                        className="mt-1 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label htmlFor="textColor" className="text-sm font-medium">Color del Texto</Label>
                      <Input id="textColor" type="color" value={formattingOptions.textColor} onChange={(e) => handleFormattingChange('textColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md"/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pageBackgroundColor" className="text-sm font-medium">Fondo de Página (Vista)</Label>
                      <Input id="pageBackgroundColor" type="color" value={formattingOptions.pageBackgroundColor} onChange={(e) => handleFormattingChange('pageBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md"/>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="previewAreaBackground" className="text-sm font-medium">Fondo Área Vista Previa</Label>
                      <Input id="previewAreaBackground" type="color" value={formattingOptions.previewBackgroundColor} onChange={(e) => handleFormattingChange('previewBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md"/>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="previewPadding" className="text-sm font-medium">Relleno de Página (px en vista)</Label>
                    <Input
                      id="previewPadding" type="number" value={formattingOptions.previewPadding} min="0"
                      onChange={(e) => handleFormattingChange('previewPadding', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="mt-1 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cover" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Palette className="mr-2 h-5 w-5 text-primary" />Diseñador de Portada</CardTitle>
                  <CardDescription>Personaliza la información y las imágenes de la portada de tu libro.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-4 md:p-6">
                  <div className="space-y-2">
                    <Label htmlFor="bookTitleInput" className="text-sm font-medium">Título del Libro</Label>
                    <Input
                      id="bookTitleInput" value={currentBook.title || ''} onChange={(e) => handleBookDetailsChange('title', e.target.value)}
                      placeholder="El Título de tu Gran Libro" className="mt-1 text-sm p-2 shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bookSubtitleInput" className="text-sm font-medium">Subtítulo del Libro</Label>
                    <Input
                      id="bookSubtitleInput" value={currentBook.subtitle || ''} onChange={(e) => handleBookDetailsChange('subtitle', e.target.value)}
                      placeholder="Un subtítulo atractivo e informativo" className="mt-1 text-sm p-2 shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authorName" className="text-sm font-medium">Nombre del Autor/a</Label>
                    <Input
                      id="authorName" value={currentBook.author || ''} onChange={(e) => handleBookDetailsChange('author', e.target.value)}
                      placeholder="Tu Nombre como Autor/a" className="mt-1 text-sm p-2 shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Imagen de Portada Principal</Label>
                    <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <Label htmlFor="coverImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                        <UploadCloud className="mr-2 h-4 w-4" /> Subir Imagen Principal
                      </Label>
                       <Input id="coverImageUploadFile" type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" />
                      {currentBook.coverImage && (
                        <Button variant="outline" size="sm" onClick={() => setCurrentBook(prev => ({...prev, coverImage: null, lastModified: Date.now()}))} className="text-xs">Quitar Imagen Principal</Button>
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
                         <Button variant="outline" size="sm" onClick={() => setCurrentBook(prev => ({...prev, authorImage: null, lastModified: Date.now()}))} className="text-xs">Quitar Foto del Autor</Button>
                       )}
                     </div>
                     {currentBook.authorImage && (
                       <div className="space-y-2 mt-2">
                         <Label htmlFor="authorImagePosition" className="text-sm font-medium">Posición de Foto del Autor</Label>
                         <Select onValueChange={(value) => handleAuthorImagePositionChange(value as AuthorImagePosition)} value={currentBook.authorImagePosition || 'bottom-right'}>
                           <SelectTrigger id="authorImagePosition" className="mt-1 text-sm">
                             <SelectValue placeholder="Seleccionar posición" />
                           </SelectTrigger>
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

                  {(currentBook.coverImage || currentBook.authorImage) && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col items-center justify-center shadow-inner overflow-hidden relative">
                         {currentBook.coverImage && <NextImage src={currentBook.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />}
                         <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-center text-center z-10 p-3`}>
                           <h3 className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.title}</h3>
                            {currentBook.subtitle && <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words mt-1"><em>{currentBook.subtitle}</em></p>}
                         </div>
                         {currentBook.authorImage && (
                            <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-16 h-20 z-20 flex flex-col items-center text-center`}>
                                <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={60} height={60} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                                <p className="text-[10px] text-white mt-0.5 [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words leading-tight">{currentBook.author}</p>
                            </div>
                         )}
                          {!currentBook.authorImage && (
                             <div className="absolute bottom-3 left-0 right-0 z-10 text-center">
                               <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words"><em>{currentBook.author}</em></p>
                             </div>
                          )}
                       </div>
                    )}
                    {!currentBook.coverImage && !currentBook.authorImage && (
                      <div className="mt-4 p-2 border border-dashed rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted/50 flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={36} className="mb-2 opacity-70" />
                        <p className="text-xs text-center">Sube imágenes para la portada y foto del autor.</p>
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>

          </div>

          <div className="w-full lg:w-1/2 lg:sticky lg:top-8"> {/* Make preview sticky on larger screens */}
            <Card className="shadow-lg h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2 h-5 w-5 text-primary" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Observa cómo tu libro toma forma. La paginación es una aproximación.</CardDescription>
              </CardHeader>
              <CardContent
                className="overflow-y-auto p-3 md:p-4 flex-grow"
                style={{
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  borderRadius: 'var(--radius)',
                }}
              >
                {activeTab === 'cover' ? (
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col items-center justify-center shadow-lg overflow-hidden relative" style={{backgroundColor: formattingOptions.pageBackgroundColor}}>
                    {currentBook.coverImage ? (
                      <NextImage src={currentBook.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">Sin imagen de portada principal</p>
                      </div>
                    )}
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col items-center justify-center p-4 md:p-6 text-center z-10">
                      <h2 className="text-xl md:text-2xl font-bold text-white [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight">{currentBook.title}</h2>
                      {currentBook.subtitle && <p className="text-base md:text-lg text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] italic mb-2">{currentBook.subtitle}</p>}

                       {!currentBook.authorImage && /* Show main author centrally if no author photo */ (
                         <p className="text-base md:text-lg text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)]"><em>{currentBook.author}</em></p>
                       )}
                    </div>
                    {currentBook.authorImage && (
                        <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-24 z-20 flex flex-col items-center text-center p-1 bg-black/10 rounded`}>
                            <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={70} height={70} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                            <p className="text-xs text-white mt-1 [text-shadow:1px_1px_1px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.author}</p>
                        </div>
                    )}
                  </div>
                ) : paginatedPreview.length > 0 && currentPreviewPageData ? (
                  <div
                    key={`${currentPreviewPageData.pageNumber}-${currentBook.id}-${currentPreviewPageIndex}`} // More specific key
                    className="page-simulation-wrapper mx-auto my-4 prose max-w-none"
                    style={{
                      ...simulatedPageStyle,
                      opacity: isPageTransitioning ? 0 : 1,
                      transition: 'opacity 0.15s ease-in-out', // Faster transition
                    }}
                  >
                    <div className="page-header text-xs py-1.5 px-2.5 border-b" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: 'hsl(var(--border))'}}>
                      <span className="float-left truncate max-w-[45%]">{currentPreviewPageData.headerLeft}</span>
                      <span className="float-right truncate max-w-[45%]">{currentPreviewPageData.headerRight}</span>
                      <div style={{clear: 'both'}}></div>
                    </div>

                    <div className="page-content-area flex-grow overflow-hidden py-2 px-1" style={{lineHeight: formattingOptions.lineHeight, fontSize: `${formattingOptions.fontSize}px`}}>
                      {currentPreviewPageData.contentElements.length > 0 ? currentPreviewPageData.contentElements : <p className="italic text-center" style={{opacity: 0.6, minHeight: '2em'}}>&nbsp;</p>}
                    </div>

                    <div className="page-footer text-xs py-1.5 px-2.5 border-t text-center" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: 'hsl(var(--border))'}}>
                      {currentPreviewPageData.footerCenter}
                    </div>
                  </div>
                ) : (
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
                    { (currentBook.content === null || currentBook.content.trim() === "") &&
                      <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor o añade capítulos para ver la vista previa)</p>
                    }
                  </div>
                )}
              </CardContent>
              {activeTab !== 'cover' && paginatedPreview.length > 0 && (
                <CardFooter className="flex items-center justify-center gap-3 py-3 border-t">
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
                <CardFooter className="text-xs text-muted-foreground justify-center py-2.5 border-t">
                  La vista previa aparecerá aquí.
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
