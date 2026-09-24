import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/aiRoutes.js';
import lessonsRoutes from './routes/lessonsRoutes.js';
import subjectsRoutes from './routes/subjectsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
dotenv.config();
const app = express();
const allowedOrigins = new Set([
	'https://zakir-front-end-oe9e.vercel.app',
	'http://localhost:5173',
	...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]);
app.use(cors({
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.has(origin)) return callback(null, true);
		return callback(new Error('Origin not allowed by CORS'));
	},
}));
app.use(express.json());
app.use('/api/ai', aiRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/subjects', subjectsRoutes);
app.use('/api/student', studentRoutes);
if (!process.env.VERCEL) {
	const port = Number(process.env.PORT ?? 5000);
	app.listen(port, () => {
		console.log(`API server listening on port ${port}`);
	});
}

export default app;
