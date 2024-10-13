// services/langchainService.js
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export const getModelInstance = (modelName) => {
  if (modelName.startsWith('openai:')) {
    // console.log(typeof(String(process.env.OPENAI_API_KEY)))
    let finalName = modelName.replace('openai:', '');
    return new ChatOpenAI({
      modelName: finalName,
      openAIApiKey: String(process.env.OPENAI_API_KEY),
      cache: true,
    });
  } else if (modelName.startsWith('gemini:')) {
    let finalName= modelName.replace('gemini:', '');
    const model = new ChatGoogleGenerativeAI({
        model: finalName,
        apiKey: String(process.env.GEMINI_API_KEY),
        maxOutputTokens: 2048,
        cache: true,
      });
    return model
  } else {
    throw new Error('Model not supported.');
  }
};

