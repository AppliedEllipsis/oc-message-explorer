class AIProvider {
  constructor(name) {
    this.name = name;
  }

  async stream(messages, model, options = {}, onChunk) {
    throw new Error('stream() must be implemented by subclass');
  }
}

class BackendProvider extends AIProvider {
  constructor() {
    super('backend');
  }

  async stream(messages, model, options = {}, onChunk) {
    const payload = {
      templateId: options.templateId || 'optimize',
      variables: {
        prompt: messages[messages.length - 1]?.content || '',
      },
      options: {
        model: model,
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2000,
      }
    };

    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      let errorMessage = 'Backend API error';
      try {
        const errorData = JSON.parse(error);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        if (error.includes('No AI provider configured')) {
          errorMessage = 'No AI provider configured. Please add an API key in Settings → Settings → OpenAI API Key';
        }
      }
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      streamingLoop: // Label for breaking out of both loops
      while (true) {
        const { done, value } = await reader.read();
        if (done) break streamingLoop;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(5).trim();
            if (dataStr === '[DONE]') break streamingLoop;

            try {
              const data = JSON.parse(dataStr);
              if (data.content && onChunk) {
                onChunk(data.content);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      model: model,
      provider: 'backend'
    };
  }
}

const promptTemplates = {
  'optimize': {
    name: 'Optimize Prompts',
    description: 'Optimize AI prompts for clarity and effectiveness',
    system: 'You are an expert at optimizing AI prompts. Make prompts clearer, more specific, and more effective.',
    user: 'Optimize this prompt:\n\n{prompt}',
    temperature: 0.7,
    maxTokens: 2000
  },
  'summarize': {
    name: 'Summarize Conversation',
    description: 'Create a concise summary of the conversation',
    system: 'You are an expert at summarizing conversations. Create concise, clear summaries.',
    user: 'Summarize this conversation:\n\n{content}',
    temperature: 0.3,
    maxTokens: 1000
  },
  'expand': {
    name: 'Expand and Elaborate',
    description: 'Expand on key points and add details',
    system: 'You are an expert at expanding and elaborating on content. Add relevant details and examples.',
    user: 'Expand on this:\n\n{content}',
    temperature: 0.5,
    maxTokens: 3000
  },
  'refine': {
    name: 'Refine and Polish',
    description: 'Improve clarity, grammar, and flow',
    system: 'You are an expert editor. Improve clarity, grammar, flow, and readability.',
    user: 'Refine and polish this:\n\n{content}',
    temperature: 0.3,
    maxTokens: 2000
  },
  'extract': {
    name: 'Extract Key Points',
    description: 'Extract the most important information',
    system: 'You are an expert at identifying and extracting key information.',
    user: 'Extract the key points from:\n\n{content}',
    temperature: 0.2,
    maxTokens: 500
  },
  'translate': {
    name: 'Translate Language',
    description: 'Translate content to another language',
    system: 'You are an expert translator. Provide accurate, natural translations.',
    user: 'Translate the following to {language}:\n\n{content}',
    temperature: 0.3,
    maxTokens: 2000
  }
};

class AIWorkflowManager {
  constructor() {
    this.provider = new BackendProvider();
    this.currentModel = 'gpt-4o';
    this.selectedTemplate = 'optimize';
    this.customModel = null;
  }

  initialize(config) {
    if (config.openaiModel) {
      this.customModel = config.openaiModel;
      this.currentModel = config.openaiModel;
    }
  }

  autoSelectProvider() {
    this.provider = new BackendProvider();
    this.currentModel = 'gpt-4o';
  }

  setProvider(providerName) {
    console.log('Provider selection disabled - using backend');
  }

  setModel(model) {
    this.currentModel = model;
    this.customModel = model;
  }

  getCustomModel() {
    return this.customModel;
  }

  getDefaultModelForProvider(providerName) {
    return 'gpt-4o';
  }

  getAvailableProviders() {
    return ['backend'];
  }

  getAvailableModels(providerName = null) {
    return ['gpt-4o', 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
  }

  getPromptTemplates() {
    return promptTemplates;
  }

  getTemplate(templateId) {
    return promptTemplates[templateId];
  }

  applyTemplate(templateId, variables) {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    let userPrompt = template.user;
    for (const [key, value] of Object.entries(variables)) {
      userPrompt = userPrompt.replace(`{${key}}`, value);
    }

    return {
      messages: [
        { role: 'system', content: template.system },
        { role: 'user', content: userPrompt }
      ],
      ...template
    };
  }

  async execute(templateId, variables, options = {}) {
    throw new Error('execute() deprecated. Use stream() instead.');
  }

  async stream(templateId, variables, options = {}, onChunk) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error('Invalid template');
    }

    const opts = {
      temperature: options.temperature || template.temperature,
      maxTokens: options.maxTokens || template.maxTokens,
      templateId: templateId
    };

    const prompt = variables.prompt || variables.content || '';
    if (!prompt) {
      throw new Error('No prompt provided');
    }

    const messages = [
      { role: 'user', content: prompt }
    ];

    const model = options.model || this.currentModel;

    return await this.provider.stream(messages, model, opts, onChunk);
  }

  estimateTokens(messages, maxTokens) {
    const inputText = messages.map(m => m.content).join(' ');
    const inputTokens = Math.ceil(inputText.length / 4);
    return {
      input: inputTokens,
      output: maxTokens,
      total: inputTokens + maxTokens
    };
  }

  calculateCost(messages, maxTokens, model) {
    return 0;
  }
}

window.aiWorkflowManager = new AIWorkflowManager();
