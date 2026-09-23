import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

// 1. جلب بيانات الطالب (البروفايل، النقاط، المستويات، والـ Streak)
export const getStudentProfile = async (req: Request, res: Response) => {
    try {
    const userId = req.params.userId || (req as any).user?.id;
    const { data, error } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        return res.status(404).json({ error: 'لم يتم العثور على بيانات الطالب' });
    }
    // حساب الـ Level بناءً على كل 250 نقطة
    const points = data.points || 0;
    const calculatedLevel = Math.floor(points / 250) + 1;
    const pointsInCurrentLevel = points % 250;
    return res.json({
        ...data,
        level: calculatedLevel,
        points_progress: {
        current: pointsInCurrentLevel,
        target: 250,
        percentage: Math.round((pointsInCurrentLevel / 250) * 100)
        }
    });
    } catch (err) {
    console.error('Error fetching profile:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
    }
};

// 2. تحديث نتيجة الامتحان، النقاط، الـ Coins، والـ Streak
export const submitExamResult = async (req: Request, res: Response) => {
    try {
    const { userId, isPerfectScore } = req.body; // isPerfectScore: هل قفل الامتحان؟

    // تحديد المكافأة بناءً على قفل الامتحان أو لا
    const earnedPoints = isPerfectScore ? 10 : 5;
    const earnedCoins = isPerfectScore ? 5 : 3;

    // جلب البيانات الحالية للطالب
    const { data: profile, error: fetchError } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (fetchError || !profile) {
        return res.status(404).json({ error: 'الطالب غير موجود' });
    }

    const newPoints = (profile.points || 0) + earnedPoints;
    const newCoins = (profile.coins || 0) + earnedCoins;
    
    // حساب الـ Streak (إذا درس اليوم يتم زيادته، وإذا قطع يوم يعود للصفر - يمكن التحقق من آخر تاريخ تفاعل)
    const lastActiveDate = profile.last_active_date ? new Date(profile.last_active_date).toDateString() : '';
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let newStreak = profile.streak || 0;
    if (lastActiveDate === yesterday) {
        newStreak += 1;
    } else if (lastActiveDate !== today) {
      newStreak = 1; // يبدأ من جديد إذا انقطع يوم أو أكثر
    }

    // تحديث البيانات في قاعدة البيانات
    const { data: updatedData, error: updateError } = await supabase
        .from('student_profiles')
        .update({
        points: newPoints,
        coins: newCoins,
        streak: newStreak,
        last_active_date: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

    if (updateError) {
        return res.status(400).json({ error: 'فشل تحديث بيانات الطالب' });
    }

    return res.json({
        message: 'تم تحديث النتيجة بنجاح',
        earned: { points: earnedPoints, coins: earnedCoins },
        profile: updatedData
    });
    } catch (err) {
    console.error('Error submitting exam:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
    } 

};

// 3. إدارة قسم الأخطاء (جلب أخطاء الطالب المسجلة)
export const getStudentErrors = async (req: Request, res: Response) => {
    try {
    const { userId } = req.params;
    const { data, error } = await supabase
        .from('user_errors')
        .select('*')
        .eq('user_id', userId);
    if (error) {
        return res.status(400).json({ error: 'فشل في جلب الأخطاء' });
    }
    return res.json(data);
    } catch (err) {
    console.error('Error fetching errors:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
    }
};
export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId || (req as any).user?.id;

    // 1. جلب التراك والصف الخاصين بالطالب الحالي أولاً
    const { data: currentStudent, error: studentError } = await supabase
      .from('student_profiles')
      .select('grade_level, track_id')
      .eq('id', userId)
      .single();

    if (studentError || !currentStudent) {
      return res.status(404).json({ error: 'لم يتم العثور على بيانات الطالب الحالي' });
    }

    // 2. جلب أفضل الطلاب المشاركين في نفس الـ grade_level والـ track_id فقط
    const { data: leaderboard, error: leaderboardError } = await supabase
        .from('student_profiles')
        .select('id, display_name, points')
        .eq('grade_level', currentStudent.grade_level)
        .eq('track_id', currentStudent.track_id)
        .order('points', { ascending: false })
        .limit(100);

    if (leaderboardError) {
        return res.status(400).json({ error: 'فشل في جلب قائمة المتصدرين' });
    }

    // 3. تنسيق النتائج لإعلام الواجهة إن كان هذا العنصر هو الطالب الحالي
    const formattedLeaderboard = leaderboard.map((student, index) => ({
        rank: index + 1,
        id: student.id,
        name: student.display_name || 'طالب',
        points: student.points || 0,
        isMe: student.id === userId,
    }));

    return res.json(formattedLeaderboard);
    } catch (err) {
    console.error('Error fetching filtered leaderboard:', err);
    return res.status(500).json({ error: 'خطأ في الخادم' });
    }
};