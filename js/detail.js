// --- Detail Modal ---
var detailTaskId = null;
var detailBoardSlug = null;
var liveOutputAtBottom = false;
var liveOutputTimer = null;
var lastLogSize = 0;
var isDetailRefresh = false;

var _openDetailBusy = false;
var _pendingRefresh = false;

function updateScrollButtons() {
    // no-op - buttons are always visible in normal flow
}

async function openDetail(taskId) {
    if (_openDetailBusy) {
        // If this is a refresh request, mark it pending so the current operation re-renders when done
        if (isDetailRefresh) _pendingRefresh = true;
        return;
    }
    _openDetailBusy = true;
    try {
        await _openDetailInner(taskId);
        // If a refresh was requested while we were busy, do one more refresh
        if (_pendingRefresh) {
            _pendingRefresh = false;
            isDetailRefresh = true;
            await _openDetailInner(detailTaskId);
            isDetailRefresh = false;
        }
    } finally {
        _openDetailBusy = false;
    }
}

async function _openDetailInner(taskId) {
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    var task = await api('GET', '/tasks/' + slug + '/' + taskId);
    var comments = await api('GET', '/tasks/' + slug + '/' + taskId + '/comments');

    // Fetch worker log for live output
    var logResp = await api('GET', '/tasks/' + slug + '/' + taskId + '/log?tail=50000');
    var logContent = logResp.content || '';

    detailTaskId = taskId;
    detailBoardSlug = slug;

    document.getElementById('detailTitle').textContent = truncate(task.title, 120) || task.id;

    var html = '';
    
    // Scroll down button at the VERY TOP of details view
    html += '<div class="scroll-buttons-container scroll-btn-top-container">';
    html += '<button id="scrollTopBtn" class="scroll-btn" title="Scroll to bottom">↓</button>';
    html += '</div>';
    
    html += '<div class="detail-meta"><strong>ID:</strong> <code>' + task.id + '</code> | <strong>Status:</strong> <code>' + task.status + '</code> | <strong>Assignee:</strong> ' + (task.assignee || 'worker') + ' | <strong>Priority:</strong> ' + (task.priority || 0) + ' | <strong>Created:</strong> ' + formatTs(task.created_at) + '</div>';

    if (task.workspace_path) {
        html += '<div class="detail-workdir"><strong>Working Folder:</strong> <code>' + escapeHtml(task.workspace_path) + '</code></div>';
    }

    // Status buttons
    var statuses = ['todo', 'ready', 'running', 'blocked', 'done'];
    html += '<div class="status-buttons">';
    for (var i = 0; i < statuses.length; i++) {
        var s = statuses[i];
        var active = task.status === s ? 'active' : '';
        var btnLabel, statusTarget;
        if (s === 'blocked') {
            if (task.status === 'blocked') {
                btnLabel = 'Unblock';
                statusTarget = 'ready';
            } else {
                btnLabel = 'Blocked';
                statusTarget = 'blocked';
            }
        } else if (s === 'running') {
            btnLabel = 'in progress';
            statusTarget = 'running';
        } else {
            btnLabel = s.replace('_', ' ');
            statusTarget = s;
        }
        html += '<button onclick="App.changeStatus(\'' + task.id + '\',\'' + statusTarget + ')" class="status-btn ' + active + '">' + btnLabel + '</button>';
    }
    html += '</div>';

    // Goal mode badge
    if (task.goal_mode) {
        html += '<div class="goal-badge">Goal Mode</div>';
    }

    if ((task.parents && task.parents.length) || (task.children && task.children.length)) {
        html += '<div class="dependencies-section"><h3>Dependencies</h3>';
        if (task.parents && task.parents.length) {
            html += '<div class="dep-group"><strong>Parents:</strong> ';
            var parentLinks = [];
            for (var pi = 0; pi < task.parents.length; pi++) {
                var pId = task.parents[pi];
                parentLinks.push('<a href="#" onclick="App.loadDetail(' + "'" + pId + "'" + ');return false;">' + pId.substring(0,8) + '</a>');
            }
            html += parentLinks.join(', ') + '</div>';
        }
        if (task.children && task.children.length) {
            html += '<div class="dep-group"><strong>Children:</strong> ';
            var childLinks = [];
            for (var ci = 0; ci < task.children.length; ci++) {
                var cId = task.children[ci];
                childLinks.push('<a href="#" onclick="App.loadDetail(' + "'" + cId + "'" + ');return false;">' + cId.substring(0,8) + '</a>');
            }
            html += childLinks.join(', ') + '</div>';
        }
        html += '</div>';
    }

    // Content
    if (task.title && task.title.length > 200) {
        html += '<div class="content-block"><div class="markdown-body">' + renderMarkdown(task.title) + '</div></div>';
    } else if (task.body) {
        html += '<div class="content-block"><div class="markdown-body">' + renderMarkdown(task.body) + '</div></div>';
    }

    // Comments section — always visible (shows existing comments + input to add new)
    html += '<div class="comments-section">';
    html += '<h3>Comments' + (comments.length ? ' (' + comments.length + ')' : '') + '</h3>';
    if (comments.length) {
        for (var ci = 0; ci < comments.length; ci++) {
            html += '<div class="comment"><strong>' + escapeHtml(comments[ci].author) + '</strong> (' + formatTs(comments[ci].created_at) + '):<div class="markdown-body">' + renderMarkdown(comments[ci].body) + '</div></div>';
        }
    } else {
        html += '<p class="comment-placeholder">No comments yet.</p>';
    }
    // Comment input
    html += '<div class="comment-input-row">';
    html += '<textarea id="commentInput" class="comment-textarea" placeholder="Add a comment..." rows="2"></textarea>';
    html += '<button onclick="App.addComment()" class="btn-comment-submit">Comment</button>';
    html += '</div>';
    html += '</div>';

    // Live output — load existing log content
    html += '<div id="live-output" class="live-output-box">' + escapeHtml(logContent) + '</div>';

    // Agent status indicator
    var isWorking = task.status === 'running' || task.status === 'in_progress';
    html += '<div id="agentStatus" class="agent-status ' + (isWorking ? 'working' : 'idle') + '">';
    html += '<span class="agent-status-dot"></span>';
    html += '<span>' + (isWorking ? 'Working...' : 'Idle') + '</span>';
    html += '</div>';

    // Scroll button at the VERY BOTTOM of details view
    html += '<div class="scroll-buttons-container scroll-btn-bottom-container">';
    html += '<button id="scrollBottomBtn" class="scroll-btn" title="Scroll to top">↑</button>';
    html += '</div>';

    document.getElementById('detailContent').innerHTML = html;

    // Set up click handlers for scroll buttons
    var topBtn = document.getElementById('scrollTopBtn');
    var bottomBtn = document.getElementById('scrollBottomBtn');
    var scrollTarget = document.querySelector('#detailModal .modal-body-full');
    if (topBtn) topBtn.onclick = function() { if (scrollTarget) scrollTarget.scrollTop = scrollTarget.scrollHeight; };
    if (bottomBtn) bottomBtn.onclick = function() { if (scrollTarget) scrollTarget.scrollTop = 0; };

    // Actions — use data attributes + delegation to avoid inline-quote escaping bugs
    var actionsEl = document.getElementById('detailActions');
    actionsEl.setAttribute('data-task', task.id);
    actionsEl.innerHTML =
        '<button data-action="duplicate" class="btn-duplicate" title="Duplicate task">Duplicate</button>' +
        '<button data-action="delete" class="btn-danger">Delete</button>' +
        '<button data-action="close" class="btn-cancel">Close</button>';
    actionsEl.style.display = 'flex';

    document.getElementById('detailModal').classList.add('active');

    // Track scroll position for auto-follow behavior
    var scrollEl = document.querySelector('#detailModal .modal-body-full');
    if (scrollEl) {
        scrollEl.onscroll = function() {
            var threshold = 30;
            liveOutputAtBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
            updateScrollButtons();
        };
    }

    // Only reset to top on initial open (don't reset on refresh from live events)
    if (!isDetailRefresh) {
        liveOutputAtBottom = false;
        if (scrollEl) scrollEl.scrollTop = 0;
    } else {
        // On refresh, preserve current scroll position across the innerHTML replacement
        var savedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
        var savedScrollHeight = scrollEl ? scrollEl.scrollHeight : 0;
        // After DOM update (next tick), restore relative position
        setTimeout(function() {
            if (!scrollEl) return;
            var newScrollHeight = scrollEl.scrollHeight;
            var heightDiff = newScrollHeight - savedScrollHeight;
            scrollEl.scrollTop = Math.max(0, savedScrollTop + heightDiff);
        }, 0);
    }

    // Start polling live output (worker log file)
    startPollLiveOutput();
}

