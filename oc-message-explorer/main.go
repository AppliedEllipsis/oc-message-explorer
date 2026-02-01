package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"

	"oc-message-explorer/internal/database"
	"oc-message-explorer/internal/models"
	syncpkg "oc-message-explorer/internal/sync"
	"oc-message-explorer/internal/utils"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WSMessage = models.WSMessage
type MessageType = models.MessageType
type MessageNode = models.MessageNode
type Folder = models.Folder
type OpenCodeMessage = models.OpenCodeMessage
type OpenCodePart = models.OpenCodePart
type TodoItem = models.TodoItem
type EnvConfig = models.EnvConfig

const (
	MessageTypeInit     MessageType = models.MessageTypeInit
	MessageTypeProgress MessageType = models.MessageTypeProgress
	MessageTypeUpdate   MessageType = models.MessageTypeUpdate
	MessageTypeError    MessageType = models.MessageTypeError
)

type Store struct {
	mu          sync.RWMutex
	Folders     map[string]*Folder
	clients     map[*websocket.Conn]bool
	broadcastCh chan WSMessage
	dataPath    string
	partPath    string
	msgPath     string
	db          *database.Database
	syncManager *syncpkg.SyncManager
}

type ConfigManager struct {
	mu        sync.RWMutex
	config    EnvConfig
	todos     []TodoItem
	envPath   string
	storePath string
}

var configManager *ConfigManager

func NewConfigManager() *ConfigManager {
	cm := &ConfigManager{
		todos:     make([]TodoItem, 0),
		envPath:   ".env",
		storePath: "config.json",
	}

	cm.loadEnv()

	if data, err := os.ReadFile(cm.storePath); err == nil {
		json.Unmarshal(data, &cm)
	}

	return cm
}

func (cm *ConfigManager) loadEnv() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: No .env file found, using defaults")
	}

	cm.mu.Lock()
	cm.config.OpenAIAPIKey = os.Getenv("OPENAI_API_KEY")
	cm.config.OpenAIBaseURL = utils.GetEnvWithDefault("OPENAI_BASE_URL", "")
	cm.config.OpenAIModel = utils.GetEnvWithDefault("OPENAI_MODEL", "gpt-4")
	cm.config.OptimizationPrompt = utils.GetEnvWithDefault("OPTIMIZATION_PROMPT", "")
	cm.config.ProjectPath = utils.GetEnvWithDefault("PROJECT_PATH", "")
	cm.config.AgentsPath = utils.GetEnvWithDefault("AGENTS_PATH", "")
	cm.mu.Unlock()
}

func (cm *ConfigManager) getEnv(key string) string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if key == "OPENAI_API_KEY" {
		return cm.config.OpenAIAPIKey
	}
	if key == "OPENAI_BASE_URL" {
		return cm.config.OpenAIBaseURL
	}
	if key == "OPENAI_MODEL" {
		return cm.config.OpenAIModel
	}
	if key == "OPTIMIZATION_PROMPT" {
		return cm.config.OptimizationPrompt
	}
	if key == "PROJECT_PATH" {
		return cm.config.ProjectPath
	}
	if key == "AGENTS_PATH" {
		return cm.config.AgentsPath
	}
	return ""
}

func (cm *ConfigManager) setEnv(key, value string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if key == "OPENAI_API_KEY" || key == "openAIAPIKey" {
		cm.config.OpenAIAPIKey = value
	}
	if key == "OPENAI_BASE_URL" || key == "openaiBaseUrl" {
		cm.config.OpenAIBaseURL = value
	}
	if key == "OPENAI_MODEL" || key == "openaiModel" {
		cm.config.OpenAIModel = value
	}
	if key == "OPTIMIZATION_PROMPT" || key == "optimizationPrompt" {
		cm.config.OptimizationPrompt = value
	}
	if key == "PROJECT_PATH" || key == "projectPath" {
		cm.config.ProjectPath = value
	}
	if key == "AGENTS_PATH" || key == "agentsPath" {
		cm.config.AgentsPath = value
	}

	if err := cm.saveEnvFile(); err != nil {
		return err
	}

	if err := cm.saveStore(); err != nil {
		return err
	}

	return nil
}

