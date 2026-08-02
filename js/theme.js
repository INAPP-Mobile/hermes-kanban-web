// --- Theme ---

// Apply the theme immediately (synchronous, for FOUC prevention)
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    var btn = document.getElementById('themeToggle');
    if (btn) {
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// Save to both localStorage (instant) and server (persistent)
function persistTheme(theme) {
    localStorage.setItem('kanban-theme', theme);
    // Fire-and-forget server sync — no blocking
    fetch('/api/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme }),
    }).catch(function() {});
}

function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persistTheme(next);
}

function initTheme() {
    var saved = localStorage.getItem('kanban-theme');
    if (saved === 'dark' || saved === 'light') {
        applyTheme(saved);
        return;
    }
    // Nothing in localStorage — try server as fallback
    fetch('/api/theme')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.theme === 'dark') {
                applyTheme('dark');
                localStorage.setItem('kanban-theme', 'dark');
            }
        })
        .catch(function() {
            // Server unreachable — default to light (already the CSS default)
        });
}
