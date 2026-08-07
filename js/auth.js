// --- Optional API Token Auth UI ---
// Stores an optional bearer token in localStorage and attaches it to all
// API requests. Also reconnects the SSE stream with the token as a query
// param (EventSource cannot set headers).

var AUTH_TOKEN_KEY = 'kanbanApiToken';

function getStoredToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (e) { return ''; }
}

function setStoredToken(token) {
    try {
        if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch (e) {}
}

// Attach Authorization header to a fetch opts object (mutates and returns it).
function applyAuthHeaders(opts) {
    var token = getStoredToken();
    if (token) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token;
    }
    return opts;
}

// Build the SSE stream URL, appending the token as a query param if set.
function authStreamUrl(base) {
    var token = getStoredToken();
    return token ? (base + (base.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(token)) : base;
}

function openAuthModal() {
    document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

// Called from api() when the server returns 401 (token required but missing or
// wrong). Auto-opens the modal and reloads data once a token is then saved.
function handleAuthUnauthorized() {
    var status = document.getElementById('authStatus');
    openAuthModal();
    if (status) {
        status.textContent = getStoredToken()
            ? 'The saved token was rejected. Enter a valid API token.'
            : 'This server requires an API token. Enter it below.';
        status.style.color = 'var(--text-warning, #e74c3c)';
    }
}

// Reload boards + tasks after the token changes so the board populates/fails
// appropriately under the new auth.
function reloadBoardData() {
    if (window.loadBoards) loadBoards();
    // loadTasks is also fired by loadBoards' then-chain; call it after.
    if (window.loadTasks) {
        setTimeout(function() { if (typeof loadTasks === 'function') loadTasks(); }, 0);
    }
}

// --- Modal wiring (called on DOMContentLoaded) ---
function initAuthUI() {
    var saveBtn = document.getElementById('authSaveBtn');
    var clearBtn = document.getElementById('authClearBtn');
    var input = document.getElementById('authTokenInput');
    var status = document.getElementById('authStatus');

    if (input) {
        input.value = getStoredToken();
        input.addEventListener('input', function() {
            if (status) status.textContent = '';
        });
    }

    if (saveBtn) saveBtn.addEventListener('click', function() {
        var token = input ? input.value.trim() : '';
        setStoredToken(token);
        // Re-connect SSE with the new token so live updates use auth.
        if (window.connectEventStream) connectEventStream();
        // Re-fetch data under the new token (401 -> modal reopens if wrong).
        if (window.reloadBoardData) reloadBoardData();
        if (status) {
            status.textContent = token ? 'Token saved. Reloading…' : 'Token cleared. Access is open (if server allows).';
            status.style.color = 'var(--text-ok, #2ecc71)' ;
        }
    });

    if (clearBtn) clearBtn.addEventListener('click', function() {
        if (input) input.value = '';
        setStoredToken('');
        if (window.connectEventStream) connectEventStream();
        if (window.reloadBoardData) reloadBoardData();
        if (status) {
            status.textContent = 'Token cleared. Access is open (if server allows).';
            status.style.color = 'var(--text-warning, #e74c3c)';
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    if (window.initAuthUI) initAuthUI();
});

// Expose for api.js's 401 handler.
window.handleAuthUnauthorized = handleAuthUnauthorized;