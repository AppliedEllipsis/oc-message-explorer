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
let combineOrder = [];
let combineDraggedIndex = null;
let selectedTags = [];
let sortAscending = false;
let searchModeRaw = false;
let displayModeRaw = true;
let hideEmptyResponses = true;
let viewportObserver = null;
let loadingViewportNodes = new Set();


function init() {
    connectWebSocket();
    setupColorPicker();
    setupDragAndDrop();
    setupDateFilter();
    setupCombineDragAndDrop();
    loadSettings();
    loadTodos();
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
            updateTagCloud();
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
    updateTagCloud();
}

function updateTagCloud() {
    const container = document.getElementById('tagCloud');
    const tagCounts = {};

    for (const id in allMessages) {
        const node = allMessages[id];
        if (node.tags) {
            node.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }

        if (node.type) {
            tagCounts[node.type] = (tagCounts[node.type] || 0) + 1;
        }
    }

    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    let html = `<div class="tag-cloud-item ${selectedTags.length === 0 ? 'active' : ''}" onclick="clearTagFilter()">Clear All</div>`;

    sortedTags.forEach(([tag, count]) => {
        const isActive = selectedTags.includes(tag);
        html += `
            <div class="tag-cloud-item ${isActive ? 'active' : ''}" onclick="toggleTagFilter('${escapeHtml(tag)}')">
                ${escapeHtml(tag)}
                <span class="tag-count">${count}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

function toggleTagFilter(tag) {
    const index = selectedTags.indexOf(tag);
    if (index === -1) {
        selectedTags.push(tag);
    } else {
        selectedTags.splice(index, 1);
    }
    updateTagCloud();
    renderTree();
}

function clearTagFilter() {
    selectedTags = [];
    updateTagCloud();
    renderTree();
}

function toggleUserFilter() {
    userOnlyFilter = document.getElementById('userOnlyFilter').checked;
    const toggle = document.getElementById('filterToggle');
    toggle.classList.toggle('active', userOnlyFilter);
    renderTree();
    updateGraph();
}

function toggleHideEmptyResponses() {
    hideEmptyResponses = document.getElementById('hideEmptyResponses').checked;
    const toggle = document.getElementById('emptyToggle');
    toggle.classList.toggle('active', hideEmptyResponses);
    renderTree();
    updateGraph();
}

function toggleSortOrder() {
    sortAscending = document.getElementById('sortAscending').checked;
    renderTree();
}

function toggleSearchMode() {
    searchModeRaw = document.getElementById('searchRawOnly').checked;
    const toggle = document.getElementById('searchToggle');
    toggle.classList.toggle('active', searchModeRaw);
    filterMessages();
}

function toggleDisplayMode() {
    displayModeRaw = document.getElementById('displayRawMessages').checked;
    const toggle = document.getElementById('displayToggle');
    toggle.classList.toggle('active', displayModeRaw);
    renderTree();
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

        if (userOnlyFilter && node.type !== 'user' && node.type !== 'auto' && node.type !== 'prompt') {
            include = false;
        }

        if (include && hideEmptyResponses && node.type === 'response') {
            const isEmpty = !node.content || node.content.trim() === '' || node.content.length === 0;
            if (isEmpty) {
                include = false;
            }
        }

        if (include && selectedTags.length > 0) {
            const hasTag = node.tags && node.tags.some(t => selectedTags.includes(t));
            const hasType = selectedTags.includes(node.type);
            if (!hasTag && !hasType) {
                include = false;
            }
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
            body: JSON.stringify({ query, searchRaw: searchModeRaw })
        })
        .then(res => res.json())
        .then(results => {
            searchResults = results || {};
            expandSearchResults(results);
            renderTree();
        })
        .catch(err => {
            console.error('Search error:', err);
            renderTree();
        });
    }, 300);
}

function expandSearchResults(results) {
    if (!results || Object.keys(results).length === 0) return;

    const resultIds = new Set(Object.keys(results));
    const nodeIdsToExpand = new Set();

    function findParentIds(nodeId) {
        const node = allMessages[nodeId];
        if (!node || !node.parentId || resultIds.has(node.parentId)) return;

        nodeIdsToExpand.add(node.parentId);
        findParentIds(node.parentId);
    }

    for (const id in results) {
        const node = allMessages[id];
        if (node && node.parentId) {
            findParentIds(id);
        }
    }

    nodeIdsToExpand.forEach(nodeId => {
        if (allMessages[nodeId]) {
            allMessages[nodeId].expanded = true;
            fetch(`/api/messages/${nodeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allMessages[nodeId])
            }).catch(err => console.error('Failed to save expanded state:', err));
        }
    });
}