func (cm *ConfigManager) saveEnvFile() error {
	var lines []string

	if cm.config.OpenAIAPIKey != "" {
		lines = append(lines, fmt.Sprintf(`OPENAI_API_KEY="%s"`, cm.config.OpenAIAPIKey))
	}
	if cm.config.OpenAIBaseURL != "" {
		lines = append(lines, fmt.Sprintf(`OPENAI_BASE_URL="%s"`, cm.config.OpenAIBaseURL))
	}
	if cm.config.OpenAIModel != "" && cm.config.OpenAIModel != "gpt-4" {
		lines = append(lines, fmt.Sprintf(`OPENAI_MODEL=%s`, cm.config.OpenAIModel))
	}
	if cm.config.OptimizationPrompt != "" {
		lines = append(lines, fmt.Sprintf(`OPTIMIZATION_PROMPT="%s"`, strings.Replace(cm.config.OptimizationPrompt, "\n", "\\n", -1)))
	}
	if cm.config.ProjectPath != "" {
		lines = append(lines, fmt.Sprintf(`PROJECT_PATH="%s"`, cm.config.ProjectPath))
	}
	if cm.config.AgentsPath != "" {
		lines = append(lines, fmt.Sprintf(`AGENTS_PATH="%s"`, cm.config.AgentsPath))
	}

	return os.WriteFile(cm.envPath, []byte(strings.Join(lines, "\n")), 0644)
}

func (cm *ConfigManager) saveStore() error {
	data, err := json.Marshal(cm)
	if err != nil {
		return err
	}

	return os.WriteFile(cm.storePath, data, 0644)
}

func (cm *ConfigManager) getTodos() []TodoItem {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.todos
}

func (cm *ConfigManager) addTodo(text, priority string) *TodoItem {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	todo := TodoItem{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Text:      text,
		Completed: false,
		Priority:  priority,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	cm.todos = append(cm.todos, todo)
	cm.saveStore()

	return &todo
}

func (cm *ConfigManager) toggleTodo(id string) bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for i := range cm.todos {
		if cm.todos[i].ID == id {
			cm.todos[i].Completed = !cm.todos[i].Completed
			cm.saveStore()
			return cm.todos[i].Completed
		}
	}

	return false
}

func (cm *ConfigManager) deleteTodo(id string) bool {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for i, todo := range cm.todos {
		if todo.ID == id {
			cm.todos = append(cm.todos[:i], cm.todos[i+1:]...)
			cm.saveStore()
			return true
		}
	}

	return false
}

func (cm *ConfigManager) readAgentsContent() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	agentsPath := cm.config.AgentsPath
	if agentsPath == "" {
		agentsPath = getProjectRoot()
	}

	paths := []string{
		filepath.Join(agentsPath, "AGENTS.md"),
		filepath.Join(agentsPath, "agents.md"),
		filepath.Join(agentsPath, "docs", "AGENTS.md"),
	}

	for _, path := range paths {
		if content, err := os.ReadFile(path); err == nil {
			return string(content)
		}
	}

	return "# No AGENTS.md file found"
}

func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getProjectRoot() string {
	if wd, err := os.Getwd(); err == nil {
		return wd
	}
	return "."
}

func getExecutableDir() string {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("Failed to get executable path: %v", err)
		return "."
	}
	return filepath.Dir(exe)
}

func getDataDir() string {
	exeDir := getExecutableDir()
	dataDir := filepath.Join(exeDir, "data")

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Printf("Failed to create data directory: %v", err)
		return exeDir
	}

	return dataDir
}

func getDatabasePath() string {
	dataDir := getDataDir()

	exe, err := os.Executable()
	if err != nil {
		log.Printf("Failed to get executable path: %v", err)
		return filepath.Join(dataDir, "oc-message-explorer.db")
	}

	exeName := filepath.Base(exe)
	ext := filepath.Ext(exeName)
	dbName := exeName[:len(exeName)-len(ext)] + ".db"

	dbPath := filepath.Join(dataDir, dbName)
	return dbPath
}

func isAutoGenerated(title string) bool {
	if title == "" {
		return false
	}
	titleLower := strings.ToLower(title)
	autoGeneratedPatterns := []string{
		"auto-generated",
		"auto generated",
		"previous query",
		"previous prompt",
		"history",
		"continue",
		"resume",
		"up arrow",
		"↑",
		"↑ arrow",
		"continuation",
		"repeating",
		"recalling",
		"recall",
	}
	for _, pattern := range autoGeneratedPatterns {
		if strings.Contains(titleLower, pattern) {
			return true
		}
	}
	return false
}

func getSummaryTitle(summary any) string {
	if summary == nil {
		return ""
	}

	switch v := summary.(type) {
	case bool:
		return ""
	case map[string]any:
		if title, ok := v["title"].(string); ok {
			return title
		}
		return ""
	case string:
		return v
	default:
		return ""
	}
}

