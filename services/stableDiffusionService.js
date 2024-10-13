import axios from 'axios';

export async function generateImage(prompt, modelId = 'sdxlceshi', options = {}) {
  const apiKey = String(process.env.STABLE_DIFFUSION_API_KEY); // Replace with your actual API key
  const baseURL = 'https://modelslab.com/api/v6/images/text2img';  // Replace with actual API URL

  const defaultOptions = {
    negative_prompt: "painting, extra fingers, mutated hands...",
    width: 512,
    height: 512,
    samples: 1,
    num_inference_steps: 30,
    safety_checker: 'no',
    enhance_prompt: 'no',
    guidance_scale: 7.5,
    panorama: 'no',
    self_attention: 'no',
    upscale: 'no',
    scheduler: 'UniPCMultistepScheduler',
    tomesd: 'yes',
    use_karras_sigmas: 'yes',
    vae: null,
    lora_model: null,
    lora_strength: null,
    seed: null
  };

  const requestOptions = { ...defaultOptions, ...options };

  console.log(
    {
      key: apiKey,
      model_id: modelId,
      prompt: prompt,
      ...requestOptions
    }
  )
  console.log(apiKey);
  try {
    const response = await axios.post(baseURL, {
      key: apiKey,
      model_id: modelId,
      prompt: prompt,
      ...requestOptions
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;

  } catch (error) {
    // console.log(error) 
    console.error('Error generating image:', error.message);
    throw error;
  }
}

export async function fetchImg(request_id){
  const apiKey = String(process.env.STABLE_DIFFUSION_API_KEY); // Replace with your actual API key
  const baseURL = 'https://modelslab.com/api/v6/images/fetch';  // Replace with actual API URL
  try {
    const response = await axios.post(baseURL, {
      key: apiKey,
      request_id: request_id
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // console.log(error) 
    console.error('Error fetching image:', error.message);
    throw error;
  }
}