function renderTree() {
    const container = document.getElementById('treeContainer');
    let messages;

    if (searchQuery && searchQuery.length >= 2) {
        if (Object.keys(searchResults).length > 0) {
            messages = applyFilters(searchResults);
        } else {
            messages = {};
        }
    } else {
        messages = getMessagesToDisplay();
    }

    if (Object.keys(messages).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>${searchQuery || selectedTags.length > 0 ? 'No messages match your filters' : 'No messages yet'}</h3>
                <p>${searchQuery ? 'Try a different search term' : 'Reload to load your OpenChat history'}</p>
            </div>
        `;
        return;
    }

    let rootNodes = Object.values(messages).filter(n => !n.parentId);

    rootNodes.sort((a, b) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return sortAscending ? dateA - dateB : dateB - dateA;
    });

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

    observeVisibleNodes();
}

function applyFilters(messages) {
    let filtered = {};

    for (const id in messages) {
        const node = messages[id];
        let include = true;

        if (userOnlyFilter && node.type !== 'user' && node.type !== 'auto' && node.type !== 'prompt') {
            include = false;
        }

        if (include && hideEmptyResponses && node.type === 'response') {
            const isEmpty = !node.content || node.content.trim() === '' || node.content.length === 0;
            if (isEmpty) {
                include = false;
            }
        }

        if (include && selectedTags.length > 0) {
            const hasTag = node.tags && node.tags.some(t => selectedTags.includes(t));
            const hasType = selectedTags.includes(node.type);
            if (!hasTag && !hasType) {
                include = false;
            }
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
    const hasVisibleChildren = hasChildren && node.children.some(childId => messages[childId]);
    const expandIcon = hasVisibleChildren ? (node.expanded ? '▼' : '▶') : '•';

    const timestamp = formatTimestamp(node.timestamp);

    let displayContent;
    if (displayModeRaw) {
        displayContent = node.content && node.content.trim() !== '' ? node.content : (node.summary || '(No content)');
        displayContent = truncateContent(displayContent, node.summary);
    } else {
        displayContent = node.summary ? node.summary : (node.content ? node.content : '(No content)');
    }

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
                    ${hasChildren ? `<span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">${node.children.length} child(ren)</span>` : ''}
                </div>
            </div>
        </div>
        <div class="children-container" style="display: ${hasVisibleChildren && node.expanded ? 'block' : 'none'};"></div>
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
        renderTree();
    };

    checkbox.onclick = (e) => {
        e.stopPropagation();
        toggleSelection(node.id);
        updateGraph();
    };

    if (hasVisibleChildren && node.expanded) {
        node.children.forEach(childId => {
            if (messages[childId]) {
                childrenContainer.appendChild(createNodeElement(messages[childId], messages));
            } else {
                console.warn(`Child node ${childId} not found in messages`);
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

function truncateContent(content, summary) {
    if (!content) return content;

    const lines = content.split('\n');
    const isLong = lines.length > 9;

    let truncatedContent = content;
    if (isLong) {
        const firstLines = lines.slice(0, 3);
        const lastLines = lines.slice(-3);
        truncatedContent = firstLines.join('\n') + '\n... (click to view full message) ...\n' + lastLines.join('\n');
    }

    if (summary && isLong) {
        return `${summary}\n\n${truncatedContent}`;
    }

    return truncatedContent;
}

function setupViewportObserver() {
    if (viewportObserver) {
        viewportObserver.disconnect();
    }

    const options = {
        root: document.getElementById('treeContainer'),
        rootMargin: '300px 0px 300px 0px',
        threshold: 0.01
    };

    viewportObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const nodeId = entry.target.dataset.nodeId;
            if (entry.isIntersecting && !loadingViewportNodes.has(nodeId)) {
                loadNodeContentForViewport(nodeId);
            }
        });
    }, options);
}

function observeVisibleNodes() {
    if (!viewportObserver) {
        setupViewportObserver();
    }

    document.querySelectorAll('.node-content[data-node-id]').forEach(el => {
        viewportObserver.observe(el);
    });
}

function loadNodeContentForViewport(nodeId) {
    loadingViewportNodes.add(nodeId);
    loadNodeContent(nodeId).then(() => {
        loadingViewportNodes.delete(nodeId);
        const nodeEl = document.querySelector(`.node-content[data-node-id="${nodeId}"]`);
        if (nodeEl && displayModeRaw) {
            const node = allMessages[nodeId];
            if (node && node.content && node.content.trim() !== '') {
                const textEl = nodeEl.querySelector('.node-text');
                if (textEl) {
                    textEl.textContent = truncateContent(node.content, node.summary);
                }
            }
        }
    });
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
    return fetch(`/api/messages/${nodeId}`)
        .then(res => res.json())
        .then(updatedNode => {
            if (updatedNode && updatedNode.id) {
                allMessages[nodeId] = updatedNode;
            }
            return updatedNode;
        })
        .catch(err => {
            console.error('Failed to load node content:', err);
            return null;
        });
}

function loadNodeAndChildren(nodeId) {
    return loadNodeContent(nodeId);
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

    const shouldLoad = !node.hasLoaded;
    const loadPromise = shouldLoad ? loadNodeContent(node.id) : Promise.resolve(node);

    loadPromise.then(() => {
        currentEditingNodeId = nodeId;
        const updatedNode = allMessages[nodeId];
        document.getElementById('nodeType').value = updatedNode.type;
        document.getElementById('nodeContent').value = updatedNode.content || '';
        document.getElementById('nodeSummary').value = updatedNode.summary || '';
        document.getElementById('nodeTags').value = (updatedNode.tags || []).join(', ');
        document.getElementById('editorPanel').style.display = 'flex';
    });
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
        summary: document.getElementById('nodeSummary').value,
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
        if (node.children && node.children.length > 0) {
            node.expanded = true;
        }
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

function showCombineModal() {
    const messages = getMessagesToDisplay();
    const selected = Object.values(messages).filter(m => m.selected);

    if (selected.length === 0) {
        showNotification('No messages selected');
        return;
    }

    combineOrder = [...selected];
    renderCombineList();
    updateCombinedPreview();
    document.getElementById('combineModal').classList.add('active');
}

function renderCombineList() {
    const container = document.getElementById('combineList');
    container.innerHTML = '';

    combineOrder.forEach((node, index) => {
        const div = document.createElement('div');
        div.className = 'combine-item';
        div.dataset.index = index;
        div.draggable = true;
        div.innerHTML = `
            <div class="combine-item-drag">⋮⋮</div>
            <div class="combine-item-content">
                <span class="combine-item-type ${node.type}">${node.type}</span>
                <span class="combine-item-text">${escapeHtml(node.content.substring(0, 100))}${node.content.length > 100 ? '...' : ''}</span>
            </div>
            <button class="combine-item-remove" onclick="removeFromCombine(${index})">×</button>
        `;

        div.ondragstart = (e) => {
            combineDraggedIndex = index;
            div.classList.add('combine-dragging');
            e.dataTransfer.effectAllowed = 'move';
        };

        div.ondragend = (e) => {
            combineDraggedIndex = null;
            div.classList.remove('combine-dragging');
        };

        div.ondragover = (e) => {
            e.preventDefault();
            if (combineDraggedIndex !== null && combineDraggedIndex !== index) {
                div.classList.add('combine-dragover');
            }
        };

        div.ondragleave = (e) => {
            div.classList.remove('combine-dragover');
        };

        div.ondrop = (e) => {
            e.preventDefault();
            div.classList.remove('combine-dragover');
            if (combineDraggedIndex !== null && combineDraggedIndex !== index) {
                const item = combineOrder.splice(combineDraggedIndex, 1)[0];
                combineOrder.splice(index, 0, item);
                renderCombineList();
                updateCombinedPreview();
            }
        };

        container.appendChild(div);
    });
}

function removeFromCombine(index) {
    combineOrder.splice(index, 1);
    renderCombineList();
    updateCombinedPreview();
}

function updateCombinedPreview() {
    const preview = document.getElementById('combinedPreview');
    const combined = combineOrder.map(node => node.content).join('\n\n---\n\n');

    if (window.marked) {
        preview.innerHTML = window.marked.parse(combined);
    } else {
        preview.textContent = combined;
    }
}

function copyCombined() {
    const combined = combineOrder.map(node => node.content).join('\n\n---\n\n');

    navigator.clipboard.writeText(combined).then(() => {
        showNotification('Combined text copied');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy combined text');
    });
}

function optimizeCombinedPrompts() {
    const combined = combineOrder.map(node => node.content).join('\n\n---\n\n');
    
    document.getElementById('optimizerPreview').textContent = combined;
    
    if (window.marked) {
        document.getElementById('optimizerPreview').innerHTML = window.marked.parse(combined);
    }
    
    document.getElementById('optimizeModal').classList.add('active');
}

function optimizePrompts() {
    const apiKey = configManager.config.openAIAPIKey || localStorage.getItem('openaiApiKey');
    const baseUrl = configManager.config.openaiBaseUrl || 'https://api.openai.com/v1';
    const model = document.getElementById('openaiModel').value || configManager.config.openaiModel;
    const optimizationPrompt = document.getElementById('optimizationPrompt').value;
    const combinedText = document.getElementById('optimizerPreview').textContent;

    if (!apiKey) {
        showNotification('Please set OpenAI API key in settings');
        return;
    }

    if (!model) {
        showNotification('Please select a model');
        return;
    }

    const resultDiv = document.getElementById('optimizerResult');
    resultDiv.innerHTML = '<div style="text-align: center; padding: 40px;">Loading AGENTS.md and optimizing...</div>';

    const apiUrl = baseUrl.endsWith('/') ? baseUrl + 'chat/completions' : baseUrl + '/chat/completions';

    // First fetch agents.md content
    fetch('/api/agents-content')
        .then(res => res.json())
        .then(data => {
            const fullSystemPrompt = `${optimizationPrompt}\n\n=== AGENTS.md Content ===\n\n${data.content}`;

            return fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: fullSystemPrompt },
                        { role: 'user', content: `Combine and optimize these prompts according to the system instructions:\n\n${combinedText}` }
                    ],
                    temperature: 0.7
                })
            });
        })
        .then(res => res.json())
        .then(data => {
            if (data.choices && data.choices[0]) {
                const optimized = data.choices[0].message.content;

                if (window.marked) {
                    resultDiv.innerHTML = window.marked.parse(optimized);
                } else {
                    resultDiv.textContent = optimized;
                }

                document.getElementById('copyOptimizedBtn').style.display = 'inline-block';
                showNotification('Optimization complete');
            } else {
                throw new Error('No response from API');
            }
        })
        .catch(err => {
            console.error('Optimization error:', err);
            resultDiv.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 40px;">Error: ${escapeHtml(err.message)}</div>`;
            showNotification('Optimization failed');
        });
}

