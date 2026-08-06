// --- Task Modal (Create / Edit) ---
var taskModalMode = 'create';
var taskModalTaskId = null;
var taskModalIsStash = false;
var tasks = [];
var stashTasks = [];

// Enable/disable the Create/Save button until both title and description are non-empty.
function updateTaskSubmitState() {
    var btn = document.getElementById('taskModalSubmit');
    var title = (document.getElementById('taskTitle').value || '').trim();
    var body = (document.getElementById('taskBody').value || '').trim();
    var valid = title.length > 0 && body.length > 0;
    btn.disabled = !valid;
    btn.classList.toggle('disabled', !valid);
}

function loadStash(boardSlug) {
    var slug = boardSlug || BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return Promise.resolve();
    return fetch('/api/stash/' + slug)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            stashTasks = data || [];
            var h = _hash(stashTasks);
            if (h === _lastStashHash) return; // no change, skip
            _lastStashHash = h;
            // Also cache in localStorage as offline fallback
            try { localStorage.setItem('kanban-stash', JSON.stringify(stashTasks)); } catch(e) {}
            renderBoard();
            renderStats();
        })
        .catch(function() {
            // Fall back to localStorage cache if server is unreachable
            try {
                var cached = localStorage.getItem('kanban-stash');
                if (cached) stashTasks = JSON.parse(cached);
            } catch(e) {}
        });
}

function saveStashToServer() {
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return;
    // Cache locally first (instant)
    try { localStorage.setItem('kanban-stash', JSON.stringify(stashTasks)); } catch(e) {}
    // Fire-and-forget server sync
    fetch('/api/stash/' + slug, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: stashTasks }),
    }).catch(function() {});
}

function openCreateModal() {
    taskModalMode = 'create';
    taskModalTaskId = null;
    taskModalIsStash = false;
    document.getElementById('taskModalTitle').textContent = 'New Task';
    document.getElementById('taskModalSubmit').textContent = 'Create';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskBody').value = '';
    document.getElementById('taskPriority').value = '0';
    document.getElementById('taskGoalMode').value = 'false';
    updateTaskSubmitState();
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (slug) {
        api('GET', '/boards/' + slug + '/meta').then(function(resp) {
            document.getElementById('taskWorkdir').value = resp.default_workdir || '';
        }).catch(function() {});
    }
    // Populate board dropdown from allBoards (loaded by boards.js)
    populateTaskBoardDropdown(BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : ''));
    populateTaskAssigneeDropdown(null);
    document.getElementById('taskModal').classList.add('active');
}

function openEditTaskModal(taskId, isStash) {
    if (!isStash) {
        toast('Editing live kanban tasks is not supported (use Hermes CLI)', 'error');
        return;
    }
    taskModalMode = 'edit';
    taskModalTaskId = taskId;
    taskModalIsStash = isStash;
    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskModalSubmit').textContent = 'Save Changes';

    var task = isStash
        ? stashTasks.find(function(t) { return t.id === taskId; })
        : tasks.find(function(t) { return t.id === taskId; });
    if (!task) { toast('Task not found', 'error'); return; }

    document.getElementById('taskTitle').value = task.title || '';
    document.getElementById('taskBody').value = task.body || '';
    document.getElementById('taskPriority').value = task.priority || 0;
    document.getElementById('taskGoalMode').value = task.goal_mode ? 'true' : 'false';
    updateTaskSubmitState();
    document.getElementById('taskWorkdir').value = task.workspace_path || '';
    populateTaskBoardDropdown(task.board_id || (BOARD_SLUG || ''));
    document.getElementById('taskModal').classList.add('active');
    populateTaskAssigneeDropdown(task.assignee || 'worker');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
    taskModalTaskId = null;
    taskModalIsStash = false;
}

function populateTaskAssigneeDropdown(selected) {
    var sel = document.getElementById('taskAssignee');
    sel.innerHTML = '';
    fetch('/api/profiles').then(function(r) { return r.json(); }).then(function(profiles) {
        profiles.forEach(function(p) {
            var opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name + ' (' + p.model + ')';
            if (p.name === selected) opt.selected = true;
            sel.appendChild(opt);
        });
    }).catch(function() {
        var opt = document.createElement('option');
        opt.value = selected || 'worker';
        opt.textContent = selected || 'worker';
        sel.appendChild(opt);
    });
}

