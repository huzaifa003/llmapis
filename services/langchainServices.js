// services/langchainService.js
const { OpenAI } = require('langchain/llms/openai');
const { GeminiModel } = require('@google-ai/gemini'); // Hypothetical import

const getModelInstance = (modelName) => {
  if (modelName.startsWith('openai')) {
    return new OpenAI({
      modelName,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  } else if (modelName.startsWith('gemini')) {
    // Return a placeholder as we handle Gemini models differently
    return { modelName };
  } else {
    throw new Error('Model not supported.');
  }
};

module.exports = { getModelInstance };
