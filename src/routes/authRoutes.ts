import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { supabase } from '../config/supabase.js';
import { requireStudent } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/signup', authController.signUp);
router.post('/signin', authController.signIn);
router.post('/refresh', async (req, res) => {
	const refreshToken = String(req.body?.refreshToken ?? '');
	if (!refreshToken) return res.status(400).json({ error: 'رمز تجديد الجلسة مطلوب' });
	const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
	if (error || !data.session || !data.user) return res.status(401).json({ error: 'جلسة الدخول منتهية' });
	const { data: profile, error: profileError } = await supabase.from('student_profiles').select('*').eq('id', data.user.id).single();
	if (profileError || !profile) return res.status(404).json({ error: 'ملف الطالب غير موجود' });
	return res.json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, profile });
});
router.get('/me', requireStudent, authController.getMe);
export default router;