// Populate board dropdown in task modal with all available boards
function populateTaskBoardDropdown(selectedSlug) {
    var sel = document.getElementById('taskBoard');
    if (!sel || !allBoards.length) return;
    sel.innerHTML = '';
    allBoards.forEach(function(b) {
        var opt = document.createElement('option');
        opt.value = b.slug;
        opt.textContent = b.name || b.slug;
        if (b.slug === selectedSlug) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function submitTaskModal() {
    var title = document.getElementById('taskTitle').value.trim();
    var body = document.getElementById('taskBody').value.trim();
    if (!title) { toast('Title is required', 'error'); return; }
    if (!body) { toast('Description is required', 'error'); return; }

    var parentIds = [];
    var parentsRaw = document.getElementById('taskParents').value.trim();
    if (parentsRaw) {
        parentIds = parentsRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
    }
    var childIds = [];
    var childrenRaw = document.getElementById('taskChildren').value.trim();
    if (childrenRaw) {
        childIds = childrenRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
    }

    var body = {
        title: title,
        body: body,
        assignee: document.getElementById('taskAssignee').value || 'worker',
        priority: parseInt(document.getElementById('taskPriority').value) || 0,
        goal_mode: document.getElementById('taskGoalMode').value === 'true',
        parent_ids: parentIds,
        child_ids: childIds,
        workspace_path: document.getElementById('taskWorkdir').value || null,
    };

    try {
        var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
        if (taskModalMode === 'edit') {
            if (!taskModalTaskId) return;
            if (!taskModalIsStash) {
                toast('Editing live kanban tasks is not supported (use Hermes CLI)', 'error');
                closeTaskModal();
                return;
            }
            var stashIdx = stashTasks.findIndex(function(t) { return t.id === taskModalTaskId; });
            if (stashIdx !== -1) {
                stashTasks[stashIdx] = Object.assign({}, stashTasks[stashIdx], body);
                saveStashToServer();
                toast('Stash task updated!', 'success');
                closeTaskModal();
                renderBoard();
            } else {
                toast('Stash task not found', 'error');
            }
        } else {
            await api('POST', '/tasks/' + slug, body);
            toast('Task created!', 'success');
            closeTaskModal();
            document.getElementById('taskTitle').value = '';
            document.getElementById('taskBody').value = '';
            document.getElementById('taskWorkdir').value = '';
            document.getElementById('taskParents').value = '';
            document.getElementById('taskChildren').value = '';
            await loadTasks(slug);
        }
        renderStats();
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

// --- Task Loading ---
var _lastTasksHash = '';
var _lastStashHash = '';

function _hash(arr) {
    // Fast hash of task/stash arrays to detect real changes
    if (!arr || !arr.length) return '|';
    var parts = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
        var t = arr[i];
        parts[i] = t.id + ':' + t.status + ':' + (t.title || '').length + ':' + (t.priority || 0);
    }
    return arr.length + '|' + parts.join(',');
}

function loadTasks(boardSlug) {
    var slug = boardSlug || BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return;
    tasks = [];
    api('GET', '/tasks/' + slug).then(function(data) {
        tasks = data;
        var h = _hash(tasks);
        var changed = (h !== _lastTasksHash);
        _lastTasksHash = h;
        if (!changed) {
            // Tasks unchanged — but stash may have, so still check stash
            loadStash(slug);
            return;
        }
        // Tasks changed — refresh stash then render
        loadStash(slug);
        renderBoard();
        renderStats();
    }).catch(function(e) {
        console.error('Failed to load tasks:', e);
        document.getElementById('kanbanBoard').innerHTML = '<div class="error">Failed to load tasks: ' + e.message + '</div>';
    });
}

function renderBoard() {
    var columns = [
        { status: ['running', 'in_progress'], label: 'In Progress' },
        { status: ['ready'], label: 'Ready' },
        { status: ['todo'], label: 'Todo' },
        { status: ['blocked'], label: 'Blocked' },
        { status: ['done'], label: 'Done' }
    ];
    var html = '';
    // Build set of original server task IDs that have a stash copy (strip 's_' prefix)
    var stashOrigIds = {};
    stashTasks.forEach(function(t) {
        var origId = t.id.replace(/^s_/, '');
        stashOrigIds[origId] = true;
    });
    var visibleTasks = tasks.filter(function(t) { return !stashOrigIds[t.id]; });
    for (var i = 0; i < columns.length; i++) {
        var col = columns[i];
        var items = visibleTasks.filter(function(t) { return col.status.includes(t.status); });
        html += '<div class="column ' + col.status[0] + '" data-status="' + col.status[0] + '">';
        html += '<div class="column-header"><span>' + col.label + '</span><span class="count">' + items.length + '</span></div>';
        html += '<div class="column-body" data-drop-status="' + col.status[0] + '">';
        for (var j = 0; j < items.length; j++) {
            html += renderCard(items[j], false);
        }
        html += '</div></div>';
    }
    // Side column: new-task button, trash, stash drop cell, stash cards
    html += '<div class="side-col"><button onclick="App.openCreateModal()" class="btn-new-task">+ New Task</button>';
    // Trash column
    html += '<div class="column trash" data-status="trash"><div class="column-header"><span>Trash</span></div>';
    html += '<div class="column-body" data-drop-status="trash">';
    html += '<div class="trash-inner"><span class="trash-icon">🗑️</span><span>Drop to delete</span></div>';
    html += '</div></div>';
    // Drop stash cell (sits between trash and stash cards)
    html += '<div class="stash-drop" data-drop-status="stash"><div class="stash-inner"><span class="stash-icon">📋</span><span>Drop to stash</span></div></div>';
    // Stash column — cards render below the stash drop zone
    html += '<div class="column stash" data-status="stash"><div class="column-header"><span>Stash</span><span class="count">' + stashTasks.length + '</span></div>';
    html += '<div class="column-body">';
    for (var s = 0; s < stashTasks.length; s++) {
        html += renderCard(stashTasks[s], true);
    }
    html += '</div></div>';
    document.getElementById('kanbanBoard').innerHTML = html;
}

function renderCard(task, isStash) {
    var badges = [];
    if (task.goal_mode) badges.push('<span class="card-badge goal">Goal</span>');
    if (task.parents && task.parents.length) badges.push('<span class="card-badge" title="Parents">&#9650; ' + task.parents.length + '</span>');
    if (task.children && task.children.length) badges.push('<span class="card-badge" title="Children">&#9660; ' + task.children.length + '</span>');

    var shortTitle = truncate(stripMarkdown(getDisplayTitle(task)), 100);
    var preview = truncate(stripMarkdown(getPreview(task)), 100);

    var cardActions = '';
    if (isStash) {
        // No edit icon for stashed cards
    }

    var cardClick = isStash ? '' : "App.loadDetail('" + task.id + "')";
    var clickAttr = cardClick ? ' onclick="' + cardClick + '"' : '';

    return '<div class="card" draggable="true" data-id="' + task.id + '"' + clickAttr + '>' +
        '<div class="card-id">' + task.id + '</div>' +
        cardActions +
        '<div class="card-title">' + escapeHtml(shortTitle) + '</div>' +
        (preview ? '<div class="card-preview">' + escapeHtml(preview) + '</div>' : '') +
        '<div class="card-meta"><span>' + (task.assignee || 'worker') + '</span><span>P' + (task.priority || 0) + '</span><span>' + getAge(task.created_at) + '</span>' + badges.join(' ') + '</div>' +
        '</div>';
}

function renderStats() {
    var stats = {};
    tasks.forEach(function(t) {
        stats[t.status] = (stats[t.status] || 0) + 1;
    });
    var html = '';
    var labels = { todo: 'Todo', ready: 'Ready', running: 'Active', done: 'Done', blocked: 'Blocked' };
    Object.keys(labels).forEach(function(k) {
        if (stats[k]) html += '<span class="stat ' + k + '">' + labels[k] + ': ' + stats[k] + '</span>';
    });
    var el = document.getElementById('stats');
    if (el) {
        el.innerHTML = html;
        el.style.display = html ? 'flex' : 'none';
    }
}

// --- Task Actions ---
async function changeStatus(taskId, newStatus) {
    try {
        var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
        await api('POST', '/tasks/' + slug + '/' + taskId + '/status', { status: newStatus });
        toast('Status changed to ' + newStatus.replace('_', ' '), 'success');
        // Clear cached hash so loadTasks always re-renders (avoids race with worker reverting status)
        _lastTasksHash = '';
        await loadTasks(slug);
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

async function deleteTask(taskId) {
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return;
    var confirmed = await openConfirmModal('Delete Task', 'Are you sure you want to delete this task?', 'Delete');
    if (!confirmed) return;
    try {
        await api('DELETE', '/tasks/' + slug + '/' + taskId);
        closeDetail();
        await loadTasks(slug);
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

async function duplicateTask(taskId) {
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return;
    var confirmed = await openConfirmModal('Duplicate Task', 'Create a copy of this task?', 'Duplicate');
    if (!confirmed) return;
    try {
        // Fetch full task data
        var fullTask = await (await fetch('/api/tasks/' + slug + '/' + taskId)).json();
        if (!fullTask || !fullTask.id) {
            toast('Failed to load task', 'error');
            return;
        }
        // Build new task payload from existing one
        var newTask = {
            title: fullTask.title + ' (copy)',
            body: fullTask.body || '',
            assignee: fullTask.assignee || 'worker',
            priority: fullTask.priority || 0,
            goal_mode: !!fullTask.goal_mode,
            goal_max_turns: fullTask.goal_max_turns || 20,
            workspace_path: fullTask.workspace_path || null,
            status: 'todo'
        };
        await api('POST', '/tasks/' + slug, newTask);
        toast('Task duplicated!', 'success');
        await loadTasks(slug);
    } catch (e) {
        toast('Duplicate failed: ' + e.message, 'error');
    }
}
