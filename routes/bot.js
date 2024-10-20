import express from 'express';
import admin from 'firebase-admin';
import authMiddleware from '../middleware/authMiddleware.js';
import subscriptionMiddleware from '../middleware/subscriptionMiddleware.js';
import { calculateTokensUsedLangChain } from '../utils/tokenUtils.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import apiKeyMiddleware from '../middleware/apiKeyMiddleware.js';
import { getModelInstance, incrementTimestamp } from '../services/langchainServices.js';
import { fetchImg, generateImage } from '../services/stableDiffusionService.js';
import { modelsData, imageModelsData } from '../data/modelList.js';
import { generateApiKey } from '../services/apiKeyGenerator.js';
import botApiKeyMiddleware from '../middleware/botApiKeyMiddleware.js';

const router = express.Router();
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { botName, systemContext, modelName, kwargs } = req.body;

    if (!botName || botName.trim() === '') {
      return res.status(400).json({ error: 'Bot name is required' });
    }

    if (!systemContext) {
      return res.status(400).json({ error: 'System context is required' });
    }

    const db = admin.firestore();
    const botsRef = db.collection('bots');

    // Generate a unique API key for the bot
    const apiKey = generateApiKey();

    // Create the bot document with botName
    const botDocRef = await botsRef.add({
      botName: botName.trim(), // store the bot's name
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

// Edit a bot by botId
router.put('/:botId', authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { botName, systemContext, modelName, kwargs } = req.body;

    if (!botName || botName.trim() === '') {
      return res.status(400).json({ error: 'Bot name is required' });
    }

    if (!systemContext) {
      return res.status(400).json({ error: 'System context is required' });
    }

    const db = admin.firestore();
    const botRef = db.collection('bots').doc(botId);

    // Check if the bot exists
    const botDoc = await botRef.get();
    if (!botDoc.exists) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Update the bot document
    await botRef.update({
      botName: botName.trim(),
      systemContext,
      modelName: modelName || 'openai:gpt-3.5-turbo',
      kwargs: kwargs || {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Optional updated timestamp
    });

    res.json({ message: 'Bot updated successfully', botId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bot', details: error.message });
  }
});


// Delete a bot by botId
router.delete('/:botId', authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;

    const db = admin.firestore();
    const botRef = db.collection('bots').doc(botId);

    // Check if the bot exists
    const botDoc = await botRef.get();
    if (!botDoc.exists) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Delete the bot document
    await botRef.delete();

    res.json({ message: 'Bot deleted successfully', botId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete bot', details: error.message });
  }
});


router.get('/:botId/chats', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const db = admin.firestore();
    const chatsRef = db.collection('bots').doc(botId).collection('chats');

    // Retrieve all chats for the specified bot
    const chatsSnapshot = await chatsRef.get();
    const chats = chatsSnapshot.docs.map((doc) => ({
      chatId: doc.id,
      ...doc.data(),
    }));

    if (chats.length === 0) {
      return res.status(404).json({ message: 'No chats found for this bot.' });
    }

    res.json({ chats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve chats.', details: err.message });
  }
});




router.get('/:botId/chat/:chatId', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId } = req.params;

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const db = admin.firestore();
    const messagesRef = db
      .collection('bots')
      .doc(botId)
      .collection('chats')
      .doc(chatId)
      .collection('messages');

    console.log(botId);
    console.log(chatId);

    // Retrieve messages from Firestore

    const messagesSnapshot = await messagesRef.orderBy('timestamp').get();
    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));



    if (messages.length === 0) {
      return res.status(404).json({ message: 'No messages found for this chat.' });
    }

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve chat messages.', details: err.message });
  }
});



router.post('/:botId/chat/start', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { name } = req.body;  // Optional chat name

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const db = admin.firestore();
    const chatsRef = db.collection('bots').doc(botId).collection('chats');

    // Create a new chat session with a name (optional) and a creation timestamp
    const chatDoc = await chatsRef.add({
      name: name || 'Untitled Chat',  // Default to 'Untitled Chat' if no name provided
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ chatId: chatDoc.id, name: name || 'Untitled Chat' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start chat session', details: error.message });
  }
});



