package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"oc-message-explorer/internal/models"
	"oc-message-explorer/internal/utils"
)

type Store interface {
	GetFolders() map[string]*models.Folder
	GetAllNodes() map[string]*models.MessageNode
	GetNode(nodeID string) *models.MessageNode
	ToJSON() map[string]*models.Folder
	Broadcast(msg models.WSMessage)
	RegisterClient(conn *websocket.Conn)
	UnregisterClient(conn *websocket.Conn)
	Lock()
	Unlock()
	GetFoldersMap() map[string]*models.Folder
	ReorderNode(folderID, nodeID, newParentID string, newIndex int) error
}

type ConfigManager interface {
	GetConfig() models.EnvConfig
	SetEnv(key, value string) error
	GetTodos() []models.TodoItem
	AddTodo(text, priority string) *models.TodoItem
	ToggleTodo(id string) bool
	DeleteTodo(id string) bool
	ReadAgentsContent() string
}

type SyncManagerInterface interface {
	IsRunning() bool
	StartSync() error
	CancelSync()
}

type Handlers struct {
	store         Store
	configManager ConfigManager
	syncManager   SyncManagerInterface
	upgrader      websocket.Upgrader
	exeDir        string
}

func New(store Store, configManager ConfigManager, syncManager SyncManagerInterface, exeDir string) *Handlers {
	return &Handlers{
		store:         store,
		configManager: configManager,
		syncManager:   syncManager,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		exeDir: exeDir,
	}
}

func (h *Handlers) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/ws", h.handleWebSocket)
	router.HandleFunc("/api/folders", h.handleFolders)
	router.HandleFunc("/api/folders/{id}", h.handleFolderByID)
	router.HandleFunc("/api/messages", h.handleMessages)
	router.HandleFunc("/api/messages/{nodeId}", h.handleMessageByID)
	router.HandleFunc("/api/search", h.handleSearch)
	router.HandleFunc("/api/sync", h.handleSync)
	router.HandleFunc("/api/sync/cancel", h.handleSyncCancel)
	router.HandleFunc("/api/reorder", h.handleReorder)
	router.HandleFunc("/api/copy-selected", h.handleCopySelected)
	router.HandleFunc("/api/export", h.handleExport)
	router.HandleFunc("/api/import", h.handleImport)
	router.HandleFunc("/api/config", h.handleConfig)
	router.HandleFunc("/api/todos", h.handleTodos)
	router.HandleFunc("/api/todos/{id}", h.handleTodoByID)
	router.HandleFunc("/api/agents-content", h.handleAgentsContent)
}

func (h *Handlers) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	h.store.RegisterClient(conn)
	defer h.store.UnregisterClient(conn)

	h.store.Broadcast(models.WSMessage{Type: models.MessageTypeInit, Data: h.store.ToJSON()})

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *Handlers) handleFolders(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		respondJSON(w, h.store.GetFolders())
	} else if r.Method == "POST" {
		var folder models.Folder
		if err := json.NewDecoder(r.Body).Decode(&folder); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		if folder.ID == "" {
			folder.ID = utils.GenerateID()
		}
		if folder.Nodes == nil {
			folder.Nodes = make(map[string]*models.MessageNode)
		}
		if folder.CreatedAt == "" {
			folder.CreatedAt = time.Now().Format(time.RFC3339)
		}

		h.store.Lock()
		defer h.store.Unlock()
		folders := h.store.GetFoldersMap()
		folders[folder.ID] = &folder

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, folder)
	}
}

func (h *Handlers) handleFolderByID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if r.Method == "PUT" {
		var folder models.Folder
		if err := json.NewDecoder(r.Body).Decode(&folder); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		h.store.Lock()
		defer h.store.Unlock()
		folders := h.store.GetFoldersMap()
		if existingNodes := folders[id]; existingNodes != nil {
			folder.Nodes = existingNodes.Nodes
		}
		folders[id] = &folder

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, folder)
	} else if r.Method == "DELETE" {
		h.store.Lock()
		defer h.store.Unlock()
		delete(h.store.GetFoldersMap(), id)

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, map[string]string{"id": id})
	}
}

func (h *Handlers) handleMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		respondJSON(w, h.store.GetAllNodes())
	} else if r.Method == "POST" {
		var node models.MessageNode
		if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		if node.ID == "" {
			node.ID = utils.GenerateID()
		}
		if node.Timestamp == "" {
			node.Timestamp = time.Now().Format(time.RFC3339)
		}

		h.store.Lock()
		defer h.store.Unlock()
		folders := h.store.GetFoldersMap()
		if folder, exists := folders["all"]; exists {
			folder.Nodes[node.ID] = &node
		} else {
			folder := &models.Folder{
				ID:        "all",
				Name:      "All Messages",
				Color:     "#6c5ce7",
				CreatedAt: time.Now().Format(time.RFC3339),
				Nodes:     map[string]*models.MessageNode{node.ID: &node},
			}
			folders["all"] = folder
		}

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, node)
	}
}

