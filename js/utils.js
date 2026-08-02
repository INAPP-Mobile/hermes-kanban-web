// --- Utilities ---
function truncate(s, n) {
    if (!s) return '';
    s = s.replace(/\n+/g, ' ').trim();
    return s.length > n ? s.substring(0, n) + '...' : s;
}

function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/`[^`]+`/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/^>\s+/gm, '')
        .replace(/---+/g, '')
        .replace(/\n\n+/g, '\n')
        .trim();
}

function renderMarkdown(text) {
    if (!text) return '';
    if (window.marked) return window.marked.parse(text);
    return escapeHtml(text);
}

function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function formatTs(ts) {
    if (!ts) return '\u2014';
    return new Date(ts * 1000).toLocaleString();
}

function getDisplayTitle(task) {
    var title = task.title || '(untitled)';
    title = title.replace(/\n+/g, ' ').trim();
    return truncate(title, 80);
}

function getPreview(task) {
    var body = (task.body || '').replace(/\n+/g, ' ').trim();
    if (!body && task.title) {
        var title = task.title.replace(/\n+/g, ' ').trim();
        if (title.length > 80) body = title.substring(80);
    }
    return truncate(body, 120);
}

function getAge(ts) {
    if (!ts) return '\u2014';
    var seconds = Math.floor(Date.now() / 1000) - ts;
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor(seconds / 3600);
    if (days > 0) return days + 'd ago';
    if (hours > 0) return hours + 'h ago';
    var mins = Math.floor(seconds / 60);
    return mins + 'm ago';
}
