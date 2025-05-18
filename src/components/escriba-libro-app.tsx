
"use client";

import type { ChangeEvent, CSSProperties } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Book, ChapterEntry, AuthorImagePosition, CoverTextPosition, FormattingOptions } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { UploadCloud, BookOpen, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode, FilePlus, Trash2, ChevronLeft, ChevronRight, UserSquare2, FileSearch, Building, AlignLeft, AlignCenter, AlignRight, BookIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const PAGE_CONTENT_TARGET_HEIGHT_PX = 680;
const PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX = 70;
const IMAGE_LINE_EQUIVALENT = 15;
const PAGE_BREAK_MARKER = '\\newpage';

const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v6'; // Incremented version

interface PagePreviewData {
  pageNumber: number;
  headerLeft: string;
  headerRight: string;
  contentElements: JSX.Element[];
  rawContentLines: string[];
  footerCenter: string; // This will be adjusted by alignment
  isStartOfChapter?: boolean;
  chapterTitle?: string;
  isForceBreak?: boolean;
}

const createInitialBook = (): Book => ({
  id: Date.now().toString(),
  title: 'Libro sin Título',
  subtitle: '',
  author: 'Autor Desconocido',
  editorial: '',
  content: '',
  coverImage: null,
  authorImage: null,
  authorImagePosition: 'bottom-right',
  titlePosition: 'middle-center',
  subtitlePosition: 'middle-center',
  editorialPosition: 'bottom-center',
  tableOfContents: [],
  lastModified: Date.now(),
});

const initialFormattingOptions: FormattingOptions = {
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  textColor: 'hsl(var(--foreground))', // Default, will be updated from CSS
  previewBackgroundColor: 'hsl(var(--background))', // Default
  pageBackgroundColor: 'hsl(var(--card))', // Default
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
      return <p key={`${pageKeyPrefix}-line-${index}`} className="hidden-page-break-marker"></p>; // Marker for logic, not visible
    }
    if (index === 0 && paragraph.startsWith('## ')) {
      isStartOfChapter = true;
      chapterTitle = paragraph.substring(3).trim();
    }
    const imageMatch = paragraph.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
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
    } else if (paragraph.match(/!\[(.*?)\]\((.*?)\)/)) {
        const [, altText] = paragraph.match(/!\[(.*?)\]\((.*?)\)/)!;
        return <p key={`${pageKeyPrefix}-line-${index}`} className="my-1.5 md:my-2 italic text-muted-foreground text-center">[Imagen: {altText || 'Referencia de imagen externa'}]</p>;
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
    footerCenter: `Página ${pageNumber}`, // Base text, alignment handled in render
    isStartOfChapter: isStartOfChapter || (lines.length > 0 && lines[0].startsWith('## ')),
    chapterTitle: chapterTitle || (lines.length > 0 && lines[0].startsWith('## ') ? lines[0].substring(3).trim() : undefined),
    isForceBreak,
  };
}

function generatePagePreviews(
  book: Book,
  formattingOptions: FormattingOptions
): PagePreviewData[] {
  const output: PagePreviewData[] = [];
  if (!book.content && !book.title) return output;

  const allLines = (book.content || '').split('\n');
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
    const isManualPageBreak = line.trim() === PAGE_BREAK_MARKER;
    let lineCost = 1;
    if (/!\[(.*?)\]\(data:image\/.*?\)/.test(line)) {
      lineCost = IMAGE_LINE_EQUIVALENT;
    }

    if (isManualPageBreak) {
        if (currentPageLines.length > 0 || isChapterHeading) { // also break if it's just a chapter heading
             output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions, true));
             currentPageLines = [];
             linesAccumulatedOnCurrentPage = 0;
             currentPageNumber++;
        }
        continue; // Skip the page break marker line itself
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
        estimatedPage: page.pageNumber, // This is page number in preview, PDF recalculates
      });
      chapterTitles.add(page.chapterTitle);
    }
  });
  return toc;
}

