// middleware/subscriptionMiddleware.js
import admin from 'firebase-admin';

const subscriptionLimits = {
  free: 1000,
  proWeekly: 2500,
  proMonthly: 10000,
  proYearly: 120000,
  premiumWeekly: 5000,
  premiumMonthly: 20000,
  premiumYearly: 240000,
};

const imageGen = {
  free: 100,
  proWeekly: 250,
  proMonthly: 1000,
  proYearly: 12000,
  premiumWeekly: 500,
  premiumMonthly: 2000,
  premiumYearly: 24000,
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
    const subscriptionTier = (userData.subscriptionTier || 'free').toLowerCase();
    const tokenCount = userData.tokenCount || 0;
    const imageCount = userData.imageGenerationCount || 0;

    const tokenLimit = subscriptionLimits[subscriptionTier];
    const imageLimit = imageGen[subscriptionTier];

    if (typeof tokenLimit === 'undefined' || typeof imageLimit === 'undefined') {
      return res.status(403).json({ error: `Subscription tier "${subscriptionTier}" is invalid.` });
    }

    if (imageCount >= imageLimit) {
      return res.status(403).json({
        error: `Image limit exceeded. Limit: ${imageLimit}, Used: ${imageCount}`,
      });
    }

    if (tokenCount >= tokenLimit) {
      return res.status(403).json({
        error: `Token limit exceeded. Limit: ${tokenLimit}, Used: ${tokenCount}`,
      });
    }

    // Attach subscription data to the request for downstream processing
    req.user.subscriptionTier = subscriptionTier;
    req.user.tokenCount = tokenCount;
    req.user.imageCount = imageCount;

    next();
  } catch (err) {
    res.status(500).json({ error: 'Subscription check failed.', details: err.message });
  }
};

export default subscriptionMiddleware;

