import { Router } from 'express';
import { 
  getStudentProfile, 
  submitExamResult, 
  getStudentErrors 
} from '../controllers/studentController.js';

const router = Router();

// مسار لجلب بيانات الطالب (البروفايل، النقاط، المستويات، والـ Streak)
router.get('/profile/:userId', getStudentProfile);

// مسار لتحديث نتيجة الامتحان، النقاط، الـ Coins، والـ Streak
router.post('/exam-result', submitExamResult);

// مسار لجلب الأخطاء الخاصة بالطالب (قسم الأخطاء)
router.get('/errors/:userId', getStudentErrors);

export default router;