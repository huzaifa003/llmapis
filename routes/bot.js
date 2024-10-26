import express from "express";
import admin from "firebase-admin";
import authMiddleware from "../middleware/authMiddleware.js";
import subscriptionMiddleware from "../middleware/subscriptionMiddleware.js";
import { calculateTokensUsedLangChain } from "../utils/tokenUtils.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import apiKeyMiddleware from "../middleware/apiKeyMiddleware.js";
import {
  getModelInstance,
  incrementTimestamp,
} from "../services/langchainServices.js";
import {
  fetchImg,
  generateDalleImg,
  generateImage,
} from "../services/stableDiffusionService.js";
import { modelsData, imageModelsData } from "../data/modelList.js";
import { generateApiKey } from "../services/apiKeyGenerator.js";
import botApiKeyMiddleware from "../middleware/botApiKeyMiddleware.js";

import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import multer from "multer";

// routes/bot.js
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store the file in memory
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { botName, systemContext, modelName, kwargs } = req.body;

    if (!botName || botName.trim() === "") {
      return res.status(400).json({ error: "Bot name is required" });
    }

    if (!systemContext) {
      return res.status(400).json({ error: "System context is required" });
    }

    const db = admin.firestore();
    const botsRef = db.collection("bots");

    // Generate a unique API key for the bot
    const apiKey = generateApiKey();

    // Create the bot document with botName
    const botDocRef = await botsRef.add({
      botName: botName.trim(), // store the bot's name
      systemContext,
      apiKey,
      ownerUserId: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      modelName: modelName || "openai:gpt-3.5-turbo", // default model
      kwargs: kwargs || {}, // optional model parameters
    });

    res.json({ botId: botDocRef.id, apiKey });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create bot", details: error.message });
  }
});

// Edit a bot by botId
router.put("/:botId", authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { botName, systemContext, modelName, kwargs } = req.body;

    if (!botName || botName.trim() === "") {
      return res.status(400).json({ error: "Bot name is required" });
    }

    if (!systemContext) {
      return res.status(400).json({ error: "System context is required" });
    }

    const db = admin.firestore();
    const botRef = db.collection("bots").doc(botId);

    // Check if the bot exists
    const botDoc = await botRef.get();
    if (!botDoc.exists) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Update the bot document
    await botRef.update({
      botName: botName.trim(),
      systemContext,
      modelName: modelName || "openai:gpt-3.5-turbo",
      kwargs: kwargs || {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Optional updated timestamp
    });

    res.json({ message: "Bot updated successfully", botId });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update bot", details: error.message });
  }
});

// Delete a bot by botId
router.delete("/:botId", authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;

    const db = admin.firestore();
    const botRef = db.collection("bots").doc(botId);

    // Check if the bot exists
    const botDoc = await botRef.get();
    if (!botDoc.exists) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Delete the bot document
    await botRef.delete();

    res.json({ message: "Bot deleted successfully", botId });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete bot", details: error.message });
  }
});



router.post("/add-avatar/:botId", authMiddleware, upload.single("avatarFile"), async (req, res) => {
  try {
    const { botId } = req.params;

    // Check if the avatar file is provided
    if (!req.file) {
      return res.status(400).json({ error: "Avatar file is required" });
    }

    const db = admin.firestore();
    const botRef = db.collection("bots").doc(botId);

    // Check if the bot exists
    const botDoc = await botRef.get();
    if (!botDoc.exists) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Define the file path in Firebase Storage
    const filePath = `${botId}/avatar/avatar.png`;

    // Access Firebase Storage bucket
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);

    // Upload the avatar file to Firebase Storage
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype, // Use the file's MIME type from multer
      },
    });

    // Optionally, make the file publicly accessible
    await file.makePublic();

    // Get the public URL
    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Update the bot document with the avatar URL
    await botRef.update({
      avatarFile: downloadURL,
    });

    res.json({ message: "Avatar added successfully", botId, avatarURL: downloadURL });
  } catch (error) {
    res.status(500).json({ error: "Failed to add avatar", details: error.message });
  }
});

