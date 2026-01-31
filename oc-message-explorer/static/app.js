let ws;
let folders = {};
let allMessages = {};
let currentFolderId = 'all';
let currentEditingNodeId = null;
let selectedFolderColor = '#58a6ff';
let draggedNodeId = null;
let searchQuery = '';
let searchTimeout = null;
let searchResults = {};
let userOnlyFilter = false;
let dateRangeFilter = { start: null, end: null };

function init() {
    connectWebSocket();
    setupColorPicker();
    setupDragAndDrop();
    setupDateFilter();
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
            updateGraph();
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
            <div class="folder-name">All Messages</div>
        </li>
    `;

    Object.entries(folders).forEach(([id, folder]) => {
        const li = document.createElement('li');
        li.className = `folder-item ${currentFolderId === id ? 'active' : ''}`;
        li.dataset.folder = id;
        li.innerHTML = `
            <span class="folder-color" style="background: ${folder.color}"></span>
            <div class="folder-name">${escapeHtml(folder.name)}</div>
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
    updateGraph();
}

function toggleUserFilter() {
    userOnlyFilter = document.getElementById('userOnlyFilter').checked;
    const toggle = document.getElementById('filterToggle');
    toggle.classList.toggle('active', userOnlyFilter);
    renderTree();
    updateGraph();
}

function setupDateFilter() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    startDateInput.addEventListener('change', (e) => {
        dateRangeFilter.start = e.target.value ? new Date(e.target.value) : null;
        renderTree();
        updateGraph();
    });

    endDateInput.addEventListener('change', (e) => {
        dateRangeFilter.end = e.target.value ? new Date(e.target.value) : null;
        renderTree();
        updateGraph();
    });
}

