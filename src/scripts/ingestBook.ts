import { GenerateContentParameters, Type } from '@google/genai';
import { geminiClients } from '../config/gemini.js';
import { supabase } from '../config/supabase.js';
import { generateAndSaveImage } from '../services/imageService.js';
import { generateLessonPDF } from '../services/pdfService.js';

const GEMINI_MODEL = 'gemini-3.6-flash';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
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

async function uploadPdfWithClient(clientIndex: number, filePath: string): Promise<GeminiFilePart> {
  const uploadedFile = await withTimeout(
    geminiClients[clientIndex].files.upload({
      file: filePath,
      config: { mimeType: 'application/pdf' },
    }),
    60_000,
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

  for (let clientIndex = 0; clientIndex < geminiClients.length; clientIndex++) {
    try {
      console.log(`📤 جاري رفع الملف عبر مشروع Gemini رقم ${clientIndex + 1}...`);
      return {
        filePath,
        clientIndex,
        filePart: await uploadPdfWithClient(clientIndex, filePath),
      };
    } catch (error) {
      lastError = error;
      if (!isGeminiQuotaError(error) || clientIndex === geminiClients.length - 1) throw error;
      console.warn(`⚠️ انتهت حصة مشروع Gemini رقم ${clientIndex + 1}، سيتم استخدام المشروع التالي.`);
    }
  }

  throw lastError ?? new Error('No Gemini project is available');
}

async function switchGeminiProject(session: GeminiSession): Promise<void> {
  const nextClientIndex = session.clientIndex + 1;
  if (nextClientIndex >= geminiClients.length) {
    throw new Error('All configured Gemini projects have exhausted their quota.');
  }

  console.warn(`🔁 التبديل إلى مشروع Gemini رقم ${nextClientIndex + 1} وإعادة رفع الملف...`);
  session.clientIndex = nextClientIndex;
  session.filePart = await uploadPdfWithClient(nextClientIndex, session.filePath);
}

async function generateContentWithRetry(
  request: GenerateContentParameters,
  session: GeminiSession,
) {
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      return await withTimeout(
        geminiClients[session.clientIndex].models.generateContent({
          ...request,
          contents: [
            session.filePart,
            ...(Array.isArray(request.contents) ? request.contents.slice(1) : [request.contents]),
          ] as GenerateContentParameters['contents'],
        }),
        60_000,
        'Gemini content generation',
      );
    } catch (error) {
      if (isGeminiQuotaError(error) && session.clientIndex < geminiClients.length - 1) {
        await switchGeminiProject(session);
        continue;
      }
      if (attempt === 3 || !isRetryableGeminiError(error)) throw error;
      const backoffMs = 3_000 + attempt * 1_000;
      console.warn(`⚠️ Gemini זמני ולא זמין. ניסיון חוזר בעוד ${backoffMs / 1000} שניות...`, error);
      await delay(backoffMs);
    }
  }

  throw new Error('Gemini generation failed after retries');
}