router.delete("/delete-avatar/:botId", authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;

    const db = admin.firestore();
    const botRef = db.collection("bots").doc(botId);

    // Check if the bot exists
    const botDoc = await botRef.get();
    if (!botDoc.exists) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Define the file path in Firebase Storage
    const filePath = `${botId}/avatar/avatar.png`;

    // Access Firebase Storage bucket
    const bucket = admin.storage().bucket();

    // Delete the avatar file from Firebase Storage
    const file = bucket.file(filePath);
    await file.delete();

    // Update the bot document with the avatar URL
    await botRef.update({
      avatarFile: null,
    });

    res.json({ message: "Avatar deleted successfully", botId });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete avatar", details: error.message });
  }
});

// Get all chats for a bot

router.get("/:botId/chats", botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: "Bot ID mismatch" });
    }

    const db = admin.firestore();
    const chatsRef = db.collection("bots").doc(botId).collection("chats");

    // Retrieve all chats for the specified bot
    const chatsSnapshot = await chatsRef.get();
    const chats = chatsSnapshot.docs.map((doc) => ({
      chatId: doc.id,
      ...doc.data(),
    }));

    if (chats.length === 0) {
      return res.status(404).json({ message: "No chats found for this bot." });
    }

    res.json({ chats });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to retrieve chats.", details: err.message });
  }
});

router.get("/:botId/chat/:chatId", botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId, chatId } = req.params;

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: "Bot ID mismatch" });
    }

    const db = admin.firestore();
    const messagesRef = db
      .collection("bots")
      .doc(botId)
      .collection("chats")
      .doc(chatId)
      .collection("messages");

    console.log(botId);
    console.log(chatId);

    // Retrieve messages from Firestore

    const messagesSnapshot = await messagesRef.orderBy("timestamp").get();
    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (messages.length === 0) {
      return res
        .status(404)
        .json({ message: "No messages found for this chat." });
    }

    res.json({ messages });
  } catch (err) {
    res.status(500).json({
      error: "Failed to retrieve chat messages.",
      details: err.message,
    });
  }
});

router.post("/:botId/chat/start", botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { name } = req.body; // Optional chat name

    // Ensure the botId matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: "Bot ID mismatch" });
    }

    const db = admin.firestore();
    const chatsRef = db.collection("bots").doc(botId).collection("chats");

    // Create a new chat session with a name (optional) and a creation timestamp
    const chatDoc = await chatsRef.add({
      name: name || "Untitled Chat", // Default to 'Untitled Chat' if no name provided
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ chatId: chatDoc.id, name: name || "Untitled Chat" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to start chat session", details: error.message });
  }
});

router.get(
  "/:botId/chat/:chatId/embed",
  botApiKeyMiddleware,
  async (req, res) => {
    try {
      const { botId, chatId } = req.params;
      const { width = 400, height = 600 } = req.query; // Allow custom width and height
      const modelName = req.bot.modelName;
      if (!modelName) {
        return res.status(400).json({ error: "Model name is required in Bot" });
      }
      // console.log(modelName);

      const apiKey = req.bot.apiKey;
      const embedUrl = `${process.env.BACKEND_URL}/api/bot/${botId}/chat/${chatId}/widget?apiKey=${apiKey}&modelName=${modelName}`;
      // console.log("embeded", embedUrl);

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
      res.status(500).json({
        error: "Failed to generate embed code",
        details: error.message,
      });
    }
  }
);

// routes/api.js

