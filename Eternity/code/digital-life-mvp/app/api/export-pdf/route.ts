import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { 
  generateVivliostyleHTML, 
  PAGE_SIZES,
  type BookConfig, 
  type BookChapter, 
  type ChapterPhoto 
} from '@/lib/vivliostyleBookGenerator';

// Allow longer timeout for PDF generation
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookConfig, chapters, chapterPhotosEntries } = body;

    if (!bookConfig || !chapters) {
      return NextResponse.json(
        { error: 'Missing required fields: bookConfig or chapters' },
        { status: 400 }
      );
    }

    // Reconstruct Map from entries array [[key, value], ...]
    // Ensure keys are numbers (chapter indices)
    const chapterPhotos = new Map<number, ChapterPhoto[]>();
    if (Array.isArray(chapterPhotosEntries)) {
      chapterPhotosEntries.forEach(([key, value]) => {
        chapterPhotos.set(Number(key), value);
      });
    }

    // Generate HTML
    console.log('[API] Generating HTML for PDF...');
    const html = generateVivliostyleHTML(bookConfig as BookConfig, chapters as BookChapter[], chapterPhotos);

    // Launch Puppeteer
    console.log('[API] Launching Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set content and wait for network idle (images loaded)
    console.log('[API] Setting page content and waiting for network idle...');
    await page.setContent(html, { 
      waitUntil: 'networkidle0',
      timeout: 60000 // 60s timeout for loading resources
    });

    // Get page dimensions
    const pageSizeKey = bookConfig.pageSize || 'A4';
    const pageSize = PAGE_SIZES[pageSizeKey] || PAGE_SIZES['A4'];

    // Generate PDF
    console.log(`[API] Generating PDF (${pageSizeKey}: ${pageSize.width}mm x ${pageSize.height}mm)...`);
    const pdfBuffer = await page.pdf({
      width: `${pageSize.width}mm`,
      height: `${pageSize.height}mm`,
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      },
      timeout: 120000 // 120s timeout for PDF generation
    });

    await browser.close();
    console.log('[API] PDF generated successfully.');

    // Return PDF
    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(bookConfig.title || 'book')}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
