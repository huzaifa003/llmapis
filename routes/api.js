// routes/api.js
import express from 'express';
import admin from 'firebase-admin';
import authMiddleware from '../middleware/authMiddleware.js';
import subscriptionMiddleware from '../middleware/subscriptionMiddleware.js';
import { calculateTokensUsedLangChain } from '../utils/tokenUtils.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import apiKeyMiddleware from '../middleware/apiKeyMiddleware.js';
import { getModelInstance } from '../services/langchainServices.js';
import { fetchImg, generateImage } from '../services/stableDiffusionService.js';
const router = express.Router();


// Start a new chat session
router.post('/chat/start', authMiddleware, apiKeyMiddleware, async (req, res) => {
  try {
    // console.log('User UID:', req.user.user_id);
    // Ensure req.user.uid is valid
    if (!req.user || !req.user.user_id) {
      throw new Error('User UID not found');
    }

    
    const db = admin.firestore();
    const chatsRef = db
      .collection('users')
      .doc(req.user.user_id)
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
    console.log(modelName.startsWith('imagegen:'));

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

      let responseText;
      let tokensUsed = 0;

      if (modelName.startsWith('openai:')) {
        const model = getModelInstance(modelName);
        // OpenAI model interaction
        const response = await model.invoke(modelMessages);
        const jsonRes = response.toJSON();

        tokensUsed = jsonRes.kwargs.usage_metadata.total_tokens;
        responseText = jsonRes.kwargs.content;

        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);

      } else if (modelName.startsWith('gemini:')) {
        const geminiModel = getModelInstance(modelName);
        console.log(geminiModel);
        const response = await geminiModel.invoke(modelMessages);
        const jsonResGemini = response.toJSON();

        tokensUsed = jsonResGemini.kwargs.usage_metadata.total_tokens;
        responseText = jsonResGemini.kwargs.content;

        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);

      } else if (modelName.startsWith('imagegen:')) {
        console.log(modelName);
        let modelId = modelName.split(":")[1];
        console.log(modelId);
        
        // Call the generateImage function
        const response = await generateImage(message, modelId);
        console.log(response);

        responseText = "######REQUEST_ID:" + response.id;

        // Increment user's image generation count
        const userRef = db.collection('users').doc(req.user.uid);
        await userRef.update({
          imageGenerationCount: admin.firestore.FieldValue.increment(1),  // Increment image count
        });

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
      res.status(500).json({ error: 'Failed to process message.', details: err.message });
    }
  }
);



router.post('/get_images', authMiddleware, async (req, res) => {
  try {
    fetchImg(req.body.request_id).then((response) => {
      res.send(response)
    }).catch((error) => {
      console.log(error)
      res.send(error)
    })

  }
  catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ error: 'Failed to process message.', details: err.message });

  }
})
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

export default router;
