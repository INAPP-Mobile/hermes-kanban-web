// --- Board Management ---
var allBoards = [];
var BOARD_SLUG = new URLSearchParams(window.location.search).get('board') || '';

function autoFillBoardSlug() {
    var nameEl = document.getElementById('newBoardName');
    var slugEl = document.getElementById('newBoardSlug');
    if (!nameEl || !slugEl) return;
    slugEl.value = nameEl.value.trim().toLowerCase().replace(/[^a-z0-9\s_-]/g, '').replace(/\s+/g, '-');
}

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
            document.getElementById('detailPanel').innerHTML = '';
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
    if (!menu) return;
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

// --- Unified Outside-Click Handler (shares between board + profile) ---
// Attached once at init; closes any open dropdown unless a modal/other dropdown is active
var _dropdownsOpen = 0;

function closeDropdownsOnOutside(e) {
    if (!e || !e.target) return;
    var modalActive = document.querySelector('.modal-overlay.active');
    if (modalActive) return; // never close while a modal is open

    var boardMenu = document.getElementById('boardDropdownMenu');
    var profileSelect = document.getElementById('profileDropdownList');
    var boardBtn = document.getElementById('boardDropdownBtn');
    var profileBtn = document.getElementById('profileDropdownBtn');

    if (boardMenu && boardMenu.contains(e.target)) return;
    if (profileSelect && profileSelect.contains(e.target)) return;
    if (boardBtn && boardBtn.contains(e.target)) return;
    if (profileBtn && profileBtn.contains(e.target)) return;

    // Close any open dropdowns
    if (boardMenu) boardMenu.style.display = 'none';
    if (profileSelect) profileSelect.style.display = 'none';
}

function toggleBoardDropdown() {
    var menu = document.getElementById('boardDropdownMenu');
    if (!menu) return;
    // If any modal is open, bail out — don't close it on outside clicks
    var anyModalActive = document.querySelector('.modal-overlay.active');
    if (anyModalActive) {
        menu.style.display = 'none';
        _dropdownsOpen--;
        return;
    }
    var isOpen = menu.style.display === 'block';
    if (isOpen) {
        menu.style.display = 'none';
        _dropdownsOpen--;
    } else {
        menu.style.display = 'block';
        // Remove stale listener first, then add fresh shared one so we always have exactly one
        document.removeEventListener('click', closeDropdownsOnOutside);
        setTimeout(function() {
            document.addEventListener('click', closeDropdownsOnOutside);
        }, 10);
    }
}

// Board Modal
function openCreateBoardModal() {
    // Close dropdown and detach outside listener before opening modal
    var menu = document.getElementById('boardDropdownMenu');
    if (menu && menu.style.display === 'block') {
        menu.style.display = 'none';
        document.removeEventListener('click', closeBoardDropdownOnOutside);
    }
    try { document.getElementById('newBoardSlug').value = ''; } catch(e) {}
    try { document.getElementById('newBoardWorkdir').value = ''; } catch(e) {}
    try { autoFillBoardSlug(); } catch(e) {}
    var modalEl = document.getElementById('createBoardModal');
    if (modalEl) modalEl.classList.add('active');
}

App.closeCreateBoardModal = closeCreateBoardModal;

function closeCreateBoardModal() {
    var modalEl = document.getElementById('createBoardModal');
    if (modalEl) modalEl.classList.remove('active');
    try { document.getElementById('newBoardSlug').value = ''; } catch(e) {}
    try { document.getElementById('newBoardWorkdir').value = ''; } catch(e) {}
}

App.submitCreateBoard = submitCreateBoard;

async function submitCreateBoard() {
    var slug = (document.getElementById('newBoardSlug') || document.getElementById('newBoardName')).value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!slug) { toast('Board name is required', 'error'); return; }
    try {
        await api('POST', '/boards', { slug: slug });
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
