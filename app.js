// app.js
const express = require('express');
const admin = require('firebase-admin');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json')),
});

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
