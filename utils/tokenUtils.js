// utils/tokenUtils.js
import { encoding_for_model } from "@dqbd/tiktoken";

const calculateTokensUsedLangChain = async (model, messages, response) => {
  const modelName = model.modelName;
//   console.log(modelName);
  let tokensUsed = 0;

  if (modelName.includes('gpt')) {
    let finalName = modelName.replace('openai:', '');
    // OpenAI token calculation using tiktoken
    // console.log(finalName);
    const encoding = await encoding_for_model(finalName);

    messages.forEach((message) => {
      tokensUsed += encoding.encode(message.content).length + 4;
    });
    tokensUsed += 2;
    tokensUsed += encoding.encode(response).length;

    encoding.free();
  } else if (modelName.startsWith('gemini:')) {
    
    // Token counting for Gemini is handled via usage_metadata in the API response
    // So this function may not need to calculate tokens for Gemini
    // Return 0 or handle accordingly
    tokensUsed = 0;
  } else {
    throw new Error('Model not supported for token calculation.');
  }

  return tokensUsed;
};

export { calculateTokensUsedLangChain };