router.get('/:botId/chat/:chatId/embed', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId } = req.params;
    const { width = 400, height = 600 } = req.query;  // Allow custom width and height

    const apiKey = req.bot.apiKey;
    const embedUrl = `http://localhost:5000/api/bot/${botId}/chat/${chatId}/widget?apiKey=${apiKey}`;

    const embedCode = `
  <iframe
    src="${embedUrl}"
    width="${width}"
    height="${height}"
    style="border:none; overflow:hidden"
    scrolling="no"
    frameborder="0"
    allowfullscreen="true">
  </iframe>
  `;

    res.json({ embedCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate embed code', details: error.message });
  }
});


// routes/api.js



router.post('/:botId/message', botApiKeyMiddleware, async (req, res) => {
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


router.post('/:botId/chat/:chatId/stream', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId } = req.params;
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
    const userRef = db.collection('users').doc(ownerUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error('Owner user does not exist');
    }

    let tokensUsed = 0;
    let responseText = '';

    // Prepare the messages for the model
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
        const chunkJson = chunk.toJSON();
        if (chunkJson.kwargs != undefined) {
          responseText += chunkJson.kwargs.content;
          res.write(chunkJson.kwargs.content);
          if (chunkJson.kwargs.usage_metadata != undefined) {
            tokensUsed += chunkJson.kwargs.usage_metadata.total_tokens;
          }
        }
      }
      res.end();

    } else if (modelName.startsWith('gemini:')) {
      // Gemini streaming
      const response = await model.stream(modelMessages);
      for await (const chunk of response) {
        const chunkJson = chunk.toJSON();
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
    } else if (modelName.startsWith("llama:") || modelName.startsWith("mixtral")) {
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


    } else if (modelName.startsWith("anthropic:")) {
      const model = getModelInstance(modelName, kwargs);
      console.log(model);
      // OpenAI model interaction
      const response = await model.stream(modelMessages);
      console.log(response)
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
    } else {
      throw new Error('Model not supported.');
    }

    // Update usage stats for the bot's owner
    await userRef.update({
      tokenCount: admin.firestore.FieldValue.increment(tokensUsed),
    });

    // Save the message and response to Firestore
    const messagesRef = db.collection('bots').doc(botId).collection('chats').doc(chatId).collection('messages');

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



  } catch (error) {
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});




router.post('/:botId/chat/:chatId/image', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId } = req.params;
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

      const modelId = modelName.split(":")[1];

      // Call the generateImage function
      const response = await generateImage(message, modelId);

      if (response.status === 'error') {
        throw new Error('SD API Returned an Error: ' + response.message);
      }

      // The response may contain an ID or URL of the generated image
      const responseText = response.id || response.imageUrl;

      // Update usage stats for the bot's owner
      await userRef.update({
        imageGenerationCount: admin.firestore.FieldValue.increment(1),
      });

      // Save the message and response to Firestore
      const messagesRef = db.collection('bots').doc(botId).collection('chats').doc(chatId).collection('messages');

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

