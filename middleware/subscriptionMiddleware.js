// middleware/subscriptionMiddleware.js
import admin from 'firebase-admin';

const subscriptionLimits = {
  free: 1000,
  pro: 10000,
  Premium: 10000000,
};

const imageGen = {
  free: 100,
  pro: 1000,
  premium: 3000,
};


const subscriptionMiddleware = async (req, res, next) => {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User data not found.' });
    }

    const userData = userDoc.data();
    const subscriptionTier = (userData.subscriptionTier.toLowerCase()) || 'free';
    const tokenCount = userData.tokenCount || 0;
    const tokenLimit = subscriptionLimits[subscriptionTier];
    const imageCount = userData.imageGenerationCount || 0;
    const imageLimit = imageGen[subscriptionTier];

    if (imageCount >= imageLimit) {
      return res.status(403).json({ error: 'Image limit exceeded.' });
    }

    if (tokenCount >= tokenLimit) {
      return res.status(403).json({ error: 'Token limit exceeded.' });
    }

    req.user.subscriptionTier = subscriptionTier;
    req.user.tokenCount = tokenCount;

    next();
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Subscription check failed.', details: err.message });
  }
};

export default subscriptionMiddleware;