func NewStore() *Store {
	store := &Store{
		Folders:     make(map[string]*Folder),
		clients:     make(map[*websocket.Conn]bool),
		broadcastCh: make(chan WSMessage, 100),
	}

	go store.broadcaster()

	store.dataPath = getDefaultOpenCodePath()
	log.Printf("OpenCode data path: %s", store.dataPath)
	if store.dataPath != "" {
		store.msgPath = filepath.Join(store.dataPath, "storage", "message")
		store.partPath = filepath.Join(store.dataPath, "storage", "part")
		log.Printf("Message path: %s", store.msgPath)
		log.Printf("Part path: %s", store.partPath)
	}

	dbPath := utils.GetDatabasePath()
	db, err := database.NewDatabase(dbPath)
	if err != nil {
		log.Printf("Failed to initialize database: %v", err)
	} else {
		store.db = db

		isEmpty, err := db.IsEmpty()
		if err != nil {
			log.Printf("Failed to check if database is empty: %v", err)
		} else if isEmpty && store.dataPath != "" {
			log.Printf("Database is empty, starting initial sync...")
			store.syncManager = syncpkg.NewSyncManager(db, store, store.dataPath, func(progress syncpkg.SyncProgress) {
				store.broadcast(WSMessage{Type: MessageTypeProgress, Data: progress})
			})
			go func() {
				if err := store.syncManager.StartSync(); err != nil {
					log.Printf("Sync error: %v", err)
				}
			}()
		} else {
			log.Printf("Database has data, loading asynchronously...")
			go func() {
				if err := store.loadFromDatabase(); err != nil {
					log.Printf("Failed to load from database: %v", err)
					store.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "error", "message": fmt.Sprintf("Failed to load from database: %v", err)}})
				} else {
					log.Printf("Finished loading from database")
					store.broadcast(WSMessage{Type: MessageTypeInit, Data: store.toJSON()})

					if store.dataPath != "" {
						store.syncManager = syncpkg.NewSyncManager(db, store, store.dataPath, func(progress syncpkg.SyncProgress) {
							store.broadcast(WSMessage{Type: MessageTypeProgress, Data: progress})
						})
						log.Printf("Starting background sync...")
						go func() {
							if err := store.syncManager.StartSync(); err != nil {
								log.Printf("Sync error: %v", err)
							}
						}()
					}
				}
			}()
		}
	}

	return store
}

