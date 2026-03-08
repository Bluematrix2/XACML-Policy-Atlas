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
  function triggerXML() { document.getElementById('xml-input').click(); }

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
      + `<input class="search-input" id="s-input" type="text" value="${sv}"`
      + ` placeholder="&#x1F50D; Suchen (Beschreibung, Label, URI...)" oninput="App.applySearch(this.value)">`
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

  function refreshSidebar() {
    const list     = document.getElementById('sidebar-list');
    const policies = UIState.getAll();
    const active   = UIState.getActive();

    if (!policies.length) {
      list.innerHTML = '<div class="sb-empty">Noch keine Dateien geladen</div>';
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

      return `<div class="sb-item${isActive ? ' active' : ''}" onclick="App.activatePolicy(${i})" title="${esc(p.filename)}">`
           + `<div class="sb-name">${esc(shortName)}</div>`
           + `<div class="sb-meta">${total} Regel${total !== 1 ? 'n' : ''} &middot; ${permitCount}P&thinsp;/&thinsp;${denyCount}D</div>`
           + `<div class="sb-bar">`
           + `<div class="sb-permit" style="width:${pPct}%"></div>`
           + `<div class="sb-deny" style="width:${dPct}%"></div>`
           + `</div></div>`;
    }).join('');
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
    triggerCSV, triggerXML, loadCSV, loadXMLs, activatePolicy, applySearch, setFilter,
    triggerEnforcement, loadEnforcement, openEnfPanel, closeEnfPanel, switchTab,
    loadValFile, handleValDrop, visualizeFromValidator, resetValidator,
    toggleTheme
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
