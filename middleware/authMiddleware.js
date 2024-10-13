// middleware/authMiddleware.js
const admin = require('firebase-admin');

const authMiddleware = async (req, res, next) => {
  const idToken = req.header('Authorization')?.replace('Bearer ', '');

  if (!idToken)
    return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.', details: err.message });
  }
};

module.exports = authMiddleware;
