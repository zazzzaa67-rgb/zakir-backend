import { NextFunction, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

declare global {
  namespace Express {
    interface Request { studentId?: string }
  }
}

export async function requireStudent(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'جلسة الدخول غير صالحة' });
  req.studentId = data.user.id;
  next();
}
