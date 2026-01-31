let ws;
let folders = {};
let allMessages = {};
let currentFolderId = 'all';
let currentEditingNodeId = null;
let selectedFolderColor = '#e94560';
let draggedNodeId = null;
let searchQuery = '';
let searchTimeout = null;
let searchResults = {};

function init() {
    connectWebSocket();
    setupColorPicker();
    setupDragAndDrop();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'init' || message.type === 'update') {
            folders = message.data;
            updateAllMessages();
            renderFolders();
            renderTree();
            hideLoadingScreen();
        } else if (message.type === 'progress') {
            handleProgress(message.data);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function updateAllMessages() {
    allMessages = {};
    for (const folderId in folders) {
        const folder = folders[folderId];
        for (const nodeId in folder.nodes) {
            if (!allMessages[nodeId]) {
                allMessages[nodeId] = folder.nodes[nodeId];
            }
        }
    }
}

function renderFolders() {
    const list = document.getElementById('folderList');

    list.innerHTML = `
        <li class="folder-item ${currentFolderId === 'all' ? 'active' : ''}" data-folder="all" onclick="selectFolder('all')">
            <div class="folder-name">📋 All Messages</div>
            <small style="color: #888;">${Object.keys(allMessages || {}).length} messages</small>
        </li>
    `;

    Object.entries(folders).forEach(([id, folder]) => {
        const li = document.createElement('li');
        li.className = `folder-item ${currentFolderId === id ? 'active' : ''}`;
        li.dataset.folder = id;
        li.innerHTML = `
            <span class="folder-color" style="background: ${folder.color}"></span>
            <div class="folder-name">${folder.name}</div>
            <small style="color: #888;">${Object.keys(folder.nodes).length} messages</small>
        `;
        li.onclick = () => selectFolder(id);
        li.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm('Delete this folder?')) {
                deleteFolder(id);
            }
        };
        list.appendChild(li);
    });
}

function selectFolder(id) {
    currentFolderId = id;
    renderFolders();
    renderTree();
}

function getMessagesToDisplay() {
    if (currentFolderId === 'all') {
        return allMessages;
    }
    return folders[currentFolderId]?.nodes || {};
}

function filterMessages() {
    const query = document.getElementById('searchBox').value.trim();

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        searchQuery = query;

        if (query.length < 2) {
            searchResults = {};
            renderTree();
            return;
        }

        fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        })
        .then(res => res.json())
        .then(results => {
            searchResults = results || {};
            renderTree();
        })
        .catch(err => {
            console.error('Search error:', err);
            renderTree();
        });
    }, 300);
}

