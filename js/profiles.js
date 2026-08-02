// --- Profile Management ---
var allProfiles = [];

function renderProfileDropdown() {
    var menu = document.getElementById('profileDropdownMenu');
    var current = App.activeProfile || 'worker3';
    var html = '';
    allProfiles.forEach(function(p) {
        var label = p.name;
        if (p.alias) label += ' (' + p.alias + ')';
        else if (p.model && p.model !== '\u2014') label += ' (' + p.model + ')';
        var sel = p.name === current ? 'font-weight:600;color:var(--accent);' : '';
        html += '<div class="dropdown-item ' + sel + '">';
        html += '<span onclick="App.selectProfile(\'' + p.name + '\')" class="dropdown-label">' + escapeHtml(label) + (p.name === current ? ' \u2713' : '') + '</span>';
        html += '<span onclick="App.openEditProfileModal(\'' + p.name + '\')" class="dropdown-edit" title="Edit">\u270E</span>';
        html += '</div>';
    });
    html += '<div class="dropdown-divider"></div>';
    html += '<div onclick="App.openCreateProfileModal()" class="dropdown-item">＋ New Profile</div>';
    html += '<div onclick="App.openDeleteProfileModal()" class="dropdown-item danger">🗑 Delete Profile</div>';
    menu.innerHTML = html;
    // Update button label with current profile
    var btnLabel = document.getElementById('currentProfileLabel');
    if (btnLabel) btnLabel.textContent = current;
}

function toggleProfileDropdown() {
    var menu = document.getElementById('profileDropdownMenu');
    var isOpen = menu.style.display === 'block';
    if (isOpen) {
        menu.style.display = 'none';
        document.removeEventListener('click', closeProfileDropdownOnOutside);
    } else {
        menu.style.display = 'block';
        setTimeout(function() {
            document.addEventListener('click', closeProfileDropdownOnOutside);
        }, 10);
    }
}

function closeProfileDropdownOnOutside(e) {
    var menu = document.getElementById('profileDropdownMenu');
    var btn = document.getElementById('profileDropdownBtn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', closeProfileDropdownOnOutside);
    }
}

async function selectProfile(name) {
    toggleProfileDropdown();
    var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
    if (!slug) return;
    try {
        await api('PUT', '/boards/' + slug + '/orchestrator-profile', { profile: name });
        App.activeProfile = name;
        document.getElementById('currentProfileLabel').textContent = name;
        renderProfileDropdown();
        toast('Orchestrator changed to ' + name, 'success');
        loadTasks(slug);
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

// Profile Modal
var _editingProfileName = null;

function openEditProfileModal(name) {
    toggleProfileDropdown();
    var profile = allProfiles.find(function(p) { return p.name === name; });
    if (!profile) return;
    _editingProfileName = name;
    document.getElementById('editProfileName').value = name;
    document.getElementById('editProfileDesc').value = profile.description || '';
    var modelSelect = document.getElementById('editProfileModel');
    populateModelSelect(modelSelect, profile.model);
    document.getElementById('editProfileModal').classList.add('active');
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').classList.remove('active');
    _editingProfileName = null;
}

async function submitEditProfile() {
    var newName = document.getElementById('editProfileName').value.trim();
    if (!newName) { toast('Profile name is required', 'error'); return; }
    var model = document.getElementById('editProfileModel').value.trim();
    var desc = document.getElementById('editProfileDesc').value.trim();
    var oldName = _editingProfileName;
    if (!oldName) return;
    try {
        await api('PUT', '/profiles/' + oldName, { name: newName, model: model, description: desc });
        toast('Orchestrator updated!', 'success');
        closeEditProfileModal();
        if (oldName !== newName) {
            App.activeProfile = newName;
            document.getElementById('currentProfileLabel').textContent = newName;
        }
        await App.loadProfiles();
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

function openCreateProfileModal() {
    toggleProfileDropdown();
    document.getElementById('newProfileName').value = '';
    document.getElementById('newProfileDesc').value = '';
    document.getElementById('createProfileModal').classList.add('active');
    var modelSelect = document.getElementById('newProfileModel');
    populateModelSelect(modelSelect, null);
    var sel = document.getElementById('newProfileClone');
    sel.innerHTML = '<option value="">-- none --</option>';
    allProfiles.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function closeCreateProfileModal() {
    document.getElementById('createProfileModal').classList.remove('active');
}

async function submitCreateProfile() {
    var name = document.getElementById('newProfileName').value.trim();
    if (!name) { toast('Profile name is required', 'error'); return; }
    var model = document.getElementById('newProfileModel').value.trim();
    var desc = document.getElementById('newProfileDesc').value.trim();
    var cloneFrom = document.getElementById('newProfileClone').value;
    try {
        await api('POST', '/profiles', { name: name, model: model, description: desc, clone_from: cloneFrom });
        toast('Profile created!', 'success');
        closeCreateProfileModal();
        await App.loadProfiles();
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

function openDeleteProfileModal() {
    toggleProfileDropdown();
    document.getElementById('deleteProfileName').textContent = App.activeProfile || 'worker3';
    document.getElementById('deleteProfileModal').classList.add('active');
}

function closeDeleteProfileModal() {
    document.getElementById('deleteProfileModal').classList.remove('active');
}

async function submitDeleteProfile() {
    var name = App.activeProfile || 'worker3';
    if (!name) return;
    if (!confirm('Permanently delete profile "' + name + '"?')) return;
    try {
        await api('DELETE', '/profiles/' + name);
        toast('Profile deleted', 'success');
        closeDeleteProfileModal();
        await App.loadProfiles();
    } catch (e) {
        toast('Failed: ' + e.message, 'error');
    }
}

async function loadProfiles() {
    try {
        allProfiles = await api('GET', '/profiles');
        renderProfileDropdown();
    } catch (e) {
        console.error('Failed to load profiles:', e);
    }
}

// --- Model Dropdown ---
var _allModels = [];

async function loadModelOptions() {
    try {
        _allModels = await api('GET', '/models');
    } catch (e) {
        _allModels = [];
    }
}

function populateModelSelect(selectEl, selected) {
    selectEl.innerHTML = '<option value="">-- default --</option>';
    _allModels.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (selected && m === selected) opt.selected = true;
        selectEl.appendChild(opt);
    });
}
