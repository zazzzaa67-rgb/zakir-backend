import { Router } from 'express';
import { createTeam, getInvitations, getTeam, inviteToTeam, leaveTeam, listTeams, respondToInvitation, searchStudents } from '../controllers/teamController.js';
import { requireStudent } from '../middleware/authMiddleware.js';

const router = Router();
router.get('/leaderboard', listTeams);
router.use(requireStudent);
router.get('/', getTeam);
router.get('/invitations', getInvitations);
router.get('/students', searchStudents);
router.post('/', createTeam);
router.post('/:teamId/invitations', inviteToTeam);
router.post('/invitations/:invitationId/respond', respondToInvitation);
router.delete('/membership', leaveTeam);
export default router;