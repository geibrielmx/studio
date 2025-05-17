
"use client";

import { useState, useEffect, type ChangeEvent, type CSSProperties } from 'react';
import type { Book } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image'; // Keep for preview
import { UploadCloud, BookOpen, Type, User, Download, Settings, Palette, FileText, FileCode, Info, Image as ImageIcon, Paintbrush, Save, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ReactDOMServer from 'react-dom/server';


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
  footerCenter: string; // Page number
}

// Constants for pagination estimation
const PAGE_CONTENT_TARGET_HEIGHT_PX = 680; 
const PAGE_HEADER_FOOTER_ESTIMATED_HEIGHT_PX = 70; 
const IMAGE_LINE_EQUIVALENT = 15; 

// LocalStorage keys
const LOCALSTORAGE_BOOK_KEY = 'escribaLibro_book';
const LOCALSTORAGE_FORMATTING_KEY = 'escribaLibro_formatting';

function createPageContentElements(
  lines: string[],
  pageKeyPrefix: string,
  formattingOptions: FormattingOptions // Keep for consistency, though not directly used for style here
): JSX.Element[] {
  return lines.map((paragraph, index) => {
    const imageMatch = paragraph.match(/!\[(.*?)\]\((.*?)\)/);
    if (imageMatch) {
      const [, altText, imgSrc] = imageMatch;
      return (
        <div key={`${pageKeyPrefix}-line-${index}`} className="my-3 md:my-4 text-center">
          <NextImage
            src={imgSrc}
            alt={altText || 'Inserted image'}
            width={300} // Example width, adjust as needed or make responsive
            height={200} // Example height
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
}

function createPageObject(
  pageNumber: number,
  bookTitle: string,
  chapterTitle: string,
  lines: string[],
  formattingOptions: FormattingOptions
): PagePreviewData {
  const pageKeyPrefix = `page-${pageNumber}`;
  return {
    pageNumber,
    headerLeft: bookTitle,
    headerRight: chapterTitle,
    contentElements: createPageContentElements(lines, pageKeyPrefix, formattingOptions),
    footerCenter: `Page ${pageNumber}`,
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
  let currentChapterTitle = "Introduction"; 
  let linesAccumulatedOnCurrentPage = 0;
  let chapterTitleForPageHeader = currentChapterTitle;


  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    let lineCost = 1;
    const isImage = /!\[(.*?)\]\((.*?)\)/.test(line);
    if (isImage) {
      lineCost = IMAGE_LINE_EQUIVALENT;
    }

    const isChapterHeading = line.startsWith('## ');

    if (isChapterHeading) {
      if (currentPageLines.length > 0) {
        output.push(createPageObject(currentPageNumber, book.title, chapterTitleForPageHeader, currentPageLines, formattingOptions));
        currentPageLines = [];
        linesAccumulatedOnCurrentPage = 0;
        currentPageNumber++;
      }
      currentChapterTitle = line.substring(3).trim();
      chapterTitleForPageHeader = currentChapterTitle; 
      currentPageLines.push(line); 
      linesAccumulatedOnCurrentPage += lineCost; 
      if (i === allLines.length - 1) {
         output.push(createPageObject(currentPageNumber, book.title, chapterTitleForPageHeader, currentPageLines, formattingOptions));
         currentPageLines = []; 
      }
      continue; 
    }
    
    if (linesAccumulatedOnCurrentPage + lineCost > linesPerPage && currentPageLines.length > 0) {
      output.push(createPageObject(currentPageNumber, book.title, chapterTitleForPageHeader, currentPageLines, formattingOptions));
      currentPageLines = [];
      linesAccumulatedOnCurrentPage = 0;
      currentPageNumber++;
    }
    
    currentPageLines.push(line);
    linesAccumulatedOnCurrentPage += lineCost;
  }

  if (currentPageLines.length > 0) {
    output.push(createPageObject(currentPageNumber, book.title, chapterTitleForPageHeader, currentPageLines, formattingOptions));
  }
  
  if (output.length === 0 && book.content.trim() === "") { 
    output.push(createPageObject(1, book.title, "Start of Book", [""], formattingOptions));
  }

  return output;
}


export default function EscribaLibroApp() {
  const { toast } = useToast();
  const [book, setBook] = useState<Book>({
    title: 'Untitled Book',
    author: 'Unknown Author',
    content: '',
    coverImage: null,
  });

  const [formattingOptions, setFormattingOptions] = useState<FormattingOptions>({
    fontFamily: 'var(--font-sans)',
    fontSize: 16,
    textColor: 'hsl(var(--foreground))',
    previewBackgroundColor: 'hsl(var(--background))', // Overall area
    pageBackgroundColor: 'hsl(var(--card))', // Individual pages
    previewPadding: 24,
    lineHeight: 1.6,
  });

  const [activeTab, setActiveTab] = useState('editor');
  const [mounted, setMounted] = useState(false);
  const [paginatedPreview, setPaginatedPreview] = useState<PagePreviewData[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const savedBook = localStorage.getItem(LOCALSTORAGE_BOOK_KEY);
      if (savedBook) {
        setBook(JSON.parse(savedBook));
      }
      const savedFormatting = localStorage.getItem(LOCALSTORAGE_FORMATTING_KEY);
      if (savedFormatting) {
        setFormattingOptions(JSON.parse(savedFormatting));
      } else {
        // Initialize from CSS variables if no saved formatting
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
      console.error("Failed to load data from localStorage", error);
    }
  }, []);

  // Save book data to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LOCALSTORAGE_BOOK_KEY, JSON.stringify(book));
    }
  }, [book, mounted]);

  // Save formatting options to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LOCALSTORAGE_FORMATTING_KEY, JSON.stringify(formattingOptions));
    }
  }, [formattingOptions, mounted]);

  // Regenerate preview when book or formatting changes
  useEffect(() => {
    if (mounted) {
      const newPreview = generatePagePreviews(book, formattingOptions);
      setPaginatedPreview(newPreview);
    }
  }, [book, formattingOptions, mounted]);


  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-screen p-8">
        <Card className="w-full max-w-4xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Loading EscribaLibro...</CardTitle>
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
      title: "Progress Saved!",
      description: "Your book data and formatting preferences have been saved locally.",
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
      const imageName = event.target.files[0].name || 'image';
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
    backgroundColor: formattingOptions.pageBackgroundColor, // Use specific page background
    fontFamily: formattingOptions.fontFamily,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden', // Important for html2canvas
  };

  const handleExportToPdf = async () => {
    setIsExportingPdf(true);
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'pt',
      format: 'a4', // 595.28 x 841.89 pt
    });
    const pdfWidth = 595.28;
    const pdfHeight = 841.89;
    const margin = 40; // points
    const usableWidth = pdfWidth - 2 * margin;
    // const usableHeight = pdfHeight - 2 * margin; // Less critical if image scales height

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px'; // Off-screen
    tempContainer.style.width = '750px'; // Fixed width for rendering quality
    document.body.appendChild(tempContainer);

    // 1. Add Cover Page if exists
    if (book.coverImage) {
      const coverDiv = document.createElement('div');
      coverDiv.style.width = '750px'; // Match tempContainer width
      coverDiv.style.height = `${(750 * 3) / 2}px`; // Aspect ratio 2:3
      coverDiv.style.display = 'flex';
      coverDiv.style.flexDirection = 'column';
      coverDiv.style.alignItems = 'center';
      coverDiv.style.justifyContent = 'center';
      coverDiv.style.position = 'relative';
      coverDiv.style.backgroundColor = formattingOptions.pageBackgroundColor; // Or a specific cover bg
      coverDiv.style.overflow = 'hidden';

      const img = document.createElement('img');
      img.src = book.coverImage;
      img.style.position = 'absolute';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      coverDiv.appendChild(img);
      
      const textOverlay = document.createElement('div');
      textOverlay.style.position = 'absolute';
      textOverlay.style.inset = '0';
      textOverlay.style.display = 'flex';
      textOverlay.style.flexDirection = 'column';
      textOverlay.style.alignItems = 'center';
      textOverlay.style.justifyContent = 'flex-end';
      textOverlay.style.padding = '40px';
      textOverlay.style.textAlign = 'center';
      textOverlay.style.background = 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)';
      textOverlay.style.zIndex = '10';

      const titleEl = document.createElement('h2');
      titleEl.textContent = book.title;
      titleEl.style.fontFamily = formattingOptions.fontFamily; // Use a prominent font for cover
      titleEl.style.fontSize = '36px'; // Larger font size for cover title
      titleEl.style.fontWeight = 'bold';
      titleEl.style.color = 'white'; // White text for dark overlay
      titleEl.style.textShadow = '1px 1px 3px rgba(0,0,0,0.7)';
      titleEl.style.marginBottom = '10px';
      textOverlay.appendChild(titleEl);

      const authorEl = document.createElement('p');
      authorEl.textContent = book.author;
      authorEl.style.fontFamily = formattingOptions.fontFamily;
      authorEl.style.fontSize = '24px'; // Larger font size for cover author
      authorEl.style.fontStyle = 'italic';
      authorEl.style.color = '#e0e0e0'; // Light gray text
      authorEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
      textOverlay.appendChild(authorEl);
      
      coverDiv.appendChild(textOverlay);
      tempContainer.appendChild(coverDiv);

      const canvas = await html2canvas(coverDiv, { scale: 2, useCORS: true }); // Higher scale for better quality
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, (usableWidth * canvas.height) / canvas.width);
      tempContainer.removeChild(coverDiv);
    }

    // 2. Add Content Pages
    for (let i = 0; i < paginatedPreview.length; i++) {
      const pageData = paginatedPreview[i];
      if (i > 0 || book.coverImage) { // Add new page if not first content page OR if cover was added
        pdf.addPage();
      }

      const pageDiv = document.createElement('div');
      pageDiv.style.width = '750px'; // Match tempContainer width
      pageDiv.style.padding = `${formattingOptions.previewPadding}px`;
      pageDiv.style.fontFamily = formattingOptions.fontFamily;
      pageDiv.style.fontSize = `${formattingOptions.fontSize}px`;
      pageDiv.style.color = formattingOptions.textColor;
      pageDiv.style.backgroundColor = formattingOptions.pageBackgroundColor;
      pageDiv.style.lineHeight = String(formattingOptions.lineHeight);
      pageDiv.style.display = 'flex';
      pageDiv.style.flexDirection = 'column';
      pageDiv.style.minHeight = `${(750 * pdfHeight) / pdfWidth - 2*formattingOptions.previewPadding}px`; // Maintain A4 aspect ratio content box
      pageDiv.style.boxSizing = 'border-box';


      // Header
      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontSize = '0.75em'; // Smaller for header/footer
      headerDiv.style.opacity = '0.7';
      headerDiv.style.paddingBottom = '5px';
      headerDiv.style.borderBottom = `1px solid ${formattingOptions.textColor}`;
      headerDiv.style.marginBottom = '15px';
      const headerLeft = document.createElement('span');
      headerLeft.textContent = pageData.headerLeft;
      const headerRight = document.createElement('span');
      headerRight.textContent = pageData.headerRight;
      headerDiv.appendChild(headerLeft);
      headerDiv.appendChild(headerRight);
      pageDiv.appendChild(headerDiv);

      // Content
      const contentAreaDiv = document.createElement('div');
      contentAreaDiv.style.flexGrow = '1';

      // Render JSX contentElements to HTML string and then parse
      // This is a simplified way to handle JSX from preview for PDF
      pageData.contentElements.forEach(element => {
        if (element.type === 'p') {
          const p = document.createElement('p');
          p.textContent = element.props.children === '\u00A0' ? '' : element.props.children as string; // Handle &nbsp;
          p.className = element.props.className; // Copy classes if any
          p.style.margin = "0.5em 0"; // Basic paragraph margin
          contentAreaDiv.appendChild(p);
        } else if (element.props && element.props.children && (element.props.children as React.ReactElement).type === NextImage) {
          // This handles the div wrapper around NextImage
          const nextImageElement = (element.props.children as React.ReactElement);
          const imgContainer = document.createElement('div');
          imgContainer.style.textAlign = 'center';
          imgContainer.style.margin = '1em 0';

          const img = document.createElement('img');
          img.src = nextImageElement.props.src as string;
          img.alt = nextImageElement.props.alt as string;
          img.style.maxWidth = '80%'; // Limit image width within PDF page
          img.style.maxHeight = '300px'; // Limit image height
          img.style.height = 'auto';
          img.style.borderRadius = '4px';
          img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          imgContainer.appendChild(img);

          if (nextImageElement.props.alt) {
            const caption = document.createElement('p');
            caption.textContent = nextImageElement.props.alt as string;
            caption.style.fontSize = '0.8em';
            caption.style.fontStyle = 'italic';
            caption.style.opacity = '0.8';
            caption.style.marginTop = '0.25em';
            imgContainer.appendChild(caption);
          }
          contentAreaDiv.appendChild(imgContainer);
        }
      });
      pageDiv.appendChild(contentAreaDiv);

      // Footer
      const footerDiv = document.createElement('div');
      footerDiv.style.textAlign = 'center';
      footerDiv.style.fontSize = '0.75em';
      footerDiv.style.opacity = '0.7';
      footerDiv.style.paddingTop = '5px';
      footerDiv.style.borderTop = `1px solid ${formattingOptions.textColor}`;
      footerDiv.style.marginTop = 'auto'; // Pushes footer to bottom
      footerDiv.textContent = pageData.footerCenter;
      pageDiv.appendChild(footerDiv);
      
      tempContainer.appendChild(pageDiv);
      
      const canvas = await html2canvas(pageDiv, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * usableWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, imgHeight);
      tempContainer.removeChild(pageDiv);
    }

    document.body.removeChild(tempContainer);
    pdf.save(`${book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'ebook'}.pdf`);
    setIsExportingPdf(false);
    toast({
      title: "PDF Exported!",
      description: "Your book has been exported as a PDF.",
      duration: 3000,
    });
  };


  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans">
      <header className="mb-6 md:mb-10 text-center">
        <h1 className="text-3xl md:text-5xl font-bold" style={{ color: 'hsl(var(--primary))' }}>EscribaLibro</h1>
        <p className="text-base md:text-lg text-muted-foreground mt-1 md:mt-2">Craft your story, beautifully.</p>
         <Button onClick={handleSaveData} variant="outline" className="mt-4">
          <Save className="mr-2 h-4 w-4" /> Save Progress
        </Button>
      </header>

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
        <TabsList className="mx-auto mb-6 shadow-sm">
          <TabsTrigger value="editor" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <BookOpen className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Editor
          </TabsTrigger>
          <TabsTrigger value="formatting" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <Paintbrush className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Formatting
          </TabsTrigger>
          <TabsTrigger value="cover" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <Palette className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Cover
          </TabsTrigger>
          <TabsTrigger value="export" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <Download className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Export
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-1 flex-col md:flex-row gap-6">
          {/* Editing Area Column*/}
          <div className="w-full md:w-1/2 flex flex-col gap-6">
            <TabsContent value="editor" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl"><BookOpen className="mr-2" />Content Editor</CardTitle>
                  <CardDescription>Write and format your book's content. Use `## Chapter Title` for new chapters.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 md:p-6">
                  <Label htmlFor="bookContent" className="mb-2 font-semibold">Book Content</Label>
                  <Textarea
                    id="bookContent"
                    value={book.content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Start writing your masterpiece... Use '## Chapter Title' to define new chapters."
                    className="flex-1 w-full min-h-[250px] md:min-h-[300px] text-sm md:text-base resize-y p-3 rounded-md shadow-inner"
                  />
                  <div className="mt-4">
                    <Label htmlFor="insertImageContent" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs md:text-sm transition-colors duration-150">
                      <UploadCloud className="mr-2 h-4 w-4" /> Insert Image
                    </Label>
                    <Input id="insertImageContent" type="file" accept="image/*" onChange={handleImageInsertToContent} className="hidden" />
                    <p className="text-xs text-muted-foreground mt-1">Images are appended as Markdown-style links.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="formatting" className="mt-0 flex-1 w-full">
              <Card className="shadow-lg h-full">
                <CardHeader>
                  <CardTitle className="flex items-center text-xl md:text-2xl">
                    <Paintbrush className="mr-2" /> Formatting Options
                  </CardTitle>
                  <CardDescription>Customize the appearance of your book's content in the preview and PDF.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  <div>
                    <Label htmlFor="fontFamily">Font Family</Label>
                    <Select onValueChange={(value) => handleFormattingChange('fontFamily', value)} value={formattingOptions.fontFamily}>
                      <SelectTrigger id="fontFamily" className="mt-1">
                        <SelectValue placeholder="Select font family" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="var(--font-sans)">System Sans-serif</SelectItem>
                        <SelectItem value="serif">System Serif</SelectItem>
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
                      <Label htmlFor="fontSize">Font Size (px)</Label>
                      <Input
                        id="fontSize"
                        type="number"
                        value={formattingOptions.fontSize}
                        onChange={(e) => handleFormattingChange('fontSize', Math.max(8, parseInt(e.target.value, 10) || formattingOptions.fontSize))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lineHeight">Line Height</Label>
                      <Input
                        id="lineHeight"
                        type="number"
                        value={formattingOptions.lineHeight}
                        step="0.1"
                        onChange={(e) => handleFormattingChange('lineHeight', parseFloat(e.target.value) || formattingOptions.lineHeight)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="textColor">Text Color</Label>
                      <Input
                        id="textColor"
                        type="color"
                        value={formattingOptions.textColor}
                        onChange={(e) => handleFormattingChange('textColor', e.target.value)}
                        className="mt-1 h-10 p-1 w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pageBackgroundColor">Page Background</Label>
                      <Input
                        id="pageBackgroundColor"
                        type="color"
                        value={formattingOptions.pageBackgroundColor}
                        onChange={(e) => handleFormattingChange('pageBackgroundColor', e.target.value)}
                        className="mt-1 h-10 p-1 w-full"
                      />
                    </div>
                     <div>
                      <Label htmlFor="previewAreaBackground">Area Background</Label>
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
                    <Label htmlFor="previewPadding">Page Padding (px)</Label>
                    <Input
                      id="previewPadding"
                      type="number"
                      value={formattingOptions.previewPadding}
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
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Palette className="mr-2" />Cover Designer</CardTitle>
                  <CardDescription>Customize your book's cover.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 md:p-6">
                  <div>
                    <Label htmlFor="bookTitle" className="font-semibold">Book Title</Label>
                    <Input
                      id="bookTitle"
                      value={book.title}
                      onChange={(e) => handleBookDetailsChange('title', e.target.value)}
                      placeholder="Your Book Title"
                      className="mt-1 text-sm md:text-base p-2 shadow-inner"
                    />
                  </div>
                  <div>
                    <Label htmlFor="authorName" className="font-semibold">Author Name</Label>
                    <Input
                      id="authorName"
                      value={book.author}
                      onChange={(e) => handleBookDetailsChange('author', e.target.value)}
                      placeholder="Author's Name"
                      className="mt-1 text-sm md:text-base p-2 shadow-inner"
                    />
                  </div>
                  <div>
                    <Label className="font-semibold">Cover Image</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Label htmlFor="coverImageUploadFile" className="cursor-pointer inline-flex items-center px-3 py-2 rounded-md border border-input bg-card hover:bg-accent hover:text-accent-foreground text-xs md:text-sm transition-colors duration-150">
                        <UploadCloud className="mr-2 h-4 w-4" /> Upload Image
                      </Label>
                       <Input id="coverImageUploadFile" type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" />
                      {book.coverImage && (
                        <Button variant="outline" size="sm" onClick={() => setBook(prev => ({...prev, coverImage: null}))} className="text-xs md:text-sm">Remove</Button>
                      )}
                    </div>
                    {book.coverImage && (
                       <div className="mt-4 p-2 border rounded-md aspect-[2/3] max-w-[200px] mx-auto bg-muted flex flex-col items-center justify-center shadow-inner overflow-hidden relative">
                         <NextImage src={book.coverImage} alt="Cover Mini Preview" layout="fill" objectFit="cover" data-ai-hint="book cover" />
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
                  <CardTitle className="flex items-center text-xl md:text-2xl"><Download className="mr-2" />Export Options</CardTitle>
                  <CardDescription>Download your book in various formats.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 md:p-6">
                  <Button className="w-full justify-start text-sm md:text-base" onClick={handleExportToPdf} variant="outline" disabled={isExportingPdf}>
                    {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} />}
                    {isExportingPdf ? 'Exporting PDF...' : 'Export as PDF'}
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export DOCX (not implemented)', book)} variant="outline" disabled>
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as DOCX (Soon)
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export TXT (not implemented)', book)} variant="outline" disabled>
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as TXT (Soon)
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export HTML (not implemented)', book)} variant="outline" disabled>
                    <FileCode className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as HTML (Soon)
                  </Button>
                  <div className="pt-2 text-xs md:text-sm text-muted-foreground flex items-start">
                    <Info size={16} className="mr-2 mt-0.5 shrink-0" />
                    <span>PDF export is now functional. Other formats are placeholders. Pagination in preview is an approximation.</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Preview Area Column */}
          <div className="w-full md:w-1/2">
            <Card className="shadow-lg h-full sticky top-8">
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2" />Live Preview</CardTitle>
                <CardDescription>See your book take shape in real-time. Pagination is an approximation.</CardDescription>
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
                {activeTab === 'editor' || activeTab === 'export' || activeTab === 'formatting' ? (
                  paginatedPreview.length > 0 ? paginatedPreview.map(page => (
                    <div 
                      key={`page-preview-${page.pageNumber}`} 
                      className="page-simulation-wrapper mx-auto my-4 prose max-w-none"
                      style={simulatedPageStyle} // Uses pageBackgroundColor from formattingOptions
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
                      className="prose max-w-none border rounded-md min-h-[200px] shadow-inner"
                      style={{
                        fontFamily: formattingOptions.fontFamily,
                        fontSize: `${formattingOptions.fontSize}px`,
                        color: formattingOptions.textColor,
                        backgroundColor: formattingOptions.pageBackgroundColor, // page background
                        padding: `${formattingOptions.previewPadding}px`,
                        lineHeight: formattingOptions.lineHeight,
                      }}
                    >
                      <h2 className="text-xl md:text-2xl font-bold mb-1 text-center">{book.title}</h2>
                      <p className="text-xs md:text-sm text-center italic mb-4">by {book.author}</p>
                      <p className="italic" style={{opacity: 0.6}}>Content preview will appear here, paginated...</p>
                    </div>
                  )
                ) : activeTab === 'cover' ? (
                  <div className="p-2 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto flex flex-col items-center justify-center shadow-lg overflow-hidden relative" style={{backgroundColor: formattingOptions.pageBackgroundColor}}>
                    {book.coverImage ? (
                      <NextImage src={book.coverImage} alt="Book Cover Preview" layout="fill" objectFit="cover" data-ai-hint="book cover" />
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
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

