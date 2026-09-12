import { Router } from 'express';
import { generateLessonFromPDF } from '../controllers/aiController.js';
const router = Router();
router.post('/generate-lesson', generateLessonFromPDF);
export default router;