func (h *Handlers) handleMessageByID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	nodeID := vars["nodeID"]

	if r.Method == "PUT" {
		var node models.MessageNode
		if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		h.store.Lock()
		defer h.store.Unlock()
		folders := h.store.GetFoldersMap()
		for _, folder := range folders {
			if existing, exists := folder.Nodes[nodeID]; exists {
				if node.Content != "" {
					existing.Content = node.Content
				}
				if node.Summary != "" {
					existing.Summary = node.Summary
				}
				if node.Tags != nil {
					existing.Tags = node.Tags
				}
				break
			}
		}

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, node)
	} else if r.Method == "DELETE" {
		h.store.Lock()
		defer h.store.Unlock()
		folders := h.store.GetFoldersMap()
		for _, folder := range folders {
			delete(folder.Nodes, nodeID)
		}

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, map[string]string{"id": nodeID})
	} else if r.Method == "GET" {
		if node := h.store.GetNode(nodeID); node != nil {
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
			h.store.Lock()
			folders := h.store.GetFoldersMap()
			for _, folder := range folders {
				if node, exists := folder.Nodes[nodeID]; exists {
					node.Locked = *data.Locked
					h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
					h.store.Unlock()
					respondJSON(w, map[string]bool{"locked": *data.Locked})
					return
				}
			}
			h.store.Unlock()
			respondError(w, http.StatusNotFound, "Node not found")
		} else {
			respondError(w, http.StatusBadRequest, "No fields to update")
		}
	}
}

func (h *Handlers) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		var data struct {
			Query     string `json:"query"`
			SearchRaw bool   `json:"searchRaw"`
		}
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		h.store.Lock()
		defer h.store.Unlock()

		results := make(map[string]*models.MessageNode)
		queryLower := strings.ToLower(data.Query)
		allNodes := h.store.GetAllNodes()

		for id, node := range allNodes {
			var matched bool
			if data.SearchRaw {
				contentLower := strings.ToLower(node.Content)
				if strings.Contains(contentLower, queryLower) {
					matched = true
				}
			} else {
				summaryLower := strings.ToLower(node.Summary)
				if strings.Contains(summaryLower, queryLower) {
					matched = true
				}
			}

			if !matched {
				for _, tag := range node.Tags {
					if strings.Contains(strings.ToLower(tag), queryLower) {
						matched = true
						break
					}
				}
			}

			if matched && !utils.IsAutoGenerated(utils.GetSummaryTitle(node.Summary)) {
				results[id] = node
			}
		}

		respondJSON(w, results)
	}
}

func (h *Handlers) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		if h.syncManager == nil {
			respondError(w, http.StatusServiceUnavailable, "Sync manager not available")
			return
		}

		if h.syncManager.IsRunning() {
			respondJSON(w, map[string]string{"status": "already_running"})
			return
		}

		if err := h.syncManager.StartSync(); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}

		respondJSON(w, map[string]string{"status": "started"})
	}
}

func (h *Handlers) handleSyncCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		if h.syncManager == nil {
			respondError(w, http.StatusServiceUnavailable, "Sync manager not available")
			return
		}

		h.syncManager.CancelSync()
		respondJSON(w, map[string]string{"status": "cancelled"})
	}
}

func (h *Handlers) handleReorder(w http.ResponseWriter, r *http.Request) {
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

		h.store.Lock()
		defer h.store.Unlock()

		if data.FolderID == "" || data.FolderID == "all" {
			for _, folder := range h.store.GetFoldersMap() {
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
			if folder, exists := h.store.GetFoldersMap()[data.FolderID]; exists {
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

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, map[string]string{"status": "ok"})
	}
}

func (h *Handlers) handleCopySelected(w http.ResponseWriter, r *http.Request) {
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
		allNodes := h.store.GetAllNodes()
		for _, selected := range data.SelectedNodes {
			if node, exists := allNodes[selected.NodeID]; exists {
				combined += node.Content + "\n\n"
			}
		}

		respondJSON(w, map[string]string{"content": combined})
	}
}

func (h *Handlers) handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=oc-message-explorer-export.json")
		json.NewEncoder(w).Encode(h.store.ToJSON())
	}
}

func (h *Handlers) handleImport(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		var importedData map[string]*models.Folder
		if err := json.NewDecoder(r.Body).Decode(&importedData); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		h.store.Lock()
		defer h.store.Unlock()
		folders := h.store.GetFoldersMap()
		for id, folder := range importedData {
			folders[id] = folder
		}

		h.store.Broadcast(models.WSMessage{Type: models.MessageTypeUpdate, Data: h.store.ToJSON()})
		respondJSON(w, map[string]string{"status": "imported", "count": fmt.Sprintf("%d", len(importedData))})
	}
}

func (h *Handlers) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		respondJSON(w, h.configManager.GetConfig())
	} else if r.Method == "PUT" {
		var updates map[string]string
		if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}

		for key, value := range updates {
			if err := h.configManager.SetEnv(key, value); err != nil {
				respondError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}

		respondJSON(w, h.configManager.GetConfig())
	}
}

func (h *Handlers) handleTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		respondJSON(w, h.configManager.GetTodos())
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

		todo := h.configManager.AddTodo(data.Text, priority)
		respondJSON(w, todo)
	}
}

func (h *Handlers) handleTodoByID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if r.Method == "PUT" {
		completed := h.configManager.ToggleTodo(id)
		respondJSON(w, map[string]bool{"completed": completed})
	} else if r.Method == "DELETE" {
		deleted := h.configManager.DeleteTodo(id)
		if deleted {
			respondJSON(w, map[string]string{"id": id})
		} else {
			respondError(w, http.StatusNotFound, "Todo not found")
		}
	}
}

func (h *Handlers) handleAgentsContent(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		respondJSON(w, map[string]string{"content": h.configManager.ReadAgentsContent()})
	}
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
