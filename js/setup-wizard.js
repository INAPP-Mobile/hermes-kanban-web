// --- LLM Setup Wizard ---

var _currentConfig = null;  // populated by checkSetupStatus() from /api/status
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
        // If we have a current config, pre-select the matching provider card
        var classes = ['provider-option'];
        if (_currentConfig && _currentConfig.provider_key === p.key) {
            classes.push('selected');
        }
        html += '<div class="' + classes.join(' ') + '" data-provider-key="' + p.key + '">' +
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

    // If there's current config, auto-open that provider's form with filled values
    if (_currentConfig && _currentConfig.provider_key) {
        var cp = PROVIDERS.find(function(r){ return r.key === _currentConfig.provider_key; });
        if (cp) {
            setTimeout(function() {
                App.chooseProvider(cp, null);
            }, 100);
        }
    }
};

App.chooseProvider = function(p, e) {
    // Highlight selected provider card
    document.querySelectorAll('.provider-option').forEach(function(el) { el.classList.remove('selected'); });
    
    if (e && e.target.closest('.provider-option')) {
        e.target.closest('.provider-option').classList.add('selected');
    } else {
        // Programmatic open: select by data-provider-key attribute
        var card = document.querySelector('[data-provider-key="' + p.key + '"]');
        if (card) card.classList.add('selected');
    }

    // Pre-fill form with current config data when available
    var currentBaseUrl = _currentConfig && _currentConfig.base_url ? _currentConfig.base_url.replace(/'/g, '&#39;') : p.default_url;
    var currentModel = _currentConfig && _currentConfig.model ? _currentConfig.model : '';
    var currentProfile = document.getElementById('currentProfileLabel') ? document.getElementById('currentProfileLabel').textContent : 'default';

    var area = document.getElementById('providerFormArea');
    area.innerHTML =
        '<div class="setup-form">' +
        (p.key === 'openrouter' ? '<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">OpenRouter provides a unified API for 50+ models. Your key stays local.</p>' : '') +
        '<label>Base URL</label><input type="text" id="setupBaseUrl" value="' + currentBaseUrl + '" style="width:100%;margin-bottom:8px;" placeholder="' + p.default_url + '">' +
        '<label>Model</label><input type="text" id="setupModel" value="' + (currentModel || '') + '" style="width:100%;margin-bottom:8px;" placeholder="' + (p === PROVIDERS[0] ? 'e.g. qwen3:8b' : 'e.g. gpt-4o') + '">' +
        (p.key !== 'ollama' ? '<label>API Key</label><input type="password" id="setupApiKey" style="width:100%;margin-bottom:12px;" placeholder="Enter your API key...">' : '') +
        '<label>Profile Name</label><input type="text" id="setupProfile" value="' + currentProfile + '" style="width:100%;margin-bottom:16px;">' +
        '<button onclick="App.saveSetup(\'' + p.key.replace(/'/g, "\\'") + '\')" class="btn-save-setup">Save \u2022 Reload</button>' +
        '</div>';
};

App.saveSetup = async function(providerKey) {
    var body = {
        provider: providerKey,
        base_url: document.getElementById('setupBaseUrl').value.trim(),
        model: document.getElementById('setupModel').value.trim(),
        api_key: (document.getElementById('setupApiKey') || {value:''}).value.trim(),
        profile: document.getElementById('setupProfile').value.trim() || 'default',
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