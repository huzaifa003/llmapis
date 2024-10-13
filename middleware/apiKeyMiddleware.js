import admin from 'firebase-admin';

const apiKeyMiddleware = async (req, res, next) => {
  const apiKey = req.header('x-api-key');

  if (!apiKey) {
    return res.status(401).json({ error: 'API key missing' });
  }

  try {
    // Check Firestore for a user with this API key
    const db = admin.firestore();
    const usersRef = db.collection('users');
    const query = usersRef.where('apiKey', '==', apiKey);
    const querySnapshot = await query.get();

    if (querySnapshot.empty) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Get the user associated with the API key
    const userDoc = querySnapshot.docs[0];
    req.userAPI = userDoc.data();

    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to authenticate API key.', details: err.message });
  }
};

export default apiKeyMiddleware;