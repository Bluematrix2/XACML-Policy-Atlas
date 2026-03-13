'use strict';

// ================================================================
//  POLICY CREATOR — Phase 1 (Alpha)
//  Standard-Wizard: Typ → Basis-Info → Regeln → Review & Export
// ================================================================

import { esc } from './parser.js';

const COMBINING_ALGS = [
  { label: 'Deny überschreibt (Standard)',  value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides' },
  { label: 'Permit überschreibt',           value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides' },
  { label: 'Erster zutreffender',           value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:first-applicable' },
  { label: 'Nur eins passend',              value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:only-one-applicable' },
];

const SESSION_KEY = 'xacml-creator-state';

const PolicyCreator = (() => {
  let _initialized = false;
  let _previewTimer = null;

  // ── State ──────────────────────────────────────────────────────────────

  let _state = _loadState();

  function _defaultState() {
    return {
      step: 1,
      policy: {
        id: '',
        version: '1.0',
        description: '',
        combiningAlg: COMBINING_ALGS[0].value,
        rules: []
      }
    };
  }

  function _loadState() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return _defaultState();
  }

  function _saveState() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(_state)); } catch { /* ignore */ }
  }

  // ── XML Generation ─────────────────────────────────────────────────────

  function _escXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _generateXml() {
    const p   = _state.policy;
    const pid = _escXml(p.id || 'neue-policy');
    const ver = _escXml(p.version || '1.0');
    const alg = _escXml(p.combiningAlg || COMBINING_ALGS[0].value);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<Policy xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17"\n`;
    xml += `        PolicyId="${pid}"\n`;
    xml += `        RuleCombiningAlgId="${alg}"\n`;
    xml += `        Version="${ver}">\n`;

    if (p.description.trim()) {
      xml += `\n  <Description>${_escXml(p.description)}</Description>\n`;
    }

    if (p.rules.length === 0) {
      xml += `\n  <!-- Noch keine Regeln definiert -->\n`;
    } else {
      for (const r of p.rules) {
        xml += `\n  <Rule RuleId="${_escXml(r.id)}" Effect="${r.effect}">\n`;
        if (r.description.trim()) {
          xml += `    <Description>${_escXml(r.description)}</Description>\n`;
        }
        xml += `  </Rule>\n`;
      }
    }

    xml += `\n</Policy>`;
    return xml;
  }

  // ── Step validation ────────────────────────────────────────────────────

  function _canProceed() {
    const p = _state.policy;
    if (_state.step === 1) return true;
    if (_state.step === 2) return p.id.trim() !== '';
    if (_state.step === 3) return (
      p.rules.length > 0 &&
      p.rules.every(r => r.id.trim() !== '')
    );
    return true;
  }

  // ── Init & Render ──────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;
    _render();
  }

  function _render() {
    const container = document.getElementById('layout-creator');
    if (!container) return;

    container.innerHTML = `
      <div class="creator-wrap">
        <div class="creator-header">
          <h2 class="creator-title">&#x1F6E0;&#xFE0F; Policy Creator <span class="alpha-badge">ALPHA</span></h2>
          <p class="creator-subtitle">Erstelle eine XACML-Policy Schritt f&#252;r Schritt &#8212; ohne XML-Kenntnisse.</p>
        </div>
        <div class="creator-main">
          <div class="creator-left">
            <div class="creator-steps" id="creator-steps"></div>
            <div class="creator-form-area" id="creator-form-area"></div>
            <div class="creator-nav" id="creator-nav"></div>
          </div>
          <div class="creator-right">
            <details class="creator-preview" id="creator-preview-details" open>
              <summary class="creator-preview-summary">
                XML-Vorschau
                <button class="creator-copy-btn" id="creator-copy-btn" title="XML in Zwischenablage kopieren">&#x1F4CB;</button>
              </summary>
              <pre class="creator-xml-pre" id="creator-xml-pre"></pre>
            </details>
          </div>
        </div>
      </div>
    `;

    _renderStepBar();
    _renderFormStep();
    _renderNav();
    _updatePreview();

    container.addEventListener('click',  _handleClick);
    container.addEventListener('input',  _handleInput);
    container.addEventListener('change', _handleChange);
  }

  // ── Step Bar ───────────────────────────────────────────────────────────

  function _renderStepBar() {
    const labels = ['Typ', 'Basis-Info', 'Regeln', 'Review'];
    const el = document.getElementById('creator-steps');
    if (!el) return;

    el.innerHTML = labels.map((label, i) => {
      const step     = i + 1;
      const isDone   = step < _state.step;
      const isActive = step === _state.step;
      const cls      = isDone ? 'creator-step done' : isActive ? 'creator-step active' : 'creator-step future';
      const num      = isDone ? '&#x2713;' : step;
      const sep      = step < 4 ? '<div class="creator-step-sep">&#x203A;</div>' : '';
      return `<div class="${cls}" data-step="${step}"${isDone ? '' : ' aria-disabled="true"'}>
        <span class="step-num">${num}</span>
        <span class="step-label">${label}</span>
      </div>${sep}`;
    }).join('');
  }

  // ── Form step rendering ────────────────────────────────────────────────

  function _renderFormStep() {
    const el = document.getElementById('creator-form-area');
    if (!el) return;
    el.innerHTML = _getStepHtml(_state.step);
  }

  function _renderNav() {
    const el = document.getElementById('creator-nav');
    if (!el) return;

    const canBack = _state.step > 1;
    const isLast  = _state.step === 4;
    const canNext = _canProceed();

    if (isLast) {
      el.innerHTML = `
        <div class="creator-nav-row">
          <button class="creator-nav-btn" id="creator-back"${canBack ? '' : ' disabled'}>&#x2190; Zur&#252;ck</button>
          <div class="creator-final-actions">
            <button class="creator-action-btn creator-action-validate" id="creator-validate">&#x2713; Validieren</button>
            <button class="creator-action-btn creator-action-viz"      id="creator-viz">&#x1F4CA; Im Visualizer laden</button>
            <button class="creator-action-btn creator-action-editor"   id="creator-editor">&#x270F;&#xFE0F; Im Editor &#246;ffnen</button>
            <button class="creator-action-btn creator-action-dl"       id="creator-dl">&#x2B07; Als XML herunterladen</button>
          </div>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="creator-nav-row">
          <button class="creator-nav-btn" id="creator-back"${canBack ? '' : ' disabled'}>&#x2190; Zur&#252;ck</button>
          <button class="creator-nav-btn creator-nav-primary" id="creator-next"${canNext ? '' : ' disabled'}>Weiter &#x2192;</button>
        </div>
      `;
    }
  }

  function _getStepHtml(step) {
    if (step === 1) return _step1Html();
    if (step === 2) return _step2Html();
    if (step === 3) return _step3Html();
    if (step === 4) return _step4Html();
    return '';
  }

  // ── Step 1: Typ ────────────────────────────────────────────────────────

  function _step1Html() {
    return `
      <div class="creator-step-content">
        <h3 class="creator-step-title">Schritt 1 &#x2014; Typ w&#228;hlen</h3>
        <p class="creator-step-desc">Welchen Policy-Typ m&#246;chtest du erstellen?</p>
        <div class="creator-type-cards">
          <label class="creator-type-card selected">
            <input type="radio" name="root-type" value="Policy" checked style="display:none">
            <div class="type-card-icon">&#x1F4C4;</div>
            <div class="type-card-label">Policy</div>
            <div class="type-card-desc">Enth&#228;lt direkt Regeln (Rules). Gut f&#252;r einen einzelnen Anwendungsfall.</div>
          </label>
          <label class="creator-type-card disabled" title="Verf&#252;gbar in Phase 3">
            <input type="radio" name="root-type" value="PolicySet" disabled style="display:none">
            <div class="type-card-icon">&#x1F4C1;</div>
            <div class="type-card-label">PolicySet <span class="phase-badge">Phase 3</span></div>
            <div class="type-card-desc">Gruppiert mehrere Policies. Verf&#252;gbar in einer zuk&#252;nftigen Version.</div>
          </label>
        </div>
      </div>
    `;
  }

  // ── Step 2: Basis-Info ─────────────────────────────────────────────────

  function _step2Html() {
    const p = _state.policy;
    const algOptions = COMBINING_ALGS.map(a =>
      `<option value="${esc(a.value)}"${p.combiningAlg === a.value ? ' selected' : ''}>${esc(a.label)}</option>`
    ).join('');

    return `
      <div class="creator-step-content">
        <h3 class="creator-step-title">Schritt 2 &#x2014; Basis-Informationen</h3>
        <div class="creator-field">
          <label class="creator-label" for="f-policy-id">Policy-ID <span class="field-required">*</span></label>
          <input class="creator-input" id="f-policy-id" type="text"
                 data-field="id" placeholder="z.B. access-control-physicians"
                 value="${esc(p.id)}" autocomplete="off" spellcheck="false">
          <span class="creator-hint">Eindeutige ID der Policy (keine Leerzeichen empfohlen)</span>
        </div>
        <div class="creator-field">
          <label class="creator-label" for="f-policy-version">Version</label>
          <input class="creator-input creator-input-sm" id="f-policy-version" type="text"
                 data-field="version" placeholder="1.0"
                 value="${esc(p.version)}" autocomplete="off">
        </div>
        <div class="creator-field">
          <label class="creator-label" for="f-policy-desc">Beschreibung</label>
          <textarea class="creator-textarea" id="f-policy-desc" rows="3"
                    data-field="description"
                    placeholder="Optionale Beschreibung der Policy&#x2026;">${esc(p.description)}</textarea>
        </div>
        <div class="creator-field">
          <label class="creator-label" for="f-policy-alg">Kombinations-Algorithmus</label>
          <select class="creator-select" id="f-policy-alg" data-field="combiningAlg">
            ${algOptions}
          </select>
          <span class="creator-hint">Bestimmt, welche Regel gewinnt wenn mehrere zutreffen.</span>
        </div>
      </div>
    `;
  }

  // ── Step 3: Regeln ─────────────────────────────────────────────────────

  function _step3Html() {
    const rules = _state.policy.rules;
    const rulesHtml = rules.length === 0
      ? `<div class="creator-empty-rules">Noch keine Regeln. Klicke auf „+ Regel hinzuf&#252;gen".</div>`
      : rules.map((r, i) => _ruleCardHtml(r, i)).join('');

    return `
      <div class="creator-step-content">
        <h3 class="creator-step-title">Schritt 3 &#x2014; Regeln definieren</h3>
        <p class="creator-step-desc">Lege fest, welche Zugriffsregeln die Policy enth&#228;lt. Mindestens eine Regel ist erforderlich.</p>
        <div class="creator-rules-list" id="creator-rules-list">
          ${rulesHtml}
        </div>
        <button class="creator-add-rule-btn" id="creator-add-rule">+ Regel hinzuf&#252;gen</button>
      </div>
    `;
  }

  function _ruleCardHtml(r, i) {
    return `
      <div class="creator-rule-card" data-rule-idx="${i}">
        <div class="rule-card-hdr">
          <span class="rule-card-num">Regel ${i + 1}</span>
          <button class="rule-delete-btn" data-action="delete-rule" data-idx="${i}"
                  title="Regel entfernen" aria-label="Regel ${i + 1} entfernen">&#x2715;</button>
        </div>
        <div class="creator-field-row">
          <div class="creator-field creator-field-grow">
            <label class="creator-label" for="f-rule-id-${i}">Regel-ID <span class="field-required">*</span></label>
            <input class="creator-input" id="f-rule-id-${i}" type="text"
                   data-rule-idx="${i}" data-rule-field="id"
                   placeholder="z.B. permit-physicians"
                   value="${esc(r.id)}" autocomplete="off" spellcheck="false">
          </div>
          <div class="creator-field creator-field-sm">
            <label class="creator-label" for="f-rule-effect-${i}">Effect</label>
            <select class="creator-select" id="f-rule-effect-${i}"
                    data-rule-idx="${i}" data-rule-field="effect">
              <option value="Permit"${r.effect === 'Permit' ? ' selected' : ''}>&#x2705; Permit</option>
              <option value="Deny"${r.effect   === 'Deny'   ? ' selected' : ''}>&#x274C; Deny</option>
            </select>
          </div>
        </div>
        <div class="creator-field">
          <label class="creator-label" for="f-rule-desc-${i}">Beschreibung</label>
          <input class="creator-input" id="f-rule-desc-${i}" type="text"
                 data-rule-idx="${i}" data-rule-field="description"
                 placeholder="Optionale Beschreibung&#x2026;"
                 value="${esc(r.description)}" autocomplete="off">
        </div>
      </div>
    `;
  }

  // ── Step 4: Review ─────────────────────────────────────────────────────

  function _step4Html() {
    const p   = _state.policy;
    const alg = COMBINING_ALGS.find(a => a.value === p.combiningAlg)?.label || p.combiningAlg;

    const ruleRows = p.rules.map(r =>
      `<tr>
        <td>${esc(r.id)}</td>
        <td><span class="rule-effect-badge ${r.effect === 'Permit' ? 'permit' : 'deny'}">${r.effect}</span></td>
        <td>${esc(r.description || '—')}</td>
      </tr>`
    ).join('');

    return `
      <div class="creator-step-content">
        <h3 class="creator-step-title">Schritt 4 &#x2014; Review &amp; Export</h3>
        <p class="creator-step-desc">&#220;berpr&#252;fe deine Policy und lade sie herunter oder &#246;ffne sie im Editor.</p>
        <div class="creator-summary">
          <div class="creator-summary-row">
            <span class="creator-summary-key">Policy-ID</span>
            <span class="creator-summary-val">${esc(p.id || '&#x2014;')}</span>
          </div>
          <div class="creator-summary-row">
            <span class="creator-summary-key">Version</span>
            <span class="creator-summary-val">${esc(p.version || '1.0')}</span>
          </div>
          <div class="creator-summary-row">
            <span class="creator-summary-key">Algorithmus</span>
            <span class="creator-summary-val">${esc(alg)}</span>
          </div>
          <div class="creator-summary-row">
            <span class="creator-summary-key">Regeln</span>
            <span class="creator-summary-val">${p.rules.length}</span>
          </div>
        </div>

        ${p.rules.length > 0 ? `
        <table class="creator-rules-table">
          <thead>
            <tr><th>Regel-ID</th><th>Effect</th><th>Beschreibung</th></tr>
          </thead>
          <tbody>${ruleRows}</tbody>
        </table>` : ''}

        <div class="creator-val-result" id="creator-val-result" style="display:none"></div>
      </div>
    `;
  }

  // ── Event Handling ─────────────────────────────────────────────────────

  function _handleClick(e) {
    const t = e.target;

    // Step bar — click on completed steps to go back
    const stepEl = t.closest('.creator-step.done');
    if (stepEl) {
      const step = parseInt(stepEl.dataset.step, 10);
      if (step < _state.step) { _state.step = step; _saveState(); _refresh(); }
      return;
    }

    // Copy button — stop event bubbling into <details> toggle
    if (t.id === 'creator-copy-btn' || t.closest('#creator-copy-btn')) {
      e.stopPropagation();
      _copyXml();
      return;
    }

    if (t.id === 'creator-next' || t.closest('#creator-next')) {
      if (_canProceed() && _state.step < 4) { _state.step++; _saveState(); _refresh(); }
      return;
    }
    if (t.id === 'creator-back' || t.closest('#creator-back')) {
      if (_state.step > 1) { _state.step--; _saveState(); _refresh(); }
      return;
    }
    if (t.id === 'creator-add-rule' || t.closest('#creator-add-rule')) {
      _addRule();
      return;
    }

    const deleteBtn = t.closest('[data-action="delete-rule"]');
    if (deleteBtn) {
      _deleteRule(parseInt(deleteBtn.dataset.idx, 10));
      return;
    }

    if (t.id === 'creator-validate' || t.closest('#creator-validate')) { _doValidate(); return; }
    if (t.id === 'creator-viz'      || t.closest('#creator-viz'))      { _loadIntoVisualizer(); return; }
    if (t.id === 'creator-editor'   || t.closest('#creator-editor'))   { _openInEditor(); return; }
    if (t.id === 'creator-dl'       || t.closest('#creator-dl'))       { _download(); return; }
  }

  function _handleInput(e) {
    const t = e.target;
    if (t.dataset.field !== undefined) {
      _state.policy[t.dataset.field] = t.value;
      _saveState();
      _schedulePreview();
      _updateNextBtn();
      return;
    }
    if (t.dataset.ruleField !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      if (_state.policy.rules[idx]) {
        _state.policy.rules[idx][t.dataset.ruleField] = t.value;
        _saveState();
        _schedulePreview();
        _updateNextBtn();
      }
    }
  }

  function _handleChange(e) {
    const t = e.target;
    if (t.dataset.field !== undefined) {
      _state.policy[t.dataset.field] = t.value;
      _saveState();
      _schedulePreview();
      return;
    }
    if (t.dataset.ruleField !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      if (_state.policy.rules[idx]) {
        _state.policy.rules[idx][t.dataset.ruleField] = t.value;
        _saveState();
        _schedulePreview();
      }
    }
  }

  // ── Rule Management ────────────────────────────────────────────────────

  function _addRule() {
    const n = _state.policy.rules.length + 1;
    _state.policy.rules.push({ id: `regel-${n}`, effect: 'Permit', description: '' });
    _saveState();
    _reRenderRules();
    _schedulePreview();
    _updateNextBtn();
  }

  function _deleteRule(idx) {
    _state.policy.rules.splice(idx, 1);
    _saveState();
    _reRenderRules();
    _schedulePreview();
    _updateNextBtn();
  }

  function _reRenderRules() {
    const list = document.getElementById('creator-rules-list');
    if (!list) return;
    const rules = _state.policy.rules;
    list.innerHTML = rules.length === 0
      ? `<div class="creator-empty-rules">Noch keine Regeln. Klicke auf „+ Regel hinzuf&#252;gen".</div>`
      : rules.map((r, i) => _ruleCardHtml(r, i)).join('');
  }

  // ── UI Helpers ─────────────────────────────────────────────────────────

  function _updateNextBtn() {
    const btn = document.getElementById('creator-next');
    if (btn) btn.disabled = !_canProceed();
  }

  function _schedulePreview() {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(_updatePreview, 300);
  }

  function _updatePreview() {
    const pre = document.getElementById('creator-xml-pre');
    if (!pre) return;
    pre.textContent = _generateXml();
  }

  function _refresh() {
    _renderStepBar();
    _renderFormStep();
    _renderNav();
    _updatePreview();
  }

  // ── Actions ────────────────────────────────────────────────────────────

  function _doValidate() {
    const xml      = _generateXml();
    const resultEl = document.getElementById('creator-val-result');
    if (!resultEl) return;

    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'application/xml');
    const xmlErr = doc.querySelector('parsererror');

    if (xmlErr) {
      const msg = (xmlErr.textContent || '').split('\n')[0].trim();
      resultEl.innerHTML = `<div class="creator-val-row err">&#x274C; XML nicht wohlgeformt: ${esc(msg)}</div>`;
      resultEl.style.display = '';
      return;
    }

    if (window.App && window.App.validateXmlForCreator) {
      const result = window.App.validateXmlForCreator(xml);
      const rows = (result.checks || []).map(c =>
        `<div class="creator-val-row ${c.ok ? 'ok' : 'err'}">${c.ok ? '&#x2705;' : '&#x274C;'} ${esc(c.label)}${c.detail ? ` &#x2014; <em>${esc(c.detail)}</em>` : ''}</div>`
      ).join('');
      const warns = (result.warnings || []).map(w =>
        `<div class="creator-val-row warn">&#x26A0;&#xFE0F; ${esc(w)}</div>`
      ).join('');
      const title = result.valid
        ? `<div class="creator-val-title ok">&#x2705; Validierung erfolgreich</div>`
        : `<div class="creator-val-title err">&#x274C; Fehler gefunden</div>`;
      resultEl.innerHTML = title + rows + warns;
    } else {
      resultEl.innerHTML = `<div class="creator-val-row ok">&#x2705; XML ist wohlgeformt.</div>`;
    }
    resultEl.style.display = '';
  }

  function _loadIntoVisualizer() {
    const xml  = _generateXml();
    const name = `creator-${_state.policy.id || 'neue-policy'}.xml`;
    if (window.App && window.App.loadCreatorXml) {
      window.App.loadCreatorXml(xml, name);
    }
  }

  function _openInEditor() {
    const xml  = _generateXml();
    const name = `creator-${_state.policy.id || 'neue-policy'}.xml`;
    if (window.App && window.App.loadCreatorXmlIntoEditor) {
      window.App.loadCreatorXmlIntoEditor(xml, name);
    }
  }

  function _download() {
    const xml  = _generateXml();
    const ts   = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const name = `xacml-${_state.policy.id || 'neue-policy'}_${ts}.xml`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function _copyXml() {
    const xml = _generateXml();
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(xml).then(() => {
      const btn = document.getElementById('creator-copy-btn');
      if (btn) {
        btn.textContent = '&#x2713;';
        btn.title = 'Kopiert!';
        setTimeout(() => {
          btn.innerHTML = '&#x1F4CB;';
          btn.title     = 'XML in Zwischenablage kopieren';
        }, 1500);
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    init,
    get _initialized() { return _initialized; }
  };
})();

export { PolicyCreator };
