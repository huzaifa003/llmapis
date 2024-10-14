import express from 'express';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import cors from 'cors';  // Import cors
import authRoutes from './routes/auth.js';  // .js extension is required
import apiRoutes from './routes/api.js';
import paymentRoutes from './routes/payment.js';
import fs from 'fs';  // Use fs to read the JSON file

dotenv.config();
const app = express();
const serviceAccount = JSON.parse(fs.readFileSync('./llms_private.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// Use CORS middleware
app.use(cors());  // This enables CORS for all routes by default

// Apply express.json() to all routes except for the webhook
app.use((req, res, next) => {
    if (req.originalUrl === '/payments/webhook') {
      next();  // Skip body parsing for webhook
    } else {
      express.json()(req, res, next);  // Parse JSON body for all other routes
    }
  });

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/payments', paymentRoutes);




const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
