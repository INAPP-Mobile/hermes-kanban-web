// --- API & Toast ---
async function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    // Attach optional bearer token if one is stored.
    if (window.applyAuthHeaders) opts = applyAuthHeaders(opts);
    // Ensure path starts with single / — strips any leading slash before prepending /api/
    var raw = path.replace(/^\//, '');  // 'status'→'status', '/status'→'status', '/api/status'→'api/status'
    var url = '/' + (raw.startsWith('api/') ? raw : 'api/' + raw);
    var res = await fetch(url, opts);
    // Server is auth-configured and rejected our token (401). Surface it so the
    // auth modal auto-opens (e.g. on first launch with missing/incorrect token).
    if (res.status === 401) {
        if (window.handleAuthUnauthorized) window.handleAuthUnauthorized();
        throw new Error(await res.text());
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || 'info');
    setTimeout(function() { el.className = 'toast'; }, 3000);
}

// --- Confirm Modal (Promise-based) ---
var confirmResolve = null;

function openConfirmModal(title, message, okText) {
    return new Promise(function(resolve) {
        confirmResolve = resolve;
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').innerHTML = message;
        var okBtn = document.getElementById('confirmOkBtn');
        okBtn.textContent = okText || 'OK';
        // Destructive actions (Delete) use danger styling; others use primary.
        okBtn.className = (okText || '').toLowerCase().indexOf('delete') !== -1 ? 'btn-danger' : 'btn-primary';
        document.getElementById('confirmModal').classList.add('active');
    });
}

function closeConfirmModal(confirmed) {
    document.getElementById('confirmModal').classList.remove('active');
    if (confirmResolve) {
        confirmResolve(confirmed);
        confirmResolve = null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('confirmCancelBtn').onclick = function() { closeConfirmModal(false); };
    document.getElementById('confirmOkBtn').onclick = function() { closeConfirmModal(true); };
});

// Close modals on overlay background click (only if press started on overlay)
var _modalMouseDownTarget = null;
document.addEventListener('mousedown', function(e) {
    _modalMouseDownTarget = e.target;
});
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay') && e.target.id !== 'confirmModal') {
        // Only close if the mousedown also started on the overlay (not inside modal)
        if (_modalMouseDownTarget === e.target) {
            e.target.classList.remove('active');
        }
    }
});

// Close on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(function(m) {
            m.classList.remove('active');
        });
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
    }
});
