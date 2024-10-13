// routes/auth.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios');
const authMiddleware = require('../middleware/authMiddleware');

// Register
router.post('/register', async (req, res) => {
  const { email, password, subscriptionTier } = req.body;

  try {
    // Create user with email and password
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    // Set initial custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      subscriptionTier: subscriptionTier || 'Free',
    });

    // Initialize user data in Firestore
    const db = admin.firestore();
    await db.collection('users').doc(userRecord.uid).set({
      tokenCount: 0,
      subscriptionTier: subscriptionTier || 'Free',
    });

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    res
      .status(400)
      .json({ error: 'Registration failed.', details: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const apiKey = process.env.FIREBASE_API_KEY; // Get this from Firebase project settings

    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );

    const { idToken } = response.data;

    res.json({ idToken });
  } catch (err) {
    res.status(400).json({
      error: 'Login failed.',
      details: err.response.data.error.message,
    });
  }
});

// Update Subscription
router.post('/update-subscription', authMiddleware, async (req, res) => {
  const { subscriptionTier } = req.body;

  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);

    await userRef.update({ subscriptionTier });

    // Update custom claims (optional, if you need to check claims in security rules)
    await admin.auth().setCustomUserClaims(req.user.uid, {
      subscriptionTier,
    });

    res.json({ message: 'Subscription updated.' });
  } catch (err) {
    res
      .status(400)
      .json({ error: 'Subscription update failed.', details: err.message });
  }
});

module.exports = router;
