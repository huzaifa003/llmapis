// middleware/subscriptionMiddleware.js
const admin = require('firebase-admin');

const subscriptionLimits = {
  Free: 1000,
  Pro: 10000,
  Premium: Infinity,
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
    const subscriptionTier = userData.subscriptionTier || 'Free';
    const tokenCount = userData.tokenCount || 0;
    const tokenLimit = subscriptionLimits[subscriptionTier];

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

module.exports = subscriptionMiddleware;
