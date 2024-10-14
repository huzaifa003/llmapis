// services/langchainService.js
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export const getModelInstance = (modelName, kwargs) => {
  if (modelName.startsWith('openai:')) {
    // console.log(typeof(String(process.env.OPENAI_API_KEY)))
    let finalName = modelName.replace('openai:', '');
    kwargs = kwargs || {}; // Ensure kwargs is initialized to an empty object if it's undefined
    kwargs['maxTokens'] = kwargs['maxOutputTokens'] || 2048;  // Default to 2048 if maxOutputTokens isn't provided

    return new ChatOpenAI({
      modelName: finalName,
      openAIApiKey: String(process.env.OPENAI_API_KEY),
      cache: true,
      ...kwargs
    });
  } else if (modelName.startsWith('gemini:')) {
    let finalName= modelName.replace('gemini:', '');
    
    const model = new ChatGoogleGenerativeAI({
        model: finalName,
        apiKey: String(process.env.GEMINI_API_KEY),
        cache: true,
        ...kwargs
      });
    return model
  } else if (modelName.startsWith('imagegen:')) { // Add this line
    return null
  } else {
    throw new Error('Model not supported.');
  }
};


export const getStreamingModelInstance = (modelName) => {
  if (modelName.startsWith('openai:')) {
    // console.log(typeof(String(process.env.OPENAI_API_KEY)))
    let finalName = modelName.replace('openai:', '');
    return new ChatOpenAI({
      modelName: finalName,
      openAIApiKey: String(process.env.OPENAI_API_KEY),
      cache: true,
      streaming: true,
    });
  } else if (modelName.startsWith('gemini:')) {
    let finalName= modelName.replace('gemini:', '');
    const model = new ChatGoogleGenerativeAI({
        model: finalName,
        apiKey: String(process.env.GEMINI_API_KEY),
        maxOutputTokens: 2048,
        cache: true,
        streaming: true,
      });
    return model
  } else if (modelName.startsWith('imagegen:')) { // Add this line
    return null
  } else {
    throw new Error('Model not supported.');
  }
}