function copyOptimizedResult() {
    const result = document.getElementById('optimizerResult').textContent;
    navigator.clipboard.writeText(result).then(() => {
        showNotification('Optimized result copied');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy');
    });
}

function setupCombineDragAndDrop() {
    const container = document.getElementById('combineList');

    container.ondragover = (e) => {
        e.preventDefault();
    };
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

function showSettingsModal() {
    loadSettings().then(() => {
        document.getElementById('settingsModal').classList.add('active');
    });
}

function saveSettings() {
    const apiKey = document.getElementById('openaiApiKey').value.trim();
    const baseUrl = document.getElementById('openaiBaseUrl').value.trim();
    const model = document.getElementById('openaiModel').value;
    const optimizationPrompt = document.getElementById('optimizationPrompt').value.trim();
    const projectPath = document.getElementById('projectPath').value.trim();
    const agentsPath = document.getElementById('agentsPath').value.trim();

    const updates = {};

    if (apiKey !== configManager.config.openAIAPIKey) updates.openAIAPIKey = apiKey;
    if (baseUrl !== configManager.config.openaiBaseUrl) updates.openaiBaseUrl = baseUrl;
    if (model !== configManager.config.openaiModel) updates.openaiModel = model;
    if (optimizationPrompt !== configManager.config.optimizationPrompt) updates.optimizationPrompt = optimizationPrompt;
    if (projectPath !== configManager.config.projectPath) updates.projectPath = projectPath;
    if (agentsPath !== configManager.config.agentsPath) updates.agentsPath = agentsPath;

    fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    .then(res => res.json())
    .then(config => {
        configManager.config = config;
        showNotification('Settings saved to .env');
        hideModal('settingsModal');
    })
    .catch(err => {
        console.error('Failed to save settings:', err);
        showNotification('Failed to save settings');
    });
}

function loadSettings() {
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            configManager.config = config;

            document.getElementById('openaiApiKey').value = config.openAIAPIKey || '';
            document.getElementById('openaiBaseUrl').value = config.openaiBaseUrl || '';
            document.getElementById('openaiModel').value = config.openaiModel || '';
            document.getElementById('optimizationPrompt').value = config.optimizationPrompt ||
                `First, read and understand the AGENTS.md file which contains project-specific guidelines, coding conventions, and development practices.

Then, combine these prompts into a single, task-oriented prompt that will direct you to:

1. Verify the existence of the components described in the prompts within the project codebase
2. If any component does not exist, recreate it following the guidelines from AGENTS.md
3. Ensure all code follows the project's coding conventions and best practices
4. Maintain consistency with the existing project structure and patterns

Base your implementation decisions on the guidance in AGENTS.md, prioritizing:
- Code quality and maintainability
- Adherence to project conventions
- Proper documentation and commenting
- Type safety and error handling`;
            document.getElementById('projectPath').value = config.projectPath || '';
            document.getElementById('agentsPath').value = config.agentsPath || '';

            if (config.openAIAPIKey) {
                document.getElementById('modelSelectGroup').style.display = 'block';
                fetchModels(false);
            }
        })
        .catch(err => {
            console.error('Failed to load settings:', err);
        });
}

