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
    let subscriptionTier = req.user.subscriptionTier || 'free';
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

    // Add `isLocked` attribute based on subscription tier
    filteredModels = filteredModels.map(category => {
      return {
        ...category,
        options: category.options.map(option => {
          if (subscriptionTier === 'free') {
            return {
              ...option,
              isLocked: option.isPro, // Locked if it's a pro model
            };
          } else {
            return {
              ...option,
              isLocked: false, // No models locked for premium users
            };
          }
        }),
      };
    });

    return res.status(200).json(filteredModels);

  } catch (err) {
    return res
      .status(500)
      .json({ error: 'Failed to retrieve model list.', details: err.message });
  }
});




export default router;