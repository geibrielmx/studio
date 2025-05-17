"use client";

import { useState, useEffect, type ChangeEvent } from 'react';
import type { Book } from '@/types/book';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NextImage from 'next/image'; // Renamed to avoid conflict
import { UploadCloud, BookOpen, Type, User, Download, Settings, Palette, FileText, FileCode, Info, Image as ImageIcon } from 'lucide-react'; // ImageIcon from Lucide

export default function EscribaLibroApp() {
  const [book, setBook] = useState<Book>({
    title: 'Untitled Book',
    author: 'Unknown Author',
    content: '',
    coverImage: null,
  });
  const [activeTab, setActiveTab] = useState('editor');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Basic skeleton or loading state to avoid hydration mismatch with Tabs
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
  

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans">
      <header className="mb-6 md:mb-10 text-center">
        <h1 className="text-3xl md:text-5xl font-bold" style={{ color: 'hsl(var(--primary))' }}>EscribaLibro</h1>
        <p className="text-base md:text-lg text-muted-foreground mt-1 md:mt-2">Craft your story, beautifully.</p>
      </header>

      <Tabs defaultValue="editor" value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
        <TabsList className="mx-auto mb-6 shadow-sm">
          <TabsTrigger value="editor" className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base">
            <BookOpen className="mr-2 h-4 w-4 md:h-5 md:w-5" /> Editor
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
                  <CardDescription>Write and format your book's content.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 md:p-6">
                  <Label htmlFor="bookContent" className="mb-2 font-semibold">Book Content</Label>
                  <Textarea
                    id="bookContent"
                    value={book.content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Start writing your masterpiece..."
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
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export PDF', book)} variant="outline">
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as PDF
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export DOCX', book)} variant="outline">
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as DOCX
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export TXT', book)} variant="outline">
                    <FileText className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as TXT
                  </Button>
                  <Button className="w-full justify-start text-sm md:text-base" onClick={() => console.log('Export HTML', book)} variant="outline">
                    <FileCode className="mr-2" style={{color: 'hsl(var(--primary))'}} /> Export as HTML
                  </Button>
                  <div className="pt-2 text-xs md:text-sm text-muted-foreground flex items-start">
                    <Info size={16} className="mr-2 mt-0.5 shrink-0" />
                    <span>Actual export functionality is complex and represented by console logs.</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Preview Area Column */}
          <div className="w-full md:w-1/2">
            <Card className="shadow-lg h-full sticky top-8"> {/* Sticky for desktop */}
              <CardHeader>
                <CardTitle className="flex items-center text-xl md:text-2xl"><Settings className="mr-2" />Live Preview</CardTitle>
                <CardDescription>See your book take shape in real-time.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-y-auto p-4 md:p-6" style={{maxHeight: 'calc(100vh - 12rem)'}}>
                {activeTab === 'editor' || activeTab === 'export' ? (
                  <div className="prose prose-sm max-w-none p-3 md:p-4 border rounded-md min-h-[200px] bg-white shadow-inner">
                    <h2 className="text-xl md:text-2xl font-bold mb-1 text-center" style={{color: 'hsl(var(--foreground))'}}>{book.title}</h2>
                    <p className="text-xs md:text-sm text-center italic mb-4" style={{color: 'hsl(var(--muted-foreground))'}}>by {book.author}</p>
                    {book.content.split('\n').map((paragraph, index) => {
                      const imageMatch = paragraph.match(/!\[(.*?)\]\((.*?)\)/);
                      if (imageMatch) {
                        const [, altText, imgSrc] = imageMatch;
                        return (
                          <div key={index} className="my-3 md:my-4 text-center">
                            <NextImage
                              src={imgSrc}
                              alt={altText || 'Inserted image'}
                              width={300}
                              height={200}
                              className="max-w-full h-auto inline-block rounded shadow-md"
                              data-ai-hint="illustration drawing"
                            />
                            {altText && <p className="text-xs italic text-muted-foreground mt-1">{altText}</p>}
                          </div>
                        );
                      }
                      return <p key={index} className="my-1.5 md:my-2 text-sm md:text-base" style={{color: 'hsl(var(--foreground))'}}>{paragraph || <>&nbsp;</>}</p>;
                    })}
                    {book.content.trim() === '' && <p className="text-muted-foreground italic text-sm md:text-base">Content preview will appear here...</p>}
                  </div>
                ) : activeTab === 'cover' ? (
                  <div className="p-2 md:p-4 border rounded-md aspect-[2/3] max-w-xs md:max-w-sm mx-auto bg-card flex flex-col items-center justify-center shadow-lg overflow-hidden relative">
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
