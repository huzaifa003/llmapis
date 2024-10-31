import express from 'express';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import cors from 'cors';  // Import cors
import authRoutes from './routes/auth.js';  // .js extension is required
import botRoutes from './routes/bot.js'
import chatRoutes from './routes/chat.js'
import paymentRoutes from './routes/payment.js';
import modelRoutes from './routes/model.js'
import fs from 'fs';  // Use fs to read the JSON file
import adminRoutes from './routes/admin.js';
import logging from './middleware/logger.js';

dotenv.config();
const app = express();
const serviceAccount = JSON.parse(fs.readFileSync('./llms_private.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "llms-d6b5b.appspot.com"
});

// Use CORS middleware
app.use(cors());  // This enables CORS for all routes by default

//Logging for debugging
// app.use(logging);

// Apply express.json() to all routes except for the webhook
app.use((req, res, next) => {
    if (req.originalUrl === '/payments/webhook') {
      next();  // Skip body parsing for webhook
    } else {
      express.json()(req, res, next);  // Parse JSON body for all other routes
    }
  });

app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/model', modelRoutes);
app.use('/payments', paymentRoutes);




const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
