import { GenerateContentParameters, Type } from '@google/genai';
import { geminiClients } from '../config/gemini.js';
import { supabase } from '../config/supabase.js';
import { generateAndSaveImage } from '../services/imageService.js';
import { generateLessonPDF } from '../services/pdfService.js';

// 1️⃣ استخدام الموديل المستقر والسريع
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const exhaustedGeminiClients = new Set<number>();
let nextGeminiClientIndex = 0;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isRetryableGeminiError(error: unknown): boolean {
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  const message = candidate?.message?.toLowerCase() ?? String(error).toLowerCase();
  return candidate?.status === 503
    || candidate?.statusCode === 503
    || /503|service unavailable|high demand|temporarily unavailable|timed out/.test(message);
}

function isGeminiQuotaError(error: unknown): boolean {
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  const message = candidate?.message?.toLowerCase() ?? String(error).toLowerCase();
  return candidate?.status === 429
    || candidate?.statusCode === 429
    || /resource_exhausted|quota exceeded|rate limit/.test(message);
}

type GeminiFilePart = {
  fileData: {
    fileUri: string;
    mimeType: string;
  };
};

type GeminiSession = {
  filePath: string;
  clientIndex: number;
  filePart: GeminiFilePart;
};

export interface BookIngestionMetadata {
  sourceUrl?: string;
  sourceName?: string;
  term?: number;
}

async function uploadPdfWithClient(clientIndex: number, filePath: string): Promise<GeminiFilePart> {
  const uploadedFile = await withTimeout(
    geminiClients[clientIndex].files.upload({
      file: filePath,
      config: { mimeType: 'application/pdf' },
    }),
    120_000,
    `Gemini PDF upload (project ${clientIndex + 1})`,
  );

  if (!uploadedFile.uri) {
    throw new Error(`Gemini project ${clientIndex + 1} returned no uploaded file URI.`);
  }

  return {
    fileData: {
      fileUri: uploadedFile.uri,
      mimeType: uploadedFile.mimeType ?? 'application/pdf',
    },
  };
}

async function createGeminiSession(filePath: string): Promise<GeminiSession> {
  let lastError: unknown;

  for (let attempt = 0; attempt < geminiClients.length; attempt++) {
    const clientIndex = (nextGeminiClientIndex + attempt) % geminiClients.length;
    if (exhaustedGeminiClients.has(clientIndex)) continue;

    try {
      console.log(`📤 جاري رفع الملف عبر مشروع Gemini رقم ${clientIndex + 1}...`);
      nextGeminiClientIndex = clientIndex;
      return {
        filePath,
        clientIndex,
        filePart: await uploadPdfWithClient(clientIndex, filePath),
      };
    } catch (error) {
      lastError = error;
      if (isGeminiQuotaError(error)) {
        exhaustedGeminiClients.add(clientIndex);
      }
      console.warn(`⚠️ تعذر استخدام مشروع Gemini رقم ${clientIndex + 1}، جاري تجربة المشروع التالي...`);
    }
  }

  throw lastError ?? new Error('نفدت مفاتيح Gemini المتاحة حاليا.');
}

async function switchGeminiProject(session: GeminiSession, exhaustCurrent: boolean): Promise<void> {
  if (exhaustCurrent) {
    exhaustedGeminiClients.add(session.clientIndex);
  }

  for (let offset = 1; offset <= geminiClients.length; offset++) {
    const candidateIndex = (session.clientIndex + offset) % geminiClients.length;
    if (exhaustedGeminiClients.has(candidateIndex)) continue;

    console.warn(`🔁 التبديل إلى مشروع Gemini رقم ${candidateIndex + 1} وإعادة رفع الملف...`);
    session.clientIndex = candidateIndex;
    nextGeminiClientIndex = candidateIndex;
    session.filePart = await uploadPdfWithClient(candidateIndex, session.filePath);
    return;
  }

  throw new Error('نفدت كل مفاتيح Gemini المجانية المتاحة حاليا.');
}

