// routes/api.js
import express from 'express';
import admin from 'firebase-admin';
import authMiddleware from '../middleware/authMiddleware.js';
import subscriptionMiddleware from '../middleware/subscriptionMiddleware.js';
import { calculateTokensUsedLangChain } from '../utils/tokenUtils.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import apiKeyMiddleware from '../middleware/apiKeyMiddleware.js';
import { getModelInstance, incrementTimestamp } from '../services/langchainServices.js';
import { fetchImg, generateImage } from '../services/stableDiffusionService.js';
import {modelsData, imageModelsData} from '../data/modelList.js';
import { generateApiKey } from '../services/apiKeyGenerator.js';
import botApiKeyMiddleware from '../middleware/botApiKeyMiddleware.js';
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // Add the createdAt timestamp
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
    let { modelName, message, kwargs } = req.body;

    if (!kwargs) {
      kwargs = {};
    }
    console.log(kwargs);

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

      // Ensure all parts are non-empty before sending to the model
      if (modelMessages.length === 0) {
        throw new Error('No valid content to process.');
      }

      let responseText = '';
      let tokensUsed = 0;

      // Set headers before starting to stream
      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8'); // or appropriate content type

      if (modelName.startsWith('openai:')) {
        const model = getModelInstance(modelName, kwargs);

        // OpenAI model interaction
        const response = await model.stream(modelMessages);
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

        res.end();
        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);
      } else if (modelName.startsWith('gemini:')) {
        const geminiModel = getModelInstance(modelName, kwargs);

        const response = await geminiModel.stream(modelMessages);
        for await (const chunk of response) {
          let chunkJson = chunk.toJSON();
          if (chunkJson.kwargs != undefined) {
            if (
              chunkJson.kwargs.content != undefined &&
              chunkJson.kwargs.content != '' &&
              chunkJson.kwargs.content != 'undefined'
            ) {
              responseText += chunkJson.kwargs.content;
              res.write(chunkJson.kwargs.content);
            }
            if (chunkJson.kwargs.usage_metadata != undefined) {
              console.log(chunkJson.kwargs.usage_metadata.total_tokens);
              if (
                !isNaN(chunkJson.kwargs.usage_metadata.total_tokens) &&
                chunkJson.kwargs.usage_metadata.total_tokens != '' &&
                chunkJson.kwargs.usage_metadata.total_tokens != null
              ) {
                tokensUsed += chunkJson.kwargs.usage_metadata.total_tokens;
              }
            }
          }
        }

        res.end();

        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);
      } else {
        throw new Error('Model not supported.');
      }

      // Save user message to Firestore
      const userMessageRef = messagesRef.doc();
      await userMessageRef.set({
        role: 'user',
        content: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Save assistant response to Firestore
      const assistantMessageRef = messagesRef.doc();
      await assistantMessageRef.set({
        role: 'assistant',
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update token count
      const userRef = db.collection('users').doc(req.user.uid);
      await userRef.update({
        tokenCount: admin.firestore.FieldValue.increment(tokensUsed),
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: 'Failed to process message.', details: err.message });
    }
  }
);

// Send a message in a chat session
router.post(
  '/chat/',
  authMiddleware,
  apiKeyMiddleware,
  subscriptionMiddleware,
  async (req, res) => {
    
    const { modelName, message } = req.body;


    try {
      const db = admin.firestore();
      

      
      

      // Prepare the conversation history
      const modelMessages = [];

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

        // responseText = "######REQUEST_ID:" + response.id;
        responseText = response.id;

        // Increment user's image generation count
        const userRef = db.collection('users').doc(req.user.uid);
        await userRef.update({
          imageGenerationCount: admin.firestore.FieldValue.increment(1),  // Increment image count
        });

      } else {
        throw new Error('Model not supported.');
      }


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


// routes/api.js

router.post('/bot', authMiddleware, async (req, res) => {
  try {
    const { systemContext, modelName, kwargs } = req.body;

    if (!systemContext) {
      return res.status(400).json({ error: 'System context is required' });
    }

    const db = admin.firestore();
    const botsRef = db.collection('bots');

    // Generate a unique API key for the bot
    const apiKey = generateApiKey();

    // Create the bot document
    const botDocRef = await botsRef.add({
      systemContext,
      apiKey,
      ownerUserId: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      modelName: modelName || 'openai:gpt-3.5-turbo', // default model
      kwargs: kwargs || {}, // optional model parameters
    });

    res.json({ botId: botDocRef.id, apiKey });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bot', details: error.message });
  }
});


router.post('/bot/:botId/message', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Ensure the botId from the URL matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const db = admin.firestore();

    // Get the bot's system context, modelName, kwargs, and ownerUserId
    const { systemContext, modelName, kwargs, ownerUserId } = req.bot;

    // Ensure the owner user exists
    const userRef = db.collection('users').doc(ownerUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error('Owner user does not exist');
    }

    let responseText;
    let tokensUsed = 0;

    if (modelName.startsWith('openai:') || modelName.startsWith('gemini:')) {
      // Prepare the messages for the model
      const modelMessages = [
        { role: 'system', content: systemContext },
        { role: 'user', content: message },
      ];

      // Get the model instance
      const model = getModelInstance(modelName, kwargs);

      // Generate the response
      const response = await model.invoke(modelMessages);
      const jsonResponse = response.toJSON();
      responseText = jsonResponse.kwargs.content;
      tokensUsed = jsonResponse.kwargs.usage_metadata.total_tokens;

      // Update usage stats for the bot's owner
      await userRef.update({
        tokenCount: admin.firestore.FieldValue.increment(tokensUsed),
      });

    } else if (modelName.startsWith('imagegen:')) {
      // Handle image generation
      const modelId = modelName.split(":")[1];

      // Call the generateImage function
      const response = await generateImage(message, modelId);

      // The response may contain an ID or URL of the generated image
      responseText = response.id || response.imageUrl;

      // Update usage stats for the bot's owner
      await userRef.update({
        imageGenerationCount: admin.firestore.FieldValue.increment(1),
      });

    } else {
      throw new Error('Model not supported.');
    }

    // Save the message and response to Firestore
    const messagesRef = db.collection('bots').doc(botId).collection('messages');

    // Save user message
    await messagesRef.add({
      role: 'user',
      content: message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Save bot response
    await messagesRef.add({
      role: 'assistant',
      content: responseText,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ response: responseText });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});


router.post('/bot/:botId/stream', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required and cannot be empty' });
    }

    // Ensure the botId from the URL matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const db = admin.firestore();

    // Get the bot's system context, modelName, kwargs, and ownerUserId
    const { systemContext, modelName, kwargs, ownerUserId } = req.bot;

    // Ensure the owner user exists
    console.log(ownerUserId);
    const userRef = db.collection('users').doc(ownerUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error('Owner user does not exist');
    }

    let tokensUsed = 0;
    let responseText = '';

    if (modelName.startsWith('openai:') || modelName.startsWith('gemini:')) {
      // Prepare the messages for the model
      // Prepare the modelMessages array by adding system context first
      const modelMessages = [{ role: 'system', content: systemContext }];

      // Append each message from the request body
      for (const message of messages) {
        if (!message.role || !message.content || message.content.trim() === '') {
          return res.status(400).json({ error: 'Each message must have a role and non-empty content' });
        }
        modelMessages.push({
          role: message.role,
          content: message.content,
        });
      }

      // Get the model instance
      const model = getModelInstance(modelName, kwargs);

      // Set headers for streaming
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
      });

      if (modelName.startsWith('openai:')) {
        // OpenAI streaming
        const response = await model.stream(modelMessages);
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

        res.end();
        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);
        
      } else if (modelName.startsWith('gemini:')) {
        // Gemini streaming
        const response = await model.stream(modelMessages);
        for await (const chunk of response) {
          let chunkJson = chunk.toJSON();
          if (chunkJson.kwargs != undefined) {
            if (
              chunkJson.kwargs.content != undefined &&
              chunkJson.kwargs.content != '' &&
              chunkJson.kwargs.content != 'undefined'
            ) {
              responseText += chunkJson.kwargs.content;
              res.write(chunkJson.kwargs.content);
            }
            if (chunkJson.kwargs.usage_metadata != undefined) {
              console.log(chunkJson.kwargs.usage_metadata.total_tokens);
              if (
                !isNaN(chunkJson.kwargs.usage_metadata.total_tokens) &&
                chunkJson.kwargs.usage_metadata.total_tokens != '' &&
                chunkJson.kwargs.usage_metadata.total_tokens != null
              ) {
                tokensUsed += chunkJson.kwargs.usage_metadata.total_tokens;
              }
            }
          }
        }

        res.end();

        console.log('Total Tokens:', tokensUsed);
        console.log('Content:', responseText);
        
      }

      // Update usage stats for the bot's owner
      await userRef.update({
        tokenCount: admin.firestore.FieldValue.increment(tokensUsed),
      });

      // Save the message and response to Firestore
      const messagesRef = db.collection('bots').doc(botId).collection('messages');

      // Save each user message
      for (const message of messages) {
        await messagesRef.add({
          role: message.role,
          content: message.content,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Save bot response
      await messagesRef.add({
        role: 'assistant',
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return;

    } else if (modelName.startsWith('imagegen:')) {
      // Handle image generation
      // For image generation, streaming may not be applicable
      // So we handle it as before

      const modelId = modelName.split(":")[1];

      // Call the generateImage function
      const response = await generateImage(message, modelId);

      // The response may contain an ID or URL of the generated image
      const responseText = response.id || response.imageUrl;

      // Update usage stats for the bot's owner
      await userRef.update({
        imageGenerationCount: admin.firestore.FieldValue.increment(1),
      });

      // Save the message and response to Firestore
      const messagesRef = db.collection('bots').doc(botId).collection('messages');

      // Save user message
      await messagesRef.add({
        role: 'user',
        content: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Save bot response
      await messagesRef.add({
        role: 'assistant',
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ response: responseText });

    } else {
      throw new Error('Model not supported.');
    }

  } catch (error) {
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});



router.post('/bot/:botId/image', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Ensure the botId from the URL matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const db = admin.firestore();

    // Get the bot's system context, modelName, kwargs, and ownerUserId
    const { systemContext, modelName, kwargs, ownerUserId } = req.bot;

    // Ensure the owner user exists
    const userRef = db.collection('users').doc(ownerUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error('Owner user does not exist');
    }

    if (modelName.startsWith('imagegen:')) {
      // Handle image generation
      // For image generation, streaming may not be applicable
      // So we handle it as before

      const modelId = modelName.split(":")[1];

      // Call the generateImage function
      const response = await generateImage(message, modelId);
      
      if (response.status === 'error'){
        throw new Error('SD API Returned an Error Named : ' + response.message);
      }
        
      // The response may contain an ID or URL of the generated image
      const responseText = response.id || response.imageUrl;

      // Update usage stats for the bot's owner
      await userRef.update({
        imageGenerationCount: admin.firestore.FieldValue.increment(1),
      });

      // Save the message and response to Firestore
      const messagesRef = db.collection('bots').doc(botId).collection('messages');

      // Save user message
      await messagesRef.add({
        role: 'user',
        content: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Save bot response
      await messagesRef.add({
        role: 'assistant',
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ response: responseText });

    } else {
      throw new Error('Model not supported.');
    }

  } catch (error) {
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});







router.post(
  '/image/:chatId',
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

  

      let responseText;

      
      // console.log(modelName);
      let modelId = modelName.split(":")[1];
      // console.log(modelId);

      // Call the generateImage function
      const response = await generateImage(message, modelId);
      // console.log(response);

        // responseText = "######REQUEST_ID:" + response.id;
      responseText = response.id;

      // Increment user's image generation count
      const userRef = db.collection('users').doc(req.user.uid);
      await userRef.update({
        imageGenerationCount: admin.firestore.FieldValue.increment(1),  // Increment image count
      });


      // Save user message to Firestore
      const userMessageRef = messagesRef.doc();
      await userMessageRef.set({
        role: 'user',
        content: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Save assistant response to Firestore
      const assistantMessageRef = messagesRef.doc();
      await assistantMessageRef.set({
        role: 'assistant',
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
 

      res.json({ response: responseText });
    } catch (err) {
      res
        .status(500)
        .json({ error: 'Failed to process message.', details: err.message });
    }
  }
);





router.post('/get_images', authMiddleware, async (req, res) => {
  try {
    fetchImg(req.body.request_id).then((response) => {
      let resp = {...response, type: "image"}
      res.send(resp)
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
      .doc(req.user.user_id)
      .collection('chats')
      .doc(chatId)
      .collection('messages');

    const messagesSnapshot = await messagesRef.orderBy('timestamp').get();
    console.log(messagesSnapshot.docs)
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


// Endpoint to get all chatIds for a user, grouped by time periods
router.get('/chats-grouped', authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const userId = req.user.uid; // Assuming the user ID is stored in the decoded token

    // Reference to the user's chat collection
    const chatsRef = db.collection('users').doc(userId).collection('chats');
    const chatsSnapshot = await chatsRef.get();

    if (chatsSnapshot.empty) {
      return res.status(404).json({ message: 'No chats found for this user.' });
    }

    // Initialize grouped chats
    const groupedChats = {
      today: [],
      yesterday: [],
      past7Days: [],
      past30Days: [],
      older: [],
    };

    // Define date boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);
    const past7DaysStart = new Date(todayStart);
    past7DaysStart.setDate(todayStart.getDate() - 7);
    const past30DaysStart = new Date(todayStart);
    past30DaysStart.setDate(todayStart.getDate() - 30);

    // Group chats based on their 'createdAt' timestamp
    chatsSnapshot.forEach(doc => {
      const chatData = doc.data();
      const chatTimestamp = chatData.createdAt ? chatData.createdAt.toDate() : null;
      const chatInfo = {
        chatId: doc.id,
        name: chatData.name || 'Untitled Chat'
      };
      console.log(chatData)
      if (chatTimestamp) {
        if (chatTimestamp >= todayStart) {
          groupedChats.today.push(chatInfo);
        } else if (chatTimestamp >= yesterdayStart && chatTimestamp < todayStart) {
          groupedChats.yesterday.push(chatInfo);
        } else if (chatTimestamp >= past7DaysStart && chatTimestamp < yesterdayStart) {
          groupedChats.past7Days.push(chatInfo);
        } else if (chatTimestamp >= past30DaysStart && chatTimestamp < past7DaysStart) {
          groupedChats.past30Days.push(chatInfo);
        } else {
          groupedChats.older.push(chatInfo);
        }
      } else {
        // Handle chats without 'createdAt' by placing them in the 'older' group
        groupedChats.older.push(chatInfo);
      }
    });

    // Return the grouped chats
    res.status(200).json({ chats: groupedChats });

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

router.get('/bot/:botId/code-snippet/:language', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, language } = req.params;

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const apiKey = req.bot.apiKey;  // Assuming the botApiKeyMiddleware adds apiKey to req.bot
    const endpoint = `http://localhost:5000/bot/${botId}/stream`;

    // JavaScript (Node.js) example
    const jsCode = `
const axios = require('axios');

const API_KEY = '${apiKey}';
const BOT_ID = '${botId}';
const URL = '${endpoint}';

async function sendMessage(messages) {
  const response = await axios.post(URL, { messages }, {
    headers: { 'x-api-key': API_KEY }
  });
  console.log(response.data);
}

const messages = [
  { role: 'user', content: 'Hello, how are you?' },
  { role: 'user', content: 'Tell me a joke!' }
];

sendMessage(messages);
`;

    // Python example
    const pythonCode = `
import requests

API_KEY = '${apiKey}'
BOT_ID = '${botId}'
URL = '${endpoint}'

def send_message(messages):
    headers = { 'x-api-key': API_KEY }
    response = requests.post(URL, json={'messages': messages}, headers=headers)
    print(response.json())

messages = [
    {'role': 'user', 'content': 'Hello, how are you?'},
    {'role': 'user', 'content': 'Tell me a joke!'}
]

send_message(messages)
`;

    // cURL example
    const curlCode = `
curl -X POST ${endpoint} \\
-H "x-api-key: ${apiKey}" \\
-H "Content-Type: application/json" \\
-d '{
  "messages": [
    { "role": "user", "content": "Hello, how are you?" },
    { "role": "user", "content": "Tell me a joke!" }
  ]
}'
`;

    // PHP example
    const phpCode = `
<?php
$apiKey = '${apiKey}';
$botId = '${botId}';
$url = '${endpoint}';

$messages = [
    ["role" => "user", "content" => "Hello, how are you?"],
    ["role" => "user", "content" => "Tell me a joke!"]
];

$options = [
    'http' => [
        'header'  => "Content-type: application/json\\r\\n" .
                     "x-api-key: $apiKey\\r\\n",
        'method'  => 'POST',
        'content' => json_encode(['messages' => $messages]),
    ],
];
$context  = stream_context_create($options);
$result = file_get_contents($url, false, $context);
if ($result === FALSE) { /* Handle error */ }

var_dump($result);
?>
`;

    let codeSnippet = '';

    // Select the language based on the URL
    switch (language.toLowerCase()) {
      case 'js':
      case 'javascript':
        codeSnippet = jsCode;
        break;
      case 'python':
        codeSnippet = pythonCode;
        break;
      case 'curl':
        codeSnippet = curlCode;
        break;
      case 'php':
        codeSnippet = phpCode;
        break;
      default:
        return res.status(400).json({ error: 'Invalid language selection. Choose from js, python, curl, php.' });
    }

    res.send(codeSnippet);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate code snippet', details: error.message });
  }
});





export default router;
