// routes/api.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const authMiddleware = require('../middleware/authMiddleware');
const subscriptionMiddleware = require('../middleware/subscriptionMiddleware');
const { getModelInstance } = require('../services/langchainService');
const { calculateTokensUsedLangChain } = require('../utils/tokenUtils');
const { GeminiModel } = require('@google-ai/gemini'); // Hypothetical import

// Start a new chat session
router.post('/chat/start', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const chatsRef = db
      .collection('users')
      .doc(req.user.uid)
      .collection('chats');

    const chatDoc = await chatsRef.add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ chatId: chatDoc.id });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to start chat session.', details: err.message });
  }
});

// Send a message in a chat session
router.post(
  '/chat/:chatId',
  authMiddleware,
  subscriptionMiddleware,
  async (req, res) => {
    const { chatId } = req.params;
    const { modelName, message } = req.body;

    try {
      const db = admin.firestore();
      const messagesRef = db
        .collection('users')
        .doc(req.user.uid)
        .collection('chats')
        .doc(chatId)
        .collection('messages');

      // Retrieve previous messages
      const messagesSnapshot = await messagesRef.orderBy('timestamp').get();
      const history = messagesSnapshot.docs.map((doc) => doc.data());

      // Prepare the conversation history
      const modelMessages = history.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Append the new user message
      modelMessages.push({ role: 'user', content: message });

      // Get the model instance
      const model = getModelInstance(modelName);

      let responseText;
      let tokensUsed = 0;

      if (modelName.startsWith('openai')) {
        // OpenAI model interaction
        const response = await model.call(modelMessages);

        responseText = response.text;

        // Calculate tokens used
        tokensUsed = await calculateTokensUsedLangChain(
          model,
          modelMessages,
          responseText
        );
      } else if (modelName.startsWith('gemini')) {
        // Gemini model interaction

        // Initialize the Gemini model
        const geminiModel = new GeminiModel({
          model: modelName,
          apiKey: process.env.GEMINI_API_KEY,
        });

        // Start a chat session
        const chat = geminiModel.startChat({
          history: modelMessages.map((msg) => ({
            role: msg.role,
            parts: msg.content,
          })),
        });

        // Send the message and get the response
        const response = await chat.sendMessage(message);

        // Extract the response text
        responseText = response.candidates[0].content;

        // Calculate tokens used
        tokensUsed = response.usage_metadata.total_token_count;
      } else {
        throw new Error('Model not supported.');
      }

      // Save user message and assistant response to Firestore
      const batch = db.batch();

      const userMessageRef = messagesRef.doc();
      batch.set(userMessageRef, {
        role: 'user',
        content: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      const assistantMessageRef = messagesRef.doc();
      batch.set(assistantMessageRef, {
        role: 'assistant',
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      // Update token count
      const userRef = db.collection('users').doc(req.user.uid);
      await userRef.update({
        tokenCount: admin.firestore.FieldValue.increment(tokensUsed),
      });

      res.json({ response: responseText });
    } catch (err) {
      res
        .status(500)
        .json({ error: 'Failed to process message.', details: err.message });
    }
  }
);

// Get chat history
router.get('/chat/:chatId', authMiddleware, async (req, res) => {
  const { chatId } = req.params;

  try {
    const db = admin.firestore();
    const messagesRef = db
      .collection('users')
      .doc(req.user.uid)
      .collection('chats')
      .doc(chatId)
      .collection('messages');

    const messagesSnapshot = await messagesRef.orderBy('timestamp').get();

    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ messages });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to retrieve chat history.', details: err.message });
  }
});

module.exports = router;
