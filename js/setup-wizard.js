// --- LLM Setup Wizard ---

var PROVIDERS = [
    { key: 'ollama', label: 'Ollama', default_url: 'http://localhost:11434' },
    { key: 'openai', label: 'OpenAI-compatible', default_url: 'https://api.openai.com/v1' },
    { key: 'openrouter', label: 'OpenRouter', default_url: 'https://openrouter.ai/api/v1' },
    { key: 'anthropic', label: 'Anthropic', default_url: 'https://api.anthropic.com' },
];

App.renderProviderList = function() {
    var html = '';
    PROVIDERS.forEach(function(p) {
        html += '<div><label><input type="radio" name="provider" value="' + p.key + '" onchange="App.chooseProvider(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">' + p.label + '</label></div>';
    });
    html += '<div id="providerFormArea"></div>';
    document.getElementById('setupWizardContent').innerHTML = html;
};

App.chooseProvider = function(p) {
    var area = document.getElementById('setupWizardContent');
    area.innerHTML =
        '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Configure provider for profile <b>' + (p.profile_name || 'worker3') + '</b> — used by the orchestrator.</p>' +
        '<label>Base URL</label><input type="text" id="setupBaseUrl" value="' + p.default_url + '" style="width:100%;margin-bottom:8px;">' +
        '<label>Model</label><input type="text" id="setupModel" placeholder="' + (p === PROVIDERS[0] ? 'e.g. qwen3:8b' : 'e.g. gpt-4o') + '" style="width:100%;margin-bottom:8px;">' +
        (p.key !== 'ollama' ? '<label>API Key</label><input type="password" id="setupApiKey" style="width:100%;margin-bottom:8px;">' : '') +
        '<label>Profile name</label><input type="text" id="setupProfile" value="worker3" style="width:100%;margin-bottom:8px;">' +
        '<button onclick="App.saveSetup(\'' + p.key + '\')" class="btn-new-task" style="margin-top:12px;">Save &amp; Reload</button>';
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
        var resp = await api('POST', '/api/setup', body);
        toast('LLM configured! Reloading...', 'success');
        App.closeSetupWizard();
        setTimeout(function() { location.reload(); }, 1500);
    } catch (e) {
        toast('Setup failed: ' + e.message, 'error');
    }
};
