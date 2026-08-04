// --- LLM Setup Wizard ---

var PROVIDERS = [
    { key: 'ollama', label: 'Ollama', default_url: 'http://localhost:11434' },
    { key: 'openai', label: 'OpenAI-compatible', default_url: 'https://api.openai.com/v1' },
    { key: 'openrouter', label: 'OpenRouter', default_url: 'https://openrouter.ai/api/v1' },
    { key: 'anthropic', label: 'Anthropic', default_url: 'https://api.anthropic.com' },
];

App.renderProviderList = function() {
    var html = '<div class="provider-grid">';
    PROVIDERS.forEach(function(p) {
        var icon = p.key === 'ollama' ? '\u{1F916}' : p.key === 'openai' ? '\u2B50' : p.key === 'openrouter' ? '\u{1F310}' : '\u26AA';
        html += '<div class="provider-option" data-provider-key="' + p.key + '">' +
            '<span class="provider-radio"></span>' +
            '<span class="provider-label">' + icon + '  ' + p.label + '</span>' +
        '</div>';
    });
    html += '</div><div id="providerFormArea" style="margin-top:16px;"></div>';
    document.getElementById('setupWizardContent').innerHTML = html;

    // Delegate clicks via addEventListener for reliable event handling
    var grid = document.querySelector('.provider-grid');
    if (grid) {
        grid.addEventListener('click', function(e) {
            var card = e.target.closest('.provider-option');
            if (!card) return;
            var key = card.getAttribute('data-provider-key');
            var p = PROVIDERS.find(function(r){ return r.key === key; });
            if (p) App.chooseProvider(p, e);
        });
    }
};

App.chooseProvider = function(p, e) {
    // Highlight selected provider card
    document.querySelectorAll('.provider-option').forEach(function(el) { el.classList.remove('selected'); });
    var targetEl = e ? e.target.closest('.provider-option') : null;
    if (targetEl) targetEl.classList.add('selected');

    var activeProfileName = document.getElementById('currentProfileLabel') ? document.getElementById('currentProfileLabel').textContent : 'default';
    var area = document.getElementById('providerFormArea');
    area.innerHTML =
        '<div class="setup-form">' +
        (p.key === 'openrouter' ? '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">OpenRouter provides a unified API for 50+ models. Your key stays local.</p>' : '') +
        '<label>Base URL</label><input type="text" id="setupBaseUrl" value="' + p.default_url.replace(/'/g, '&#39;') + '" style="width:100%;margin-bottom:8px;" placeholder="' + p.default_url + '">' +
        '<label>Model</label><input type="text" id="setupModel" placeholder="' + (p === PROVIDERS[0] ? 'e.g. qwen3:8b' : 'e.g. gpt-4o') + '" style="width:100%;margin-bottom:8px;">' +
        (p.key !== 'ollama' ? '<label>API Key</label><input type="password" id="setupApiKey" style="width:100%;margin-bottom:12px;" placeholder="Enter your API key...">' : '') +
        '<label>Profile Name</label><input type="text" id="setupProfile" value="' + activeProfileName + '" style="width:100%;margin-bottom:16px;">' +
        '<button onclick="App.saveSetup(\'' + p.key.replace(/'/g, "\\'") + '\')" class="btn-save-setup">Save • Reload</button>' +
        '</div>';
};

App.saveSetup = async function(providerKey) {
    var body = {
        provider: providerKey,
        base_url: document.getElementById('setupBaseUrl').value.trim(),
        model: document.getElementById('setupModel').value.trim(),
        api_key: (document.getElementById('setupApiKey') || {value:''}).value.trim(),
        profile: document.getElementById('setupProfile').value.trim() || 'worker3',
    };
    if (!body.model) { toast('Model name is required', 'error'); return; }
    try {
        var resp = await api('POST', 'setup', body);
        _setupComplete = true;
        toast('LLM configured! Reloading...', 'success');
        var btn = document.getElementById('relaunchSetupBtn');
        if (btn) btn.style.display = 'none';  // hide after successful config
        window.App.closeSetupWizard();
        setTimeout(function() { location.reload(); }, 1500);
    } catch (e) {
        _setupComplete = true; // show button on failure too so user can re-try
        toast('Setup failed: ' + e.message, 'error');
        var btn = document.getElementById('relaunchSetupBtn');
        if (btn) btn.style.display = 'flex';
    }
};