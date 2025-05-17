
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
import { UploadCloud, BookOpen, Type, User, Settings, Palette, FileText, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered, FolderOpen, FileDown, FileCode } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
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

const LOCALSTORAGE_BOOK_KEY = 'escribaLibro_book_v3';
const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v3';

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
  const [book, setBook] = useState<Book>({
    title: 'Libro sin Título',
    author: 'Autor Desconocido',
    content: '',
    coverImage: null,
    tableOfContents: [],
  });

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

  const loadDataFromLocalStorage = useCallback(() => {
    try {
      const savedBook = localStorage.getItem(LOCALSTORAGE_BOOK_KEY);
      if (savedBook) {
        const parsedBook = JSON.parse(savedBook);
        setBook({ ...parsedBook, tableOfContents: parsedBook.tableOfContents || [] });
      }
      const savedFormatting = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormatting) {
        setFormattingOptions(JSON.parse(savedFormatting));
      } else {
        // Initialize colors from CSS variables if no saved formatting
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
      return true;
    } catch (error) {
      console.error("Fallo al cargar datos desde localStorage", error);
      toast({ title: "Error", description: "No se pudieron cargar los datos guardados.", variant: "destructive" });
      return false;
    }
  }, [toast]); // setBook and setFormattingOptions are stable

  useEffect(() => {
    setMounted(true);
    loadDataFromLocalStorage();
  }, [loadDataFromLocalStorage]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LOCALSTORAGE_BOOK_KEY, JSON.stringify(book));
    }
  }, [book, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
    }
  }, [formattingOptions, mounted]);

  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(book, formattingOptions);
      setPaginatedPreview(newPreview);
      const newToc = generateTableOfContents(newPreview);
      if (JSON.stringify(newToc) !== JSON.stringify(book.tableOfContents)) {
        setBook(prev => ({ ...prev, tableOfContents: newToc }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.content, book.title, formattingOptions, mounted]);


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
    localStorage.setItem(LOCALSTORAGE_BOOK_KEY, JSON.stringify(book));
    localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
    toast({
      title: "¡Progreso Guardado!",
      description: "Los datos de tu libro y las preferencias de formato se han guardado localmente.",
      duration: 3000,
    });
  };

  const handleOpenBook = () => {
    if (loadDataFromLocalStorage()) {
      toast({
        title: "Libro Cargado",
        description: "Los datos de tu libro se han cargado desde el almacenamiento local.",
        duration: 3000,
      });
    }
  };

  const handleContentChange = (newContent: string) => {
    setBook(prev => ({ ...prev, content: newContent }));
  };

  const handleBookDetailsChange = (field: keyof Pick<Book, 'title' | 'author'>, value: string) => {
    setBook(prev => ({ ...prev, [field]: value }));
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
        setBook(prev => ({ ...prev, coverImage: base64Image }));
      });
    }
  };

  const handleImageInsertToContent = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const imageName = event.target.files[0].name || 'imagen';
      handleFileRead(event.target.files[0], (base64Image) => {
        const imageMarkdown = `\n![${imageName}](${base64Image})\n`;
        setBook(prev => ({ ...prev, content: prev.content + imageMarkdown }));
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
    const pdfPageWidthPx = 750; // Standard width for html2canvas rendering to maintain quality
    const pdfPageHeightPx = pdfPageWidthPx * 1.414; // A4 aspect ratio

    pageDiv.style.width = `${pdfPageWidthPx}px`;
    pageDiv.style.minHeight = `${pdfPageHeightPx - 2 * formattingOptions.previewPadding}px`; // Ensure content fits
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
      ul.style.paddingLeft = '20px'; // Indent TOC items
      ul.style.flexGrow = '1'; // Ensure TOC takes up space
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
        titleSpan.style.textOverflow = 'ellipsis'; // Prevent long titles from breaking layout

        const dots = document.createElement('span');
        dots.textContent = ".".repeat(Math.max(5, 40 - entry.title.length - String(entry.estimatedPage).length)); // Dynamic dots
        dots.style.flexShrink = '0'; // Prevent dots from shrinking
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
      // Regular content page
      const typedPageData = pageData as PagePreviewData;
      // Header
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

      // Content
      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1'; // Make content area fill available space
      typedPageData.rawContentLines.forEach(line => {
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
          const [, altText, imgSrc] = imageMatch;
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = `${formattingOptions.fontSize * 0.8}px 0`; // Space around image
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '80%'; // Control image size
          img.style.maxHeight = '350px'; // Prevent overly tall images
          img.style.height = 'auto';
          img.style.borderRadius = '4px';
          img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          imgContainer.appendChild(img);
          if (altText) { // Add caption if alt text exists
            const caption = document.createElement('p');
            caption.textContent = altText;
            caption.style.fontSize = `${formattingOptions.fontSize * 0.8}px`; caption.style.fontStyle = 'italic'; caption.style.opacity = '0.8'; caption.style.marginTop = '0.25em';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
        } else {
          const p = document.createElement('p');
          p.innerHTML = line.trim() === '' ? '&nbsp;' : line; // Handle empty lines for spacing
          p.style.margin = `${formattingOptions.fontSize * 0.3}px 0`; // Consistent paragraph spacing
          if (line.startsWith('## ')) { // Chapter heading styling
            p.style.fontSize = `${formattingOptions.fontSize * 1.5}px`; p.style.fontWeight = 'bold'; p.style.marginTop = `${formattingOptions.fontSize}px`; p.style.marginBottom = `${formattingOptions.fontSize * 0.5}px`;
            p.textContent = line.substring(3).trim(); // Remove '## '
          }
          contentAreaDiv.appendChild(p);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      // Footer
      const footerDiv = document.createElement('div');
      footerDiv.style.textAlign = 'center';
      footerDiv.style.fontSize = `${formattingOptions.fontSize * 0.75}px`;
      footerDiv.style.opacity = '0.7';
      footerDiv.style.paddingTop = '5px';
      footerDiv.style.borderTop = `1px solid ${formattingOptions.textColor}`;
      footerDiv.style.marginTop = 'auto'; // Push footer to bottom
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
    const marginPt = 40; // Common margin for A4
    const usableWidthPt = pdfWidthPt - 2 * marginPt;

    // Create a temporary off-screen container for rendering pages for html2canvas
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.width = '750px'; // Consistent width for rendering
    document.body.appendChild(tempContainer);

    const renderedCanvases: { type: 'cover' | 'toc' | 'content', canvas: HTMLCanvasElement }[] = [];
    const chapterPdfPageMap: ChapterEntry[] = []; // To store actual PDF page numbers for chapters

    // 1. Render Cover Page (if exists)
    if (book.coverImage) {
      const coverDiv = document.createElement('div');
      // Style coverDiv to mimic a book cover for html2canvas
      coverDiv.style.width = '750px'; // Match rendering width
      coverDiv.style.height = `${750 * (pdfHeightPt / pdfWidthPt)}px`; // Maintain A4 aspect ratio for the canvas
      coverDiv.style.display = 'flex'; coverDiv.style.flexDirection = 'column'; coverDiv.style.alignItems = 'center'; coverDiv.style.justifyContent = 'center';
      coverDiv.style.position = 'relative'; coverDiv.style.backgroundColor = formattingOptions.pageBackgroundColor; coverDiv.style.overflow = 'hidden';
      
      const img = document.createElement('img'); img.src = book.coverImage;
      img.style.position = 'absolute'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; // Cover the div
      coverDiv.appendChild(img);
      
      // Add title and author overlay
      const textOverlay = document.createElement('div');
      textOverlay.style.position = 'absolute'; textOverlay.style.inset = '0'; textOverlay.style.display = 'flex'; textOverlay.style.flexDirection = 'column';
      textOverlay.style.alignItems = 'center'; textOverlay.style.justifyContent = 'flex-end'; textOverlay.style.padding = '40px';
      textOverlay.style.textAlign = 'center'; textOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)'; // Gradient for text readability
      textOverlay.style.zIndex = '10';
      
      const titleEl = document.createElement('h2'); titleEl.textContent = book.title;
      titleEl.style.fontFamily = formattingOptions.fontFamily; titleEl.style.fontSize = '36px'; titleEl.style.fontWeight = 'bold'; titleEl.style.color = 'white';
      titleEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.7)'; titleEl.style.marginBottom = '10px';
      textOverlay.appendChild(titleEl);
      
      const authorEl = document.createElement('p'); authorEl.textContent = book.author;
      authorEl.style.fontFamily = formattingOptions.fontFamily; authorEl.style.fontSize = '24px'; authorEl.style.fontStyle = 'italic'; authorEl.style.color = '#e0e0e0';
      authorEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
      textOverlay.appendChild(authorEl); 
      coverDiv.appendChild(textOverlay);
      
      tempContainer.appendChild(coverDiv);
      const canvas = await html2canvas(coverDiv, { scale: 2, useCORS: true, windowWidth: coverDiv.scrollWidth, windowHeight: coverDiv.scrollHeight });
      renderedCanvases.push({ type: 'cover', canvas });
      tempContainer.removeChild(coverDiv);
    }

    // 2. Render Content Pages and build chapterPdfPageMap
    let currentContentPdfPage = 0; // Reset for content section page numbering
    for (const pageData of paginatedPreview) {
      currentContentPdfPage++;
      const pdfPageData = { ...pageData, footerCenter: `Página ${currentContentPdfPage}` }; // Update footer for PDF content section
      const pageDiv = createPdfPageHtml(pdfPageData);
      tempContainer.appendChild(pageDiv);
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true, windowWidth: pageDiv.scrollWidth, windowHeight: pageDiv.scrollHeight });
      renderedCanvases.push({ type: 'content', canvas });
      tempContainer.removeChild(pageDiv);

      if (pageData.isStartOfChapter && pageData.chapterTitle) {
        chapterPdfPageMap.push({ title: pageData.chapterTitle, estimatedPage: currentContentPdfPage }); // Store PDF page number
      }
    }
    
    // 3. Render Table of Contents Page (if chapters exist)
    if (chapterPdfPageMap.length > 0) {
      const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: chapterPdfPageMap }, true);
      tempContainer.appendChild(tocPageDiv);
      const canvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true, windowWidth: tocPageDiv.scrollWidth, windowHeight: tocPageDiv.scrollHeight });
      
      // Insert TOC after cover (if cover exists) or at the beginning
      const tocInsertIndex = book.coverImage ? 1 : 0;
      renderedCanvases.splice(tocInsertIndex, 0, { type: 'toc', canvas });
      tempContainer.removeChild(tocPageDiv);
    }

    // 4. Add all rendered canvases to PDF
    renderedCanvases.forEach((render, index) => {
      if (index > 0) pdf.addPage(); // Add new page for subsequent canvases
      const canvas = render.canvas;
      // Calculate image dimensions to fit A4 page with margins, maintaining aspect ratio
      const canvasAspectRatio = canvas.height / canvas.width;
      let imgHeightPt = usableWidthPt * canvasAspectRatio;
      let imgWidthPt = usableWidthPt;

      if (imgHeightPt > (pdfHeightPt - 2 * marginPt)) {
        imgHeightPt = pdfHeightPt - 2 * marginPt;
        imgWidthPt = imgHeightPt / canvasAspectRatio;
      }
      
      const xOffset = marginPt + (usableWidthPt - imgWidthPt) / 2; // Center image if narrower than usableWidth
      const yOffset = marginPt;

      pdf.addImage(canvas.toDataURL('image/png', 0.92), 'PNG', xOffset, yOffset, imgWidthPt, imgHeightPt);
    });

    document.body.removeChild(tempContainer); // Clean up temp container
    pdf.save(`${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'libro_escribalibro'}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };

  const handleExportToTxt = () => {
    if (!book.content && !book.title && !book.author) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como TXT.", variant: "destructive" });
      return;
    }

    let txtContent = `Título: ${book.title || 'Sin Título'}\n`;
    txtContent += `Autor: ${book.author || 'Desconocido'}\n\n`;
    txtContent += "Contenido:\n";
    txtContent += book.content.replace(/!\[.*?\]\(.*?\)/g, '[Imagen Omitida]'); // Remove image markdown

    const filename = `${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'libro'}.txt`;
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
    if (!book.content && !book.title && !book.author) {
      toast({ title: "Contenido Vacío", description: "No hay suficiente información para exportar como HTML.", variant: "destructive" });
      return;
    }

    let htmlString = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${book.title || 'Libro'}</title>
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

    if (book.coverImage) {
      htmlString += `  <img src="${book.coverImage}" alt="Portada del Libro" class="cover-image" data-ai-hint="book cover" />\n`;
    }
    htmlString += `  <h1 class="book-title">${book.title || 'Libro sin Título'}</h1>\n`;
    htmlString += `  <h3 class="author-name"><em>por ${book.author || 'Autor Desconocido'}</em></h3>\n`;

    if (book.tableOfContents && book.tableOfContents.length > 0) {
      htmlString += '  <div class="toc page-break-before">\n';
      htmlString += '    <h2>Índice</h2>\n';
      htmlString += '    <ul>\n';
      book.tableOfContents.forEach(entry => {
        htmlString += `      <li>${entry.title}</li>\n`; // Simple list, no internal links for static HTML
      });
      htmlString += '    </ul>\n';
      htmlString += '  </div>\n';
    }

    const contentParagraphs = book.content
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

    const filename = `${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'libro'}.html`;
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


  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans">
      <header className="mb-6 md:mb-8 pb-4 border-b border-border">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-bold text-primary">EscribaLibro</h1>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleOpenBook} variant="outline" size="sm">
              <FolderOpen className="mr-2 h-4 w-4" /> Abrir Libro
            </Button>
            <Button onClick={handleSaveData} variant="outline" size="sm">
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
                  {/* <File className="mr-2 h-4 w-4" /> For future DOCX icon */}
                  Exportar como DOCX (Próximamente)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm md:text-base text-muted-foreground mt-2 text-center sm:text-left container mx-auto">Crea tu historia, hermosamente.</p>
      </header>

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
          {/* Columna Izquierda: Paneles de Pestañas */}
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
                    value={book.content}
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
                  {book.tableOfContents && book.tableOfContents.length > 0 ? (
                    <ScrollArea className="h-[300px] md:h-[400px] pr-3 border rounded-md p-3">
                      <ul className="space-y-2">
                        {book.tableOfContents.map((entry, idx) => (
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
                      id="bookTitleInput" value={book.title} onChange={(e) => handleBookDetailsChange('title', e.target.value)}
                      placeholder="El Título de tu Gran Libro" className="mt-1 text-sm p-2 shadow-inner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authorName" className="text-sm font-medium">Nombre del Autor/a</Label>
                    <Input
                      id="authorName" value={book.author} onChange={(e) => handleBookDetailsChange('author', e.target.value)}
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
                      {book.coverImage && (
                        <Button variant="outline" size="sm" onClick={() => setBook(prev => ({...prev, coverImage: null}))} className="text-xs">Quitar Imagen</Button>
                      )}
                    </div>
                    {book.coverImage && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] w-full max-w-[240px] mx-auto bg-muted flex flex-col items-center justify-center shadow-inner overflow-hidden relative">
                         <NextImage src={book.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-end p-3 text-center z-10">
                           <h3 className="text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.7)] break-words leading-tight">{book.title}</h3>
                           <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] break-words"><em>{book.author}</em></p>
                         </div>
                       </div>
                    )}
                    {!book.coverImage && (
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

          {/* Columna Derecha: Área de Vista Previa */}
          <div className="w-full lg:w-1/2 lg:sticky lg:top-8">
            <Card className="shadow-lg h-full">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2 h-5 w-5 text-primary" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Observa cómo tu libro toma forma. La paginación es una aproximación.</CardDescription>
              </CardHeader>
              <CardContent
                className="overflow-y-auto p-3 md:p-4"
                style={{
                  maxHeight: 'calc(100vh - 16rem)', // Adjust based on header/footer height
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  borderRadius: 'var(--radius)',
                }}
              >
                {activeTab === 'editor' || activeTab === 'formatting' || activeTab === 'index' ? (
                  paginatedPreview.length > 0 ? paginatedPreview.map(page => (
                    <div
                      key={`page-preview-${page.pageNumber}`}
                      className="page-simulation-wrapper mx-auto my-4 prose max-w-none" // prose for basic styling, max-w-none to override width constraints
                      style={simulatedPageStyle}
                    >
                      {/* Header de Página Simulado */}
                      <div className="page-header text-xs py-1.5 px-2.5 border-b" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: `hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground-rgb')}, 0.3)`}}>
                        <span className="float-left truncate max-w-[45%]">{page.headerLeft}</span>
                        <span className="float-right truncate max-w-[45%]">{page.headerRight}</span>
                        <div style={{clear: 'both'}}></div> {/* Clear floats */}
                      </div>

                      {/* Contenido de Página Simulado */}
                      <div className="page-content-area flex-grow overflow-hidden py-2 px-1" style={{lineHeight: formattingOptions.lineHeight, fontSize: `${formattingOptions.fontSize}px`}}>
                        {page.contentElements.length > 0 ? page.contentElements : <p className="italic text-center" style={{opacity: 0.6, minHeight: '2em'}}>&nbsp;</p>}
                      </div>

                      {/* Pie de Página Simulado */}
                      <div className="page-footer text-xs py-1.5 px-2.5 border-t text-center" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: `hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground-rgb')}, 0.3)`}}>
                        {page.footerCenter}
                      </div>
                    </div>
                  )) : (
                     // Estado vacío para la vista previa del contenido
                    <div
                      className="prose max-w-none border rounded-md min-h-[300px] shadow-inner flex flex-col justify-center items-center text-center p-6"
                      style={{
                        fontFamily: formattingOptions.fontFamily,
                        fontSize: `${formattingOptions.fontSize}px`,
                        color: formattingOptions.textColor,
                        backgroundColor: formattingOptions.pageBackgroundColor, // Use page background for consistency
                        lineHeight: formattingOptions.lineHeight,
                      }}
                    >
                      <ImageIcon size={48} className="text-muted-foreground opacity-50 mb-4" />
                      <h3 className="text-lg font-semibold mb-1">{book.title}</h3>
                      <p className="text-sm italic mb-3">por {book.author}</p>
                      <p className="text-xs italic text-muted-foreground">
                        La vista previa del contenido aparecerá aquí paginada.
                      </p>
                      { (book.content === null || book.content.trim() === "") && 
                        <p className="text-xs mt-2 text-muted-foreground">(Comienza a escribir en el editor o añade capítulos para ver la vista previa)</p>
                      }
                    </div>
                  )
                ) : activeTab === 'cover' ? (
                  // Vista Previa de Portada
                  <div className="p-3 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col items-center justify-center shadow-lg overflow-hidden relative" style={{backgroundColor: formattingOptions.pageBackgroundColor}}>
                    {book.coverImage ? (
                      <NextImage src={book.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover"/>
                    ) : (
                      <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon size={60} className="opacity-50 mb-2" />
                        <p className="text-sm">Sin imagen de portada</p>
                      </div>
                    )}
                     {/* Overlay de Texto para Portada */}
                     <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-end p-4 md:p-6 text-center z-10">
                      <h2 className="text-xl md:text-2xl font-bold text-white [text-shadow:1px_1px_3px_rgba(0,0,0,0.8)] mb-1 md:mb-2 leading-tight">{book.title}</h2>
                      <p className="text-base md:text-lg text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)]"><em>{book.author}</em></p>
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