func (s *Store) loadOpenCodeMetadata() {
	s.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "loading", "message": "Reading OpenCode messages..."}})

	messageNodes := make(map[string]*MessageNode)

	sessions, err := os.ReadDir(s.msgPath)
	if err != nil {
		log.Printf("Failed to read OpenChat message directory: %v", err)
		s.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "error", "message": fmt.Sprintf("Failed to read messages: %v", err)}})
		return
	}

	totalSessions := len(sessions)
	s.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "loading", "message": fmt.Sprintf("Found %d sessions...", totalSessions), "progress": 0}})

	log.Printf("Starting to process %d sessions...", totalSessions)
	sessionCount := 0
	for _, sessionDir := range sessions {
		if !sessionDir.IsDir() {
			continue
		}

		sessionPath := filepath.Join(s.msgPath, sessionDir.Name())
		log.Printf("Processing session: %s", sessionDir.Name())
		messageFiles, err := os.ReadDir(sessionPath)
		if err != nil {
			log.Printf("Failed to read session %s: %v", sessionDir.Name(), err)
			continue
		}

		msgCount := 0
		for _, msgFile := range messageFiles {
			if !strings.HasSuffix(msgFile.Name(), ".json") {
				continue
			}

			msgFilePath := filepath.Join(sessionPath, msgFile.Name())
			msgData, err := os.ReadFile(msgFilePath)
			if err != nil {
				log.Printf("Failed to read message file %s: %v", msgFile.Name(), err)
				continue
			}

			var ocMsg OpenCodeMessage
			if err := json.Unmarshal(msgData, &ocMsg); err != nil {
				log.Printf("Failed to unmarshal message %s: %v", msgFile.Name(), err)
				continue
			}

			var nodeType string
			var nodeTags []string

			switch ocMsg.Role {
			case "assistant":
				nodeType = "response"
				nodeTags = []string{ocMsg.Agent, ocMsg.Role}
			case "system":
				nodeType = "system"
				nodeTags = []string{ocMsg.Agent, ocMsg.Role}
			case "user":
				nodeType = "user"
				summaryTitle := getSummaryTitle(ocMsg.Summary)
				if isAutoGenerated(summaryTitle) {
					nodeType = "auto"
					nodeTags = []string{ocMsg.Agent, ocMsg.Role, "auto-generated"}
				} else {
					nodeTags = []string{ocMsg.Agent, ocMsg.Role}
				}
			default:
				nodeType = "prompt"
				nodeTags = []string{ocMsg.Agent, ocMsg.Role}
			}

			title := getSummaryTitle(ocMsg.Summary)
			if title == "" {
				if ocMsg.Role == "assistant" {
					title = "AI response"
				} else if ocMsg.Role == "system" {
					title = "System message"
				} else {
					title = fmt.Sprintf("%s message", ocMsg.Role)
				}
			}

			node := &MessageNode{
				ID:        ocMsg.ID,
				Type:      nodeType,
				Content:   "",    // Will load from parts on demand
				Summary:   title, // Store AI summary
				Timestamp: formatTimestamp(ocMsg.Time.Created),
				ParentID:  ocMsg.ParentID,
				Children:  []string{},
				Tags:      nodeTags,
				Expanded:  false,
				Selected:  false,
				SessionID: ocMsg.SessionID,
				HasLoaded: false,
				Locked:    false,
			}

			messageNodes[ocMsg.ID] = node
			msgCount++
		}

		log.Printf("Loaded %d messages from session %s", msgCount, sessionDir.Name())
		sessionCount++
		progress := int(float64(sessionCount) / float64(totalSessions) * 100)
		s.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "loading", "message": fmt.Sprintf("Read %d/%d sessions (%d msgs)...", sessionCount, totalSessions, len(messageNodes)), "progress": progress}})
	}

	log.Printf("Building parent-child relationships...")
	for _, node := range messageNodes {
		if node.ParentID != "" {
			if parent, exists := messageNodes[node.ParentID]; exists {
				parent.Children = append(parent.Children, node.ID)
			}
		}
	}

	log.Printf("Loaded %d total messages from %d sessions", len(messageNodes), totalSessions)

	for _, node := range messageNodes {
		if node.ParentID != "" {
			if parent, exists := messageNodes[node.ParentID]; exists {
				parent.Children = append(parent.Children, node.ID)
			}
		}
	}

	if len(messageNodes) > 0 {
		defaultFolder := &Folder{
			ID:        "openchat",
			Name:      "OpenChat History",
			Color:     "#e94560",
			CreatedAt: time.Now().Format(time.RFC3339),
			Nodes:     messageNodes,
		}
		s.Folders["openchat"] = defaultFolder
		s.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "complete", "message": fmt.Sprintf("Loaded %d messages from %d sessions", len(messageNodes), totalSessions)}})
		log.Printf("Loaded %d messages from OpenChat", len(messageNodes))
	} else {
		s.broadcast(WSMessage{Type: MessageTypeProgress, Data: map[string]any{"status": "error", "message": "No messages found in OpenCode data"}})
	}
}

func (s *Store) loadFromDatabase() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	folders, err := s.db.GetAllFolders()
	if err != nil {
		return err
	}

	for id, folder := range folders {
		nodes, err := s.db.GetNodesForFolder(id)
		if err != nil {
			log.Printf("Failed to load nodes for folder %s: %v", id, err)
			continue
		}
		folder.Nodes = nodes
		s.Folders[id] = folder
	}

	return nil
}