function getMessagesToDisplay() {
    let messages;
    if (currentFolderId === 'all') {
        messages = allMessages;
    } else {
        messages = folders[currentFolderId]?.nodes || {};
    }

    let filtered = {};

    for (const id in messages) {
        const node = messages[id];
        let include = true;

        if (userOnlyFilter && node.type !== 'prompt') {
            include = false;
        }

        if (include && dateRangeFilter.start && node.timestamp) {
            const nodeDate = new Date(node.timestamp);
            if (nodeDate < dateRangeFilter.start) {
                include = false;
            }
        }

        if (include && dateRangeFilter.end && node.timestamp) {
            const nodeDate = new Date(node.timestamp);
            if (nodeDate > dateRangeFilter.end) {
                include = false;
            }
        }

        if (include) {
            filtered[id] = node;
        }
    }

    return filtered;
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
        messages = applyDateAndUserFilter(searchResults);
    } else {
        messages = getMessagesToDisplay();
    }

    if (Object.keys(messages).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>${searchQuery ? 'No messages match your search' : 'No messages yet'}</h3>
                <p>${searchQuery ? 'Try a different search term' : 'Reload to load your OpenChat history'}</p>
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

function applyDateAndUserFilter(messages) {
    let filtered = {};

    for (const id in messages) {
        const node = messages[id];
        let include = true;

        if (userOnlyFilter && node.type !== 'prompt') {
            include = false;
        }

        if (include && dateRangeFilter.start && node.timestamp) {
            const nodeDate = new Date(node.timestamp);
            if (nodeDate < dateRangeFilter.start) {
                include = false;
            }
        }

        if (include && dateRangeFilter.end && node.timestamp) {
            const nodeDate = new Date(node.timestamp);
            if (nodeDate > dateRangeFilter.end) {
                include = false;
            }
        }

        if (include) {
            filtered[id] = node;
        }
    }

    return filtered;
}

function createNodeElement(node, messages, isRoot = false) {
    const div = document.createElement('div');
    div.className = `tree-node ${isRoot ? 'tree-root' : ''}`;
    div.id = `node-${node.id}`;

    const hasChildren = node.children && node.children.length > 0;
    const expandIcon = hasChildren ? (node.expanded ? '▼' : '▶') : '•';

    const timestamp = formatTimestamp(node.timestamp);

    const displayContent = node.hasLoaded ? node.content : `${node.content.substring(0, 100)}${node.content.length > 100 ? '...' : ''}`;

    const folderInfo = getFolderInfo(node.id);

    div.innerHTML = `
        <div class="node-content ${node.type}-node ${node.selected ? 'selected' : ''}" data-node-id="${node.id}">
            <span class="expand-icon">${expandIcon}</span>
            <input type="checkbox" class="node-checkbox" ${node.selected ? 'checked' : ''}>
            <span class="node-type ${node.type}">${node.type}</span>
            <div class="node-content-wrapper">
                <div class="node-header">
                    <span class="node-text">${escapeHtml(displayContent)}</span>
                </div>
                <div class="node-meta">
                    ${folderInfo ? `<div class="node-folder"><span class="folder-color" style="background: ${folderInfo.color}"></span>${escapeHtml(folderInfo.name)}</div>` : ''}
                    <span class="node-timestamp">${timestamp}</span>
                </div>
            </div>
        </div>
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
        updateGraph();
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

function getFolderInfo(nodeId) {
    for (const folderId in folders) {
        if (folders[folderId].nodes[nodeId]) {
            return {
                name: folders[folderId].name,
                color: folders[folderId].color
            };
        }
    }
    return null;
}

function updateGraph() {
    const canvas = document.getElementById('activityGraph');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const messages = getMessagesToDisplay();

    const messagesByDate = {};

    for (const id in messages) {
        const node = messages[id];
        if (node.timestamp) {
            const date = new Date(node.timestamp).toDateString();
            if (!messagesByDate[date]) {
                messagesByDate[date] = 0;
            }
            messagesByDate[date]++;
        }
    }

    const dates = Object.keys(messagesByDate).sort((a, b) => new Date(a) - new Date(b));

    if (dates.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#6e7681';
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data to display', canvas.width / 2, canvas.height / 2);
        return;
    }

    const padding = 40;
    const graphWidth = canvas.width - (padding * 2);
    const graphHeight = canvas.height - (padding * 2);

    const maxCount = Math.max(...Object.values(messagesByDate));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    const barWidth = Math.max(2, (graphWidth / dates.length) - 2);

    dates.forEach((date, index) => {
        const count = messagesByDate[date];
        const barHeight = (count / maxCount) * graphHeight;
        const x = padding + (index * (graphWidth / dates.length)) + 1;
        const y = canvas.height - padding - barHeight;

        ctx.fillStyle = '#58a6ff';
        ctx.fillRect(x, y, barWidth, barHeight);

        if (dates.length <= 7 || index % Math.ceil(dates.length / 7) === 0) {
            ctx.fillStyle = '#8b949e';
            ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.save();
            ctx.translate(x + barWidth / 2, canvas.height - padding + 15);
            ctx.rotate(-Math.PI / 6);
            ctx.fillText(new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 0, 0);
            ctx.restore();
        }
    });
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

function updateMessage(nodeId, updatedNode) {
    for (const folderId in folders) {
        if (folders[folderId].nodes[nodeId]) {
            folders[folderId].nodes[nodeId] = updatedNode;
            break;
        }
    }
    allMessages[nodeId] = updatedNode;
    renderTree();
}

function openEditor(nodeId) {
    const node = allMessages[nodeId];
    if (!node) return;

    currentEditingNodeId = nodeId;
    document.getElementById('nodeType').value = node.type;
    document.getElementById('nodeContent').value = node.content || '';
    document.getElementById('nodeTags').value = (node.tags || []).join(', ');
    document.getElementById('editorPanel').style.display = 'flex';
}

function closeEditor() {
    currentEditingNodeId = null;
    document.getElementById('editorPanel').style.display = 'none';
}

function saveNode() {
    if (!currentEditingNodeId) return;

    const node = allMessages[currentEditingNodeId];
    if (!node) return;

    const updatedNode = {
        ...node,
        type: document.getElementById('nodeType').value,
        content: document.getElementById('nodeContent').value,
        tags: document.getElementById('nodeTags').value.split(',').map(t => t.trim()).filter(t => t)
    };

    fetch(`/api/messages/${currentEditingNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedNode)
    })
    .then(res => res.json())
    .then(() => {
        showNotification('Message saved');
        closeEditor();
    })
    .catch(err => {
        console.error('Failed to save node:', err);
        showNotification('Failed to save message');
    });
}

function deleteNode() {
    if (!currentEditingNodeId) return;

    if (!confirm('Delete this message?')) return;

    fetch(`/api/messages/${currentEditingNodeId}`, {
        method: 'DELETE'
    })
    .then(() => {
        showNotification('Message deleted');
        closeEditor();
    })
    .catch(err => {
        console.error('Failed to delete node:', err);
        showNotification('Failed to delete message');
    });
}

function expandAll() {
    Object.values(allMessages).forEach(node => {
        node.expanded = true;
    });
    renderTree();
}

function collapseAll() {
    Object.values(allMessages).forEach(node => {
        node.expanded = false;
    });
    renderTree();
}

function showNewFolderModal() {
    document.getElementById('newFolderModal').classList.add('active');
}

