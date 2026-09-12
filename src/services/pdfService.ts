import puppeteer from 'puppeteer';
import { supabase } from '../config/supabase.js';

function removeArabicDiacritics(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');
}

function htmlText(value: unknown): string {
  return removeArabicDiacritics(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function imageUrl(value: unknown): string {
  const url = String(value ?? '');
  return /^https?:\/\//i.test(url) ? url : '';
}

async function imageAsDataUri(value: unknown): Promise<string> {
  const url = imageUrl(value);
  if (!url) return '';

  try {
    let contentType = 'image/jpeg';
    let buffer: Buffer;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

    if (response.ok) {
      contentType = response.headers.get('content-type')?.split(';')[0] || contentType;
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      const publicPathMarker = '/storage/v1/object/public/images/';
      const publicPathIndex = url.indexOf(publicPathMarker);
      if (publicPathIndex === -1) throw new Error(`HTTP ${response.status}`);

      const storagePath = decodeURIComponent(url.slice(publicPathIndex + publicPathMarker.length));
      const { data, error } = await supabase.storage.from('images').download(storagePath);
      if (error || !data) throw error || new Error('Supabase image download failed');

      contentType = data.type || contentType;
      buffer = Buffer.from(await data.arrayBuffer());
    }

    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn(`تعذر تحميل صورة السلايد داخل PDF: ${url}`, error);
    return '';
  }
}

export async function generateLessonPDF(
  lessonTitle: string,
  unitTitle: string,
  content: any,
  fileName: string
): Promise<string> {
  const slides = Array.isArray(content.slides) ? content.slides : [];
  const diagrams = Array.isArray(content.diagrams) ? content.diagrams : [];
  const quiz = Array.isArray(content.quiz) ? content.quiz : [];
  const exam = Array.isArray(content.exam) ? content.exam : quiz;
  const homework = Array.isArray(content.homework) ? content.homework : [];
  const slidesWithImages = await Promise.all(
    slides.map(async (slide: any) => ({
      ...slide,
      pdfImage: await imageAsDataUri(slide.visual_theme?.illustration_prompt),
    }))
  );
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${htmlText(lessonTitle)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4;
          margin: 110px 20px 60px 20px;
        }

        body {
          font-family: 'Cairo', sans-serif;
          background-color: #f8fafc;
          color: #1e293b;
          line-height: 1.8;
          margin: 0;
          padding: 10px;
        }

        /* الهيدر العلوي المكرر في كل صفحة */
        .page-header {
          position: fixed;
          top: -90px;
          left: 0;
          right: 0;
          height: 60px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 25px;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        }

        .brand-name {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #facc15;
          text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .lesson-tag {
          font-size: 13px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.2);
          padding: 4px 12px;
          border-radius: 20px;
        }

        /* الهيدر الرئيسي للدرس */
        .hero-card {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          color: white;
          padding: 30px;
          border-radius: 20px;
          margin-bottom: 25px;
          border-right: 8px solid #f59e0b;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
        }

        .hero-title {
          font-size: 26px;
          font-weight: 900;
          color: #38bdf8;
          margin: 0 0 10px 0;
        }

        .hero-subtitle {
          font-size: 16px;
          color: #94a3b8;
          margin: 0;
        }

        /* كروت السلايدات والتركات */
        .section-card {
          background: white;
          border-radius: 16px;
          padding: 20px 25px;
          margin-bottom: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          border: 1px solid #e2e8f0;
          page-break-inside: avoid;
        }

        .slide-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .slide-badge {
          background: #ec4899;
          color: white;
          font-size: 13px;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 8px;
        }
        .slide-heading {
          font-size: 18px;
          font-weight: 700;
          color: #1e1b4b;
          margin: 0;
        }

        /* صندوق الزتونة والتركات */
        .trick-box {
          background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
          border-right: 5px solid #f59e0b;
          padding: 12px 18px;
          border-radius: 10px;
          margin-top: 12px;
          font-weight: 600;
          color: #92400e;
        }

        .dialogue-box {
          background: #f0fdf4;
          border-right: 5px solid #22c55e;
          padding: 12px 18px;
          border-radius: 10px;
          margin-top: 10px;
          color: #166534;
        }

        .slide-image {
          display: block;
          width: 100%;
          max-height: 280px;
          object-fit: cover;
          border-radius: 12px;
          margin: 15px 0;
        }

        .diagram-card {
          background: #eff6ff;
          border-right: 5px solid #2563eb;
        }

        .diagram-title {
          color: #1d4ed8;
          font-size: 17px;
          margin: 0 0 8px;
        }

        .detail-card {
          background: white;
          border-right: 5px solid #6366f1;
        }

        .detail-title {
          color: #312e81;
          font-size: 19px;
          margin: 0 0 10px;
        }

        .detail-list {
          margin: 0;
          padding: 0 20px 0 0;
        }

        .detail-list li {
          margin-bottom: 8px;
          padding-right: 4px;
          line-height: 1.9;
        }

        .worked-example {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 14px 18px;
          margin-top: 12px;
          page-break-inside: avoid;
        }

        .worked-example h4 {
          color: #0f766e;
          margin: 0 0 8px;
        }

        .answer-box {
          background: #dcfce7;
          color: #166534;
          padding: 8px 12px;
          border-radius: 7px;
          margin-top: 8px;
          font-weight: 700;
        }

        /* قسم الاختبار التفاعلي */
        .quiz-title {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          border-bottom: 3px solid #6366f1;
          padding-bottom: 8px;
          margin-top: 30px;
          margin-bottom: 20px;
        }

        .quiz-item {
          background: white;
          border-radius: 12px;
          padding: 15px 20px;
          margin-bottom: 15px;
          border: 1px solid #cbd5e1;
          page-break-inside: avoid;
        }

        .question-text {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 10px;
        }

        .options-list {
          list-style: none;
          padding: 0;
          margin: 0 0 10px 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .option-item {
          background: #f8fafc;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          border: 1px solid #e2e8f0;
        }

        .option-item.correct {
          background: #dcfce7;
          border-color: #86efac;
          color: #15803d;
          font-weight: 700;
        }

        .explanation-text {
          font-size: 12px;
          color: #64748b;
          background: #f1f5f9;
          padding: 8px 12px;
          border-radius: 6px;
        }
      </style>
    </head>
    <body>

      <!-- الهيدر المكرر أعلى كل صفحة تلقائياً -->
      <div class="page-header">
        <div class="brand-name">✨ منصة فهمتها</div>
        <div class="lesson-tag">${htmlText(unitTitle)}</div>
      </div>

      <!-- كارت العنوان الرئيسي -->
      <div class="hero-card">
        <h1 class="hero-title">درس: ${htmlText(lessonTitle)}</h1>
        <p class="hero-subtitle">الوحدة: ${htmlText(unitTitle)} • دليل الشرح والتركات التفصيلي</p>
      </div>

      <!-- ملخص الدرس المفصل -->
      <div class="section-card">
        <h3 style="color: #6366f1; margin-top: 0;">📌 الزتونة وملخص الدرس</h3>
        <p style="font-size: 15px; white-space: pre-line;">${htmlText(content.summary)}</p>
      </div>

      ${content.detailed_explanation ? `
        <div class="section-card detail-card">
          <h3 class="detail-title">📖 الشرح الكامل</h3>
          <p style="font-size: 15px; white-space: pre-line; margin: 0;">${htmlText(content.detailed_explanation)}</p>
        </div>
      ` : ''}

      ${Array.isArray(content.key_points) && content.key_points.length > 0 ? `
        <div class="section-card detail-card">
          <h3 class="detail-title">💡 أهم النقاط</h3>
          <ul class="detail-list">
            ${content.key_points.map((point: string) => `<li>${htmlText(point)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${Array.isArray(content.laws_and_rules) && content.laws_and_rules.length > 0 ? `
        <div class="section-card detail-card">
          <h3 class="detail-title">📐 القوانين والقواعد</h3>
          <ul class="detail-list">
            ${content.laws_and_rules.map((rule: string) => `<li>${htmlText(rule)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${Array.isArray(content.worked_examples) && content.worked_examples.length > 0 ? `
        <div class="section-card detail-card">
          <h3 class="detail-title">🔢 أمثلة محلولة خطوة بخطوة</h3>
          ${content.worked_examples.map((example: any) => `
            <div class="worked-example">
              <h4>${htmlText(example.title)}</h4>
              <ol class="detail-list">
                ${(Array.isArray(example.steps) ? example.steps : []).map((step: string) => `<li>${htmlText(step)}</li>`).join('')}
              </ol>
              <div class="answer-box">الإجابة: ${htmlText(example.answer)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${Array.isArray(content.common_mistakes) && content.common_mistakes.length > 0 ? `
        <div class="section-card detail-card">
          <h3 class="detail-title">⚠️ أخطاء شائعة</h3>
          <ul class="detail-list">
            ${content.common_mistakes.map((mistake: string) => `<li>${htmlText(mistake)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${Array.isArray(content.exam_tricks) && content.exam_tricks.length > 0 ? `
        <div class="section-card detail-card">
          <h3 class="detail-title">🎯 تركات الامتحان</h3>
          <ul class="detail-list">
            ${content.exam_tricks.map((trick: string) => `<li>${htmlText(trick)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- تفاصيل الشرائح والشرح والتركات -->
      <h3 style="font-size: 20px; color: #0f172a; margin-top: 25px;">📚 شرح الأجزاء والتركات المهمة</h3>
      ${slidesWithImages.map((slide: any) => `
        <div class="section-card">
          <div class="slide-header">
            <span class="slide-badge">جزء ${htmlText(slide.slide_number)}</span>
            <h4 class="slide-heading">${htmlText(slide.heading)}</h4>
          </div>
          ${slide.pdfImage ? `
            <img class="slide-image" src="${slide.pdfImage}" alt="${htmlText(slide.heading)}">
          ` : ''}
          <p style="font-size: 14px; white-space: pre-line; margin-bottom: 10px;">${htmlText(slide.content)}</p>
          
          ${slide.trick ? `
            <div class="trick-box">
              💡 <strong>تركة امتحان:</strong> ${htmlText(slide.trick)}
            </div>
          ` : ''}

          ${slide.character_dialogue ? `
            <div class="dialogue-box">
              💬 <strong>تبسيط المعلم:</strong> ${htmlText(slide.character_dialogue)}
            </div>
          ` : ''}
        </div>
      `).join('')}

      ${diagrams.length > 0 ? `
        <div class="quiz-title">🧠 خرائط ومفاتيح الفهم</div>
        ${diagrams.map((diagram: any) => `
          <div class="section-card diagram-card">
            <h4 class="diagram-title">${htmlText(diagram.title)}</h4>
            <p style="font-size: 14px; white-space: pre-line; margin: 0;">${htmlText(diagram.description)}</p>
          </div>
        `).join('')}
      ` : ''}

      <!-- الامتحان -->
      <div class="quiz-title">📝 امتحان الدرس - ${exam.length} أسئلة</div>
      ${exam.map((q: any, idx: number) => `
        <div class="quiz-item">
          <div class="question-text">س${idx + 1}: ${htmlText(q.question)}</div>
          <ul class="options-list">
            ${(Array.isArray(q.options) ? q.options : []).map((opt: string, optIdx: number) => `
              <li class="option-item ${optIdx === q.correct_index ? 'correct' : ''}">
                ${optIdx === q.correct_index ? '✅ ' : '• '}${htmlText(opt)}
              </li>
            `).join('')}
          </ul>
          <div class="explanation-text">💡 <strong>التفسير:</strong> ${htmlText(q.explanation)}</div>
        </div>
      `).join('')}

      ${homework.length > 0 ? `
        <div class="quiz-title">📚 الواجب - ${homework.length} سؤال</div>
        ${homework.map((q: any, idx: number) => `
          <div class="quiz-item">
            <div class="question-text">واجب ${idx + 1}: ${htmlText(q.question)}</div>
            <ul class="options-list">
              ${(Array.isArray(q.options) ? q.options : []).map((opt: string, optIdx: number) => `
                <li class="option-item ${optIdx === q.correct_index ? 'correct' : ''}">
                  ${optIdx === q.correct_index ? '✅ ' : '• '}${htmlText(opt)}
                </li>
              `).join('')}
            </ul>
            <div class="explanation-text">💡 <strong>التفسير:</strong> ${htmlText(q.explanation)}</div>
          </div>
        `).join('')}
      ` : ''}

    </body>
    </html>
  `;

  // تشغيل Puppeteer وتحويل الـ HTML إلى PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(
    Array.from(document.images).map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        }))
  ));

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '100px',
      bottom: '60px',
      left: '20px',
      right: '20px'
    }
  });

  await browser.close();

  // رفع الـ PDF إلى Supabase Storage
  const path = `pdfs/${fileName}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    console.error('❌ خطأ أثناء رفع الـ PDF إلى Supabase:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from('pdfs').getPublicUrl(path);
  return data.publicUrl;
}