// admin.js
import express from 'express';
import admin from 'firebase-admin';
import adminMiddleware from '../middleware/adminMiddleware.js';
import authMiddleware from '../middleware/authMiddleware.js';
import nodemailer from 'nodemailer';

import dotnev from "dotenv";
dotnev.config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "Gmail",
  host: "smtp.gmail.com",
  port: 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  secure: true,
})

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
  
      // Use Promise.all to wait for all asynchronous operations inside the map
      const pendingChats = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          console.log(data);
          const userRecord = await admin.auth().getUser(data.userId); // Fetch user email asynchronously
          return {
            id: doc.id,
            ...data,
            email: userRecord.email,
          };
        })
      );

  
      res.json({ pendingChats });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending chats", details: error.message });
    }
  });
  
  
// Approve a chat and update original chat status in bots collection
router.patch("/approval-chats/:chatId/approve", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const db = admin.firestore();
      const approvalChatRef = db.collection("approvalChats").doc(chatId);
  
      const approvalChatDoc = await approvalChatRef.get();
      if (!approvalChatDoc.exists) {
        return res.status(404).json({ error: "Chat not found in approvalChats" });
      }
  
      // Update status to 'approved' in approvalChats collection
      await approvalChatRef.update({ status: "approved" });
  
      // Also update the status in the corresponding bot's chat document
      const { botId, userId } = approvalChatDoc.data();
      const botChatRef = db.collection("bots").doc(botId).collection("chats").doc(chatId);
      
      const botChatDoc = await botChatRef.get();
      if (botChatDoc.exists) {
        await botChatRef.update({ status: "approved" });
      }
      if (userId) {
        const userRecord = await admin.auth().getUser(userId);
        const mailData = {
          from: process.env.EMAIL_USER,
          to: userRecord.email,
          subject: '🎉 Congratulations! Your Chat Approval is Complete 🎉',
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
              <h2 style="color: #4CAF50; text-align: center;">Congratulations, ${userRecord.displayName || 'User'}!</h2>
              <p style="font-size: 16px; line-height: 1.5;">
                We are excited to let you know that your chat request has been <strong>approved</strong> by <span style="color: #4CAF50; font-weight: bold;">Model Leap</span>! 🎉
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                You can now engage in your chat and connect with others. We hope this feature adds great value to your experience with Model Leap.
              </p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
              <p style="font-size: 14px; color: #777;">
                Best wishes,<br>
                The <strong>Model Leap</strong> Team
              </p>
              <footer style="text-align: center; margin-top: 20px; font-size: 12px; color: #aaa;">
                <p>© ${new Date().getFullYear()} Model Leap. All rights reserved.</p>
              </footer>
            </div>
          `
        };
        transporter.sendMail(mailData, function(error, info){
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });
    } else {
        console.log("No user ID found in approval chat document");
    }
    
      
      res.json({ message: `Chat ${chatId} approved and updated in bot's collection` });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve chat", details: error.message });
    }
  });
  
  // Disapprove a chat and update original chat status in bots collection
  router.patch("/approval-chats/:chatId/disapprove", authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { disapproveReason } = req.body;
      const db = admin.firestore();
      const approvalChatRef = db.collection("approvalChats").doc(chatId);
  
      const approvalChatDoc = await approvalChatRef.get();
      if (!approvalChatDoc.exists) {
        return res.status(404).json({ error: "Chat not found in approvalChats" });
      }
  
      // Update status to 'disapproved' in approvalChats collection
      if (!disapproveReason) {
        return res.status(400).json({ error: "Disapprove reason is required" });
      }
    
      await approvalChatRef.update({ status: "disapproved", disapproveReason });
      
  
      // Also update the status in the corresponding bot's chat document
      const { botId, userId } = approvalChatDoc.data();
      const botChatRef = db.collection("bots").doc(botId).collection("chats").doc(chatId);
  
      const botChatDoc = await botChatRef.get();
      if (botChatDoc.exists) {
        await botChatRef.update({ status: "disapproved", disapproveReason });
      }

      if (userId) {
        const userRecord = await admin.auth().getUser(userId);
        const mailData = {
          from: process.env.EMAIL_USER,
          to: userRecord.email,
          subject: '🚫 Chat Disapproved - Model Leap Notification',
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
              <h2 style="color: #d9534f; text-align: center;">Chat Disapproval Notice</h2>
              <p style="font-size: 16px; line-height: 1.5;">
                Dear ${userRecord.displayName || 'User'},
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                We regret to inform you that your chat request has been <strong>disapproved</strong> by <span style="color: #d9534f; font-weight: bold;">Model Leap</span>.
              </p>
              <p style="font-size: 16px; line-height: 1.5; color: #555;">
                Reason for disapproval: <strong>${disapproveReason}</strong>
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                If you have any questions or require further clarification, please feel free to reach out to our support team. We encourage you to review the guidelines and re-submit your chat for approval if appropriate.
              </p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
              <p style="font-size: 14px; color: #777;">
                Best regards,<br>
                The <strong>Model Leap</strong> Team
              </p>
              <footer style="text-align: center; margin-top: 20px; font-size: 12px; color: #aaa;">
                <p>© ${new Date().getFullYear()} Model Leap. All rights reserved.</p>
              </footer>
            </div>
          `
        };
        transporter.sendMail(mailData, function(error, info){
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });
    } else {
        console.log("No user ID found in approval chat document");
    }
      res.json({ message: `Chat ${chatId} disapproved and updated in bot's collection` });
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


router.post('/contact-us', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const db = admin.firestore();
    const contactRef = await db.collection("contact-us").add({
      name,
      email,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const emailData = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: 'Contact Us Message',
      html: `
        <h2 style="color: #d9534f; text-align: center;">Contact Us Message</h2>
        <p style="font-size: 16px; line-height: 1.5;">
          Name: ${name}
        </p>
        <p style="font-size: 16px; line-height: 1.5;">
          Email: ${email}
        </p>
        <p style="font-size: 16px; line-height: 1.5;">
          Message: ${message}
        </p>
      `
    };
    transporter.sendMail(emailData, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });

    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Contact Us Message',
      html: `
        <h2 style="color: #4CAF50; text-align: center;">Contact Us Message</h2>
        <p style="font-size: 16px; line-height: 1.5;">
          Thank you ${name} for reaching out to us. We will get back to you as soon as possible.
        </p>
      `
    }, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    })
    res.json({ message: "Message sent successfully", contactId: contactRef.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to send message", details: error.message });
  }
});
export default router;