function loadDetail(taskId) {
    detailTaskId = taskId;
    detailBoardSlug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    openDetail(taskId);
}

function closeDetail() {
    document.getElementById('detailModal').classList.remove('active');
    detailTaskId = null;
    detailBoardSlug = null;
    stopPollLiveOutput();
    var actions = document.getElementById('detailActions');
    if (actions) actions.style.display = 'none';
}

// --- Incremental Status Update (from SSE) ---
function refreshDetailStatus(payload) {
    // Payload may be a JSON string or an object
    var data = payload;
    if (typeof payload === 'string') {
        try { data = JSON.parse(payload); } catch(e) {}
    }
    var newStatus = data && data.status ? data.status : (typeof data === 'string' ? data : null);
    if (!newStatus) return;

    // Update the status text in meta line
    var metaEl = document.querySelector('.detail-meta');
    if (metaEl) {
        var statusMatch = metaEl.innerHTML.match(/\| <strong>Status:<\/strong> <code>[^<]*<\/code>/);
        if (statusMatch) {
            metaEl.innerHTML = metaEl.innerHTML.replace(
                statusMatch[0],
                '| <strong>Status:</strong> <code>' + newStatus + '</code>'
            );
        }
    }

    // Update active class on status buttons
    var btns = document.querySelectorAll('#detailContent .status-btn');
    for (var i = 0; i < btns.length; i++) {
        var btnLabel = btns[i].textContent.replace('in progress', 'running').trim();
        if (btnLabel === newStatus) {
            btns[i].classList.add('active');
        } else {
            btns[i].classList.remove('active');
        }
    }
    // Swap Unblock ↔ Blocked button label based on current status
    var blockBtn = null;
    for (var b = 0; b < btns.length; b++) {
        if (btns[b].textContent.trim() === 'Unblock' || btns[b].textContent.trim() === 'Blocked') {
            blockBtn = btns[b];
            break;
        }
    }
    if (blockBtn) {
        if (newStatus === 'blocked') {
            blockBtn.textContent = 'Unblock';
            blockBtn.setAttribute('onclick', blockBtn.getAttribute('onclick').replace(/blocked/g, 'ready'));
            blockBtn.classList.add('active');
        } else if (blockBtn.textContent === 'Unblock') {
            blockBtn.textContent = 'Blocked';
            blockBtn.setAttribute('onclick', blockBtn.getAttribute('onclick').replace(/ready/g, 'blocked'));
            blockBtn.classList.remove('active');
        }
    }

    // Update agent status indicator
    var statusEl = document.getElementById('agentStatus');
    if (statusEl) {
        var isWorking = newStatus === 'running' || newStatus === 'in_progress';
        statusEl.className = 'agent-status ' + (isWorking ? 'working' : 'idle');
        statusEl.querySelector('span:last-child').textContent = isWorking ? 'Working...' : 'Idle';
    }
}

