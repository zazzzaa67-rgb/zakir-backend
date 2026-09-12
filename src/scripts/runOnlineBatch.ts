import fs from 'fs';
import path from 'path';
import { supabase } from '../config/supabase.js';
import { processBookPDF } from './ingestBook.js';

// 📌 قائمة كتب الفصل الدراسي الأول من مصادر الوزارة مع UUID المادة من قاعدة البيانات
export const ONLINE_BOOKS = [
  // ---------------- الصف الأول الثانوي ----------------
  {
    title: 'اللغة العربية - الصف الأول الثانوي',
    subjectId: 'b4b0c16e-73bc-4fd8-af96-0e2c562edece',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry1/Term1/StudentBook/arabic_1sec_t1.pdf',
  },
  {
    title: 'اللغة الإنجليزية - الصف الأول الثانوي',
    subjectId: '718fe5a4-290c-41f7-849d-4a81be4e2685',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry1/Term1/StudentBook/English_1sec_t1.pdf',
  },
  {
    title: 'الرياضيات - الصف الأول الثانوي',
    subjectId: '520485e6-1fe5-41ad-990b-b150be26bb1c',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry1/Term1/StudentBook/Mathematics_AR_Tr1_Secondary.pdf',
  },
  {
    title: 'التاريخ - الصف الأول الثانوي',
    subjectId: '13793b78-5122-4b6e-a567-7b0e5dbeb8c3',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry1/Term1/StudentBook/History_Sec1_Tr1.pdf',
  },
  {
    title: 'العلوم المتكاملة - الصف الأول الثانوي',
    subjectId: 'ffb54673-70df-42a3-8744-75814ec7a999', // ID العلوم المتكاملة من جدولك
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry1/Term1/StudentBook/integratedscience_ARABIC_1_Secondary_TR1.pdf',
  },
  {
    title: 'الفلسفة والمنطق - الصف الأول الثانوي',
    subjectId: '44444444-4444-4444-8444-444444444444',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry1/Term1/StudentBook/Philosophy_and_Logic_Tr1_1sec.pdf',
  },

  // ---------------- الصف الثاني الثانوي ----------------
  {
    title: 'اللغة العربية - الصف الثاني الثانوي',
    subjectId: '78a00e46-e014-430e-9034-3b2f7bd0cd4a',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Arabic-EB-part1.pdf',
  },
  {
    title: 'اللغة الإنجليزية - الصف الثاني الثانوي',
    subjectId: 'b549eb0c-e9d8-4f23-b91e-8538629e65bc',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Eng-L1-EB-Part1.pdf',
  },
  {
    title: 'الرياضيات - الصف الثاني الثانوي (مسار الطب والعلوم)',
    subjectId: '72aa458f-eec6-4e75-a4a0-45c67719629e',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Mathematics-Ar-EB-Part1.pdf',
  },
  {
    title: 'التاريخ - الصف الثاني الثانوي (بكالوريا)',
    subjectId: '108a30dd-f36a-434b-bb76-f2eeacd19477',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/EgyptianHistory-Ar-EB-part1.pdf',
  },
  {
    title: 'الفيزياء - الصف الثاني الثانوي (مسار طب وعلوم حياة)',
    subjectId: 'b81b7239-abb9-491e-804c-e158c587a477',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Physics-Ar-EB-part2.pdf',
  },
  {
    title: 'الكيمياء - الصف الثاني الثانوي (مسار الهندسة والحاسب)',
    subjectId: '01bbd336-d818-4721-be65-be23f1629afd',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Chemistry-Ar-EB-part1.pdf',
  },
  {
    title: 'علم النفس - الصف الثاني الثانوي (مسار الآداب والفنون)',
    subjectId: 'e0f213a2-cc98-4012-b173-a9c6f3903333',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Psychology-EB-part1.pdf',
  },
  {
    title: 'المحاسبة - الصف الثاني الثانوي (مسار الأعمال)',
    subjectId: 'a3fd11e8-36a4-4e9a-8077-aa31ccbf4bae',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Accuonting-Ar-EB-Part1.pdf',
  },
  {
    title: 'إدارة الأعمال - الصف الثاني الثانوي (مسار الأعمال)',
    subjectId: '20bfb3cc-95fa-4ccc-abce-313cf5ab81d6',
    url: 'https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Business-AR-EB-Part1.pdf',
  },
  // ---------------- الصف الثالث الثانوي ----------------
  {
    title: 'اللغة العربية - الصف الثالث الثانوي',
    subjectId: '074f5e5f-f975-4ee9-813a-ac732cccc613',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/Arabic_language_Sec3.pdf',
  },
  {
    title: 'اللغة الإنجليزية - الصف الثالث الثانوي',
    subjectId: '761786d3-f7ac-4355-88ea-16a2a9cc7590',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/English_language_Sec3_tr1.pdf',
  },
  {
    title: 'الرياضيات البحتة - الصف الثالث الثانوي',
    subjectId: 'ff869c6d-1613-4f6e-9258-ab5edebf1896',
      url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/pure_Mathematics_ARABIC_Sec3.pdf',
  },
  {
    title: 'الإحصاء - الصف الثالث الثانوي (شعبة الأدبي)',
    subjectId: '93515fea-6f90-4f66-89ab-3a8d665732c2',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/Statistics_Arabic_Sec3.pdf',
  },
  {
    title: 'التاريخ - الصف الثالث الثانوي (شعبة الأدبي)',
    subjectId: 'c08f64f9-7579-4ec5-bbf7-96004c9b4653',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/History_Sec3.pdf',
  },
  {
    title: 'الجغرافيا - الصف الثالث الثانوي (شعبة الأدبي)',
    subjectId: '43a01cfa-6de2-4646-a8ae-39022ef6e87a',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/Geography_Sec3.pdf',
  },
  {
    title: 'الفيزياء - الصف الثالث الثانوي',
    subjectId: 'd9cad980-5680-406e-ac9e-553c78113dcd',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/Physics_Arabic_Sec3.pdf',
  },
  {
    title: 'الأحياء - الصف الثالث الثانوي (علمي علوم)',
    subjectId: 'cdfd5d7a-89c0-4951-8b96-46602b91cb4c',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/Biology_ARABIC_Sec3.pdf',
  },
  {
    title: 'الكيمياء - الصف الثالث الثانوي (علمي علوم)',
    subjectId: '7b529a48-7f35-4521-bd58-1579231ea094',
    url: 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/Chemistry_Arabic_Sec3.pdf',
  },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// دالة تنزيل الملف المؤقت من الرابط
async function downloadPdfFromUrl(url: string, tempPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
    throw new Error(`فشل تحميل الكتاب من الرابط: status ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));
}

async function startBatchProcess() {
  let stoppedBecauseOfQuota = false;
    const hasPlaceholder = ONLINE_BOOKS.some((book) =>
    book.subjectId.includes('UUID_') || book.url.includes('example.com')
    );
    if (hasPlaceholder) {
    throw new Error('املأ روابط الكتب و subjectId الحقيقية في ONLINE_BOOKS قبل التشغيل.');
    }

    console.log(`🚀 بدء معالجة [${ONLINE_BOOKS.length}] كتاباً من الروابط أونلاين...\n`);

    for (let i = 0; i < ONLINE_BOOKS.length; i++) {
    const book = ONLINE_BOOKS[i];
    const tempFilePath = path.join(process.cwd(), `temp_book_${Date.now()}.pdf`);

    console.log(`==================================================`);
    console.log(`📖 [${i + 1}/${ONLINE_BOOKS.length}] معالجة: ${book.title}`);
    console.log(`🔗 الرابط: ${book.url}`);
    console.log(`==================================================`);
    try {
      // 1. فحص هل تم معالجة الكتاب سابقاً لعدم تكرار استهلاك API
        const { data: existingBook } = await supabase
        .from('books')
        .select('id, status')
        .eq('title', book.title)
        .eq('status', 'completed')
        .maybeSingle();

        if (existingBook) {
        console.log(`⏩ الكتاب [${book.title}] مكتمل وموجود مسبقاً، جاري التخطي...\n`);
        continue;
        }

        // 2. تنزيل مؤقت
        console.log(`📥 جاري جلب الكتاب من النت...`);
        await downloadPdfFromUrl(book.url, tempFilePath);

      // 3. معالجة وتوليد المذكرات بواسطة Gemini و Puppeteer
        console.log(`⚡ جاري التوليد واستخراج الدروس وتوليد المذكرات...`);
        await processBookPDF(tempFilePath, book.subjectId, book.title, {
          sourceUrl: book.url,
          sourceName: 'وزارة التربية والتعليم المصرية',
          term: 1,
        });

        console.log(`✅ اكتملت معالجة [${book.title}] بنجاح!\n`);

    } catch (error) {
        console.error(`❌ حدث خطأ في [${book.title}]:`, error);
      if (String(error).includes('نفدت كل مفاتيح Gemini')) {
        console.error('🛑 توقفت المعالجة حتى لا يتم استهلاك محاولات إضافية. أعد التشغيل بعد تجدد الحصة.');
        stoppedBecauseOfQuota = true;
        break;
      }
        console.log(`⚠️ سيتم التجاوز والكتاب التالي سيربط تلقائياً...\n`);
    } finally {
      // 4. مسح الملف المؤقت دائماً
        if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        }
    }
    // انتظار 5 ثوانٍ بين كل كتاب
    await delay(5000);
    }

    if (stoppedBecauseOfQuota) {
      console.log('⏸️ توقفت الدفعة مؤقتاً بسبب حصة Gemini. أعد التشغيل بعد تجدد الحصة لاستكمال الكتب.');
    } else {
      console.log(`🎉 تم الانتهاء من معالجة جميع الكتب أونلاين!`);
    }
}

if (process.argv[1]?.endsWith('runOnlineBatch.ts') || process.argv[1]?.endsWith('runOnlineBatch.js')) {
  startBatchProcess();
}