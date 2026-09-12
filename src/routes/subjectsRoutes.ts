import { Router } from 'express';
import { getSubjectsByTrack } from '../controllers/subjectsController.js';
const router = Router();
router.get('/', getSubjectsByTrack);
export default router;