// 2️⃣ التبديل الفوري للمفتاح التالي عند خطأ 503 أو 429 أو Timeout
async function generateContentWithRetry(
  request: GenerateContentParameters,
  session: GeminiSession,
) {
  const maxAttempts = geminiClients.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await withTimeout(
        geminiClients[session.clientIndex].models.generateContent({
          ...request,
          contents: [
            session.filePart,
            ...(Array.isArray(request.contents) ? request.contents.slice(1) : [request.contents]),
          ] as GenerateContentParameters['contents'],
        }),
        180_000, // 3 دقائق مهلة كافية للتوليد
        'Gemini content generation',
      );
    } catch (error) {
      console.warn(`⚠️ [مشروع ${session.clientIndex + 1}] حدث خطأ أثناء التوليد. جارِ التبديل...`);

      if (isGeminiQuotaError(error) || isRetryableGeminiError(error)) {
        await switchGeminiProject(session, isGeminiQuotaError(error));
        await delay(1000);
        continue;
      }
      
      throw error;
    }
  }

  throw new Error('Gemini generation failed after exhausting all keys');
}

export async function processBookPDF(
  filePath: string,
  subjectId: string,
  bookTitle: string,
  metadata: BookIngestionMetadata = {},
) {
  let bookRecordId: string | undefined;

  try {
    console.log(`\n🚀 بدء معالجة كتاب: [${bookTitle}]...`);

    let existingBookQuery = supabase
      .from('books')
      .select('id, status')
      .eq('subject_id', subjectId)
      .eq('title', bookTitle);

    if (metadata.sourceUrl) {
      existingBookQuery = existingBookQuery.eq('source_url', metadata.sourceUrl);
    }

    const { data: existingBook, error: lookupError } = await existingBookQuery.maybeSingle();

    if (lookupError) throw lookupError;
    if (existingBook?.status === 'completed') {
      console.log(`⏩ الكتاب [${bookTitle}] مكتمل بالفعل، لن تتم معالجته مرة أخرى.`);
      return;
    }

    if (existingBook) {
      bookRecordId = existingBook.id;
      const { error: resetError } = await supabase
        .from('books')
        .update({ status: 'processing' })
        .eq('id', bookRecordId);
      if (resetError) throw resetError;
    } else {
      const { data: bookRecord, error: bookError } = await supabase
        .from('books')
        .insert([{
          subject_id: subjectId,
          title: bookTitle,
          status: 'processing',
          source_url: metadata.sourceUrl ?? null,
          source_name: metadata.sourceName ?? 'وزارة التربية والتعليم المصرية',
          term: metadata.term ?? null,
        }])
        .select('id')
        .single();
      if (bookError) throw bookError;
      bookRecordId = bookRecord.id;
    }

    const { data: existingLessons, error: existingLessonsError } = await supabase
      .from('lessons')
      .select('source_order')
      .eq('book_id', bookRecordId);
    if (existingLessonsError) throw existingLessonsError;
    const existingLessonOrders = new Set(
      (existingLessons ?? [])
        .map((lesson) => lesson.source_order)
        .filter((order): order is number => typeof order === 'number'),
    );

    console.log(`📤 جاري رفع الملف إلى Gemini File API...`);
    const session = await createGeminiSession(filePath);

    console.log(`✅ تم رفع الملف. جاري استخراج شجرة الوحدات والدروس...`);

    const outlineResponse = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: [session.filePart, 'قم بتحليل هذا الكتاب المدرسي بالكامل واستخراج كافة الوحدات والدروس بصيغة JSON.'],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              unit_title: { type: Type.STRING },
              lesson_title: { type: Type.STRING },
              lesson_summary_context: { type: Type.STRING }
            },
            required: ['unit_title', 'lesson_title', 'lesson_summary_context']
          }
        }
      }
    }, session);

    if (!outlineResponse.text) throw new Error('Gemini returned an empty outline response');
    const lessonsOutline = JSON.parse(outlineResponse.text) as Array<{
      unit_title: string;
      lesson_title: string;
      lesson_summary_context: string;
    }>;
    console.log(`📚 تم إيجاد ${lessonsOutline.length} درس. جاري التوليد التفاعلي المتكامل...`);

    let createdCount = existingLessonOrders.size;

    const systemInstruction = `
أنت معلم مصري عبقري ومصمم مناهج تفاعلية للثانوية العامة.
تتميز بالشرح الممتع واستخدام اللغة المصرية الشبابية البسيطة والذكية ("يا بطل"، "الزتونة"، "تركة امتحان"، "ركز في دي").
  اكتب النص العربي بدون أي تشكيل أو حركات. لا تختصر أي نقطة علمية مهمة من المصدر.
  اهتم باللهجة المصرية والشرح الشيق، واشرح كل مصطلح وقاعدة خطوة بخطوة.
  لا تنشئ أي فيديو أو صوت؛ المحتوى نصي وتفاعلي فقط.`;

    for (let i = 0; i < lessonsOutline.length; i++) {
      const item = lessonsOutline[i];
      if (existingLessonOrders.has(i + 1)) {
        console.log(`⏩ الدرس ${i + 1} موجود مسبقاً، جاري التخطي...`);
        continue;
      }
      console.log(`\n⏳ [${i + 1}/${lessonsOutline.length}] معالجة درس: (${item.unit_title} - ${item.lesson_title})...`);

      const lessonPrompt = `
    قم بتوليد مذكرة شرح كاملة وليست ملخصا قصيرا للدرس التالي من الكتاب المرفق:
    الوحدة: ${item.unit_title}
    الدرس: ${item.lesson_title}
    السياق المستخرج من الكتاب: ${item.lesson_summary_context}

    التزم بكل المعلومات الواردة في الجزء الخاص بالدرس. قسم الشرح إلى أجزاء منطقية،
    واشرح التعريفات والقوانين والعلاقات والأسباب والنتائج بالتفصيل. أضف أمثلة محلولة
    بخطواتها، ثم أخطاء شائعة وتركات امتحان.
    أنشئ امتحانا مستقلا من 10 أسئلة بالضبط، وواجبا مستقلا من 15 سؤالا بالضبط.
    اجعل كل سؤال اختيارا من متعدد بأربع اختيارات، وحدد الإجابة الصحيحة والشرح.
    يجب أن يقيس الامتحان فهم الدرس، بينما يتدرج الواجب من السهل إلى الصعب للتدريب.
    يجب أن يكون المحتوى كافيا للمذاكرة من الـ PDF وحده، وباللهجة المصرية الشبابية، وبدون تشكيل.
    `;

      const lessonContentResponse = await generateContentWithRetry({
        model: GEMINI_MODEL,
        contents: [session.filePart, lessonPrompt],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              difficulty: { type: Type.STRING, enum: ['سهل', 'متوسط', 'صعب'] },
              duration_minutes: { type: Type.INTEGER },
              points_reward: { type: Type.INTEGER },
              coins_cost: { type: Type.INTEGER },
              content: {
                type: Type.OBJECT,
                properties: {
                  summary: { type: Type.STRING },
                  detailed_explanation: { type: Type.STRING },
                  key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
                  laws_and_rules: { type: Type.ARRAY, items: { type: Type.STRING } },
                  common_mistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
                  exam_tricks: { type: Type.ARRAY, items: { type: Type.STRING } },
                  worked_examples: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                        answer: { type: Type.STRING }
                      },
                      required: ['title', 'steps', 'answer']
                    }
                  },
                  exam: {
                    type: Type.ARRAY,
                    minItems: 10,
                    maxItems: 10,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, minItems: 4, maxItems: 4, items: { type: Type.STRING } },
                        correct_index: { type: Type.INTEGER },
                        explanation: { type: Type.STRING }
                      },
                      required: ['question', 'options', 'correct_index', 'explanation']
                    }
                  },
                  homework: {
                    type: Type.ARRAY,
                    minItems: 15,
                    maxItems: 15,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, minItems: 4, maxItems: 4, items: { type: Type.STRING } },
                        correct_index: { type: Type.INTEGER },
                        explanation: { type: Type.STRING }
                      },
                      required: ['question', 'options', 'correct_index', 'explanation']
                    }
                  },
                  slides: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        slide_number: { type: Type.INTEGER },
                        heading: { type: Type.STRING },
                        content: { type: Type.STRING },
                        trick: { type: Type.STRING },
                        character_dialogue: { type: Type.STRING },
                        visual_theme: {
                          type: Type.OBJECT,
                          properties: {
                            primary_color: { type: Type.STRING },
                            layout_style: { type: Type.STRING },
                            illustration_prompt: { type: Type.STRING }
                          },
                          required: ['primary_color', 'layout_style', 'illustration_prompt']
                        }
                      },
                      required: ['slide_number', 'heading', 'content', 'trick', 'character_dialogue', 'visual_theme']
                    }
                  },
                  diagrams: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        prompt_for_visual: { type: Type.STRING }
                      },
                      required: ['title', 'description', 'prompt_for_visual']
                    }
                  },
                  quiz: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correct_index: { type: Type.INTEGER },
                        explanation: { type: Type.STRING }
                      },
                      required: ['question', 'options', 'correct_index', 'explanation']
                    }
                  }
                },
                required: [
                  'summary', 'detailed_explanation', 'key_points', 'laws_and_rules',
                  'common_mistakes', 'exam_tricks', 'worked_examples', 'exam', 'homework',
                  'slides', 'diagrams', 'quiz'
                ]
              }
            },
            required: ['difficulty', 'duration_minutes', 'points_reward', 'coins_cost', 'content']
          }
        }
      }, session);

      if (!lessonContentResponse.text) throw new Error(`Gemini returned empty content for ${item.lesson_title}`);
      const generatedData = JSON.parse(lessonContentResponse.text);

      // 3️⃣ توليد صور السلايدات بالتوازي (Parallel) لختصار الوقت
      console.log(`🎨 جاري توليد صور السلايدات بالتوازي...`);
      await Promise.all(
        generatedData.content.slides.map(async (slide: any, s: number) => {
          if (slide.visual_theme?.illustration_prompt) {
            const imageUrl = await generateAndSaveImage(
              slide.visual_theme.illustration_prompt,
              `slide_${i}_${s}`
            );
            slide.visual_theme.illustration_prompt = imageUrl;
          }
        })
      );

      console.log(`📄 جاري تصميم وإنشاء مذكرة الـ PDF للدرس...`);
      const pdfUrl = await generateLessonPDF(
        item.lesson_title,
        item.unit_title,
        generatedData.content,
        `lesson_${Date.now()}`
      );
      generatedData.content.pdf_summary_url = pdfUrl;

      const { error: lessonError } = await supabase.from('lessons').insert([
        {
          subject_id: subjectId,
          book_id: bookRecordId,
          unit_title: item.unit_title,
          chapter_name: item.unit_title,
          lesson_title: item.lesson_title,
          difficulty: generatedData.difficulty,
          duration_minutes: generatedData.duration_minutes,
          points_reward: generatedData.points_reward,
          coins_cost: generatedData.coins_cost || 15,
          order_index: i + 1,
          source_order: i + 1,
          generation_status: 'completed',
          content_json: generatedData.content
        }
      ]);
      if (lessonError) throw lessonError;

      console.log(`✅ تم الانتهاء من الدرس ${i + 1} بنجاح!`);
      createdCount++;
    }

    await supabase
      .from('books')
      .update({ status: 'completed', total_lessons_generated: createdCount })
      .eq('id', bookRecordId);

    console.log(`\n🎉 اكتملت المعالجة لكتاب [${bookTitle}] بنجاح! 🎉\n`);
  } catch (error) {
    console.error('❌ حدث خطأ أثناء المعالجة:', error);
    if (bookRecordId) {
      await supabase
        .from('books')
        .update({ status: 'failed' })
        .eq('id', bookRecordId);
    }
    throw error;
  }
}