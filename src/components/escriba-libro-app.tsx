
"use client";

import { useState, useEffect, type ChangeEvent, type CSSProperties } from 'react';
import type { Book, ChapterEntry } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image'; // Keep for preview
import { UploadCloud, BookOpen, Type, User, Download, Settings, Palette, FileText, FileCode, Info, Image as ImageIcon, Paintbrush, Save, Loader2, ListOrdered } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
// import ReactDOMServer from 'react-dom/server'; // Not strictly needed if constructing HTML strings


interface FormattingOptions {
  fontFamily: string;
  fontSize: number; // in px
  textColor: string;
  previewBackgroundColor: string; // For the area around pages in preview
  pageBackgroundColor: string; // For individual page backgrounds (preview & PDF)
  previewPadding: number; // in px
  lineHeight: number;
}

interface PagePreviewData {
  pageNumber: number;
  headerLeft: string; // Book title
  headerRight: string; // Current chapter title
  contentElements: JSX.Element[]; // For web preview
  rawContentLines: string[]; // Store raw lines for PDF generation
  footerCenter: string; // Page number
  isStartOfChapter?: boolean;
  chapterTitle?: string;
}

// Constants for pagination estimation
const PAGE_CONTENT_TARGET_HEIGHT_PX = 680;
const PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX = 70;
const IMAGE_LINE_EQUIVALENT = 15; // How many text lines an image is roughly equivalent to

