// --- Board Management ---
var allBoards = [];
var BOARD_SLUG = new URLSearchParams(window.location.search).get('board') || '';

async function loadBoards() {
    try {
        allBoards = await api('GET', '/boards');
        BOARD_SLUG = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
        var currentBoard = BOARD_SLUG;
        document.getElementById('currentBoardLabel').textContent = currentBoard || 'No boards';
        renderBoardDropdown();
        if (!currentBoard) {
            // Fresh workspace: no boards yet. loadTasks('') would bail on the
            // empty slug and leave #board stuck at "Loading..." — render an
            // actionable empty state instead.
            document.getElementById('kanbanBoard').innerHTML =
                '<div class="empty-state">' +
                '<p>No boards yet — create your first board to get started.</p>' +
                '<button class="btn-new-task" onclick="App.openCreateBoardModal()">+ Create Board</button>' +
                '</div>';
            // Update profile label since no board orchestrator-profile is available
            document.getElementById('currentProfileLabel').textContent = allProfiles.length ? App.activeProfile : 'default';
            return; // profiles already rendered by loadProfiles(); do nothing more
        }
        loadTasks(currentBoard);
        api('GET', '/boards/' + currentBoard + '/orchestrator-profile').then(function(resp) {
            if (resp && resp.profile) {
                App.activeProfile = resp.profile;
                document.getElementById('currentProfileLabel').textContent = resp.profile;
            }
        }).catch(function() {});
    } catch (e) {
        console.error('Failed to load boards:', e);
        document.getElementById('kanbanBoard').innerHTML = '<div class="error">Failed to load boards: ' + e.message + '</div>';
    }
}

function renderBoardDropdown() {
    var menu = document.getElementById('boardDropdownMenu');
    var currentBoard = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    var html = '';
    allBoards.forEach(function(b) {
        var selected = b.slug === currentBoard ? 'font-weight:600;color:var(--accent);' : '';
        html += '<div class="dropdown-item ' + selected + '">';
        html += '<span onclick="App.switchBoard(\'' + b.slug + '\')" class="dropdown-label">' + escapeHtml(b.slug) + (b.slug === currentBoard ? ' \u2713' : '') + '</span>';
        html += '<span onclick="App.openEditBoardModal(\'' + b.slug + '\')" class="dropdown-edit" title="Edit">\u270E</span>';
        html += '</div>';
    });
    html += '<div class="dropdown-divider"></div>';
    html += '<div onclick="App.openCreateBoardModal()" class="dropdown-item">\uff0b New Board</div>';
    if (currentBoard) {
        html += '<div onclick="App.openDeleteBoardModal()" class="dropdown-item danger">\ud83d\uddd1 Delete Board</div>';
    }
    menu.innerHTML = html;
}

function toggleBoardDropdown() {
    var menu = document.getElementById('boardDropdownMenu');
    var isOpen = menu.style.display === 'block';
    if (isOpen) {
        menu.style.display = 'none';
        document.removeEventListener('click', closeBoardDropdownOnOutside);
    } else {
        menu.style.display = 'block';
        setTimeout(function() {
            document.addEventListener('click', closeBoardDropdownOnOutside);
        }, 10);
    }
}

function closeBoardDropdownOnOutside(e) {
    var menu = document.getElementById('boardDropdownMenu');
    var btn = document.getElementById('boardDropdownBtn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', closeBoardDropdownOnOutside);
    }
}

// Board Modal
function openCreateBoardModal() {
    toggleBoardDropdown();
    document.getElementById('newBoardSlug').value = '';
    document.getElementById('newBoardWorkdir').value = '';
    document.getElementById('createBoardModal').classList.add('active');
}

function closeCreateBoardModal() {
    document.getElementById('createBoardModal').classList.remove('active');
    document.getElementById('newBoardSlug').value = '';
    document.getElementById('newBoardWorkdir').value = '';
}

async function submitCreateBoard() {
    var slug = document.getElementById('newBoardSlug').value.trim();
    if (!slug) { toast('Board slug is required', 'error'); return; }
    slug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!slug) { toast('Invalid board slug', 'error'); return; }
    var workdir = document.getElementById('newBoardWorkdir').value.trim() || null;
    try {
        await api('POST', '/boards', { slug: slug, default_workdir: workdir });
        toast('Board created!', 'success');
        closeCreateBoardModal();
        await loadBoards();
        window.location.href = '/?board=' + slug;
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

function openDeleteBoardModal() {
    toggleBoardDropdown();
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) { toast('No board selected', 'error'); return; }
    document.getElementById('deleteBoardName').textContent = slug;
    document.getElementById('deleteBoardModal').classList.add('active');
}

function closeDeleteBoardModal() {
    document.getElementById('deleteBoardModal').classList.remove('active');
}

async function submitDeleteBoard() {
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return;
    if (!confirm('Permanently delete board "' + slug + '"?')) return;
    try {
        await api('DELETE', '/boards/' + slug);
        toast('Board deleted', 'success');
        closeDeleteBoardModal();
        var remaining = await api('GET', '/boards');
        window.location.href = remaining.length ? '/?board=' + remaining[0].slug : '/';
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

// --- Edit Board Modal ---
var _editingBoardSlug = null;

async function openEditBoardModal(slug) {
    toggleBoardDropdown();
    _editingBoardSlug = slug;
    document.getElementById('editBoardSlug').value = slug;
    try {
        var meta = await api('GET', '/boards/' + slug + '/meta');
        document.getElementById('editBoardWorkdir').value = meta.default_workdir || '';
    } catch (e) {
        document.getElementById('editBoardWorkdir').value = '';
    }
    document.getElementById('editBoardModal').classList.add('active');
}

function closeEditBoardModal() {
    document.getElementById('editBoardModal').classList.remove('active');
    _editingBoardSlug = null;
}

async function submitEditBoard() {
    var newSlug = document.getElementById('editBoardSlug').value.trim();
    if (!newSlug) { toast('Board slug is required', 'error'); return; }
    var sanitized = newSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!sanitized) { toast('Invalid board slug', 'error'); return; }
    if (sanitized !== newSlug) {
        toast('Slug must be lowercase letters, numbers, hyphens, underscores only', 'error');
        return;
    }
    var workdir = document.getElementById('editBoardWorkdir').value.trim() || null;
    var oldSlug = _editingBoardSlug;
    if (!oldSlug) return;
    try {
        var resp = await api('PUT', '/boards/' + oldSlug, { slug: sanitized, default_workdir: workdir });
        toast('Board updated!', 'success');
        closeEditBoardModal();
        var newSlugResp = resp.slug || newSlug;
        if (oldSlug !== newSlugResp) {
            BOARD_SLUG = newSlugResp;
            document.getElementById('currentBoardLabel').textContent = newSlugResp;
        }
        await loadBoards();
        if (oldSlug !== newSlugResp) {
            window.location.href = '/?board=' + newSlugResp;
        }
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}
