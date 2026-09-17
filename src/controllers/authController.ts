import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

function publicProfile(profile: any) {
  if (!profile) return profile;
  const { id, display_name, gender, grade_level, track_id, points, coins } = profile;
  return { id, display_name, gender, grade_level, track_id, points, coins };
}

export const signUp = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password, displayName: rawDisplayName, gender, gradeLevel, trackId } = req.body ?? {};
    const email = String(rawEmail ?? '').trim().toLowerCase();
    const displayName = String(rawDisplayName ?? '').trim();
    if (!email || !password || !displayName || !gender || !gradeLevel || !trackId) {
      return res.status(400).json({ error: 'كل بيانات الحساب والدراسة مطلوبة' });
    }
    if (!['boy', 'girl'].includes(gender) || ![1, 2, 3].includes(Number(gradeLevel))) {
      return res.status(400).json({ error: 'بيانات الطالب غير صحيحة' });
    }
    if (Number(gradeLevel) === 1 && trackId !== 'general_1st') {
      return res.status(400).json({ error: 'الصف الأول الثانوي يستخدم المسار العام' });
    }
    if (Number(gradeLevel) > 1 && !String(trackId).endsWith(`_${gradeLevel}nd`) && !String(trackId).endsWith(`_${gradeLevel}rd`)) {
      return res.status(400).json({ error: 'المسار لا يناسب الصف المختار' });
    }

    const { data: track, error: trackError } = await supabase
      .from('tracks')
      .select('id')
      .eq('id', trackId)
      .maybeSingle();
    if (trackError) {
      console.error('❌ تعذر التحقق من المسار:', trackError.message);
      return res.status(500).json({ error: 'تعذر الاتصال ببيانات المسارات. تأكد من تطبيق migrations في Supabase.' });
    }
    if (!track) return res.status(400).json({ error: 'المسار المختار غير موجود في قاعدة البيانات.' });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        gender,
        grade_level: Number(gradeLevel),
        track_id: trackId,
      },
    });
    if (authError || !authData.user) {
      console.error('❌ فشل إنشاء حساب Supabase:', authError?.message ?? 'unknown error');
      const authErrorMessage = authError?.message?.toLowerCase() ?? '';
      const isDuplicateEmail = authErrorMessage.includes('already registered')
        || authErrorMessage.includes('already exists')
        || authErrorMessage.includes('email_exists');
      const errorMessage = isDuplicateEmail
        ? 'هذا البريد الإلكتروني مسجل بالفعل. استخدم تسجيل الدخول أو بريدًا آخر.'
        : authError?.message ?? 'تعذر إنشاء الحساب';
      return res.status(400).json({ error: errorMessage });
    }

    const { data: profile, error: profileError } = await supabase.from('student_profiles').insert({
      id: authData.user.id,
      display_name: String(displayName).trim(),
      gender,
      grade_level: Number(gradeLevel),
      track_id: trackId,
    }).select().single();
    if (profileError) {
      console.error('❌ فشل إنشاء ملف الطالب:', profileError.message);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({ email, password });
    if (sessionError || !sessionData.session) return res.status(400).json({ error: sessionError?.message ?? 'تعذر تسجيل الدخول' });
    return res.status(201).json({ accessToken: sessionData.session.access_token, refreshToken: sessionData.session.refresh_token, profile: publicProfile(profile) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? 'تعذر إنشاء الحساب' });
  }
};

export const signIn = async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.warn('❌ فشل تسجيل الدخول:', error?.message ?? 'no session');
    const errorMessage = error?.message?.toLowerCase().includes('email not confirmed')
      ? 'يجب تأكيد البريد الإلكتروني أولا.'
      : 'البريد الإلكتروني أو كلمة المرور غير صحيحة. لو الحساب جديد، أنشئه أولا ببريد غير مستخدم.';
    return res.status(401).json({ error: errorMessage });
  }
  let { data: profile, error: profileError } = await supabase.from('student_profiles').select('*').eq('id', data.user.id).maybeSingle();
  if (profileError) {
    console.error('❌ فشل تحميل student_profiles:', profileError.message, profileError.details ?? '');
    return res.status(500).json({ error: 'تعذر تحميل بيانات الطالب. تأكد من تطبيق migration 004 على مشروع Supabase الصحيح.' });
  }

  if (!profile) {
    const metadata = data.user.user_metadata ?? {};
    const displayName = String(metadata.display_name ?? '').trim();
    const gender = metadata.gender;
    const gradeLevel = Number(metadata.grade_level);
    const trackId = String(metadata.track_id ?? '');
    const hasProfileData = Boolean(displayName && ['boy', 'girl'].includes(gender) && [1, 2, 3].includes(gradeLevel) && trackId);

    if (hasProfileData) {
      const { data: repairedProfile, error: repairError } = await supabase.from('student_profiles').upsert({
        id: data.user.id,
        display_name: displayName,
        gender,
        grade_level: gradeLevel,
        track_id: trackId,
      }).select().single();
      if (repairError) {
        console.error('❌ فشل إصلاح student_profiles:', {
          message: repairError.message,
          details: repairError.details,
          hint: repairError.hint,
          code: repairError.code,
          userId: data.user.id,
          trackId,
        });
        const missingTable = repairError.code === '42P01' || repairError.message.toLowerCase().includes('student_profiles');
        return res.status(500).json({
          error: missingTable
            ? 'جدول بيانات الطلاب غير موجود أو غير محدث. طبّق migration 004 في Supabase ثم أعد النشر.'
            : 'تعذر حفظ بيانات الطالب. راجع إعداد SUPABASE_SERVICE_KEY ووجود المسار المختار في جدول tracks.',
        });
      }
      profile = repairedProfile;
    } else {
      return res.status(409).json({ error: 'هذا الحساب يحتاج إكمال بيانات الطالب مرة واحدة.' });
    }
  }

  return res.json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, profile: publicProfile(profile) });
};

export const getMe = async (req: Request, res: Response) => {
  const userId = req.studentId;
  if (!userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const { data, error } = await supabase.from('student_profiles').select('*').eq('id', userId).single();
  if (error) return res.status(404).json({ error: 'ملف الطالب غير موجود' });
  return res.json({ profile: publicProfile(data) });
};