function renderTree() {
    const container = document.getElementById('treeContainer');
    let messages;

    if (searchQuery && Object.keys(searchResults).length > 0) {
        messages = searchResults;
    } else {
        messages = getMessagesToDisplay();
    }

    if (Object.keys(messages).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>${searchQuery ? 'No messages match your search' : 'No messages yet'}</h3>
                <p>${searchQuery ? 'Try a different search term or misspelling' : 'Add a prompt or response to start tracking your conversation history'}</p>
            </div>
        `;
        return;
    }

    const rootNodes = Object.values(messages).filter(n => !n.parentId);

    if (rootNodes.length === 0) {
        const firstNode = Object.values(messages)[0];
        container.innerHTML = '';
        container.appendChild(createNodeElement(firstNode, messages));
        return;
    }

    container.innerHTML = '';
    rootNodes.forEach(node => {
        container.appendChild(createNodeElement(node, messages, true));
    });
}

function createNodeElement(node, messages, isRoot = false) {
    const div = document.createElement('div');
    div.className = `tree-node ${isRoot ? 'tree-root' : ''}`;
    div.id = `node-${node.id}`;

    const hasChildren = node.children && node.children.length > 0;
    const expandIcon = hasChildren ? (node.expanded ? '▼' : '▶') : '•';

    const timestamp = formatTimestamp(node.timestamp);

    const displayContent = node.hasLoaded ? node.content : `${node.content.substring(0, 100)}${node.content.length > 100 ? '...' : ''}`;

    div.innerHTML = `
        <div class="node-content ${node.type}-node ${node.selected ? 'selected' : ''}" data-node-id="${node.id}">
            <span class="expand-icon">${expandIcon}</span>
            <input type="checkbox" class="node-checkbox" ${node.selected ? 'checked' : ''}>
            <span class="node-type ${node.type}">${node.type}</span>
            <span class="node-text">${escapeHtml(displayContent)}</span>
            <span class="node-timestamp">${timestamp}</span>
        </div>
        ${node.tags && node.tags.length > 0 ? `<div class="tags">${node.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        <div class="children-container" style="display: ${hasChildren && node.expanded ? 'block' : 'none'};"></div>
    `;

    const contentDiv = div.querySelector('.node-content');
    const expandIconEl = div.querySelector('.expand-icon');
    const checkbox = div.querySelector('.node-checkbox');
    const childrenContainer = div.querySelector('.children-container');

    contentDiv.onclick = (e) => {
        if (e.target !== checkbox && e.target !== expandIconEl) {
            openEditor(node.id);
        }
    };

    expandIconEl.onclick = (e) => {
        e.stopPropagation();
        toggleExpand(node.id);
        if (node.expanded && !node.hasLoaded) {
            loadNodeContent(node.id);
        }
    };

    checkbox.onclick = (e) => {
        e.stopPropagation();
        toggleSelection(node.id);
    };

    if (hasChildren && node.expanded) {
        node.children.forEach(childId => {
            if (messages[childId]) {
                childrenContainer.appendChild(createNodeElement(messages[childId], messages));
            }
        });
    }

    div.setAttribute('draggable', 'true');
    div.ondragstart = (e) => {
        draggedNodeId = node.id;
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging');
    };
    div.ondragend = (e) => {
        draggedNodeId = null;
        div.classList.remove('dragging');
    };
    div.ondragover = (e) => {
        e.preventDefault();
        if (draggedNodeId && draggedNodeId !== node.id) {
            div.classList.add('drag-over');
        }
    };
    div.ondragleave = (e) => {
        div.classList.remove('drag-over');
    };
    div.ondrop = (e) => {
        e.preventDefault();
        div.classList.remove('drag-over');
        if (draggedNodeId && draggedNodeId !== node.id) {
            moveNode(draggedNodeId, node.id, 0);
        }
    };

    return div;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toggleExpand(nodeId) {
    const node = allMessages[nodeId];
    if (!node) return;

    node.expanded = !node.expanded;
    updateMessage(nodeId, node);
}

function toggleSelection(nodeId) {
    const node = allMessages[nodeId];
    if (!node) return;

    node.selected = !node.selected;
    updateMessage(nodeId, node);
}

function loadNodeContent(nodeId) {
    fetch(`/api/messages/${nodeId}`)
        .then(res => res.json())
        .then(updatedNode => {
            if (updatedNode && updatedNode.id) {
                allMessages[nodeId] = updatedNode;
                renderTree();
            }
        })
        .catch(err => {
            console.error('Failed to load node content:', err);
        });
}

function openEditor(nodeId) {
    if (!allMessages[nodeId]?.hasLoaded) {
        loadNodeContent(nodeId);

        const node = allMessages[nodeId];
        if (!node) return;

        currentEditingNodeId = nodeId;

        document.getElementById('nodeType').value = node.type;
        document.getElementById('nodeContent').value = node.content;
        document.getElementById('nodeTags').value = node.tags ? node.tags.join(', ') : '';

        document.getElementById('editorPanel').style.display = 'flex';
        return;
    }

    const node = allMessages[nodeId];
    if (!node) return;

    currentEditingNodeId = nodeId;

    document.getElementById('nodeType').value = node.type;
    document.getElementById('nodeContent').value = node.content;
    document.getElementById('nodeTags').value = node.tags ? node.tags.join(', ') : '';

    document.getElementById('editorPanel').style.display = 'flex';
}

function closeEditor() {
    document.getElementById('editorPanel').style.display = 'none';
    currentEditingNodeId = null;
}

function saveNode() {
    if (!currentEditingNodeId) return;

    const node = allMessages[currentEditingNodeId];
    if (!node) return;

    node.type = document.getElementById('nodeType').value;
    node.content = document.getElementById('nodeContent').value;
    node.tags = document.getElementById('nodeTags').value
        .split(',')
        .map(t => t.trim())
        .filter(t => t);

    updateMessage(currentEditingNodeId, node);
    showNotification('Message saved successfully');
}

function deleteNode() {
    if (!currentEditingNodeId) return;

    if (!confirm('Delete this message?')) return;

    fetch(`/api/messages/${currentEditingNodeId}`, {
        method: 'DELETE'
    })
    .then(() => {
        closeEditor();
        showNotification('Message deleted successfully');
    })
    .catch(err => {
        console.error('Failed to delete message:', err);
        showNotification('Failed to delete message');
    });
}

function showNewFolderModal() {
    document.getElementById('folderName').value = '';
    document.getElementById('newFolderModal').classList.add('active');
}

function setupColorPicker() {
    const options = document.querySelectorAll('#folderColorPicker .color-option');
    options.forEach(option => {
        option.onclick = () => {
            options.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedFolderColor = option.dataset.color;
        };
    });
}

function createFolder() {
    const name = document.getElementById('folderName').value.trim();
    if (!name) {
        alert('Please enter a folder name');
        return;
    }

    fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            color: selectedFolderColor
        })
    })
    .then(res => res.json())
    .then(folder => {
        hideModal('newFolderModal');
        showNotification('Folder created successfully');
    })
    .catch(err => {
        console.error('Failed to create folder:', err);
        showNotification('Failed to create folder');
    });
}

