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
    });
  } else if (modelName.startsWith('gemini:')) {
    const model = new ChatGoogleGenerativeAI({
        model: modelName,
        maxOutputTokens: 2048,
      });
    return model
  } else {
    throw new Error('Model not supported.');
  }
};

