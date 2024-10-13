const modelsData = [
    {
      label: "OpenAI",
      options: [
        {
          value: "gpt-4o-mini",
          label: "GPT 4o Mini",
          isPro: true,
          description: "Our affordable and intelligent small model for fast, lightweight tasks",
        },
        {
          value: "gpt-4o",
          label: "GPT 4o",
          isPro: true,
          description: "Our high-intelligence flagship model for complex, multi-step tasks",
        },
        {
          value: "gpt-4-turbo",
          label: "GPT 4 Turbo",
          isPro: true,
          description: "The previous set of high-intelligence models",
        },
        {
          value: "gpt-4",
          label: "GPT 4",
          isPro: true,
          description: "The previous set of high-intelligence models",
        },
        {
          value: "gpt-3.5-turbo",
          label: "GPT 3.5 Turbo",
          isPro: false,
          description: "A fast, inexpensive model for simple tasks",
        },
        {
          value: "o1-preview",
          label: "O1 Preview",
          isPro: true,
          description: "Language model trained with reinforcement learning to perform complex reasoning",
        },
        {
          value: "o1-mini",
          label: "O1 Mini",
          isPro: false,
          description: "Language model trained with reinforcement learning for simpler tasks",
        },
      ],
    },
    {
      label: "Gemini",
      options: [
        {
          value: "gemini-1.5-flash",
          label: "Gemini 1.5 Flash",
          isPro: true,
          description: "Audio, images, videos, and text - Fast and versatile performance across a diverse variety of tasks",
        },
        {
          value: "gemini-1.5-flash-8b",
          label: "Gemini 1.5 Flash-8B",
          isPro: false,
          description: "Audio, images, videos, and text - High volume and lower intelligence tasks",
        },
        {
          value: "gemini-1.5-pro",
          label: "Gemini 1.5 Pro",
          isPro: true,
          description: "Audio, images, videos, and text - Complex reasoning tasks requiring more intelligence",
        },
        {
          value: "gemini-1.0-pro",
          label: "Gemini 1.0 Pro",
          isPro: true,
          description: "Text - Natural language tasks, multi-turn text and code chat, and code generation",
        },
      ],
    },
  ];

  const imageModelsData = [
    {
      label: "ImageGen",
      options: [
        {
          value: "flux",
          label: "Flux",
          isPro: true,
          description: "Most realistic images",
        },
        {
          value: "midjourney",
          label: "Midjourney",
          isPro: false,
          description: "Mid Journey images",
        },
        {
          value: "sdxl",
          label: "SDXL",
          isPro: false,
          description: "SDXL 1.0 is latest AI SOTA text 2 image model which gives ultra realistic images in higher resolutions of 1024",
        },
      ],
    },
  ]
export {modelsData, imageModelsData};