export async function processBookPDF(filePath: string, subjectId: string, bookTitle: string) {
  try {
    console.log(`\n🚀 بدء معالجة كتاب: [${bookTitle}]...`);
    // 1. تسجيل الكتاب
    const { data: bookRecord, error: bookError } = await supabase
      .from('books')
      .insert([{ subject_id: subjectId, title: bookTitle, status: 'processing' }])
      .select()
      .single();

    if (bookError) throw bookError;

    // 2. رفع PDF المنهج إلى Gemini
    console.log(`📤 جاري رفع الملف إلى Gemini File API...`);
    const session = await createGeminiSession(filePath);

    console.log(`✅ تم رفع الملف. جاري استخراج شجرة الوحدات والدروس...`);

    // 3. تفكيك الفهرس
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

    let createdCount = 0;

    const systemInstruction = `
أنت معلم مصري عبقري ومصمم مناهج تفاعلية للثانوية العامة.
تتميز بالشرح الممتع واستخدام اللغة المصرية الشبابية البسيطة والذكية ("يا بطل"، "الزتونة"، "تركة امتحان"، "ركز في دي").
إضافة التشكيل الإعرابي الكامل (الحركات: فتحة، ضمة، كسرة، سكون، شدة) على جميع النصوص العربية في الشرائح وحوار الشخصية لضمان صحة النطق الصوتي.و بردك عايزك تهتم ملهجة المصرية و تهتم بالشرح الشيق الممتع  وتركز علي النقاط المهمة و شرح كل نقطة في الدرس تبقا لمعايير الكتاب  `;

    // 4. التكرار على الدروس درساً درساً
    for (let i = 0; i < lessonsOutline.length; i++) {
      const item = lessonsOutline[i];
      console.log(`\n⏳ [${i + 1}/${lessonsOutline.length}] معالجة درس: (${item.unit_title} - ${item.lesson_title})...`);

      const lessonPrompt = `قم بتوليد محتوى الدرس تفصيلياً و عايزة ممتعا و شيق وبللهجة المصرية الشبابية بناءً على المرفق: ${item.unit_title} - ${item.lesson_title}`;

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
                  video_script: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        scene_number: { type: Type.INTEGER },
                        visual_description: { type: Type.STRING },
                        narration_text: { type: Type.STRING },
                        ai_image_prompt: { type: Type.STRING }
                      },
                      required: ['scene_number', 'visual_description', 'narration_text', 'ai_image_prompt']
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
                  },
                  exam: {
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
                  },
                  homework: {
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
                required: ['summary', 'slides', 'diagrams', 'video_script', 'quiz', 'exam', 'homework']
              }
            },
            required: ['difficulty', 'duration_minutes', 'points_reward', 'coins_cost', 'content']
          }
        }
      }, session);

      if (!lessonContentResponse.text) throw new Error(`Gemini returned empty content for ${item.lesson_title}`);
      const generatedData = JSON.parse(lessonContentResponse.text);

      // 🎨 توليد الصور الحقيقية للـ Slides والـ Video Scenes
      console.log(`🎨 جاري توليد الصور بالذكاء الاصطناعي للسلايدات والمشاهد...`);
      for (let s = 0; s < generatedData.content.slides.length; s++) {
        const slide = generatedData.content.slides[s];
        const imageUrl = await generateAndSaveImage(
          slide.visual_theme.illustration_prompt,
          `slide_${i}_${s}`
        );
        slide.visual_theme.illustration_prompt = imageUrl;
      }

      for (let v = 0; v < generatedData.content.video_script.length; v++) {
        const scene = generatedData.content.video_script[v];
        const sceneImageUrl = await generateAndSaveImage(
          scene.ai_image_prompt,
          `scene_${i}_${v}`
        );
        scene.ai_image_prompt = sceneImageUrl;
      }

      const tempLessonId = `lesson_${Date.now()}`;

      // 📄 توليد مذكرة الـ PDF الملهمة للدرس
      console.log(`📄 جاري تصميم وإنشاء مذكرة الـ PDF للدرس...`);
      const pdfUrl = await generateLessonPDF(
        item.lesson_title,
        item.unit_title,
        generatedData.content,
        tempLessonId
      );
      generatedData.content.pdf_summary_url = pdfUrl;

      // 💾 التخزين النهائي في Supabase
      await supabase.from('lessons').insert([
        {
          subject_id: subjectId,
          book_id: bookRecord.id,
          unit_title: item.unit_title,
          chapter_name: item.unit_title,
          lesson_title: item.lesson_title,
          difficulty: generatedData.difficulty,
          duration_minutes: generatedData.duration_minutes,
          points_reward: generatedData.points_reward,
          coins_cost: generatedData.coins_cost || 15,
          order_index: i + 1,
          content_json: generatedData.content
        }
      ]);

      console.log(`✅ تم الانتهاء من إنشاء الدرس والتصاميم والـ PDF والفيديو بنجاح!`);
      createdCount++;
    }

    await supabase
      .from('books')
      .update({ status: 'completed', total_lessons_generated: createdCount })
      .eq('id', bookRecord.id);

    console.log(`\n🎉 اكتملت العملية الشاملة للكتاب [${bookTitle}] بنجاح! 🎉\n`);
  } catch (error) {
    if (isGeminiQuotaError(error)) {
      console.error(
        '❌ انتهت حصة Gemini الحالية (429). انتظر تجدد الحصة اليومية أو فعّل الفوترة/استخدم مشروعًا بحصة متاحة. لن تتم إعادة المحاولة تلقائيًا.',
      );
    } else {
      console.error('❌ حدث خطأ أثناء المعالجة:', error);
    }
    throw error;
  }
}