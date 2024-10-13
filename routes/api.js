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
import {modelsData, imageModelsData} from '../data/modelList.js';
const router = express.Router();

// Start a new chat session
router.post('/chat/start', authMiddleware, apiKeyMiddleware, async (req, res) => {
  try {
    const { name } = req.body;  // Get the chat name from the request body

    // Ensure req.user.uid is valid
    if (!req.user || !req.user.user_id) {
      throw new Error('User UID not found');
    }

    const db = admin.firestore();
    const chatsRef = db
      .collection('users')
      .doc(req.user.user_id)
      .collection('chats');

    // Add the new chat document with a name (if provided) and the creation timestamp
    const chatDoc = await chatsRef.add({
      name: name || 'Untitled Chat', // Default name if none is provided
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ chatId: chatDoc.id, name: name || 'Untitled Chat' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to start chat session.', details: err.message });
  }
});


// Delete a chat by chatId
router.delete('/chat/:chatId', authMiddleware, apiKeyMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;  // Extract chatId from URL params

    // Ensure req.user.uid is valid
    if (!req.user || !req.user.user_id) {
      throw new Error('User UID not found');
    }

    const db = admin.firestore();
    const chatRef = db
      .collection('users')
      .doc(req.user.user_id)
      .collection('chats')
      .doc(chatId);

    // Delete the chat document
    await chatRef.delete();

    res.json({ message: 'Chat deleted successfully', chatId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat.', details: err.message });
  }
});


// Edit a chat's name by chatId
router.put('/chat/:chatId', authMiddleware, apiKeyMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;  // Extract chatId from URL params
    const { name } = req.body;  // Get new name from the request body

    // Ensure req.user.uid is valid
    if (!req.user || !req.user.user_id) {
      throw new Error('User UID not found');
    }

    if (!name) {
      return res.status(400).json({ error: 'Name is required to update the chat.' });
    }

    const db = admin.firestore();
    const chatRef = db
      .collection('users')
      .doc(req.user.user_id)
      .collection('chats')
      .doc(chatId);

    // Update the chat document's name
    await chatRef.update({
      name: name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),  // Optionally, add updated timestamp
    });

    res.json({ message: 'Chat updated successfully', chatId, newName: name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update chat.', details: err.message });
  }
});





// Send a message in a chat session
router.post(
  '/stream/:chatId',
  authMiddleware,
  subscriptionMiddleware,
  async (req, res) => {
    const { chatId } = req.params;
    const { modelName, message, kwargs } = req.body;
    // console.log(kwargs);


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
      const modelMessages = history
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }))
        .filter((msg) => typeof msg.content === 'string' && msg.content.trim() !== '');


      // Append the new user message (ensure it's non-empty)
      if (message && message.trim() !== '') {
        modelMessages.push({ role: 'user', content: message });
      }

      // Ensure all parts are non-empty before sending to Gemini
      if (modelMessages.length === 0) {
        throw new Error('No valid content to process.');
      }

      let responseText;
      let tokensUsed = 0;

      if (modelName.startsWith('openai:')) {
        const model = getModelInstance(modelName, kwargs);

        // console.log(model)
        // OpenAI model interaction
        const response = await model.stream(modelMessages);
        responseText = '';
        tokensUsed = 0;
        for await (const chunk of response) {
          let chunkJson = chunk.toJSON();
          if (chunkJson.kwargs != undefined) {
            responseText += chunkJson.kwargs.content;
            res.write(chunkJson.kwargs.content);
            if (chunkJson.kwargs.usage_metadata != undefined) {
              tokensUsed += chunkJson.kwargs.usage_metadata.total_tokens;
            }
          }
        }


        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);

      } else if (modelName.startsWith('gemini:')) {
        responseText = '';
        tokensUsed = 0;
        // console.log(kwargs)
        const geminiModel = getModelInstance(modelName, kwargs);
        // console.log(geminiModel);

        const response = await geminiModel.stream(modelMessages);
        for await (const chunk of response) {
          let chunkJson = chunk.toJSON();
          if (chunkJson.kwargs != undefined) {
            if (chunkJson.kwargs.content != undefined && chunkJson.kwargs.content != '' && chunkJson.kwargs.content != 'undefined') {
              responseText += chunkJson.kwargs.content;
              res.write(chunkJson.kwargs.content);
            }
            if (chunkJson.kwargs.usage_metadata != undefined) {
              console.log(chunkJson.kwargs.usage_metadata.total_tokens);
              if (!isNaN(chunkJson.kwargs.usage_metadata.total_tokens) && chunkJson.kwargs.usage_metadata.total_tokens != '' && chunkJson.kwargs.usage_metadata.total_tokens != null) {
                tokensUsed += chunkJson.kwargs.usage_metadata.total_tokens;  
              }
              
            }
          }
        }

        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);
        

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


      res.end();
    } catch (err) {
      res.status(500).json({ error: 'Failed to process message.', details: err.message });
    }
  }
);




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
      const modelMessages = history
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }))
        .filter((msg) => typeof msg.content === 'string' && msg.content.trim() !== '');


      // Append the new user message (ensure it's non-empty)
      if (message && message.trim() !== '') {
        modelMessages.push({ role: 'user', content: message });
      }

      // Ensure all parts are non-empty before sending to Gemini
      if (modelMessages.length === 0) {
        throw new Error('No valid content to process.');
      }

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
        console.log(modelMessages)
        const response = await geminiModel.invoke(modelMessages);
        const jsonResGemini = response.toJSON();

        tokensUsed = jsonResGemini.kwargs.usage_metadata.total_tokens;
        responseText = jsonResGemini.kwargs.content;

        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);

      } else if (modelName.startsWith('imagegen:')) {
        // console.log(modelName);
        let modelId = modelName.split(":")[1];
        // console.log(modelId);

        // Call the generateImage function
        const response = await generateImage(message, modelId);
        // console.log(response);

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
      let time = Date.now();
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



// Endpoint to get all chatIds for a user
router.get('/chats', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userId = req.user.uid; // Assuming the user ID is stored in the decoded token

    // Reference to the user's chat collection
    const chatsRef = db.collection('users').doc(userId).collection('chats');
    const chatsSnapshot = await chatsRef.get();

    if (chatsSnapshot.empty) {
      return res.status(404).json({ message: 'No chats found for this user.' });
    }

    // Collecting chat data (chatId and name)
    const chats = [];
    chatsSnapshot.forEach(doc => {
      chats.push({
        chatId: doc.id,
        name: doc.data().name || 'Untitled Chat' // Default to 'Untitled Chat' if no name is provided
      });
    });

    // Return the list of chat IDs and names
    res.status(200).json({ chats });

  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ message: 'Error fetching chats.', error: error.message });
  }
});




router.get('/get-models', async (req, res) => {
  try {
    if (!req.query.model_type)
    {
      return res
        .status(500)
        .json({ error: 'Model type not specified.', details: 'model_type' });
    }

    if (req.query.model_type === 'chat'){
      return res
        .status(200)
        .json(modelsData);
    }

    if (req.query.model_type === 'image'){
      return res
        .status(200)
        .json(imageModelsData);
    }
    
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Failed to retrieve model list.', details: err.message });
  }
});

export default router;