function showNewMessageModal(type) {
    document.getElementById('newMessageModal').classList.add('active');
    const typeSelect = document.getElementById('newMessageType');
    if (typeSelect) {
        typeSelect.value = type;
    }

    const parentSelect = document.getElementById('parentMessageSelect');
    parentSelect.innerHTML = '<option value="">None (root message)</option>';
    Object.values(allMessages).forEach(msg => {
        const option = document.createElement('option');
        option.value = msg.id;
        option.textContent = `${msg.type}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`;
        parentSelect.appendChild(option);
    });
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function createFolder() {
    const name = document.getElementById('folderName').value.trim();
    const color = selectedFolderColor;

    if (!name) {
        showNotification('Please enter a folder name');
        return;
    }

    fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            color,
            nodes: {}
        })
    })
    .then(res => res.json())
    .then(() => {
        showNotification('Folder created');
        hideModal('newFolderModal');
        document.getElementById('folderName').value = '';
    })
    .catch(err => {
        console.error('Failed to create folder:', err);
        showNotification('Failed to create folder');
    });
}

function deleteFolder(folderId) {
    fetch(`/api/folders/${folderId}`, {
        method: 'DELETE'
    })
    .then(() => {
        showNotification('Folder deleted');
    })
    .catch(err => {
        console.error('Failed to delete folder:', err);
        showNotification('Failed to delete folder');
    });
}

function createMessage() {
    const type = document.getElementById('newMessageType')?.value || 'prompt';
    const content = document.getElementById('newMessageContent').value.trim();
    const tags = document.getElementById('newMessageTags').value.split(',').map(t => t.trim()).filter(t => t);
    const parentId = document.getElementById('parentMessageSelect').value;

    if (!content) {
        showNotification('Please enter message content');
        return;
    }

    fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type,
            content,
            tags,
            parentId
        })
    })
    .then(res => res.json())
    .then(() => {
        showNotification('Message created');
        hideModal('newMessageModal');
        document.getElementById('newMessageContent').value = '';
        document.getElementById('newMessageTags').value = '';
    })
    .catch(err => {
        console.error('Failed to create message:', err);
        showNotification('Failed to create message');
    });
}

function copySelected() {
    const messages = getMessagesToDisplay();
    const selectedIds = Object.values(messages).filter(m => m.selected).map(m => m.id);

    if (selectedIds.length === 0) {
        showNotification('No messages selected');
        return;
    }

    const combined = selectedIds.map(id => messages[id].content).join('\n\n');

    navigator.clipboard.writeText(combined).then(() => {
        showNotification(`Copied ${selectedIds.length} message(s)`);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy messages');
    });
}

function moveNode(nodeId, newParentId, newIndex) {
    fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nodeId,
            folderId: currentFolderId,
            newParentId,
            newIndex
        })
    })
    .then(() => {
        showNotification('Message moved');
    })
    .catch(err => {
        console.error('Failed to move node:', err);
        showNotification('Failed to move message');
    });
}

function exportData() {
    window.location.href = '/api/export';
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(() => {
                showNotification('Data imported');
                event.target.value = '';
            })
            .catch(err => {
                console.error('Failed to import:', err);
                showNotification('Failed to import data');
            });
        } catch (err) {
            console.error('Failed to parse JSON:', err);
            showNotification('Failed to parse file');
        }
    };

    reader.readAsText(file);
}

function reloadData() {
    location.reload();
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function handleProgress(data) {
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const loadingText = document.getElementById('loadingText');
    const loadingSubtext = document.getElementById('loadingSubtext');

    if (data.status === 'loading') {
        progressBar.style.display = 'block';
        loadingSubtext.textContent = data.message;
        if (data.progress !== undefined) {
            progressFill.style.width = `${data.progress}%`;
        }
    } else if (data.status === 'complete') {
        progressBar.style.display = 'none';
        loadingText.textContent = 'Complete';
        loadingSubtext.textContent = data.message;
    } else if (data.status === 'error') {
        progressBar.style.display = 'none';
        loadingText.textContent = 'Error';
        loadingSubtext.textContent = data.message;
    }
}

function hideLoadingScreen() {
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('mainContainer').style.display = 'flex';
        updateGraph();
    }, 500);
}

function setupColorPicker() {
    const picker = document.getElementById('folderColorPicker');
    if (!picker) return;

    picker.addEventListener('click', (e) => {
        if (e.target.classList.contains('color-option')) {
            picker.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedFolderColor = e.target.dataset.color;
        }
    });
}

function setupDragAndDrop() {
    const treeContainer = document.getElementById('treeContainer');

    treeContainer.ondragover = (e) => {
        e.preventDefault();
    };

    treeContainer.ondrop = (e) => {
        e.preventDefault();
        if (draggedNodeId) {
            fetch('/api/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeId: draggedNodeId,
                    folderId: currentFolderId,
                    newParentId: '',
                    newIndex: -1
                })
            })
            .then(() => {
                showNotification('Message moved');
            })
            .catch(err => {
                console.error('Failed to move node:', err);
                showNotification('Failed to move message');
            });
        }
    };
}

document.addEventListener('DOMContentLoaded', init);