// --- Incremental Comments Update (from SSE) ---
function refreshDetailComments(taskId) {
    var slug = detailBoardSlug || BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug || !taskId) return;
    api('GET', '/tasks/' + slug + '/' + taskId + '/comments').then(function(comments) {
        // Preserve current input value across refresh
        var currentInput = '';
        var inputEl = document.getElementById('commentInput');
        if (inputEl) currentInput = inputEl.value;

        var html = '<div class="comments-section">';
        html += '<h3>Comments' + (comments && comments.length ? ' (' + comments.length + ')' : '') + '</h3>';
        if (comments && comments.length) {
            for (var ci = 0; ci < comments.length; ci++) {
                html += '<div class="comment"><strong>' + escapeHtml(comments[ci].author) + '</strong> (' + formatTs(comments[ci].created_at) + '):<div class="markdown-body">' + renderMarkdown(comments[ci].body) + '</div></div>';
            }
        } else {
            html += '<p class="comment-placeholder">No comments yet.</p>';
        }
        html += '<div class="comment-input-row">';
        html += '<textarea id="commentInput" class="comment-textarea" placeholder="Add a comment..." rows="2"></textarea>';
        html += '<button onclick="App.addComment()" class="btn-comment-submit">Comment</button>';
        html += '</div>';
        html += '</div>';

        var existing = document.querySelector('.comments-section');
        if (existing) {
            existing.outerHTML = html;
        } else {
            var contentEl = document.getElementById('detailContent');
            if (contentEl) contentEl.insertAdjacentHTML('beforeend', html);
        }
        // Restore input value
        var newInput = document.getElementById('commentInput');
        if (newInput && currentInput) newInput.value = currentInput;
    }).catch(function() {});
}