func (s *Store) loadMessageContent(nodeID string) *MessageNode {
	s.mu.RLock()
	if folder, exists := s.Folders["openchat"]; exists {
		if node, exists := folder.Nodes[nodeID]; exists {
			if node.HasLoaded {
				s.mu.RUnlock()
				return node
			}
		}
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()

	if folder, exists := s.Folders["openchat"]; exists {
		if node, exists := folder.Nodes[nodeID]; exists {
			if node.HasLoaded {
				return node
			}

			msgPartPath := filepath.Join(s.partPath, nodeID)
			partFiles, err := os.ReadDir(msgPartPath)
			if err == nil {
				var partContents []string
				for _, partFile := range partFiles {
					if !strings.HasSuffix(partFile.Name(), ".json") {
						continue
					}

					partFilePath := filepath.Join(msgPartPath, partFile.Name())
					partData, err := os.ReadFile(partFilePath)
					if err != nil {
						continue
					}

					var ocPart OpenCodePart
					if err := json.Unmarshal(partData, &ocPart); err != nil {
						continue
					}

					if ocPart.Type == "text" && ocPart.Text != "" {
						partContents = append(partContents, ocPart.Text)
					}
				}

				if len(partContents) > 0 {
					node.Content = strings.Join(partContents, "\n")
					node.HasLoaded = true
				}
			}

			return node
		}
	}

	return nil
}

type SearchResult struct {
	Node    *MessageNode `json:"node"`
	Score   float64      `json:"score"`
	Matched []string     `json:"matched"`
}

func (s *Store) searchMessages(query string, searchRaw bool) map[string]*MessageNode {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if query == "" {
		return nil
	}

	results := make(map[string]*MessageNode)
	queryLower := strings.ToLower(query)

	for _, folder := range s.Folders {
		for _, node := range folder.Nodes {
			score, _ := calculateMatchScore(queryLower, node, searchRaw)
			if score > 0 {
				results[node.ID] = node
			}
		}
	}

	return results
}

func calculateMatchScore(queryLower string, node *MessageNode, searchRaw bool) (float64, []string) {
	var score float64
	matched := []string{}

	scoreContent, exactContent := scoreMatch(queryLower, strings.ToLower(node.Content))
	if scoreContent > 0 {
		weight := 100.0
		if exactContent {
			weight = 150.0
		}
		score += scoreContent * weight
		matched = append(matched, "content")
	}

	if !searchRaw {
		scoreSummary, exactSummary := scoreMatch(queryLower, strings.ToLower(node.Summary))
		if scoreSummary > 0 {
			weight := 60.0
			if exactSummary {
				weight = 90.0
			}
			score += scoreSummary * weight
			matched = append(matched, "summary")
		}
	}

	scoreType, exactType := scoreMatch(queryLower, strings.ToLower(node.Type))
	if scoreType > 0 {
		weight := 30.0
		if exactType {
			weight = 50.0
		}
		score += scoreType * weight
		matched = append(matched, "type")
	}

	for _, tag := range node.Tags {
		scoreTag, exactTag := scoreMatch(queryLower, strings.ToLower(tag))
		if scoreTag > 0 {
			weight := 20.0
			if exactTag {
				weight = 35.0
			}
			score += scoreTag * weight
			matched = append(matched, "tag")
			break
		}
	}

	return score, matched
}

func scoreMatch(query, text string) (float64, bool) {
	if strings.Contains(text, query) {
		if query == text {
			return 2.0, true
		}
		return 1.0, true
	}

	queryRunes := []rune(query)
	textRunes := []rune(text)
	queryIdx := 0
	gapStreak := 0

	for _, r := range textRunes {
		if queryIdx < len(queryRunes) && r == queryRunes[queryIdx] {
			queryIdx++
			gapStreak = 0
		} else if queryIdx > 0 {
			gapStreak++
		}
	}

	if queryIdx >= len(queryRunes) {
		return 0.5 / (1.0 + float64(gapStreak)), false
	}

	return 0.0, false
}

func fuzzyMatch(query, text string) bool {
	if strings.Contains(text, query) {
		return true
	}

	queryRunes := []rune(query)
	textRunes := []rune(text)
	queryIdx := 0

	for _, r := range textRunes {
		if queryIdx < len(queryRunes) && r == queryRunes[queryIdx] {
			queryIdx++
		}
	}

	return queryIdx >= len(queryRunes)
}

func fuzzyTagsMatch(query string, tags []string) bool {
	for _, tag := range tags {
		if fuzzyMatch(query, strings.ToLower(tag)) {
			return true
		}
	}
	return false
}

func (s *Store) AddFolder(folder *Folder) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Folders[folder.ID] = folder
	s.broadcast(WSMessage{Type: MessageTypeUpdate, Data: s.toJSON()})
}

func (s *Store) UpdateFolder(folder *Folder) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Folders[folder.ID] = folder
	s.broadcast(WSMessage{Type: MessageTypeUpdate, Data: s.toJSON()})
}

func (s *Store) DeleteFolder(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Folders, id)
	s.broadcast(WSMessage{Type: MessageTypeUpdate, Data: s.toJSON()})
}

func (s *Store) AddNode(folderID string, node *MessageNode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if folderID == "" || folderID == "all" {
		for _, folder := range s.Folders {
			folder.Nodes[node.ID] = node
			if node.ParentID != "" {
				if parent, exists := folder.Nodes[node.ParentID]; exists {
					parent.Children = append(parent.Children, node.ID)
				}
			}
		}
	} else if folder, exists := s.Folders[folderID]; exists {
		folder.Nodes[node.ID] = node
		if node.ParentID != "" {
			if parent, exists := folder.Nodes[node.ParentID]; exists {
				parent.Children = append(parent.Children, node.ID)
			}
		}
	}
	s.broadcast(WSMessage{Type: MessageTypeUpdate, Data: s.toJSON()})
}

