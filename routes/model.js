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
import { modelsData, imageModelsData } from '../data/modelList.js';
import { generateApiKey } from '../services/apiKeyGenerator.js';
import botApiKeyMiddleware from '../middleware/botApiKeyMiddleware.js';
const router = express.Router();

router.get('/get-models', authMiddleware, async (req, res) => {
  try {
    const { model_type } = req.query;

    if (!model_type) {
      return res
        .status(400)
        .json({ error: 'Model type not specified.', details: 'model_type' });
    }

    // Retrieve user subscription tier
    let subscriptionTier = req.user.subscriptionTier || 'Free';
    subscriptionTier = subscriptionTier.toLowerCase();

    // Filter models based on model_type
    let filteredModels = [];

    if (model_type === 'chat') {
      filteredModels = modelsData;
    } else if (model_type === 'image') {
      filteredModels = imageModelsData;
    } else {
      return res
        .status(400)
        .json({ error: 'Invalid model type.', details: 'model_type' });
    }


    // If the user is on a Free plan, filter out pro models
    // if (subscriptionTier == 'free') {
    //   filteredModels = filteredModels.map(category => {
    //     return {
    //       ...category,
    //       options: category.options.filter(option => !option.isPro)
    //     };
    //   });
    // }

    return res.status(200).json(filteredModels);

  } catch (err) {
    return res
      .status(500)
      .json({ error: 'Failed to retrieve model list.', details: err.message });
  }
});




export default router;