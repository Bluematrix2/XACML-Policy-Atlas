'use strict';

// ================================================================
//  APP — main entry point
// ================================================================

import { XACMLParser, esc } from './parser.js';
import { CSVParser, LabelMapper, EnforcementMapper } from './mappers.js';
import { XACMLValidator } from './validator.js';
import { TreeRenderer } from './renderer.js';
import { UIState } from './ui.js';
import { XACMLGuide } from './guide.js';
import { KnowledgeBase } from './kb.js';

// ── Upload security constants ──
const MAX_XML_SIZE = 5 * 1024 * 1024;  // 5 MB
const MAX_CSV_SIZE = 1 * 1024 * 1024;  // 1 MB

const ALLOWED_XML_EXT = '.xml';
const ALLOWED_CSV_EXT = '.csv';

function _checkFile(file, allowedExt, maxBytes) {
  if (!file.name.toLowerCase().endsWith(allowedExt)) {
    alert(`Ungültiger Dateityp. Nur ${allowedExt.toUpperCase()}-Dateien erlaubt.`);
    return false;
  }
  if (file.size > maxBytes) {
    alert(`Datei zu groß (max. ${Math.round(maxBytes / 1024 / 1024)} MB): ${file.name}`);
    return false;
  }
  return true;
}

const App = (() => {
  let _currentFilter = 'all';
  let _currentSearch = '';

  function triggerCSV() { document.getElementById('csv-input').click(); }

  function clearPolicies() {
    UIState.clear();
    refreshSidebar();
    _renderEmptyState();
  }

  async function loadCSV(input) {
    const file = input.files[0];
    if (!file) return;
    if (!_checkFile(file, ALLOWED_CSV_EXT, MAX_CSV_SIZE)) { input.value = ''; return; }
    try {
      const text    = await file.text();
      const entries = CSVParser.parse(text);
      LabelMapper.load(entries);
      const active = UIState.getActive();
      if (active) showPolicy(active);
      refreshSidebar();
      const btn = document.getElementById('csv-btn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '\u2713 ' + entries.length + ' Labels geladen';
        setTimeout(() => { btn.textContent = orig; }, 2500);
      }
    } catch (e) {
      alert('CSV-Fehler: ' + e.message);
    }
    input.value = '';
  }

  async function loadXMLs(input) {
    const all = Array.from(input.files).filter(f => f.name.toLowerCase().endsWith(ALLOWED_XML_EXT));
    const oversized = all.filter(f => f.size > MAX_XML_SIZE);
    const files = all.filter(f => f.size <= MAX_XML_SIZE);
    if (oversized.length) {
      alert(`Übersprungen (max. ${MAX_XML_SIZE / 1024 / 1024} MB überschritten):\n${oversized.map(f => f.name).join('\n')}`);
    }
    if (!files.length) { input.value = ''; return; }

    let firstIdx = -1;
    const errors = [];

    for (const file of files) {
      try {
        const text   = await file.text();
        const policy = XACMLParser.parse(text, file.name);
        const idx    = UIState.addOrReplace(policy);
        if (firstIdx < 0) firstIdx = idx;
      } catch (e) {
        errors.push(file.name + ': ' + e.message);
      }
    }

    refreshSidebar();
    if (firstIdx >= 0) activatePolicy(firstIdx);
    if (errors.length > 0) alert('Fehler beim Laden:\n' + errors.join('\n'));
    input.value = '';
  }

  function activatePolicy(idx) {
    UIState.setActive(idx);
    const policy = UIState.getActive();
    if (policy) showPolicy(policy);
    refreshSidebar();
  }

  function showPolicy(policy) {
    const sv = esc(_currentSearch);
    const searchBar = `<div class="search-bar">`
      + `<div class="search-input-wrap">`
      + `<input class="search-input" id="s-input" type="text" value="${sv}"`
      + ` placeholder="&#x1F50D; Suchen (Beschreibung, Label, URI...)" oninput="App.applySearch(this.value)">`
      + `<button class="search-clear-btn" id="s-clear" onclick="App.clearSearch()" title="Suche leeren" aria-label="Suche leeren" style="display:${sv?'flex':'none'}">&#x2715;</button>`
      + `</div>`
      + `<button class="filter-btn${_currentFilter==='all'?' active':''}" id="f-all" onclick="App.setFilter('all')">Alle</button>`
      + `<button class="filter-btn${_currentFilter==='permit'?' active':''}" id="f-permit" onclick="App.setFilter('permit')">&#x2705; Nur Permit</button>`
      + `<button class="filter-btn${_currentFilter==='deny'?' active':''}" id="f-deny" onclick="App.setFilter('deny')">&#x274C; Nur Deny</button>`
      + `</div>`;

    document.getElementById('content').innerHTML = searchBar + TreeRenderer.render(policy);

    if (_currentSearch || _currentFilter !== 'all') {
      _applyFiltersAndSearch();
    }
  }

  function applySearch(query) {
    _currentSearch = query.trim();
    const btn = document.getElementById('s-clear');
    if (btn) btn.style.display = _currentSearch ? 'flex' : 'none';
    _applyFiltersAndSearch();
  }

  function clearSearch() {
    _currentSearch = '';
    const input = document.getElementById('s-input');
    if (input) input.value = '';
    const btn = document.getElementById('s-clear');
    if (btn) btn.style.display = 'none';
    _applyFiltersAndSearch();
  }

  function setFilter(type) {
    _currentFilter = type;
    ['all', 'permit', 'deny'].forEach(t => {
      const btn = document.getElementById('f-' + t);
      if (btn) btn.classList.toggle('active', t === type);
    });
    _applyFiltersAndSearch();
  }

  function _applyFiltersAndSearch() {
    const query = _currentSearch.toLowerCase();

    document.querySelectorAll('.rule-card').forEach(card => {
      const effect = card.dataset.effect || '';
      const text   = (card.dataset.search || '') + ' ' + card.textContent.toLowerCase();

      const passFilter = _currentFilter === 'all'
        || (_currentFilter === 'permit' && effect === 'permit')
        || (_currentFilter === 'deny'   && effect === 'deny');

      const passSearch = !query || text.includes(query);

      const visible = passFilter && passSearch;
      card.style.display = visible ? '' : 'none';

      // Auto-expand rule body if search matches
      if (visible && query) {
        const body   = card.querySelector('.rule-body');
        const toggle = card.querySelector('.rule-toggle');
        if (body)   body.classList.add('open');
        if (toggle) toggle.classList.add('open');
      }
    });

    // Highlight query in rule titles
    document.querySelectorAll('.rule-title').forEach(el => {
      if (!el.dataset.origHtml) el.dataset.origHtml = el.innerHTML;
      el.innerHTML = el.dataset.origHtml; // restore

      if (query) {
        const text  = el.textContent;
        const lower = text.toLowerCase();
        const idx   = lower.indexOf(query);
        if (idx >= 0) {
          el.innerHTML = esc(text.slice(0, idx))
            + `<mark class="hl">${esc(text.slice(idx, idx + query.length))}</mark>`
            + esc(text.slice(idx + query.length));
        }
      }
    });
  }

  const _confirmingDelete = new Set();

  function refreshSidebar() {
    const list     = document.getElementById('sidebar-list');
    const policies = UIState.getAll();
    const active   = UIState.getActive();

    if (!policies.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = policies.map((p, i) => {
      const isActive    = p === active;
      const permitCount = p.rules.filter(r => r.effect !== 'Deny').length;
      const denyCount   = p.rules.filter(r => r.effect === 'Deny').length;
      const total       = p.rules.length;
      const pPct        = total > 0 ? (permitCount / total * 100).toFixed(1) : 0;
      const dPct        = total > 0 ? (denyCount   / total * 100).toFixed(1) : 0;
      const shortName   = p.filename.replace(/\.xml$/i, '');
      const confirming  = _confirmingDelete.has(i);

      if (confirming) {
        return `<div class="sb-item${isActive ? ' active' : ''} confirming">`
             + `<div class="sb-confirm">`
             + `<span class="sb-confirm-text">${esc(shortName)} entfernen?</span>`
             + `<button class="sb-confirm-yes" onclick="event.stopPropagation();App.confirmPolicyDelete(${i})">Ja</button>`
             + `<button class="sb-confirm-no" onclick="event.stopPropagation();App.cancelPolicyDelete(${i})">Abbrechen</button>`
             + `</div></div>`;
      }

      return `<div class="sb-item${isActive ? ' active' : ''}" onclick="App.activatePolicy(${i})" title="${esc(p.filename)}">`
           + `<div class="sb-item-main">`
           + `<div class="sb-name">${esc(shortName)}</div>`
           + `<div class="sb-meta">${total} Regel${total !== 1 ? 'n' : ''} &middot; ${permitCount}P&thinsp;/&thinsp;${denyCount}D</div>`
           + `<div class="sb-bar">`
           + `<div class="sb-permit" style="width:${pPct}%"></div>`
           + `<div class="sb-deny" style="width:${dPct}%"></div>`
           + `</div></div>`
           + `<div class="policy-actions">`
           + `<button class="sb-action-btn" onclick="event.stopPropagation();App.handlePolicyEdit(${i})" title="Bearbeiten" aria-label="Bearbeiten">&#x270F;&#xFE0F;</button>`
           + `<button class="sb-action-btn sb-action-delete" onclick="event.stopPropagation();App.handlePolicyDelete(${i})" title="Entfernen" aria-label="Entfernen">&#x1F5D1;</button>`
           + `</div></div>`;
    }).join('');
  }

  function handlePolicyEdit(idx) {
    const policies = UIState.getAll();
    const policy   = policies[idx];
    if (!policy || !policy.rawXml) return;
    UIState.setActive(idx);
    refreshSidebar();
    loadPolicyIntoEditor(policy.filename, policy.rawXml);
  }

  function handlePolicyDelete(idx) {
    _confirmingDelete.add(idx);
    refreshSidebar();
    // Close confirm on outside click
    setTimeout(() => {
      function onOutside(e) {
        const item = document.querySelector(`.sb-item.confirming`);
        if (item && !item.contains(e.target)) {
          cancelPolicyDelete(idx);
          document.removeEventListener('click', onOutside, true);
        }
      }
      document.addEventListener('click', onOutside, true);
    }, 0);
  }

  function confirmPolicyDelete(idx) {
    _confirmingDelete.delete(idx);
    const wasActive = UIState.remove(idx);
    refreshSidebar();
    const remaining = UIState.getAll();
    if (!remaining.length) {
      _renderEmptyState();
    } else if (wasActive) {
      const newActive = UIState.getActive();
      if (newActive) showPolicy(newActive);
    }
  }

  function cancelPolicyDelete(idx) {
    _confirmingDelete.delete(idx);
    refreshSidebar();
  }

  // ── Tab switching ──

  let _activeTab = 'viz';

  function switchTab(tab) {
    _activeTab = tab;
    document.getElementById('layout-viz').style.display   = tab === 'viz'   ? 'flex'  : 'none';
    document.getElementById('layout-val').style.display   = tab === 'val'   ? 'flex'  : 'none';
    document.getElementById('layout-guide').style.display = tab === 'guide' ? 'block' : 'none';
    document.getElementById('layout-kb').style.display    = tab === 'kb'    ? 'block' : 'none';
    document.getElementById('tab-viz').classList.toggle('active',   tab === 'viz');
    document.getElementById('tab-val').classList.toggle('active',   tab === 'val');
    document.getElementById('tab-guide').classList.toggle('active', tab === 'guide');
    document.getElementById('tab-kb').classList.toggle('active',    tab === 'kb');
    if (tab === 'guide') return XACMLGuide.init();
    if (tab === 'kb')    return KnowledgeBase.init();
    return Promise.resolve();
  }

  // ── Enforcement ──

  function triggerEnforcement() { document.getElementById('enf-input').click(); }

  async function loadEnforcement(input) {
    const file = input.files[0];
    if (!file) return;
    if (!_checkFile(file, ALLOWED_CSV_EXT, MAX_CSV_SIZE)) { input.value = ''; return; }
    try {
      const text = await file.text();
      EnforcementMapper.load(text);
      // Re-render active policy to show ℹ️ icons and coloring
      const active = UIState.getActive();
      if (active) showPolicy(active);
      const btn = document.getElementById('enf-btn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.textContent = '\u2713 ' + EnforcementMapper.getCount() + ' Ressourcen geladen';
        setTimeout(() => { btn.innerHTML = orig; }, 2500);
      }
    } catch (e) {
      alert('Enforcement-CSV-Fehler: ' + e.message);
    }
    input.value = '';
  }

  function openEnfPanel(fhirType) {
    const panel   = document.getElementById('enf-panel');
    const overlay = document.getElementById('enf-overlay');
    const title   = document.getElementById('enf-panel-title');
    const body    = document.getElementById('enf-panel-body');
    if (!panel || !body) return;

    title.textContent = 'FHIR: ' + fhirType;
    body.innerHTML    = _buildEnfPanelHtml(fhirType);
    panel.classList.add('open');
    overlay.classList.add('open');
  }

  function closeEnfPanel() {
    document.getElementById('enf-panel').classList.remove('open');
    document.getElementById('enf-overlay').classList.remove('open');
  }

  function _buildEnfPanelHtml(fhirType) {
    const FHIR_VERSION = 'R4';
    const data = EnforcementMapper.lookup(fhirType);

    let html = `<div class="enf-resource-title">&#x1F3E5; ${esc(fhirType)}</div>`;
    //html += `<a class="enf-fhir-link" href="https://hl7.org/fhir/${FHIR_VERSION}/${fhirType.toLowerCase()}.html" target="_blank" rel="noopener">`;
    html += `<a class="enf-fhir-link" href="https://hl7.org/fhir/${esc(fhirType.toLowerCase())}.html" target="_blank" rel="noopener">`;
    html += `&#x1F517; FHIR ${FHIR_VERSION} Spezifikation &rarr;</a>`;

    if (!data) {
      html += `<p style="color:#9e9e9e;font-size:13px">Kein Enforcement-Eintrag f&uuml;r diese Ressource.</p>`;
      return html;
    }

    const ac = data.primaryControl;
    if (ac === 'public') {
      html += `<span class="enf-badge public">&#x1F310; Public</span>`;
      html += `<div class="enf-public-msg">&#x1F310; &Ouml;ffentlich zug&auml;nglich &mdash; keine Policy-Einschr&auml;nkung</div>`;
    } else if (ac.endsWith('*')) {
      html += `<span class="enf-badge enforced-special">&#x26A0; Policy Enforced*</span>`;
    } else {
      html += `<span class="enf-badge enforced">&#x1F512; Policy Enforced</span>`;
    }

    if (data.entries.length > 0) {
      html += `<div class="enf-section-label">Enforcement-Attribute</div>`;
      html += `<table class="enf-table"><thead><tr>`;
      html += `<th>Suchparameter</th><th>FHIR-Pfad</th><th>XACML-Attribut</th>`;
      html += `</tr></thead><tbody>`;

      const spLabels = [];
      for (const e of data.entries) {
        const xacmlLabel = _resolveXacmlLabel(e.xacml);
        const isSpecial  = e.access.endsWith('*');
        html += `<tr>`;
        html += `<td class="sp-cell">${esc(e.sp)}${isSpecial ? '<span class="comment-cell">*</span>' : ''}</td>`;
        html += `<td class="path-cell">${esc(e.enf)}</td>`;
        html += `<td class="xacml-cell">${esc(xacmlLabel)}</td>`;
        html += `</tr>`;
        if (e.comm) {
          html += `<tr><td colspan="3" class="comment-cell" style="padding-top:0">${esc(e.comm)}</td></tr>`;
        }
        if (!spLabels.includes(e.sp) && e.sp) spLabels.push(e.sp);
      }

      html += `</tbody></table>`;

      // Summary
      html += `<div class="enf-summary-box">`;
      html += `<strong>${data.entries.length} Attribute kontrolliert:</strong> `;
      html += spLabels.slice(0, 6).map(s => esc(s)).join(', ');
      if (spLabels.length > 6) html += `, (+${spLabels.length - 6} weitere)`;
      html += `</div>`;
    }

    return html;
  }

  function _resolveXacmlLabel(xacmlUri) {
    if (!xacmlUri) return '—';
    const e = LabelMapper.lookup(xacmlUri);
    return e ? e.label : xacmlUri;
  }

  // ── Schema Validator ──

  let _valFileText = '';
  let _valFileName = '';

  function triggerValFile() { document.getElementById('val-input').click(); }

  async function loadValFile(input) {
    const file = input.files[0];
    if (!file) return;
    if (!_checkFile(file, ALLOWED_XML_EXT, MAX_XML_SIZE)) { input.value = ''; return; }
    _valFileName = file.name;
    _valFileText = await file.text();
    _runValidator();
    input.value = '';
  }

  function handleValDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!_checkFile(file, ALLOWED_XML_EXT, MAX_XML_SIZE)) return;
    _valFileName = file.name;
    file.text().then(text => { _valFileText = text; _runValidator(); });
  }

  function _runValidator() {
    const result = XACMLValidator.validate(_valFileText, _valFileName);
    document.getElementById('val-result').innerHTML = _buildValidatorReport(result);
    // Hide dropzone while showing result, allow re-upload
    document.getElementById('val-drop').style.display = 'none';
  }

  function resetValidator() {
    _valFileText = '';
    _valFileName = '';
    document.getElementById('val-drop').style.display = '';
    document.getElementById('val-result').innerHTML = '';
  }

  function visualizeFromValidator() {
    if (!_valFileText) return;
    try {
      const policy = XACMLParser.parse(_valFileText, _valFileName);
      const idx    = UIState.addOrReplace(policy);
      switchTab('viz');
      activatePolicy(idx);
    } catch (e) {
      alert('Fehler beim Laden: ' + e.message);
    }
  }

  function _buildValidatorReport(result) {
    const { errors, warnings, info } = result;
    const hasErrors   = errors.length > 0;
    const hasWarnings = warnings.length > 0;

    let html = `<div class="val-result">`;

    // Banner
    if (hasErrors) {
      html += `<div class="val-banner error"><span class="val-banner-ico">&#x274C;</span>`;
      html += `<span>${errors.length} Fehler gefunden &mdash; Policy ist nicht valide</span></div>`;
    } else if (hasWarnings) {
      html += `<div class="val-banner warn"><span class="val-banner-ico">&#x26A0;&#xFE0F;</span>`;
      html += `<span>Valide mit ${warnings.length} Warnung${warnings.length > 1 ? 'en' : ''}</span></div>`;
    } else {
      html += `<div class="val-banner ok"><span class="val-banner-ico">&#x2705;</span>`;
      html += `<span>Valide &mdash; keine Fehler gefunden</span></div>`;
    }

    // Prüfungen section
    const checks = [
      { label: 'XML wohlgeformt',             ok: !hasErrors || errors.every(e => !e.includes('valides XML')), detail: '' },
      { label: `XACML-Namespace ${info.version ? '(' + info.version + ')' : ''}`, ok: !!info.version, detail: !info.version ? 'Kein XACML-Namespace erkannt' : '' },
      { label: `Wurzelelement (${info.rootElement || '?'})`, ok: !!info.rootElement, detail: '' },
      { label: 'Rules haben Effect',          ok: !errors.some(e => e.includes('Effect')), detail: errors.filter(e => e.includes('Effect')).join('; ') },
      { label: 'Policies haben CombiningAlgId', ok: !errors.some(e => e.includes('CombiningAlgId')), detail: '' },
      { label: 'Designatoren vollständig',    ok: !errors.some(e => e.includes('Designator')), detail: '' },
    ];

    html += `<div class="val-section">`;
    html += `<div class="val-section-title">&#x1F50D; Pr&uuml;fergebnisse</div>`;
    for (const c of checks) {
      const cls = c.ok ? 'ok' : 'err';
      html += `<div class="val-check ${cls}"><span class="val-check-ico"></span>`;
      html += `<span>${esc(c.label)}${c.detail ? ` &mdash; <em>${esc(c.detail)}</em>` : ''}</span></div>`;
    }
    // Warnings
    for (const w of warnings) {
      html += `<div class="val-check warn"><span class="val-check-ico"></span><span>${esc(w)}</span></div>`;
    }
    // Extra errors not mapped above
    for (const e of errors) {
      if (!checks.some(c => !c.ok && c.detail && e.includes(c.detail))) {
        html += `<div class="val-check err"><span class="val-check-ico"></span><span>${esc(e)}</span></div>`;
      }
    }
    html += `</div>`;

    // Strukturübersicht
    if (info.ruleCount !== undefined) {
      html += `<div class="val-section">`;
      html += `<div class="val-section-title">&#x1F4CA; Struktur&uuml;bersicht</div>`;
      html += `<div class="val-info-grid">`;
      html += `<div class="val-info-cell"><div class="val-info-key">Datei</div><div class="val-info-val" style="font-size:12px">${esc(info.filename || '')}</div></div>`;
      html += `<div class="val-info-cell"><div class="val-info-key">XACML-Version</div><div class="val-info-val">${esc(info.version || '?')}</div></div>`;
      html += `<div class="val-info-cell"><div class="val-info-key">Regeln gesamt</div><div class="val-info-val">${info.ruleCount}</div></div>`;
      html += `<div class="val-info-cell"><div class="val-info-key">Permit / Deny</div><div class="val-info-val" style="color:#2e7d32">${info.permitCount}P <span style="color:#c62828">/ ${info.denyCount}D</span></div></div>`;
      html += `</div>`;
      if ((info.policyIds || []).length > 0) {
        html += `<div class="val-section-label" style="margin-top:10px">PolicyIds</div>`;
        html += `<div class="val-id-list">${info.policyIds.map(esc).join('<br>')}</div>`;
      }
      html += `</div>`;
    }

    // "Jetzt visualisieren" button
    if (!hasErrors) {
      html += `<button class="val-viz-btn" onclick="App.visualizeFromValidator()">`;
      html += `&#x1F4CA; Policy jetzt visualisieren &rarr;</button>`;
    }

    // Re-upload button
    html += `<button class="ctrl-btn" style="margin-top:10px;display:block" onclick="App.resetValidator()">`;
    html += `&#x1F504; Neue Datei pr&uuml;fen</button>`;

    html += `</div>`;
    return html;
  }

  // ── Import Modal ──

  function parseAndValidateXml(xmlString, filename) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      const text = parseError.textContent;
      const lineMatch = text.match(/line[^\d]*(\d+)/i);
      const line = lineMatch ? lineMatch[1] : '?';
      return { success: false, error: `Zeile ${line}: XML ist fehlerhaft. Bitte Syntax pr\u00fcfen.` };
    }
    return { success: true, doc, filename };
  }

  function _renderEmptyState() {
    document.getElementById('content').innerHTML =
      `<div class="empty-state">`
      + `<div class="icon">&#x1F4C2;</div>`
      + `<p>Noch keine Policy geladen</p>`
      + `<button class="import-trigger-btn" onclick="App.openImportModal()">+ Policy importieren</button>`
      + `</div>`;
  }

  function _showToast(message) {
    const toast = document.getElementById('import-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  let _modalEscHandler = null;

  function openImportModal() {
    document.getElementById('import-overlay').classList.add('open');
    _modalEscHandler = (e) => { if (e.key === 'Escape') _closeModalInternal(); };
    document.addEventListener('keydown', _modalEscHandler);
  }

  function closeImportModal() {
    _closeModalInternal();
  }

  function _closeModalInternal() {
    document.getElementById('import-overlay').classList.remove('open');
    if (_modalEscHandler) {
      document.removeEventListener('keydown', _modalEscHandler);
      _modalEscHandler = null;
    }
    ['import-file-error', 'import-paste-error'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
  }

  function switchImportTab(tab) {
    document.getElementById('mtab-file').classList.toggle('active', tab === 'file');
    document.getElementById('mtab-paste').classList.toggle('active', tab === 'paste');
    document.getElementById('mtab-file-body').style.display = tab === 'file' ? '' : 'none';
    document.getElementById('mtab-paste-body').style.display = tab === 'paste' ? '' : 'none';
  }

  function importDragOver(event) {
    event.preventDefault();
    document.getElementById('import-drop').classList.add('drag-over');
  }

  function importDragLeave(event) {
    document.getElementById('import-drop').classList.remove('drag-over');
  }

  function importDrop(event) {
    event.preventDefault();
    document.getElementById('import-drop').classList.remove('drag-over');
    _importFiles(Array.from(event.dataTransfer.files));
  }

  async function importFromFiles(input) {
    const files = Array.from(input.files);
    input.value = '';
    await _importFiles(files);
  }

  async function _importFiles(files) {
    const errEl = document.getElementById('import-file-error');
    errEl.style.display = 'none';
    errEl.textContent = '';

    const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (!xmlFiles.length) {
      errEl.textContent = 'Keine XML-Datei gefunden. Bitte eine .xml-Datei w\u00e4hlen.';
      errEl.style.display = 'block';
      return;
    }

    const oversized = xmlFiles.filter(f => f.size > MAX_XML_SIZE);
    const toLoad    = xmlFiles.filter(f => f.size <= MAX_XML_SIZE);
    const errors    = [];
    let loadedCount = 0;
    let firstIdx    = -1;

    for (const file of toLoad) {
      try {
        const text       = await file.text();
        const validation = parseAndValidateXml(text, file.name);
        if (!validation.success) { errors.push(`${file.name}: ${validation.error}`); continue; }
        const policy = XACMLParser.parse(text, file.name);
        policy.rawXml = text;
        const idx    = UIState.addOrReplace(policy);
        if (firstIdx < 0) firstIdx = idx;
        loadedCount++;
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    oversized.forEach(f => errors.push(`${f.name}: Datei zu gro\u00df (max. ${MAX_XML_SIZE / 1024 / 1024} MB)`));

    if (!loadedCount) {
      errEl.textContent = errors.join('\n');
      errEl.style.display = 'block';
      return;
    }

    _closeModalInternal();
    refreshSidebar();
    if (firstIdx >= 0) activatePolicy(firstIdx);

    const msg = loadedCount === 1
      ? `\u201e${toLoad[0].name}\u201c wurde erfolgreich geladen.`
      : `${loadedCount} Policies erfolgreich geladen.`;
    _showToast(msg);

    if (errors.length) setTimeout(() => alert('Fehler beim Laden:\n' + errors.join('\n')), 100);
  }

  async function importFromPaste() {
    const textarea = document.getElementById('import-textarea');
    const errEl    = document.getElementById('import-paste-error');
    errEl.style.display = 'none';
    errEl.textContent   = '';

    const text = textarea.value.trim();
    if (!text) {
      errEl.textContent = 'Bitte XML-Inhalt eingeben.';
      errEl.style.display = 'block';
      return;
    }

    const validation = parseAndValidateXml(text, 'paste.xml');
    if (!validation.success) {
      errEl.textContent = validation.error;
      errEl.style.display = 'block';
      return;
    }

    try {
      const policy = XACMLParser.parse(text, 'paste.xml');
      policy.rawXml = text;
      const idx    = UIState.addOrReplace(policy);
      _closeModalInternal();
      textarea.value = '';
      refreshSidebar();
      activatePolicy(idx);
      _showToast(`\u201e${policy.filename || 'Policy'}\u201c wurde erfolgreich geladen.`);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  }

  // ── XML Editor ──

  const editorState = {
    mode: 'edit',
    policyId: null,
    originalXml: '',
    isDirty: false,
  };

  let editor = null;
  let _editorInitialized = false;

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  const editorGetValue = () => editor ? editor.getValue() : '';
  const editorSetValue = (xml) => { if (!editor) return; editor.setValue(xml); editor.clearHistory(); };

  function _initEditor() {
    if (_editorInitialized) return;
    _editorInitialized = true;
    editor = CodeMirror.fromTextArea(document.getElementById('xmlEditorTextarea'), {
      mode: 'xml',
      lineNumbers: true,
      lineWrapping: false,
      theme: 'default',
      tabSize: 2,
      indentWithTabs: false,
      autofocus: false,
      extraKeys: { 'Tab': (cm) => cm.replaceSelection('  ') }
    });
    editor.setSize('100%', '100%');
    editor.on('change', debounce(() => {
      const current = editorGetValue();
      editorState.isDirty = current !== editorState.originalXml;
      updateDirtyIndicator();
      validateXmlInline(current);
    }, 500));
  }

  function switchContentTab(tab) {
    const content     = document.getElementById('content');
    const editorPanel = document.getElementById('editor-panel');
    document.getElementById('ctab-viz').classList.toggle('active',    tab === 'viz');
    document.getElementById('ctab-editor').classList.toggle('active', tab === 'xml-editor');
    if (tab === 'xml-editor') {
      content.style.display     = 'none';
      editorPanel.style.display = 'flex';
      _initEditor();
      const active = UIState.getActive();
      if (active && active.rawXml && !editorState.isDirty && editorState.policyId !== active.filename) {
        editorState.policyId    = active.filename;
        editorState.originalXml = active.rawXml;
        editorState.isDirty     = false;
        editorState.mode        = 'edit';
        setTimeout(() => {
          editorSetValue(active.rawXml);
          updateDirtyIndicator();
          validateXmlInline(active.rawXml);
          editor && editor.refresh();
        }, 0);
      } else {
        setTimeout(() => editor && editor.refresh(), 0);
      }
    } else {
      content.style.display     = '';
      editorPanel.style.display = 'none';
    }
  }

  function updateDirtyIndicator() {
    const el = document.getElementById('editorDirtyIndicator');
    if (el) el.style.display = editorState.isDirty ? 'inline' : 'none';
  }

  function validateXmlInline(xmlString) {
    const statusEl = document.getElementById('editorValidationStatus');
    if (!statusEl) return;
    if (!xmlString.trim()) { statusEl.textContent = ''; return; }
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlString, 'application/xml');
    const err    = doc.querySelector('parsererror');
    if (err) {
      const line = (err.textContent.match(/line[^\d]*(\d+)/i) || [])[1] || '?';
      statusEl.textContent = `\u274C Zeile ${line}: XML ist fehlerhaft`;
      statusEl.style.color = '#ef4444';
    } else {
      statusEl.textContent = '\u2705 G\u00fcltiges XML';
      statusEl.style.color = '#22c55e';
    }
  }

  function showEditorError(msg) {
    const el = document.getElementById('editorErrorMsg');
    if (el) { el.textContent = msg; el.style.display = 'inline'; }
  }

  function hideEditorError() {
    const el = document.getElementById('editorErrorMsg');
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  }

  function beautifyXml(xmlString) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlString, 'application/xml');
    if (doc.querySelector('parsererror')) return null;
    return formatNode(doc.documentElement, 0);
  }

  function formatNode(node, depth) {
    const pad = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      return t ? pad + t : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag      = node.tagName;
    const attrs    = Array.from(node.attributes).map(a => ` ${a.name}="${a.value}"`).join('');
    const children = Array.from(node.childNodes)
      .map(c => formatNode(c, depth + 1)).filter(s => s.trim());
    if (!children.length) return `${pad}<${tag}${attrs}/>`;
    if (children.length === 1 && !children[0].includes('\n'))
      return `${pad}<${tag}${attrs}>${children[0].trim()}</${tag}>`;
    return `${pad}<${tag}${attrs}>\n${children.join('\n')}\n${pad}</${tag}>`;
  }

  function handleBeautify() {
    const result = beautifyXml(editorGetValue());
    if (!result) { showEditorError('XML ist fehlerhaft \u2013 Beautify nicht m\u00f6glich.'); return; }
    hideEditorError();
    editorSetValue(result);
  }

  function handleDownload() {
    const content  = editorGetValue();
    const ts       = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `xacml-policy_${ts}.xml`;
    const blob     = new Blob([content], { type: 'application/xml' });
    const a        = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    editorState.originalXml = content;
    editorState.isDirty     = false;
    updateDirtyIndicator();
  }

  function handleReset() {
    document.getElementById('editorResetConfirm').style.display = 'flex';
  }

  function confirmReset() {
    editorSetValue(editorState.originalXml);
    editorState.isDirty = false;
    updateDirtyIndicator();
    validateXmlInline(editorState.originalXml);
    hideEditorError();
    document.getElementById('editorResetConfirm').style.display = 'none';
  }

  function cancelReset() {
    document.getElementById('editorResetConfirm').style.display = 'none';
  }

  function handleEditorUpdate() {
    const xml        = editorGetValue();
    const validation = parseAndValidateXml(xml, editorState.policyId || 'editor');
    if (!validation.success) { showEditorError(validation.error); return; }
    hideEditorError();
    try {
      const fname  = editorState.policyId || 'edited-policy.xml';
      const policy = XACMLParser.parse(xml, fname);
      policy.rawXml = xml;
      const idx    = UIState.addOrReplace(policy);
      switchContentTab('viz');
      activatePolicy(idx);
    } catch (e) {
      showEditorError('Fehler beim Rendern: ' + e.message);
    }
  }

  function loadPolicyIntoEditor(policyId, xmlContent) {
    editorState.policyId     = policyId;
    editorState.originalXml  = xmlContent;
    editorState.isDirty      = false;
    editorState.mode         = 'edit';
    switchContentTab('xml-editor');
    editorSetValue(xmlContent);
    updateDirtyIndicator();
    validateXmlInline(xmlContent);
  }

  // beforeunload guard
  window.addEventListener('beforeunload', (e) => {
    if (editorState.isDirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── Dark / Light Mode ──

  let _theme = 'light';

  function _applyTheme(theme) {
    _theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    sessionStorage.setItem('xacml-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent    = theme === 'dark' ? '\uD83C\uDF19' : '\u2600\uFE0F';
      btn.setAttribute('aria-label',
        'Design: ' + (theme === 'dark' ? 'Dunkel (wechseln zu Hell)' : 'Hell (wechseln zu Dunkel)')
      );
    }
  }

  function toggleTheme() {
    _applyTheme(_theme === 'dark' ? 'light' : 'dark');
  }

  // Init theme from sessionStorage or system preference
  (function initTheme() {
    const saved      = sessionStorage.getItem('xacml-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    _applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  })();

  return {
    triggerCSV, loadCSV, activatePolicy, applySearch, clearSearch, setFilter,
    clearPolicies,
    triggerEnforcement, loadEnforcement, openEnfPanel, closeEnfPanel, switchTab,
    loadValFile, handleValDrop, visualizeFromValidator, resetValidator,
    toggleTheme,
    openImportModal, closeImportModal, switchImportTab,
    importDragOver, importDragLeave, importDrop, importFromFiles, importFromPaste,
    switchContentTab, handleEditorUpdate, handleBeautify, handleDownload,
    handleReset, confirmReset, cancelReset, loadPolicyIntoEditor,
    handlePolicyEdit, handlePolicyDelete, confirmPolicyDelete, cancelPolicyDelete
  };
})();

// ── Expose to window for inline event handlers in HTML ──
window.App = App;
window.TreeRenderer = TreeRenderer;

// ── Handle URL hash on initial load (e.g. shared guide anchor links) ──
(function handleInitialHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  // Switch to guide tab, wait for markdown to load, then scroll to anchor
  App.switchTab('guide').then(() => {
    setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 100);
  });
})();