function deleteFolder(id) {
    fetch(`/api/folders/${id}`, {
        method: 'DELETE'
    })
    .then(() => {
        if (currentFolderId === id) {
            currentFolderId = 'all';
            renderTree();
        }
        showNotification('Folder deleted successfully');
    })
    .catch(err => {
        console.error('Failed to delete folder:', err);
        showNotification('Failed to delete folder');
    });
}

function showNewMessageModal(type) {
    const select = document.getElementById('parentMessageSelect');
    select.innerHTML = '<option value="">None (root message)</option>';

    const messages = getMessagesToDisplay();
    Object.values(messages).forEach(node => {
        const option = document.createElement('option');
        option.value = node.id;
        option.textContent = `[${node.type}] ${node.content.substring(0, 50)}...`;
        select.appendChild(option);
    });

    document.getElementById('newMessageContent').value = '';
    document.getElementById('newMessageTags').value = '';
    document.getElementById('newMessageModal').dataset.type = type;
    document.getElementById('newMessageModal').classList.add('active');
}

function createMessage() {
    const parentId = document.getElementById('parentMessageSelect').value;
    const content = document.getElementById('newMessageContent').value.trim();
    const type = document.getElementById('newMessageModal').dataset.type;

    if (!content) {
        alert('Please enter content');
        return;
    }

    const tags = document.getElementById('newMessageTags').value
        .split(',')
        .map(t => t.trim())
        .filter(t => t);

    fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type,
            content,
            parentId: parentId || null,
            tags,
            children: []
        })
    })
    .then(res => res.json())
    .then(() => {
        hideModal('newMessageModal');
        showNotification('Message created successfully');
    })
    .catch(err => {
        console.error('Failed to create message:', err);
        showNotification('Failed to create message');
    });
}

