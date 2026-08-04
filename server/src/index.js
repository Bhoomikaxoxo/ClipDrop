import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import extractRoutes from './routes/extract.js';
import downloadRoutes from './routes/download.js';
import { ensureTempDir, startPeriodicCleanup } from './utils/cleanup.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Allowed CORS origins (Vercel frontend domain support)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive CORS for single-user dev/self-hosted
  },
  credentials: true
}));

app.use(express.json());

// Initialize Temp Dir & Periodic Cleanup Timer
ensureTempDir();
startPeriodicCleanup(5 * 60 * 1000, 15 * 60 * 1000); // Check every 5m, delete >15m old

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'ClipDrop API', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api', extractRoutes);
app.use('/api', downloadRoutes);

// Serve static React frontend in production if client/dist exists
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, '../../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Unhandled Error]:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`\n💧 ClipDrop Backend Server running on http://localhost:${PORT}`);
  console.log(`   Temp directory initialized at /server/temp`);
  console.log(`   Waiting for extraction & download requests...\n`);
});