// LocalStorage keys
const LOCALSTORAGE_BOOK_KEY = 'escribaLibro_book_v2';
const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting_v2';

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
  let currentChapterForHeader = "Introducción"; // Default if no chapters yet
  let linesAccumulatedOnCurrentPage = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isChapterHeading = line.startsWith('## ');
    let lineCost = 1;
    if (/!\[(.*?)\]\((.*?)\)/.test(line)) { // Image check
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

  useEffect(() => {
    setMounted(true);
    try {
      const savedBook = localStorage.getItem(LOCALSTORAGE_BOOK_KEY);
      if (savedBook) {
        const parsedBook = JSON.parse(savedBook);
        setBook({...parsedBook, tableOfContents: parsedBook.tableOfContents || [] });
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
      toast({ title: "Error", description: "No se pudieron cargar los datos guardados.", variant: "destructive" });
    }
  }, [toast]);

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
      setBook(prev => ({ ...prev, tableOfContents: newToc }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.content, book.title, formattingOptions, mounted]);


  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-screen p-8">
        <Card className="w-full max-w-4xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Cargando EscribaLibro...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-muted rounded w-1/3 mx-auto"></div>
              <div className="flex gap-6">
                <div className="w-1/2 space-y-4">
                  <div className="h-40 bg-muted rounded"></div>
                  <div className="h-10 bg-muted rounded"></div>
                </div>
                <div className="w-1/2 h-60 bg-muted rounded"></div>
              </div>
            </div>
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
    pageDiv.style.width = '750px';
    pageDiv.style.padding = `${formattingOptions.previewPadding}px`;
    pageDiv.style.fontFamily = formattingOptions.fontFamily;
    pageDiv.style.fontSize = `${formattingOptions.fontSize}px`;
    pageDiv.style.color = formattingOptions.textColor;
    pageDiv.style.backgroundColor = formattingOptions.pageBackgroundColor;
    pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.minHeight = `${(750 * 841.89) / 595.28 - 2 * formattingOptions.previewPadding}px`;
    pageDiv.style.boxSizing = 'border-box';

    if (isToc && 'type' in pageData && pageData.type === 'toc') {
      const tocHeader = document.createElement('h2');
      tocHeader.textContent = "Índice";
      tocHeader.style.textAlign = 'center';
      tocHeader.style.fontSize = '1.5em';
      tocHeader.style.fontWeight = 'bold';
      tocHeader.style.margin = '20px 0';
      pageDiv.appendChild(tocHeader);

      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.paddingLeft = '20px';
      pageData.entries.forEach(entry => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '5px 0';
        li.style.borderBottom = `1px dotted hsla(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()}, 0.5)`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = entry.title;
        titleSpan.style.marginRight = '10px';
        titleSpan.style.flexGrow = '1';

        const pageSpan = document.createElement('span');
        pageSpan.textContent = String(entry.estimatedPage);
        pageSpan.style.marginLeft = '10px';

        li.appendChild(titleSpan);
        li.appendChild(pageSpan);
        ul.appendChild(li);
      });
      pageDiv.appendChild(ul);
    } else if (!isToc && 'rawContentLines' in pageData) {
      const typedPageData = pageData as PagePreviewData;
      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = '0.75em';
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
          imgContainer.style.margin = '1em 0';
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = altText || 'Imagen insertada';
          img.style.maxWidth = '80%';
          img.style.maxHeight = '300px';
          img.style.height = 'auto';
          img.style.borderRadius = '4px';
          img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          imgContainer.appendChild(img);
          if (altText) {
            const caption = document.createElement('p');
            caption.textContent = altText;
            caption.style.fontSize = '0.8em'; caption.style.fontStyle = 'italic'; caption.style.opacity = '0.8'; caption.style.marginTop = '0.25em';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
        } else {
          const p = document.createElement('p');
          p.innerHTML = line.trim() === '' ? '&nbsp;' : line;
          p.style.margin = "0.5em 0";
          if (line.startsWith('## ')) {
            p.style.fontSize = '1.5em'; p.style.fontWeight = 'bold'; p.style.marginTop = '1em'; p.style.marginBottom = '0.5em';
            p.textContent = line.substring(3).trim();
          }
          contentAreaDiv.appendChild(p);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      const footerDiv = document.createElement('div');
      footerDiv.style.textAlign = 'center';
      footerDiv.style.fontSize = '0.75em';
      footerDiv.style.opacity = '0.7';
      footerDiv.style.paddingTop = '5px';
      footerDiv.style.borderTop = `1px solid ${formattingOptions.textColor}`;
      footerDiv.style.marginTop = 'auto';
      footerDiv.textContent = typedPageData.footerCenter; // This is now `Página N`
      pageDiv.appendChild(footerDiv);
    }
    return pageDiv;
  };


  const handleExportToPdf = async () => {
    setIsExportingPdf(true);
    toast({ title: "Exportación a PDF Iniciada", description: "Generando tu libro, por favor espera..." });

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pdfWidth = 595.28;
    const margin = 40;
    const usableWidth = pdfWidth - 2 * margin;

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.width = '750px';
    document.body.appendChild(tempContainer);

    const renderedCanvases: { type: 'cover' | 'toc' | 'content', canvas: HTMLCanvasElement }[] = [];
    const chapterPdfPageMap: ChapterEntry[] = [];

    if (book.coverImage) {
      const coverDiv = document.createElement('div');
      coverDiv.style.width = '750px'; coverDiv.style.height = `${(750 * 3) / 2}px`;
      coverDiv.style.display = 'flex'; coverDiv.style.flexDirection = 'column'; coverDiv.style.alignItems = 'center'; coverDiv.style.justifyContent = 'center';
      coverDiv.style.position = 'relative'; coverDiv.style.backgroundColor = formattingOptions.pageBackgroundColor; coverDiv.style.overflow = 'hidden';
      const img = document.createElement('img'); img.src = book.coverImage;
      img.style.position = 'absolute'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
      coverDiv.appendChild(img);
      const textOverlay = document.createElement('div');
      textOverlay.style.position = 'absolute'; textOverlay.style.inset = '0'; textOverlay.style.display = 'flex'; textOverlay.style.flexDirection = 'column';
      textOverlay.style.alignItems = 'center'; textOverlay.style.justifyContent = 'flex-end'; textOverlay.style.padding = '40px';
      textOverlay.style.textAlign = 'center'; textOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)';
      textOverlay.style.zIndex = '10';
      const titleEl = document.createElement('h2'); titleEl.textContent = book.title;
      titleEl.style.fontFamily = formattingOptions.fontFamily; titleEl.style.fontSize = '36px'; titleEl.style.fontWeight = 'bold'; titleEl.style.color = 'white';
      titleEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.7)'; titleEl.style.marginBottom = '10px';
      textOverlay.appendChild(titleEl);
      const authorEl = document.createElement('p'); authorEl.textContent = book.author;
      authorEl.style.fontFamily = formattingOptions.fontFamily; authorEl.style.fontSize = '24px'; authorEl.style.fontStyle = 'italic'; authorEl.style.color = '#e0e0e0';
      authorEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
      textOverlay.appendChild(authorEl); coverDiv.appendChild(textOverlay);
      tempContainer.appendChild(coverDiv);
      const canvas = await html2canvas(coverDiv, { scale: 2, useCORS: true });
      renderedCanvases.push({ type: 'cover', canvas });
      tempContainer.removeChild(coverDiv);
    }

    let currentContentPdfPage = 0;
    for (const pageData of paginatedPreview) {
      currentContentPdfPage++;
      const pdfPageData = { ...pageData, footerCenter: `Página ${currentContentPdfPage}` };
      const pageDiv = createPdfPageHtml(pdfPageData);
      tempContainer.appendChild(pageDiv);
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true });
      renderedCanvases.push({ type: 'content', canvas });
      tempContainer.removeChild(pageDiv);

      if (pageData.isStartOfChapter && pageData.chapterTitle) {
        chapterPdfPageMap.push({ title: pageData.chapterTitle, estimatedPage: currentContentPdfPage });
      }
    }

    if (chapterPdfPageMap.length > 0) {
      const tocPageDiv = createPdfPageHtml({ type: 'toc', title: 'Índice', entries: chapterPdfPageMap }, true);
      tempContainer.appendChild(tocPageDiv);
      const canvas = await html2canvas(tocPageDiv, { scale: 2, useCORS: true });
      
      const tocInsertIndex = book.coverImage ? 1 : 0;
      renderedCanvases.splice(tocInsertIndex, 0, { type: 'toc', canvas });
      tempContainer.removeChild(tocPageDiv);
    }

    renderedCanvases.forEach((render, index) => {
      if (index > 0) pdf.addPage();
      const canvas = render.canvas;
      const imgProps = pdf.getImageProperties(canvas);
      const imgHeight = (imgProps.height * usableWidth) / imgProps.width;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, usableWidth, imgHeight);
    });

    document.body.removeChild(tempContainer);
    pdf.save(`${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'ebook'}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "¡PDF Exportado!",
      description: "Tu libro ha sido exportado como PDF.",
      duration: 3000,
    });
  };


  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans">
      <header className="mb-6 md:mb-10 text-center">
        <h1 className="text-3xl md:text-5xl font-bold" style={{ color: 'hsl(var(--primary))' }}>EscribaLibro</h1>
        <p className="text-base md:text-lg text-muted-foreground mt-1 md:mt-2">Crea tu historia, hermosamente.</p>
         <Button onClick={handleSaveData} variant="outline" className="mt-4">
          <Save className="mr-2 h-4 w-4" /> Guardar Progreso
        </Button>
      </header>

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
        <TabsList className="mx-auto mb-6 shadow-sm">
          <TabsTrigger value="editor" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <BookOpen className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Editor
          </TabsTrigger>
           <TabsTrigger value="index" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <ListOrdered className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Índice
          </TabsTrigger>
          <TabsTrigger value="formatting" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <Paintbrush className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Formato
          </TabsTrigger>
          <TabsTrigger value="cover" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <Palette className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Portada
          </TabsTrigger>
          <TabsTrigger value="export" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <Download className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Exportar
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-1 flex-col md:flex-row gap-6">
          {/* Editing Area Column*/}
          <div className="w-full md:w-1/2 flex flex-col gap-6">
            <TabsContent value="editor" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookOpen className="mr-2" />Editor de Contenido</CardTitle>
                  <CardDescription>Escribe y formatea el contenido de tu libro. Usa `## Título del Capítulo` para nuevos capítulos.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 md:p-6">
                  <Label htmlFor="bookContent" className="mb-2 font-semibold">Contenido del Libro</Label>
                  <Textarea
                    id="bookContent"
                    value={book.content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Empieza a escribir tu obra maestra... Usa `## Título del Capítulo` para definir nuevos capítulos."
                    className="flex-1 w-full min-h-[250px] md:min-h-[300px] text-sm md:text-base resize-y p-3 rounded-md shadow-inner"
                  />
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs md:text-sm transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insertar Imagen
                    </Label>
                    <Input id="insertImageContent" type="file" accept="image/*" onChange={handleImageInsertToContent} className="hidden" />
                    <p className="text-xs text-muted-foreground mt-1">Las imágenes se añaden como enlaces estilo Markdown.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="index" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><ListOrdered className="mr-2" />Índice</CardTitle>
                  <CardDescription>Índice generado automáticamente basado en los marcadores `## Título del Capítulo`. Los números de página son estimaciones para la vista previa.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {book.tableOfContents && book.tableOfContents.length > 0 ? (
                    <ScrollArea className="h-[300px] pr-4">
                      <ul className="space-y-2">
                        {book.tableOfContents.map((entry, idx) => (
                          <li key={idx} className="flex justify-between items-center text-sm border-b border-dashed pb-1">
                            <span className="truncate pr-2">{entry.title}</span>
                            <span className="text-muted-foreground font-mono">{entry.estimatedPage}</span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  ) : (
                    <p className="text-muted-foreground italic">Aún no se han definido capítulos. Usa `## Título del Capítulo` en el editor para crear capítulos para el índice.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="formatting" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl">
                    <Paintbrush className="mr-2" /> Opciones de Formato
                  </CardTitle>
                  <CardDescription>Personaliza la apariencia del contenido de tu libro en la vista previa y el PDF.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  <div>
                    <Label htmlFor="fontFamily">Fuente</Label>
                    <Select onValueChange={(value) => handleFormattingChange('fontFamily', value)} value={formattingOptions.fontFamily}>
                      <SelectTrigger id="fontFamily" className="mt-1">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fontSize">Tamaño de Fuente (px)</Label>
                      <Input
                        id="fontSize"
                        type="number"
                        value={formattingOptions.fontSize}
                        onChange={(e) => handleFormattingChange('fontSize', Math.max(8, parseInt(e.target.value, 10) || formattingOptions.fontSize))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lineHeight">Altura de Línea</Label>
                      <Input
                        id="lineHeight"
                        type="number"
                        value={formattingOptions.lineHeight}
                        step="0.1"
                        min="0.5"
                        onChange={(e) => handleFormattingChange('lineHeight', parseFloat(e.target.value) || formattingOptions.lineHeight)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="textColor">Color del Texto</Label>
                      <Input
                        id="textColor"
                        type="color"
                        value={formattingOptions.textColor}
                        onChange={(e) => handleFormattingChange('textColor', e.target.value)}
                        className="mt-1 h-10 p-1 w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pageBackgroundColor">Fondo de Página</Label>
                      <Input
                        id="pageBackgroundColor"
                        type="color"
                        value={formattingOptions.pageBackgroundColor}
                        onChange={(e) => handleFormattingChange('pageBackgroundColor', e.target.value)}
                        className="mt-1 h-10 p-1 w-full"
                      />
                    </div>
                     <div>
                      <Label htmlFor="previewAreaBackground">Fondo del Área</Label>
                      <Input
                        id="previewAreaBackground"
                        type="color"
                        value={formattingOptions.previewBackgroundColor}
                        onChange={(e) => handleFormattingChange('previewBackgroundColor', e.target.value)}
                        className="mt-1 h-10 p-1 w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="previewPadding">Relleno de Página (px)</Label>
                    <Input
                      id="previewPadding"
                      type="number"
                      value={formattingOptions.previewPadding}
                      min="0"
                      onChange={(e) => handleFormattingChange('previewPadding', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cover" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Palette className="mr-2" />Diseñador de Portada</CardTitle>
                  <CardDescription>Personaliza la portada de tu libro.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  <div>
                    <Label htmlFor="bookTitleInput" className="font-semibold">Título del Libro</Label>
                    <Input
                      id="bookTitleInput"
                      value={book.title}
                      onChange={(e) => handleBookDetailsChange('title', e.target.value)}
                      placeholder="El Título de tu Libro"
                      className="mt-1 text-sm md:text-base p-2 shadow-inner"
                    />
                  </div>
                  <div>
                    <Label htmlFor="authorName" className="font-semibold">Nombre del Autor</Label>
                    <Input
                      id="authorName"
                      value={book.author}
                      onChange={(e) => handleBookDetailsChange('author', e.target.value)}
                      placeholder="Nombre del Autor"
                      className="mt-1 text-sm md:text-base p-2 shadow-inner"
                    />
                  </div>
                  <div>
                    <Label className="font-semibold">Imagen de Portada</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Label htmlFor="coverImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs md:text-sm transition-colors duration-150">
                        <UploadCloud className="mr-2 h-4 w-4" /> Subir Imagen
                      </Label>
                       <Input id="coverImageUploadFile" type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" />
                      {book.coverImage && (
                        <Button variant="outline" size="sm" onClick={() => setBook(prev => ({...prev, coverImage: null}))} className="text-xs md:text-sm">Quitar</Button>
                      )}
                    </div>
                    {book.coverImage && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] max-w-[200px] mx-auto bg-muted flex flex-col items-center justify-center shadow-inner overflow-hidden relative">
                         <NextImage src={book.coverImage} alt="Miniatura de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col items-center justify-end p-2 text-center z-10">
                           <h3 className="text-sm font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.6)] break-words">{book.title}</h3>
                           <p className="text-xs text-gray-200 [text-shadow:1px_1px_1px_rgba(0,0,0,0.4)] break-words"><em>{book.author}</em></p>
                         </div>
                       </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="export" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Download className="mr-2" />Opciones de Exportación</CardTitle>
                  <CardDescription>Descarga tu libro en varios formatos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 md:p-6">
                  <Button className="w-full justify-start text-sm md:text-base" onClick={handleExportToPdf} variant="outline" disabled={isExportingPdf}>
                    {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} />}
                    {isExportingPdf ? 'Exportando PDF...' : 'Exportar como PDF'}
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" variant="outline" disabled>
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Exportar como DOCX (Próximamente)
                  </Button>
                   <Button className="w-full justify-start text-sm md:text-base" variant="outline" disabled>
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Exportar como TXT (Próximamente)
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" variant="outline" disabled>
                    <FileCode className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Exportar como HTML (Próximamente)
                  </Button>
                  <div className="pt-2 text-xs md:text-sm text-muted-foreground flex items-start">
                    <Info size={16} className="mr-2 mt-0.5 shrink-0" />
                    <span>La exportación a PDF incluye portada y Tabla de Contenido. La paginación en la vista previa y en la TdC del PDF se basa en el flujo del contenido.</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Preview Area Column */}
          <div className="w-full md:w-1/2">
            <Card className="shadow-lg h-full sticky top-8">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2" />Vista Previa en Vivo</CardTitle>
                <CardDescription>Mira cómo tu libro toma forma en tiempo real. La paginación es una aproximación.</CardDescription>
              </CardHeader>
              <CardContent
                className="overflow-y-auto"
                style={{
                  maxHeight: 'calc(100vh - 12rem)',
                  backgroundColor: formattingOptions.previewBackgroundColor,
                  padding: `${formattingOptions.previewPadding / 2}px ${formattingOptions.previewPadding}px`,
                  borderRadius: 'var(--radius)',
                }}
              >
                {activeTab === 'editor' || activeTab === 'export' || activeTab === 'formatting' || activeTab === 'index' ? (
                  paginatedPreview.length > 0 ? paginatedPreview.map(page => (
                    <div
                      key={`page-preview-${page.pageNumber}`}
                      className="page-simulation-wrapper mx-auto my-4 prose max-w-none"
                      style={simulatedPageStyle}
                    >
                      <div className="page-header text-xs py-1 px-2 border-b" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: formattingOptions.textColor}}>
                        <span className="float-left truncate max-w-[45%]">{page.headerLeft}</span>
                        <span className="float-right truncate max-w-[45%]">{page.headerRight}</span>
                        <div style={{clear: 'both'}}></div>
                      </div>

                      <div className="page-content-area flex-grow overflow-hidden py-2" style={{lineHeight: formattingOptions.lineHeight, fontSize: `${formattingOptions.fontSize}px`}}>
                        {page.contentElements.length > 0 ? page.contentElements : <p className="italic" style={{opacity: 0.6}}>&nbsp;</p>}
                      </div>

                      <div className="page-footer text-xs py-1 px-2 border-t text-center" style={{color: formattingOptions.textColor, opacity: 0.7, flexShrink: 0, borderColor: formattingOptions.textColor}}>
                        {page.footerCenter}
                      </div>
                    </div>
                  )) : (
                    <div
                      className="prose max-w-none border rounded-md min-h-[200px] shadow-inner flex flex-col justify-center items-center"
                      style={{
                        fontFamily: formattingOptions.fontFamily,
                        fontSize: `${formattingOptions.fontSize}px`,
                        color: formattingOptions.textColor,
                        backgroundColor: formattingOptions.pageBackgroundColor,
                        padding: `${formattingOptions.previewPadding}px`,
                        lineHeight: formattingOptions.lineHeight,
                      }}
                    >
                      <h2 className="text-xl md:text-2xl font-bold mb-1 text-center">{book.title}</h2>
                      <p className="text-xs md:text-sm text-center italic mb-4">por {book.author}</p>
                      <p className="italic text-center" style={{opacity: 0.6}}>La vista previa del contenido aparecerá aquí, paginada...</p>
                      { (book.content === null || book.content.trim() === "") && <p className="text-xs text-center mt-2">(Comienza a escribir en el editor o añade capítulos)</p>}
                    </div>
                  )
                ) : activeTab === 'cover' ? (
                  <div className="p-2 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col items-center justify-center shadow-lg overflow-hidden relative" style={{backgroundColor: formattingOptions.pageBackgroundColor}}>
                    {book.coverImage ? (
                      <NextImage src={book.coverImage} alt="Vista Previa de Portada" layout="fill" objectFit="cover" data-ai-hint="book cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageIcon size={48} className="text-muted-foreground opacity-50" />
                      </div>
                    )}
                     <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-end p-4 md:p-6 text-center z-10">
                      <h2 className="text-2xl md:text-3xl font-bold text-white [text-shadow:1px_1px_3px_rgba(0,0,0,0.7)] mb-1 md:mb-2">{book.title}</h2>
                      <p className="text-lg md:text-xl text-gray-200 [text-shadow:1px_1px_2px_rgba(0,0,0,0.5)]"><em>{book.author}</em></p>
                    </div>
                  </div>
                ) : null}
              </CardContent>
               { (activeTab === 'editor' || activeTab === 'export' || activeTab === 'formatting' || activeTab === 'index') && paginatedPreview.length > 0 && (
                <CardFooter className="text-xs text-muted-foreground justify-center py-2 border-t">
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

    