function testApiKey() {
    const apiKey = document.getElementById('openaiApiKey').value.trim();
    const baseUrl = document.getElementById('openaiBaseUrl').value.trim() || 'https://api.openai.com/v1';

    if (!apiKey) {
        showNotification('Please enter API key');
        return;
    }

    const apiUrl = baseUrl.endsWith('/') ? baseUrl + 'models' : baseUrl + '/models';

    fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${apiKey}`
        }
    })
    .then(res => {
        if (res.ok) {
            showNotification('API key is valid');
            return res.json();
        } else {
            if (res.status === 401) {
                throw new Error('Invalid API key');
            } else {
                throw new Error(`API error: ${res.status} ${res.statusText}`);
            }
        }
    })
    .then(data => {
        document.getElementById('modelSelectGroup').style.display = 'block';
        populateModels(data.data);
    })
    .catch(err => {
        console.error('API key test failed:', err);
        showNotification(err.message || 'API key test failed');
    });
}

function fetchModels(showNotificationOnSuccess = true, apiKey = null, baseUrl = null) {
    const effectiveApiKey = apiKey || localStorage.getItem('openaiApiKey') || document.getElementById('openaiApiKey')?.value;
    const effectiveBaseUrl = baseUrl || localStorage.getItem('openaiBaseUrl') || document.getElementById('openaiBaseUrl')?.value || 'https://api.openai.com/v1';

    if (!effectiveApiKey) {
        showNotification('Please enter an API key first');
        return;
    }

    const apiUrl = effectiveBaseUrl.endsWith('/') ? effectiveBaseUrl + 'models' : effectiveBaseUrl + '/models';

    fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${effectiveApiKey}`
        }
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`);
        }
        return res.json();
    })
    .then(data => {
        populateModels(data.data);
        document.getElementById('modelSelectGroup').style.display = 'block';
        if (showNotificationOnSuccess) {
            showNotification('Models loaded');
        }
    })
    .catch(err => {
        console.error('Failed to fetch models:', err);
        if (showNotificationOnSuccess) {
            showNotification(err.message || 'Failed to load models');
        }
    });
}

function populateModels(models) {
    const select = document.getElementById('openaiModel');
    const currentModel = select.value;

    const gptModels = models.filter(m => m.id.startsWith('gpt-'));
    
    select.innerHTML = '<option value="">Select a model</option>';
    
    gptModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        select.appendChild(option);
    });

    if (currentModel) {
        select.value = currentModel;
    }
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

function loadTodos() {
    fetch('/api/todos')
        .then(res => res.json())
        .then(todos => {
            configManager.todos = todos;
            renderTodos();
        })
        .catch(err => {
            console.error('Failed to load todos:', err);
        });
}

function renderTodos() {
    const container = document.getElementById('todoList');
    
    if (!configManager.todos || configManager.todos.length === 0) {
        container.innerHTML = `
            <div style="color: var(--text-muted); text-align: center; padding: 20px; font-size: 13px;">
                No todos yet
            </div>
        `;
        return;
    }

    const sorted = [...configManager.todos].sort((a, b) => {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    let html = '';
    sorted.forEach(todo => {
        html += `
            <div class="todo-item ${todo.completed ? 'completed' : ''}">
                <input type="checkbox" class="todo-checkbox" 
                    ${todo.completed ? 'checked' : ''} 
                    onchange="toggleTodo('${todo.id}')">
                <div class="todo-content">
                    <div class="todo-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</div>
                    <span class="todo-priority ${todo.priority}">${todo.priority}</span>
                </div>
                <div class="todo-actions">
                    <button class="todo-delete" onclick="deleteTodo('${todo.id}')" title="Delete">×</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function addTodo() {
    const text = document.getElementById('newTodoText').value.trim();
    
    if (!text) {
        showNotification('Please enter a todo item');
        return;
    }

    fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            priority: 'medium'
        })
    })
    .then(res => res.json())
    .then(todo => {
        configManager.todos.push(todo);
        renderTodos();
        document.getElementById('newTodoText').value = '';
        showNotification('Todo added');
    })
    .catch(err => {
        console.error('Failed to add todo:', err);
        showNotification('Failed to add todo');
    });
}

