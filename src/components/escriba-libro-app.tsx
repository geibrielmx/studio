
"use client";

import { useState, useEffect, type ChangeEvent, type CSSProperties, useCallback } from 'react';
import type { Book, ChapterEntry } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { UploadCloud, BookOpen, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode, FilePlus, Trash2 } from 'lucide-react';
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
const IMAGE_LINE_EQUIVALENT = 15;

const LOCALSTORAGE_BOOKS_LIST_KEY = 'escribaLibro_books_list_v4';
const LOCALSTORAGE_ACTIVE_BOOK_ID_KEY = 'escribaLibro_activeBookId_v4';
const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v4'; // Updated for consistency

const createInitialBook = (): Book => ({
  id: Date.now().toString(),
  title: 'Libro sin Título',
  author: 'Autor Desconocido',
  content: '',
  coverImage: null,
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
              maxWidth: `calc(100% - ${formattingOptions.previewPadding * 0}px)`,
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
  if (!book.content) return output;

  const allLines = book.content.split('\n');
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
      if (currentPageLines.length > 0) {
        output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
        currentPageLines = [];
        linesAccumulatedOnCurrentPage = 0;
        currentPageNumber++;
      }
      currentChapterForHeader = line.substring(3).trim();
      currentPageLines.push(line);
      linesAccumulatedOnCurrentPage += lineCost;
      if (i === allLines.length - 1) {
         output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
         currentPageLines = [];
      }
      continue;
    }

    if (linesAccumulatedOnCurrentPage + lineCost > linesPerPage && currentPageLines.length > 0) {
      output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
      currentPageLines = [];
      linesAccumulatedOnCurrentPage = 0;
      currentPageNumber++;
    }

    currentPageLines.push(line);
    linesAccumulatedOnCurrentPage += lineCost;
  }

  if (currentPageLines.length > 0) {
    output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
  }
  
  if (output.length === 0 && (book.content.trim() === "" || book.content === null)) {
     output.push(createPageObject(1, book.title, "Inicio del Libro", [""], formattingOptions));
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
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<Book>(createInitialBook());

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
  const [mounted, setMounted] = useState(false);
  const [paginatedPreview, setPaginatedPreview] = useState<PagePreviewData[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isBookListDialogOpen, setIsBookListDialogOpen] = useState(false);

  const loadDataFromLocalStorage = useCallback(() => {
    try {
      const savedBooksList = localStorage.getItem(LOCALSTORAGE_BOOKS_LIST_KEY);
      const savedActiveBookId = localStorage.getItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY);
      let loadedBooks: Book[] = [];

      if (savedBooksList) {
        loadedBooks = JSON.parse(savedBooksList);
        setBooks(loadedBooks);
      }

      if (savedActiveBookId && loadedBooks.length > 0) {
        const foundBook = loadedBooks.find(b => b.id === savedActiveBookId);
        if (foundBook) {
          setCurrentBook(foundBook);
          setActiveBookId(foundBook.id);
        } else if (loadedBooks.length > 0) {
          // If active ID not found, load most recently modified or first
          const sortedBooks = [...loadedBooks].sort((a, b) => b.lastModified - a.lastModified);
          setCurrentBook(sortedBooks[0]);
          setActiveBookId(sortedBooks[0].id);
        } else {
          const newBook = createInitialBook();
          setCurrentBook(newBook);
          setActiveBookId(newBook.id);
          setBooks([newBook]); // Start with one book if storage was totally empty
        }
      } else if (loadedBooks.length > 0) {
        // No active ID, but books exist, load most recent
        const sortedBooks = [...loadedBooks].sort((a, b) => b.lastModified - a.lastModified);
        setCurrentBook(sortedBooks[0]);
        setActiveBookId(sortedBooks[0].id);
      } else {
        // No books, no active ID (first time user or cleared storage)
        const newBook = createInitialBook();
        setCurrentBook(newBook);
        setActiveBookId(newBook.id);
        setBooks([newBook]);
      }

      const savedFormatting = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormatting) {
        setFormattingOptions(JSON.parse(savedFormatting));
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
  }, [toast]);

  useEffect(() => {
    setMounted(true);
    loadDataFromLocalStorage();
  }, [loadDataFromLocalStorage]);

  // Auto-save current book changes to the books list and localStorage
  useEffect(() => {
    if (mounted && activeBookId) {
      const updatedBook = { ...currentBook, lastModified: Date.now() };
      const bookExists = books.some(b => b.id === activeBookId);
      let newBooksList: Book[];

      if (bookExists) {
        newBooksList = books.map(b => b.id === activeBookId ? updatedBook : b);
      } else {
        // This case should ideally be handled by explicit save for a truly new book
        // but for auto-save, we'll add it if activeBookId is set but not in list yet (e.g., after "New Book")
        newBooksList = [...books, updatedBook];
      }
      
      setBooks(newBooksList); // Update state first for reactivity
      localStorage.setItem(LOCALSTORAGE_BOOKS_LIST_KEY, JSON.stringify(newBooksList));
      localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, activeBookId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook, mounted]); // Removed books from deps to avoid loop with setBooks


  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
    }
  }, [formattingOptions, mounted]);

  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(currentBook, formattingOptions);
      setPaginatedPreview(newPreview);
      const newToc = generateTableOfContents(newPreview);
      if (JSON.stringify(newToc) !== JSON.stringify(currentBook.tableOfContents)) {
        setCurrentBook(prev => ({ ...prev, tableOfContents: newToc }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook.content, currentBook.title, formattingOptions, mounted]);


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
    if (!activeBookId) { // Should not happen if initial load is correct
      toast({ title: "Error al Guardar", description: "No hay un libro activo para guardar.", variant: "destructive" });
      return;
    }
    const bookToSave = { ...currentBook, lastModified: Date.now() };
    const updatedBooks = books.map(b => b.id === activeBookId ? bookToSave : b);
    // If for some reason the active book is not in the list (e.g. after new and before first auto-save)
    if (!updatedBooks.find(b => b.id === activeBookId)) {
        updatedBooks.push(bookToSave);
    }
    
    setBooks(updatedBooks);
    setCurrentBook(bookToSave); // Ensure current book in state reflects saved version
    localStorage.setItem(LOCALSTORAGE_BOOKS_LIST_KEY, JSON.stringify(updatedBooks));
    localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, activeBookId);
    toast({
      title: "¡Progreso Guardado!",
      description: `El libro "${bookToSave.title}" y las preferencias de formato se han guardado.`,
      duration: 3000,
    });
  };

  const handleOpenBookList = () => {
    setIsBookListDialogOpen(true);
  };

  const handleSelectBookToOpen = (bookId: string) => {
    const bookToOpen = books.find(b => b.id === bookId);
    if (bookToOpen) {
      setCurrentBook(bookToOpen);
      setActiveBookId(bookToOpen.id);
      localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, bookToOpen.id);
      setIsBookListDialogOpen(false);
      setActiveTab('editor'); // Switch to editor tab
      toast({
        title: "Libro Cargado",
        description: `"${bookToOpen.title}" ahora está activo en el editor.`,
        duration: 3000,
      });
    }
  };
  
  const handleNewBook = () => {
    const newBook = createInitialBook();
    setCurrentBook(newBook);
    setActiveBookId(newBook.id); // Set new book as active
    // Add to books list immediately, it will be updated on first change by useEffect or manual save
    setBooks(prevBooks => [...prevBooks, newBook]); 
    localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, newBook.id);
    // The useEffect for currentBook changes will then save the full books list
    toast({
      title: "Nuevo Libro Creado",
      description: "El editor ha sido reiniciado. ¡Empieza tu nueva obra!",
      duration: 3000,
    });
     setActiveTab('editor');
  };

  const handleDeleteBook = (bookIdToDelete: string) => {
    const bookToDelete = books.find(b => b.id === bookIdToDelete);
    if (!bookToDelete) return;

    const updatedBooks = books.filter(b => b.id !== bookIdToDelete);
    setBooks(updatedBooks);
    localStorage.setItem(LOCALSTORAGE_BOOKS_LIST_KEY, JSON.stringify(updatedBooks));

    if (activeBookId === bookIdToDelete) {
      if (updatedBooks.length > 0) {
        const mostRecentBook = [...updatedBooks].sort((a,b) => b.lastModified - a.lastModified)[0];
        setCurrentBook(mostRecentBook);
        setActiveBookId(mostRecentBook.id);
        localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, mostRecentBook.id);
      } else {
        const newBook = createInitialBook();
        setCurrentBook(newBook);
        setActiveBookId(newBook.id);
        setBooks([newBook]); // Add this new book to list
        localStorage.setItem(LOCALSTORAGE_ACTIVE_BOOK_ID_KEY, newBook.id);
        localStorage.setItem(LOCALSTORAGE_BOOKS_LIST_KEY, JSON.stringify([newBook]));
      }
    }
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

  const handleBookDetailsChange = (field: keyof Pick<Book, 'title' | 'author'>, value: string) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
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
    overflow: 'hidden',
  };

  const createPdfPageHtml = (
    pageData: PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[] },
    isToc: boolean = false
  ): HTMLDivElement => {
    const pageDiv = document.createElement('div');
    const pdfPageWidthPx = 750; 
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; 

    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.minHeight = `${pdfPageHeightPx - 2 * formattingOptions.previewPadding}px`; 
    pageDiv.style.padding = `${formattingOptions.previewPadding}px`;
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize}px`;
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.boxSizing = 'border-box';

    if (isToc && 'type' in pageData && pageData.type === 'toc') {
      const tocHeader = document.createElement('h2');
      tocHeader.textContent = "Índice";
      tocHeader.style.textAlign = 'center';
      tocHeader.style.fontSize = `${formattingOptions.fontSize * 1.8}px`;
      tocHeader.style.fontWeight = 'bold';
      tocHeader.style.margin = `${formattingOptions.fontSize * 1.5}px 0`;
      pageDiv.appendChild(tocHeader);

      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.paddingLeft = '20px'; 
      ul.style.flexGrow = '1'; 
      pageData.entries.forEach(entry => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'baseline';
        li.style.padding = `${formattingOptions.fontSize * 0.4}px 0`;
        li.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.3)`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = entry.title;
        titleSpan.style.marginRight = '10px';
        titleSpan.style.flexGrow = '1';
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis'; 
        
        const dots = document.createElement('span');
        dots.textContent = ".".repeat(Math.max(5, 40 - entry.title.length - String(entry.estimatedPage).length)); 
        dots.style.flexShrink = '0'; 
        dots.style.margin = '0 5px';
        dots.style.opacity = '0.5';
        
        const pageSpan = document.createElement('span');
        pageSpan.textContent = String(entry.estimatedPage);
        pageSpan.style.marginLeft = '10px';
        pageSpan.style.fontWeight = 'bold';

        li.appendChild(titleSpan);
        li.appendChild(dots);
        li.appendChild(pageSpan);
        ul.appendChild(li);
      });
      pageDiv.appendChild(ul);

    } else if (!isToc && 'rawContentLines' in pageData) {
      const typedPageData = pageData as PagePreviewData;
      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = `${formattingOptions.fontSize * 0.75}px`;
      headerDiv.style.opacity = '0.7';
      headerDiv.style.paddingBottom = '5px';
      headerDiv.style.borderBottom = `1px solid ${formattingOptions.textColor}`;
      headerDiv.style.marginBottom = '15px';
      const headerLeft = document.createElement('span');
      headerLeft.textContent = typedPageData.headerLeft;
      const headerRight = document.createElement('span');
      headerRight.textContent = typedPageData.headerRight;
      headerDiv.appendChild(headerLeft);
      headerDiv.appendChild(headerRight);
      pageDiv.appendChild(headerDiv);

      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1'; 
      typedPageData.rawContentLines.forEach(line => {
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = `${formattingOptions.fontSize * 0.8}px 0`; 
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '80%'; 
          img.style.maxHeight = '350px'; 
          img.style.height = 'auto';
          img.style.borderRadius = '4px';
          img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          imgContainer.appendChild(img);
          if (altText) { 
            const caption = document.createElement('p');
            caption.textContent = altText;
            caption.style.fontSize = `${formattingOptions.fontSize * 0.8}px`; caption.style.fontStyle = 'italic'; caption.style.opacity = '0.8'; caption.style.marginTop = '0.25em';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
        } else {
          const p = document.createElement('p');
          p.innerHTML = line.trim() === '' ? '&nbsp;' : line; 
          p.style.margin = `${formattingOptions.fontSize * 0.3}px 0`; 
          if (line.startsWith('## ')) { 
            p.style.fontSize = `${formattingOptions.fontSize * 1.5}px`; p.style.fontWeight = 'bold'; p.style.marginTop = `${formattingOptions.fontSize}px`; p.style.marginBottom = `${formattingOptions.fontSize * 0.5}px`;
            p.textContent = line.substring(3).trim(); 
          }
          contentAreaDiv.appendChild(p);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      const footerDiv = document.createElement('div');
      footerDiv.style.textAlign = 'center';
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.75}px`;
      footerDiv.style.opacity = '0.7';
      footerDiv.style.paddingTop = '5px';
      footerDiv.style.borderTop = `1px solid ${formattingOptions.textColor}`;
      footerDiv.style.marginTop = 'auto'; 
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
    const marginPt = 40; 
    const usableWidthPt = pdfWidthPt - 2 * marginPt;

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.width = '750px'; 
    document.body.appendChild(tempContainer);

    const renderedCanvases: { type: 'cover' | 'toc' | 'content', canvas: HTMLCanvasElement }[] = [];
    const chapterPdfPageMap: ChapterEntry[] = []; 

    if (currentBook.coverImage) {
      const coverDiv = document.createElement('div');
      coverDiv.style.width = '750px'; 
      coverDiv.style.height = `${750 * (pdfHeightPt / pdfWidthPt)}px`; 
      coverDiv.style.display = 'flex'; coverDiv.style.flexDirection = 'column'; coverDiv.style.alignItems = 'center'; coverDiv.style.justifyContent = 'center';
      coverDiv.style.position = 'relative'; coverDiv.style.backgroundColor = formattingOptions.pageBackgroundColor; coverDiv.style.overflow = 'hidden';
      
      const img = document.createElement('img'); img.src = currentBook.coverImage;
      img.style.position = 'absolute'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; 
      coverDiv.appendChild(img);
      
      const textOverlay = document.createElement('div');
      textOverlay.style.position = 'absolute'; textOverlay.style.inset = '0'; textOverlay.style.display = 'flex'; textOverlay.style.flexDirection = 'column';
      textOverlay.style.alignItems = 'center'; textOverlay.style.justifyContent = 'flex-end'; textOverlay.style.padding = '40px';
      textOverlay.style.textAlign = 'center'; textOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)'; 
      textOverlay.style.zIndex = '10';
      
      const titleEl = document.createElement('h2'); titleEl.textContent = currentBook.title;
      titleEl.style.fontFamily = formattingOptions.fontFamily; titleEl.style.fontSize = '36px'; titleEl.style.fontWeight = 'bold'; titleEl.style.color = 'white';
      titleEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.7)'; titleEl.style.marginBottom = '10px';
      textOverlay.appendChild(titleEl);
      
      const authorEl = document.createElement('p'); authorEl.textContent = currentBook.author;
      authorEl.style.fontFamily = formattingOptions.fontFamily; authorEl.style.fontSize = '24px'; authorEl.style.fontStyle = 'italic'; authorEl.style.color = '#e0e0e0';
      authorEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
      textOverlay.appendChild(authorEl); 
      coverDiv.appendChild(textOverlay);
      
      tempContainer.appendChild(coverDiv);
      const canvas = await html2canvas(coverDiv, { scale: 2, useCORS: true, windowWidth: coverDiv.scrollWidth, windowHeight: coverDiv.scrollHeight });
      renderedCanvases.push({ type: 'cover', canvas });
      tempContainer.removeChild(coverDiv);
    }

    let currentContentPdfPage = 0; 
    for (const pageData of paginatedPreview) {
      currentContentPdfPage++;
      const pdfPageData = { ...pageData, footerCenter: `Página ${currentContentPdfPage}` }; 
      const pageDiv = createPdfPageHtml(pdfPageData);
      tempContainer.appendChild(pageDiv);
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
      renderedCanvases.push({ type: 'content', canvas });
      tempContainer.removeChild(pageDiv);

      if (pageData.isStartOfChapter && pageData.chapterTitle) {
        chapterPdfPageMap.push({ title: pageData.chapterTitle, estimatedPage: currentContentPdfPage }); 
      }
    }
    
    if (chapterPdfPageMap.length > 0) {
      const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: chapterPdfPageMap }, true);
      tempContainer.appendChild(tocPageDiv);
      const canvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
      
      const tocInsertIndex = currentBook.coverImage ? 1 : 0;
      renderedCanvases.splice(tocInsertIndex, 0, { type: 'toc', canvas });
      tempContainer.removeChild(tocPageDiv);
    }

    renderedCanvases.forEach((render, index) => {
      if (index > 0) pdf.addPage(); 
      const canvas = render.canvas;
      const canvasAspectRatio = canvas.height / canvas.width;
      let imgHeightPt = usableWidthPt * canvasAspectRatio;
      let imgWidthPt = usableWidthPt;

      if (imgHeightPt > (pdfHeightPt - 2 * marginPt)) {
        imgHeightPt = pdfHeightPt - 2 * marginPt;
        imgWidthPt = imgHeightPt / canvasAspectRatio;
      }
      
      const xOffset = marginPt + (usableWidthPt - imgWidthPt) / 2; 
      const yOffset = marginPt;

      pdf.addImage(canvas.toDataURL('image/png', 0.92), 'PNG', xOffset, yOffset, imgWidthPt, imgHeightPt);
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
    txtContent += `Autor: ${currentBook.author || 'Desconocido'}\n\n`;
    txtContent += "Contenido:\n";
    txtContent += currentBook.content.replace(/!\[.*?\]\(.*?\)/g, '[Imagen Omitida]'); 

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
          body { 
            font-family: ${formattingOptions.fontFamily}; 
            font-size: ${formattingOptions.fontSize}px; 
            color: ${formattingOptions.textColor}; 
            background-color: ${formattingOptions.pageBackgroundColor}; 
            line-height: ${formattingOptions.lineHeight};
            margin: 20px auto; 
            padding: ${formattingOptions.previewPadding}px;
            max-width: 800px;
            border: 1px solid #ddd;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          h1, h2, h3 { color: ${formattingOptions.textColor}; }
          h1.book-title { font-size: ${formattingOptions.fontSize * 2.2}px; text-align: center; margin-bottom: 0.2em; }
          h2.chapter-title { font-size: ${formattingOptions.fontSize * 1.7}px; margin-top: 2em; margin-bottom: 0.8em; padding-bottom: 0.3em; border-bottom: 1px solid ${formattingOptions.textColor};}
          h3.author-name { font-size: ${formattingOptions.fontSize * 1.3}px; text-align: center; font-style: italic; margin-top:0; margin-bottom: 2em; }
          img.cover-image { max-width: 60%; height: auto; display: block; margin: 20px auto 40px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; }
          .content-image { max-width: 80%; height: auto; display: block; margin: 1.5em auto; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
          p { margin-bottom: ${formattingOptions.fontSize * 0.6}px; text-align: justify; }
          .toc { border: 1px solid #eee; padding: 15px 25px; margin-bottom: 30px; background-color: #fdfdfd; border-radius: 6px;}
          .toc h2 { text-align: center; margin-top: 0; font-size: ${formattingOptions.fontSize * 1.5}px; }
          .toc ul { list-style-type: none; padding-left: 0; }
          .toc li { margin-bottom: 8px; font-size: ${formattingOptions.fontSize * 0.95}px; }
          .page-break-before { page-break-before: always; }
        </style>
      </head>
      <body>
    `;

    if (currentBook.coverImage) {
      htmlString += `  <img src="${currentBook.coverImage}" alt="Portada del Libro" class="cover-image" data-ai-hint="book cover" />\n`;
    }
    htmlString += `  <h1 class="book-title">${currentBook.title || 'Libro sin Título'}</h1>\n`;
    htmlString += `  <h3 class="author-name"><em>por ${currentBook.author || 'Autor Desconocido'}</em></h3>\n`;

    if (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) {
      htmlString += '  <div class="toc page-break-before">\n';
      htmlString += '    <h2>Índice</h2>\n';
      htmlString += '    <ul>\n';
      currentBook.tableOfContents.forEach(entry => {
        htmlString += `      <li>${entry.title}</li>\n`; 
      });
      htmlString += '    </ul>\n';
      htmlString += '  </div>\n';
    }

    const contentParagraphs = currentBook.content
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
                    value={currentBook.content}
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
                  {currentBook.tableOfContents && currentBook.tableOfContents.length > 0 ? (
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
                  <CardDescription>Personaliza la información y la imagen de la portada de tu libro.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-4 md:p-6">
                  <div className="space-y-2">
                    <Label htmlFor="bookTitleInput" className="text-sm font-medium">Título del Libro</Label>
                    <Input
                      id="bookTitleInput" value={currentBook.title} onChange={(e) => handleBookDetailsChange('title', e.target.value)}
                      placeholder="El Título de tu Gran Libro" className="mt-1 text-sm p-2 shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authorName" className="text-sm font-medium">Nombre del Autor/a</Label>
                    <Input
                      id="authorName" value={currentBook.author} onChange={(e) => handleBookDetailsChange('author', e.target.value)}
                      placeholder="Tu Nombre como Autor/a" className="mt-1 text-sm p-2 shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Imagen de Portada</Label>
                    <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <Label htmlFor="coverImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                        <UploadCloud className="mr-2 h-4 w-4" /> Subir Imagen de Portada
                      </Label>
                       <Input id="coverImageUploadFile" type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" />
                      {currentBook.coverImage && (
                        <Button variant="outline" size="sm" onClick={() => setCurrentBook(prev => ({...prev, coverImage: null, lastModified: Date.now()}))} className="text-xs">Quitar Imagen</Button>
                      )}
                    </div>
                    {currentBook.coverImage && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col items-center justify-center shadow-inner overflow-hidden relative">
                         <NextImage src={currentBook.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-end p-3 text-center z-10">
                           <h3 className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.title}</h3>
                           <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words"><em>{currentBook.author}</em></p>
                         </div>
                       </div>
                    )}
                    {!currentBook.coverImage && (
                      <div className="mt-4 p-2 border border-dashed rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted/50 flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={36} className="mb-2 opacity-70" />
                        <p className="text-xs text-center">Sube una imagen para la portada.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </div>

          <div className="w-full lg:w-1/2 lg:sticky lg:top-8">
            <Card className="shadow-lg h-full">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2 h-5 w-5 text-primary" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Observa cómo tu libro toma forma. La paginación es una aproximación.</CardDescription>
              </CardHeader>
              <CardContent
                className="overflow-y-auto p-3 md:p-4"
                style={{
                  maxHeight: 'calc(100vh - 16rem)', 
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  borderRadius: 'var(--radius)',
                }}
              >
                {activeTab === 'editor' || activeTab === 'formatting' || activeTab === 'index' ? (
                  paginatedPreview.length > 0 ? paginatedPreview.map(page => (
                    <div
                      key={`page-preview-${page.pageNumber}-${currentBook.id}`} // Add book id to key for re-render on book change
                      className="page-simulation-wrapper mx-auto my-4 prose max-w-none" 
                      style={simulatedPageStyle}
                    >
                      <div className="page-header text-xs py-1.5 px-2.5 border-b" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: `hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground-rgb')}, 0.3)`}}>
                        <span className="float-left truncate max-w-[45%]">{page.headerLeft}</span>
                        <span className="float-right truncate max-w-[45%]">{page.headerRight}</span>
                        <div style={{clear: 'both'}}></div> 
                      </div>

                      <div className="page-content-area flex-grow overflow-hidden py-2 px-1" style={{lineHeight: formattingOptions.lineHeight, fontSize: `${formattingOptions.fontSize}px`}}>
                        {page.contentElements.length > 0 ? page.contentElements : <p className="italic text-center" style={{opacity: 0.6, minHeight: '2em'}}>&nbsp;</p>}
                      </div>

                      <div className="page-footer text-xs py-1.5 px-2.5 border-t text-center" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: `hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground-rgb')}, 0.3)`}}>
                        {page.footerCenter}
                      </div>
                    </div>
                  )) : (
                    <div
                      className="prose max-w-none border rounded-md min-h-[300px] shadow-inner flex flex-col justify-center items-center text-center p-6"
                      style={{
                        fontFamily: formattingOptions.fontFamily,
                        fontSize: `${formattingOptions.fontSize}px`,
                        color: formattingOptions.textColor,
                        backgroundColor: formattingOptions.pageBackgroundColor, 
                        lineHeight: formattingOptions.lineHeight,
                      }}
                    >
                      <ImageIcon size={48} className="text-muted-foreground opacity-50 mb-4" />
                      <h3 className="text-lg font-semibold mb-1">{currentBook.title}</h3>
                      <p className="text-sm italic mb-3">por {currentBook.author}</p>
                      <p className="text-xs italic text-muted-foreground">
                        La vista previa del contenido aparecerá aquí paginada.
                      </p>
                      { (currentBook.content === null || currentBook.content.trim() === "") && 
                        <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor o añade capítulos para ver la vista previa)</p>
                      }
                    </div>
                  )
                ) : activeTab === 'cover' ? (
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col items-center justify-center shadow-lg overflow-hidden relative" style={{backgroundColor: formattingOptions.pageBackgroundColor}}>
                    {currentBook.coverImage ? (
                      <NextImage src={currentBook.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">Sin imagen de portada</p>
                      </div>
                    )}
                     <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-end p-4 md:p-6 text-center z-10">
                      <h2 className="text-xl md:text-2xl font-bold text-white [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight">{currentBook.title}</h2>
                      <p className="text-base md:text-lg text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)]"><em>{currentBook.author}</em></p>
                    </div>
                  </div>
                ) : null}
              </CardContent>
               { (activeTab === 'editor' || activeTab === 'formatting' || activeTab === 'index') && paginatedPreview.length > 0 && (
                <CardFooter className="text-xs text-muted-foreground justify-center py-2.5 border-t">
                  Mostrando {paginatedPreview.length} página(s) de vista previa.
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
