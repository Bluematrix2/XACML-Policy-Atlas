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
import { PolicyCreator } from './creator.js';
import { I18n } from './i18n.js';

// ── Upload security constants ──
const MAX_XML_SIZE = 5 * 1024 * 1024;  // 5 MB
const MAX_CSV_SIZE = 1 * 1024 * 1024;  // 1 MB

const ALLOWED_XML_EXT = '.xml';
const ALLOWED_CSV_EXT = '.csv';

function _checkFile(file, allowedExt, maxBytes) {
  if (!file.name.toLowerCase().endsWith(allowedExt)) {
    alert(I18n.t('file.err.type', { ext: allowedExt.toUpperCase() }));
    return false;
  }
  if (file.size > maxBytes) {
    alert(I18n.t('file.err.size', { mb: Math.round(maxBytes / 1024 / 1024), name: file.name }));
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
          { label: I18n.t('check.1'), ok: false, detail: msg },
          { label: I18n.t('check.2'), ok: false, detail: '' },
          { label: I18n.t('check.3'), ok: false, detail: '' },
          { label: I18n.t('check.4'), ok: false, detail: '' },
          { label: I18n.t('check.5'), ok: false, detail: '' },
          { label: I18n.t('check.6'), ok: false, detail: '' },
          { label: I18n.t('check.7'), ok: false, detail: '' },
          { label: I18n.t('check.8'), ok: false, detail: '' },
          { label: I18n.t('check.9'), ok: false, detail: '' },
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
      errors.push({ line: 1, message: I18n.t('val.err.namespace', { ns }) });
    }

    // ── Check 3: Root element ──
    const rootName = root.localName;
    const rootOk   = rootName === 'Policy' || rootName === 'PolicySet';
    if (rootOk) {
      info.rootElement = rootName;
      info.policyId    = root.getAttribute('PolicyId') || '(keine ID)';
    } else {
      errors.push({ line: null, message: I18n.t('val.err.root', { name: rootName }) });
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
    if (missingAlg.length) errors.push({ line: null, message: I18n.t('val.err.alg', { names: missingAlg.join(', ') }) });

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
    if (badEffect.length) errors.push({ line: null, message: I18n.t('val.err.effect', { names: badEffect.join(', ') }) });

    // ── Check 6: Designators ──
    let badDesig = 0;
    const desigNames = new Set();
    for (const el of allEls) {
      if (el.localName.includes('Designator') && (!el.getAttribute('AttributeId') || !el.getAttribute('DataType'))) {
        desigNames.add(el.localName);
        if (++badDesig >= 3) break;
      }
    }
    if (desigNames.size) errors.push({ line: null, message: I18n.t('val.err.desig', { names: [...desigNames].join(', ') }) });

    // ── Check 7: Target defined ──
    const targetEls  = allEls.filter(e => e.localName === 'Target');
    const hasTargets = targetEls.length > 0;
    if (!hasTargets) warnings.push(I18n.t('val.warn.noTargets'));

    // ── Check 8: Policies contain Rules ──
    const emptyPolicies = policyEls
      .filter(p => p.localName === 'Policy' && !Array.from(p.children).some(c => c.localName === 'Rule'))
      .map(p => (p.getAttribute('PolicyId') || '?').split(':').pop());
    if (emptyPolicies.length) warnings.push(I18n.t('val.warn.emptyPolicy', { names: emptyPolicies.join(', ') }));

    // ── Check 9: Unique IDs ──
    const idSet = new Set();
    const duplicateIds = [];
    for (const el of allEls) {
      const id = el.getAttribute('PolicyId') || el.getAttribute('RuleId');
      if (!id) continue;
      if (idSet.has(id)) { if (!duplicateIds.includes(id)) duplicateIds.push(id); }
      else idSet.add(id);
    }
    if (duplicateIds.length) errors.push({ line: null, message: I18n.t('val.err.duplicate', { ids: duplicateIds.map(i => i.split(':').pop()).join(', ') }) });

    info.policyIds = policyEls.map(p => p.getAttribute('PolicyId')).filter(Boolean);

    // ════════════════════════════════════════════════════
    // Extended Linter Checks (10–24) → warnings
    // ════════════════════════════════════════════════════

    // Check 10: PolicySet contains Policies
    const emptySets = policyEls
      .filter(p => p.localName === 'PolicySet' && !Array.from(p.children).some(c => c.localName === 'Policy' || c.localName === 'PolicySet'))
      .map(p => (p.getAttribute('PolicyId') || '?').split(':').pop());
    if (emptySets.length) warnings.push(I18n.t('val.warn.emptySet', { names: emptySets.join(', ') }));

    // Check 11: Empty Target elements
    const emptyTargets = targetEls.filter(t => t.children.length === 0);
    if (emptyTargets.length) warnings.push(I18n.t('val.warn.emptyTargets', { n: emptyTargets.length }));

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
    if (noCondCount)    warnings.push(I18n.t('val.warn.noCond',     { n: noCondCount }));
    if (permitAllCount) warnings.push(I18n.t('val.warn.permitAll', { n: permitAllCount }));
    if (denyAllCount)   warnings.push(I18n.t('val.warn.denyAll',   { n: denyAllCount }));

    // Check 15: Overlapping Rules (heuristic: multiple rules without Target in same Policy)
    for (const p of policyEls) {
      if (p.localName !== 'Policy') continue;
      const rules = Array.from(p.children).filter(c => c.localName === 'Rule');
      const noTargetRules = rules.filter(r => !Array.from(r.children).some(c => c.localName === 'Target'));
      if (noTargetRules.length > 1) {
        const pid = (p.getAttribute('PolicyId') || '?').split(':').pop();
        warnings.push(I18n.t('val.warn.overlap', { id: pid, n: noTargetRules.length }));
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
        warnings.push(I18n.t('val.warn.unreachable', { id: pid, n: unreachableCount }));
      }
    }

    // Check 17: Missing Description (Rules)
    for (const r of ruleEls) {
      if (!Array.from(r.children).some(c => c.localName === 'Description')) {
        const rid = (r.getAttribute('RuleId') || '').split(':').pop() || '?';
        warnings.push(I18n.t('val.warn.noDesc', { id: rid }));
      }
    }

    // Check 18: AttributeId format inconsistency
    const attrIds = allEls
      .filter(e => e.hasAttribute('AttributeId'))
      .map(e => e.getAttribute('AttributeId'));
    const hasUri  = attrIds.some(id => id.startsWith('urn:') || id.startsWith('http'));
    const hasDot  = attrIds.some(id => !id.includes(':') && !id.includes('/') && id.includes('.'));
    if (hasUri && hasDot) warnings.push(I18n.t('val.warn.mixedAttr'));

    // Check 19: Unsupported DataType
    const badDtSet = new Set();
    for (const el of allEls) {
      const dt = el.getAttribute('DataType');
      if (dt && !_XACML_DATATYPES.has(dt)) badDtSet.add(dt);
    }
    if (badDtSet.size) warnings.push(I18n.t('val.warn.badDt', { list: [...badDtSet].map(d => d.split(/[:#/]/).pop()).join(', ') }));

    // Check 20: Unknown XACML elements (in XACML namespace, not in known set)
    const unknownEls = new Set();
    for (const el of allEls) {
      const elNs = el.namespaceURI || '';
      if ((elNs.includes('xacml') || elNs === ns) && !_XACML_ELEMENTS.has(el.localName)) {
        unknownEls.add(el.localName);
      }
    }
    if (unknownEls.size) warnings.push(I18n.t('val.warn.unknownEl', { list: [...unknownEls].join(', ') }));

    // Check 21: Excessively deep PolicySet nesting
    const maxDepth = _getPolicyNestingDepth(root, root.localName === 'PolicySet' ? 1 : 0);
    if (maxDepth > 3) warnings.push(I18n.t('val.warn.nesting', { n: maxDepth }));

    // Check 22: Missing PolicyId
    const noPolicyId = policyEls.filter(p => !p.getAttribute('PolicyId'));
    if (noPolicyId.length) warnings.push(I18n.t('val.warn.noPolicyId', { n: noPolicyId.length }));

    // Check 23: Missing RuleId
    const noRuleId = ruleEls.filter(r => !r.getAttribute('RuleId'));
    if (noRuleId.length) warnings.push(I18n.t('val.warn.noRuleId', { n: noRuleId.length }));

    // Check 24: Large Policy
    const LARGE_RULE_THRESHOLD = 20;
    if (ruleEls.length > LARGE_RULE_THRESHOLD) {
      warnings.push(I18n.t('val.warn.large', { n: ruleEls.length }));
    }

    // ── Build checks array (core structural, checks 1–9) ──
    const checks = [
      { label: I18n.t('check.1'),
        ok: true, detail: '' },
      { label: info.version ? I18n.t('check.2.version', { version: info.version }) : I18n.t('check.2'),
        ok: nsOk, detail: nsOk ? '' : `Unbekannt: ${ns}` },
      { label: rootOk ? I18n.t('check.3.found', { el: info.rootElement }) : I18n.t('check.3'),
        ok: rootOk, detail: '' },
      { label: I18n.t('check.4'),
        ok: !badEffect.length, detail: badEffect.length ? `${badEffect.length} Rule(s) betroffen` : '' },
      { label: I18n.t('check.5'),
        ok: !missingAlg.length, detail: missingAlg.length ? `${missingAlg.length} Policy(s) betroffen` : '' },
      { label: I18n.t('check.6'),
        ok: !desigNames.size, detail: desigNames.size ? [...desigNames].join(', ') : '' },
      { label: I18n.t('check.7'),
        ok: hasTargets, detail: hasTargets ? '' : I18n.t('val.warn.noTargets') },
      { label: I18n.t('check.8'),
        ok: !emptyPolicies.length, detail: emptyPolicies.length ? emptyPolicies.join(', ') : '' },
      { label: I18n.t('check.9'),
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
        _showToast(I18n.t('toast.mapping.full'));
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
    _showToast(I18n.t('toast.mapping.cleared'));
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
      btn.title = I18n.t('csv.tooltip.none');
      return;
    }
    const locale = I18n.getLang() === 'de' ? 'de-DE' : 'en-US';
    btn.title = stored.map(e => {
      const date = new Date(e.loadedAt).toLocaleString(locale);
      const kb   = Math.round(e.sizeBytes / 1024);
      return I18n.t('csv.tooltip.item', { name: e.filename, kb, date });
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
      ? I18n.t('toast.mapping.updated', { name: filename })
      : I18n.t('toast.mapping.loaded',  { name: filename }));
  }

  function restoreMappingsOnStartup() {
    const stored = getAllStoredMappings();
    if (!stored.length) return;
    stored.forEach(entry => loadMappingIntoApp(entry.filename, entry.data));
    const count = stored.length;
    _showToast(count === 1
      ? I18n.t('toast.mapping.restored.one')
      : I18n.t('toast.mapping.restored.many', { n: count }));
    setMappingStatus('loaded');
    updateMappingTooltip();
  }

  function clearPolicies() {
    UIState.clear();
    refreshSidebar();
    _renderEmptyState();
  }

  async function loadExample() {
    const EXAMPLE_FILE     = 'sample/ExamplePhysicianAccess.xml';
    const EXAMPLE_NAME     = 'ExamplePhysicianAccess.xml';
    const EXAMPLE_CSV      = 'sample/ExamplePhysicianAccess-mapping.csv';
    const EXAMPLE_CSV_NAME = 'ExamplePhysicianAccess-mapping.csv';
    try {
      const [rXml, rCsv] = await Promise.all([fetch(EXAMPLE_FILE), fetch(EXAMPLE_CSV)]);
      if (!rXml.ok) throw new Error(`HTTP ${rXml.status}`);
      const text   = await rXml.text();
      const policy = XACMLParser.parse(text, EXAMPLE_NAME);
      policy.rawXml = text;
      invalidateValidationCache(EXAMPLE_NAME);
      getOrComputeValidation(EXAMPLE_NAME, text);
      if (rCsv.ok) {
        const csvText = await rCsv.text();
        loadMappingIntoApp(EXAMPLE_CSV_NAME, csvText);
      }
      // Load into Visualizer (background — no tab switch)
      const idx = UIState.addOrReplace(policy);
      refreshSidebar();
      activatePolicy(idx);
      // Load into Creator (both form + visual editor)
      PolicyCreator.loadSamplePolicy();
      _showToast(I18n.t('toast.example'));
    } catch (e) {
      alert(I18n.t('toast.example.err', { msg: e.message }));
    }
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
      alert(I18n.t('file.err.oversized', { mb: MAX_XML_SIZE / 1024 / 1024, files: oversized.map(f => f.name).join('\n') }));
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
    if (errors.length > 0) alert(I18n.t('modal.err.load', { errors: errors.join('\n') }));
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
      + ` placeholder="${esc(I18n.t('search.placeholder'))}" oninput="App.applySearch(this.value)">`
      + `<button class="search-clear-btn" id="s-clear" onclick="App.clearSearch()" title="${esc(I18n.t('search.clear.title'))}" aria-label="${esc(I18n.t('search.clear.aria'))}" style="display:${sv?'flex':'none'}">&#x2715;</button>`
      + `</div>`
      + `<button class="filter-btn${_currentFilter==='all'?' active':''}" id="f-all" onclick="App.setFilter('all')">${esc(I18n.t('filter.all'))}</button>`
      + `<button class="filter-btn${_currentFilter==='permit'?' active':''}" id="f-permit" onclick="App.setFilter('permit')">${esc(I18n.t('filter.permit'))}</button>`
      + `<button class="filter-btn${_currentFilter==='deny'?' active':''}" id="f-deny" onclick="App.setFilter('deny')">${esc(I18n.t('filter.deny'))}</button>`
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
      ? I18n.t('val.badge.errors', { n: result.errors.length })
      : I18n.t('val.badge.valid');

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
      ? `<button class="val-fix-btn" onclick="App.fixPolicyInEditor('${pId}')">${esc(I18n.t('val.fixBtn'))}</button>`
      : '';

    summaryBox.insertAdjacentHTML('beforeend',
      `<div class="val-summary-wrap">`
      + `<div class="summary-row">`
      + `<span class="summary-label">${esc(I18n.t('val.label'))}</span>`
      + `<button class="val-badge${hasError ? ' val-badge--error' : ''}" id="val-badge-btn"`
      + ` onclick="App.toggleValidationPanel()" aria-expanded="false">`
      + badgeLabel + ` <span class="val-badge-chevron">\u25be</span>`
      + `</button>`
      + `<button class="val-info-btn" onclick="App.openKbSection('kb-validation')" title="${esc(I18n.t('val.info.title'))}" aria-label="${esc(I18n.t('val.info.aria'))}">&#x2139;</button>`
      + `</div>`
      + `<div class="val-badge-panel" id="val-detail-panel" style="display:none">`
      + checks + warnings + fixBtn
      + `</div></div>`
    );
  }

  function openKbSection(id) {
    switchTab('kb').then(() => {
      // Try as a section wrapper first
      const el = document.getElementById(id);
      if (el && el.classList.contains('guide-acc')) {
        KnowledgeBase.openSection(id, true);
      } else if (el) {
        // It's a heading inside a section — open the containing section, then scroll to heading
        const section = el.closest('.guide-acc');
        if (section) {
          KnowledgeBase.openSection(section.id, false);
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        }
      }
    });
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
      const allRules    = p.policies ? p.policies.flatMap(r => r.rules) : p.rules;
      const permitCount = allRules.filter(r => r.effect !== 'Deny').length;
      const denyCount   = allRules.filter(r => r.effect === 'Deny').length;
      const total       = allRules.length;
      const pPct        = total > 0 ? (permitCount / total * 100).toFixed(1) : 0;
      const shortName   = p.filename.replace(/\.xml$/i, '');
      const confirming  = _confirmingDelete.has(i);

      if (confirming) {
        return `<div class="sb-item${isActive ? ' active' : ''} confirming">`
             + `<div class="sb-item-main">`
             + `<div class="sb-name" title="${esc(p.filename)}">${esc(shortName)}</div>`
             + `<div class="sb-confirm">`
             + `<span class="sb-confirm-text">${esc(I18n.t('confirm.delete.text'))}</span>`
             + `<button class="sb-confirm-yes" onclick="event.stopPropagation();App.confirmPolicyDelete(${i})">${esc(I18n.t('confirm.delete.yes'))}</button>`
             + `<button class="sb-confirm-no" onclick="event.stopPropagation();App.cancelPolicyDelete(${i})">${esc(I18n.t('confirm.delete.no'))}</button>`
             + `</div></div></div>`;
      }

      const hasDirty = _dirtyEdits.has(p.filename);

      return `<div class="sb-item${isActive ? ' active' : ''}" onclick="App.activatePolicy(${i})" title="${esc(p.filename)}">`
           + `<div class="sb-item-main">`
           + `<div class="sb-name-row">`
           + `<div class="sb-name">${esc(shortName)}</div>`
           + (hasDirty ? `<span class="sb-dirty-dot" title="${esc(I18n.t('sidebar.dirty.title'))}">\u25CF</span>` : '')
           + `</div>`
           + `<div class="sb-meta">${total} ${total !== 1 ? esc(I18n.t('sidebar.rules.many')) : esc(I18n.t('sidebar.rules.one'))} &middot; ${permitCount}P&thinsp;/&thinsp;${denyCount}D</div>`
           + `<div class="sb-bar" style="background:linear-gradient(to right,#4CAF50 ${pPct}%,#F44336 ${pPct}%)"></div></div>`
           + `<div class="policy-actions">`
           + `<button class="sb-action-btn" onclick="event.stopPropagation();App.handlePolicyEdit(${i})" title="${esc(I18n.t('sidebar.editBtn.title'))}" aria-label="${esc(I18n.t('sidebar.editBtn.aria'))}">&#x270F;&#xFE0F;</button>`
           + `<button class="sb-action-btn sb-action-delete" onclick="event.stopPropagation();App.handlePolicyDelete(${i})" title="${esc(I18n.t('sidebar.deleteBtn.title'))}" aria-label="${esc(I18n.t('sidebar.deleteBtn.aria'))}">&#x1F5D1;</button>`
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
    document.getElementById('layout-viz').style.display     = tab === 'viz'     ? 'flex'  : 'none';
    document.getElementById('layout-creator').style.display = tab === 'creator' ? 'block' : 'none';
    document.getElementById('layout-guide').style.display   = tab === 'guide'   ? 'block' : 'none';
    document.getElementById('layout-kb').style.display      = tab === 'kb'      ? 'block' : 'none';
    ['viz', 'creator', 'guide', 'kb'].forEach(t => {
      const btn = document.getElementById('tab-' + t);
      if (!btn) return;
      btn.classList.toggle('active', t === tab);
      btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    if (tab === 'guide')   return XACMLGuide.init();
    if (tab === 'kb')      return KnowledgeBase.init();
    if (tab === 'creator') { PolicyCreator.init(); return Promise.resolve(); }
    return Promise.resolve();
  }

  // ── Creator integration helpers ────────────────────────────────────────

  function validateXmlForCreator(xmlString) {
    return validatePolicy(xmlString);
  }

  function loadCreatorXml(xmlString, filename) {
    try {
      const policy   = XACMLParser.parse(xmlString, filename);
      policy.rawXml  = xmlString;
      invalidateValidationCache(filename);
      getOrComputeValidation(filename, xmlString);
      const idx = UIState.addOrReplace(policy);
      switchTab('viz').then(() => {
        refreshSidebar();
        activatePolicy(idx);
        _showToast('&#x2705; Policy im Visualizer geladen');
      });
    } catch (e) {
      alert('Fehler beim Laden im Visualizer: ' + e.message);
    }
  }

  function loadCreatorXmlIntoEditor(xmlString, filename) {
    switchTab('viz').then(() => {
      loadPolicyIntoEditor(filename, xmlString);
    });
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
        btn.textContent = I18n.t('toast.enf.loaded', { n: EnforcementMapper.getCount() });
        setTimeout(() => { btn.innerHTML = orig; }, 2500);
      }
    } catch (e) {
      alert(I18n.t('toast.enf.err', { msg: e.message }));
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
    html += `${esc(I18n.t('enf.fhirLink', { version: FHIR_VERSION }))}</a>`;

    if (!data) {
      html += `<p style="color:#9e9e9e;font-size:13px">${esc(I18n.t('enf.noData'))}</p>`;
      return html;
    }

    const ac = data.primaryControl;
    if (ac === 'public') {
      html += `<span class="enf-badge public">${esc(I18n.t('enf.public'))}</span>`;
      html += `<div class="enf-public-msg">${esc(I18n.t('enf.publicMsg'))}</div>`;
    } else if (ac.endsWith('*')) {
      html += `<span class="enf-badge enforced-special">${esc(I18n.t('enf.enforced.special'))}</span>`;
    } else {
      html += `<span class="enf-badge enforced">${esc(I18n.t('enf.enforced'))}</span>`;
    }

    if (data.entries.length > 0) {
      html += `<div class="enf-section-label">${esc(I18n.t('enf.section'))}</div>`;
      html += `<table class="enf-table"><thead><tr>`;
      html += `<th>${esc(I18n.t('enf.th.sp'))}</th><th>${esc(I18n.t('enf.th.path'))}</th><th>${esc(I18n.t('enf.th.xacml'))}</th>`;
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
      html += `<strong>${esc(I18n.t('enf.summary', { n: data.entries.length }))}</strong> `;
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
      // XML parse errors have a line number; XACML semantic errors do not
      const msg = e.line
        ? I18n.t('editor.err.line', { line: e.line })
        : e.message;
      return { success: false, error: msg };
    }
    return { success: true, filename };
  }

  function _renderEmptyState() {
    document.getElementById('content').innerHTML =
      `<div class="empty-state">`
      + `<div class="icon">&#x1F4C2;</div>`
      + `<p>${esc(I18n.t('empty.text'))}</p>`
      + `<button class="import-trigger-btn" onclick="App.openImportModal()">${esc(I18n.t('empty.import'))}</button>`
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
      errEl.textContent = I18n.t('modal.err.noXml');
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
    oversized.forEach(f => errors.push(`${f.name}: ${I18n.t('modal.err.tooBig', { mb: MAX_XML_SIZE / 1024 / 1024 })}`));

    if (!loadedCount) {
      errEl.textContent = errors.join('\n');
      errEl.style.display = 'block';
      return;
    }

    _closeModalInternal();
    refreshSidebar();
    if (firstIdx >= 0) activatePolicy(firstIdx);

    const msg = loadedCount === 1
      ? I18n.t('modal.success.single', { name: toLoad[0].name })
      : I18n.t('modal.success.multi', { n: loadedCount });
    _showToast(msg);

    if (errors.length) setTimeout(() => alert(I18n.t('modal.err.load', { errors: errors.join('\n') })), 100);
  }

  async function importFromPaste() {
    const textarea = document.getElementById('import-textarea');
    const errEl    = document.getElementById('import-paste-error');
    errEl.style.display = 'none';
    errEl.textContent   = '';

    const text = textarea.value.trim();
    if (!text) {
      errEl.textContent = I18n.t('modal.err.noContent');
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
      _showToast(I18n.t('modal.success.single', { name: policy.filename || 'Policy' }));
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

  // ── Editor search state ──
  const _search = { query: '', marks: [], results: [], index: -1 };

  function _searchClear() {
    _search.marks.forEach(m => m.clear());
    _search.marks = [];
    _search.results = [];
    _search.index = -1;
    const countEl = document.getElementById('editor-search-count');
    if (countEl) { countEl.textContent = ''; countEl.className = 'editor-search-count'; }
    _searchUpdateNav();
  }

  function _searchRun(query) {
    _searchClear();
    _search.query = query;
    if (!query || !editor) return;

    const content = editor.getValue();
    const lower   = content.toLowerCase();
    const lq      = query.toLowerCase();
    let pos = 0;

    while (true) {
      const idx = lower.indexOf(lq, pos);
      if (idx === -1) break;
      _search.results.push({
        from: editor.posFromIndex(idx),
        to:   editor.posFromIndex(idx + query.length)
      });
      pos = idx + query.length;
    }

    _search.marks = _search.results.map(({ from, to }) =>
      editor.markText(from, to, { className: 'cm-search-match' })
    );

    if (_search.results.length > 0) { _search.index = 0; _searchScrollTo(0); }
    _searchUpdateCount();
    _searchUpdateNav();
  }

  function _searchScrollTo(idx) {
    if (!_search.results.length || !editor) return;
    _search.index = ((idx % _search.results.length) + _search.results.length) % _search.results.length;
    const { from, to } = _search.results[_search.index];
    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, 80);
    _searchUpdateCount();
    _searchUpdateNav();
  }

  function _searchUpdateCount() {
    const countEl = document.getElementById('editor-search-count');
    if (!countEl) return;
    const n = _search.results.length;
    const i = _search.index;
    if (!_search.query)         { countEl.textContent = ''; countEl.className = 'editor-search-count'; }
    else if (n === 0)           { countEl.textContent = I18n.t('editor.search.noMatch'); countEl.className = 'editor-search-count editor-search-count--none'; }
    else                        { countEl.textContent = `${i + 1} / ${n}`; countEl.className = 'editor-search-count'; }
  }

  function _searchUpdateNav() {
    const prev = document.getElementById('editor-search-prev');
    const next = document.getElementById('editor-search-next');
    const off  = _search.results.length === 0;
    if (prev) prev.disabled = off;
    if (next) next.disabled = off;
  }

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
      // Re-run search to keep highlights in sync with changed content
      if (_search.query) _searchRun(_search.query);
    }, 500));

    // Ctrl+F / Cmd+F: focus search bar
    editor.addKeyMap({
      'Ctrl-F': () => { const inp = document.getElementById('editor-search-input'); if (inp) { inp.focus(); inp.select(); } },
      'Cmd-F':  () => { const inp = document.getElementById('editor-search-input'); if (inp) { inp.focus(); inp.select(); } },
    });

    // Search bar event wiring
    const searchInput = document.getElementById('editor-search-input');
    const searchClear = document.getElementById('editor-search-clear');
    const searchPrev  = document.getElementById('editor-search-prev');
    const searchNext  = document.getElementById('editor-search-next');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        _searchRun(searchInput.value);
        if (searchClear) searchClear.style.display = searchInput.value ? 'flex' : 'none';
      });
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _searchScrollTo(_search.index + (e.shiftKey ? -1 : 1)); }
        if (e.key === 'Escape') { editor.focus(); }
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        _searchClear();
        searchInput.focus();
      });
    }
    if (searchPrev) searchPrev.addEventListener('click', () => _searchScrollTo(_search.index - 1));
    if (searchNext) searchNext.addEventListener('click', () => _searchScrollTo(_search.index + 1));

    _searchUpdateNav();
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
    const infoBtn  = document.getElementById('editorValidationInfoBtn');
    if (!statusEl) return;
    if (!xmlString.trim()) {
      statusEl.textContent = '';
      if (infoBtn) infoBtn.style.display = 'none';
      return;
    }
    const result = validatePolicy(xmlString);
    if (!result.valid) {
      const e = result.errors[0];
      statusEl.textContent = `\u274C ${e.line ? I18n.t('editor.err.line', { line: e.line }) + ' ' : ''}${e.message}`;
      statusEl.style.color = '#ef4444';
    } else {
      statusEl.textContent = `\u2705 ${result.version || I18n.t('editor.valid.xml')}`;
      statusEl.style.color = '#22c55e';
    }
    if (infoBtn) infoBtn.style.display = 'inline-flex';
  }

  function showEditorError(msg) {
    const el  = document.getElementById('editorErrorMsg');
    const bar = document.getElementById('editor-error-bar');
    if (el)  { el.textContent = msg; }
    if (bar) { bar.style.display = 'flex'; }
  }

  function hideEditorError() {
    const el  = document.getElementById('editorErrorMsg');
    const bar = document.getElementById('editor-error-bar');
    if (el)  { el.textContent = ''; }
    if (bar) { bar.style.display = 'none'; }
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
    if (!result) { showEditorError(I18n.t('editor.err.beautify')); return; }
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
      // Keep dirty state: user has not downloaded/saved yet.
      // Only update _dirtyEdits to ensure the applied xml is tracked.
      if (xml !== editorState.originalXml) {
        _dirtyEdits.set(fname, xml);
        editorState.isDirty = true;
      }
      invalidateValidationCache(fname);
      getOrComputeValidation(fname, xml);
      const idx    = UIState.addOrReplace(policy);
      switchContentTab('viz');
      activatePolicy(idx);
    } catch (e) {
      showEditorError(I18n.t('editor.err.render', { msg: e.message }));
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
      _searchClear();
      const clr = document.getElementById('editor-search-clear');
      if (clr) clr.style.display = 'none';
      editorSetValue(contentToLoad);
      updateDirtyIndicator();
      validateXmlInline(contentToLoad);
      editor && editor.refresh();
      // Re-apply active search query to new content
      const inp = document.getElementById('editor-search-input');
      if (inp && inp.value) _searchRun(inp.value);
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
        I18n.t(theme === 'dark' ? 'hdr.theme.aria.dark' : 'hdr.theme.aria.light')
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

  // Sidebar drag-and-drop
  (function setupSidebarDrop() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Inject drop-hint overlay
    const hint = document.createElement('div');
    hint.className = 'sb-drop-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<div class="sb-drop-hint-icon">\uD83D\uDCC2</div>'
                   + `<div class="sb-drop-hint-text">${I18n.t('sidebar.drop')}</div>`;
    sidebar.insertBefore(hint, sidebar.querySelector('.sb-import-wrap'));

    // Track drag-enter depth across all child elements
    let _counter = 0;

    function _hasFiles(e) {
      return e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    }

    // Window-level: detect any file drag entering the browser
    document.addEventListener('dragenter', e => {
      if (!_hasFiles(e)) return;
      _counter++;
      sidebar.classList.add('sb-drop-active');
    });

    document.addEventListener('dragleave', () => {
      _counter--;
      if (_counter <= 0) {
        _counter = 0;
        sidebar.classList.remove('sb-drop-active', 'sb-drop-hover');
      }
    });

    // Prevent browser default on window dragover so drop fires
    document.addEventListener('dragover', e => e.preventDefault());

    document.addEventListener('drop', e => {
      e.preventDefault(); // prevent browser from opening the dropped file
      _counter = 0;
      sidebar.classList.remove('sb-drop-active', 'sb-drop-hover');
    });

    // Sidebar-specific: highlight stronger when hovering directly over it
    sidebar.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      sidebar.classList.add('sb-drop-hover');
    });

    sidebar.addEventListener('dragleave', e => {
      if (!sidebar.contains(e.relatedTarget)) {
        sidebar.classList.remove('sb-drop-hover');
      }
    });

    sidebar.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      _counter = 0;
      sidebar.classList.remove('sb-drop-active', 'sb-drop-hover');
      _importFiles(Array.from(e.dataTransfer.files));
    });
  })();

  function setLang(lang) {
    I18n.setLang(lang);
  }

  // Re-render dynamic UI on language change
  document.addEventListener('i18n:change', () => {
    // Validation check labels are translated at compute time — flush cache so they
    // are recomputed in the new language when the policy is re-rendered below.
    validationCache.clear();
    const policy = UIState.getActive();
    if (policy) {
      showPolicy(policy);
    } else {
      _renderEmptyState();
    }
    refreshSidebar();
    closeEnfPanel();
    updateMappingTooltip();
    _applyTheme(_theme); // re-apply to update aria-label
  });

  return {
    triggerCSV, loadCSV, activatePolicy, applySearch, clearSearch, setFilter,
    clearPolicies,
    triggerEnforcement, loadEnforcement, openEnfPanel, closeEnfPanel, switchTab,
    toggleTheme, setLang,
    openImportModal, closeImportModal, switchImportTab,
    importDragOver, importDragLeave, importDrop, importFromFiles, importFromPaste,
    switchContentTab, handleEditorUpdate, handleBeautify, handleDownload,
    handleReset, confirmReset, cancelReset, loadPolicyIntoEditor,
    handlePolicyEdit, handlePolicyDelete, confirmPolicyDelete, cancelPolicyDelete,
    restoreMappingsOnStartup, clearAllMappings,
    toggleValidationPanel, fixPolicyInEditor,
    openKbSection, loadExample,
    validateXmlForCreator, loadCreatorXml, loadCreatorXmlIntoEditor
  };
})();

// ── Expose to window for inline event handlers in HTML ──
window.App = App;
window.TreeRenderer = TreeRenderer;

// ── Handle URL hash on initial load (e.g. shared guide/kb anchor links) ──
(function handleInitialHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  if (hash.startsWith('kb-')) {
    // KB section IDs all start with 'kb-'
    App.openKbSection(hash);
  } else {
    // Default: guide tab — switch and scroll to element
    App.switchTab('guide').then(() => {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 100);
    });
  }
})();