func (s *Store) UpdateNode(folderID string, node *MessageNode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if folderID == "" || folderID == "all" {
		for _, folder := range s.Folders {
			if _, exists := folder.Nodes[node.ID]; exists {
				folder.Nodes[node.ID] = node
			}
		}
	} else if folder, exists := s.Folders[folderID]; exists {
		if _, exists := folder.Nodes[node.ID]; exists {
			folder.Nodes[node.ID] = node
		}
	}
	s.broadcast(WSMessage{Type: MessageTypeUpdate, Data: s.toJSON()})
}

func (s *Store) DeleteNode(folderID, nodeID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if folderID == "" || folderID == "all" {
		for _, folder := range s.Folders {
			delete(folder.Nodes, nodeID)
			for _, n := range folder.Nodes {
				newChildren := []string{}
				for _, childID := range n.Children {
					if childID != nodeID {
						newChildren = append(newChildren, childID)
					}
				}
				n.Children = newChildren
			}
		}
	} else if folder, exists := s.Folders[folderID]; exists {
		delete(folder.Nodes, nodeID)
		for _, n := range folder.Nodes {
			newChildren := []string{}
			for _, childID := range n.Children {
				if childID != nodeID {
					newChildren = append(newChildren, childID)
				}
			}
			n.Children = newChildren
		}
	}
	s.broadcast(WSMessage{Type: MessageTypeUpdate, Data: s.toJSON()})
}

func (s *Store) GetFolders() map[string]*Folder {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Folders
}

func (s *Store) getAllNodes() map[string]*MessageNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]*MessageNode)
	for _, folder := range s.Folders {
		for id, node := range folder.Nodes {
			if _, exists := result[id]; !exists {
				result[id] = node
			}
		}
	}
	return result
}

func (s *Store) toJSON() map[string]*Folder {
	result := make(map[string]*Folder)
	for k, v := range s.Folders {
		result[k] = v
	}
	return result
}

func (s *Store) broadcaster() {
	for msg := range s.broadcastCh {
		s.mu.RLock()
		if len(s.clients) == 0 {
			s.mu.RUnlock()
			continue
		}

		clients := make([]*websocket.Conn, 0, len(s.clients))
		for client := range s.clients {
			clients = append(clients, client)
		}
		s.mu.RUnlock()

		for _, client := range clients {
			if err := client.WriteJSON(msg); err != nil {
				log.Printf("Failed to broadcast to client: %v", err)
				s.mu.Lock()
				delete(s.clients, client)
				s.mu.Unlock()
				client.Close()
			}
		}
	}
}

func (s *Store) broadcast(msg WSMessage) {
	s.broadcastCh <- msg
}

func (s *Store) registerClient(conn *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[conn] = true
}

func (s *Store) unregisterClient(conn *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, conn)
}

func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func getDefaultOpenCodePath() string {
	if path := os.Getenv("USERPROFILE"); path != "" {
		return filepath.Join(path, ".local", "share", "opencode")
	}
	if path := os.Getenv("HOME"); path != "" {
		return filepath.Join(path, ".local", "share", "opencode")
	}
	if path := os.Getenv("OPENCODE_DATA_DIR"); path != "" {
		return path
	}
	return ""
}

func formatTimestamp(ms int64) string {
	return time.Unix(0, ms*int64(time.Millisecond)).Format(time.RFC3339)
}

