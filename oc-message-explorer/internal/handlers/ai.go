package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type AIRequest struct {
	Messages     []ChatMessage `json:"messages"`
	Model        string        `json:"model"`
	Stream       bool          `json:"stream"`
	Temperature  float64       `json:"temperature"`
	MaxTokens    int           `json:"maxTokens"`
	Provider     string        `json:"provider"`
	SystemPrompt string        `json:"systemPrompt,omitempty"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIRequestInput struct {
	TemplateID string                 `json:"templateId"`
	Variables  map[string]interface{} `json:"variables"`
	Options    map[string]interface{} `json:"options,omitempty"`
}

func (h *Handlers) handleAIStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var input AIRequestInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}

	config := h.configManager.GetConfig()

	var apiKey, baseURL string
	var provider string

	if config.AIProvider == "auto" || config.AIProvider == "" {
		if config.OpenAIAPIKey != "" {
			provider = "openai"
			apiKey = config.OpenAIAPIKey
			baseURL = config.OpenAIBaseURL
		} else if config.AnthropicAPIKey != "" {
			provider = "anthropic"
			apiKey = config.AnthropicAPIKey
			baseURL = "https://api.anthropic.com"
		} else {
			respondError(w, http.StatusBadRequest, "No AI provider configured. Please add an API key in Actions → AI Configuration")
			return
		}
	} else {
		provider = config.AIProvider
		if provider == "openai" {
			apiKey = config.OpenAIAPIKey
			baseURL = config.OpenAIBaseURL
		} else if provider == "anthropic" {
			apiKey = config.AnthropicAPIKey
			baseURL = "https://api.anthropic.com"
		}
	}

	if apiKey == "" {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("No API key configured for %s provider", provider))
		return
	}

	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}

	// Build messages from template
	prompt := ""
	if userPrompt, ok := input.Variables["prompt"].(string); ok {
		prompt = userPrompt
	}

	if prompt == "" {
		respondError(w, http.StatusBadRequest, "No prompt provided")
		return
	}

	var messages []ChatMessage
	var systemPrompt string

	if provider == "anthropic" {
		// Anthropic uses separate system prompt
		systemPrompt = "You are an expert at optimizing AI prompts. Make prompts clearer, more specific, and more effective."
		messages = []ChatMessage{
			{Role: "user", Content: prompt},
		}
	} else {
		// OpenAI uses messages array
		messages = []ChatMessage{
			{Role: "system", Content: "You are an expert at optimizing AI prompts. Make prompts clearer, more specific, and more effective."},
			{Role: "user", Content: prompt},
		}
	}

	temperature := 0.7
	if temp, ok := input.Options["temperature"].(float64); ok {
		temperature = temp
	}
	maxTokens := 2000
	if mt, ok := input.Options["maxTokens"].(float64); ok {
		maxTokens = int(mt)
	}

	model := "gpt-4o"
	if provider == "anthropic" {
		model = "claude-3-sonnet-20240229"
	}
	if m, ok := input.Options["model"].(string); ok && m != "" {
		model = m
	}

	apiURL := fmt.Sprintf("%s/chat/completions", baseURL)

	// Prepare request body
	var requestBody interface{}
	var reqHeaders map[string]string

	if provider == "openai" {
		requestBody = map[string]interface{}{
			"model":       model,
			"messages":    messages,
			"temperature": temperature,
			"max_tokens":  maxTokens,
			"stream":      true,
		}
		reqHeaders = map[string]string{
			"Authorization": "Bearer " + apiKey,
			"Content-Type":  "application/json",
		}
	} else {
		// Anthropic
		requestBody = map[string]interface{}{
			"model":       model,
			"system":      systemPrompt,
			"messages":    messages,
			"temperature": temperature,
			"max_tokens":  maxTokens,
			"stream":      true,
		}
		reqHeaders = map[string]string{
			"x-api-key":         apiKey,
			"anthropic-version": "2023-06-01",
			"Content-Type":      "application/json",
		}
	}

	reqBody, _ := json.Marshal(requestBody)
	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(reqBody))
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for k, v := range reqHeaders {
		req.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		respondError(w, resp.StatusCode, fmt.Sprintf("AI provider error: %s", string(body)))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		respondError(w, http.StatusInternalServerError, "Streaming not supported")
		return
	}

	reader := resp.Body
	buffer := make([]byte, 1024)

	for {
		n, err := reader.Read(buffer)
		if err != nil {
			if err != io.EOF {
				fmt.Fprintf(w, "data: [ERROR] %s\n\n", err.Error())
				flusher.Flush()
			}
			break
		}

		data := string(buffer[:n])
		lines := strings.Split(data, "\n")

		for _, line := range lines {
			if strings.HasPrefix(line, "data: ") || strings.HasPrefix(line, "data:") {
				dataContent := strings.TrimPrefix(line, "data:")
				dataContent = strings.TrimSpace(dataContent)

				if dataContent == "[DONE]" {
					fmt.Fprintf(w, "data: [DONE]\n\n")
					flusher.Flush()
					return
				}

				var streamData map[string]interface{}
				if err := json.Unmarshal([]byte(dataContent), &streamData); err == nil {
					var content string

					if provider == "openai" {
						if choices, ok := streamData["choices"].([]interface{}); ok && len(choices) > 0 {
							if choice, ok := choices[0].(map[string]interface{}); ok {
								if delta, ok := choice["delta"].(map[string]interface{}); ok {
									if c, ok := delta["content"].(string); ok {
										content = c
									}
								}
							}
						}
					} else {
						// Anthropic
						if t, ok := streamData["type"].(string); ok && t == "content_block_delta" {
							if delta, ok := streamData["delta"].(map[string]interface{}); ok {
								if c, ok := delta["text"].(string); ok {
									content = c
								}
							}
						}
					}

					if content != "" {
						data, _ := json.Marshal(map[string]string{"content": content})
						fmt.Fprintf(w, "data: %s\n\n", string(data))
						flusher.Flush()
					}
				}
			}
		}
	}
}
