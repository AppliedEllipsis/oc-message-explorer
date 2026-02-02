package models

type MessageType string

const (
	MessageTypeInit     MessageType = "init"
	MessageTypeProgress MessageType = "progress"
	MessageTypeUpdate   MessageType = "update"
	MessageTypeError    MessageType = "error"
)

type WSMessage struct {
	Type MessageType `json:"type"`
	Data any         `json:"data"`
}

type MessageNode struct {
	ID        string   `json:"id"`
	Type      string   `json:"type"`
	Content   string   `json:"content"`
	Summary   string   `json:"summary"`
	Timestamp string   `json:"timestamp"`
	ParentID  string   `json:"parentId,omitempty"`
	Children  []string `json:"children,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	Expanded  bool     `json:"expanded"`
	Selected  bool     `json:"selected"`
	SessionID string   `json:"sessionId,omitempty"`
	HasLoaded bool     `json:"hasLoaded"`
	Locked    bool     `json:"locked"`
}

type Folder struct {
	ID        string                  `json:"id"`
	Name      string                  `json:"name"`
	Color     string                  `json:"color"`
	CreatedAt string                  `json:"createdAt"`
	Nodes     map[string]*MessageNode `json:"nodes"`
}

type OpenCodeMessage struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionID"`
	Role      string `json:"role"`
	ParentID  string `json:"parentId,omitempty"`
	Time      struct {
		Created int64 `json:"created"`
	}
	Summary any    `json:"summary"`
	Agent   string `json:"agent"`
}

type OpenCodePart struct {
	ID        string `json:"id"`
	MessageID string `json:"messageID"`
	Type      string `json:"type"`
	Text      string `json:"text"`
}

type TodoItem struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	Completed bool   `json:"completed"`
	Priority  string `json:"priority"`
	CreatedAt string `json:"createdAt"`
}

type EnvConfig struct {
	OpenAIAPIKey       string `json:"openAIAPIKey"`
	OpenAIBaseURL      string `json:"openaiBaseUrl"`
	OpenAIModel        string `json:"openaiModel"`
	OptimizationPrompt string `json:"optimizationPrompt"`
	ProjectPath        string `json:"projectPath"`
	AgentsPath         string `json:"agentsPath"`
	AnthropicAPIKey    string `json:"anthropicAPIKey"`
	AIProvider         string `json:"aiProvider"`
	ThemeID            string `json:"themeId"`
}
