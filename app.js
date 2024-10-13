import express from 'express';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import cors from 'cors';  // Import cors
import authRoutes from './routes/auth.js';  // .js extension is required
import apiRoutes from './routes/api.js';
import fs from 'fs';  // Use fs to read the JSON file

dotenv.config();
const app = express();
const serviceAccount = JSON.parse(fs.readFileSync('./llms_private.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// Use CORS middleware
app.use(cors());  // This enables CORS for all routes by default

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
