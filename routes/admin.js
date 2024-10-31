// admin.js
import express from 'express';
import admin from 'firebase-admin';
import adminMiddleware from '../middleware/adminMiddleware.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// admin.js
/**
 * Route to create a new user and assign the 'admin' role immediately.
 * Accessible by existing admins.
 */
router.post('/signupAdmin', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
  
      // Create the user with Firebase Authentication
      const userRecord = await admin.auth().createUser({
        email,
        password,
        emailVerified: false,
        disabled: false,
      });
  
      const db = admin.firestore();
      const userRef = db.collection('users').doc(userRecord.uid);
  
      // Add the admin role to the Firestore user document
      await userRef.set({ email, role: 'admin' });
  
      res.json({ message: `Admin user created successfully with ID ${userRecord.uid}`, userId: userRecord.uid });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create admin user', details: error.message });
    }
  });
// Get all pending chats for admin approval
router.get("/approval-chats/pending", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const db = admin.firestore();
      const pendingChatsRef = db.collection("approvalChats").where("status", "==", "pending");
  
      const snapshot = await pendingChatsRef.get();
      const pendingChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
      res.json({ pendingChats });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending chats", details: error.message });
    }
  });
  
  // Approve a chat
router.patch("/approval-chats/:chatId/approve", authMiddleware, adminMiddleware, async (req, res) => {
try {
    const { chatId } = req.params;
    const db = admin.firestore();
    const chatRef = db.collection("approvalChats").doc(chatId);

    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
    return res.status(404).json({ error: "Chat not found" });
    }

    await chatRef.update({ status: "approved" });

    res.json({ message: `Chat ${chatId} approved` });
} catch (error) {
    res.status(500).json({ error: "Failed to approve chat", details: error.message });
}
});

// Disapprove a chat
router.patch("/approval-chats/:chatId/disapprove", authMiddleware, adminMiddleware, async (req, res) => {
try {
    const { chatId } = req.params;
    const db = admin.firestore();
    const chatRef = db.collection("approvalChats").doc(chatId);

    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
    return res.status(404).json({ error: "Chat not found" });
    }

    await chatRef.update({ status: "disapproved" });

    res.json({ message: `Chat ${chatId} disapproved` });
} catch (error) {
    res.status(500).json({ error: "Failed to disapprove chat", details: error.message });
}
});

// Create a chat in approvalChats collection with pending status
router.post("/approval-chats/create", authMiddleware, adminMiddleware, async (req, res) => {
try {
    const { name, botId } = req.body;

    const db = admin.firestore();
    const chatRef = await db.collection("approvalChats").add({
    name: name || "Untitled Chat",
    botId,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: "Chat created with pending status", chatId: chatRef.id });
} catch (error) {
    res.status(500).json({ error: "Failed to create pending chat", details: error.message });
}
});

// Fetch analytics (example: count of pending, approved, and disapproved chats)
router.get("/analytics", authMiddleware, adminMiddleware, async (req, res) => {
try {
    const db = admin.firestore();

    // Query counts for each status
    const statusCounts = { pending: 0, approved: 0, disapproved: 0 };

    const chatsSnapshot = await db.collection("approvalChats").get();
    chatsSnapshot.forEach(doc => {
    const { status } = doc.data();
    if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
    }
    });

    res.json({ analytics: statusCounts });
} catch (error) {
    res.status(500).json({ error: "Failed to retrieve analytics", details: error.message });
}
});

export default router;
