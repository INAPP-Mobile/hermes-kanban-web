// --- Drag and Drop ---
var draggedCard = null;
var dragZoneEl = null; // element currently showing .drag-over

// Resolve the drop zone for any element under the pointer.
// Whole columns (except the stash column — only the .stash-drop cell
// accepts "move to stash") and the stash cell itself.
function findDropZone(el) {
    if (!el || !el.closest) return null;
    var col = el.closest('.column[data-status]:not(.stash)');
    if (col) return col;
    return el.closest('.stash-drop');
}

function clearDragOver() {
    if (dragZoneEl) {
        dragZoneEl.classList.remove('drag-over');
        dragZoneEl = null;
    }
    var els = document.querySelectorAll('.drag-over');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('drag-over');
}

document.addEventListener('DOMContentLoaded', function() {
    var board = document.getElementById('kanbanBoard');
    if (!board) return;

    board.addEventListener('click', function(e) {
        var card = e.target.closest('.card');
        if (card) {
            var id = card.getAttribute('data-id');
            // Stash cards are click-inert — they aren't real kanban tasks
            // (no server-side detail), and editing is intentionally hidden.
            if (id && id.indexOf('s_') === 0) return;
            App.loadDetail(id);
        }
    });

    board.addEventListener('dragstart', function(e) {
        var card = e.target.closest('.card');
        if (card) {
            draggedCard = card.getAttribute('data-id');
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedCard);
        }
    });

    board.addEventListener('dragend', function(e) {
        var card = e.target.closest('.card');
        if (card) card.classList.remove('dragging');
        draggedCard = null;
        clearDragOver();
    });

    // Highlight state is derived from dragover ONLY. dragover fires
    // continuously while the pointer is over a target, so the highlight is
    // re-established on every move — no flicker from dragenter/dragleave
    // boundary crossings (Chrome fires dragleave with null relatedTarget
    // when crossing child boundaries, which used to remove the highlight
    // mid-hover and make drops flaky).
    board.addEventListener('dragover', function(e) {
        var zone = findDropZone(e.target);
        var isStashCard = draggedCard && draggedCard.indexOf('s_') === 0;
        if (zone && isStashCard) {
            // Stash cards may only be unstashed onto the Todo column — don't
            // even highlight other columns (no drop feedback on invalid targets).
            var status = zone.getAttribute('data-status');
            if (status !== 'todo') zone = null;
        }
        if (zone) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (zone !== dragZoneEl) {
                clearDragOver();
                dragZoneEl = zone;
                zone.classList.add('drag-over');
            }
        } else {
            e.dataTransfer.dropEffect = 'none';
            clearDragOver();
        }
    });

    // Only clear the highlight when the drag genuinely left the board.
    // Null relatedTarget (window exit) is left to dragend cleanup to avoid
    // spurious clears on child-boundary crossings.
    board.addEventListener('dragleave', function(e) {
        var related = e.relatedTarget;
        if (related && !board.contains(related)) clearDragOver();
    });

    board.addEventListener('drop', function(e) {
        var zone = findDropZone(e.target);
        clearDragOver();
        if (!zone) return;
        e.preventDefault();
        if (!draggedCard) return;
        var dropStatus = zone.getAttribute('data-status') || 'stash';

        if (dropStatus === 'trash') {
            var task = tasks.find(function(t) { return t.id === draggedCard; });
            var stashIdx = stashTasks.findIndex(function(t) { return t.id === draggedCard; });
            if (!task && stashIdx === -1) { draggedCard = null; return; }
            var targetTask = task || stashTasks[stashIdx];
            openConfirmModal(
                'Delete Task',
                'Are you sure you want to delete task <strong>' + targetTask.id + '</strong>?',
                'Delete'
            ).then(function(confirmed) {
                if (!confirmed) { draggedCard = null; return; }
                var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
                (async function() {
                    try {
                        if (task) await api('DELETE', '/tasks/' + slug + '/' + task.id);
                        if (stashIdx !== -1) {
                            stashTasks.splice(stashIdx, 1);
                            saveStashToServer();
                        }
                        toast('Task deleted', 'success');
                        await loadTasks(slug);
                        renderBoard();
                    } catch (err) {
                        toast('Failed: ' + err.message, 'error');
                    }
                    draggedCard = null;
                })();
            });
            return;
        }

        // Dragging a stash card back onto the board — create task directly, no modal
        var stashIdx = stashTasks.findIndex(function(t) { return t.id === draggedCard; });
        if (stashIdx !== -1 && dropStatus !== 'stash') {
            // Stash cards may only be unstashed onto the Todo column.
            // Everything else (ready/in_progress/blocked/done) is rejected —
            // the dispatcher owns those lifecycle moves.
            if (dropStatus !== 'todo') {
                toast('Stash cards can only be unstashed to the Todo column', 'error');
                draggedCard = null;
                return;
            }
            var stashCard = stashTasks[stashIdx];
            var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
            // Remove from stash immediately
            stashTasks.splice(stashIdx, 1);
            saveStashToServer();
            // Create the task on the server with stash card's content
            (async function() {
                try {
                    await api('POST', '/tasks/' + slug, {
                        title: stashCard.title || '',
                        body: stashCard.body || '',
                        assignee: stashCard.assignee || 'worker',
                        priority: stashCard.priority || 0,
                        goal_mode: stashCard.goal_mode || false,
                        workspace_path: stashCard.workspace_path || null,
                        status: dropStatus,
                    });
                    toast('Unstashed to ' + dropStatus.replace('_', ' '), 'success');
                    await loadTasks(slug);
                    renderBoard();
                    renderStats();
                } catch (err) {
                    toast('Failed to unstash: ' + err.message, 'error');
                }
                draggedCard = null;
            })();
            return;
        }

        // Dragging a server task to stash column — move task to stash, remove from board
        if (dropStatus === 'stash') {
            var serverTask = tasks.find(function(t) { return t.id === draggedCard; });
            if (serverTask) {
                var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
                // Copy server task content into stash
                stashTasks.push({
                    id: 's_' + serverTask.id,
                    title: serverTask.title || '',
                    body: serverTask.body || '',
                    assignee: serverTask.assignee || 'worker',
                    priority: serverTask.priority || 0,
                    goal_mode: serverTask.goal_mode || false,
                    workspace_path: serverTask.workspace_path || '',
                    created_at: Math.floor(Date.now() / 1000),
                });
                saveStashToServer();
                // Remove from server (it now lives in stash)
                (async function() {
                    try {
                        await api('DELETE', '/tasks/' + slug + '/' + serverTask.id);
                        toast('Moved to stash', 'success');
                        await loadTasks(slug);
                        renderBoard();
                        renderStats();
                    } catch (err) {
                        toast('Failed to stash: ' + err.message, 'error');
                    }
                    draggedCard = null;
                })();
                return;
            }
            // Already a stash card dropped on stash — no-op
            draggedCard = null;
            return;
        }

        // Normal board-to-board drag
        var task = tasks.find(function(t) { return t.id === draggedCard; });
        if (!task) return;
        if (task.status === dropStatus) return;

        // Prevent invalid transitions (Hermes only supports specific forward transitions)
        var validTransitions = {
            'todo': ['ready', 'running', 'blocked', 'scheduled', 'done'],
            'ready': ['running', 'blocked', 'scheduled', 'done'],
            'running': ['blocked', 'scheduled', 'done'],
            'blocked': ['ready', 'running', 'blocked', 'scheduled', 'done'],
            'done': [],
            'scheduled': ['ready', 'running', 'blocked', 'done'],
        };
        var allowed = validTransitions[task.status] || [];
        if (allowed.indexOf(dropStatus) === -1) {
            toast('Invalid transition: ' + task.status + ' → ' + dropStatus + '. Only forward transitions allowed.', 'error');
            draggedCard = null;
            return;
        }
        (async function() {
            try {
                var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
                await api('PATCH', '/tasks/' + slug + '/' + draggedCard, { status: dropStatus });
                toast('Moved to ' + dropStatus.replace('_', ' '), 'success');
                await loadTasks(slug);
            } catch (err) {
                toast('Failed to move task: ' + err.message, 'error');
            }
        })();
        draggedCard = null;
    });
});

// Global dragover preventDefault - only for non-drop areas
document.addEventListener('dragover', function(e) {
    // Only prevent default if we're over a valid drop target
    if (findDropZone(e.target)) e.preventDefault();
});
document.addEventListener('drop', function(e) {
    if (findDropZone(e.target)) e.preventDefault();
});