function toggleTodo(id) {
    fetch(`/api/todos/${id}`, {
        method: 'PUT'
    })
    .then(res => res.json())
    .then(data => {
        renderTodos();
        if (data.completed) {
            showNotification('Todo completed');
        }
    })
    .catch(err => {
        console.error('Failed to toggle todo:', err);
        showNotification('Failed to update todo');
    });
}

function deleteTodo(id) {
    if (!confirm('Delete this todo?')) return;

    fetch(`/api/todos/${id}`, {
        method: 'DELETE'
    })
    .then(res => {
        if (res.ok) {
            configManager.todos = configManager.todos.filter(t => t.id !== id);
            renderTodos();
            showNotification('Todo deleted');
        } else {
            showNotification('Failed to delete todo');
        }
    })
    .catch(err => {
        console.error('Failed to delete todo:', err);
        showNotification('Failed to delete todo');
    });
}

function loadAgentsContent() {
    fetch('/api/agents-content')
        .then(res => res.json())
        .then(data => {
            const preview = document.getElementById('agentsPreview');
            
            if (window.marked) {
                preview.innerHTML = window.marked.parse(data.content);
            } else {
                preview.textContent = data.content;
            }
            
            document.getElementById('agentsContentModal').classList.add('active');
        })
        .catch(err => {
            console.error('Failed to load agents content:', err);
            showNotification('Failed to load AGENTS.md');
        });
}

function copyAgentsContent() {
    const preview = document.getElementById('agentsPreview').textContent;

    navigator.clipboard.writeText(preview).then(() => {
        showNotification('AGENTS.md content copied');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy');
    });
}

function toggleOptionsPanel() {
    const panel = document.getElementById('optionsPanel');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
    } else {
        panel.style.display = 'none';
    }
}


let configManager = {
    config: {},
    todos: []
};

document.addEventListener('DOMContentLoaded', init);

