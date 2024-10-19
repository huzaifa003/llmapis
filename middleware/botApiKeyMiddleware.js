// middleware/botApiKeyMiddleware.js
import admin from 'firebase-admin';

const botApiKeyMiddleware = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({ error: 'API key missing' });
    }

    const db = admin.firestore();
    const botsRef = db.collection('bots');
    const botQuerySnapshot = await botsRef.where('apiKey', '==', apiKey).get();

    if (botQuerySnapshot.empty) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Since apiKey is unique, there should be only one bot
    const botDoc = botQuerySnapshot.docs[0];
    const botData = botDoc.data();
    req.bot = {
      botId: botDoc.id,
      systemContext: botData.systemContext,
      modelName: botData.modelName,
      kwargs: botData.kwargs,
      ownerUserId: botData.ownerUserId, // Include ownerUserId
      apiKey: apiKey,
    };

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate API key', details: error.message });
  }
};

export default botApiKeyMiddleware;
