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
const DELETED_FOLDERS_MAP = {};



function init() {
    window.themeEngine.init();
    initThemeSelector();
    setupColorPicker();
    setupDragAndDrop();
    setupDateFilter();
    setupCombineDragAndDrop();
    loadSettings();
    loadTodos();
    setupModelFilter();
    setupEditorResize();
    setupAIWorkflow();
    connectWebSocket();
}

function setupModelFilter() {
    const filterInput = document.getElementById('openaiModelFilter');
    filterInput.addEventListener('input', filterModelOptions);
}

function setupAIWorkflow() {
    if (configManager && configManager.config) {
        window.aiWorkflowManager.initialize(configManager.config);
    }
}

function setupEditorResize() {
    const editorPanel = document.getElementById('editorPanel');
    if (!editorPanel) return;

    const savedWidth = localStorage.getItem('editorPanelWidth');
    if (savedWidth) {
        editorPanel.style.width = savedWidth + 'px';
    }

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'editor-resize-handle';
    editorPanel.insertBefore(resizeHandle, editorPanel.firstChild);

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = editorPanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const delta = startX - e.clientX;
        const newWidth = Math.max(300, Math.min(1200, startWidth + delta));
        editorPanel.style.width = newWidth + 'px';
        localStorage.setItem('editorPanelWidth', newWidth);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('mainContainer').style.display = 'flex';
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

    let html = `<button class="tag-cloud-item ${selectedTags.length === 0 ? 'active' : ''}" onclick="clearTagFilter()" role="menuitem" aria-label="Clear all tag filters">Clear All</button>`;

    sortedTags.forEach(([tag, count]) => {
        const isActive = selectedTags.includes(tag);
        html += `
            <button class="tag-cloud-item ${isActive ? 'active' : ''}" onclick="toggleTagFilter('${escapeHtml(tag)}')" role="menuitem" aria-label="Filter by tag: ${escapeHtml(tag)}" aria-pressed="${isActive}">
                ${escapeHtml(tag)}
                <span class="tag-count">${count}</span>
            </button>
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
        <div class="node-content ${node.type}-node ${node.selected ? 'selected' : ''}" 
             role="treeitem" 
             aria-expanded="${node.expanded}" 
             aria-selected="${node.selected}"
             aria-level="${node.parentId ? 2 : 1}"
             data-node-id="${node.id}">
            <button class="expand-icon" aria-label="${node.expanded ? 'Collapse' : 'Expand'}" aria-expanded="${node.expanded}">${expandIcon}</button>
            <span class="checkbox-wrapper">
                <input type="checkbox" class="node-checkbox" ${node.selected ? 'checked' : ''} aria-label="Select message for combination">
            </span>
            <button class="edit-area edit-btn-${node.id}" title="Edit message" aria-label="Edit message">✏️</button>
            <span class="node-type ${node.type}" role="presentation">${node.type}</span>
            <button class="lock-icon ${node.locked ? 'locked' : 'unlocked'}" title="${node.locked ? 'Click to unlock' : 'Click to lock'}" aria-pressed="${node.locked}" aria-label="${node.locked ? 'Unlock message' : 'Lock message'}">${node.locked ? '🔒' : '🔓'}</button>
            <div class="node-content-wrapper">
                <div class="node-header">
                    <span class="node-text">${escapeHtml(displayContent)}</span>
                </div>
                <div class="node-meta">
                    ${folderInfo ? `<div class="node-folder"><span class="folder-color" style="background: ${folderInfo.color}"></span>${escapeHtml(folderInfo.name)}</div>` : ''}
                    <span class="node-timestamp" aria-label="Timestamp: ${timestamp}">${timestamp}</span>
                    ${hasChildren ? `<span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;" aria-label="${node.children.length} child message${node.children.length > 1 ? 's' : ''}">${node.children.length} child(ren)</span>` : ''}
                </div>
            </div>
        </div>
        <div class="children-container" role="group" aria-label="Child messages" style="display: ${hasVisibleChildren && node.expanded ? 'block' : 'none'};"></div>
    `;


    const contentDiv = div.querySelector('.node-content');
    const expandIconEl = div.querySelector('.expand-icon');
    const checkbox = div.querySelector('.node-checkbox');
    const checkboxWrapper = div.querySelector('.checkbox-wrapper');
    const editIcon = div.querySelector('.edit-area');
    const lockIcon = div.querySelector('.lock-icon');
    const childrenContainer = div.querySelector('.children-container');
    const contentWrapper = div.querySelector('.node-content-wrapper');

    contentDiv.onclick = (e) => {
        if (e.target !== checkbox && e.target !== checkboxWrapper && e.target !== expandIconEl && e.target !== editIcon && e.target !== lockIcon) {
            const editorPanel = document.getElementById('editorPanel');
            if (editorPanel && editorPanel.style.display === 'flex') {
                openEditor(node.id);
            }
        }
    };

    editIcon.onclick = (e) => {
        e.stopPropagation();
        openEditor(node.id);
    };

    lockIcon.onclick = (e) => {
        e.stopPropagation();
        toggleLock(node.id);
    };

    expandIconEl.onclick = (e) => {
        e.stopPropagation();
        toggleExpand(node.id);
        renderTree();
    };

    checkbox.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isChecked = checkbox.checked;
        const originalSelected = node.selected;

        undoRedoManager.pushAction({
            description: isChecked ? 'Select message' : 'Deselect message',
            execute: async () => {
                node.selected = isChecked;
                checkbox.checked = isChecked;
                contentDiv.classList.toggle('selected', isChecked);
                
                for (const folderId in folders) {
                    if (folders[folderId].nodes[node.id]) {
                        folders[folderId].nodes[node.id] = node;
                        break;
                    }
                }
                allMessages[node.id] = node;
                updateGraph();
                
                await fetch(`/api/messages/${node.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(node)
                });
            },
            undo: async () => {
                node.selected = originalSelected;
                checkbox.checked = originalSelected;
                contentDiv.classList.toggle('selected', originalSelected);
                
                for (const folderId in folders) {
                    if (folders[folderId].nodes[node.id]) {
                        folders[folderId].nodes[node.id] = node;
                        break;
                    }
                }
                allMessages[node.id] = node;
                updateGraph();
                
                await fetch(`/api/messages/${node.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(node)
                });
            }
        });
        
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

    const MAX_CHARS = 300;
    const isLong = content.length > MAX_CHARS;

    let truncatedContent = content;
    if (isLong) {
        const half = Math.floor(MAX_CHARS / 2);
        const firstPart = content.slice(0, half);
        const lastPart = content.slice(-half);

        const prefix = summary && summary.trim() ? `[${summary.trim()}]\n\n` : '';
        truncatedContent = prefix + firstPart + '\n...\n' + lastPart;
    } else if (summary && summary.trim()) {
        truncatedContent = `[${summary.trim()}]\n\n${content}`;
    }

    return truncatedContent;
}

function setupViewportObserver() {
    if (viewportObserver) {
        viewportObserver.disconnect();
    }

    const options = {
        root: document.getElementById('treeContainer'),
        rootMargin: '500px 0px 500px 0px',
        threshold: 0.01
    };

    viewportObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const nodeId = entry.target.dataset.nodeId;
            const node = allMessages[nodeId];
            
            if (entry.isIntersecting) {
                if (node && !node.hasLoaded && !loadingViewportNodes.has(nodeId)) {
                    loadNodeContentForViewport(nodeId);
                }
            } else {
                if (node && node.hasLoaded && shouldUnloadNode(node)) {
                    unloadNodeContentForViewport(nodeId);
                }
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

function shouldUnloadNode(node) {
    if (!node || !node.content) return false;
    
    const contentLength = node.content.length;
    const isLargeContent = contentLength > 5000;
    
    return isLargeContent && !node.locked && !node.selected;
}

function unloadNodeContentForViewport(nodeId) {
    const node = allMessages[nodeId];
    if (!node || !node.content) return;
    
    const nodeEl = document.querySelector(`.node-content[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    
    const originalContent = node.content;
    
    if (displayModeRaw) {
        const textEl = nodeEl.querySelector('.node-text');
        if (textEl) {
            textEl.innerHTML = createSkeletonLoader();
            textEl.classList.add('loading');
        }
    }
}

function createSkeletonLoader() {
    return `
        <div class="skeleton skeleton-text long"></div>
        <div class="skeleton skeleton-text medium"></div>
        <div class="skeleton skeleton-text short"></div>
    `;
}

function loadNodeContentForViewport(nodeId) {
    const node = allMessages[nodeId];
    if (!node || node.hasLoaded) return;
    
    loadingViewportNodes.add(nodeId);
    
    const nodeEl = document.querySelector(`.node-content[data-node-id="${nodeId}"]`);
    if (nodeEl && displayModeRaw && node.content && node.content.length > 2000) {
        const textEl = nodeEl.querySelector('.node-text');
        if (textEl) {
            textEl.innerHTML = createSkeletonLoader();
            textEl.classList.add('loading');
        }
    }
    
    loadNodeContent(nodeId).then(() => {
        loadingViewportNodes.delete(nodeId);
        const nodeEl = document.querySelector(`.node-content[data-node-id="${nodeId}"]`);
        if (nodeEl && displayModeRaw) {
            const updatedNode = allMessages[nodeId];
            if (updatedNode && updatedNode.content && updatedNode.content.trim() !== '') {
                const textEl = nodeEl.querySelector('.node-text');
                if (textEl) {
                    textEl.classList.remove('loading');
                    textEl.textContent = truncateContent(updatedNode.content, updatedNode.summary);
                }
            }
        }
    }).catch(err => {
        loadingViewportNodes.delete(nodeId);
        const nodeEl = document.querySelector(`.node-content[data-node-id="${nodeId}"]`);
        if (nodeEl) {
            const textEl = nodeEl.querySelector('.node-text');
            if (textEl) {
                textEl.classList.remove('loading');
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

        document.querySelectorAll('.edit-area').forEach(btn => btn.classList.remove('active'));
        const activeEditBtn = document.querySelector(`.edit-btn-${nodeId}`);
        if (activeEditBtn) {
            activeEditBtn.classList.add('active');
        }
    });
}

function closeEditor() {
    currentEditingNodeId = null;
    document.getElementById('editorPanel').style.display = 'none';
    document.querySelectorAll('.edit-area').forEach(btn => btn.classList.remove('active'));
}

function saveNode() {
    if (!currentEditingNodeId) return;

    const node = allMessages[currentEditingNodeId];
    if (!node) return;

    const originalNode = { ...node };
    const updatedNode = {
        ...node,
        type: document.getElementById('nodeType').value,
        content: document.getElementById('nodeContent').value,
        summary: document.getElementById('nodeSummary').value,
        tags: document.getElementById('nodeTags').value.split(',').map(t => t.trim()).filter(t => t)
    };

    undoRedoManager.pushAction({
        description: 'Edit message',
        execute: async () => {
            for (const folderId in folders) {
                if (folders[folderId].nodes[currentEditingNodeId]) {
                    folders[folderId].nodes[currentEditingNodeId] = { ...updatedNode };
                    break;
                }
            }
            allMessages[currentEditingNodeId] = { ...updatedNode };

            await fetch(`/api/messages/${currentEditingNodeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedNode)
            });

            showNotification('Message saved');
            closeEditor();
        },
        undo: async () => {
            for (const folderId in folders) {
                if (folders[folderId].nodes[currentEditingNodeId]) {
                    folders[folderId].nodes[currentEditingNodeId] = { ...originalNode };
                    break;
                }
            }
            allMessages[currentEditingNodeId] = { ...originalNode };

            await fetch(`/api/messages/${currentEditingNodeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(originalNode)
            });

            renderTree();
        }
    });
}

function deleteNode() {
    if (!currentEditingNodeId) return;

    if (!confirm('Delete this message?')) return;

    const nodeId = currentEditingNodeId;
    const deletedNode = { ...allMessages[nodeId] };
    const deletedChildren = [];
    const nodeFolderId = Object.keys(folders).find(folderId => folders[folderId].nodes[nodeId]);
    
    if (nodeFolderId) {
        DELETED_FOLDERS_MAP[nodeId] = nodeFolderId;
    }

    undoRedoManager.pushAction({
        description: 'Delete message',
        execute: async () => {
            await fetch(`/api/messages/${nodeId}`, {
                method: 'DELETE'
            });

            for (const folderId in folders) {
                if (folders[folderId].nodes[nodeId]) {
                    delete folders[folderId].nodes[nodeId];
                    break;
                }
            }
            delete allMessages[nodeId];

            showNotification('Message deleted');
            closeEditor();
        },
        undo: async () => {
            const targetFolderId = DELETED_FOLDERS_MAP[nodeId];
            if (targetFolderId && folders[targetFolderId]) {
                if (!folders[targetFolderId].nodes) folders[targetFolderId].nodes = {};
                folders[targetFolderId].nodes[nodeId] = { ...deletedNode };
            }
            allMessages[nodeId] = { ...deletedNode };

            await fetch(`/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId: targetFolderId, node: deletedNode })
            }).catch(err => console.error('Failed to restore message:', err));

            renderTree();
            showNotification('Message restored');
        }
    });
}

function expandAll() {
    const originalStates = Object.entries(allMessages).reduce((acc, [id, node]) => {
        if (node.children && node.children.length > 0) {
            acc[id] = node.expanded;
        }
        return acc;
    }, {});

    undoRedoManager.pushAction({
        description: 'Expand all messages',
        execute: async () => {
            Object.values(allMessages).forEach(node => {
                if (node.children && node.children.length > 0) {
                    node.expanded = true;
                }
            });
            renderTree();
            showNotification('All messages expanded');
        },
        undo: async () => {
            Object.entries(originalStates).forEach(([id, wasExpanded]) => {
                if (allMessages[id]) {
                    allMessages[id].expanded = wasExpanded;
                }
            });
            renderTree();
            showNotification('Expand all undone');
        }
    });
}

function collapseAll() {
    const originalStates = Object.entries(allMessages).reduce((acc, [id, node]) => {
        if (node.children && node.children.length > 0) {
            acc[id] = node.expanded;
        }
        return acc;
    }, {});

    undoRedoManager.pushAction({
        description: 'Collapse all messages',
        execute: async () => {
            Object.values(allMessages).forEach(node => {
                node.expanded = false;
            });
            renderTree();
            showNotification('All messages collapsed');
        },
        undo: async () => {
            Object.entries(originalStates).forEach(([id, wasExpanded]) => {
                if (allMessages[id]) {
                    allMessages[id].expanded = wasExpanded;
                }
            });
            renderTree();
            showNotification('Collapse all undone');
        }
    });
}

function unselectAll() {
    const originalSelected = Object.entries(allMessages).reduce((acc, [id, node]) => {
        if (node.selected) {
            acc[id] = true;
        }
        return acc;
    }, {});

    undoRedoManager.pushAction({
        description: 'Unselect all messages',
        execute: async () => {
            Object.values(allMessages).forEach(node => {
                node.selected = false;
                const folderId = Object.keys(folders).find(fid => folders[fid].nodes[node.id]);
                if (folderId) {
                    folders[folderId].nodes[node.id].selected = false;
                }
            });
            renderTree();
            showNotification('All messages unchecked');
        },
        undo: async () => {
            Object.entries(originalSelected).forEach(([id]) => {
                if (allMessages[id]) {
                    allMessages[id].selected = true;
                    const folderId = Object.keys(folders).find(fid => folders[fid].nodes[id]);
                    if (folderId) {
                        folders[folderId].nodes[id].selected = true;
                    }
                }
            });
            renderTree();
            showNotification('Unselect all undone');
        }
    });
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
    const selected = Object.values(allMessages).filter(m => m.selected);

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

function sortCombineByTime() {
    combineOrder.sort((a, b) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dateA - dateB;
    });
    renderCombineList();
    updateCombinedPreview();
}

function sortCombineByType() {
    const typeOrder = { user: 1, prompt: 2, auto: 3, response: 4 };
    combineOrder.sort((a, b) => {
        const orderA = typeOrder[a.type] || 99;
        const orderB = typeOrder[b.type] || 99;
        return orderA - orderB;
    });
    renderCombineList();
    updateCombinedPreview();
}

function sortCombineByFolder() {
    combineOrder.sort((a, b) => {
        const folderA = getFolderInfo(a.id);
        const folderB = getFolderInfo(b.id);
        const nameA = folderA ? folderA.name.toLowerCase() : '';
        const nameB = folderB ? folderB.name.toLowerCase() : '';
        return nameA.localeCompare(nameB);
    });
    renderCombineList();
    updateCombinedPreview();
}

function sortCombineByType() {
    const typeOrder = { user: 1, prompt: 2, response: 3 };
    combineOrder.sort((a, b) => {
        const orderA = typeOrder[a.type] || 99;
        const orderB = typeOrder[b.type] || 99;
        return orderA - orderB;
    });
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

    hideModal('combineModal');

    document.getElementById('optimizerPreview').textContent = combined;

    if (window.marked) {
        document.getElementById('optimizerPreview').innerHTML = window.marked.parse(combined);
    }

    document.getElementById('optimizeModal').classList.add('active');

    setTimeout(() => optimizePrompts(), 500);
}

function optimizePrompts() {
    const templateId = document.getElementById('aiTemplate')?.value || 'optimize';
    const combinedText = combineOrder.map(node => node.content).join('\n\n---\n\n');

    if (combineOrder.length === 0) {
        showNotification('No messages to combine');
        return;
    }

    const resultDiv = document.getElementById('optimizerResult');
    const optimizeBtn = event?.target;

    if (optimizeBtn) {
        optimizeBtn.disabled = true;
        optimizeBtn.textContent = 'Optimizing...';
    }

    let accumulatedContent = '';

    resultDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%;">
            <div style="font-size: 32px; margin-bottom: 16px; animation: spin 1s linear infinite;">🤖</div>
            <div style="color: var(--text-secondary);">AI is processing...</div>
            <div style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">${combineOrder.length} message(s)</div>
        </div>
    `;

    showNotification('Starting optimization...');

    window.aiWorkflowManager.stream(templateId, { prompt: combinedText }, {}, (chunk) => {
        if (accumulatedContent === '') {
            resultDiv.innerHTML = `<div style="padding: 12px; white-space: pre-wrap;">`;
            accumulatedContent = chunk;
        } else {
            accumulatedContent += chunk;
        }
        
        const contentEl = resultDiv.querySelector('div');
        if (contentEl) {
            contentEl.textContent = accumulatedContent;
        }
    })
    .then((result) => {
        const { model, provider } = result;
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        
        const contentEl = resultDiv.querySelector('div') || resultDiv;
        if (window.marked && accumulatedContent.includes('\n')) {
            contentEl.innerHTML = `
                <div style="padding: 12px;">
                    ${window.marked.parse(accumulatedContent)}
                </div>
                <div style="padding: 8px 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted);">
                    Generated by ${providerName} (${model})
                </div>
            `;
        } else {
            contentEl.innerHTML = `
                <div style="padding: 12px;">
                    ${accumulatedContent}
                </div>
                <div style="padding: 8px 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted);">
                    Generated by ${providerName} (${model})
                </div>
            `;
        }

        showNotification(`✓ Optimization complete!`);
        document.getElementById('copyOptimizedBtn').style.display = 'inline-block';
    })
    .catch(err => {
        console.error('Optimization error:', err);
        resultDiv.innerHTML = `
            <div style="color: var(--danger); text-align: center; padding: 40px;">
                <div style="font-size: 32px; margin-bottom: 16px;">❌</div>
                <div style="font-weight: 600; margin-bottom: 8px;">Optimization Failed</div>
                <div style="color: var(--text-secondary); font-size: 14px;">${escapeHtml(err.message || err.toString())}</div>
            </div>
        `;
        showNotification(`✗ Optimization failed: ${err.message}`);
    })
    .finally(() => {
        if (optimizeBtn) {
            optimizeBtn.disabled = false;
            optimizeBtn.textContent = 'Optimize';
        }
    });
}

function updateTemplateDescription() {
    const templateId = document.getElementById('aiTemplate').value;
    const template = window.aiWorkflowManager.getTemplate(templateId);
    const descEl = document.getElementById('templateDescription');
    
    if (template && descEl) {
        descEl.textContent = template.description;
    }
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
    if (!container) {
        return;
    }

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

            document.getElementById('settingsModal').classList.add('active');
        })
        .catch(err => {
            console.error('Failed to load settings:', err);
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
    const anthropicApiKey = document.getElementById('anthropicApiKey').value.trim();
    const aiProvider = document.getElementById('aiProvider').value;

    const updates = {
        openAIAPIKey: apiKey,
        openaiBaseUrl: baseUrl,
        openaiModel: model,
        optimizationPrompt: optimizationPrompt,
        projectPath: projectPath,
        agentsPath: agentsPath,
        anthropicAPIKey: anthropicApiKey,
        aiProvider: aiProvider
    };

    const saveBtn = event?.target;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    showNotification('Saving settings...');

    fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    .then(res => res.json())
    .then(config => {
        configManager.config = config;
        window.aiWorkflowManager.initialize(config);
        showNotification('✓ Settings saved');

        setTimeout(() => hideModal('settingsModal'), 500);
    })
    .catch(err => {
        console.error('Failed to save settings:', err);
        showNotification(`✗ Failed to save: ${err.message}`);
    })
    .finally(() => {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save to .env';
        }
    });
}

function loadSettings() {
    return fetch('/api/config')
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
            document.getElementById('anthropicApiKey').value = config.anthropicAPIKey || '';
            document.getElementById('aiProvider').value = config.aiProvider || 'auto';

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

    const testBtn = event?.target;
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
    }

    showNotification('Testing API connection...');

    const apiUrl = baseUrl.endsWith('/') ? baseUrl + 'models' : baseUrl + '/models';

    console.log('Testing API connection to:', apiUrl);

    fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${apiKey}`
        }
    })
    .then(res => {
        if (res.ok) {
            return res.json();
        } else {
            return res.text().then(text => {
                if (res.status === 401) {
                    throw new Error('Invalid API key');
                } else if (res.status === 404) {
                    throw new Error('Invalid base URL - /models endpoint not found');
                } else if (res.status === 403) {
                    throw new Error('Access forbidden - check API permissions');
                } else {
                    throw new Error(`API error: ${res.status} - ${text || res.statusText}`);
                }
            });
        }
    })
    .then(data => {
        if (!data.data || !Array.isArray(data.data)) {
            throw new Error('Invalid response format from API');
        }

        document.getElementById('modelSelectGroup').style.display = 'block';
        populateModels(data.data);

        const modelCount = data.data.length;
        showNotification(`✓ Connection valid! Found ${modelCount} models`);

        return true;
    })
    .catch(err => {
        console.error('API key test failed:', err);
        showNotification(`✗ Test failed: ${err.message}`);
        throw err;
    })
    .finally(() => {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = 'Test Connection';
        }
    });
}

function fetchModels(showNotificationOnSuccess = true, apiKey = null, baseUrl = null) {
    const effectiveApiKey = apiKey || document.getElementById('openaiApiKey')?.value?.trim();
    const effectiveBaseUrl = baseUrl || document.getElementById('openaiBaseUrl')?.value?.trim() || 'https://api.openai.com/v1';
    const refreshBtn = document.getElementById('refreshModelsBtn');

    if (!effectiveApiKey) {
        showNotification('Please enter an API key first');
        return;
    }

    if (refreshBtn && showNotificationOnSuccess) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Loading...';
    }

    if (showNotificationOnSuccess) {
        showNotification('Fetching models...');
    }

    console.log('Fetching models from:', effectiveBaseUrl);

    const apiUrl = effectiveBaseUrl.endsWith('/') ? effectiveBaseUrl + 'models' : effectiveBaseUrl + '/models';

    fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${effectiveApiKey}`
        }
    })
    .then(res => {
        if (!res.ok) {
            return res.text().then(text => {
                throw new Error(`Failed to fetch models: ${res.status} - ${text || res.statusText}`);
            });
        }
        return res.json();
    })
    .then(data => {
        console.log('Models response:', data);
        populateModels(data.data);
        document.getElementById('modelSelectGroup').style.display = 'block';
        if (showNotificationOnSuccess) {
            showNotification('Models loaded');
        }
    })
    .catch(err => {
        console.error('Failed to fetch models:', err);
        if (showNotificationOnSuccess) {
            showNotification(`Error: ${err.message}`);
        }
    })
    .finally(() => {
        if (refreshBtn && showNotificationOnSuccess) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Models';
        }
    });
}

function populateModels(models) {
    const select = document.getElementById('openaiModel');
    const filterInput = document.getElementById('openaiModelFilter');
    const currentModel = select.value;

    select.innerHTML = '<option value="" data-default>Select a model</option>';

    const sortedModels = models.sort((a, b) => a.id.localeCompare(b.id));

    sortedModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        select.appendChild(option);
    });

    if (currentModel) {
        select.value = currentModel;
    }

    if (filterInput.value) {
        filterModelOptions();
    }
}

function filterModelOptions() {
    const filterInput = document.getElementById('openaiModelFilter');
    const select = document.getElementById('openaiModel');
    const filterText = filterInput.value.toLowerCase();

    Array.from(select.options).forEach(option => {
        if (option.hasAttribute('data-default')) {
            option.style.display = '';
            return;
        }

        if (filterText === '') {
            option.style.display = '';
        } else {
            option.style.display = option.value.toLowerCase().includes(filterText) ? '' : 'none';
        }
    });

    if (filterText === '') {
        select.value = '';
    }
}

function clearModelFilter() {
    const filterInput = document.getElementById('openaiModelFilter');
    filterInput.value = '';
    filterModelOptions();
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

    const syncStatus = document.getElementById('syncStatus');
    const syncStatusMessage = document.getElementById('syncStatusMessage');
    const syncStatusProgress = document.getElementById('syncStatusProgress');
    const syncStatusActions = document.getElementById('syncStatusActions');

    if (data.phase) {
        syncStatus.style.display = 'flex';

        if (data.phase === 'init') {
            syncStatusMessage.textContent = data.message;
            syncStatusMessage.className = 'sync-status-message syncing';
            syncStatusProgress.textContent = '';
            syncStatusActions.style.display = 'flex';
        } else if (data.phase === 'reading' || data.phase === 'building' || data.phase === 'writing') {
            syncStatusMessage.textContent = data.message;
            syncStatusMessage.className = 'sync-status-message syncing';
            if (data.totalMessages && data.processed !== undefined) {
                const percent = Math.round((data.processed / data.totalMessages) * 100);
                syncStatusProgress.textContent = `${data.processed}/${data.totalMessages} (${percent}%)`;
            }
        } else if (data.phase === 'complete') {
            syncStatusMessage.textContent = data.message;
            syncStatusMessage.className = 'sync-status-message complete';
            syncStatusProgress.textContent = '';
            syncStatusActions.style.display = 'none';
            setTimeout(() => {
                syncStatus.style.display = 'none';
            }, 3000);
        } else if (data.phase === 'error') {
            syncStatusMessage.textContent = `Error: ${data.message}`;
            syncStatusMessage.className = 'sync-status-message error';
            if (data.error) {
                syncStatusProgress.textContent = data.error;
            }
            syncStatusActions.style.display = 'none';
        } else if (data.phase === 'cancelled') {
            syncStatusMessage.textContent = data.message;
            syncStatusMessage.className = 'sync-status-message cancelled';
            syncStatusProgress.textContent = '';
            syncStatusActions.style.display = 'none';
            setTimeout(() => {
                syncStatus.style.display = 'none';
            }, 2000);
        }
        return;
    }

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
             <div class="todo-item ${todo.completed ? 'completed' : ''}" role="listitem">
                <input type="checkbox" class="todo-checkbox" 
                    ${todo.completed ? 'checked' : ''}
                    onchange="toggleTodo('${todo.id}')"
                    aria-label="Complete todo: ${escapeHtml(todo.text)}"
                    aria-checked="${todo.completed}">
                <div class="todo-content">
                    <div class="todo-text" title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</div>
                    <span class="todo-priority ${todo.priority}" aria-label="Priority: ${todo.priority}">${todo.priority}</span>
                </div>
                <div class="todo-actions">
                    <button class="todo-delete" onclick="deleteTodo('${todo.id}')" aria-label="Delete todo" title="Delete">×</button>
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

function startSync() {
    fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'already_running') {
            showNotification('Sync is already running');
        } else if (data.status === 'started') {
            showNotification('Sync started');
        }
    })
    .catch(err => {
        console.error('Failed to start sync:', err);
        showNotification('Failed to start sync');
    });
}

