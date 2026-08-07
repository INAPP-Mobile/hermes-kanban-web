// --- SSE Live Updates ---
var eventSource = null;
var boardRefreshTimer = null;

function connectEventStream() {
    if (eventSource) {
        eventSource.close();
    }
    // Fallback: refresh board every 30s regardless of SSE (catches missed events)
    if (boardRefreshTimer) clearInterval(boardRefreshTimer);
    boardRefreshTimer = setInterval(function() {
        var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
        if (slug) loadTasks(slug);
        // Also refresh detail view status if open
        if (detailTaskId && slug) {
            api('GET', '/tasks/' + slug + '/' + detailTaskId).then(function(task) {
                if (task && task.status && document.querySelector('.detail-meta')) {
                    refreshDetailStatus({ status: task.status });
                }
            }).catch(function() {});
        }
    }, 30000);
    eventSource = new EventSource(authStreamUrl('/api/events/stream'));
    eventSource.addEventListener('task_event', function(e) {
        try {
            var event = JSON.parse(e.data);
            if (event.board !== BOARD_SLUG) return;
            // Status changed on current board — refresh task list and stash
            // Skip board refresh for commented events (they don't affect card positions)
            if (event.kind !== 'heartbeat' && event.kind !== 'spawned' && event.kind !== 'commented') {
                var slug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
                if (slug) loadTasks(slug);
            }
            // Refresh detail view if open for this task
            if (detailTaskId && event.task_id === detailTaskId) {
                if (event.kind === 'status') {
                    refreshDetailStatus(event.payload);
                } else if (event.kind === 'commented') {
                    refreshDetailComments(detailTaskId);
                } else if (event.kind === 'blocked' || event.kind === 'unblocked' || event.kind === 'claimed' || event.kind === 'completed' || event.kind === 'promoted' || event.kind === 'reclaimed' || event.kind === 'gave_up' || event.kind === 'crashed') {
                    // Fetch current task status from API (payload may not contain status field)
                    var fetchSlug = BOARD_SLUG || (allBoards[0] ? allBoards[0].slug : '');
                    if (fetchSlug) {
                        api('GET', '/tasks/' + fetchSlug + '/' + detailTaskId).then(function(task) {
                            if (task && task.status) {
                                refreshDetailStatus({ status: task.status });
                            }
                        }).catch(function() {});
                    }
                }
            }
        } catch(err) {}
    });
    eventSource.onerror = function() {
        // EventSource auto-reconnects
    };
}
