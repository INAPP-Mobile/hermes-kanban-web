// --- App Namespace & Init ---
var App = {
    activeProfile: 'default', // resolved to real first profile once loaded

    init: function() {
        initTheme();
        loadBoards();
        loadProfiles();
        loadModelOptions();
        connectEventStream();
        App.checkSetupStatus();
    },

    // Board
    switchBoard: function(slug) {
        if (slug) {
            BOARD_SLUG = slug;
            document.getElementById('boardDropdownMenu').style.display = 'none';
            document.removeEventListener('click', closeDropdownsOnOutside);
            document.getElementById('currentBoardLabel').textContent = slug;
            renderBoardDropdown();
            window.location.href = '/?board=' + slug;
        }
    },
    toggleBoardDropdown: toggleBoardDropdown,
    openCreateBoardModal: openCreateBoardModal,
    closeCreateBoardModal: closeCreateBoardModal,
    submitCreateBoard: submitCreateBoard,
    openDeleteBoardModal: openDeleteBoardModal,
    closeDeleteBoardModal: closeDeleteBoardModal,
    submitDeleteBoard: submitDeleteBoard,
    openEditBoardModal: openEditBoardModal,
    closeEditBoardModal: closeEditBoardModal,
    submitEditBoard: submitEditBoard,

    // Profiles
    toggleProfileDropdown: toggleProfileDropdown,
    selectProfile: selectProfile,
    openEditProfileModal: openEditProfileModal,
    closeEditProfileModal: closeEditProfileModal,
    submitEditProfile: submitEditProfile,
    openCreateProfileModal: openCreateProfileModal,
    closeCreateProfileModal: closeCreateProfileModal,
    submitCreateProfile: submitCreateProfile,
    openDeleteProfileModal: openDeleteProfileModal,
    closeDeleteProfileModal: closeDeleteProfileModal,
    submitDeleteProfile: submitDeleteProfile,
    loadProfiles: loadProfiles,

    // Tasks
    openCreateModal: openCreateModal,
    openEditTaskModal: openEditTaskModal,
    closeTaskModal: closeTaskModal,
    submitTaskModal: submitTaskModal,
    changeStatus: changeStatus,
    deleteTask: deleteTask,
    duplicateTask: duplicateTask,

    // Detail
    openDetail: openDetail,
    loadDetail: loadDetail,
    closeDetail: closeDetail,
    addComment: addComment,

    // Theme
    toggleTheme: toggleTheme,

    // LLM Setup Wizard
    checkSetupStatus: function() {
        api('GET', '/api/status').then(function(s) {
            _currentConfig = s;
            var btn = document.getElementById('relaunchSetupBtn');
            if (btn) {
                btn.style.display = 'flex';  // always show so user can reconfigure anytime
                btn.title = s.llm_configured ? 'Change LLM configuration' : 'Configure LLM';
            }
            if (!s.llm_configured) App.openSetupWizard();
        }).catch(function(e) {
            console.warn('checkSetupStatus failed:', e);
            var btn = document.getElementById('relaunchSetupBtn');
            if (btn) { btn.style.display = 'flex'; btn.title = 'Configure LLM'; }
        });
    },

    openSetupWizard: function() {
        document.getElementById('setupWizard').classList.add('active');
        App.renderProviderList();
    },

    closeSetupWizard: function() {
        document.getElementById('setupWizard').classList.remove('active');
    },

    // Open the ttyd web terminal (/kanban-terminal/) in a new tab.
    // ttyd enforces HTTP Basic auth (-c user:pass). Inject the credential into
    // the URL (user:pass@host) so the browser auto-sends the Authorization
    // header on the initial page load — the ttyd login prompt never appears.
    //   - The credential comes from /api/terminal-credential, which is gated by
    //     the SAME bearer token as the rest of the board API (board access ==
    //     terminal access).
    //   - If the board is locked and no valid token is stored, or the fetch
    //     fails, fall back to the bare URL and let ttyd's own Basic-auth
    //     prompt handle it.
    //   - The credential is never persisted: held in memory for this call only.
    launchWebTerminal: async function() {
        function openBare() {
            // Board locked / injection unavailable -> ttyd's own auth prompt.
            window.open('/kanban-terminal/', '_blank', 'noopener');
        }
        var user = '', pw = '';
        try {
            var opts = { method: 'GET' };
            if (window.applyAuthHeaders) opts = applyAuthHeaders(opts);
            var res = await fetch('/api/terminal-credential', opts);
            if (res.status === 401) { openBare(); return; }          // board locked
            if (!res.ok) {
                openBare();
                if (window.toast) toast('Terminal auto-fill failed — using ttyd login', 'error');
                return;
            }
            var data = await res.json();
            if (data && data.username && data.password) {
                user = data.username; pw = data.password;
            }
        } catch (e) {
            openBare();
            if (window.toast) toast('Terminal auto-fill failed — using ttyd login', 'error');
            return;
        }
        if (!user || !pw) { openBare(); return; }
        // user:pass@ form -> browser sends `Authorization: Basic ...` on the
        // initial page load; ttyd (1.7.7 -c) accepts it on the GET and hands the
        // token to the WebSocket. Nothing is cached / persisted.
        var url = window.location.protocol + '//'
                + encodeURIComponent(user) + ':' + encodeURIComponent(pw)
                + '@' + window.location.host + '/kanban-terminal/';
        window.open(url, '_blank', 'noopener');
    },
};

// Inline handler on #terminalBtn (index.html) resolves via global scope.
window.launchWebTerminal = App.launchWebTerminal;

document.addEventListener('DOMContentLoaded', function() {
    // Wire up relaunch button (no inline handler elsewhere)
    var relaunchBtn = document.getElementById('relaunchSetupBtn');
    if (relaunchBtn) relaunchBtn.addEventListener('click', App.openSetupWizard);

    App.init();
});
