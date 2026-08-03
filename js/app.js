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
        api('GET', '/api/status').then(function(s) {
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
};

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