// --- Live Output Polling (worker log) ---
function startPollLiveOutput() {
    stopPollLiveOutput();
    lastLogSize = 0;
    var el = document.getElementById('live-output');
    if (el) el.innerText = '';
    pollLiveOutput();
    liveOutputTimer = setInterval(pollLiveOutput, 2000);
}

function stopPollLiveOutput() {
    if (liveOutputTimer) { clearInterval(liveOutputTimer); liveOutputTimer = null; };
}

function pollLiveOutput() {
    if (!detailTaskId || !detailBoardSlug) return;
    var el = document.getElementById('live-output');
    if (!el) return;
    // Fetch both log and task (for heartbeat check)
    Promise.all([
        api('GET', '/tasks/' + detailBoardSlug + '/' + detailTaskId + '/log?tail=50000'),
        api('GET', '/tasks/' + detailBoardSlug + '/' + detailTaskId)
    ]).then(function(results) {
        var logData = results[0];
        var taskData = results[1];
        if (logData.content && logData.content.length !== lastLogSize) {
            el.textContent = logData.content;
            lastLogSize = logData.content.length;
            if (liveOutputAtBottom) {
                var pollScrollEl = document.querySelector('#detailModal .modal-body-full');
                if (pollScrollEl) pollScrollEl.scrollTop = pollScrollEl.scrollHeight;
            }
        }
        // Update agent status based on heartbeat
        if (taskData && taskData.last_heartbeat_at) {
            var now = Math.floor(Date.now() / 1000);
            var heartbeatAge = now - taskData.last_heartbeat_at;
            // Consider active if heartbeat within last 10 seconds
            var isActive = taskData.status === 'running' || taskData.status === 'in_progress';
            if (!isActive) {
                isActive = heartbeatAge < 10;
            }
            var statusEl = document.getElementById('agentStatus');
            if (statusEl) {
                statusEl.className = 'agent-status ' + (isActive ? 'working' : 'idle');
                statusEl.querySelector('span:last-child').textContent = isActive ? 'Working...' : 'Idle';
            }
        }
    }).catch(function() {});
}

// --- Add Comment ---
async function addComment() {
    var slug = detailBoardSlug || BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    var taskId = detailTaskId;
    if (!slug || !taskId) return;
    var input = document.getElementById('commentInput');
    if (!input) return;
    var body = input.value.trim();
    if (!body) { toast('Comment cannot be empty', 'error'); return; }
    try {
        await api('POST', '/tasks/' + slug + '/' + taskId + '/comments', {
            author: 'user',
            body: body
        });
        input.value = '';
        toast('Comment added', 'success');
        // Re-fetch comments and update the section in-place
        refreshDetailComments(taskId);
    } catch (e) {
        toast('Failed to add comment: ' + e.message, 'error');
    }
}

// --- Detail Actions via event delegation ---
// Buttons use data-action + parent data-task; avoids inline-onclick quote escaping bugs.
document.addEventListener('click', function(e) {
    var btn = e.target.closest('#detailActions button[data-action]');
    if (!btn) return;
    var actionsEl = btn.closest('#detailActions');
    var taskId = actionsEl ? actionsEl.getAttribute('data-task') : null;
    var action = btn.getAttribute('data-action');
    if (action === 'duplicate') {
        if (taskId) App.duplicateTask(taskId);
    } else if (action === 'delete') {
        if (taskId) App.deleteTask(taskId);
    } else if (action === 'close') {
        App.closeDetail();
    }
});