function cancelSync() {
    fetch('/api/sync/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'cancelled') {
            showNotification('Sync cancelled');
        }
    })
    .catch(err => {
        console.error('Failed to cancel sync:', err);
        showNotification('Failed to cancel sync');
    });
}

function toggleLock(nodeId) {
    const node = allMessages[nodeId];
    if (!node) return;

    const originalLockState = node.locked;
    const newLockState = !originalLockState;

    undoRedoManager.pushAction({
        description: newLockState ? 'Lock message' : 'Unlock message',
        execute: async () => {
            node.locked = newLockState;

            for (const folderId in folders) {
                if (folders[folderId].nodes[nodeId]) {
                    folders[folderId].nodes[nodeId] = node;
                    break;
                }
            }
            allMessages[nodeId] = node;

            renderTree();

            const response = await fetch(`/api/messages/${nodeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locked: newLockState })
            });
            if (!response.ok) {
                throw new Error('Failed to update lock');
            }
            const data = await response.json();
            showNotification(data.locked ? 'Message locked' : 'Message unlocked');
        },
        undo: async () => {
            node.locked = originalLockState;

            for (const folderId in folders) {
                if (folders[folderId].nodes[nodeId]) {
                    folders[folderId].nodes[nodeId] = node;
                    break;
                }
            }
            allMessages[nodeId] = node;

            renderTree();

            await fetch(`/api/messages/${nodeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locked: originalLockState })
            });
        }
    });
}

