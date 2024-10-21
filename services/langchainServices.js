// services/langchainService.js
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from '@langchain/groq';
import { ChatAnthropic } from '@langchain/anthropic';

import admin from 'firebase-admin';

export const getModelInstance = (modelName, kwargs) => {
  if (modelName.startsWith('openai:')) {
    // console.log(typeof(String(process.env.OPENAI_API_KEY)))
    let finalName = modelName.replace('openai:', '');
    kwargs = kwargs || {}; // Ensure kwargs is initialized to an empty object if it's undefined
    kwargs['maxTokens'] = kwargs['maxOutputTokens'] || 2048;  // Default to 2048 if maxOutputTokens isn't provided
    kwargs['max_tokens'] = kwargs['maxOutputTokens'] || 2048;

    return new ChatOpenAI({
      modelName: finalName,
      openAIApiKey: String(process.env.OPENAI_API_KEY),
      cache: true,
      ...kwargs
    });
  } else if (modelName.startsWith('gemini:')) {
    let finalName = modelName.replace('gemini:', '');

    const model = new ChatGoogleGenerativeAI({
      model: finalName,
      apiKey: String(process.env.GEMINI_API_KEY),
      cache: true,
      ...kwargs
    });
    return model
  } else if (modelName.startsWith("llama:")) {
    let finalName = modelName.replace("llama:", '')

    const model = new ChatGroq({
      model: finalName,
      apiKey: String(process.env.GROQ_API_KEY),
      cache: true,
      ...kwargs,
    })
    return model

  } else if (modelName.startsWith("mixtral:")) {
    let finalName = modelName.replace("mixtral:", '')

    const model = new ChatGroq({
      model: finalName,
      apiKey: String(process.env.GROQ_API_KEY),
      cache: true,
      ...kwargs,
    })
    return model

  } else if (modelName.startsWith("anthropic:")) {
    let finalName = modelName.replace("anthropic:", '')

    const model = new ChatAnthropic({
      model: finalName,
      apiKey: String(process.env.ANTHROPIC_API_KEY),
      cache: true,
      ...kwargs,
    })
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
    let finalName = modelName.replace('gemini:', '');
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


// Function to increment nanoseconds
export function incrementTimestamp(timestamp, nanosecondsToAdd) {
  try {
    let newNanoseconds = timestamp.nanoseconds + nanosecondsToAdd;
    let newSeconds = timestamp.seconds;

    // If nanoseconds overflow, adjust seconds and nanoseconds
    if (newNanoseconds >= 1e9) {
      newSeconds += Math.floor(newNanoseconds / 1e9);
      newNanoseconds = newNanoseconds % 1e9;
    }

    return new admin.firestore.Timestamp(newSeconds, newNanoseconds);
  }
  catch (err) {
    console.log(err);
  }
}
