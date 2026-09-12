import { Request, Response } from 'express';
import { Type } from '@google/genai';
import { ai } from '../config/gemini.js';
import { supabase } from '../config/supabase.js';
import { processBookPDF } from '../scripts/ingestBook.js';

export const generateStructuredLesson = async (req: Request, res: Response) => {
  try {
    const { subject_id, raw_curriculum_text } = req.body;

    if (!subject_id || !raw_curriculum_text) {
      return res.status(400).json({ error: 'مطلوب معرف المنهج والنص الخام' });
    }

    const systemInstruction = `
  أنت خبير مناهج دراسية ومصمم محتوى تعليمي تفاعلي للثانوية العامة المصرية.
  مهتك هي تحليل النص الخام وتوليد درس كاملاً يتطابق مع الواجهة البرمجية للموقع.

  يجب أن يحتوي المخرج على:
  1. البيانات الأساسية للدرس: اسم الوحدة، اسم الدرس، مستوى الصعوبة (سهل/متوسط/صعب)، المدة المتوقعة بالدقائق، ونقاط المافأة.
  2. شرح كامل للدرس، وليس ملخصا مختصرا، مع التعريفات والقوانين والتفاصيل.
  3. السلايدات التفاعلية (PowerPoint).
  4. الرسومات والتخطيطات (وصف دقيق للرسمات البيانية أو المخططات).
  5. كويز تقييمي متطابق مع أسئلة امتحانات كتاب الوزارة.
  اكتب كل النصوص العربية بدون تشكيل أو حركات.
  أضف أمثلة محلولة خطوة بخطوة، وأخطاء شائعة، وتركات امتحان.
  أنشئ امتحانا مستقلا من 10 أسئلة بالضبط، وواجبا مستقلا من 15 سؤالا بالضبط.
  كل سؤال اختيار من متعدد بأربع اختيارات، مع الإجابة الصحيحة وشرحها.
  `;

      const prompt = `
  المادة العلمية الخام المأخوذة من كتاب الوزارة:
  """
  ${raw_curriculum_text}
  """

قم بستخراج وتقسيم الدرس وتوليد عناصر المحتوى بالكامل.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            unit_title: { type: Type.STRING },
            lesson_title: { type: Type.STRING },
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
                      trick: { type: Type.STRING }
                    },
                    required: ['slide_number', 'heading', 'content', 'trick']
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
          required: ['unit_title', 'lesson_title', 'difficulty', 'duration_minutes', 'points_reward', 'coins_cost', 'content']
        }
      }
    });
    const result = JSON.parse(response.text!);
    const { data: dbLesson, error: dbError } = await supabase
        .from('lessons')
        .insert([
        {
            subject_id,
            unit_title: result.unit_title,
            chapter_name: result.unit_title,
            lesson_title: result.lesson_title,
            difficulty: result.difficulty,
            duration_minutes: result.duration_minutes,
            points_reward: result.points_reward,
            coins_cost: result.coins_cost || 15,
            content_json: result.content
        }
        ])
        .select();

    if (dbError) throw dbError;

    res.status(200).json({
        message: 'تم تقسيم الدرس وتوليد المحتوى بالكامل بنجاح',
        lesson: dbLesson[0]
    });
    } catch (error: any) {
    console.error('❌ خطأ في التوليد الشامل:', error);
    res.status(500).json({ error: error.message || 'خطأ في السيرفر' });
}
};
export async function generateLessonFromPDF(req: Request, res: Response): Promise<void> {
  try {
    const { filePath, subjectId, bookTitle } = req.body;

    if (!filePath || !subjectId || !bookTitle) {
      res.status(400).json({
        error: 'Missing required parameters: filePath, subjectId, and bookTitle are required.'
      });
      return;
    }

    processBookPDF(filePath, subjectId, bookTitle).catch((err) => {
      console.error('❌ Background PDF processing error:', err);
    });

    res.status(202).json({
      success: true,
      message: 'PDF ingestion pipeline initiated successfully.',
      data: { bookTitle, subjectId }
    });
  } catch (error: any) {
    console.error('❌ Failed to initiate PDF lesson generation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while initiating PDF generation.'
    });
  }
}