func main() {
	var noBrowser bool
	flag.BoolVar(&noBrowser, "no-browser", false, "Disable automatic browser opening")
	flag.Parse()

	configManager = NewConfigManager()
	store := NewStore()

	exeDir := getExecutableDir()
	staticDir := filepath.Join(exeDir, "static")

	router := mux.NewRouter()

	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))

	router.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		store.registerClient(conn)
		defer store.unregisterClient(conn)

		store.broadcast(WSMessage{Type: MessageTypeInit, Data: store.toJSON()})

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	})

	router.HandleFunc("/api/folders", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			respondJSON(w, store.GetFolders())
		} else if r.Method == "POST" {
			var folder Folder
			if err := json.NewDecoder(r.Body).Decode(&folder); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			if folder.ID == "" {
				folder.ID = generateID()
			}
			if folder.Nodes == nil {
				folder.Nodes = make(map[string]*MessageNode)
			}
			if folder.CreatedAt == "" {
				folder.CreatedAt = time.Now().Format(time.RFC3339)
			}
			store.AddFolder(&folder)
			respondJSON(w, folder)
		}
	})

	router.HandleFunc("/api/folders/{id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		if r.Method == "PUT" {
			var folder Folder
			if err := json.NewDecoder(r.Body).Decode(&folder); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			store.UpdateFolder(&folder)
			respondJSON(w, folder)
		} else if r.Method == "DELETE" {
			store.DeleteFolder(id)
			respondJSON(w, map[string]string{"id": id})
		}
	})

	router.HandleFunc("/api/messages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			respondJSON(w, store.getAllNodes())
		} else if r.Method == "POST" {
			var node MessageNode
			if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			if node.ID == "" {
				node.ID = generateID()
			}
			if node.Timestamp == "" {
				node.Timestamp = time.Now().Format(time.RFC3339)
			}
			store.AddNode("", &node)
			respondJSON(w, node)
		}
	})

	router.HandleFunc("/api/messages/{nodeId}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		nodeID := vars["nodeId"]
		if r.Method == "PUT" {
			var node MessageNode
			if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			store.UpdateNode("", &node)
			respondJSON(w, node)
		} else if r.Method == "DELETE" {
			store.DeleteNode("", nodeID)
			respondJSON(w, map[string]string{"id": nodeID})
		} else if r.Method == "GET" {
			if node := store.loadMessageContent(nodeID); node != nil {
				respondJSON(w, node)
			} else {
				respondError(w, http.StatusNotFound, "Node not found")
			}
		} else if r.Method == "PATCH" {
			var data struct {
				Locked *bool `json:"locked"`
			}
			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}

			if data.Locked != nil {
				store.mu.Lock()
				if folder, exists := store.Folders["openchat"]; exists {
					if node, exists := folder.Nodes[nodeID]; exists {
						node.Locked = *data.Locked

						if store.db != nil {
							store.db.UpdateNodeLock(nodeID, *data.Locked)
						}

						store.broadcast(WSMessage{Type: MessageTypeUpdate, Data: store.toJSON()})
						store.mu.Unlock()
						respondJSON(w, map[string]bool{"locked": *data.Locked})
						return
					}
				}
				store.mu.Unlock()
				respondError(w, http.StatusNotFound, "Node not found")
			} else {
				respondError(w, http.StatusBadRequest, "No fields to update")
			}
		}
	})

	router.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var data struct {
				Query     string `json:"query"`
				SearchRaw bool   `json:"searchRaw"`
			}
			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}

			if store.db != nil {
				results := store.searchMessages(data.Query, data.SearchRaw)
				respondJSON(w, results)
			} else {
				results := store.searchMessages(data.Query, data.SearchRaw)
				respondJSON(w, results)
			}
		}
	})

	router.HandleFunc("/api/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			if store.syncManager == nil {
				respondError(w, http.StatusServiceUnavailable, "Sync manager not available")
				return
			}

			if store.syncManager.IsRunning() {
				respondJSON(w, map[string]string{"status": "already_running"})
				return
			}

			store.syncManager = syncpkg.NewSyncManager(store.db, store, store.dataPath, func(progress syncpkg.SyncProgress) {
				store.broadcast(WSMessage{Type: MessageTypeProgress, Data: progress})
			})

			if err := store.syncManager.StartSync(); err != nil {
				respondError(w, http.StatusInternalServerError, err.Error())
				return
			}

			respondJSON(w, map[string]string{"status": "started"})
		}
	})

	router.HandleFunc("/api/sync/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			if store.syncManager == nil {
				respondError(w, http.StatusServiceUnavailable, "Sync manager not available")
				return
			}

			store.syncManager.CancelSync()
			respondJSON(w, map[string]string{"status": "cancelled"})
		}
	})

	router.HandleFunc("/api/reorder", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var data struct {
				FolderID    string `json:"folderId"`
				NodeID      string `json:"nodeId"`
				NewParentID string `json:"newParentId"`
				NewIndex    int    `json:"newIndex"`
			}
			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			store.mu.Lock()
			if data.FolderID == "" || data.FolderID == "all" {
				for _, folder := range store.Folders {
					if node, exists := folder.Nodes[data.NodeID]; exists {
						if node.ParentID != "" {
							if parent, exists := folder.Nodes[node.ParentID]; exists {
								newChildren := []string{}
								for _, childID := range parent.Children {
									if childID != data.NodeID {
										newChildren = append(newChildren, childID)
									}
								}
								parent.Children = newChildren
							}
						}
						node.ParentID = data.NewParentID
						if data.NewParentID != "" {
							if newParent, exists := folder.Nodes[data.NewParentID]; exists {
								if data.NewIndex >= 0 && data.NewIndex <= len(newParent.Children) {
									newParent.Children = append(newParent.Children[:data.NewIndex],
										append([]string{data.NodeID}, newParent.Children[data.NewIndex:]...)...)
								} else {
									newParent.Children = append(newParent.Children, data.NodeID)
								}
							}
						}
					}
				}
			} else {
				if folder, exists := store.Folders[data.FolderID]; exists {
					if node, exists := folder.Nodes[data.NodeID]; exists {
						if node.ParentID != "" {
							if parent, exists := folder.Nodes[node.ParentID]; exists {
								newChildren := []string{}
								for _, childID := range parent.Children {
									if childID != data.NodeID {
										newChildren = append(newChildren, childID)
									}
								}
								parent.Children = newChildren
							}
						}
						node.ParentID = data.NewParentID
						if data.NewParentID != "" {
							if newParent, exists := folder.Nodes[data.NewParentID]; exists {
								if data.NewIndex >= 0 && data.NewIndex <= len(newParent.Children) {
									newParent.Children = append(newParent.Children[:data.NewIndex],
										append([]string{data.NodeID}, newParent.Children[data.NewIndex:]...)...)
								} else {
									newParent.Children = append(newParent.Children, data.NodeID)
								}
							}
						}
					}
				}
			}
			store.mu.Unlock()
			respondJSON(w, map[string]string{"status": "ok"})
		}
	})

	router.HandleFunc("/api/copy-selected", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var data struct {
				SelectedNodes []struct {
					NodeID string `json:"nodeId"`
				} `json:"selectedNodes"`
			}
			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}

			combined := ""
			store.mu.RLock()
			allNodes := store.getAllNodes()
			for _, selected := range data.SelectedNodes {
				if node, exists := allNodes[selected.NodeID]; exists {
					combined += node.Content + "\n\n"
				}
			}
			store.mu.RUnlock()

			respondJSON(w, map[string]string{"content": combined})
		}
	})

	router.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Content-Disposition", "attachment; filename=oc-message-explorer-export.json")
			json.NewEncoder(w).Encode(store.toJSON())
		}
	})

	router.HandleFunc("/api/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var importedData map[string]*Folder
			if err := json.NewDecoder(r.Body).Decode(&importedData); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}

			store.mu.Lock()
			for id, folder := range importedData {
				store.Folders[id] = folder
			}
			store.mu.Unlock()

			store.broadcast(WSMessage{Type: MessageTypeUpdate, Data: store.toJSON()})
			respondJSON(w, map[string]string{"status": "imported", "count": fmt.Sprintf("%d", len(importedData))})
		}
	})

	router.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			respondJSON(w, configManager.config)
		} else if r.Method == "PUT" {
			var updates map[string]string
			if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}

			for key, value := range updates {
				if err := configManager.setEnv(key, value); err != nil {
					respondError(w, http.StatusInternalServerError, err.Error())
					return
				}
			}

			respondJSON(w, configManager.config)
		}
	})

	router.HandleFunc("/api/todos", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			respondJSON(w, configManager.getTodos())
		} else if r.Method == "POST" {
			var data struct {
				Text     string `json:"text"`
				Priority string `json:"priority"`
			}
			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}

			priority := data.Priority
			if priority == "" {
				priority = "medium"
			}

			todo := configManager.addTodo(data.Text, priority)
			respondJSON(w, todo)
		}
	})

	router.HandleFunc("/api/todos/{id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		if r.Method == "PUT" {
			completed := configManager.toggleTodo(id)
			respondJSON(w, map[string]bool{"completed": completed})
		} else if r.Method == "DELETE" {
			deleted := configManager.deleteTodo(id)
			if deleted {
				respondJSON(w, map[string]string{"id": id})
			} else {
				respondError(w, http.StatusNotFound, "Todo not found")
			}
		}
	})

	router.HandleFunc("/api/agents-content", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			respondJSON(w, map[string]string{"content": configManager.readAgentsContent()})
		}
	})

	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		indexPath := filepath.Join(exeDir, "static", "index.html")
		http.ServeFile(w, r, indexPath)
	})

	router.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("  OC Message Explorer")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("\n  %s\n\n", url)
	fmt.Println("  Press Ctrl+C to quit")
	fmt.Println("\n" + strings.Repeat("=", 60) + "\n")

	srv := &http.Server{
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	serverErrors := make(chan error, 1)

	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			serverErrors <- err
		}
	}()

	if !noBrowser {
		go func() {
			time.Sleep(500 * time.Millisecond)
			openBrowser(url)
		}()
	}

	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		log.Printf("Server error: %v", err)
	case <-shutdownChan:
		fmt.Printf("\nShutting down...\n")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	fmt.Println("\nServer stopped gracefully")
}

func respondJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start"}
	case "darwin":
		cmd = "open"
	default: // "linux", "freebsd", "openbsd", "netbsd"
		cmd = "xdg-open"
	}
	args = append(args, url)

	exec.Command(cmd, args...).Start()
}
