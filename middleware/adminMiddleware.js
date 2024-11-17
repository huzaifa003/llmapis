// adminMiddleware.js
import admin from 'firebase-admin';

const adminMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.uid; // Assuming `req.user` is populated by `authMiddleware`

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const userRole = userData.role || 'user';

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
   
    next(); // User is an admin, proceed to the next middleware/route handler
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin status', details: error.message });
  }
};

export default adminMiddleware;