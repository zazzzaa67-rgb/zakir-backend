import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

function studentId(req: Request): string | null {
  return req.studentId ?? null;
}

export const getTeam = async (req: Request, res: Response) => {
  const id = studentId(req);
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const { data: membership } = await supabase.from('study_team_members').select('team_id').eq('student_id', id).maybeSingle();
  if (!membership) return res.json({ team: null, invitations: [] });
  const { data: team, error } = await supabase.from('study_teams').select('id,name,gender,owner_id,created_at,study_team_members(student_id,joined_at,student_profiles(display_name,points))').eq('id', membership.team_id).single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ team, invitations: [] });
};

export const getInvitations = async (req: Request, res: Response) => {
  const id = studentId(req);
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const { data, error } = await supabase.from('study_team_invitations').select('id,team_id,status,created_at,study_teams(name),student_profiles!study_team_invitations_inviter_id_fkey(display_name)').eq('invitee_id', id).eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ invitations: data });
};

export const createTeam = async (req: Request, res: Response) => {
  const id = studentId(req);
  const name = String(req.body?.name ?? '').trim();
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  if (!name) return res.status(400).json({ error: 'اسم الفريق مطلوب' });
  const { data: profile } = await supabase.from('student_profiles').select('gender').eq('id', id).single();
  if (!profile) return res.status(404).json({ error: 'ملف الطالب غير موجود' });
  const { data: team, error } = await supabase.from('study_teams').insert({ name, gender: profile.gender, owner_id: id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  const { error: memberError } = await supabase.from('study_team_members').insert({ team_id: team.id, student_id: id });
  if (memberError) {
    await supabase.from('study_teams').delete().eq('id', team.id);
    return res.status(400).json({ error: memberError.message });
  }
  return res.status(201).json({ team });
};

export const inviteToTeam = async (req: Request, res: Response) => {
  const id = studentId(req);
  const { teamId } = req.params;
  const inviteeId = String(req.body?.inviteeId ?? '');
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const { data: team } = await supabase.from('study_teams').select('id,owner_id').eq('id', teamId).single();
  if (!team || team.owner_id !== id) return res.status(403).json({ error: 'مالك الفريق فقط يمكنه إرسال الدعوات' });
  const { data: invitee } = await supabase.from('student_profiles').select('id,gender').eq('id', inviteeId).single();
  const { data: owner } = await supabase.from('student_profiles').select('gender').eq('id', id).single();
  if (!invitee || !owner || invitee.gender !== owner.gender) return res.status(400).json({ error: 'الطالب يجب أن يكون من نفس النوع' });
  const { data, error } = await supabase.from('study_team_invitations').insert({ team_id: teamId, inviter_id: id, invitee_id: inviteeId }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json({ invitation: data });
};

export const searchStudents = async (req: Request, res: Response) => {
  const id = studentId(req);
  const query = String(req.query.q ?? '').trim();
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  if (query.length < 2) return res.json({ students: [] });
  const { data: profile } = await supabase.from('student_profiles').select('gender').eq('id', id).single();
  if (!profile) return res.status(404).json({ error: 'ملف الطالب غير موجود' });
  const { data, error } = await supabase.from('student_profiles').select('id,display_name,grade_level,track_id').eq('gender', profile.gender).ilike('display_name', `%${query}%`).neq('id', id).limit(10);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ students: data });
};

export const respondToInvitation = async (req: Request, res: Response) => {
  const id = studentId(req);
  const { invitationId } = req.params;
  const action = req.body?.action;
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  if (!['accepted', 'declined'].includes(action)) return res.status(400).json({ error: 'القرار غير صحيح' });
  const { data: invitation } = await supabase.from('study_team_invitations').select('*').eq('id', invitationId).eq('invitee_id', id).eq('status', 'pending').single();
  if (!invitation) return res.status(404).json({ error: 'الدعوة غير موجودة' });
  if (action === 'accepted') {
    const { error: memberError } = await supabase.from('study_team_members').insert({ team_id: invitation.team_id, student_id: id });
    if (memberError) return res.status(400).json({ error: memberError.message });
  }
  const { error } = await supabase.from('study_team_invitations').update({ status: action, responded_at: new Date().toISOString() }).eq('id', invitationId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ status: action });
};

export const leaveTeam = async (req: Request, res: Response) => {
  const id = studentId(req);
  if (!id) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const { error } = await supabase.from('study_team_members').delete().eq('student_id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
};

export const listTeams = async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('study_teams').select('id,name,gender,study_team_members(student_profiles(points))');
  if (error) return res.status(500).json({ error: error.message });
  const teams = (data ?? []).map((team: any) => ({
    id: team.id,
    name: team.name,
    gender: team.gender,
    totalPoints: (team.study_team_members ?? []).reduce((sum: number, member: any) => sum + Number(member.student_profiles?.points ?? 0), 0),
    memberCount: team.study_team_members?.length ?? 0,
  })).sort((a, b) => b.totalPoints - a.totalPoints);
  return res.json({ teams });
};
