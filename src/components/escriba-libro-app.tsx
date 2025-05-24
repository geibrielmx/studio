
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
import { UploadCloud, BookOpen, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode, FilePlus, Trash2, ChevronLeft, ChevronRight, UserSquare2, FileSearch, Building, AlignLeft, AlignCenter, AlignRight, BookIcon, Feather, Edit3, PlusCircle, HelpCircle, BookCopy } from 'lucide-react';
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
  title: '', // Changed from 'Nuevo Capítulo'
  content: '',
});

const createInitialBook = (): Book => ({
  id: Date.now().toString(), 
  title: '', // Changed from 'Libro sin Título'
  subtitle: '',
  author: '', // Changed from 'Autor Desconocido'
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
  backCoverColor: 'hsl(var(--card))', // Default to card background
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
  let firstParagraphAfterHeading = false;

  const elements = lines.map((paragraph, index) => {
    if (paragraph.trim() === PAGE_BREAK_MARKER) {
      return <p key={`${pageKeyPrefix}-line-${index}`} className="hidden-page-break-marker"></p>;
    }
    let isChapterHeadingLine = false;
    if (paragraph.startsWith('## ')) {
      if (index === 0 || lines[index-1]?.trim() === PAGE_BREAK_MARKER || lines.slice(0, index).every(l => l.trim() === '')) {
        isStartOfChapter = true;
        chapterTitle = paragraph.substring(3).trim();
        isChapterHeadingLine = true;
        firstParagraphAfterHeading = true; 
      }
    }
    const imageMatch = paragraph.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
    if (imageMatch) {
      const [, altText, imgSrc] = imageMatch;
      firstParagraphAfterHeading = false;
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
        firstParagraphAfterHeading = false;
        return <p key={`${pageKeyPrefix}-line-${index}`} className="my-1.5 md:my-2 italic text-muted-foreground text-center">[Imagen: {altText || 'Referencia de imagen externa'}]</p>;
    }
    
    let pClassName = `my-1.5 md:my-2 book-paragraph ${isChapterHeadingLine ? 'chapter-heading font-bold text-xl md:text-2xl !text-left !indent-0 !pl-0 !pt-4 !pb-2 border-b-2 border-primary mb-4' : ''}`;
    
    // if (!isChapterHeadingLine && firstParagraphAfterHeading && paragraph.trim() !== '') {
    //    pClassName += ' first-paragraph-after-heading first-letter-capital';
    //    firstParagraphAfterHeading = false; 
    // } else if (!isChapterHeadingLine && paragraph.trim() !== '' && paragraph.trim() !== '&nbsp;') {
    //    pClassName += ' normal-paragraph first-letter-capital';
    // }


    const pContent = isChapterHeadingLine ? paragraph.substring(3).trim() : (paragraph.trim() === '' ? <>&nbsp;</> : paragraph
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/(\s|^)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3')
        .replace(/(\s|^)_(.*?)_(\s|$)/g, '$1<em>$2</em>$3')
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
  return {
    pageNumber,
    headerLeft: bookTitle, // Pass actual book title (can be empty)
    headerRight: currentChapterTitleForHeader, // Pass actual chapter title (can be empty)
    contentElements: elements,
    rawContentLines: lines,
    footerCenter: `Página ${pageNumber}`,
    isStartOfChapter: isStartOfChapter,
    chapterTitle: chapterTitle, // This is the one used for TOC, should be the actual title from ##
    isForceBreak,
  };
}

function getFullContentString(chapters: Chapter[]): string {
  return chapters.map(chapter => `## ${chapter.title.trim() === '' ? ' ' : chapter.title}\n${chapter.content}`).join('\n\n');
  // Added a space if title is empty to preserve the ## marker for parsing, but it effectively means an empty title.
}

function generatePagePreviews(
  book: Book,
  formattingOptions: FormattingOptions
): PagePreviewData[] {
  const output: PagePreviewData[] = [];
  const fullContent = getFullContentString(book.chapters || []);
  if (!fullContent && book.title.trim() === '') return output; // Check trimmed title

  const allLines = (fullContent || '').split('\n');
  const { fontSize, lineHeight } = formattingOptions;

  const actualContentAreaHeight = PAGE_CONTENT_TARGET_HEIGHT_PX - PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX;
  const estimatedLinePixelHeight = Math.max(1, fontSize * lineHeight); 
  let linesPerPage = Math.max(1, Math.floor(actualContentAreaHeight / estimatedLinePixelHeight)); 

  let currentPageLines: string[] = [];
  let currentPageNumber = 1;
  
  // Determine initial chapter title for header, ensuring it's empty if the actual first chapter title is empty
  let currentChapterForHeader = book.chapters?.[0]?.title?.trim() !== '' ? (book.chapters[0].title) : '';
  
  let linesAccumulatedOnCurrentPage = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isChapterHeading = line.startsWith('## ');
    const isManualPageBreak = line.trim() === PAGE_BREAK_MARKER;
    let lineCost = 1; 
    if (/!\[(.*?)\]\(data:image\/.*?\)/.test(line)) {
      lineCost = IMAGE_LINE_EQUIVALENT; 
    } else if (isChapterHeading) {
      lineCost = 2; 
    }

    if (isManualPageBreak) {
        if (currentPageLines.length > 0 || isChapterHeading) { 
             output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions, true));
             currentPageLines = [];
             linesAccumulatedOnCurrentPage = 0;
             currentPageNumber++;
        }
        continue; 
    }

    if (isChapterHeading) {
      if (currentPageLines.length > 0) { 
        output.push(createPageObject(currentPageNumber, book.title, currentChapterForHeader, currentPageLines, formattingOptions));
        currentPageLines = [];
        linesAccumulatedOnCurrentPage = 0;
        currentPageNumber++;
      }
      // Update currentChapterForHeader with the actual title (or empty if "## " was used)
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

  if (output.length === 0 && (book.title.trim() !== '' || fullContent)) { 
     const initialBookTitleForEmptyPreview = book.title.trim() === '' ? '' : book.title;
     const initialChapterTitleForEmptyPreview = currentChapterForHeader.trim() === '' ? '' : currentChapterForHeader;
     output.push(createPageObject(1, initialBookTitleForEmptyPreview, initialChapterTitleForEmptyPreview, [""], formattingOptions));
  }

  return output;
}


function generateTableOfContents(paginatedPreview: PagePreviewData[], bookChapters: Chapter[]): ChapterEntry[] {
  const toc: ChapterEntry[] = [];
  const chapterTitlesFromContent = new Set<string>();

  paginatedPreview.forEach(page => {
    // page.chapterTitle here comes from the `## Title` line directly.
    // If user wrote `## `, page.chapterTitle will be empty. This is fine for TOC, means untitled chapter.
    if (page.isStartOfChapter && page.chapterTitle !== undefined && !chapterTitlesFromContent.has(page.chapterTitle)) {
      toc.push({
        title: page.chapterTitle, // Use the actual parsed title (can be empty)
        estimatedPage: page.pageNumber, 
      });
      chapterTitlesFromContent.add(page.chapterTitle);
    }
  });
  
  // This ensures chapters defined in the book structure but maybe not having `## ` content get listed
  // However, our current structure relies on `## ` for pagination to detect start of chapter.
  bookChapters.forEach(bookChapter => {
    if (bookChapter.title.trim() !== '' && !chapterTitlesFromContent.has(bookChapter.title)) {
      // Find if this chapter exists in paginatedPreview even if not marked as isStartOfChapter (e.g. if it didn't start on a new page)
      // This part might be complex. For now, TOC generation is mostly based on ## markers.
      // If a chapter has a title in the editor but no ## marker in content, it won't appear in this TOC.
    }
  });

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
  
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);


  const loadFormattingFromLocalStorage = useCallback(() => {
    try {
      const savedFormattingJson = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormattingJson) {
        const loadedOptions = JSON.parse(savedFormattingJson) as FormattingOptions;
        const mergedOptions = { ...initialFormattingOptions, ...loadedOptions };
        setFormattingOptions(mergedOptions);
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
            title: 'Error al Guardar Formato',
            description: 'No se pudieron guardar las opciones de formato. Puede que el almacenamiento esté lleno.',
            variant: 'destructive',
        });
      }
    }
  }, [formattingOptions, mounted, toast]);


  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(currentBook, formattingOptions);
      setPaginatedPreview(newPreview);
      
      const newPageIndex = newPreview.length > 0 ? Math.min(currentPreviewPageIndex, newPreview.length - 1) : 0;
      if (newPageIndex !== currentPreviewPageIndex) {
        setCurrentPreviewPageIndex(newPageIndex);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook, formattingOptions, mounted]);


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
  
  const handleSaveBookAsTxt = () => {
    if (!currentBook) {
      toast({ title: "Error al Guardar", description: "No hay un libro activo para guardar.", variant: "destructive" });
      return;
    }

    let txtContent = `Título: ${currentBook.title || ''}\n`;
    if(currentBook.subtitle) txtContent += `Subtítulo: ${currentBook.subtitle}\n`;
    txtContent += `Autor: ${currentBook.author || ''}\n`;
    if(currentBook.editorial) txtContent += `Editorial: ${currentBook.editorial}\n`;
    if(currentBook.coverFreeText) txtContent += `Texto Adicional Portada: ${currentBook.coverFreeText}\n`;
    txtContent += "\n";
    
    if (currentBook.backCoverSynopsis) txtContent += `Sinopsis Contraportada: ${currentBook.backCoverSynopsis}\n`;
    if (currentBook.backCoverSlogan) txtContent += `Eslogan Contraportada: ${currentBook.backCoverSlogan}\n`;
    if (currentBook.backCoverSynopsis || currentBook.backCoverSlogan) txtContent += "\n";

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
    
    (currentBook.chapters || []).forEach(chapter => {
      const titleForChapter = chapter.title.trim() === '' ? ' ' : chapter.title; // Ensure '## ' for empty titles
      txtContent += `## ${titleForChapter}\n`;
      const chapterContentForTxt = (chapter.content || '').replace(/!\[(.*?)\]\(data:image\/.*?;base64,.*?\)/g, '[Imagen: $1]');
      txtContent += `${chapterContentForTxt}\n\n`;
    });

    const filename = `${(currentBook.title.trim() || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
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
      description: `"${currentBook.title.trim() || 'Libro'}" se ha descargado como ${filename}. Las imágenes no se guardan en el TXT.`,
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
          newBook.chapters = []; 

          const lines = text.split('\n');
          let currentChapterTitle = ""; // Start with empty title
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
              const coverFreeTextMatch = line.match(/^Texto Adicional Portada:\s*(.*)/);
              if (coverFreeTextMatch) { newBook.coverFreeText = coverFreeTextMatch[1].trim(); continue; }
              const backCoverSynopsisMatch = line.match(/^Sinopsis Contraportada:\s*(.*)/);
                if (backCoverSynopsisMatch) { newBook.backCoverSynopsis = backCoverSynopsisMatch[1].trim(); continue; }
              const backCoverSloganMatch = line.match(/^Eslogan Contraportada:\s*(.*)/);
                if (backCoverSloganMatch) { newBook.backCoverSlogan = backCoverSloganMatch[1].trim(); continue; }
              
              if (line.trim() === "## Contenido del Libro ##") {
                inHeaderSection = false;
                parsingContent = true;
                continue;
              } else if (line.startsWith('## ')) { 
                inHeaderSection = false;
                parsingContent = true;
              }
            }
            
            if (parsingContent) {
              if (line.startsWith('## ')) {
                // Save previous chapter only if it has content or a non-default title, or if it's not the very first pseudo-chapter
                if (currentChapterContent.length > 0 || currentChapterTitle.trim() !== '' || newBook.chapters.length > 0) { 
                  newBook.chapters.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                    title: currentChapterTitle.trim(), // Trim here
                    content: currentChapterContent.join('\n').trim(),
                  });
                }
                currentChapterTitle = line.substring(3).trim(); // This captures the title as is from the file
                currentChapterContent = [];
              } else {
                currentChapterContent.push(line);
              }
            }
          }
          // Add the last chapter
          // Ensure it's added even if it's just an empty title from ##
          if (parsingContent || currentChapterContent.length > 0 || currentChapterTitle.trim() !== '') {
             newBook.chapters.push({
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                title: currentChapterTitle.trim(), 
                content: currentChapterContent.join('\n').trim(),
              });
          }
          
          // If no chapters were parsed at all (e.g., file had no ## markers or was only headers)
          if (newBook.chapters.length === 0 && !parsingContent) { 
            let contentStartIndex = 0;
            for (let i=0; i < lines.length; i++) {
                if (!lines[i].match(/^(Título|Subtítulo|Autor|Editorial|Texto Adicional Portada|Sinopsis Contraportada|Eslogan Contraportada|Índice de Capítulos):\s*(.*)/) && 
                    !lines[i].startsWith("- ") &&
                    lines[i].trim() !== "") {
                    contentStartIndex = i;
                    break;
                }
                if (i === lines.length -1) contentStartIndex = lines.length; 
            }
            const mainContent = lines.slice(contentStartIndex).join('\n');
            newBook.chapters.push({ // Create a default chapter for this content
                id: Date.now().toString() + Math.random().toString(36).substring(2,7),
                title: '', // Default to empty title
                content: mainContent.trim(),
            });
          } else if (newBook.chapters.length === 0 && (parsingContent || currentChapterContent.length === 0 && currentChapterTitle.trim() === '')){
             // If parsingContent was true but no chapters were actually formed (e.g. "## Contenido del Libro ##" then EOF)
             // or if the loop finished with an empty title and content, add one initial empty chapter.
             newBook.chapters.push(createInitialChapter());
          }

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
            description: `"${newBook.title.trim() || 'Libro sin título'}" está listo. El contenido se ha formateado en capítulos. Sube imágenes manualmente si es necesario.`,
            duration: 5000,
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
    setEditingChapterId(newChapter.id); 
    setActiveTab('editor'); 
  };

  const handleDeleteChapter = (chapterIdToDelete: string) => {
    setCurrentBook(prev => {
      const updatedChapters = prev.chapters.filter(ch => ch.id !== chapterIdToDelete);
      if (updatedChapters.length === 0) {
        // If all chapters are deleted, add one new initial chapter
        const firstChapter = createInitialChapter();
        updatedChapters.push(firstChapter);
        setEditingChapterId(firstChapter.id);
      } else {
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


  const handleBookDetailsChange = (
    field: keyof Pick<Book, 'title' | 'author' | 'subtitle' | 'editorial' | 'coverFreeText' | 'backCoverSynopsis' | 'backCoverSlogan' | 'backCoverColor'>, 
    value: string
    ) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };
  
  const handleCoverTextFieldChange = (
    field: keyof Pick<Book, 'titlePosition' | 'subtitlePosition' | 'editorialPosition' | 'coverFreeTextPosition' | 
                           'backCoverSynopsisPosition' | 'backCoverSloganPosition' | 'backCoverImagePosition' | 'backCoverAuthorNamePosition'>, 
    value: CoverTextPosition
    ) => {
    setCurrentBook(prev => ({ ...prev, [field]: value, lastModified: Date.now() }));
  };

  const handleAuthorImagePositionChange = (value: AuthorImagePosition) => {
    setCurrentBook(prev => ({ ...prev, authorImagePosition: value, lastModified: Date.now() }));
  };

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

  const handleBackCoverImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileRead(event.target.files[0], (base64Image) => {
        setCurrentBook(prev => ({ ...prev, backCoverImage: base64Image, lastModified: Date.now() }));
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
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
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
    pageData: PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[]; pageNumberForFooter: number } | { type: 'cover' } | { type: 'backCover' },
    isToc: boolean = false,
    isCover: boolean = false,
    isBackCover: boolean = false,
  ): HTMLDivElement => {
    const pageDiv = document.createElement('div');
    const pdfPageWidthPx = 750; 
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; 

    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.height = `${pdfPageHeightPx}px`; 
    pageDiv.style.padding = (isCover || isBackCover) ? '0px' : `${formattingOptions.previewPadding * 1.5}px`; 
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize * 1.2}px`; 
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = (isCover || isBackCover) ? (isBackCover ? (currentBook.backCoverColor || formattingOptions.pageBackgroundColor) : formattingOptions.pageBackgroundColor) : formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.position = 'relative'; 
    pageDiv.style.overflow = 'hidden'; 

    if (isCover) {
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
        textOverlay.style.padding = '40px'; 
        textOverlay.style.background = currentBook.coverImage ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0) 70%)' : 'transparent'; 
        textOverlay.style.zIndex = '2'; 
        textOverlay.style.color = currentBook.coverImage ? 'white' : formattingOptions.textColor; 
        
        const createTextContainer = (textPos: CoverTextPosition | undefined, isMiddleGrow?: boolean) => {
            const container = document.createElement('div');
            container.style.width = '100%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column'; 
            container.style.textAlign = getTextAlignClass(textPos).replace('text-', '') as any;
            container.style.justifyContent = getVerticalAlignClass(textPos).replace('justify-', '') as any;
            if (isMiddleGrow && textPos?.startsWith('middle')) container.style.flexGrow = '1'; 
            return container;
        }

        const titleContainer = createTextContainer(currentBook.titlePosition, true);
        const titleEl = document.createElement('h1');
        titleEl.textContent = currentBook.title;
        titleEl.style.fontSize = `${formattingOptions.coverTitleFontSize || 48}px`; 
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
            subtitleEl.style.marginBottom = '30px'; 
            subtitleContainer.appendChild(subtitleEl);
            textOverlay.appendChild(subtitleContainer);
        }

        if (currentBook.coverFreeText) {
            const freeTextContainer = createTextContainer(currentBook.coverFreeTextPosition, !(currentBook.titlePosition?.startsWith('middle') || currentBook.subtitlePosition?.startsWith('middle')));
            const freeTextEl = document.createElement('p');
            freeTextEl.textContent = currentBook.coverFreeText;
            freeTextEl.style.fontSize = '18px'; 
            freeTextEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
            freeTextEl.style.marginTop = '15px'; 
            freeTextContainer.appendChild(freeTextEl);
            textOverlay.appendChild(freeTextContainer);
        }
        
        const bottomTextContainer = document.createElement('div');
        bottomTextContainer.style.width = '100%';
        bottomTextContainer.style.display = 'flex';
        bottomTextContainer.style.flexDirection = 'column';
        bottomTextContainer.style.justifyContent = 'flex-end'; 
        bottomTextContainer.style.flexGrow = '1'; 

        const authorNameEl = document.createElement('p');
        authorNameEl.textContent = currentBook.author;
        authorNameEl.style.fontSize = '24px';
        authorNameEl.style.textAlign = 'center'; 
        authorNameEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
        if (!currentBook.authorImage) { 
            if (currentBook.editorialPosition !== 'bottom-center') { 
                authorNameEl.style.paddingBottom = '20px';
            }
        }
        bottomTextContainer.appendChild(authorNameEl);


        if (currentBook.editorial) {
            const editorialContainer = createTextContainer(currentBook.editorialPosition);
            editorialContainer.style.position = 'absolute'; 
            editorialContainer.style.left = '0'; 
            editorialContainer.style.padding = '0 40px'; 
            editorialContainer.style.boxSizing = 'border-box';

            const editorialVerticalAlign = getVerticalAlignClass(currentBook.editorialPosition);
            if (editorialVerticalAlign === 'justify-start') editorialContainer.style.top = '40px';
            else if (editorialVerticalAlign === 'justify-end') editorialContainer.style.bottom = '40px';
            else { 
                editorialContainer.style.top = '50%';
                editorialContainer.style.transform = 'translateY(-50%)';
            }
            
            const editorialEl = document.createElement('p');
            editorialEl.textContent = currentBook.editorial;
            editorialEl.style.fontSize = '18px';
            editorialEl.style.textShadow = currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none';
            editorialContainer.appendChild(editorialEl);
            if(currentBook.editorialPosition?.startsWith('bottom') && currentBook.editorialPosition?.includes('center')){
                bottomTextContainer.appendChild(editorialContainer)
            } else {
                 textOverlay.appendChild(editorialContainer);
            }
        }
         textOverlay.appendChild(bottomTextContainer); 
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
            authorImg.style.border = currentBook.coverImage ? '3px solid white' : `3px solid ${formattingOptions.textColor}`;
            authorImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
            authorPhotoContainer.appendChild(authorImg);

            const authorPhotoNameEl = document.createElement('p'); 
            authorPhotoNameEl.textContent = currentBook.author; 
            authorPhotoNameEl.style.fontSize = '16px';
            authorPhotoNameEl.style.color = currentBook.coverImage ? 'white' : formattingOptions.textColor;
            authorPhotoNameEl.style.marginTop = '8px';
            authorPhotoNameEl.style.textShadow = currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.8)' : 'none';
            authorPhotoContainer.appendChild(authorPhotoNameEl);
            pageDiv.appendChild(authorPhotoContainer); 
        }

    } else if (isBackCover) {
        pageDiv.style.backgroundColor = currentBook.backCoverColor || formattingOptions.pageBackgroundColor;
        pageDiv.style.color = currentBook.backCoverImage ? 'white' : formattingOptions.textColor; 
        
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
        textOverlay.style.color = currentBook.backCoverImage ? 'white' : formattingOptions.textColor; 
        textOverlay.style.background = currentBook.backCoverImage ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 100%)' : 'transparent';


        const createTextContainer = (textPos: CoverTextPosition | undefined) => {
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.width = `calc(100% - 80px)`; // padding
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            const textAlign = getTextAlignClass(textPos).replace('text-', '');
            
            container.style.textAlign = textAlign as any;

            if (textPos?.startsWith('top')) container.style.top = '40px';
            else if (textPos?.startsWith('bottom')) container.style.bottom = '40px';
            else {
                 container.style.top = '50%';
                 container.style.transform = 'translateY(-50%)';
            }
           
            if (textPos?.includes('left')) container.style.left = '40px';
            else if (textPos?.includes('right')) {
                container.style.right = '40px';
                if(textAlign === 'center') container.style.left = '40px'; 
            } else { 
                container.style.left = '40px'; 
            }
            return container;
        };
        
        if (currentBook.backCoverSynopsis) {
            const synopsisContainer = createTextContainer(currentBook.backCoverSynopsisPosition);
            const synopsisEl = document.createElement('p');
            synopsisEl.innerHTML = currentBook.backCoverSynopsis.replace(/\n/g, '<br>');
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
        
        if (currentBook.author) {
            const authorContainer = createTextContainer(currentBook.backCoverAuthorNamePosition);
            const authorEl = document.createElement('p');
            authorEl.textContent = currentBook.author;
            authorEl.style.fontSize = `${formattingOptions.fontSize * 1}px`;
            authorEl.style.textShadow = currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none';
            authorContainer.appendChild(authorEl);
            textOverlay.appendChild(authorContainer);
        }
        
        if (currentBook.backCoverImage && currentBook.backCoverImagePosition) {
            const imageContainer = createTextContainer(currentBook.backCoverImagePosition);
            const img = document.createElement('img');
            img.src = currentBook.backCoverImage;
            img.style.maxWidth = '60%';
            img.style.maxHeight = '250px';
            img.style.height = 'auto';
            img.style.margin = getTextAlignClass(currentBook.backCoverImagePosition) === 'text-center' ? '0 auto' : '0';
            img.style.borderRadius = '4px';
            img.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            imageContainer.appendChild(img);
            textOverlay.appendChild(imageContainer);
        }

        pageDiv.appendChild(textOverlay);

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
        titleSpan.textContent = entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title;
        titleSpan.style.marginRight = '15px'; 
        titleSpan.style.flexGrow = '1'; 

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


    } else if (!isToc && !isCover && !isBackCover && 'rawContentLines' in pageData) {
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
      headerLeft.innerHTML = typedPageData.headerLeft.trim() === '' ? '&nbsp;' : typedPageData.headerLeft;
      const headerRight = document.createElement('span');
      headerRight.innerHTML = typedPageData.headerRight.trim() === '' ? '&nbsp;' : typedPageData.headerRight;
      headerDiv.appendChild(headerLeft);
      headerDiv.appendChild(headerRight);
      pageDiv.appendChild(headerDiv);

      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1'; 
      contentAreaDiv.style.overflowY = 'hidden'; 
      let firstParagraphAfterHeadingPDF = false; 

      typedPageData.rawContentLines.forEach((line, lineIdx) => {
        if (line.trim() === PAGE_BREAK_MARKER) return; 

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
            caption.style.fontSize = `${formattingOptions.fontSize * 0.85}px`; caption.style.fontStyle = 'italic'; caption.style.opacity = '0.8'; caption.style.marginTop = '0.4em'; caption.style.textAlign = 'center';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
          firstParagraphAfterHeadingPDF = false; 
        } else {
          const p = document.createElement('p');
          if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
             const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
             p.innerHTML = `<span style="font-style: italic; color: #888; text-align: center; display: block;">[Imagen: ${altText || 'Referencia de imagen externa'}]</span>`;
             firstParagraphAfterHeadingPDF = false;
          } else {
            let processedLine = line.trim() === '' ? '&nbsp;' : line;
            processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            processedLine = processedLine.replace(/(\s|^)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3');     
            processedLine = processedLine.replace(/(\s|^)_(.*?)_(\s|$)/g, '$1<em>$2</em>$3');
            p.innerHTML = processedLine;

            if (line.trim() !== '') {
                p.style.textIndent = '1.5em';
                 if (firstParagraphAfterHeadingPDF || (lineIdx > 0 && typedPageData.rawContentLines[lineIdx-1].startsWith('## '))) {
                    p.style.textIndent = '0';
                    firstParagraphAfterHeadingPDF = false; 
                }
            }
          }
          p.style.margin = `${formattingOptions.fontSize * 0.4}px 0`; 
          p.style.textAlign = 'justify'; 

          if (line.startsWith('## ')) {
            p.style.fontSize = `${formattingOptions.fontSize * 1.8}px`; 
            p.style.fontWeight = 'bold';
            p.style.marginTop = `${formattingOptions.fontSize * 1.5}px`; 
            p.style.marginBottom = `${formattingOptions.fontSize * 0.8}px`;
            p.style.textAlign = 'left'; 
            p.style.textIndent = '0'; 
            p.textContent = line.substring(3).trim();
            firstParagraphAfterHeadingPDF = true; 
          } else if (firstParagraphAfterHeadingPDF && line.trim() !== '') {
             p.style.textIndent = '0';
             firstParagraphAfterHeadingPDF = false;
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
      footerDiv.textContent = typedPageData.footerCenter; 
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
    if (!currentBook || (!getFullContentString(currentBook.chapters) && currentBook.title.trim() === '')) {
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
    tempContainer.style.left = '-9999px'; 
    tempContainer.style.top = '-9999px'; 
    tempContainer.style.width = '750px'; 
    tempContainer.style.height = `${750 * 1.414}px`; 
    tempContainer.style.zIndex = '-1'; 
    tempContainer.style.opacity = '0'; 
    document.body.appendChild(tempContainer);
    

    let pagesToRender: (PagePreviewData | { type: 'toc'; title: string; entries: ChapterEntry[]; pageNumberForFooter: number } | { type: 'cover' } | { type: 'backCover' })[] = [];
    let pdfPageCounter = 0;

    // 1. Cover
    if (currentBook.coverImage || currentBook.title.trim() !== '') {
      pdfPageCounter++;
      pagesToRender.push({ type: 'cover' });
    }

    const contentPagesForPdfGeneration = generatePagePreviews(currentBook, formattingOptions);
    let tocPageCount = (currentBook.chapters && currentBook.chapters.length > 0 && formattingOptions.tocPosition !== 'none') ? 1 : 0;
    let contentStartPdfPageAfterTocAndCover = pdfPageCounter + tocPageCount + 1;


    // 2. TOC (if at start)
    if (formattingOptions.tocPosition === 'start' && currentBook.chapters && currentBook.chapters.length > 0) {
      pdfPageCounter++;
      const tocPdfPageNumberForFooter = pdfPageCounter;
      const tocEntriesForPdf = generateTableOfContents(contentPagesForPdfGeneration, currentBook.chapters)
        .map(entry => ({
          ...entry,
          estimatedPage: contentStartPdfPageAfterTocAndCover + entry.estimatedPage - 1
        }));
      pagesToRender.push({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter });
    }

    // 3. Content Pages
    contentPagesForPdfGeneration.forEach(pageData => {
      pdfPageCounter++;
      const actualPdfPageForThisContent = pdfPageCounter;
      pagesToRender.push({ ...pageData, footerCenter: `Página ${actualPdfPageForThisContent}` });
    });
    
    // 4. TOC (if at end, before back cover)
    if (formattingOptions.tocPosition === 'end' && currentBook.chapters && currentBook.chapters.length > 0) {
      pdfPageCounter++;
      const tocPdfPageNumberForFooter = pdfPageCounter;
      let contentStartPageNumberInPdfActual = 1;
      if (pagesToRender.some(p => 'type' in p && p.type === 'cover')) contentStartPageNumberInPdfActual++;
      // If TOC at start also exists, increment the start page for content
      if (formattingOptions.tocPosition === 'start' && currentBook.chapters && currentBook.chapters.length > 0) {
         contentStartPageNumberInPdfActual++;
      }


      const tocEntriesForPdf = generateTableOfContents(contentPagesForPdfGeneration, currentBook.chapters)
        .map(entry => ({
          ...entry,
          estimatedPage: contentStartPageNumberInPdfActual + entry.estimatedPage - 1
        }));
      pagesToRender.push({ type: 'toc', title: 'Índice', entries: tocEntriesForPdf, pageNumberForFooter: tocPdfPageNumberForFooter });
    }

    // 5. Back Cover
    if (currentBook.backCoverSynopsis || currentBook.backCoverSlogan || currentBook.backCoverImage || currentBook.author) {
      pdfPageCounter++;
      pagesToRender.push({ type: 'backCover' });
    }

    // Render all pages to canvas and then to PDF
    for (let i = 0; i < pagesToRender.length; i++) {
      const pageItem = pagesToRender[i];
      let pageDiv: HTMLDivElement;
      let isCoverPage = false;
      let isBackCoverPage = false;
      let isTocPage = false;

      if ('type' in pageItem) {
        if (pageItem.type === 'cover') { pageDiv = createPdfPageHtml(pageItem, false, true, false); isCoverPage = true; }
        else if (pageItem.type === 'backCover') { pageDiv = createPdfPageHtml(pageItem, false, false, true); isBackCoverPage = true;}
        else if (pageItem.type === 'toc') { pageDiv = createPdfPageHtml(pageItem, true, false, false); isTocPage = true;}
        else { // Should not happen with current structure
            pageDiv = document.createElement('div'); 
        }
      } else {
        pageDiv = createPdfPageHtml(pageItem as PagePreviewData, false, false, false);
      }
      
      tempContainer.appendChild(pageDiv);
      try {
        const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, backgroundColor: null, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
        if (i > 0) pdf.addPage();
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
      } catch (e) {
        console.error(`Error rendering page ${i + 1} for PDF:`, e);
        toast({title: `Error en Página ${i+1} del PDF`, description: "Hubo un problema al renderizar una página.", variant: "destructive"});
      }
      tempContainer.removeChild(pageDiv);
    }


    document.body.removeChild(tempContainer); 
    pdf.save(`${(currentBook.title.trim() || 'libro_escribalibro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };

  const handleExportToTxt = handleSaveBookAsTxt; 


  const handleExportToHtml = () => {
    if (!currentBook || (!getFullContentString(currentBook.chapters) && currentBook.title.trim() === '' && currentBook.author.trim() === '')) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como HTML.", variant: "destructive" });
      return;
    }

    let htmlString = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${currentBook.title.trim() || 'Libro'}</title>
        <style>
          body { font-family: ${formattingOptions.fontFamily}; font-size: ${formattingOptions.fontSize}px; color: ${formattingOptions.textColor}; background-color: ${formattingOptions.pageBackgroundColor}; line-height: ${formattingOptions.lineHeight}; margin: 0; padding: 0; max-width: 100%; }
          .book-container { max-width: 800px; margin: 20px auto; padding: ${formattingOptions.previewPadding}px; border: 1px solid #ddd; box-shadow: 0 0 10px rgba(0,0,0,0.1); background-color: white; }
          
          .cover-section, .back-cover-section { min-height: 90vh; display: flex; flex-direction: column; text-align: center; position: relative; background-color: ${formattingOptions.pageBackgroundColor}; color: ${formattingOptions.textColor}; padding: 20px; box-sizing: border-box; overflow: hidden; }
          .back-cover-section { background-color: ${currentBook.backCoverColor || formattingOptions.pageBackgroundColor}; color: ${currentBook.backCoverImage ? 'white' : formattingOptions.textColor};}
          .cover-section img.cover-image-bg, .back-cover-section img.back-cover-image-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
          .cover-section .text-overlay, .back-cover-section .text-overlay { position: relative; z-index: 2; background: ${currentBook.coverImage || currentBook.backCoverImage ? 'rgba(0,0,0,0.6)' : 'transparent'}; color: ${currentBook.coverImage || currentBook.backCoverImage ? 'white' : formattingOptions.textColor}; padding: 40px; border-radius: 8px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
          .back-cover-section .text-overlay { background: ${currentBook.backCoverImage ? 'rgba(0,0,0,0.5)' : 'transparent'}; color: ${currentBook.backCoverImage ? 'white' : formattingOptions.textColor};}
          
          .cover-title-container, .cover-subtitle-container, .cover-editorial-container, .cover-free-text-container, .cover-author-container,
          .back-cover-synopsis-container, .back-cover-slogan-container, .back-cover-image-html-container, .back-cover-author-name-container { 
            width: 100%; display: flex; flex-direction: column; position: absolute; left:0; padding: 0 40px; box-sizing: border-box;
          }
          
          .cover-section h1.book-title-cover { font-size: ${formattingOptions.coverTitleFontSize || 48}px; margin-bottom: 0.2em; text-shadow: ${currentBook.coverImage ? '2px 2px 5px rgba(0,0,0,0.8)' : 'none'}; }
          .cover-section h2.book-subtitle-cover { font-size: ${formattingOptions.coverSubtitleFontSize || 28}px; font-style: italic; margin-bottom: 1em; text-shadow: ${currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.7)' : 'none'}; }
          .cover-section p.cover-free-text { font-size: ${formattingOptions.fontSize * 1.2}px; margin-top: 1em; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.6)' : 'none'}; }
          .cover-section p.author-name-main { font-size: ${formattingOptions.fontSize * 1.5}px; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.6)' : 'none'}; margin-top: 1em; }
          .cover-section p.editorial-name-cover { font-size: ${formattingOptions.fontSize * 1}px; text-shadow: ${currentBook.coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none'}; }

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
          .author-photo-container-cover img.author-image-cover { width: 120px; height: 120px; object-fit: cover; border-radius: 6px; border: ${currentBook.coverImage ? '3px solid white' : `3px solid ${formattingOptions.textColor}`}; box-shadow: 0 3px 7px rgba(0,0,0,0.5); margin-bottom: 8px; }
          .author-photo-container-cover p.author-name-photo { font-size: ${formattingOptions.fontSize * 1}px; margin-top: 0; text-shadow: ${currentBook.coverImage ? '1px 1px 3px rgba(0,0,0,0.8)' : 'none'}; color: ${currentBook.coverImage ? 'white' : formattingOptions.textColor}; }
          
          h1, h2, h3 { color: ${formattingOptions.textColor}; }
          h1.book-title-content { font-size: ${formattingOptions.fontSize * 2.5}px; text-align: center; margin-bottom: 0.1em; }
          h3.author-name-content { font-size: ${formattingOptions.fontSize * 1.4}px; text-align: center; font-style: italic; margin-top:0; margin-bottom: 2.5em; }
          h2.chapter-title-html { font-size: ${formattingOptions.fontSize * 1.8}px; margin-top: 2.5em; margin-bottom: 1em; padding-bottom: 0.4em; border-bottom: 2px solid ${formattingOptions.textColor}; text-indent:0; }
          .content-image { max-width: 90%; max-height: 500px; height: auto; display: block; margin: 2em auto; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.15); }
          
          .html-paragraph { margin-bottom: ${formattingOptions.fontSize * 0.7}px; text-align: justify; text-indent: 1.5em; }
          /* .html-paragraph.first-paragraph.first-letter-capital::first-letter, .html-paragraph.first-letter-capital::first-letter { font-size: 2.5em; font-weight: bold; float: left; line-height: 0.8; margin-right: 0.05em; padding-top:0.05em; color: hsl(var(--primary)); } */
          .html-paragraph.first-paragraph { text-indent: 0; }

          .toc { border: 1px solid #e0e0e0; padding: 20px 30px; margin-bottom: 35px; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .toc h2 { text-align: center; margin-top: 0; font-size: ${formattingOptions.fontSize * 1.6}px; margin-bottom: 20px; }
          .toc ul { list-style-type: none; padding-left: 0; }
          .toc li { margin-bottom: 10px; font-size: ${formattingOptions.fontSize * 1.05}px; display: flex; justify-content: space-between; align-items: baseline; }
          .toc li .toc-title { flex-grow: 1; margin-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .toc li .toc-page { font-weight: normal; margin-left: auto; padding-left:10px; }
          .page-break-before { page-break-before: always; }
          .page-break-html { border-top: 1px dashed #ccc; margin: 2em 0; text-align: center; color: #aaa; font-size: 0.9em; }
          .page-break-html::before { content: "--- Salto de Página Manual ---"; }

          .back-cover-synopsis-container .synopsis-text { font-size: ${formattingOptions.fontSize * 0.95}px; text-align: justify; text-shadow: ${currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none'};}
          .back-cover-slogan-container .slogan-text { font-size: ${formattingOptions.fontSize * 1.15}px; font-style: italic; font-weight: bold; text-shadow: ${currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none'};}
          .back-cover-author-name-container .author-name-back { font-size: ${formattingOptions.fontSize * 1}px; text-shadow: ${currentBook.backCoverImage ? '1px 1px 2px rgba(0,0,0,0.7)' : 'none'};}
          .back-cover-image-html-container .back-cover-image-html { max-width: 60%; max-height: 40%; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,0.3); margin: 0 auto; display:block;}

        </style>
      </head>
      <body>
    `;
    
    const getHtmlPositionStyles = (pos: CoverTextPosition | undefined, defaultVerticalAlign: string = 'center') => {
        let textAlign = 'center';
        let alignItems = 'center'; 
        let justifyContent = defaultVerticalAlign; 
        let top = 'auto', bottom = 'auto', left = '40px', right = '40px'; 
        let transform = '';

        if (pos) {
            if (pos.startsWith('top')) { justifyContent = 'flex-start'; top = '40px'; bottom='auto';}
            else if (pos.startsWith('middle')) { justifyContent = 'center'; top='50%'; bottom='auto'; transform = 'translateY(-50%)';}
            else if (pos.startsWith('bottom')) { justifyContent = 'flex-end'; top = 'auto'; bottom='40px';}

            if (pos.includes('left')) { textAlign = 'left'; alignItems = 'flex-start'; left='40px'; right='auto';}
            else if (pos.includes('center')) { textAlign = 'center'; alignItems = 'center'; left='40px'; right='40px';}
            else if (pos.includes('right')) { textAlign = 'right'; alignItems = 'flex-end'; left='auto'; right='40px';}
        }
        return `text-align: ${textAlign}; align-items: ${alignItems}; justify-content: ${justifyContent}; top: ${top}; bottom: ${bottom}; left: ${left}; right: ${right}; transform: ${transform};`;
    };


    htmlString += '<div class="cover-section">\n';
    if (currentBook.coverImage) {
      htmlString += `  <img src="${currentBook.coverImage}" alt="Portada del Libro" class="cover-image-bg" data-ai-hint="book cover" />\n`;
    }
    htmlString += '  <div class="text-overlay">\n'; 
    htmlString += `    <div class="cover-title-container" style="${getHtmlPositionStyles(currentBook.titlePosition, 'center')}"><h1 class="book-title-cover">${currentBook.title.trim() || 'Libro sin Título'}</h1></div>\n`;
    if (currentBook.subtitle) {
      htmlString += `    <div class="cover-subtitle-container" style="${getHtmlPositionStyles(currentBook.subtitlePosition, 'center')}"><h2 class="book-subtitle-cover">${currentBook.subtitle}</h2></div>\n`;
    }
    if (currentBook.coverFreeText) {
      htmlString += `    <div class="cover-free-text-container" style="${getHtmlPositionStyles(currentBook.coverFreeTextPosition, 'flex-end')}"><p class="cover-free-text">${currentBook.coverFreeText}</p></div>\n`;
    }
     if (currentBook.editorial) { 
        htmlString += `  <div class="cover-editorial-container" style="${getHtmlPositionStyles(currentBook.editorialPosition, 'flex-end')}"><p class="editorial-name-cover">${currentBook.editorial}</p></div>\n`;
    }
    
    let authorMainStyle = getHtmlPositionStyles(undefined, 'flex-end'); // Default for author if no photo
    if (currentBook.authorImage) { // If there is an author image, author name is tied to it, not positioned independently here.
         authorMainStyle = "display: none;";
    } else if (currentBook.editorial && currentBook.editorialPosition?.startsWith('bottom')) {
        authorMainStyle = getHtmlPositionStyles(undefined, 'flex-end') + ` padding-bottom: ${ (formattingOptions.fontSize || 16) * 2.5}px;`;
    }
    htmlString += `    <div class="cover-author-container" style="${authorMainStyle}"><p class="author-name-main">${currentBook.author.trim() || 'Autor Desconocido'}</p></div>\n`;
    
    htmlString += '  </div>\n'; 
    if (currentBook.authorImage) {
      htmlString += '  <div class="author-photo-container-cover">\n';
      htmlString += `    <img src="${currentBook.authorImage}" alt="Foto del Autor" class="author-image-cover" data-ai-hint="portrait person" />\n`;
      htmlString += `    <p class="author-name-photo">${currentBook.author}</p>\n`; 
      htmlString += '  </div>\n';
    }
    htmlString += '</div>\n'; 

    const tocForHtml = generateTableOfContents(paginatedPreview, currentBook.chapters || []);
    
    const generateTocHtmlBlock = (isStart: boolean) => {
      if (tocForHtml.length > 0 && formattingOptions.tocPosition !== 'none') {
        if ((isStart && formattingOptions.tocPosition === 'start') || (!isStart && formattingOptions.tocPosition === 'end')) {
          return `
            <div class="toc page-break-before">
              <h2>Índice</h2>
              <ul>
                ${tocForHtml.map(entry => `<li><span class="toc-title">${entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title}</span> <span class="toc-page">${entry.estimatedPage}</span></li>`).join('\n')}
              </ul>
            </div>
          `;
        }
      }
      return '';
    };
    
    let mainContentHtml = "";

    if (formattingOptions.tocPosition === 'start') {
      mainContentHtml += generateTocHtmlBlock(true);
    }

    const fullContentForHtml = (currentBook.chapters || [])
      .map(chapter => {
        let chapterHtml = `<h2 class="chapter-title-html page-break-before">${chapter.title.trim() === '' ? '&nbsp;' : chapter.title}</h2>\n`;
        let firstParagraphInChapter = true;
        chapterHtml += chapter.content.split('\n').map(line => {
          if (line.trim() === PAGE_BREAK_MARKER) {
            return `<div class="page-break-html"></div>`;
          }
          const imageMatch = line.match(/!\[(.*?)\]\((data:image\/.*?)\)/);
          if (imageMatch) {
            const [, altText, imgSrc] = imageMatch;
            firstParagraphInChapter = false; 
            return `<img src="${imgSrc}" alt="${altText || 'Imagen insertada'}" class="content-image" data-ai-hint="illustration drawing" />`;
          } else if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
              const [, altText] = line.match(/!\[(.*?)\]\((.*?)\)/)!;
              firstParagraphInChapter = false; 
              return `<p style="font-style: italic; color: #888; text-align: center;">[Imagen: ${altText || 'Referencia de imagen externa'}]</p>`;
          }
          
          let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
          processedLine = processedLine.replace(/(\s|^)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3');     
          processedLine = processedLine.replace(/(\s|^)_(.*?)_(\s|$)/g, '$1<em>$2</em>$3'); 

          let pClass = "html-paragraph";
          if (firstParagraphInChapter && processedLine.trim() !== '') {
            pClass += " first-paragraph"; // Removed first-letter-capital
            firstParagraphInChapter = false;
          } else if (processedLine.trim() === '') {
             pClass += " empty-paragraph"; 
          }

          return processedLine.trim() === '' ? `<p class="html-paragraph">&nbsp;</p>` : `<p class="${pClass}">${processedLine}</p>`;
        }).join('\n');
        return chapterHtml;
      })
      .join('\n');

    mainContentHtml += fullContentForHtml;

    if (formattingOptions.tocPosition === 'end') {
      mainContentHtml += generateTocHtmlBlock(false);
    }
    
    htmlString += `<div class="book-container page-break-before">${mainContentHtml}</div>\n`;


    // Back Cover HTML
    if (currentBook.backCoverSynopsis || currentBook.backCoverSlogan || currentBook.backCoverImage || currentBook.author) {
        htmlString += `<div class="back-cover-section page-break-before">\n`;
        if (currentBook.backCoverImage) {
            htmlString += `  <img src="${currentBook.backCoverImage}" alt="Imagen de Contraportada" class="back-cover-image-bg" data-ai-hint="texture abstract" />\n`;
        }
        htmlString += `  <div class="text-overlay">\n`;
        if (currentBook.backCoverSynopsis) {
            htmlString += `    <div class="back-cover-synopsis-container" style="${getHtmlPositionStyles(currentBook.backCoverSynopsisPosition, 'center')}"><p class="synopsis-text">${currentBook.backCoverSynopsis.replace(/\n/g, '<br>')}</p></div>\n`;
        }
        if (currentBook.backCoverSlogan) {
            htmlString += `    <div class="back-cover-slogan-container" style="${getHtmlPositionStyles(currentBook.backCoverSloganPosition, 'flex-end')}"><p class="slogan-text">${currentBook.backCoverSlogan}</p></div>\n`;
        }
         if (currentBook.backCoverImage && currentBook.backCoverImagePosition) {
            htmlString += `    <div class="back-cover-image-html-container" style="${getHtmlPositionStyles(currentBook.backCoverImagePosition || 'center', 'center')}"><img src="${currentBook.backCoverImage}" class="back-cover-image-html" data-ai-hint="texture abstract" /></div>\n`;
         }

        if (currentBook.author) {
            htmlString += `    <div class="back-cover-author-name-container" style="${getHtmlPositionStyles(currentBook.backCoverAuthorNamePosition, 'flex-end')}"><p class="author-name-back">${currentBook.author}</p></div>\n`;
        }
        htmlString += `  </div>\n`; 
        htmlString += `</div>\n`; 
    }

    htmlString += `
      </body>
      </html>
    `;

    const filename = `${(currentBook.title.trim() || 'libro').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
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

  const authorImagePositionClasses: Record<AuthorImagePosition, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };
  
  const coverTextPositionClasses = (position: CoverTextPosition | undefined, _elementType: string): string => {
    if (!position) return 'items-center justify-center text-center'; 
    
    let classes = 'absolute inset-0 flex flex-col p-3 md:p-4 z-10 pointer-events-none '; 

    if (position.startsWith('top')) classes += 'justify-start ';
    else if (position.startsWith('middle')) classes += 'justify-center ';
    else if (position.startsWith('bottom')) classes += 'justify-end ';

    if (position.includes('left')) classes += 'items-start text-left';
    else if (position.includes('center')) classes += 'items-center text-center';
    else if (position.includes('right')) classes += 'items-end text-right';
    
    return classes;
  };

  const renderTextElement = (text: string | undefined, baseFontSize: number, position: CoverTextPosition | undefined, elementType: string, additionalClasses: string = '', isHTML: boolean = false) => {
    if (!text) return null;
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

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col container mx-auto">
        <TabsList className="mx-auto mb-6 shadow-sm w-full max-w-4xl grid grid-cols-2 sm:grid-cols-5">
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
          <TabsTrigger value="backCover" className="px-3 py-1.5 md:px-4 md:py-2 text-xs sm:text-sm">
            <BookCopy className="mr-1.5 h-4 w-4" /> Contraportada
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-1 flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/2 flex flex-col gap-6">
            <TabsContent value="editor" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookOpen className="mr-2 h-5 w-5 text-primary" />Editor de Contenido</CardTitle>
                   <CardDescription>
                    Gestiona tus capítulos. Usa `\newpage` en el contenido para saltos de página manuales.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 space-y-4">
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

                  {currentEditingChapter && (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="chapterTitle" className="text-sm font-medium">Título del Capítulo:</Label>
                            <div className="flex items-center gap-2">
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
                        <Textarea
                            id={`chapterContent-${currentEditingChapter.id}`}
                            value={currentEditingChapter.content}
                            onChange={(e) => handleChapterContentChange(currentEditingChapter.id, e.target.value)}
                            placeholder="Escribe el contenido de este capítulo aquí..."
                            className="w-full min-h-[250px] md:min-h-[350px] text-sm p-3 rounded-md shadow-inner bg-background/70 border-input focus:bg-background"
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
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insertar Imagen en Capítulo
                    </Label>
                    <Input id="insertImageContent" type="file" accept="image/*" onChange={handleImageInsertToContent} className="hidden" />
                    <p className="text-xs text-muted-foreground mt-1">Las imágenes son para esta sesión y se exportan a PDF/HTML, no se guardan en TXT.</p>
                  </div>
                  <div className="mt-auto pt-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => setShowMarkdownHelp(true)}>
                      <HelpCircle className="mr-2 h-4 w-4" /> Consejos de Formato (Markdown)
                    </Button>
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
                            <span className="truncate pr-2">{entry.title.trim() === '' ? '(Capítulo sin título)' : entry.title}</span>
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

                  {(currentBook.coverImage || currentBook.authorImage || currentBook.title.trim() !== '' || currentBook.subtitle || currentBook.editorial || currentBook.coverFreeText) && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col shadow-inner overflow-hidden relative">
                         {currentBook.coverImage && <NextImage src={currentBook.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />}
                         
                         <div className={`${coverTextPositionClasses(currentBook.titlePosition, 'title')}`}>
                           <h3 
                            className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight"
                            style={{ fontSize: `${Math.max(10, (formattingOptions.coverTitleFontSize || 48) * 0.4)}px`}} 
                           >{currentBook.title}</h3>
                         </div>
                          {currentBook.subtitle && (
                            <div className={`${coverTextPositionClasses(currentBook.subtitlePosition, 'subtitle')}`}>
                                <p 
                                 className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words mt-1"
                                 style={{ fontSize: `${Math.max(8, (formattingOptions.coverSubtitleFontSize || 28) * 0.4)}px`}} 
                                ><em>{currentBook.subtitle}</em></p>
                            </div>
                          )}
                          {currentBook.editorial && (
                            <div className={`${coverTextPositionClasses(currentBook.editorialPosition, 'editorial')}`}>
                                <p className="text-[10px] text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words">{currentBook.editorial}</p>
                            </div>
                          )}
                           {currentBook.coverFreeText && (
                            <div className={`${coverTextPositionClasses(currentBook.coverFreeTextPosition, 'freeText')}`}>
                                <p className="text-[10px] text-gray-100 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words">{currentBook.coverFreeText}</p>
                            </div>
                          )}

                         {currentBook.authorImage && (
                            <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-16 h-20 z-20 flex flex-col items-center text-center pointer-events-none`}>
                                <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={60} height={60} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                                <p className="text-[10px] text-white mt-0.5 [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words leading-tight">{currentBook.author}</p>
                            </div>
                         )}
                          {!currentBook.authorImage && currentBook.author.trim() !== '' && !(currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) && ( 
                             <div className={`absolute inset-0 flex flex-col p-3 z-10 pointer-events-none items-center justify-end text-center`}>
                               <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words pb-1"><em>{currentBook.author}</em></p>
                             </div>
                          )}
                       </div>
                    )}
                    {!currentBook.coverImage && !currentBook.authorImage && currentBook.title.trim() === '' && !currentBook.subtitle && !currentBook.editorial && !currentBook.coverFreeText &&(
                      <div className="mt-4 p-2 border border-dashed rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted/50 flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={36} className="mb-2 opacity-70" />
                        <p className="text-xs text-center">Sube imágenes y añade detalles para la portada.</p>
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="backCover" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookCopy className="mr-2 h-5 w-5 text-primary" />Diseñador de Contraportada</CardTitle>
                  <CardDescription>Personaliza la contraportada de tu libro.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
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
                  <div className="space-y-2">
                    <Label htmlFor="backCoverSlogan" className="text-sm font-medium">Eslogan (Opcional)</Label>
                    <Input id="backCoverSlogan" value={currentBook.backCoverSlogan || ''} onChange={(e) => handleBookDetailsChange('backCoverSlogan', e.target.value)} placeholder="Un eslogan corto y atractivo" className="mt-1 text-sm p-2 shadow-inner"/>
                    <Label htmlFor="backCoverSloganPosition" className="text-xs font-medium text-muted-foreground">Posición del Eslogan</Label>
                    <Select onValueChange={(v) => handleCoverTextFieldChange('backCoverSloganPosition', v as CoverTextPosition)} value={currentBook.backCoverSloganPosition || 'bottom-center'}>
                       <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                       <SelectContent> {/* Options same as above */}
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                   <div className="space-y-2">
                    <Label htmlFor="backCoverAuthorNamePosition" className="text-xs font-medium">Posición Nombre del Autor</Label>
                     <Select onValueChange={(v) => handleCoverTextFieldChange('backCoverAuthorNamePosition', v as CoverTextPosition)} value={currentBook.backCoverAuthorNamePosition || 'bottom-right'}>
                       <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                       <SelectContent> {/* Options same as above */}
                            <SelectItem value="top-left">Sup. Izq.</SelectItem><SelectItem value="top-center">Sup. Centro</SelectItem><SelectItem value="top-right">Sup. Der.</SelectItem>
                            <SelectItem value="middle-left">Med. Izq.</SelectItem><SelectItem value="middle-center">Med. Centro</SelectItem><SelectItem value="middle-right">Med. Der.</SelectItem>
                            <SelectItem value="bottom-left">Inf. Izq.</SelectItem><SelectItem value="bottom-center">Inf. Centro</SelectItem><SelectItem value="bottom-right">Inf. Der.</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
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
                  <div className="space-y-2">
                      <Label htmlFor="backCoverColor" className="text-sm font-medium">Color de Fondo Contraportada</Label>
                      <Input id="backCoverColor" type="color" value={currentBook.backCoverColor || '#FFFFFF'} onChange={(e) => handleBookDetailsChange('backCoverColor', e.target.value)} className="mt-1 h-10 p-1 w-full rounded-md border-2 border-input"/>
                  </div>

                </CardContent>
              </Card>
            </TabsContent>
          </div>

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
                  borderRadius: 'var(--radius)', 
                  maxHeight: 'calc(100vh - 180px)', // Adjust as needed
                }}
              >
                {activeTab === 'cover' ? (
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col shadow-lg overflow-hidden relative" 
                    style={{
                        backgroundColor: currentBook.coverImage ? '#333' : formattingOptions.pageBackgroundColor, 
                        color: currentBook.coverImage ? 'white' : formattingOptions.textColor,
                        fontFamily: formattingOptions.fontFamily, 
                    }}>
                    {currentBook.coverImage ? (
                      <NextImage src={currentBook.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">Sin imagen de portada</p>
                      </div>
                    )}
                     <div className={`${coverTextPositionClasses(currentBook.titlePosition, 'title')}`}>
                        <h2 
                            className="font-bold [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight break-words"
                            style={{ fontSize: `${formattingOptions.coverTitleFontSize || 48}px` }}
                        >{currentBook.title}</h2>
                     </div>
                     {currentBook.subtitle && (
                       <div className={`${coverTextPositionClasses(currentBook.subtitlePosition, 'subtitle')}`}>
                          <p 
                            className="[text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] italic break-words"
                            style={{ fontSize: `${formattingOptions.coverSubtitleFontSize || 28}px` }}
                          >{currentBook.subtitle}</p>
                       </div>
                     )}
                     {currentBook.editorial && (
                        <div className={`${coverTextPositionClasses(currentBook.editorialPosition, 'editorial')}`}>
                            <p className="text-sm [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words">{currentBook.editorial}</p>
                        </div>
                     )}
                     {currentBook.coverFreeText && (
                        <div className={`${coverTextPositionClasses(currentBook.coverFreeTextPosition, 'freeText')}`}>
                            <p className="text-sm [text-shadow:1px_1px_1px_rgba(0,0,0,0.6)] break-words">{currentBook.coverFreeText}</p>
                        </div>
                      )}
                     {!currentBook.authorImage && currentBook.author.trim() !== '' && !(currentBook.editorial && currentBook.editorialPosition?.includes('bottom')) && (
                         <div className={`absolute inset-0 flex flex-col p-4 md:p-6 z-10 pointer-events-none items-center justify-end text-center`}>
                            <p className="text-base md:text-lg [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] pb-2 break-words"><em>{currentBook.author}</em></p>
                         </div>
                     )}
                    {currentBook.authorImage && (
                        <div className={`absolute ${authorImagePositionClasses[currentBook.authorImagePosition || 'bottom-right']} w-24 z-20 flex flex-col items-center text-center p-1 bg-black/20 rounded pointer-events-none`}>
                            <NextImage src={currentBook.authorImage} alt="Foto del Autor" width={70} height={70} objectFit="cover" className="rounded border-2 border-white shadow-md" data-ai-hint="portrait person"/>
                            <p className="text-xs text-white mt-1 [text-shadow:1px_1px_1px_rgba(0,0,0,0.7)] break-words leading-tight">{currentBook.author}</p>
                        </div>
                    )}
                  </div>
                ) : activeTab === 'backCover' ? (
                     <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col shadow-lg overflow-hidden relative"
                        style={{
                            backgroundColor: currentBook.backCoverColor || formattingOptions.pageBackgroundColor,
                            color: currentBook.backCoverImage ? 'white' : formattingOptions.textColor, 
                            fontFamily: formattingOptions.fontFamily,
                        }}>
                        {currentBook.backCoverImage && (
                            <NextImage src={currentBook.backCoverImage} alt="Vista Previa de Contraportada" layout="fill" objectFit="cover" className="z-0" data-ai-hint="texture abstract"/>
                        )}
                        {!currentBook.backCoverImage && !currentBook.backCoverSynopsis && !currentBook.backCoverSlogan && (
                            <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                                <ImageIcon size={60} className="opacity-50 mb-2" />
                                <p className="text-sm">Configura la contraportada</p>
                            </div>
                        )}
                        {renderTextElement(currentBook.backCoverSynopsis, formattingOptions.fontSize * 0.9, currentBook.backCoverSynopsisPosition, 'backSynopsis', `text-sm ${currentBook.backCoverImage ? 'text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)]' : ''}`, true)}
                        {renderTextElement(currentBook.backCoverSlogan, formattingOptions.fontSize * 1.1, currentBook.backCoverSloganPosition, 'backSlogan', `font-semibold italic ${currentBook.backCoverImage ? 'text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)]' : ''}`)}
                        {renderTextElement(currentBook.author, formattingOptions.fontSize * 0.95, currentBook.backCoverAuthorNamePosition, 'backAuthorName', `${currentBook.backCoverImage ? 'text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)]' : ''}`)}
                        
                        {currentBook.backCoverImage && currentBook.backCoverImagePosition && (
                           <div className={`${coverTextPositionClasses(currentBook.backCoverImagePosition, 'backImage')} flex items-center justify-center`}>
                             <div className="relative w-[60%] h-[40%] max-w-[200px] max-h-[150px]">
                                <NextImage src={currentBook.backCoverImage} alt="Imagen Contraportada" layout="fill" objectFit="contain" className="rounded shadow-md" data-ai-hint="texture design" />
                             </div>
                           </div>
                        )}
                    </div>
                ) : paginatedPreview.length > 0 && currentPreviewPageData ? (
                  <div
                    key={`${currentPreviewPageData.pageNumber}-${currentPreviewPageIndex}`} 
                    className="page-simulation-wrapper mx-auto my-4 prose-sm md:prose max-w-none" 
                    style={{
                      ...simulatedPageStyle,
                      opacity: isPageTransitioning ? 0 : 1,
                      transition: 'opacity 0.15s ease-in-out', 
                    }}
                  >
                    <div className="page-header text-xs py-1.5 px-2.5 border-b" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: 'hsl(var(--border))'}}>
                      <span className="float-left truncate max-w-[45%]">{currentPreviewPageData.headerLeft.trim() === '' ? <>&nbsp;</> : currentPreviewPageData.headerLeft}</span>
                      <span className="float-right truncate max-w-[45%]">{currentPreviewPageData.headerRight.trim() === '' ? <>&nbsp;</> : currentPreviewPageData.headerRight}</span>
                      <div style={{clear: 'both'}}></div>
                    </div>

                    <div className="page-content-area flex-grow overflow-hidden py-2 px-1" style={{lineHeight: formattingOptions.lineHeight, fontSize: `${formattingOptions.fontSize}px`}}>
                      {currentPreviewPageData.contentElements.length > 0 ? currentPreviewPageData.contentElements : <p className="italic text-center book-paragraph" style={{opacity: 0.6, minHeight: '2em'}}>&nbsp;</p>}
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
                    <h3 className="text-lg font-semibold mb-1">{currentBook.title.trim() === '' ? 'Libro (en edición)' : currentBook.title}</h3>
                    <p className="text-sm italic mb-3">por {currentBook.author.trim() === '' ? 'Autor (en edición)' : currentBook.author}</p>
                    <p className="text-xs italic text-muted-foreground">
                      La vista previa del contenido aparecerá aquí paginada.
                    </p>
                    { (getFullContentString(currentBook.chapters).trim() === "" || getFullContentString(currentBook.chapters).trim() === "##  \n") &&
                      <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor para ver la vista previa)</p>
                    }
                  </div>
                )}
              </CardContent>
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
               {(activeTab !== 'cover' && activeTab !== 'backCover') && paginatedPreview.length === 0 && (
                <CardFooter className="text-xs text-muted-foreground justify-center py-2.5 border-t bg-muted/50">
                  La vista previa aparecerá aquí.
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </Tabs>

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

      <footer className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground">
        <p>Escribe Libro Pro {APP_VERSION}</p>
        <p>{COPYRIGHT_NOTICE}</p>
      </footer>
    </div>
  );
}

