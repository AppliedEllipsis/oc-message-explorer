class AIProvider {
  constructor(name, apiKey, baseUrl, models) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.models = models;
  }

  async chat(messages, model, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  async stream(messages, model, options = {}) {
    throw new Error('stream() must be implemented by subclass');
  }

  countTokens(text) {
    throw new Error('countTokens() must be implemented by subclass');
  }

  getEstimatedCost(tokens, model) {
    const modelConfig = this.models[model];
    if (!modelConfig) return 0;
    return (tokens / 1000) * modelConfig.costPer1kTokens;
  }
}

class OpenAIProvider extends AIProvider {
  constructor(apiKey, baseUrl = 'https://api.openai.com/v1') {
    super('openai', apiKey, baseUrl, {
      'gpt-4': { maxTokens: 8192, costPer1kTokens: 0.03 },
      'gpt-4-turbo': { maxTokens: 128000, costPer1kTokens: 0.01 },
      'gpt-4o': { maxTokens: 128000, costPer1kTokens: 0.005 },
      'gpt-3.5-turbo': { maxTokens: 16385, costPer1kTokens: 0.0015 },
    });
  }

  async chat(messages, model, options = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    return response.json();
  }

  async stream(messages, model, options = {}, onChunk) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line === 'data: [DONE]') return;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices && data.choices[0] && data.choices[0].delta) {
                const content = data.choices[0].delta.content;
                if (content && onChunk) {
                  onChunk(content);
                }
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
  }

  countTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

class AnthropicProvider extends AIProvider {
  constructor(apiKey, baseUrl = 'https://api.anthropic.com') {
    super('anthropic', apiKey, baseUrl, {
      'claude-3-opus-20240229': { maxTokens: 200000, costPer1kTokens: 0.015 },
      'claude-3-sonnet-20240229': { maxTokens: 200000, costPer1kTokens: 0.003 },
      'claude-3-haiku-20240307': { maxTokens: 200000, costPer1kTokens: 0.00025 },
    });
  }

  async chat(messages, model, options = {}) {
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        system: systemMessage?.content || '',
        messages: userMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return {
      choices: [{
        message: {
          content: data.content[0]?.text || ''
        }
      }]
    };
  }

  async stream(messages, model, options = {}, onChunk) {
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        system: systemMessage?.content || '',
        messages: userMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content_block_delta' && data.delta?.text) {
                if (onChunk) {
                  onChunk(data.delta.text);
                }
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
  }

  countTokens(text) {
    return Math.ceil(text.length / 4);
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
    this.providers = new Map();
    this.currentProvider = null;
    this.currentModel = null;
    this.selectedTemplate = 'optimize';
  }

  initialize(config) {
    if (config.openAIAPIKey) {
      this.providers.set('openai', new OpenAIProvider(
        config.openAIAPIKey,
        config.openAIBaseURL
      ));
    }

    if (config.anthropicAPIKey) {
      this.providers.set('anthropic', new AnthropicProvider(
        config.anthropicAPIKey
      ));
    }

    this.autoSelectProvider();
  }

  autoSelectProvider() {
    if (this.providers.has('openai')) {
      this.currentProvider = this.providers.get('openai');
      this.currentModel = 'gpt-4o';
    } else if (this.providers.has('anthropic')) {
      this.currentProvider = this.providers.get('anthropic');
      this.currentModel = 'claude-3-sonnet-20240229';
    }
  }

  setProvider(providerName) {
    if (this.providers.has(providerName)) {
      this.currentProvider = this.providers.get(providerName);
      this.currentModel = this.getDefaultModelForProvider(providerName);
    }
  }

  setModel(model) {
    this.currentModel = model;
  }

  getDefaultModelForProvider(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) return null;

    const models = Object.keys(provider.models);
    return models[0];
  }

  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  getAvailableModels(providerName = null) {
    if (providerName && this.providers.has(providerName)) {
      return Object.keys(this.providers.get(providerName).models);
    }
    if (this.currentProvider) {
      return Object.keys(this.currentProvider.models);
    }
    return [];
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
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    const prepared = this.applyTemplate(templateId, variables);
    if (!prepared) {
      throw new Error('Invalid template');
    }

    const model = options.model || this.currentModel;
    const opts = {
      temperature: options.temperature || prepared.temperature,
      maxTokens: options.maxTokens || prepared.maxTokens
    };

    const response = await this.currentProvider.chat(prepared.messages, model, opts);
    return {
      content: response.choices[0].message.content,
      model: model,
      provider: this.currentProvider.name,
      tokens: this.estimateTokens(prepared.messages, opts.maxTokens),
      cost: this.calculateCost(prepared.messages, opts.maxTokens, model)
    };
  }

  async stream(templateId, variables, options = {}, onChunk) {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    const prepared = this.applyTemplate(templateId, variables);
    if (!prepared) {
      throw new Error('Invalid template');
    }

    const model = options.model || this.currentModel;
    const opts = {
      temperature: options.temperature || prepared.temperature,
      maxTokens: options.maxTokens || prepared.maxTokens
    };

    await this.currentProvider.stream(prepared.messages, model, opts, onChunk);

    return {
      model: model,
      provider: this.currentProvider.name
    };
  }

  estimateTokens(messages, maxTokens) {
    if (!this.currentProvider) return 0;

    const inputText = messages.map(m => m.content).join(' ');
    const inputTokens = this.currentProvider.countTokens(inputText);
    return {
      input: inputTokens,
      output: maxTokens,
      total: inputTokens + maxTokens
    };
  }

  calculateCost(messages, maxTokens, model) {
    if (!this.currentProvider) return 0;

    const tokens = this.estimateTokens(messages, maxTokens);
    const modelConfig = this.currentProvider.models[model];
    if (!modelConfig) return 0;

    return (tokens.input / 1000) * modelConfig.costPer1kTokens +
           (tokens.output / 1000) * modelConfig.costPer1kTokens;
  }
}

window.aiWorkflowManager = new AIWorkflowManager();
