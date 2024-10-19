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