router.post('/get_images', botApiKeyMiddleware, async (req, res) => {
  try {
    fetchImg(req.body.request_id).then((response) => {
      let resp = { ...response, type: "image" }
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


router.get('/:botId/chat/:chatId/code-snippet/:language', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId, language } = req.params;

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: 'Bot ID mismatch' });
    }

    const apiKey = req.bot.apiKey;  // Assuming the botApiKeyMiddleware adds apiKey to req.bot
    const endpoint = `http://localhost:5000/api/bot/${botId}/chat/${chatId}/stream`;

    // JavaScript (Node.js) example
    const jsCode = `
const axios = require('axios');

const API_KEY = '${apiKey}';
const BOT_ID = '${botId}';
const CHAT_ID = '${chatId}';
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
CHAT_ID = '${chatId}'
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
$chatId = '${chatId}';
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




router.get('/:botId/chat/:chatId/widget', async (req, res) => {
  const { botId, chatId } = req.params;
  const { apiKey, modelName } = req.query; // Assume modelName is passed in the query string

  const widgetHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chatbot Widget</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
    }

    .chat-container {
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #e9ecef;
    }

    .chat-widget {
      width: 400px;
      height: 550px;
      background-color: #fff;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #ddd;
    }

    .chat-box {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      background-color: #fafafa;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chat-bubble {
      max-width: 75%;
      padding: 12px 18px;
      border-radius: 20px;
      font-size: 15px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .chat-bubble.user {
      background-color: #007bff;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 5px;
      text-align: right;
    }

    .chat-bubble.bot {
      background-color: #f1f1f1;
      color: #333;
      align-self: flex-start;
      border-bottom-left-radius: 5px;
      text-align: left;
    }

    .chat-input-container {
      display: flex;
      padding: 15px;
      border-top: 1px solid #ddd;
      background-color: #fff;
      align-items: center;
      gap: 10px;
    }

    .chat-input {
      flex: 1;
      padding: 12px 15px;
      border: 1px solid #ddd;
      border-radius: 25px;
      font-size: 15px;
      outline: none;
    }

    .chat-input:focus {
      border-color: #007bff;
    }

    .send-button {
      padding: 10px 20px;
      background-color: #007bff;
      border: none;
      border-radius: 25px;
      color: white;
      font-size: 15px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .send-button:disabled {
      background-color: #aaa;
    }

    .send-button:hover:not(:disabled) {
      background-color: #0056b3;
    }

    .chat-box::-webkit-scrollbar {
      width: 8px;
    }

    .chat-box::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
    }

  </style>
</head>
<body>
  <div class="chat-container">
    <div class="chat-widget">
      <div id="chat-box" class="chat-box"></div>
      <div class="chat-input-container">
        <input type="text" id="chat-input" class="chat-input" placeholder="Type a message..." />
        <button id="send-button" class="send-button" disabled>Send</button>
      </div>
    </div>
  </div>

  <script>
    const chatBox = document.getElementById('chat-box');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const apiKey = '${apiKey}';
    const botId = '${botId}';
    const chatId = '${chatId}';
    const modelName = '${modelName}'; // Use the modelName passed via the query parameter
    
    // Determine the correct API endpoint based on the model name
    const apiUrl = modelName.startsWith('imagegen:')
      ? 'http://localhost:5000/api/bot/' + botId + '/chat/' + chatId + '/image'
      : 'http://localhost:5000/api/bot/' + botId + '/chat/' + chatId + '/stream';

    chatInput.addEventListener('input', function() {
      sendButton.disabled = chatInput.value.trim() === '';
    });

    function appendMessage(content, className) {
      const bubble = document.createElement('div');
      bubble.classList.add('chat-bubble', className);
      bubble.innerHTML = content;
      chatBox.appendChild(bubble);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function sendMessage() {
      const userMessage = chatInput.value;
      if (userMessage.trim()) {
        // Add user message to chat
        appendMessage(userMessage, 'user');
        chatInput.value = '';
        sendButton.disabled = true;

        // Send user message to bot API
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ messages: [{ role: 'user', content: userMessage }] })
        })
        .then(response => response.text())
        .then(botResponse => {
          appendMessage(botResponse, 'bot');
        });
      }
    }

    sendButton.addEventListener('click', sendMessage);

    chatInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter' && !sendButton.disabled) {
        sendMessage();
      }
    });
  </script>
</body>
</html>
`;

  res.send(widgetHTML);
});




router.get('/:botId/chat/:chatId/embed', botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId } = req.params;
    const { width = 400, height = 600 } = req.query;  // Allow custom width and height

    const apiKey = req.bot.apiKey;
    const embedUrl = `http://localhost:5000/bot/${botId}/chat/${chatId}/widget?apiKey=${apiKey}`;

    const embedCode = `
  <iframe
    src="${embedUrl}"
    width="${width}"
    height="${height}"
    style="border:none; overflow:hidden"
    scrolling="no"
    frameborder="0"
    allowfullscreen="true">
  </iframe>
  `;

    res.json({ embedCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate embed code', details: error.message });
  }
});


router.get("/get-all-bots", authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const botsRef = db.collection('bots');

    // Query for bots that belong to the logged-in user (user's UID is in req.user.uid)
    const userBotsSnapshot = await botsRef.where('ownerUserId', '==', req.user.uid).get();

    if (userBotsSnapshot.empty) {
      return res.status(404).json({ message: 'No bots found for this user' });
    }

    const bots = userBotsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(bots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve bots for the user', details: error.message });
  }
});


export default router;