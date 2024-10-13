// services/langchainService.js
import { OpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export const getModelInstance = (modelName) => {
  if (modelName.startsWith('openai')) {
    return new OpenAI({
      modelName,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  } else if (modelName.startsWith('gemini')) {
    const model = new ChatGoogleGenerativeAI({
        model: modelName,
        maxOutputTokens: 2048,
      });
    return model
  } else {
    throw new Error('Model not supported.');
  }
};

