import { Router } from 'express';
import { chatAboutLesson, getLessonsBySubject, getLessonById, getPublicSampleLessons } from '../controllers/lessonsController.js';
const router = Router();
router.get('/', getLessonsBySubject);
router.get('/public-samples', getPublicSampleLessons);
router.post('/:id/chat', chatAboutLesson);
router.get('/:id', getLessonById);
export default router;