router.post("/:botId/message", botApiKeyMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Ensure the botId from the URL matches the authenticated bot
    if (botId !== req.bot.botId) {
      return res.status(403).json({ error: "Bot ID mismatch" });
    }

    const db = admin.firestore();

    // Get the bot's system context, modelName, kwargs, and ownerUserId
    const { systemContext, modelName, kwargs, ownerUserId } = req.bot;

    // Ensure the owner user exists
    const userRef = db.collection("users").doc(ownerUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error("Owner user does not exist");
    }

    let responseText;
    let tokensUsed = 0;

    if (modelName.startsWith("openai:") || modelName.startsWith("gemini:")) {
      // Prepare the messages for the model
      const modelMessages = [
        { role: "system", content: systemContext },
        { role: "user", content: message },
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
    } else if (modelName.startsWith("imagegen:")) {
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
      throw new Error("Model not supported.");
    }

    // Save the message and response to Firestore
    const messagesRef = db.collection("bots").doc(botId).collection("messages");

    // Save user message
    await messagesRef.add({
      role: "user",
      content: message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Save bot response
    await messagesRef.add({
      role: "assistant",
      content: responseText,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ response: responseText });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to process message", details: error.message });
  }
});

router.post(
  "/:botId/chat/:chatId/stream",
  botApiKeyMiddleware,
  async (req, res) => {
    try {
      const { botId, chatId } = req.params;
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res
          .status(400)
          .json({ error: "Messages array is required and cannot be empty" });
      }

      // Ensure the botId from the URL matches the authenticated bot
      if (botId !== req.bot.botId) {
        return res.status(403).json({ error: "Bot ID mismatch" });
      }

      const db = admin.firestore();

      // Get the bot's system context, modelName, kwargs, and ownerUserId
      const { systemContext, modelName, kwargs, ownerUserId } = req.bot;

      // Ensure the owner user exists
      const userRef = db.collection("users").doc(ownerUserId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new Error("Owner user does not exist");
      }

      let tokensUsed = 0;
      let responseText = "";

      // Prepare the messages for the model
      const modelMessages = [{ role: "system", content: systemContext }];

      // Append each message from the request body
      for (const message of messages) {
        if (
          !message.role ||
          !message.content ||
          message.content.trim() === ""
        ) {
          return res.status(400).json({
            error: "Each message must have a role and non-empty content",
          });
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
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        Connection: "keep-alive",
      });

      if (modelName.startsWith("openai:")) {
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
      } else if (modelName.startsWith("gemini:")) {
        // Gemini streaming
        const response = await model.stream(modelMessages);
        for await (const chunk of response) {
          const chunkJson = chunk.toJSON();
          if (chunkJson.kwargs != undefined) {
            if (
              chunkJson.kwargs.content != undefined &&
              chunkJson.kwargs.content != "" &&
              chunkJson.kwargs.content != "undefined"
            ) {
              responseText += chunkJson.kwargs.content;
              res.write(chunkJson.kwargs.content);
            }
            if (chunkJson.kwargs.usage_metadata != undefined) {
              if (
                !isNaN(chunkJson.kwargs.usage_metadata.total_tokens) &&
                chunkJson.kwargs.usage_metadata.total_tokens != "" &&
                chunkJson.kwargs.usage_metadata.total_tokens != null
              ) {
                tokensUsed += chunkJson.kwargs.usage_metadata.total_tokens;
              }
            }
          }
        }
        res.end();
      } else if (
        modelName.startsWith("llama:") ||
        modelName.startsWith("mixtral")
      ) {
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
        console.log("Total Tokens:", tokensUsed);
        console.log("Content:", responseText);
      } else if (modelName.startsWith("anthropic:")) {
        const model = getModelInstance(modelName, kwargs);
        console.log(model);
        // OpenAI model interaction
        const response = await model.stream(modelMessages);
        console.log(response);
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
        console.log("Total Tokens:", tokensUsed);
        console.log("Content:", responseText);
      } else {
        throw new Error("Model not supported.");
      }

      // Update usage stats for the bot's owner
      await userRef.update({
        tokenCount: admin.firestore.FieldValue.increment(tokensUsed),
      });

      // Save the message and response to Firestore
      const messagesRef = db
        .collection("bots")
        .doc(botId)
        .collection("chats")
        .doc(chatId)
        .collection("messages");

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
        role: "assistant",
        content: responseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return;
    } catch (error) {
      res.write({ error: "Failed to process message", details: error.message });
      res.end();
    }
  }
);

