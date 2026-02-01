package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"oc-message-explorer/internal/models"
	"oc-message-explorer/internal/utils"

	_ "modernc.org/sqlite"
)

type Database struct {
	db     *sql.DB
	dbPath string
	mu     sync.RWMutex
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

	CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
		node_id UNINDEXED,
		content,
		summary,
		type,
		tokenize = 'unicode61'
	);

	CREATE INDEX IF NOT EXISTS idx_nodes_folder_id ON nodes(folder_id);
	CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
	CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
	CREATE INDEX IF NOT EXISTS idx_nodes_timestamp ON nodes(timestamp);
	CREATE INDEX IF NOT EXISTS idx_tags_node_id ON tags(node_id);
	CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes
	BEGIN
		INSERT INTO nodes_fts(node_id, content, summary, type)
		VALUES (NEW.id, NEW.content, NEW.summary, NEW.type);
	END;

	CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes
	BEGIN
		DELETE FROM nodes_fts WHERE node_id = OLD.id;
	END;

	CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes
	BEGIN
		UPDATE nodes_fts SET content = NEW.content, summary = NEW.summary, type = NEW.type
		WHERE node_id = NEW.id;
	END;
	`

	_, err := d.db.Exec(schema)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}

func (d *Database) GetFolder(id string) (*models.Folder, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var folder models.Folder
	err := d.db.QueryRow("SELECT id, name, color, created_at FROM folders WHERE id = ?", id).
		Scan(&folder.ID, &folder.Name, &folder.Color, &folder.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	folder.Nodes = make(map[string]*models.MessageNode)

	return &folder, nil
}

func (d *Database) GetAllFolders() (map[string]*models.Folder, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query("SELECT id, name, color, created_at FROM folders ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := make(map[string]*models.Folder)
	for rows.Next() {
		var folder models.Folder
		if err := rows.Scan(&folder.ID, &folder.Name, &folder.Color, &folder.CreatedAt); err != nil {
			return nil, err
		}
		folder.Nodes = make(map[string]*models.MessageNode)
		folders[folder.ID] = &folder
	}

	return folders, nil
}

func (d *Database) GetNodesForFolder(folderID string) (map[string]*models.MessageNode, error) {
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

	nodes := make(map[string]*models.MessageNode)
	var nodeIDs []string

	for rows.Next() {
		var node models.MessageNode
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

	tagsQuery := fmt.Sprintf("SELECT node_id, tag FROM tags WHERE node_id IN (%s)", utils.Placeholders(len(nodeIDs)))
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

func (d *Database) GetNode(id string) (*models.MessageNode, error) {
	var node models.MessageNode
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

func (d *Database) InsertFolder(folder *models.Folder) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(
		"INSERT OR REPLACE INTO folders (id, name, color, created_at) VALUES (?, ?, ?, ?)",
		folder.ID, folder.Name, folder.Color, folder.CreatedAt,
	)
	return err
}

func (d *Database) InsertNode(folderID string, node *models.MessageNode) error {
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

func (d *Database) UpdateNode(folderID string, node *models.MessageNode) error {
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

func (d *Database) GetAllNodes() (map[string]*models.MessageNode, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	results := make(map[string]*models.MessageNode)

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
		var node models.MessageNode
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

		results[node.ID] = &node
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

func (d *Database) SearchNodes(query string, limit int) ([]map[string]interface{}, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if query == "" {
		return []map[string]interface{}{}, nil
	}

	sqlQuery := `
		SELECT 
			n.id,
			n.type,
			n.content,
			n.summary,
			n.timestamp,
			n.parent_id,
			f.id as folder_id,
			f.name as folder_name,
			f.color as folder_color,
			bm25(nodes_fts) as rank
		FROM nodes_fts
		JOIN nodes n ON n.id = nodes_fts.node_id
		LEFT JOIN folders f ON n.folder_id = f.id
		WHERE nodes_fts MATCH ?
		ORDER BY rank
		LIMIT ?
	`

	rows, err := d.db.Query(sqlQuery, query, limit)
	if err != nil {
		return nil, fmt.Errorf("FTS search failed: %w", err)
	}
	defer rows.Close()

	results := []map[string]interface{}{}
	for rows.Next() {
		var id, nodeType, content, summary, timestamp, folderID, folderName, folderColor string
		var parentID sql.NullString
		var rank float64

		err := rows.Scan(
			&id, &nodeType, &content, &summary, &timestamp, &parentID,
			&folderID, &folderName, &folderColor, &rank,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		results = append(results, map[string]interface{}{
			"id":           id,
			"type":         nodeType,
			"content":      content,
			"summary":      summary,
			"timestamp":    timestamp,
			"parent_id":    parentID.String,
			"folder_id":    folderID,
			"folder_name":  folderName,
			"folder_color": folderColor,
			"rank":         rank,
		})
	}

	return results, nil
}

func (d *Database) SearchNodesByType(query string, nodeType string, limit int) ([]map[string]interface{}, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if query == "" {
		return []map[string]interface{}{}, nil
	}

	sqlQuery := `
		SELECT 
			n.id,
			n.type,
			n.content,
			n.summary,
			n.timestamp,
			n.parent_id,
			f.id as folder_id,
			f.name as folder_name,
			f.color as folder_color,
			bm25(nodes_fts) as rank
		FROM nodes_fts
		JOIN nodes n ON n.id = nodes_fts.node_id
		LEFT JOIN folders f ON n.folder_id = f.id
		WHERE nodes_fts MATCH ? AND n.type = ?
		ORDER BY rank
		LIMIT ?
	`

	rows, err := d.db.Query(sqlQuery, query, nodeType, limit)
	if err != nil {
		return nil, fmt.Errorf("FTS search by type failed: %w", err)
	}
	defer rows.Close()

	results := []map[string]interface{}{}
	for rows.Next() {
		var id, typ, content, summary, timestamp, folderID, folderName, folderColor string
		var parentID sql.NullString
		var rank float64

		err := rows.Scan(
			&id, &typ, &content, &summary, &timestamp, &parentID,
			&folderID, &folderName, &folderColor, &rank,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		results = append(results, map[string]interface{}{
			"id":           id,
			"type":         typ,
			"content":      content,
			"summary":      summary,
			"timestamp":    timestamp,
			"parent_id":    parentID.String,
			"folder_id":    folderID,
			"folder_name":  folderName,
			"folder_color": folderColor,
			"rank":         rank,
		})
	}

	return results, nil
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

type SyncManager struct {
	db *Database
}
