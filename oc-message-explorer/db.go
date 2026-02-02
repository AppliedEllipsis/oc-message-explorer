package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Database struct {
	db     *sql.DB
	dbPath string
	mu     sync.RWMutex
}

func placeholders(count int) string {
	if count == 0 {
		return ""
	}
	return strings.Repeat("?,", count)[:count*2-1]
}

func NewDatabase(dbPath string) (*Database, error) {
	db := &Database{
		dbPath: dbPath,
	}

	if err := db.init(); err != nil {
		return nil, err
	}

	return db, nil
}

func (d *Database) init() error {
	var err error

	os.MkdirAll(filepath.Dir(d.dbPath), 0755)

	d.db, err = sql.Open("sqlite", d.dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	if err := d.db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	if err := d.createSchema(); err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	d.db.SetMaxOpenConns(1)

	log.Printf("Database initialized: %s", d.dbPath)
	return nil
}

func (d *Database) createSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS folders (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		color TEXT NOT NULL,
		created_at TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS nodes (
		id TEXT PRIMARY KEY,
		folder_id TEXT NOT NULL,
		type TEXT NOT NULL,
		content TEXT,
		summary TEXT,
		timestamp TEXT NOT NULL,
		parent_id TEXT,
		expanded INTEGER NOT NULL DEFAULT 0,
		selected INTEGER NOT NULL DEFAULT 0,
		session_id TEXT,
		has_loaded INTEGER NOT NULL DEFAULT 0,
		locked INTEGER NOT NULL DEFAULT 0,
		FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		tag TEXT NOT NULL,
		FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_nodes_folder_id ON nodes(folder_id);
	CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
	CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
	CREATE INDEX IF NOT EXISTS idx_nodes_timestamp ON nodes(timestamp);
	CREATE INDEX IF NOT EXISTS idx_tags_node_id ON tags(node_id);
	`

	_, err := d.db.Exec(schema)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}

func (d *Database) GetFolder(id string) (*Folder, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var folder Folder
	err := d.db.QueryRow("SELECT id, name, color, created_at FROM folders WHERE id = ?", id).
		Scan(&folder.ID, &folder.Name, &folder.Color, &folder.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	folder.Nodes = make(map[string]*MessageNode)

	return &folder, nil
}

func (d *Database) GetAllFolders() (map[string]*Folder, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query("SELECT id, name, color, created_at FROM folders ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := make(map[string]*Folder)
	for rows.Next() {
		var folder Folder
		if err := rows.Scan(&folder.ID, &folder.Name, &folder.Color, &folder.CreatedAt); err != nil {
			return nil, err
		}
		folder.Nodes = make(map[string]*MessageNode)
		folders[folder.ID] = &folder
	}

	return folders, nil
}

func (d *Database) GetNodesForFolder(folderID string) (map[string]*MessageNode, error) {
	rows, err := d.db.Query(`
		SELECT n.id, n.type, n.content, n.summary, n.timestamp, n.parent_id,
		       n.expanded, n.selected, n.session_id, n.has_loaded, n.locked
		FROM nodes n
		WHERE n.folder_id = ?
		ORDER BY n.timestamp DESC
	`, folderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	nodes := make(map[string]*MessageNode)
	var nodeIDs []string

	for rows.Next() {
		var node MessageNode
		var expanded, selected, hasLoaded, locked int

		err := rows.Scan(
			&node.ID, &node.Type, &node.Content, &node.Summary, &node.Timestamp,
			&node.ParentID, &expanded, &selected, &node.SessionID, &hasLoaded, &locked,
		)
		if err != nil {
			return nil, err
		}

		node.Expanded = expanded == 1
		node.Selected = selected == 1
		node.HasLoaded = hasLoaded == 1
		node.Locked = locked == 1

		nodes[node.ID] = &node
		nodeIDs = append(nodeIDs, node.ID)
	}

	if len(nodeIDs) == 0 {
		return nodes, nil
	}

	tagsQuery := fmt.Sprintf("SELECT node_id, tag FROM tags WHERE node_id IN (%s)", placeholders(len(nodeIDs)))
	tagsArgs := make([]any, len(nodeIDs))
	for i, id := range nodeIDs {
		tagsArgs[i] = id
	}

	tagsRows, err := d.db.Query(tagsQuery, tagsArgs...)
	if err != nil {
		return nil, err
	}
	defer tagsRows.Close()

	tagsMap := make(map[string][]string)
	for tagsRows.Next() {
		var nodeID, tag string
		if err := tagsRows.Scan(&nodeID, &tag); err != nil {
			return nil, err
		}
		tagsMap[nodeID] = append(tagsMap[nodeID], tag)
	}

	for nodeID, node := range nodes {
		if tagList, exists := tagsMap[nodeID]; exists {
			node.Tags = tagList
		}
	}

	for _, node := range nodes {
		if node.ParentID != "" {
			if parent, exists := nodes[node.ParentID]; exists {
				parent.Children = append(parent.Children, node.ID)
			}
		}
	}

	return nodes, nil
}

func (d *Database) getTagsForNode(nodeID string) ([]string, error) {
	rows, err := d.db.Query("SELECT tag FROM tags WHERE node_id = ?", nodeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func (d *Database) getChildrenIDs(parentID string) ([]string, error) {
	rows, err := d.db.Query("SELECT id FROM nodes WHERE parent_id = ?", parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var children []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		children = append(children, id)
	}

	return children, nil
}

func (d *Database) GetNode(id string) (*MessageNode, error) {
	var node MessageNode
	var expanded, selected, hasLoaded, locked int

	err := d.db.QueryRow(`
		SELECT id, type, content, summary, timestamp, parent_id,
		       expanded, selected, session_id, has_loaded, locked
		FROM nodes
		WHERE id = ?
	`, id).Scan(
		&node.ID, &node.Type, &node.Content, &node.Summary, &node.Timestamp,
		&node.ParentID, &expanded, &selected, &node.SessionID, &hasLoaded, &locked,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	node.Expanded = expanded == 1
	node.Selected = selected == 1
	node.HasLoaded = hasLoaded == 1
	node.Locked = locked == 1

	tags, err := d.getTagsForNode(node.ID)
	if err != nil {
		return nil, err
	}
	node.Tags = tags

	children, err := d.getChildrenIDs(node.ID)
	if err != nil {
		return nil, err
	}
	node.Children = children

	return &node, nil
}

func (d *Database) InsertFolder(folder *Folder) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(
		"INSERT OR REPLACE INTO folders (id, name, color, created_at) VALUES (?, ?, ?, ?)",
		folder.ID, folder.Name, folder.Color, folder.CreatedAt,
	)
	return err
}

func (d *Database) InsertNode(folderID string, node *MessageNode) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	expanded := 0
	if node.Expanded {
		expanded = 1
	}
	selected := 0
	if node.Selected {
		selected = 1
	}
	hasLoaded := 0
	if node.HasLoaded {
		hasLoaded = 1
	}
	locked := 0
	if node.Locked {
		locked = 1
	}

	_, err = tx.Exec(`
		INSERT OR REPLACE INTO nodes 
		(id, folder_id, type, content, summary, timestamp, parent_id, 
		 expanded, selected, session_id, has_loaded, locked)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, node.ID, folderID, node.Type, node.Content, node.Summary, node.Timestamp,
		node.ParentID, expanded, selected, node.SessionID, hasLoaded, locked)
	if err != nil {
		return err
	}

	_, err = tx.Exec("DELETE FROM tags WHERE node_id = ?", node.ID)
	if err != nil {
		return err
	}

	for _, tag := range node.Tags {
		_, err = tx.Exec("INSERT INTO tags (node_id, tag) VALUES (?, ?)", node.ID, tag)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *Database) UpdateNode(folderID string, node *MessageNode) error {
	return d.InsertNode(folderID, node)
}

func (d *Database) DeleteFolder(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec("DELETE FROM folders WHERE id = ?", id)
	return err
}

func (d *Database) DeleteNode(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec("DELETE FROM nodes WHERE id = ?", id)
	return err
}

func (d *Database) UpdateNodeLock(id string, locked bool) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	lockedInt := 0
	if locked {
		lockedInt = 1
	}

	_, err := d.db.Exec("UPDATE nodes SET locked = ? WHERE id = ?", lockedInt, id)
	return err
}

func (d *Database) SearchNodes(query string, searchRaw bool) (map[string]*MessageNode, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	results := make(map[string]*MessageNode)
	queryLower := strings.ToLower(query)

	rows, err := d.db.Query(`
		SELECT id, type, content, summary, timestamp, parent_id, 
		       expanded, selected, session_id, has_loaded, locked
		FROM nodes
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var node MessageNode
		var expanded, selected, hasLoaded, locked int

		err := rows.Scan(
			&node.ID, &node.Type, &node.Content, &node.Summary, &node.Timestamp,
			&node.ParentID, &expanded, &selected, &node.SessionID, &hasLoaded, &locked,
		)
		if err != nil {
			return nil, err
		}

		node.Expanded = expanded == 1
		node.Selected = selected == 1
		node.HasLoaded = hasLoaded == 1
		node.Locked = locked == 1

		tags, err := d.getTagsForNode(node.ID)
		if err != nil {
			return nil, err
		}
		node.Tags = tags

		children, err := d.getChildrenIDs(node.ID)
		if err != nil {
			return nil, err
		}
		node.Children = children

		score, _ := calculateMatchScore(queryLower, &node, searchRaw)
		if score > 0 {
			results[node.ID] = &node
		}
	}

	return results, nil
}

func (d *Database) GetTotalMessageCount() (int, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM nodes").Scan(&count)
	return count, err
}

func (d *Database) IsEmpty() (bool, error) {
	count, err := d.GetTotalMessageCount()
	return count == 0, err
}

func (d *Database) DeleteAllData() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec("DELETE FROM tags")
	if err != nil {
		return err
	}

	_, err = d.db.Exec("DELETE FROM nodes")
	if err != nil {
		return err
	}

	_, err = d.db.Exec("DELETE FROM folders")
	if err != nil {
		return err
	}

	return nil
}

type SyncProgress struct {
	TotalMessages int    `json:"totalMessages"`
	Processed     int    `json:"processed"`
	Phase         string `json:"phase"`
	Message       string `json:"message"`
	Error         string `json:"error,omitempty"`
}

type SyncManager struct {
	db               *Database
	store            *Store
	dataPath         string
	msgPath          string
	partPath         string
	progressCallback func(SyncProgress)
	cancelChan       chan struct{}
	running          bool
	mu               sync.RWMutex
}

func NewSyncManager(db *Database, store *Store, dataPath string, progressCallback func(SyncProgress)) *SyncManager {
	msgPath := filepath.Join(dataPath, "storage", "message")
	partPath := filepath.Join(dataPath, "storage", "part")

	return &SyncManager{
		db:               db,
		store:            store,
		dataPath:         dataPath,
		msgPath:          msgPath,
		partPath:         partPath,
		progressCallback: progressCallback,
		cancelChan:       make(chan struct{}),
	}
}

func (sm *SyncManager) StartSync() error {
	sm.mu.Lock()
	if sm.running {
		sm.mu.Unlock()
		return fmt.Errorf("sync already running")
	}
	sm.running = true
	sm.mu.Unlock()

	go sm.performSync()
	return nil
}

func (sm *SyncManager) CancelSync() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.running {
		close(sm.cancelChan)
		sm.cancelChan = make(chan struct{})
		sm.running = false
	}
}

func (sm *SyncManager) performSync() {
	defer func() {
		sm.mu.Lock()
		sm.running = false
		sm.mu.Unlock()
	}()

	sm.reportProgress(SyncProgress{Phase: "init", Message: "Starting sync..."})

	isEmpty, err := sm.db.IsEmpty()
	if err != nil {
		sm.reportProgress(SyncProgress{Phase: "error", Message: "Failed to check database", Error: err.Error()})
		return
	}

	messageNodes := make(map[string]*MessageNode)

	sm.reportProgress(SyncProgress{Phase: "reading", Message: "Reading OpenCode messages..."})

	sessions, err := os.ReadDir(sm.msgPath)
	if err != nil {
		sm.reportProgress(SyncProgress{Phase: "error", Message: "Failed to read OpenChat message directory", Error: err.Error()})
		return
	}

	totalSessions := len(sessions)
	sm.reportProgress(SyncProgress{Phase: "reading", Message: fmt.Sprintf("Found %d sessions...", totalSessions), TotalMessages: totalSessions})

	sessionCount := 0
	totalMessages := 0

	for _, sessionDir := range sessions {
		select {
		case <-sm.cancelChan:
			sm.reportProgress(SyncProgress{Phase: "cancelled", Message: "Sync cancelled by user"})
			return
		default:
		}

		if !sessionDir.IsDir() {
			continue
		}

		sessionPath := filepath.Join(sm.msgPath, sessionDir.Name())
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
				Content:   "",
				Summary:   title,
				Timestamp: formatTimestamp(ocMsg.Time.Created),
				ParentID:  ocMsg.ParentID,
				Children:  []string{},
				Tags:      nodeTags,
				Expanded:  false,
				Selected:  false,
				SessionID: ocMsg.SessionID,
				HasLoaded: false,
			}

			messageNodes[ocMsg.ID] = node
			msgCount++
			totalMessages++

			if msgCount%100 == 0 || msgCount == 1 {
				sm.reportProgress(SyncProgress{
					Phase:         "reading",
					Message:       fmt.Sprintf("Read %d/%d sessions (%d msgs)...", sessionCount+1, totalSessions, totalMessages),
					Processed:     totalMessages,
					TotalMessages: totalMessages,
				})
			}
		}

		log.Printf("Loaded %d messages from session %s", msgCount, sessionDir.Name())
		sessionCount++

		if sessionCount%10 == 0 {
			sm.reportProgress(SyncProgress{
				Phase:         "reading",
				Message:       fmt.Sprintf("Read %d/%d sessions (%d msgs)...", sessionCount, totalSessions, totalMessages),
				Processed:     totalMessages,
				TotalMessages: totalMessages,
			})
		}
	}

	sm.reportProgress(SyncProgress{
		Phase:         "building",
		Message:       "Building parent-child relationships...",
		Processed:     totalMessages,
		TotalMessages: totalMessages,
	})

	for _, node := range messageNodes {
		select {
		case <-sm.cancelChan:
			sm.reportProgress(SyncProgress{Phase: "cancelled", Message: "Sync cancelled by user"})
			return
		default:
		}

		if node.ParentID != "" {
			if parent, exists := messageNodes[node.ParentID]; exists {
				parent.Children = append(parent.Children, node.ID)
			}
		}
	}

	log.Printf("Built relationships for %d messages from %d sessions", len(messageNodes), totalSessions)

	if len(messageNodes) > 0 {
		sm.reportProgress(SyncProgress{
			Phase:         "writing",
			Message:       "Writing to database...",
			Processed:     0,
			TotalMessages: len(messageNodes),
		})

		if isEmpty {
			if err := sm.writeFullSync(messageNodes, totalSessions); err != nil {
				sm.reportProgress(SyncProgress{Phase: "error", Message: "Failed to write to database", Error: err.Error()})
				return
			}
		} else {
			if err := sm.writeIncrementalSync(messageNodes); err != nil {
				sm.reportProgress(SyncProgress{Phase: "error", Message: "Failed to write to database", Error: err.Error()})
				return
			}
		}
	}

	sm.reportProgress(SyncProgress{
		Phase:         "complete",
		Message:       fmt.Sprintf("Sync complete: %d messages from %d sessions", len(messageNodes), totalSessions),
		Processed:     len(messageNodes),
		TotalMessages: len(messageNodes),
	})
}

func (sm *SyncManager) writeFullSync(messageNodes map[string]*MessageNode, sessionCount int) error {
	folder := &Folder{
		ID:        "openchat",
		Name:      "OpenChat History",
		Color:     "#e94560",
		CreatedAt: time.Now().Format(time.RFC3339),
		Nodes:     messageNodes,
	}

	if err := sm.db.InsertFolder(folder); err != nil {
		return err
	}

	processed := 0
	for _, node := range messageNodes {
		select {
		case <-sm.cancelChan:
			return fmt.Errorf("sync cancelled")
		default:
		}

		if err := sm.db.InsertNode(folder.ID, node); err != nil {
			log.Printf("Failed to insert node %s: %v", node.ID, err)
			continue
		}

		processed++
		if processed%100 == 0 || processed == 1 {
			sm.reportProgress(SyncProgress{
				Phase:         "writing",
				Message:       fmt.Sprintf("Writing %d/%d messages...", processed, len(messageNodes)),
				Processed:     processed,
				TotalMessages: len(messageNodes),
			})
		}
	}

	return nil
}

func (sm *SyncManager) writeIncrementalSync(messageNodes map[string]*MessageNode) error {
	existingFolder, err := sm.db.GetFolder("openchat")
	if err != nil {
		return err
	}

	if existingFolder == nil {
		return fmt.Errorf("folder not found")
	}

	existingNodes, err := sm.db.GetNodesForFolder("openchat")
	if err != nil {
		return err
	}

	newCount := 0
	updatedCount := 0

	for id, newNode := range messageNodes {
		select {
		case <-sm.cancelChan:
			return fmt.Errorf("sync cancelled")
		default:
		}

		if existingNode, exists := existingNodes[id]; exists {
			existingNode.Summary = newNode.Summary
			existingNode.Tags = newNode.Tags
			existingNode.Children = newNode.Children

			if err := sm.db.UpdateNode("openchat", existingNode); err != nil {
				log.Printf("Failed to update node %s: %v", id, err)
			} else {
				updatedCount++
			}
		} else {
			if err := sm.db.InsertNode("openchat", newNode); err != nil {
				log.Printf("Failed to insert node %s: %v", id, err)
			} else {
				newCount++
			}
		}

		if (newCount+updatedCount)%100 == 0 || (newCount+updatedCount) == 1 {
			sm.reportProgress(SyncProgress{
				Phase:         "writing",
				Message:       fmt.Sprintf("Writing %d new, %d updated...", newCount, updatedCount),
				Processed:     newCount + updatedCount,
				TotalMessages: len(messageNodes),
			})
		}
	}

	return nil
}

func (sm *SyncManager) reportProgress(progress SyncProgress) {
	if sm.progressCallback != nil {
		sm.progressCallback(progress)
	}
}

func (sm *SyncManager) IsRunning() bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.running
}