function toggleThemePanel() {
    const panel = document.getElementById('themePanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function initThemeSelector() {
    const themeList = document.getElementById('themeList');
    
    try {
        const response = await fetch('/static/themes/themes.json');
        const data = await response.json();
        
        themeList.innerHTML = '';
        
        data.themes.forEach(theme => {
            const div = document.createElement('div');
            div.className = 'theme-item';
            div.dataset.themeId = theme.id;
            div.onclick = () => selectTheme(theme.id);
            
            div.innerHTML = `
                <div class="theme-info">
                    <div class="theme-name">${escapeHtml(theme.name)}</div>
                    <div class="theme-type">${theme.type}</div>
                </div>
            `;
            
            themeList.appendChild(div);
        });
        
        window.themeEngine.addEventListener('themeChanged', (data) => {
            updateThemeActiveState(data.themeId);
        });
    } catch (error) {
        console.error('Failed to load themes:', error);
        themeList.innerHTML = '<div style="padding: 12px; color: var(--danger);">Failed to load themes</div>';
    }
}

async function selectTheme(themeId) {
    try {
        const startTime = performance.now();
        await window.themeEngine.switchTheme(themeId);
        const elapsed = performance.now() - startTime;
        console.log(`Theme switched in ${elapsed.toFixed(2)}ms`);
        updateThemeActiveState(themeId);
    } catch (error) {
        console.error('Failed to switch theme:', error);
        showNotification('Failed to switch theme');
    }
}

function updateThemeActiveState(themeId) {
    const items = document.querySelectorAll('.theme-item');
    items.forEach(item => {
        item.classList.toggle('active', item.dataset.themeId === themeId);
    });
}

document.addEventListener('click', (e) => {
    const panel = document.getElementById('themePanel');
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (panel && panel.style.display !== 'none' && 
        !panel.contains(e.target) && e.target !== toggleBtn) {
        panel.style.display = 'none';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 't') {
            e.preventDefault();
            const panel = document.getElementById('themePanel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            }
        }
    }
});

let configManager = {
    config: {},
    todos: []
};

document.addEventListener('DOMContentLoaded', init);



