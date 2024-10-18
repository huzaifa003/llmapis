// utils/apiKeyGenerator.js
import { v4 as uuidv4 } from 'uuid';

export const generateApiKey = () => {
  return uuidv4();
};
