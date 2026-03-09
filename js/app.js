'use strict';

// ================================================================
//  APP — main entry point
// ================================================================

import { XACMLParser, esc } from './parser.js';
import { CSVParser, LabelMapper, EnforcementMapper } from './mappers.js';
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

  // ── Validation Engine (single interface for all XML/XACML validation) ──

  const _XACML_NAMESPACES = [
    'urn:oasis:names:tc:xacml:3.0:core:schema:wd-17',
    'urn:oasis:names:tc:xacml:2.0:policy:schema:os'
  ];

  function extractReadableError(parserErrorText) {
    return parserErrorText
      .replace(/error on line \d+ at column \d+:/i, '')
      .replace(/Below is a rendering of the page up to the first error\./i, '')
      .trim()
      .split('\n')[0]
      .trim();
  }

  // Known XACML DataTypes (short and full URIs)
  const _XACML_DATATYPES = new Set([
    'string','boolean','integer','double','date','time','dateTime','anyURI',
    'hexBinary','base64Binary','dayTimeDuration','yearMonthDuration',
    'http://www.w3.org/2001/XMLSchema#string',
    'http://www.w3.org/2001/XMLSchema#boolean',
    'http://www.w3.org/2001/XMLSchema#integer',
    'http://www.w3.org/2001/XMLSchema#double',
    'http://www.w3.org/2001/XMLSchema#date',
    'http://www.w3.org/2001/XMLSchema#time',
    'http://www.w3.org/2001/XMLSchema#dateTime',
    'http://www.w3.org/2001/XMLSchema#anyURI',
    'http://www.w3.org/2001/XMLSchema#hexBinary',
    'http://www.w3.org/2001/XMLSchema#base64Binary',
    'http://www.w3.org/2001/XMLSchema#dayTimeDuration',
    'http://www.w3.org/2001/XMLSchema#yearMonthDuration',
    'urn:oasis:names:tc:xacml:1.0:data-type:rfc822Name',
    'urn:oasis:names:tc:xacml:1.0:data-type:x500Name',
    'urn:oasis:names:tc:xacml:2.0:data-type:ipAddress',
    'urn:oasis:names:tc:xacml:2.0:data-type:dnsName',
  ]);

  // Known XACML element local names
  const _XACML_ELEMENTS = new Set([
    'Policy','PolicySet','Rule','Target','Condition','Apply','Function',
    'AttributeValue','AttributeDesignator','AttributeSelector',
    'SubjectAttributeDesignator','ResourceAttributeDesignator',
    'ActionAttributeDesignator','EnvironmentAttributeDesignator',
    'Description','PolicyIssuer','PolicyDefaults',
    'Subjects','Subject','SubjectMatch',
    'Resources','Resource','ResourceMatch',
    'Actions','Action','ActionMatch',
    'Environments','Environment','EnvironmentMatch',
    'Obligations','ObligationExpressions','Obligation','ObligationExpression',
    'AttributeAssignment','AttributeAssignmentExpression',
    'PolicySetIdReference','PolicyIdReference',
    'VariableDefinition','VariableReference',
    'AnyOf','AllOf','Match',
    'Request','Response','Result','Decision','Status','StatusCode','StatusMessage',
  ]);

  function _getPolicyNestingDepth(el, depth) {
    let max = depth;
    for (const child of el.children) {
      if (child.localName === 'PolicySet') {
        max = Math.max(max, _getPolicyNestingDepth(child, depth + 1));
      }
    }
    return max;
  }

  function validatePolicy(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const parseError = doc.querySelector('parsererror');

    if (parseError) {
      const text = parseError.textContent;
      const lineMatch = text.match(/line[^\d]*(\d+)/i);
      const msg = extractReadableError(text);
      return {
        valid: false,
        errors: [{ line: lineMatch ? parseInt(lineMatch[1]) : null, message: msg }],
        warnings: [],
        checks: [
          { label: 'XML ist syntaktisch korrekt',                      ok: false, detail: msg },
          { label: 'Gültiger XACML Namespace (2.0 oder 3.0)',          ok: false, detail: '' },
          { label: 'Wurzelelement ist Policy oder PolicySet',           ok: false, detail: '' },
          { label: 'Alle Rules besitzen ein Effect (Permit/Deny)',      ok: false, detail: '' },
          { label: 'Policies besitzen einen Combining Algorithm',       ok: false, detail: '' },
          { label: 'Designatoren enthalten AttributeId und DataType',   ok: false, detail: '' },
          { label: 'Policy oder Rules definieren ein Target',           ok: false, detail: '' },
          { label: 'Policies enthalten Rules',                          ok: false, detail: '' },
          { label: 'Policy- und Rule-IDs sind eindeutig',               ok: false, detail: '' },
        ],
        info: {}
      };
    }

    const errors   = [];
    const warnings = [];
    const info     = {};
    const root     = doc.documentElement;

    // ── Check 2: XACML Namespace ──
    const ns = root.namespaceURI || '';
    const nsOk = _XACML_NAMESPACES.includes(ns);
    if (nsOk) {
      info.namespace = ns;
      info.version   = ns.includes('3.0') ? 'XACML 3.0' : 'XACML 2.0';
    } else {
      errors.push({ line: 1, message: `Unbekannter XACML-Namespace: \u201e${ns}\u201c. Erwartet: XACML 3.0 oder 2.0.` });
    }

    // ── Check 3: Root element ──
    const rootName = root.localName;
    const rootOk   = rootName === 'Policy' || rootName === 'PolicySet';
    if (rootOk) {
      info.rootElement = rootName;
      info.policyId    = root.getAttribute('PolicyId') || '(keine ID)';
    } else {
      errors.push({ line: null, message: `Wurzelelement ist <${rootName}>, erwartet <Policy> oder <PolicySet>` });
    }

    const allEls    = Array.from(doc.getElementsByTagName('*'));
    const policyEls = allEls.filter(e => e.localName === 'Policy' || e.localName === 'PolicySet');
    const ruleEls   = allEls.filter(e => e.localName === 'Rule');

    // ── Check 4: CombiningAlgId ──
    const missingAlg = [];
    for (const p of policyEls) {
      if (!p.getAttribute('RuleCombiningAlgId') && !p.getAttribute('PolicyCombiningAlgId')) {
        missingAlg.push((p.getAttribute('PolicyId') || '(unbekannt)').split(':').pop());
      }
    }
    if (missingAlg.length) errors.push({ line: null, message: `Kein Combining Algorithm bei: ${missingAlg.join(', ')}` });

    // ── Check 5: Rules Effect ──
    info.ruleCount   = ruleEls.length;
    info.permitCount = 0;
    info.denyCount   = 0;
    const badEffect  = [];
    for (const r of ruleEls) {
      const eff = r.getAttribute('Effect') || '';
      if (eff === 'Permit') { info.permitCount++; }
      else if (eff === 'Deny') { info.denyCount++; }
      else { badEffect.push((r.getAttribute('RuleId') || '').split(':').pop() || '(unbekannt)'); }
    }
    if (badEffect.length) errors.push({ line: null, message: `Rule ohne g\u00fcltiges Effect: ${badEffect.join(', ')}` });

    // ── Check 6: Designators ──
    let badDesig = 0;
    const desigNames = new Set();
    for (const el of allEls) {
      if (el.localName.includes('Designator') && (!el.getAttribute('AttributeId') || !el.getAttribute('DataType'))) {
        desigNames.add(el.localName);
        if (++badDesig >= 3) break;
      }
    }
    if (desigNames.size) errors.push({ line: null, message: `Designatoren enthalten kein AttributeId oder DataType: ${[...desigNames].join(', ')}` });

    // ── Check 7: Target defined ──
    const targetEls  = allEls.filter(e => e.localName === 'Target');
    const hasTargets = targetEls.length > 0;
    if (!hasTargets) warnings.push('Keine Targets definiert \u2014 Policy gilt f\u00fcr alle Requests');

    // ── Check 8: Policies contain Rules ──
    const emptyPolicies = policyEls
      .filter(p => p.localName === 'Policy' && !Array.from(p.children).some(c => c.localName === 'Rule'))
      .map(p => (p.getAttribute('PolicyId') || '?').split(':').pop());
    if (emptyPolicies.length) warnings.push(`Policy ohne Rules: ${emptyPolicies.join(', ')}`);

    // ── Check 9: Unique IDs ──
    const idSet = new Set();
    const duplicateIds = [];
    for (const el of allEls) {
      const id = el.getAttribute('PolicyId') || el.getAttribute('RuleId');
      if (!id) continue;
      if (idSet.has(id)) { if (!duplicateIds.includes(id)) duplicateIds.push(id); }
      else idSet.add(id);
    }
    if (duplicateIds.length) errors.push({ line: null, message: `Doppelte IDs: ${duplicateIds.map(i => i.split(':').pop()).join(', ')}` });

    info.policyIds = policyEls.map(p => p.getAttribute('PolicyId')).filter(Boolean);

    // ════════════════════════════════════════════════════
    // Extended Linter Checks (10–24) → warnings
    // ════════════════════════════════════════════════════

    // Check 10: PolicySet contains Policies
    const emptySets = policyEls
      .filter(p => p.localName === 'PolicySet' && !Array.from(p.children).some(c => c.localName === 'Policy' || c.localName === 'PolicySet'))
      .map(p => (p.getAttribute('PolicyId') || '?').split(':').pop());
    if (emptySets.length) warnings.push(`PolicySet ohne Policy-Kinder: ${emptySets.join(', ')}`);

    // Check 11: Empty Target elements
    const emptyTargets = targetEls.filter(t => t.children.length === 0);
    if (emptyTargets.length) warnings.push(`${emptyTargets.length} leere(s) <Target/>-Element(e) gefunden \u2014 Policy gilt uneingeschr\u00e4nkt`);

    // Check 12 & 13 & 14: Rules without Condition / Permit-all / Deny-all
    let noCondCount    = 0;
    let permitAllCount = 0;
    let denyAllCount   = 0;
    for (const r of ruleEls) {
      const hasCondition = Array.from(r.children).some(c => c.localName === 'Condition');
      const hasTarget    = Array.from(r.children).some(c => c.localName === 'Target');
      const effect       = r.getAttribute('Effect') || '';
      if (!hasCondition) {
        noCondCount++;
        if (!hasTarget) {
          if (effect === 'Permit') permitAllCount++;
          else if (effect === 'Deny')   denyAllCount++;
        }
      }
    }
    if (noCondCount)    warnings.push(`${noCondCount} Rule(s) ohne Condition \u2014 greifen bei jedem passenden Request`);
    if (permitAllCount) warnings.push(`${permitAllCount} unbedingte Permit-Rule(s) ohne Target/Condition \u2014 m\u00f6glicherweise zu weite Rechte`);
    if (denyAllCount)   warnings.push(`${denyAllCount} unbedingte Deny-Rule(s) ohne Target/Condition \u2014 k\u00f6nnte Zugriff vollst\u00e4ndig sperren`);

    // Check 15: Overlapping Rules (heuristic: multiple rules without Target in same Policy)
    for (const p of policyEls) {
      if (p.localName !== 'Policy') continue;
      const rules = Array.from(p.children).filter(c => c.localName === 'Rule');
      const noTargetRules = rules.filter(r => !Array.from(r.children).some(c => c.localName === 'Target'));
      if (noTargetRules.length > 1) {
        const pid = (p.getAttribute('PolicyId') || '?').split(':').pop();
        warnings.push(`Policy \u201e${pid}\u201c: ${noTargetRules.length} Rules ohne eigenes Target \u2014 m\u00f6gliche \u00dcberschneidungen`);
        break;
      }
    }

    // Check 16: Unreachable Rules (permit-overrides: unconditional Permit blocks subsequent rules)
    for (const p of policyEls) {
      if (p.localName !== 'Policy') continue;
      const alg = (p.getAttribute('RuleCombiningAlgId') || '').toLowerCase();
      if (!alg.includes('permit-overrides')) continue;
      const rules = Array.from(p.children).filter(c => c.localName === 'Rule');
      let foundUnconditionalPermit = false;
      let unreachableCount = 0;
      for (const r of rules) {
        if (foundUnconditionalPermit) { unreachableCount++; continue; }
        const hasCond   = Array.from(r.children).some(c => c.localName === 'Condition');
        const hasTarget = Array.from(r.children).some(c => c.localName === 'Target');
        if (r.getAttribute('Effect') === 'Permit' && !hasCond && !hasTarget) foundUnconditionalPermit = true;
      }
      if (unreachableCount > 0) {
        const pid = (p.getAttribute('PolicyId') || '?').split(':').pop();
        warnings.push(`Policy \u201e${pid}\u201c (permit-overrides): ${unreachableCount} Rule(s) nach unbedingtem Permit nicht erreichbar`);
      }
    }

    // Check 17: Missing Description (Rules)
    for (const r of ruleEls) {
      if (!Array.from(r.children).some(c => c.localName === 'Description')) {
        const rid = (r.getAttribute('RuleId') || '').split(':').pop().slice(-20) || '?';
        warnings.push(`Rule \u201e${rid}\u201c hat keine Description`);
      }
    }

    // Check 18: AttributeId format inconsistency
    const attrIds = allEls
      .filter(e => e.hasAttribute('AttributeId'))
      .map(e => e.getAttribute('AttributeId'));
    const hasUri  = attrIds.some(id => id.startsWith('urn:') || id.startsWith('http'));
    const hasDot  = attrIds.some(id => !id.includes(':') && !id.includes('/') && id.includes('.'));
    if (hasUri && hasDot) warnings.push('Inkonsistente AttributeId-Formate: Mischung aus URI und Kurzform gefunden');

    // Check 19: Unsupported DataType
    const badDtSet = new Set();
    for (const el of allEls) {
      const dt = el.getAttribute('DataType');
      if (dt && !_XACML_DATATYPES.has(dt)) badDtSet.add(dt);
    }
    if (badDtSet.size) warnings.push(`Nicht-standardisierte DataTypes: ${[...badDtSet].map(d => d.split(/[:#/]/).pop()).join(', ')}`);

    // Check 20: Unknown XACML elements (in XACML namespace, not in known set)
    const unknownEls = new Set();
    for (const el of allEls) {
      const elNs = el.namespaceURI || '';
      if ((elNs.includes('xacml') || elNs === ns) && !_XACML_ELEMENTS.has(el.localName)) {
        unknownEls.add(el.localName);
      }
    }
    if (unknownEls.size) warnings.push(`Unbekannte XACML-Elemente: ${[...unknownEls].join(', ')}`);

    // Check 21: Excessively deep PolicySet nesting
    const maxDepth = _getPolicyNestingDepth(root, root.localName === 'PolicySet' ? 1 : 0);
    if (maxDepth > 3) warnings.push(`PolicySet-Verschachtelung zu tief (${maxDepth} Ebenen) \u2014 kann PDP-Performance beeintr\u00e4chtigen`);

    // Check 22: Missing PolicyId
    const noPolicyId = policyEls.filter(p => !p.getAttribute('PolicyId'));
    if (noPolicyId.length) warnings.push(`${noPolicyId.length} Policy/PolicySet-Element(e) ohne PolicyId`);

    // Check 23: Missing RuleId
    const noRuleId = ruleEls.filter(r => !r.getAttribute('RuleId'));
    if (noRuleId.length) warnings.push(`${noRuleId.length} Rule(s) ohne RuleId`);

    // Check 24: Large Policy
    const LARGE_RULE_THRESHOLD = 20;
    if (ruleEls.length > LARGE_RULE_THRESHOLD) {
      warnings.push(`Policy sehr groß (${ruleEls.length} Rules) \u2014 kann Wartung und PDP-Performance erschweren`);
    }

    // ── Build checks array (core structural, checks 1–9) ──
    const checks = [
      { label: 'XML ist syntaktisch korrekt',
        ok: true, detail: '' },
      { label: `G\u00fcltiger XACML Namespace${info.version ? ` (${info.version})` : ' (2.0 oder 3.0)'}`,
        ok: nsOk, detail: nsOk ? '' : `Unbekannt: ${ns}` },
      { label: `Wurzelelement ist Policy oder PolicySet${rootOk ? ` (${info.rootElement})` : ''}`,
        ok: rootOk, detail: '' },
      { label: 'Alle Rules besitzen ein Effect (Permit/Deny)',
        ok: !badEffect.length, detail: badEffect.length ? `${badEffect.length} Rule(s) betroffen` : '' },
      { label: 'Policies besitzen einen Combining Algorithm',
        ok: !missingAlg.length, detail: missingAlg.length ? `${missingAlg.length} Policy(s) betroffen` : '' },
      { label: 'Designatoren enthalten AttributeId und DataType',
        ok: !desigNames.size, detail: desigNames.size ? [...desigNames].join(', ') : '' },
      { label: 'Policy oder Rules definieren ein Target',
        ok: hasTargets, detail: hasTargets ? '' : 'Keine Targets definiert' },
      { label: 'Policies enthalten Rules',
        ok: !emptyPolicies.length, detail: emptyPolicies.length ? emptyPolicies.join(', ') : '' },
      { label: 'Policy- und Rule-IDs sind eindeutig',
        ok: !duplicateIds.length, detail: duplicateIds.length ? duplicateIds.map(i => i.split(':').pop()).join(', ') : '' },
    ];

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks,
      info,
      namespace: info.namespace,
      version:   info.version
    };
  }

  const validationCache = new Map(); // policyId → { valid, errors, namespace, version, timestamp }

  function getOrComputeValidation(policyId, xmlString) {
    if (!validationCache.has(policyId)) {
      const result = validatePolicy(xmlString);
      validationCache.set(policyId, { ...result, timestamp: new Date().toISOString() });
    }
    return validationCache.get(policyId);
  }

  function invalidateValidationCache(policyId) {
    validationCache.delete(policyId);
  }

  function triggerCSV() { document.getElementById('csv-input').click(); }

  // ── Mapping Persistence ──

  const STORAGE_PREFIX = 'atlas_mapping_';

  function storageKey(filename) {
    return STORAGE_PREFIX + filename.replace(/[^a-zA-Z0-9_\-.]/g, '_');
  }

  function saveMappingToStorage(filename, csvContent) {
    const entry = {
      filename,
      loadedAt: new Date().toISOString(),
      sizeBytes: new Blob([csvContent]).size,
      data: csvContent
    };
    try {
      localStorage.setItem(storageKey(filename), JSON.stringify(entry));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        _showToast('Speicher voll \u2013 Mapping-Tabelle wurde nur tempor\u00e4r geladen.');
      }
      return false;
    }
  }

  function getAllStoredMappings() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .map(k => safeRestoreEntry(k))
      .filter(Boolean);
  }

  function safeRestoreEntry(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  function clearAllMappings() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    setMappingStatus('none');
    updateMappingTooltip();
    _showToast('Alle Mapping-Tabellen wurden entfernt.');
  }

  function setMappingStatus(state) {
    const dot = document.getElementById('mappingStatusDot');
    if (!dot) return;
    dot.dataset.state = state;
    if (state === 'loaded') {
      dot.classList.remove('pulse');
      void dot.offsetWidth; // Reflow erzwingen
      dot.classList.add('pulse');
    }
  }

  function updateMappingTooltip() {
    const stored = getAllStoredMappings();
    const btn = document.getElementById('csv-btn');
    if (!btn) return;
    if (!stored.length) {
      btn.title = 'Keine Mapping-Tabelle geladen';
      return;
    }
    btn.title = stored.map(e => {
      const date = new Date(e.loadedAt).toLocaleString('de-DE');
      const kb   = Math.round(e.sizeBytes / 1024);
      return `${e.filename} (${kb} KB, geladen: ${date})`;
    }).join('\n');
  }

  function loadMappingIntoApp(_filename, csvContent) {
    const entries = CSVParser.parse(csvContent);
    LabelMapper.load(entries);
    const active = UIState.getActive();
    if (active) showPolicy(active);
    refreshSidebar();
  }

  function onMappingFileLoaded(filename, csvContent) {
    const isUpdate = !!localStorage.getItem(storageKey(filename));
    loadMappingIntoApp(filename, csvContent);
    saveMappingToStorage(filename, csvContent);
    setMappingStatus('loaded');
    updateMappingTooltip();
    _showToast(isUpdate
      ? `\u201e${filename}\u201c wurde aktualisiert.`
      : `\u201e${filename}\u201c wurde erfolgreich geladen.`);
  }

  function restoreMappingsOnStartup() {
    const stored = getAllStoredMappings();
    if (!stored.length) return;
    stored.forEach(entry => loadMappingIntoApp(entry.filename, entry.data));
    const count = stored.length;
    _showToast(`${count} Mapping-${count === 1 ? 'Tabelle' : 'Tabellen'} wiederhergestellt.`);
    setMappingStatus('loaded');
    updateMappingTooltip();
  }

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
      const text = await file.text();
      onMappingFileLoaded(file.name, text);
    } catch (e) {
      setMappingStatus('error');
      _showToast('CSV-Fehler: ' + e.message);
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
    // Flush current editor dirty state before switching (beats 500ms debounce)
    if (_activeContentTab === 'xml-editor' && editor && editorState.policyId) {
      const current = editorGetValue();
      if (current !== editorState.originalXml) {
        _dirtyEdits.set(editorState.policyId, current);
      } else {
        _dirtyEdits.delete(editorState.policyId);
      }
    }
    UIState.setActive(idx);
    const policy = UIState.getActive();
    if (policy) showPolicy(policy);
    refreshSidebar();
    if (_activeContentTab === 'xml-editor' && policy && policy.rawXml) {
      loadPolicyIntoEditor(policy.filename, policy.rawXml);
    }
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

    if (policy.rawXml) renderValidationBadge(policy.filename);

    if (_currentSearch || _currentFilter !== 'all') {
      _applyFiltersAndSearch();
    }
  }

  function renderValidationBadge(policyId) {
    const summaryBox = document.querySelector('.summary-box');
    if (!summaryBox) return;
    const policy = UIState.getAll().find(p => p.filename === policyId);
    if (!policy || !policy.rawXml) return;

    const result   = getOrComputeValidation(policyId, policy.rawXml);
    const hasError = !result.valid;
    const badgeLabel = hasError
      ? `\u274C ${result.errors.length} Fehler`
      : '\u2705 Valide';

    const checks = (result.checks || []).map(c => {
      const ico = c.ok ? '\u2705' : '\u274C';
      return `<div class="val-check-row${c.ok ? '' : ' val-check-row--err'}">`
        + `<span>${ico}</span>`
        + `<span>${esc(c.label)}${c.detail ? ` \u2014 <em>${esc(c.detail)}</em>` : ''}</span>`
        + `</div>`;
    }).join('');

    const warnings = (result.warnings || []).map(w =>
      `<div class="val-check-row val-check-row--warn"><span>\u26A0\uFE0F</span><span>${esc(w)}</span></div>`
    ).join('');

    const pId = policyId.replace(/'/g, "\\'");
    const fixBtn = hasError
      ? `<button class="val-fix-btn" onclick="App.fixPolicyInEditor('${pId}')">Im Editor \u00f6ffnen und beheben \u2192</button>`
      : '';

    summaryBox.insertAdjacentHTML('beforeend',
      `<div class="val-summary-wrap">`
      + `<div class="summary-row">`
      + `<span class="summary-label">Validierung</span>`
      + `<button class="val-badge${hasError ? ' val-badge--error' : ''}" id="val-badge-btn"`
      + ` onclick="App.toggleValidationPanel()" aria-expanded="false">`
      + badgeLabel + ` <span class="val-badge-chevron">\u25be</span>`
      + `</button></div>`
      + `<div class="val-badge-panel" id="val-detail-panel" style="display:none">`
      + checks + warnings + fixBtn
      + `</div></div>`
    );
  }

  function toggleValidationPanel() {
    const panel = document.getElementById('val-detail-panel');
    const btn   = document.getElementById('val-badge-btn');
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    if (btn) {
      btn.setAttribute('aria-expanded', String(!open));
      const chevron = btn.querySelector('.val-badge-chevron');
      if (chevron) chevron.textContent = open ? '\u25be' : '\u25b4';
    }
  }

  function fixPolicyInEditor(policyId) {
    const policies = UIState.getAll();
    const idx = policies.findIndex(p => p.filename === policyId);
    if (idx < 0) return;
    const policy = policies[idx];
    UIState.setActive(idx);
    refreshSidebar();
    loadPolicyIntoEditor(policyId, policy.rawXml);
    const cached = validationCache.get(policyId);
    if (cached && !cached.valid && cached.errors[0] && cached.errors[0].line) {
      const line = cached.errors[0].line;
      setTimeout(() => { if (editor) editor.scrollIntoView({ line: line - 1, ch: 0 }); }, 100);
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

      const hasDirty = _dirtyEdits.has(p.filename);

      return `<div class="sb-item${isActive ? ' active' : ''}" onclick="App.activatePolicy(${i})" title="${esc(p.filename)}">`
           + `<div class="sb-item-main">`
           + `<div class="sb-name-row">`
           + `<div class="sb-name">${esc(shortName)}</div>`
           + (hasDirty ? `<span class="sb-dirty-dot" title="Ungespeicherte \u00c4nderungen">\u25CF</span>` : '')
           + `</div>`
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
    const policies = UIState.getAll();
    const filename  = policies[idx] && policies[idx].filename;
    if (filename) _dirtyEdits.delete(filename);
    const wasActive = UIState.remove(idx);
    refreshSidebar();
    const remaining = UIState.getAll();
    if (!remaining.length) {
      _renderEmptyState();
      editorState.policyId    = null;
      editorState.originalXml = '';
      editorState.isDirty     = false;
      editorSetValue('');
      updateDirtyIndicator();
      const statusEl = document.getElementById('editorValidationStatus');
      if (statusEl) statusEl.textContent = '';
      if (_activeContentTab === 'xml-editor') switchContentTab('viz');
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
    document.getElementById('layout-guide').style.display = tab === 'guide' ? 'block' : 'none';
    document.getElementById('layout-kb').style.display    = tab === 'kb'    ? 'block' : 'none';
    document.getElementById('tab-viz').classList.toggle('active',   tab === 'viz');
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

  // ── Import Modal ──

  function parseAndValidateXml(xmlString, filename) {
    const result = validatePolicy(xmlString);
    if (!result.valid) {
      const e = result.errors[0];
      return { success: false, error: `Zeile ${e.line || '?'}: XML ist fehlerhaft. Bitte Syntax pr\u00fcfen.` };
    }
    return { success: true, filename };
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
        invalidateValidationCache(policy.filename);
        getOrComputeValidation(policy.filename, text);
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
      invalidateValidationCache(policy.filename);
      getOrComputeValidation(policy.filename, text);
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

  const _dirtyEdits = new Map(); // filename → edited xml (for policies with unsaved changes)
  let _activeContentTab = 'viz';

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
      if (editorState.policyId) {
        if (editorState.isDirty) {
          _dirtyEdits.set(editorState.policyId, current);
        } else {
          _dirtyEdits.delete(editorState.policyId);
        }
      }
      updateDirtyIndicator();
      validateXmlInline(current);
      refreshSidebar();
    }, 500));
  }

  function switchContentTab(tab) {
    _activeContentTab = tab;
    const content     = document.getElementById('content');
    const editorPanel = document.getElementById('editor-panel');
    document.getElementById('ctab-viz').classList.toggle('active',    tab === 'viz');
    document.getElementById('ctab-editor').classList.toggle('active', tab === 'xml-editor');
    if (tab === 'xml-editor') {
      content.style.display     = 'none';
      editorPanel.style.display = 'flex';
      _initEditor();
      const active = UIState.getActive();
      if (active && active.rawXml && editorState.policyId !== active.filename) {
        editorState.policyId    = active.filename;
        editorState.originalXml = active.rawXml;
        editorState.mode        = 'edit';
        const savedDirty = _dirtyEdits.get(active.filename);
        editorState.isDirty = !!savedDirty;
        setTimeout(() => {
          editorSetValue(savedDirty || active.rawXml);
          updateDirtyIndicator();
          validateXmlInline(savedDirty || active.rawXml);
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
    const result = validatePolicy(xmlString);
    if (!result.valid) {
      const e = result.errors[0];
      statusEl.textContent = `\u274C ${e.line ? `Zeile ${e.line}: ` : ''}${e.message}`;
      statusEl.style.color = '#ef4444';
    } else {
      statusEl.textContent = `\u2705 ${result.version || 'G\u00fcltiges XML'}`;
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
    _dirtyEdits.delete(editorState.policyId);
    updateDirtyIndicator();
    refreshSidebar();
  }

  function handleReset() {
    document.getElementById('editorResetConfirm').style.display = 'flex';
  }

  function confirmReset() {
    editorSetValue(editorState.originalXml);
    editorState.isDirty = false;
    _dirtyEdits.delete(editorState.policyId);
    updateDirtyIndicator();
    refreshSidebar();
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
      _dirtyEdits.delete(fname);
      invalidateValidationCache(fname);
      getOrComputeValidation(fname, xml);
      editorState.originalXml = xml;
      editorState.isDirty     = false;
      const idx    = UIState.addOrReplace(policy);
      switchContentTab('viz');
      activatePolicy(idx);
    } catch (e) {
      showEditorError('Fehler beim Rendern: ' + e.message);
    }
  }

  function loadPolicyIntoEditor(policyId, xmlContent) {
    editorState.policyId    = policyId;
    editorState.originalXml = xmlContent; // always the clean baseline
    editorState.mode        = 'edit';
    const savedDirty        = _dirtyEdits.get(policyId);
    editorState.isDirty     = !!savedDirty;
    switchContentTab('xml-editor');
    const contentToLoad = savedDirty || xmlContent;
    setTimeout(() => {
      editorSetValue(contentToLoad);
      updateDirtyIndicator();
      validateXmlInline(contentToLoad);
      editor && editor.refresh();
    }, 0);
  }

  // beforeunload guard
  window.addEventListener('beforeunload', (e) => {
    if (editorState.isDirty || _dirtyEdits.size > 0) { e.preventDefault(); e.returnValue = ''; }
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
    toggleTheme,
    openImportModal, closeImportModal, switchImportTab,
    importDragOver, importDragLeave, importDrop, importFromFiles, importFromPaste,
    switchContentTab, handleEditorUpdate, handleBeautify, handleDownload,
    handleReset, confirmReset, cancelReset, loadPolicyIntoEditor,
    handlePolicyEdit, handlePolicyDelete, confirmPolicyDelete, cancelPolicyDelete,
    restoreMappingsOnStartup, clearAllMappings,
    toggleValidationPanel, fixPolicyInEditor
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
