// utils/tokenUtils.js
const { encoding_for_model } = require('@dqbd/tiktoken');
// const { GeminiModel } = require('@google-ai/gemini'); // Not needed here

const calculateTokensUsedLangChain = async (model, messages, response) => {
  const modelName = model.modelName;
  let tokensUsed = 0;

  if (modelName.startsWith('openai')) {
    // OpenAI token calculation using tiktoken
    const encoding = await encoding_for_model(modelName);

    messages.forEach((message) => {
      tokensUsed += encoding.encode(message.content).length + 4;
    });
    tokensUsed += 2;
    tokensUsed += encoding.encode(response).length;

    encoding.free();
  } else if (modelName.startsWith('gemini')) {
    // Token counting for Gemini is handled via usage_metadata in the API response
    // So this function may not need to calculate tokens for Gemini
    // Return 0 or handle accordingly
    tokensUsed = 0;
  } else {
    throw new Error('Model not supported for token calculation.');
  }

  return tokensUsed;
};

module.exports = { calculateTokensUsedLangChain };