router.post(
  "/:botId/chat/:chatId/image",
  botApiKeyMiddleware,
  async (req, res) => {
    try {
      const { botId, chatId } = req.params;
      const { message } = req.body;

      if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Ensure the botId from the URL matches the authenticated bot
      if (botId !== req.bot.botId) {
        return res.status(403).json({ error: "Bot ID mismatch" });
      }

      const db = admin.firestore();

      // Get the bot's system context, modelName, kwargs, and ownerUserId
      const { systemContext, modelName, kwargs, ownerUserId } = req.bot;

      // Ensure the owner user exists
      const userRef = db.collection("users").doc(ownerUserId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw new Error("Owner user does not exist");
      }

      if (modelName.startsWith("imagegen:")) {
        // Handle image generation
        const modelId = modelName.split(":")[1];

        // Call the generateImage function
        const response = await generateImage(message, modelId);

        if (response.status === 'error') {
          throw new Error('SD API Returned an Error: ' + JSON.stringify(response));
        }

        const requestId = response.id;

        // Update usage stats for the bot's owner
        await userRef.update({
          imageGenerationCount: admin.firestore.FieldValue.increment(1),
        });

        // Save the message and requestId to Firestore
        const messagesRef = db
          .collection("bots")
          .doc(botId)
          .collection("chats")
          .doc(chatId)
          .collection("messages");

        // Save user message
        await messagesRef.add({
          role: "user",
          content: message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Save bot response with requestId (we'll update this later when the image is ready)
        await messagesRef.add({
          role: "assistant",
          content: "Image generation in progress...",
          requestId: requestId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          generation: "imagegen",
        });

        res.json({ response: requestId });
      } else if (modelName.startsWith("dalle:")) {
        const response = await generateDalleImg(message, modelName);

        // Get the image URL from response
        console.log(response);
        const imageUrl = response[0].url;

        // Generate a unique file name
        const imageFileName = `${uuidv4()}.png`; // Adjust extension if necessary

        // Define the file path in Firebase Storage
        const filePath = `${botId}/${chatId}/images/${imageFileName}`;

        // Download the image and upload to Firebase Storage
        const bucket = admin.storage().bucket();

        const axiosResponse = await axios({
          url: imageUrl,
          method: "GET",
          responseType: "stream",
        });

        const file = bucket.file(filePath);

        await new Promise((resolve, reject) => {
          const writeStream = file.createWriteStream({
            metadata: {
              contentType: "image/png", // Adjust if necessary
            },
          });

          axiosResponse.data
            .pipe(writeStream)
            .on("finish", resolve)
            .on("error", reject);
        });

        // Optionally, make the file publicly accessible
        await file.makePublic();

        // Get the public URL
        const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        // Save the message and response to Firestore
        const messagesRef = db
          .collection("bots")
          .doc(botId)
          .collection("chats")
          .doc(chatId)
          .collection("messages");

        // Save user message
        await messagesRef.add({
          role: "user",
          content: message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        await userRef.update({
          imageGenerationCount: admin.firestore.FieldValue.increment(1),
        });

        // Save bot response with the Firebase Storage URL
        await messagesRef.add({
          role: "assistant",
          content: downloadURL,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          generation: "dalle",
        });

        res.json({ response: downloadURL });
      }
    } catch (error) {
      res
        .status(500)
        .json({ error: "Failed to generate image", details: error.message });
    }
  }
);

router.post("/get_images", botApiKeyMiddleware, async (req, res) => {
  try {
    const { request_id, chatId } = req.body;
    const { botId } = req.bot;

    if (!chatId) {
      return res.status(400).json({ error: "chatId is required" });
    }

    const response = await fetchImg(request_id);

    if (response.status === "success") {
      const imageUrl = response.output[0];

      // Proceed to download and upload the image to Firebase Storage
      const imageFileName = `${uuidv4()}.png`; // Adjust extension if necessary
      const filePath = `${botId}/${chatId}/images/${imageFileName}`;

      const bucket = admin.storage().bucket();

      const axiosResponse = await axios({
        url: imageUrl,
        method: "GET",
        responseType: "stream",
      });

      const file = bucket.file(filePath);

      await new Promise((resolve, reject) => {
        const writeStream = file.createWriteStream({
          metadata: {
            contentType: "image/png", // Adjust if necessary
          },
        });

        axiosResponse.data
          .pipe(writeStream)
          .on("finish", resolve)
          .on("error", reject);
      });

      // Optionally, make the file publicly accessible
      await file.makePublic();

      // Get the public URL
      const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      // Save the image URL to the conversation in Firestore
      const db = admin.firestore();
      const messagesRef = db
        .collection("bots")
        .doc(botId)
        .collection("chats")
        .doc(chatId)
        .collection("messages");

      // Save bot response
      await messagesRef.add({
        role: "assistant",
        content: downloadURL,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        generation: "imagegen",
      });

      // Return the URL to the client
      res.json({ response: downloadURL });
    } else {
      // If not yet ready, or error
      res.json(response);
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to process image", details: error });
  }
});

router.get(
  "/:botId/chat/:chatId/code-snippet/:language",
  botApiKeyMiddleware,
  async (req, res) => {
    try {
      const { botId, chatId, language } = req.params;

      // Ensure the botId matches the authenticated bot
      if (botId !== req.bot.botId) {
        return res.status(403).json({ error: "Bot ID mismatch" });
      }

      const apiKey = req.bot.apiKey; // Assuming the botApiKeyMiddleware adds apiKey to req.bot
      const endpoint = `${process.env.BACKEND_URL}/api/bot/${botId}/chat/${chatId}/stream`;

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

      let codeSnippet = "";

      // Select the language based on the URL
      switch (language.toLowerCase()) {
        case "js":
        case "javascript":
          codeSnippet = jsCode;
          break;
        case "python":
          codeSnippet = pythonCode;
          break;
        case "curl":
          codeSnippet = curlCode;
          break;
        case "php":
          codeSnippet = phpCode;
          break;
        default:
          return res.status(400).json({
            error:
              "Invalid language selection. Choose from js, python, curl, php.",
          });
      }

      res.send(codeSnippet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate code snippet",
        details: error.message,
      });
    }
  }
);

router.get("/:botId/chat/:chatId/widget", async (req, res) => {
  const { botId, chatId } = req.params;
  const { apiKey, modelName } = req.query;

  const widgetHTML = `
   <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chatbot Widget</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>



  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Poppins', sans-serif;
      background-color: #f0f0f0;
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
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      border-radius: 15px;
      overflow: hidden;
      border: 1px solid #ddd;
    }

    .chat-box {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      background-color: #f9f9f9;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .message-wrapper {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .message-wrapper.user {
      justify-content: flex-end;
    }

    .message-wrapper.bot {
      justify-content: flex-start;
    }

    .avatar {
      width: 45px;
      height: 45px;
      border-radius: 50%;
      margin-right: 15px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      display:none
    }

    .message-bubble {
      max-width: 70%;
      padding: 15px 20px;
      border-radius: 25px;
      font-size: 16px;
      line-height: 1.6;
      word-wrap: break-word;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
    }

    .message-bubble.user {
      background-color: #007bff;
      color: white;
      border-bottom-right-radius: 5px;
      margin-left: 10px;
    }

    .message-bubble.bot {
      background-color: #f1f1f1;
      color: #333;
      border-bottom-left-radius: 5px;
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
      border-radius: 30px;
      font-size: 16px;
      outline: none;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .chat-input:focus {
      border-color: #007bff;
    }

    .send-button {
      padding: 10px 25px;
      background-color: #007bff;
      border: none;
      border-radius: 25px;
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .send-button:disabled {
      background-color: #aaa;
    }

    .send-button:hover:not(:disabled) {
      background-color: #0056b3;
    }

    .loading-spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #007bff;
      border-radius: 50%;
      width: 25px;
      height: 25px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .chat-box::-webkit-scrollbar {
      width: 8px;
    }

    .chat-box::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }

    .fade-in {
      animation: fadeIn 0.5s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
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
    const modelName = '${modelName}';

    let conversationHistory = [];
    let streamingBubble = null;

    const apiUrl = modelName.startsWith('imagegen:') || modelName.startsWith('dalle:')
      ? '${process.env.BACKEND_URL}/api/bot/' + botId + '/chat/' + chatId + '/image'
      : '${process.env.BACKEND_URL}/api/bot/' + botId + '/chat/' + chatId + '/stream';

    chatInput.addEventListener('input', function() {
      sendButton.disabled = chatInput.value.trim() === '';
    });

    function cleanUpNewlines(text) {
      // Replace multiple consecutive newlines with a single newline
      text = text.replace(/\\n{2,}/g, '\\n');
      
      // Remove the trailing newline at the end
      return text.replace(/\\n+$/g, '');
    }



    let accumulatedContent = '';
    function appendMessage(content, className, avatarUrl, isStreaming = false, isImage = false) {
      if (isStreaming && streamingBubble) {
        
        accumulatedContent += String(content);

        // Re-parse the entire accumulated content
        streamingBubble.innerHTML = marked.parse(accumulatedContent);

        // Scroll to the bottom
        chatBox.scrollTop = chatBox.scrollHeight;
        
      } else {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message-wrapper', className, 'fade-in');

        const avatar = document.createElement('img');
        avatar.classList.add('avatar');
        avatar.src = avatarUrl;

        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message-bubble', className);

        if (isStreaming) {
          accumulatedContent = '';
          streamingBubble = messageBubble;
        }

        if (isImage) {
          messageBubble.innerHTML = '<img src="' + content + '" alt="Generated Image" width="200"/>';
        } else {
          messageBubble.innerHTML = content;
        }

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageBubble);
        chatBox.appendChild(messageWrapper);
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }

   async function pollForImage(imageId) {
  const imageApiUrl = '${process.env.BACKEND_URL}/api/bot/get_images';
  let imageGenerated = false;
  let retries = 0;
  const maxRetries = 8;

  while (!imageGenerated && retries < maxRetries) {
    const response = await fetch(imageApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ request_id: imageId })
    });

    if (response.ok) {
      const imageData = await response.json();
      const imageWrapper = chatBox.querySelector('.loading-spinner').parentNode;
      
      if (imageData.status === 'success') {
        const imageUrl = imageData.output[0];
        imageWrapper.parentNode.removeChild(imageWrapper);
        appendMessage(imageUrl, 'bot', 'bot-avatar.png', false, true);
        imageGenerated = true;
      } else if (imageData.status === 'error') {
        imageWrapper.parentNode.removeChild(imageWrapper);
        appendMessage('Error generating image.', 'bot', 'bot-avatar.png');
        imageGenerated = true;
      }
    }

    retries++; // Increment the retry counter
    if (!imageGenerated && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before retrying
    } else if (retries >= maxRetries) {
      const imageWrapper = chatBox.querySelector('.loading-spinner').parentNode;
      imageWrapper.parentNode.removeChild(imageWrapper);
      appendMessage('Max retries reached. Image generation failed.', 'bot', 'bot-avatar.png');
      break;
    }
  }
}



async function fetchImage(imageId) {
  const imageApiUrl = '${process.env.BACKEND_URL}/api/bot/get_images';

  try {
    const response = await fetch(imageApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ request_id: imageId, chatId:chatId }),
    });

    if (response.ok) {
      const imageData = await response.json();
      const imageWrapper = chatBox.querySelector('.loading-spinner').parentNode;
        const imageUrl = imageData.response; // Assuming response is now directly a URL
        imageWrapper.parentNode.removeChild(imageWrapper);
        appendMessage(imageUrl, 'bot', 'bot-avatar.png', false, true); // Image displayed
    } 
      else {
        imageWrapper.parentNode.removeChild(imageWrapper);
        appendMessage('Error generating image.', 'bot', 'bot-avatar.png'); // Handle error
      }
  } catch (error) {
    const imageWrapper = chatBox.querySelector('.loading-spinner').parentNode;
    imageWrapper.parentNode.removeChild(imageWrapper);
    console.error('Error:', error);
    appendMessage('Error generating image.', 'bot', 'bot-avatar.png');
  }
}



    async function streamResponse(reader) {
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          appendMessage(chunk, 'bot', 'bot-avatar.png', true);
        }
      }

      streamingBubble = null;
    }

    function sendMessage() {
      const userMessage = chatInput.value;
      if (userMessage.trim()) {
        appendMessage(userMessage, 'user', 'user-avatar.png');
        chatInput.value = '';
        sendButton.disabled = true;

        conversationHistory.push({ role: 'user', content: userMessage });
if(modelName.startsWith('imagegen:') || modelName.startsWith('dalle:')){

const loadingSpinnerHtml = '<div class="loading-spinner"></div>';
           appendMessage(loadingSpinnerHtml, 'bot', 'bot-avatar.png');
}
        if (modelName.startsWith('imagegen:') || modelName.startsWith('dalle:')) {
          
          fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ message: userMessage })
          })
          .then(response => response.json())
          .then(data => {
            if (modelName.startsWith('imagegen:')) {
              // For imagegen: models, poll for the image using the returned ID
              const imageId = data.response;
              fetchImage(imageId);
            } else if (modelName.startsWith('dalle:')) {
             
              const imageUrl = data.response;
           const imageWrapper = chatBox.querySelector('.loading-spinner').parentNode;
            imageWrapper.parentNode.removeChild(imageWrapper);
              appendMessage(imageUrl, 'bot', 'bot-avatar.png', false, true);

            }
          })
          .catch(error => {
            console.error('Error generating image:', error);
            appendMessage('Error generating image.', 'bot', 'bot-avatar.png');
          });
        } else {
          fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ messages: conversationHistory })
          })
          .then(response => {
            const reader = response.body.getReader();
            return streamResponse(reader);
          })
          .then(() => {
            conversationHistory.push({ role: 'assistant', content: '...' });
          })
          .catch(error => {
            console.error('Error streaming response:', error);
            appendMessage('Error communicating with the bot.', 'bot', 'bot-avatar.png');
          });
        }
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

// router.get('/:botId/chat/:chatId/embed', botApiKeyMiddleware, async (req, res) => {
//   try {
//     const { botId, chatId } = req.params;
//     const { width = 400, height = 600 } = req.query;  // Allow custom width and height

//     const apiKey = req.bot.apiKey;
//     const embedUrl = `http://localhost:5000/bot/${botId}/chat/${chatId}/widget?apiKey=${apiKey}&?`;

//     const embedCode = `
//   <iframe
//     src="${embedUrl}"
//     width="${width}"
//     height="${height}"
//     style="border:none; overflow:hidden"
//     scrolling="no"
//     frameborder="0"
//     allowfullscreen="true">
//   </iframe>
//   `;

//     res.json({ embedCode });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to generate embed code', details: error.message });
//   }
// });

router.get("/get-all-bots", authMiddleware, async (req, res) => {
  try {
    const db = admin.firestore();
    const botsRef = db.collection("bots");

    // Query for bots that belong to the logged-in user (user's UID is in req.user.uid)
    const userBotsSnapshot = await botsRef
      .where("ownerUserId", "==", req.user.uid)
      .get();

    if (userBotsSnapshot.empty) {
      return res.status(404).json({ message: "No bots found for this user" });
    }

    const bots = userBotsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(bots);
  } catch (error) {
    res.status(500).json({
      error: "Failed to retrieve bots for the user",
      details: error.message,
    });
  }
});

export default router;
