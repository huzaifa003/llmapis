const modelsData = [
  {
    label: "OpenAI",
    options: [
      {
        value: "openai:gpt-3.5-turbo",
        label: "GPT 3.5 Turbo",
        isPro: false,
        description: "A fast, inexpensive model for simple tasks",
      },
      {
        value: "openai:gpt-4o-mini",
        label: "GPT 4o Mini",
        isPro: true,
        description: "Our affordable and intelligent small model for fast, lightweight tasks",
      },
      {
        value: "openai:gpt-4o",
        label: "GPT 4o",
        isPro: true,
        description: "Our high-intelligence flagship model for complex, multi-step tasks",
      },
      {
        value: "openai:gpt-4-turbo",
        label: "GPT 4 Turbo",
        isPro: true,
        description: "The previous set of high-intelligence models",
      },
      {
        value: "openai:gpt-4",
        label: "GPT 4",
        isPro: true,
        description: "The previous set of high-intelligence models",
      },
     
      {
        value: "openai:o1-preview",
        label: "O1 Preview",
        isPro: true,
        description: "Language model trained with reinforcement learning to perform complex reasoning",
      },
      {
        value: "openai:o1-mini",
        label: "O1 Mini",
        isPro: true,
        description: "Language model trained with reinforcement learning for simpler tasks",
      },
    ],
  },
  {
    label: "Gemini",
    options: [
      {
        value: "gemini:gemini-1.5-flash",
        label: "Gemini 1.5 Flash",
        isPro: false,
        description: "Audio, images, videos, and text - Fast and versatile performance across a diverse variety of tasks",
      },
      {
        value: "gemini:gemini-1.5-pro",
        label: "Gemini 1.5 Pro",
        isPro: false,
        description: "Audio, images, videos, and text - Complex reasoning tasks requiring more intelligence",
      },
      {
        value: "gemini:gemini-1.0-pro",
        label: "Gemini 1.0 Pro",
        isPro: false,
        description: "Text - Natural language tasks, multi-turn text and code chat, and code generation",
      },
    ],
  },
  {
    label: "Groq LLAMA",
    options: [
      {
        value: "llama:llama-3.1-8b-instant",
        label: "Llama 3.1 8B",
        isPro: false,
        description: "A quick, responsive model optimized for real-time applications and instant results",
      },
      {
        value: "llama:llama3-groq-70b-8192-tool-use-preview",
        label: "Llama 3 70B (Preview)",
        isPro: true,
        description: "A specialized version of Llama designed for tool integration and massive token contexts",
      },
      {
        value: "llama:llama3-groq-8b-8192-tool-use-preview",
        label: "Llama 3-8B (Preview)",
        isPro: true,
        description: "A smaller variant of Llama 3 optimized for general-purpose tasks and tool use",
      },
      {
        value: "llama:llama-3.1-70b-versatile",
        label: "Llama 3.1 70B",
        isPro: true,
        description: "Meta's versatile model designed for large-context and high-complexity tasks",
      },
      
      {
        value: "llama:llama-3.2-1b-preview",
        label: "Llama 3.2 1B (Preview)",
        isPro: false,
        description: "A preview version of Llama 3.2 designed for low-complexity tasks with fast responses",
      },
      {
        value: "llama:llama-3.2-3b-preview",
        label: "Llama 3.2 3B (Preview)",
        isPro: true,
        description: "A balanced model for moderately complex reasoning and language understanding",
      },
      {
        value: "mixtral:mixtral-8x7b-32768",
        label: "Mixtral 8x7B",
        isPro: true,
        description: "A unique model designed for handling large contexts up to 32,768 tokens",
      },
    ],
  },
  {
    label: "Anthropic API",
    options: [
      {
        value: "anthropic:claude-3-opus-20240229",
        label: "Claude 3 Opus",
        isPro: true,
        description: "Anthropic's most advanced model, optimized for complex and detailed text generation",
      },
      {
        value: "anthropic:claude-3-sonnet-20240229",
        label: "Claude 3 Sonnet",
        isPro: true,
        description: "A balanced model offering sophisticated yet concise language processing capabilities",
      },
      {
        value: "anthropic:claude-3-haiku-20240307",
        label: "Claude 3 Haiku",
        isPro: true,
        description: "A more lightweight and expressive variant designed for creative tasks with constrained responses",
      },
    ],
  },
];


const imageModelsData = [
  {
    label: "ImageGen",
    options: [
      {
        value: "imagegen:midjourney",
        label: "Midjourney",
        isPro: false,
        description: "Mid Journey images",
      },
     
      {
        value: "imagegen:sdxl",
        label: "SDXL",
        isPro: false,
        description: "SDXL 1.0 is latest AI SOTA text 2 image model which gives ultra realistic images in higher resolutions of 1024",
      },
      {
        value: "imagegen:flux",
        label: "Flux",
        isPro: false,
        description: "Most realistic images",
      },
      {
        value: "imagegen:ae-realistic-v5",
        label: "ImageGen 3",
        isPro: true,
        description: "Realistic",
      },
    
      
    ],
  },
  {
    label: "Dalle",
    options: [
      {
        value: "dalle:dall-e-3",
        label: "Dalle 3",
        isPro: true,
        description: "Dalle 3 is the LATEST large language model optimized for image generation",
      },
      {
        value: "dalle:dall-e-2",
        label: "Dalle 2",
        isPro: true,
        description: "Dalle 2 is a large language model optimized for image generation",
      },
    ]
  }
];

export { modelsData, imageModelsData };
