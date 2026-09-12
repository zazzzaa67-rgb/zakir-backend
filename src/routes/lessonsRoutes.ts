import { Router } from 'express';
import { chatAboutLesson, getLessonsBySubject, getLessonById } from '../controllers/lessonsController.js';
const router = Router();
router.get('/', getLessonsBySubject);
router.post('/:id/chat', chatAboutLesson);
router.get('/:id', getLessonById);
export default router;