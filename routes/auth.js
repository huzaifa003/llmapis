// routes/auth.js
import express from 'express';
import admin from 'firebase-admin';
import axios from 'axios';
import crypto from 'crypto';  // To generate the API key
import apiKeyMiddleware from '../middleware/apiKeyMiddleware.js';
import authMiddleware from '../middleware/authMiddleware.js';
const router = express.Router();




// Register
router.post('/register', async (req, res) => {
  const { email, password, subscriptionTier } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY; // Get this from Firebase project settings

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


    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );

    const { idToken } = response.data;

    res.status(201).json({ message: 'User registered successfully and logged in.', idToken: idToken });
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


router.post('/validate-token', async (req, res) => {
  const idToken = req.header('Authorization')?.replace('Bearer ', '');

  if (!idToken) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // Verify the token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken, true); // 'true' to check for revocation
    res.status(200).json({ message: 'Token is valid.', uid: decodedToken.uid });
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      return res.status(403).json({ error: 'Token expired.' });
    }
    res.status(400).json({ error: 'Invalid token.', details: err.message });
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

// Generate API Key for user
router.post('/generate-api-key', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Generate a new API key using a cryptographic function
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Save the API key to Firestore under the user's document
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    // Store the API key in the user's document
    await userRef.update({ apiKey });

    res.json({
      message: 'API key generated successfully.',
      apiKey,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate API key.', details: err.message });
  }
});


// Verify Google ID Token Route
router.post('/verify-token', async (req, res) => {
  const { idToken } = req.body;  // The ID token sent from the client (Google Sign-In)

  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;  // Firebase user ID
    const email = decodedToken.email;

    // Optionally, you can check for additional claims or roles
    console.log('User authenticated:', email);

    // Respond with the authenticated user's info
    res.status(200).json({
      success: true,
      uid,
      email,
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired ID token.',
    });
  }
});

router.get('/get-api-key', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const apiKey = await userRef.get().then((doc) => {
      if (doc.exists) {
        res.send(doc.data().apiKey)
      }
      else {
        res.send({ message: 'No API key found for this user.' })
      }
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})

router.get('/get-subscription', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const subscriptionTier = await userRef.get().then((doc) => {
      if (doc.exists) {
        res.send(doc.data().subscriptionTier)
      }
      else {
        res.send({ message: 'No subscription tier found for this user.' })
      }
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})

router.get('/get-user', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const user = await userRef.get().then((doc) => {
      if (doc.exists) {
        res.send(doc.data())
      }
      else {
        res.send({ message: 'No user found for this user.' })
      }
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})

router.get('/get-users', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const usersRef = db.collection('users');
    const users = await usersRef.get().then((querySnapshot) => {
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      res.send(users)
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})


router.post('/update-user', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const data = req.body;
    await userRef.update(data);
    res.json({ message: 'User data updated successfully.' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})

router.post('/update-subscription', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const { subscriptionTier } = req.body;
    await userRef.update({ subscriptionTier });
    res.json({ message: 'Subscription tier updated successfully.' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})

router.post('/update-api-key', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const { apiKey } = req.body;
    await userRef.update({ apiKey });
    res.json({ message: 'API key updated successfully.' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})

router.delete('/delete-user', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    await userRef.delete();
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
}

);

router.get('/get_user_data', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const user = await userRef.get().then((doc) => {
      if (doc.exists) {
        res.send(doc.data())
      }
      else {
        res.send({ message: 'No user found for this user.' })
      }
    })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });
  }
})




export default router;
