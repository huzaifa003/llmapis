// middleware/authMiddleware.js
// import admin from 'firebase-admin';

// const authMiddleware = async (req, res, next) => {
//   const idToken = req.header('Authorization')?.replace('Bearer ', '');

//   if (!idToken)
//     return res.status(401).json({ error: 'Access denied. No token provided.' });

//   try {
//     const decodedToken = await admin.auth().verifyIdToken(idToken);
//     req.user = decodedToken;
//     next();
//   } catch (err) {
//     res.status(400).json({ error: 'Invalid token.', details: err.message });
//   }
// };


// export default authMiddleware


import admin from 'firebase-admin';

const authMiddleware = async (req, res, next) => {
  const idToken = req.header('Authorization')?.replace('Bearer ', '');

  if (!idToken) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken, true); // 'true' ensures check for token revocation
    console.log("Decoded UID:", decodedToken.uid);

    // Fetch the latest user data from Firestore
    const db = admin.firestore();


    const userDoc = await db.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found in Firestore.' });
    }

    const userData = userDoc.data();

    // Override decodedToken with fields from Firestore and add new fields
    req.user = {
      ...decodedToken,      // Keep the data from the token
      ...userData           // Override or add fields from Firestore user data
    };

    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    // Check if the error is related to token expiration
    if (err.code === 'auth/id-token-expired') {
      return res.status(403).json({ error: 'Token expired.' });
    }
    // Handle other errors like invalid token
    res.status(400).json({ error: 'Invalid token.', details: err.message });
  }
};


export default authMiddleware;
