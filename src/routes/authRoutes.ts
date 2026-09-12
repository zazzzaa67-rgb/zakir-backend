import { Router } from 'express';
import { getMe, signIn, signUp } from '../controllers/authController.js';
import { requireStudent } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/signup', signUp);
router.post('/signin', signIn);
router.get('/me', requireStudent, getMe);
export default router;