function updateMessage(nodeId, node) {
    fetch(`/api/messages/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node)
    })
    .catch(err => {
        console.error('Failed to update message:', err);
        showNotification('Failed to save message');
    });
}

function copySelected() {
    let combined = '';
    const messages = getMessagesToDisplay();
    Object.values(messages).filter(n => n.selected).forEach(node => {
        combined += `[${node.type.toUpperCase()}] ${node.content}\n\n`;
    });

    if (!combined) {
        alert('No messages selected. Click checkboxes next to messages to select them.');
        return;
    }

    navigator.clipboard.writeText(combined).then(() => {
        showNotification('Selected messages copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

function expandAll() {
    Object.values(allMessages).forEach(node => {
        node.expanded = true;
        updateMessage(node.id, node);
    });
}

function collapseAll() {
    Object.values(allMessages).forEach(node => {
        node.expanded = false;
        updateMessage(node.id, node);
    });
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function exportData() {
    const dataStr = JSON.stringify(folders, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-explorer-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Data exported successfully');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);

            fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(importedData)
            })
            .then(res => res.json())
            .then(data => {
                showNotification(`Successfully imported ${data.count} folders`);
                event.target.value = '';
            })
            .catch(err => {
                console.error('Import error:', err);
                showNotification('Failed to import data');
            });
        } catch (err) {
            console.error('Parse error:', err);
            showNotification('Failed to parse import file');
        }
    };
    reader.readAsText(file);
}

function setupDragAndDrop() {
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    const treeContainer = document.getElementById('treeContainer');
    let dropTargetElement = null;

    treeContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedNodeId) {
            const element = e.target.closest('.tree-node');
            if (element && dropTargetElement !== element) {
                if (dropTargetElement) {
                    dropTargetElement.classList.remove('drop-target');
                }
                dropTargetElement = element;
                dropTargetElement.classList.add('drop-target');
            }
        }
    });

    treeContainer.addEventListener('dragleave', (e) => {
        const element = e.target.closest('.tree-node');
        if (element && element === dropTargetElement && !treeContainer.contains(e.relatedTarget)) {
            element.classList.remove('drop-target');
            dropTargetElement = null;
        }
    });

    treeContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dropTargetElement) {
            dropTargetElement.classList.remove('drop-target');
        }
        if (draggedNodeId && dropTargetElement) {
            const targetNodeId = dropTargetElement.id.replace('node-', '');
            moveNode(draggedNodeId, targetNodeId, null);
        }
    });

    document.addEventListener('dragend', (e) => {
        draggedNodeId = null;
        document.querySelectorAll('.drop-target').forEach(el => {
            el.classList.remove('drop-target');
        });
    });
}

function moveNode(nodeId, newParentId, newIndex) {
    fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            folderId: currentFolderId,
            nodeId: nodeId,
            newParentId: newParentId || '',
            newIndex: newIndex || 0
        })
    })
    .then(() => {
        showNotification('Message moved successfully');
    })
    .catch(err => {
        console.error('Failed to move node:', err);
        showNotification('Failed to move message');
    });
}

function reloadData() {
    location.reload();
}

function handleProgress(data) {
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingText = document.getElementById('loadingText');
    const loadingSubtext = document.getElementById('loadingSubtext');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');

    if (data.status === 'loading') {
        loadingText.textContent = data.message;
        loadingSubtext.textContent = 'Please wait...';
        progressBar.style.display = 'block';
        if (data.progress !== undefined) {
            progressFill.style.width = data.progress + '%';
        }
    } else if (data.status === 'complete') {
        loadingText.textContent = '✓ Complete';
        loadingSubtext.textContent = data.message;
        progressBar.style.display = 'none';
        setTimeout(() => {
            hideLoadingScreen();
        }, 1000);
    } else if (data.status === 'error') {
        loadingText.textContent = '✗ Error';
        loadingSubtext.textContent = data.message;
        progressBar.style.display = 'none';
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const mainContainer = document.getElementById('mainContainer');

    loadingScreen.classList.add('hidden');
    mainContainer.style.display = 'flex';
}

window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        closeEditor();
    }

    if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showNewMessageModal('prompt');
    }

    if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (currentEditingNodeId) {
            saveNode();
        }
    }

    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        exportData();
    }

    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('searchBox').focus();
    }
});

document.addEventListener('DOMContentLoaded', init);
