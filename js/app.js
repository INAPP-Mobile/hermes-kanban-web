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
        if (typeof App.initSetupTracker === 'function') App.initSetupTracker();
    },

    // Board
    switchBoard: function(slug) {
        if (slug) {
            BOARD_SLUG = slug;
            document.getElementById('boardDropdownMenu').style.display = 'none';
            document.removeEventListener('click', closeBoardDropdownOnOutside);
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
        api('GET', 'status').then(function(s) {
            if (!s.llm_configured) {
                App.openSetupWizard();
            }
        }).catch(function(e) {
            console.warn('checkSetupStatus failed:', e);
        });
    },

    openSetupWizard: function() {
        document.getElementById('setupWizard').classList.add('active');
        if (!document.body.querySelector('#providerFormArea')) App.renderProviderList();
    },

    closeSetupWizard: function() {
        document.getElementById('setupWizard').classList.remove('active');
        var btn = document.getElementById('relaunchSetupBtn');
        if (btn && _setupComplete) btn.style.display = 'flex';
    },
};

var _setupComplete = false;

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

// --- Setup tracker: show relaunch button after first save attempt ---
(function() {
    var obs = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.addedNodes.length && m.addedNodes[0].id === 'setupBaseUrl') {
                _setupComplete = true;
                var btn = document.getElementById('relaunchSetupBtn');
                if (btn) btn.title = 'LLM already configured \u2014 click to change settings';
            }
        });
    });
    obs.observe(document.getElementById('setupWizardContent'), { childList: true, subtree: true });
})();