export default function EscribaLibroApp() {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [currentBook, setCurrentBook] = useState<Book>(createInitialBook());
  const [formattingOptions, setFormattingOptions] = useState<FormattingOptions>(initialFormattingOptions);

  const [activeTab, setActiveTab] = useState('editor');
  const [paginatedPreview, setPaginatedPreview] = useState<PagePreviewData[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [currentPreviewPageIndex, setCurrentPreviewPageIndex] = useState(0);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);


  const loadFormattingFromLocalStorage = useCallback(() => {
    try {
      const savedFormattingJson = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormattingJson) {
        setFormattingOptions(JSON.parse(savedFormattingJson));
      } else {
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

 useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
      } catch (error) {
        console.error("Error saving formatting to localStorage:", error);
        toast({
          title: "Error al Guardar Formato",
          description: "No se pudieron guardar las preferencias de formato.",
          variant: "destructive"
        });
      }
    }
  }, [formattingOptions, mounted, toast]);

  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(currentBook, formattingOptions);
      setPaginatedPreview(newPreview);
      setCurrentPreviewPageIndex(prevIdx => newPreview.length > 0 ? Math.min(prevIdx, newPreview.length - 1) : 0);

      const newToc = generateTableOfContents(newPreview);
      if (JSON.stringify(newToc) !== JSON.stringify(currentBook.tableOfContents)) {
        setCurrentBook(prev => ({ ...prev, tableOfContents: newToc, lastModified: Date.now() }));
      }
    }
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
    
    txtContent += "## Contenido del Libro ##\n";
    const contentForTxt = (currentBook.content || '').replace(/!\[(.*?)\]\(data:image\/.*?;base64,.*?\)/g, '[Imagen: $1]');
    txtContent += contentForTxt;

    const filename = `${(currentBook.title || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
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
      description: `"${currentBook.title}" se ha descargado como ${filename}.`,
      duration: 3000,
    });
  };
  
  const handleOpenBookFromTxt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const newBook = createInitialBook(); // Creates a book with a new ID and current timestamp
          
          const titleMatch = text.match(/^Título:\s*(.*)/m);
          if (titleMatch) newBook.title = titleMatch[1].trim();

          const subtitleMatch = text.match(/^Subtítulo:\s*(.*)/m);
          if (subtitleMatch) newBook.subtitle = subtitleMatch[1].trim();
          
          const authorMatch = text.match(/^Autor:\s*(.*)/m);
          if (authorMatch) newBook.author = authorMatch[1].trim();

          const editorialMatch = text.match(/^Editorial:\s*(.*)/m);
          if (editorialMatch) newBook.editorial = editorialMatch[1].trim();

          const contentHeader = "## Contenido del Libro ##\n";
          const contentStartIndex = text.indexOf(contentHeader);
          if (contentStartIndex !== -1) {
            newBook.content = text.substring(contentStartIndex + contentHeader.length).trim();
          } else {
            const lines = text.split('\n');
            let contentStartLine = 0;
            for(let i=0; i < lines.length; i++) {
                if(lines[i].startsWith("Título:") || lines[i].startsWith("Subtítulo:") || lines[i].startsWith("Autor:") || lines[i].startsWith("Editorial:") || lines[i].trim() === "") {
                    contentStartLine = i + 1;
                } else {
                    break; 
                }
            }
            const potentialContentStart = lines.slice(contentStartLine).join('\n');
            newBook.content = potentialContentStart.trim() || text;
          }
          
          newBook.coverImage = null;
          newBook.authorImage = null;
          newBook.lastModified = Date.now(); // Set last modified to now for the new book instance

          setCurrentBook(newBook);
          setActiveTab('editor');
          setCurrentPreviewPageIndex(0);
          toast({
            title: "Libro Cargado",
            description: `"${newBook.title}" ahora está activo en el editor. Las imágenes no se cargan desde TXT.`,
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
    setCurrentBook(createInitialBook());
    setCurrentPreviewPageIndex(0);
    setActiveTab('editor');
    toast({
      title: "Nuevo Libro Creado",
      description: "El editor ha sido reiniciado. ¡Empieza tu nueva obra!",
      duration: 3000,
    });
  };

  const handleContentChange = (newContent: string) => {
    setCurrentBook(prev => ({ ...prev, content: newContent, lastModified: Date.now() }));
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
      const imageName = event.target.files[0].name.split('.')[0] || 'imagen'; // Get name without extension
      handleFileRead(event.target.files[0], (base64Image) => {
        const imageMarkdown = `\n![${imageName}](${base64Image})\n`;
        setCurrentBook(prev => ({ ...prev, content: prev.content + imageMarkdown, lastModified: Date.now() }));
      });
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
    overflow: 'hidden',
  };

  const getTextAlignClass = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'text-center';
    if (position.includes('left')) return 'text-left';
    if (position.includes('right')) return 'text-right';
    return 'text-center';
  };
  
  const getVerticalAlignClass = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'justify-center';
    if (position.startsWith('top')) return 'justify-start';
    if (position.startsWith('bottom')) return 'justify-end';
    return 'justify-center';
  };


  const createPdfPageHtml = (
    pageData: PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[]; pageNumberForFooter: number } | { type: 'cover' },
    isToc: boolean = false,
    isCover: boolean = false
  ): HTMLDivElement => {
    const pageDiv = document.createElement('div');
    const pdfPageWidthPx = 750; 
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; 

    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.height = `${pdfPageHeightPx}px`; 
    pageDiv.style.padding = isCover ? '0px' : `${formattingOptions.previewPadding * 1.5}px`; 
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize * 1.2}px`; 
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.position = 'relative';
    pageDiv.style.overflow = 'hidden'; 

    if (isCover) {
        // pageDiv.style.alignItems = 'center'; // Vertical alignment of the whole page
        // pageDiv.style.justifyContent = 'center'; // Horizontal alignment of the whole page

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
        // textOverlay.style.alignItems = 'center'; // Controlled by individual text position
        // textOverlay.style.justifyContent = 'center'; // Controlled by individual text position
        textOverlay.style.padding = '40px';
        // textOverlay.style.textAlign = 'center'; // Controlled by individual text position
        textOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 100%)';
        textOverlay.style.zIndex = '2';

        const titleContainer = document.createElement('div');
        titleContainer.style.width = '100%';
        titleContainer.style.display = 'flex';
        titleContainer.style.flexDirection = 'column';
        titleContainer.style.textAlign = getTextAlignClass(currentBook.titlePosition).replace('text-', '') as any;
        titleContainer.style.justifyContent = getVerticalAlignClass(currentBook.titlePosition).replace('justify-', '') as any;
        if (currentBook.titlePosition?.startsWith('middle')) titleContainer.style.flexGrow = '1';


        const titleEl = document.createElement('h1');
        titleEl.textContent = currentBook.title;
        titleEl.style.fontSize = '48px';
        titleEl.style.fontWeight = 'bold';
        titleEl.style.color = 'white';
        titleEl.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
        titleEl.style.marginBottom = '15px';
        titleContainer.appendChild(titleEl);
        textOverlay.appendChild(titleContainer);


        if (currentBook.subtitle) {
            const subtitleContainer = document.createElement('div');
            subtitleContainer.style.width = '100%';
            subtitleContainer.style.display = 'flex';
            subtitleContainer.style.flexDirection = 'column';
            subtitleContainer.style.textAlign = getTextAlignClass(currentBook.subtitlePosition).replace('text-', '') as any;
            subtitleContainer.style.justifyContent = getVerticalAlignClass(currentBook.subtitlePosition).replace('justify-', '') as any;
             if (currentBook.subtitlePosition?.startsWith('middle') && !currentBook.titlePosition?.startsWith('middle')) subtitleContainer.style.flexGrow = '1';
            if (currentBook.titlePosition?.startsWith('middle') && currentBook.subtitlePosition?.startsWith('middle')) {
                // If both middle, title already took flex-grow
            } else if (currentBook.subtitlePosition?.startsWith('middle')) {
                subtitleContainer.style.flexGrow = '1';
            }


            const subtitleEl = document.createElement('h2');
            subtitleEl.textContent = currentBook.subtitle;
            subtitleEl.style.fontSize = '28px';
            subtitleEl.style.fontWeight = 'normal';
            subtitleEl.style.fontStyle = 'italic';
            subtitleEl.style.color = '#f0f0f0';
            subtitleEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.6)';
            subtitleEl.style.marginBottom = '30px';
            subtitleContainer.appendChild(subtitleEl);
            textOverlay.appendChild(subtitleContainer);
        }
        
        const authorNameContainer = document.createElement('div');
        authorNameContainer.style.width = '100%';
        authorNameContainer.style.display = 'flex';
        authorNameContainer.style.flexDirection = 'column';
        authorNameContainer.style.textAlign = 'center'; // Author name usually centered under photo or at bottom
        authorNameContainer.style.justifyContent = 'flex-end'; // Default to bottom for author name if no photo
        authorNameContainer.style.flexGrow = '1'; // Push to bottom if it's the last main text item

        const authorNameEl = document.createElement('p');
        authorNameEl.textContent = currentBook.author;
        authorNameEl.style.fontSize = '24px';
        authorNameEl.style.color = '#e0e0e0';
        authorNameEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
        if (!currentBook.authorImage) { // If no author image, position it more like a standalone element
            authorNameEl.style.paddingBottom = '20px'; // Add some padding from the very bottom
        }
        authorNameContainer.appendChild(authorNameEl);
        textOverlay.appendChild(authorNameContainer);

        if (currentBook.editorial) {
            const editorialContainer = document.createElement('div');
            editorialContainer.style.width = '100%';
            editorialContainer.style.position = 'absolute'; // Position relative to overlay
            editorialContainer.style.left = '0';
            editorialContainer.style.padding = '0 40px'; // Match overlay padding
            editorialContainer.style.boxSizing = 'border-box';

            const editorialVerticalAlign = getVerticalAlignClass(currentBook.editorialPosition);
            if (editorialVerticalAlign === 'justify-start') editorialContainer.style.top = '40px';
            else if (editorialVerticalAlign === 'justify-end') editorialContainer.style.bottom = '40px';
            else { // middle
                editorialContainer.style.top = '50%';
                editorialContainer.style.transform = 'translateY(-50%)';
            }
            
            const editorialEl = document.createElement('p');
            editorialEl.textContent = currentBook.editorial;
            editorialEl.style.fontSize = '18px';
            editorialEl.style.color = '#d0d0d0';
            editorialEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
            editorialEl.style.textAlign = getTextAlignClass(currentBook.editorialPosition).replace('text-','') as any;
            editorialContainer.appendChild(editorialEl);
            textOverlay.appendChild(editorialContainer);
        }


        pageDiv.appendChild(textOverlay);

        if (currentBook.authorImage) {
            const authorPhotoContainer = document.createElement('div');
            authorPhotoContainer.style.position = 'absolute';
            authorPhotoContainer.style.zIndex = '3'; 
            authorPhotoContainer.style.width = '120px'; 
            authorPhotoContainer.style.textAlign = 'center';

            const pos = currentBook.authorImagePosition || 'bottom-right';
            if (pos === 'bottom-right') { authorPhotoContainer.style.bottom = '30px'; authorPhotoContainer.style.right = '30px'; }
            else if (pos === 'bottom-left') { authorPhotoContainer.style.bottom = '30px'; authorPhotoContainer.style.left = '30px'; }
            else if (pos === 'top-right') { authorPhotoContainer.style.top = '30px'; authorPhotoContainer.style.right = '30px'; }
            else if (pos === 'top-left') { authorPhotoContainer.style.top = '30px'; authorPhotoContainer.style.left = '30px'; }

            const authorImg = document.createElement('img');
            authorImg.src = currentBook.authorImage;
            authorImg.style.width = '100px'; 
            authorImg.style.height = '100px';
            authorImg.style.objectFit = 'cover';
            authorImg.style.borderRadius = '4px';
            authorImg.style.border = '3px solid white';
            authorImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
            authorPhotoContainer.appendChild(authorImg);

            const authorPhotoNameEl = document.createElement('p');
            authorPhotoNameEl.textContent = currentBook.author; 
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
      tocHeader.style.fontSize = `${formattingOptions.fontSize * 2.2}px`; 
      tocHeader.style.fontWeight = 'bold';
      tocHeader.style.margin = `${formattingOptions.fontSize * 1.5}px 0`;
      tocHeader.style.paddingBottom = `${formattingOptions.fontSize * 0.5}px`;
      tocHeader.style.borderBottom = `1px solid ${formattingOptions.textColor}`;
      pageDiv.appendChild(tocHeader);

      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = `0 ${formattingOptions.previewPadding * 0.5}px`; 
      ul.style.flexGrow = '1';
      ul.style.marginTop = `${formattingOptions.fontSize}px`;

      pageData.entries.forEach(entry => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'baseline';
        li.style.padding = `${formattingOptions.fontSize * 0.5}px 0`; 
        li.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.4)`;
        li.style.fontSize = `${formattingOptions.fontSize * 1.1}px`; 

        const titleSpan = document.createElement('span');
        titleSpan.textContent = entry.title;
        titleSpan.style.marginRight = '15px'; 
        titleSpan.style.flexGrow = '1';
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';

        const pageSpan = document.createElement('span');
        pageSpan.textContent = String(entry.estimatedPage);
        pageSpan.style.marginLeft = '15px'; 
        pageSpan.style.fontWeight = 'normal'; 

        li.appendChild(titleSpan);
        li.appendChild(pageSpan);
        ul.appendChild(li);
      });
      pageDiv.appendChild(ul);
      
      const footerDiv = document.createElement('div');
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`;
      footerDiv.style.opacity = '0.8';
      footerDiv.style.paddingTop = '8px';
      footerDiv.style.borderTop = `1px solid hsl(var(--border))`;
      footerDiv.style.marginTop = 'auto'; 
      footerDiv.style.flexShrink = '0';
      footerDiv.textContent = `Página ${pageData.pageNumberForFooter}`;
      
      switch (formattingOptions.pageNumberAlignment) {
        case 'left': footerDiv.style.textAlign = 'left'; break;
        case 'right': footerDiv.style.textAlign = 'right'; break;
        default: footerDiv.style.textAlign = 'center'; break;
      }
      pageDiv.appendChild(footerDiv);


    } else if (!isToc && !isCover && 'rawContentLines' in pageData) {
      const typedPageData = pageData as PagePreviewData;

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; 
      headerDiv.style.opacity = '0.8';
      headerDiv.style.paddingBottom = '8px'; 
      headerDiv.style.borderBottom = `1px solid hsl(var(--border))`;
      headerDiv.style.marginBottom = '20px'; 
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
      contentAreaDiv.style.overflowY = 'hidden'; 
      typedPageData.rawContentLines.forEach(line => {
        if (line.trim() === PAGE_BREAK_MARKER) return; // Skip rendering marker

        const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = `${formattingOptions.fontSize * 1}px 0`; 
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '85%'; 
          img.style.maxHeight = '400px'; 
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
          if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
             const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
             p.innerHTML = `<span style="font-style: italic; color: #888;">[Imagen: ${altText || 'Referencia de imagen externa'}]</span>`;
          } else {
            p.innerHTML = line.trim() === '' ? '&nbsp;' : line; 
          }
          p.style.margin = `${formattingOptions.fontSize * 0.4}px 0`; 
          p.style.textAlign = 'justify'; 
          if (line.startsWith('## ')) {
            p.style.fontSize = `${formattingOptions.fontSize * 1.8}px`; 
            p.style.fontWeight = 'bold';
            p.style.marginTop = `${formattingOptions.fontSize * 1.5}px`; 
            p.style.marginBottom = `${formattingOptions.fontSize * 0.8}px`;
            p.style.textAlign = 'left'; 
            p.textContent = line.substring(3).trim();
          }
          contentAreaDiv.appendChild(p);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      const footerDiv = document.createElement('div');
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.85}px`;
      footerDiv.style.opacity = '0.8';
      footerDiv.style.paddingTop = '8px';
      footerDiv.style.borderTop = `1px solid hsl(var(--border))`;
      footerDiv.style.marginTop = 'auto'; 
      footerDiv.style.flexShrink = '0';
      footerDiv.textContent = typedPageData.footerCenter; // Page number text
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
    if (!currentBook || (!currentBook.content && !currentBook.title)) {
       toast({ title: "Libro Vacío", description: "No hay contenido para exportar a PDF.", variant: "destructive" });
       return;
    }
    setIsExportingPdf(true);
    toast({ title: "Exportación a PDF Iniciada", description: "Generando tu libro, por favor espera..." });

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pdfWidthPt = pdf.internal.pageSize.getWidth();
    const pdfHeightPt = pdf.internal.pageSize.getHeight();
    
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed'; 
    tempContainer.style.left = '-9999px'; // Off-screen
    tempContainer.style.top = '-9999px';  // Off-screen
    tempContainer.style.width = '750px'; 
    tempContainer.style.height = `${750 * 1.414}px`; 
    tempContainer.style.zIndex = '-1'; 
    tempContainer.style.opacity = '0'; 
    document.body.appendChild(tempContainer);

    const renderedCanvases: { type: 'cover' | 'toc' | 'content', canvas: HTMLCanvasElement, originalPageNumber: number }[] = [];
    let pdfPageCounter = 0; // This will be the actual PDF page number

    // 1. Cover Page
    if (currentBook.coverImage || currentBook.title) { 
        pdfPageCounter++;
        const coverPageDiv = createPdfPageHtml({ type: 'cover' }, false, true);
        tempContainer.innerHTML = ''; 
        tempContainer.appendChild(coverPageDiv);
        try {
            const coverCanvas = await html2canvas(coverPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: coverPageDiv.scrollWidth, windowHeight: coverPageDiv.scrollHeight });
            renderedCanvases.push({ type: 'cover', canvas: coverCanvas, originalPageNumber: pdfPageCounter });
        } catch (e) {
            console.error("Error rendering cover for PDF:", e);
            toast({title: "Error Portada PDF", description: "Hubo un problema al renderizar la portada.", variant: "destructive"});
        }
    }
    
    // Prepare content pages and TOC entries based on PDF pagination
    const contentPagesForPdfGeneration = generatePagePreviews(currentBook, formattingOptions); 
    const chapterPdfPageMap: ChapterEntry[] = [];
    let tocPageCount = (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) ? 1 : 0; // For now, assume TOC is 1 page if present
    let contentStartPdfPage = pdfPageCounter + tocPageCount + 1;


    // 2. Table of Contents (if enabled and present)
    if (formattingOptions.tocPosition === 'start' && currentBook.tableOfContents && currentBook.tableOfContents.length > 0) {
        pdfPageCounter++;
        const tocPdfPageNumberForFooter = pdfPageCounter;
        // Generate TOC entries with page numbers relative to content start
        const tocEntriesForPdf = contentPagesForPdfGeneration
            .filter(p => p.isStartOfChapter && p.chapterTitle)
            .map(p => ({
                title: p.chapterTitle!,
                estimatedPage: contentStartPdfPage + p.pageNumber -1 // Map preview page to PDF content page
            }))
            .filter((entry, index, self) => index === self.findIndex(e => e.title === entry.title)); // Unique titles


        const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter }, true);
        tempContainer.innerHTML = '';
        tempContainer.appendChild(tocPageDiv);
        const tocCanvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
        renderedCanvases.push({ type: 'toc', canvas: tocCanvas, originalPageNumber: tocPdfPageNumberForFooter });
    }

    // 3. Content Pages
    for (const pageData of contentPagesForPdfGeneration) {
      pdfPageCounter++;
      const actualPdfPageForThisContent = pdfPageCounter; // This is the final PDF page number for this content.
      const pdfPageData = { ...pageData, footerCenter: `Página ${actualPdfPageForThisContent}` };
      
      const pageDiv = createPdfPageHtml(pdfPageData);
      tempContainer.innerHTML = '';
      tempContainer.appendChild(pageDiv);
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
      renderedCanvases.push({ type: 'content', canvas, originalPageNumber: actualPdfPageForThisContent });
    }
    
    // 4. Table of Contents at the end (if enabled and present)
    if (formattingOptions.tocPosition === 'end' && currentBook.tableOfContents && currentBook.tableOfContents.length > 0) {
        pdfPageCounter++;
        const tocPdfPageNumberForFooter = pdfPageCounter;
        // TOC entries with page numbers relative to content start (already calculated for PDF context)
        const tocEntriesForPdf = contentPagesForPdfGeneration
            .filter(p => p.isStartOfChapter && p.chapterTitle)
             // The `contentStartPdfPage` would be different if TOC was at start.
             // For TOC at end, the content pages are numbered as they appear.
             // We need to map content page numbers from the *start of content* not *start of PDF*.
             // The `pageData.pageNumber` from `generatePagePreviews` is 1-indexed from start of content.
             // So if Cover is pg1, Content starts pg2. Chapter on pageData.pageNumber=1 is pg2 of PDF.
            .map(p => {
                let contentStartPageNumberInPdf = 1; // Assume content starts at page 1
                if (renderedCanvases.find(rc => rc.type === 'cover')) contentStartPageNumberInPdf++;
                // if TOC was at start, it would also increment. But it's at end.
                return {
                    title: p.chapterTitle!,
                    estimatedPage: contentStartPageNumberInPdf + p.pageNumber -1
                }
            })
            .filter((entry, index, self) => index === self.findIndex(e => e.title === entry.title));

        const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter }, true);
        tempContainer.innerHTML = '';
        tempContainer.appendChild(tocPageDiv);
        const tocCanvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
        renderedCanvases.push({ type: 'toc', canvas: tocCanvas, originalPageNumber: tocPdfPageNumberForFooter });
    }

    // Sort all rendered canvases by their intended final page number
    renderedCanvases.sort((a,b) => a.originalPageNumber - b.originalPageNumber);

    renderedCanvases.forEach((render, index) => {
      if (index > 0) pdf.addPage();
      const canvas = render.canvas;
      const imgData = canvas.toDataURL('image/png', 0.92); 
      
      const canvasAspectRatio = canvas.width / canvas.height;
      const pdfPageAspectRatio = pdfWidthPt / pdfHeightPt;
      let imgWidthPt, imgHeightPt;

      if (canvasAspectRatio > pdfPageAspectRatio) { 
          imgWidthPt = pdfWidthPt;
          imgHeightPt = pdfWidthPt / canvasAspectRatio;
      } else { 
          imgHeightPt = pdfHeightPt;
          imgWidthPt = pdfHeightPt * canvasAspectRatio;
      }
      
      const xOffset = (pdfWidthPt - imgWidthPt) / 2;
      const yOffset = (pdfHeightPt - imgHeightPt) / 2;

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidthPt, imgHeightPt);
    });

    document.body.removeChild(tempContainer);
    pdf.save(`${(currentBook.title || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };

  const handleExportToTxt = () => {
    if (!currentBook || (!currentBook.content && !currentBook.title && !currentBook.author)) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como TXT.", variant: "destructive" });
      return;
    }

    let txtContent = `Título: ${currentBook.title || 'Sin Título'}\n`;
    if(currentBook.subtitle) txtContent += `Subtítulo: ${currentBook.subtitle}\n`;
    txtContent += `Autor: ${currentBook.author || 'Desconocido'}\n`;
    if(currentBook.editorial) txtContent += `Editorial: ${currentBook.editorial}\n`;
    txtContent += "\n";
    
    if (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) {
      txtContent += "Índice:\n";
      currentBook.tableOfContents.forEach(entry => {
        txtContent += `- ${entry.title}\n`; 
      });
      txtContent += "\n";
    }

    txtContent += "## Contenido del Libro ##\n";
    const contentForTxt = (currentBook.content || '').replace(/!\[(.*?)\]\(data:image\/.*?;base64,.*?\)/g, '[Imagen: $1]');
    txtContent += contentForTxt;

    const filename = `${(currentBook.title || 'libro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
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
    if (!currentBook || (!currentBook.content && !currentBook.title && !currentBook.author)) {
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
          .cover-section { height: 100vh; display: flex; flex-direction: column; /*align-items: center; justify-content: center;*/ text-align: center; position: relative; background-color: #333; color: white; padding: 20px; box-sizing: border-box; overflow: hidden; }
          .cover-section img.cover-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
          .cover-section .text-overlay { position: relative; z-index: 2; background: rgba(0,0,0,0.6); padding: 40px; border-radius: 8px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
          
          .cover-title-container { width: 100%; display: flex; flex-direction: column; text-align: ${getTextAlignClass(currentBook.titlePosition).replace('text-','')}; justify-content: ${getVerticalAlignClass(currentBook.titlePosition).replace('justify-','')}; ${currentBook.titlePosition?.startsWith('middle') ? 'flex-grow: 1;' : ''} }
          .cover-section h1.book-title-cover { font-size: ${formattingOptions.fontSize * 3.5}px; margin-bottom: 0.2em; text-shadow: 2px 2px 5px rgba(0,0,0,0.8); }
          
          .cover-subtitle-container { width: 100%; display: flex; flex-direction: column; text-align: ${getTextAlignClass(currentBook.subtitlePosition).replace('text-','')}; justify-content: ${getVerticalAlignClass(currentBook.subtitlePosition).replace('justify-','')}; ${currentBook.subtitlePosition?.startsWith('middle') && !currentBook.titlePosition?.startsWith('middle') ? 'flex-grow: 1;' : ''} }
          .cover-section h2.book-subtitle-cover { font-size: ${formattingOptions.fontSize * 2}px; font-style: italic; margin-bottom: 1em; text-shadow: 1px 1px 3px rgba(0,0,0,0.7); }
          
          .cover-author-container { width: 100%; display: flex; flex-direction: column; text-align: center; justify-content: flex-end; flex-grow: 1; }
          .cover-section p.author-name-main { font-size: ${formattingOptions.fontSize * 1.5}px; color: #f0f0f0; text-shadow: 1px 1px 2px rgba(0,0,0,0.6); margin-top: 1em; ${!currentBook.authorImage ? 'padding-bottom: 20px;' : ''} }

          .cover-editorial-container { width: 100%; position: absolute; left: 0; padding: 0 40px; box-sizing: border-box; text-align: ${getTextAlignClass(currentBook.editorialPosition).replace('text-','')}; z-index: 3;
            ${(() => { const v = getVerticalAlignClass(currentBook.editorialPosition); if (v === 'justify-start') return 'top: 40px;'; if (v === 'justify-end') return 'bottom: 40px;'; return 'top: 50%; transform: translateY(-50%);'; })()}
          }
          .cover-section p.editorial-name-cover { font-size: ${formattingOptions.fontSize * 1}px; color: #d0d0d0; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); }

          .author-photo-container-cover {
            position: absolute;
            width: 150px; 
            text-align: center;
            z-index: 3; 
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
          /* .toc li .toc-dots { flex-grow: 10; border-bottom: 1px dotted #aaa; margin: 0 5px -4px 5px; } */ /* Removed dots for simplicity */
          .toc li .toc-page { font-weight: normal; margin-left: auto; padding-left:10px; }
          .page-break-before { page-break-before: always; }
          .page-break-html { border-top: 1px dashed #ccc; margin: 2em 0; text-align: center; color: #aaa; font-size: 0.9em; }
          .page-break-html::before { content: "--- Salto de Página Manual ---"; }
        </style>
      </head>
      <body>
    `;

    htmlString += '<div class="cover-section">\n';
    if (currentBook.coverImage) {
      htmlString += `  <img src="${currentBook.coverImage}" alt="Portada del Libro" class="cover-image-bg" data-ai-hint="book cover" />\n`;
    }
    htmlString += '  <div class="text-overlay">\n';
    htmlString += `    <div class="cover-title-container"><h1 class="book-title-cover">${currentBook.title || 'Libro sin Título'}</h1></div>\n`;
    if (currentBook.subtitle) {
      htmlString += `    <div class="cover-subtitle-container"><h2 class="book-subtitle-cover">${currentBook.subtitle}</h2></div>\n`;
    }
    htmlString += `    <div class="cover-author-container"><p class="author-name-main">${currentBook.author || 'Autor Desconocido'}</p></div>\n`;
    if (currentBook.editorial) {
        htmlString += `  <div class="cover-editorial-container"><p class="editorial-name-cover">${currentBook.editorial}</p></div>\n`;
    }
    htmlString += '  </div>\n'; // text-overlay
    if (currentBook.authorImage) {
      htmlString += '  <div class="author-photo-container-cover">\n';
      htmlString += `    <img src="${currentBook.authorImage}" alt="Foto del Autor" class="author-image-cover" data-ai-hint="portrait person" />\n`;
      htmlString += `    <p class="author-name-photo">${currentBook.author}</p>\n`; 
      htmlString += '  </div>\n';
    }
    htmlString += '</div>\n'; // cover-section

    // Determine where TOC goes for HTML
    const tocHtml = (currentBook.tableOfContents && currentBook.tableOfContents.length > 0) ? `
      <div class="toc ${formattingOptions.tocPosition === 'start' ? '' : 'page-break-before'}">
        <h2>Índice</h2>
        <ul>
          ${currentBook.tableOfContents.map(entry => `<li><span class="toc-title">${entry.title}</span> <span class="toc-page">${entry.estimatedPage}</span></li>`).join('\n')}
        </ul>
      </div>
    ` : '';
    
    if (formattingOptions.tocPosition === 'start') {
      htmlString += `<div class="book-container page-break-before">${tocHtml}`;
    } else {
      htmlString += '<div class="book-container page-break-before">\n';
    }

    const contentParagraphs = (currentBook.content || '') 
      .split('\n')
      .map(line => {
        if (line.trim() === PAGE_BREAK_MARKER) {
          return `<div class="page-break-html"></div>`;
        }
        if (line.startsWith('## ')) {
          return `<h2 class="chapter-title page-break-before">${line.substring(3).trim()}</h2>`;
        }
        const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          return `<img src="${imgSrc}" alt="${altText || 'Imagen insertada'}" class="content-image" data-ai-hint="illustration drawing" />`;
        } else if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
            const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
             return `<p style="font-style: italic; color: #888; text-align: center;">[Imagen: ${altText || 'Referencia de imagen externa'}]</p>`;
        }
        return line.trim() === '' ? '<p>&nbsp;</p>' : `<p>${line}</p>`;
      })
      .join('\n');

    htmlString += contentParagraphs;

    if (formattingOptions.tocPosition === 'end') {
      htmlString += tocHtml;
    }

    htmlString += '</div>\n'; // book-container
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

  const currentPreviewPageData = paginatedPreview[currentPreviewPageIndex];

  const authorImagePositionClasses: Record<AuthorImagePosition, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };
  
  const coverTextPositionClasses = (position: CoverTextPosition | undefined): string => {
    if (!position) return 'items-center justify-center text-center';
    let classes = '';
    if (position.startsWith('top')) classes += 'items-start ';
    else if (position.startsWith('middle')) classes += 'items-center ';
    else if (position.startsWith('bottom')) classes += 'items-end ';

    if (position.includes('left')) classes += 'justify-start text-left';
    else if (position.includes('center')) classes += 'justify-center text-center';
    else if (position.includes('right')) classes += 'justify-end text-right';
    
    return classes;
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
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">
              <FileSearch className="mr-2 h-4 w-4" /> Abrir Libro
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

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col container mx-auto">
        <TabsList className="mx-auto mb-6 shadow-sm w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4">
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
                  <CardDescription>Escribe y formatea. Usa `## Título` para capítulos y `\newpage` para saltos de página.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 md:p-6">
                  <Label htmlFor="bookContent" className="mb-2 font-semibold text-sm">Contenido del Libro</Label>
                  <Textarea
                    id="bookContent"
                    value={currentBook.content || ''}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Empieza a escribir tu obra maestra... Usa `## Título del Capítulo` y `\newpage` para saltos de página."
                    className="flex-1 w-full min-h-[300px] md:min-h-[400px] text-sm p-3 rounded-md shadow-inner"
                  />
                   <p className="text-xs text-muted-foreground mt-2">Consejo: Escribe `\newpage` en una línea para forzar un salto de página.</p>
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insertar Imagen en Contenido
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
                  <CardDescription>Generado de `## Título`. Páginas son estimaciones de vista previa.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {(currentBook.tableOfContents && currentBook.tableOfContents.length > 0) ? (
                    <ScrollArea className="h-[300px] md:h-[400px] pr-3 border rounded-md p-3">
                      <ul className="space-y-2">
                        {currentBook.tableOfContents.map((entry, idx) => (
                          <li key={idx} className="flex justify-between items-center text-sm border-b border-dashed pb-1.5 pt-1">
                            <span className="truncate pr-2">{entry.title}</span>
                            <span className="text-muted-foreground font-mono text-xs">Pág. aprox. {entry.estimatedPage}</span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  ) : (
                    <div className="text-center text-muted-foreground italic py-10">
                      <ListOrdered className="mx-auto h-12 w-12 opacity-50 mb-3" />
                      <p>Aún no se han definido capítulos.</p>
                      <p className="text-xs">Usa `## Título del Capítulo` en el editor.</p>
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
                      <Input id="textColor" type="color" value={formattingOptions.textColor} onChange={(e) => handleFormattingChange('textColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md"/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pageBackgroundColor" className="text-sm font-medium">Fondo Página (Vista)</Label>
                      <Input id="pageBackgroundColor" type="color" value={formattingOptions.pageBackgroundColor} onChange={(e) => handleFormattingChange('pageBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md"/>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="previewAreaBackground" className="text-sm font-medium">Fondo Área Vista Previa</Label>
                      <Input id="previewAreaBackground" type="color" value={formattingOptions.previewBackgroundColor} onChange={(e) => handleFormattingChange('previewBackgroundColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md"/>
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
                                <SelectItem value="left">Izquierda</SelectItem>
                                <SelectItem value="center">Centro</SelectItem>
                                <SelectItem value="right">Derecha</SelectItem>
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
                    <Label htmlFor="titlePosition" className="text-xs font-medium">Posición del Título</Label>
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
                    <Label htmlFor="subtitlePosition" className="text-xs font-medium">Posición del Subtítulo</Label>
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
                    <Label htmlFor="authorName" className="text-sm font-medium">Nombre del Autor/a</Label>
                    <Input id="authorName" value={currentBook.author || ''} onChange={(e) => handleBookDetailsChange('author', e.target.value)} placeholder="Tu Nombre como Autor/a" className="mt-1 text-sm p-2 shadow-inner"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editorialName" className="text-sm font-medium">Nombre de la Editorial</Label>
                    <Input id="editorialName" value={currentBook.editorial || ''} onChange={(e) => handleBookDetailsChange('editorial', e.target.value)} placeholder="Nombre de Editorial (Opcional)" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="editorialPosition" className="text-xs font-medium">Posición de la Editorial</Label>
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

                  {(currentBook.coverImage || currentBook.authorImage || currentBook.title) && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col items-center justify-center shadow-inner overflow-hidden relative">
                         {currentBook.coverImage && <NextImage src={currentBook.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />}
                         
                         <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none ${coverTextPositionClasses(currentBook.titlePosition)}`}>
                           <h3 className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.title}</h3>
                         </div>
                          {currentBook.subtitle && (
                            <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none ${coverTextPositionClasses(currentBook.subtitlePosition)}`}>
                                <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words mt-1"><em>{currentBook.subtitle}</em></p>
                            </div>
                          )}
                           {currentBook.editorial && (
                            <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none ${coverTextPositionClasses(currentBook.editorialPosition)}`}>
                                <p className="text-[10px] text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words">{currentBook.editorial}</p>
                            </div>
                          )}

                         {currentBook.authorImage && (
                            <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-16 h-20 z-20 flex flex-col items-center text-center pointer-events-none`}>
                                <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={60} height={60} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                                <p className="text-[10px] text-white mt-0.5 [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words leading-tight">{currentBook.author}</p>
                            </div>
                         )}
                          {!currentBook.authorImage && ( // Show author name at bottom if no image and not explicitly positioned elsewhere via title/subtitle logic
                             <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none items-center justify-end text-center`}>
                               <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words pb-1"><em>{currentBook.author}</em></p>
                             </div>
                          )}
                       </div>
                    )}
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

          <div className="w-full lg:w-1/2 lg:sticky lg:top-8"> 
            <Card className="shadow-lg h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2 h-5 w-5 text-primary" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Observa cómo tu libro toma forma. La paginación es aproximada.</CardDescription>
              </CardHeader>
              <CardContent
                className="overflow-y-auto p-3 md:p-4 flex-grow"
                style={{
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  borderRadius: 'var(--radius)',
                }}
              >
                {activeTab === 'cover' ? (
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col shadow-lg overflow-hidden relative" style={{backgroundColor: formattingOptions.pageBackgroundColor}}>
                    {currentBook.coverImage ? (
                      <NextImage src={currentBook.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">Sin imagen de portada</p>
                      </div>
                    )}
                     <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none ${coverTextPositionClasses(currentBook.titlePosition)}`}>
                        <h2 className="text-xl md:text-2xl font-bold text-white [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight">{currentBook.title}</h2>
                     </div>
                     {currentBook.subtitle && (
                       <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none ${coverTextPositionClasses(currentBook.subtitlePosition)}`}>
                          <p className="text-base md:text-lg text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] italic">{currentBook.subtitle}</p>
                       </div>
                     )}
                     {currentBook.editorial && (
                        <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none ${coverTextPositionClasses(currentBook.editorialPosition)}`}>
                            <p className="text-sm text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)]">{currentBook.editorial}</p>
                        </div>
                     )}
                     {!currentBook.authorImage && (
                         <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none items-center justify-end text-center`}>
                            <p className="text-base md:text-lg text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] pb-2"><em>{currentBook.author}</em></p>
                         </div>
                     )}
                    {currentBook.authorImage && (
                        <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-24 z-20 flex flex-col items-center text-center p-1 bg-black/10 rounded pointer-events-none`}>
                            <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={70} height={70} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                            <p className="text-xs text-white mt-1 [text-shadow:1px_1px_1px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.author}</p>
                        </div>
                    )}
                  </div>
                ) : paginatedPreview.length > 0 && currentPreviewPageData ? (
                  <div
                    key={`${currentPreviewPageData.pageNumber}-${currentPreviewPageIndex}`} 
                    className="page-simulation-wrapper mx-auto my-4 prose max-w-none"
                    style={{
                      ...simulatedPageStyle,
                      opacity: isPageTransitioning ? 0 : 1,
                      transition: 'opacity 0.15s ease-in-out', 
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

                    <div className="page-footer text-xs py-1.5 px-2.5 border-t" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: 'hsl(var(--border))', textAlign: formattingOptions.pageNumberAlignment}}>
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
                      <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor para ver la vista previa)</p>
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

      {/* Dialog for BIBLIOTECA - No longer used with TXT file system */}
      {/* This dialog is effectively removed as we are now using local TXT files. */}
      {/* If a different book management system is re-introduced, this can be adapted. */}

    </div>
  );
}
