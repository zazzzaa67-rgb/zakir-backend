import { Router } from 'express';
import { 
  getStudentProfile, 
  submitExamResult, 
  getStudentErrors,
  getLeaderboard,
  buyGem,
} from '../controllers/studentController.js';
import { requireStudent } from '../middleware/authMiddleware.js';

const router = Router();

// مسار لجلب بيانات الطالب (البروفايل، النقاط، المستويات، والـ Streak)
router.get('/profile', requireStudent, getStudentProfile);
router.get('/profile/:userId', requireStudent, getStudentProfile);

// مسار لتحديث نتيجة الامتحان، النقاط، الـ Coins، والـ Streak
router.post('/exam-result', requireStudent, submitExamResult);
router.post('/buy-gem', requireStudent, buyGem);

// مسار لجلب الأخطاء الخاصة بالطالب (قسم الأخطاء)
router.get('/errors', requireStudent, getStudentErrors);
router.get('/errors/:userId', requireStudent, getStudentErrors);
router.get('/leaderboard', requireStudent, getLeaderboard);

export default router;
