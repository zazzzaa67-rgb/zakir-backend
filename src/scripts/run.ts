import { processBookPDF } from './ingestBook.js';
async function main() {
  // 1. مسار كتاب الـ PDF التجريبي الموجود لديك
    const filePath = './src/scripts/arabic1.pdf'; 
  // 2. معرف المادة الدراسية في Supabase (استبدله بـ ID حقيقي من جدول subjects)
    const subjectId = 'b4b0c16e-73bc-4fd8-af96-0e2c562edece'; 
  // 3. اسم الكتاب
    const bookTitle ='كتاب اللغة العربية-الصف الاول الثانوي';
    console.log('🚀 بدء تجربة رفع ومعالجة الكتاب...');
    await processBookPDF(filePath, subjectId, bookTitle);
}

main().catch((error: unknown) => {
  console.error('❌ فشل تشغيل خط معالجة الكتاب:', error);
  process.exitCode = 1;
});