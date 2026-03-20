'use strict';

// ================================================================
//  POLICY SIMULATOR — Phase 3
//  Client-side XACML evaluation engine + Request UI + Trace view
//  + Request history + named Test Cases
// ================================================================

import { I18n } from './i18n.js';

const SIM_HIST_KEY  = 'xacml-sim-history';
const SIM_TESTS_KEY = 'xacml-sim-tests';
const MAX_HISTORY   = 10;

// ── Attribute ID options per category — same as Form Editor ─────────────
const SIM_ATTR_ID_OPTIONS = {
  subject: [
    { value: 'urn:oasis:names:tc:xacml:1.0:subject:subject-id',                labelKey: 'creator.target.attrId.subject.id' },
    { value: 'urn:oasis:names:tc:xacml:2.0:subject:role',                      labelKey: 'creator.target.attrId.subject.role' },
    { value: 'urn:oasis:names:tc:xacml:1.0:subject:authn-locality:ip-address', labelKey: 'creator.target.attrId.subject.ip' },
    { value: 'urn:oasis:names:tc:xacml:1.0:subject:authn-locality:dns-name',   labelKey: 'creator.target.attrId.subject.dns' },
  ],
  resource: [
    { value: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',              labelKey: 'creator.target.attrId.resource.id' },
    { value: 'http://hl7.org/fhir/resource-types',                             labelKey: 'creator.target.attrId.resource.fhir' },
    { value: 'urn:oasis:names:tc:xacml:2.0:resource:target-namespace',         labelKey: 'creator.target.attrId.resource.ns' },
  ],
  action: [
    { value: 'urn:oasis:names:tc:xacml:1.0:action:action-id',                  labelKey: 'creator.target.attrId.action.id' },
    { value: 'urn:oasis:names:tc:xacml:1.0:action:implied-action',             labelKey: 'creator.target.attrId.action.implied' },
  ],
  environment: [],
};

const PolicySimulator = (() => {

  // ── Module state ──────────────────────────────────────────────────────

  let _container       = null;
  let _getPolicy       = null;   // fn() → aktuelles Policy-Objekt aus creator.js
  let _getNodeEditor   = null;   // fn() → NodeEditor-Modul-Referenz für Trace-Highlighting
  let _mode            = 'simple'; // Eingabemodus: 'simple' (Formular) | 'xml' (XACML Request XML)
  let _panel           = 'evaluate'; // Aktives Tab: 'evaluate' | 'history' | 'tests'
  let _result          = null;   // Letztes Evaluierungsergebnis { decision, ruleTraces, … }
  let _formState       = {
    // Einfacher Modus: Standard-Felder für typische XACML-Anfragen
    roleAttrId:      'urn:oasis:names:tc:xacml:2.0:subject:role',
    role:            '',
    subjectIdAttrId: 'urn:oasis:names:tc:xacml:1.0:subject:subject-id',
    subjectId:       '',
    actionAttrId:    'urn:oasis:names:tc:xacml:1.0:action:action-id',
    action:          '',
    resourceAttrId:  'urn:oasis:names:tc:xacml:1.0:resource:resource-id',
    resource:        '',
    extraAttrs:      [],     // Benutzerdefinierte Zusatz-Attribute { cat, attrId, value }
    conditionAttrs:  [],     // { cat, attrId, value } – automatisch aus Policy-Conditions befüllt
  };
  let _editingTestIdx  = -1; // Index des aktuell bearbeiteten Testfalls, -1 = neuer Testfall
  let _xmlInput        = '';
  let _history         = _loadHistory();
  let _tests           = _loadTests();
  let _i18nRegistered  = false;  // Verhindert doppelte Event-Listener-Registrierung bei Sprachänderung

  // ── Storage helpers ───────────────────────────────────────────────────

  function _loadHistory() {
    try { return JSON.parse(sessionStorage.getItem(SIM_HIST_KEY) || '[]'); } catch { return []; }
  }
  function _saveHistory() {
    try { sessionStorage.setItem(SIM_HIST_KEY, JSON.stringify(_history.slice(0, MAX_HISTORY))); } catch { /* ignore */ }
  }
  function _loadTests() {
    try { return JSON.parse(sessionStorage.getItem(SIM_TESTS_KEY) || '[]'); } catch { return []; }
  }
  function _saveTests() {
    try { sessionStorage.setItem(SIM_TESTS_KEY, JSON.stringify(_tests)); } catch { /* ignore */ }
  }

  // ── Evaluation Engine ─────────────────────────────────────────────────

  function _getRequestAttrs(request, cat) {
    switch (cat) {
      case 'subject':     return request.subject     || {};
      case 'resource':    return request.resource    || {};
      case 'action':      return request.action      || {};
      case 'environment': return request.environment || {};
      default:            return request.subject     || {};
    }
  }

  function _condCatToKey(catUri) {
    if (!catUri) return 'subject';
    if (catUri.includes('access-subject') || catUri.includes(':subject:')) return 'subject';
    if (catUri.includes(':resource'))    return 'resource';
    if (catUri.includes(':action'))      return 'action';
    if (catUri.includes(':environment')) return 'environment';
    return 'subject';
  }

  // Führt einen einzelnen Attribut-Vergleich durch.
  // fnUri: vollständige XACML-Funktions-URI (letzter Abschnitt wird als Operator genutzt).
  // actual: Wert aus dem Request, expected: Wert aus der Policy.
  function _matchFn(fnUri, actual, expected) {
    const fn = (fnUri || 'string-equal').split(':').pop();
    const a  = String(actual  ?? '').trim();
    const e  = String(expected ?? '').trim();
    switch (fn) {
      case 'string-equal':                   return a === e;
      case 'string-equal-ignore-case':       return a.toLowerCase() === e.toLowerCase();
      case 'CV-equal':                       return a.toLowerCase() === e.toLowerCase();
      case 'II-equal':                       return a.toLowerCase() === e.toLowerCase();
      case 'integer-equal':                  return !isNaN(a) && !isNaN(e) && parseInt(a, 10) === parseInt(e, 10);
      case 'double-equal':                   return !isNaN(a) && !isNaN(e) && parseFloat(a) === parseFloat(e);
      case 'anyURI-equal':                   return a === e;
      case 'date-equal':                     return a === e;
      case 'dateTime-equal':                 return a === e;
      case 'boolean-equal':                  return a.toLowerCase() === e.toLowerCase();
      case 'string-at-least-one-member-of':
      case 'string-is-in':                   return e.split(',').map(s => s.trim()).includes(a);
      case 'string-regexp-match':
        try { return new RegExp(e).test(a); } catch { return false; }
      default:                               return a === e;
    }
  }

  function _evaluateTarget(target, request) {
    if (!target || !target.groups || target.groups.length === 0) {
      return { match: true, checks: [] };
    }

    const allChecks    = [];
    let anyGroupMatch  = false;

    for (const group of target.groups) {
      if (!group.matches || group.matches.length === 0) { anyGroupMatch = true; continue; }

      let groupMatch = true;
      for (const m of group.matches) {
        const hasValue = m.value || m.cvCode || m.iiRoot;
        if (!hasValue) continue; // empty match row = skip

        const reqAttrs = _getRequestAttrs(request, m.cat);
        const actual   = reqAttrs[m.attributeId] !== undefined ? String(reqAttrs[m.attributeId]) : '';
        const expected = m.valueType === 'cv' ? (m.cvCode || '')
                       : m.valueType === 'ii' ? (m.iiRoot || '*')
                       : (m.value || '');

        const matchOk = actual !== '' && _matchFn(m.matchId, actual, expected);

        // Merge into allChecks, keeping best (true) result per cat+attrId+expected
        const key      = `${m.cat}|${m.attributeId}|${expected}`;
        const existing = allChecks.find(c => `${c.cat}|${c.attrId}|${c.expected}` === key);
        if (existing) { existing.match = existing.match || matchOk; }
        else           allChecks.push({ cat: m.cat, attrId: m.attributeId, expected, actual, match: matchOk });

        if (!matchOk) groupMatch = false;
      }
      if (groupMatch) anyGroupMatch = true;
    }

    return { match: anyGroupMatch, checks: allChecks };
  }

  function _evaluateConditions(conditions, conditionOp, request) {
    if (!conditions || conditions.length === 0) return { match: true, checks: [] };

    const checks = [];
    for (const c of conditions) {
      const cat      = _condCatToKey(c.arg1Cat);
      const reqAttrs = _getRequestAttrs(request, cat);
      const actual   = reqAttrs[c.arg1AttrId] !== undefined ? String(reqAttrs[c.arg1AttrId]) : '';
      const expected = c.arg2Value || '';
      const matchOk  = actual !== '' && expected !== '' && _matchFn(c.functionId, actual, expected);
      checks.push({ attrId: c.arg1AttrId, expected, actual, match: matchOk, functionId: c.functionId });
    }

    const op      = conditionOp || 'AND';
    const overall = op === 'OR' ? checks.some(c => c.match) : checks.every(c => c.match);
    return { match: overall, checks };
  }

  // Wendet den XACML Combining Algorithm auf eine Liste von Regel-Entscheidungen an.
  // Unterstützt: deny-overrides, permit-overrides, first-applicable, only-one-applicable.
  // Fallback bei unbekannten Algorithmen: deny-overrides (sicherste Option).
  function _applyAlgorithm(algUri, decisions) {
    const alg = (algUri || '').split(':').pop();
    if (decisions.length === 0) return 'NotApplicable';

    switch (alg) {
      case 'deny-overrides':
        if (decisions.some(d => d === 'Deny'))   return 'Deny';
        if (decisions.some(d => d === 'Permit')) return 'Permit';
        return 'NotApplicable';

      case 'permit-overrides':
        if (decisions.some(d => d === 'Permit')) return 'Permit';
        if (decisions.some(d => d === 'Deny'))   return 'Deny';
        return 'NotApplicable';

      case 'first-applicable':
        for (const d of decisions) {
          if (d === 'Permit' || d === 'Deny') return d;
        }
        return 'NotApplicable';

      case 'only-one-applicable': {
        const app = decisions.filter(d => d !== 'NotApplicable');
        if (app.length === 1) return app[0];
        if (app.length > 1)   return 'Indeterminate';
        return 'NotApplicable';
      }

      default: // deny-overrides as fallback
        if (decisions.some(d => d === 'Deny'))   return 'Deny';
        if (decisions.some(d => d === 'Permit')) return 'Permit';
        return 'NotApplicable';
    }
  }

  // Evaluiert die komplette Policy gegen einen Request.
  // Geht jede Regel durch: zuerst Target-Match prüfen, dann Conditions.
  // Sammelt ruleTraces für das Trace-Highlighting im Node-Canvas.
  // Gibt { decision, policyId, combiningAlg, ruleTraces } zurück.
  function _evaluatePolicy(policy, request) {
    if (!policy) return { decision: 'Indeterminate', ruleTraces: [], error: 'No policy' };
    if (!policy.rules || policy.rules.length === 0) {
      return { decision: 'NotApplicable', ruleTraces: [], policyId: policy.id, combiningAlg: policy.combiningAlg };
    }

    const ruleTraces  = [];
    const decisions   = [];
    const algShort    = (policy.combiningAlg || '').split(':').pop();
    let   firstApplied = false; // Für first-applicable: nach erster passenden Regel stoppen

    for (const rule of policy.rules) {
      const rt = {
        ruleId:         rule.id,
        ruleName:       rule.description || rule.id || I18n.t('sim.trace.unnamed'),
        ruleEffect:     rule.effect,
        decision:       'NotApplicable',
        targetMatch:    false,
        conditionMatch: null,
        targetChecks:   [],
        conditionChecks:[],
        skipped:        false,
      };

      // first-applicable: skip remaining rules once one applied
      if (algShort === 'first-applicable' && firstApplied) {
        rt.skipped = true;
        ruleTraces.push(rt);
        decisions.push('NotApplicable');
        continue;
      }

      const { match: targetMatch, checks: targetChecks } = _evaluateTarget(rule.target, request);
      rt.targetMatch  = targetMatch;
      rt.targetChecks = targetChecks;

      if (!targetMatch) {
        decisions.push('NotApplicable');
        ruleTraces.push(rt);
        continue;
      }

      const { match: condMatch, checks: condChecks } = _evaluateConditions(rule.conditions, rule.conditionOp, request);
      rt.conditionMatch  = condMatch;
      rt.conditionChecks = condChecks;

      if (!condMatch) {
        decisions.push('NotApplicable');
      } else {
        rt.decision = rule.effect; // 'Permit' | 'Deny'
        decisions.push(rule.effect);
        if (algShort === 'first-applicable') firstApplied = true;
      }

      ruleTraces.push(rt);
    }

    return {
      decision:    _applyAlgorithm(policy.combiningAlg, decisions),
      policyId:    policy.id,
      combiningAlg: policy.combiningAlg,
      ruleTraces,
    };
  }

  // ── Request builders ──────────────────────────────────────────────────

  // Erstellt das Request-Objekt aus dem Formular-State.
  // Kombiniert Standard-Felder (Rolle, SubjectId, Aktion, Ressource),
  // Zusatz-Attribute und automatisch erkannte Condition-Attribute.
  function _buildRequestFromForm() {
    const req = { subject: {}, resource: {}, action: {}, environment: {} };
    if (_formState.role)      req.subject[_formState.roleAttrId      || 'urn:oasis:names:tc:xacml:2.0:subject:role']              = _formState.role;
    if (_formState.subjectId) req.subject[_formState.subjectIdAttrId || 'urn:oasis:names:tc:xacml:1.0:subject:subject-id']        = _formState.subjectId;
    if (_formState.action)    req.action[_formState.actionAttrId     || 'urn:oasis:names:tc:xacml:1.0:action:action-id']          = _formState.action;
    if (_formState.resource)  req.resource[_formState.resourceAttrId || 'urn:oasis:names:tc:xacml:1.0:resource:resource-id']      = _formState.resource;
    for (const attr of (_formState.extraAttrs || [])) {
      if (!attr.attrId || !attr.value) continue;
      const cat = attr.cat || 'subject';
      if (req[cat]) req[cat][attr.attrId] = attr.value;
    }
    for (const attr of (_formState.conditionAttrs || [])) {
      if (!attr.attrId || attr.value === '') continue;
      const cat = attr.cat || 'subject';
      if (req[cat]) req[cat][attr.attrId] = attr.value;
    }
    return req;
  }

  // Parst einen XACML Request XML-String in das interne Request-Objekt.
  // Unterstützt XACML 3.0 (<Attributes Category="...">) und
  // XACML 2.0 Fallback (<Subject/Resource/Action> mit direkten <Attribute>-Kindern).
  function _parseXmlRequest(xmlStr) {
    const req = { subject: {}, resource: {}, action: {}, environment: {} };
    if (!xmlStr || !xmlStr.trim()) return { ...req, error: 'Empty input' };
    try {
      const doc        = new DOMParser().parseFromString(xmlStr, 'application/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) throw new Error(parseError.textContent.split('\n')[0].trim());

      // XACML 3.0: <Attributes Category="..."><Attribute ...><AttributeValue>
      doc.querySelectorAll('Attributes').forEach(attrs => {
        const catKey = _condCatToKey(attrs.getAttribute('Category') || '');
        attrs.querySelectorAll('Attribute').forEach(attr => {
          const id  = attr.getAttribute('AttributeId') || '';
          const val = attr.querySelector('AttributeValue');
          if (id && val) req[catKey][id] = val.textContent.trim();
        });
      });

      // XACML 2.0 fallback: <Subject/Resource/Action> with direct <Attribute> children
      doc.querySelectorAll('Subject > Attribute').forEach(attr => {
        const id = attr.getAttribute('AttributeId') || '';
        const val = attr.querySelector('AttributeValue');
        if (id && val) req.subject[id] = val.textContent.trim();
      });
      doc.querySelectorAll('Resource > Attribute').forEach(attr => {
        const id = attr.getAttribute('AttributeId') || '';
        const val = attr.querySelector('AttributeValue');
        if (id && val) req.resource[id] = val.textContent.trim();
      });
      doc.querySelectorAll('Action > Attribute').forEach(attr => {
        const id = attr.getAttribute('AttributeId') || '';
        const val = attr.querySelector('AttributeValue');
        if (id && val) req.action[id] = val.textContent.trim();
      });
    } catch (e) {
      return { ...req, error: e.message };
    }
    return req;
  }

  // ── History management ────────────────────────────────────────────────

  function _addToHistory(request, result) {
    _history.unshift({
      id:        Date.now().toString(36),
      ts:        new Date().toISOString(),
      mode:      _mode,
      formState: _mode === 'simple' ? { ..._formState, extraAttrs: [...(_formState.extraAttrs || [])] } : null,
      xmlInput:  _mode === 'xml'    ? _xmlInput : null,
      decision:  result.decision,
    });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
    _saveHistory();
  }

  function _replayHistoryItem(item) {
    if (item.mode === 'simple' && item.formState) {
      _mode      = 'simple';
      _formState = { ...item.formState, extraAttrs: [...(item.formState.extraAttrs || [])] };
    } else if (item.mode === 'xml' && item.xmlInput) {
      _mode     = 'xml';
      _xmlInput = item.xmlInput;
    }
    _panel  = 'evaluate';
    _result = null;
    _render();
    _runSimulation();
  }

  // ── Test cases ────────────────────────────────────────────────────────

  function _exportTests() {
    if (_tests.length === 0) return;
    const json = JSON.stringify(_tests, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'xacml-testcases.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function _importTests(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('Not an array');
        // Merge: avoid duplicates by id
        const existingIds = new Set(_tests.map(t => t.id));
        let added = 0;
        for (const t of imported) {
          if (t && t.id && t.name) {
            if (!existingIds.has(t.id)) { _tests.push(t); added++; }
          }
        }
        _saveTests();
        _panel = 'tests';
        _render();
      } catch {
        alert(I18n.t('sim.tests.importError'));
      }
    };
    reader.readAsText(file);
  }

  function _runAllTests() {
    const policy = _getPolicy ? _getPolicy() : null;
    if (!policy) return;
    let changed = false;
    for (const test of _tests) {
      let request;
      if (test.mode === 'simple' && test.formState) {
        const prevState = { ..._formState, extraAttrs: [...(_formState.extraAttrs || [])] };
        const prevMode  = _mode;
        _formState = { ...test.formState, extraAttrs: [...(test.formState.extraAttrs || [])] };
        _mode      = 'simple';
        request    = _buildRequestFromForm();
        _formState = prevState;
        _mode      = prevMode;
      } else if (test.mode === 'xml' && test.xmlInput) {
        request = _parseXmlRequest(test.xmlInput);
      } else continue;
      const r         = _evaluatePolicy(policy, request);
      test.lastRun    = { decision: r.decision, passed: r.decision === test.expectedDecision, ts: new Date().toISOString() };
      changed         = true;
    }
    if (changed) _saveTests();
    // Re-render tests panel
    const content = document.getElementById('sim-content');
    if (content && _panel === 'tests') content.innerHTML = _renderTestsHtml();
  }

  // ── Main simulation runner ────────────────────────────────────────────

  function _runSimulation() {
    _collectFormState();
    const errEl = document.getElementById('sim-error');
    if (errEl) errEl.style.display = 'none';

    const policy = _getPolicy ? _getPolicy() : null;
    if (!policy || !policy.rules) {
      if (errEl) { errEl.textContent = I18n.t('sim.err.noPolicy'); errEl.style.display = ''; }
      return;
    }

    let request;
    if (_mode === 'simple') {
      request = _buildRequestFromForm();
    } else {
      const ta = document.getElementById('sim-xml-input');
      if (ta) _xmlInput = ta.value.trim();
      request = _parseXmlRequest(_xmlInput);
      if (request.error) {
        if (errEl) { errEl.textContent = I18n.t('sim.err.xmlParse') + ': ' + request.error; errEl.style.display = ''; }
        return;
      }
    }

    _result = _evaluatePolicy(policy, request);
    _addToHistory(request, _result);

    // Apply trace to node canvas
    const ne = _getNodeEditor ? _getNodeEditor() : null;
    if (ne && ne.setTraceResult) ne.setTraceResult(_result);

    _renderResult();
  }

  // ── Form state collector ──────────────────────────────────────────────

  function _collectFormState() {
    const role          = document.getElementById('sim-role');
    const roleAtrid     = document.getElementById('sim-role-atrid');
    const subId         = document.getElementById('sim-subjectid');
    const subIdAtrid    = document.getElementById('sim-subjectid-atrid');
    const action        = document.getElementById('sim-action');
    const actionAtrid   = document.getElementById('sim-action-atrid');
    const resource      = document.getElementById('sim-resource');
    const resourceAtrid = document.getElementById('sim-resource-atrid');
    if (role)          _formState.role            = role.value.trim();
    if (roleAtrid)     _formState.roleAttrId      = roleAtrid.value;
    if (subId)         _formState.subjectId       = subId.value.trim();
    if (subIdAtrid)    _formState.subjectIdAttrId = subIdAtrid.value;
    if (action)        _formState.action          = action.value.trim();
    if (actionAtrid)   _formState.actionAttrId    = actionAtrid.value;
    if (resource)      _formState.resource        = resource.value.trim();
    if (resourceAtrid) _formState.resourceAttrId  = resourceAtrid.value;

    const extraRows = document.querySelectorAll('#sim-extra-attrs .sim-extra-attr');
    const newExtras = [];
    extraRows.forEach(row => {
      const catSel    = row.querySelector('.sim-extra-cat');
      const atridSel  = row.querySelector('.sim-extra-atrid-sel');
      const atridCustom = row.querySelector('.sim-extra-atrid');
      const valInput  = row.querySelector('.sim-extra-val');
      const selVal    = atridSel?.value || '';
      const attrId    = selVal === '__custom__' ? (atridCustom?.value || '') : selVal;
      newExtras.push({
        cat:    catSel?.value || 'subject',
        attrId,
        value:  valInput?.value || '',
      });
    });
    _formState.extraAttrs = newExtras;

    const condInputs = document.querySelectorAll('.sim-cond-val');
    const condAttrs  = [];
    condInputs.forEach(inp => {
      condAttrs.push({
        cat:    inp.dataset.condCat   || 'subject',
        attrId: inp.dataset.condAtrid || '',
        value:  inp.value,
      });
    });
    _formState.conditionAttrs = condAttrs;
  }

  // ── HTML helpers ──────────────────────────────────────────────────────

  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _t(key, vars) { return I18n.t(key, vars); }

  function _formatAttrId(attrId) {
    if (!attrId) return '?';
    const parts = attrId.split(':');
    return parts[parts.length - 1] || attrId;
  }

  function _histItemSummary(item) {
    if (item.mode === 'simple' && item.formState) {
      const s = item.formState;
      const parts = [];
      if (s.role)      parts.push(`role=${s.role}`);
      if (s.subjectId) parts.push(`id=${s.subjectId}`);
      if (s.action)    parts.push(`action=${s.action}`);
      if (s.resource)  parts.push(`resource=${s.resource}`);
      return parts.join(', ') || '(empty request)';
    }
    if (item.mode === 'xml') return 'XML Request';
    return '–';
  }

  // ── Render functions ──────────────────────────────────────────────────

  function _render() {
    if (!_container) return;
    _container.innerHTML = `
      <div class="sim-wrap">
        <div class="sim-panel-tabs">
          <button class="sim-panel-tab${_panel==='evaluate'?' active':''}" data-simpanel="evaluate">&#x25B6; ${_esc(_t('sim.tab.evaluate'))}</button>
          <button class="sim-panel-tab${_panel==='history' ?' active':''}" data-simpanel="history">&#x1F553; ${_esc(_t('sim.tab.history'))}</button>
          <button class="sim-panel-tab${_panel==='tests'   ?' active':''}" data-simpanel="tests">&#x1F9EA; ${_esc(_t('sim.tab.tests'))}</button>
        </div>
        <div class="sim-content" id="sim-content">
          ${_renderPanelContent()}
        </div>
      </div>`;
    _attachEvents();
  }

  function _renderPanelContent() {
    switch (_panel) {
      case 'evaluate': return _renderEvaluateHtml();
      case 'history':  return _renderHistoryHtml();
      case 'tests':    return _renderTestsHtml();
      default:         return '';
    }
  }

  function _renderConditionSectionHtml() {
    const policy = _getPolicy ? _getPolicy() : null;
    if (!policy) return '';

    // Collect unique condition attributes from all rules
    const seen = new Map(); // "cat::attrId" → { cat, attrId, functionId, arg2Value }
    for (const rule of (policy.rules || [])) {
      for (const c of (rule.conditions || [])) {
        if (!c.arg1AttrId) continue;
        const cat = _condCatToKey(c.arg1Cat);
        const key = `${cat}::${c.arg1AttrId}`;
        if (!seen.has(key)) {
          seen.set(key, { cat, attrId: c.arg1AttrId, functionId: c.functionId, arg2Value: c.arg2Value });
        }
      }
    }
    if (seen.size === 0) return '';

    const rows = [...seen.values()].map(c => {
      const existing = (_formState.conditionAttrs || []).find(x => x.cat === c.cat && x.attrId === c.arg1AttrId || x.attrId === c.attrId);
      const val      = existing?.value ?? '';
      const fnLabel  = (c.functionId || '').split(':').pop();
      return `
        <div class="sim-cond-row">
          <div class="sim-cond-hint">
            <span class="sim-cond-atrid">${_esc(_formatAttrId(c.attrId))}</span>
            <code class="sim-check-fn">${_esc(fnLabel)}</code>
            <code class="sim-cond-expected">${_esc(c.arg2Value || '?')}</code>
          </div>
          <input class="sim-input sim-cond-val" type="text"
                 data-cond-cat="${_esc(c.cat)}" data-cond-atrid="${_esc(c.attrId)}"
                 placeholder="${_esc(_t('sim.cond.valuePh'))}"
                 value="${_esc(val)}">
        </div>`;
    }).join('');

    return `
      <div class="sim-cond-section">
        <div class="sim-cond-header">
          <span>${_esc(_t('sim.cond.title'))}</span>
          <span class="sim-cond-hint-small">${_esc(_t('sim.cond.hint'))}</span>
        </div>
        <div class="sim-cond-rows">${rows}</div>
      </div>`;
  }

  function _renderEvaluateHtml() {
    const editBanner = _editingTestIdx >= 0
      ? `<div class="sim-editing-banner">
           &#x270F; ${_esc(_t('sim.edit.banner', { name: _tests[_editingTestIdx]?.name || '' }))}
           <button class="sim-edit-cancel-btn" id="sim-edit-cancel">${_esc(_t('sim.edit.cancel'))}</button>
         </div>`
      : '';
    const saveLabel = _editingTestIdx >= 0 ? _t('sim.edit.save') : _t('sim.saveTest.btn');
    return `
      <div class="sim-evaluate-wrap">
        <div class="sim-input-section">
          ${editBanner}
          <div class="sim-mode-toggle">
            <button class="sim-mode-btn${_mode==='simple'?' active':''}" data-simmode="simple">${_esc(_t('sim.mode.simple'))}</button>
            <button class="sim-mode-btn${_mode==='xml'   ?' active':''}" data-simmode="xml">${_esc(_t('sim.mode.xml'))}</button>
          </div>
          <div class="sim-error" id="sim-error" style="display:none"></div>
          <div id="sim-input-area">
            ${_mode === 'simple' ? _renderSimpleFormHtml() : _renderXmlFormHtml()}
          </div>
          <div class="sim-actions-row">
            <button class="sim-run-btn" id="sim-run-btn">&#x25B6; ${_esc(_t('sim.run'))}</button>
            <button class="sim-save-test-btn" id="sim-save-test-btn" title="${_esc(_t('sim.saveTest.title'))}">${_esc(saveLabel)}</button>
          </div>
        </div>
        <div class="sim-result-section" id="sim-result-section">
          ${_result ? _renderResultHtml(_result) : `<div class="sim-result-placeholder">${_esc(_t('sim.result.placeholder'))}</div>`}
        </div>
      </div>`;
  }

  function _simAttrIdOpts(cat, currentAttrId, includeCustom = true) {
    const opts     = SIM_ATTR_ID_OPTIONS[cat] || [];
    const isCustom = includeCustom && currentAttrId && !opts.find(o => o.value === currentAttrId);
    const optHtml  = opts.map(o =>
      `<option value="${_esc(o.value)}"${!isCustom && currentAttrId === o.value ? ' selected' : ''}>${_esc(I18n.t(o.labelKey))}</option>`
    ).join('');
    return includeCustom
      ? optHtml + `<option value="__custom__"${isCustom ? ' selected' : ''}>${_esc(_t('creator.target.attrId.custom'))}</option>`
      : optHtml;
  }

  function _renderSimpleFormHtml() {
    const s = _formState;
    const extraRows = (s.extraAttrs || []).map((attr, i) => {
      const cat      = attr.cat || 'subject';
      const isCustom = attr.attrId && !(SIM_ATTR_ID_OPTIONS[cat] || []).find(o => o.value === attr.attrId);
      return `
      <div class="sim-extra-attr" data-extra-idx="${i}">
        <select class="sim-select sim-extra-cat">
          <option value="subject"${    cat==='subject'    ?' selected':''}>Subject</option>
          <option value="resource"${   cat==='resource'   ?' selected':''}>Resource</option>
          <option value="action"${     cat==='action'     ?' selected':''}>Action</option>
          <option value="environment"${cat==='environment'?' selected':''}>Environment</option>
        </select>
        <div class="sim-atrid-wrap">
          <select class="sim-select sim-extra-atrid-sel">${_simAttrIdOpts(cat, attr.attrId)}</select>
          <input class="sim-input sim-extra-atrid" type="text"
                 placeholder="${_esc(_t('creator.target.attrId.custom.ph'))}"
                 value="${_esc(isCustom ? attr.attrId : '')}"
                 style="${isCustom ? '' : 'display:none'}">
        </div>
        <input class="sim-input sim-extra-val" type="text" placeholder="${_esc(_t('sim.field.value'))}"
               value="${_esc(attr.value||'')}">
        <button class="sim-extra-del" data-extrarem="${i}" title="${_esc(_t('sim.extra.remove'))}">&#x2715;</button>
      </div>`;
    }).join('');

    return `
      <div class="sim-simple-form">
        <div class="sim-field-row">
          <label class="sim-label">${_esc(_t('sim.field.role'))}</label>
          <div class="sim-field-input-wrap">
            <select id="sim-role-atrid" class="sim-select sim-field-atrid-sel">
              ${_simAttrIdOpts('subject', s.roleAttrId || 'urn:oasis:names:tc:xacml:2.0:subject:role', false)}
            </select>
            <input id="sim-role" class="sim-input" type="text"
                   placeholder="${_esc(_t('sim.field.role.ph'))}"
                   value="${_esc(s.role||'')}">
          </div>
        </div>
        <div class="sim-field-row">
          <label class="sim-label">${_esc(_t('sim.field.subjectId'))}</label>
          <div class="sim-field-input-wrap">
            <select id="sim-subjectid-atrid" class="sim-select sim-field-atrid-sel">
              ${_simAttrIdOpts('subject', s.subjectIdAttrId || 'urn:oasis:names:tc:xacml:1.0:subject:subject-id', false)}
            </select>
            <input id="sim-subjectid" class="sim-input" type="text"
                   placeholder="${_esc(_t('sim.field.subjectId.ph'))}"
                   value="${_esc(s.subjectId||'')}">
          </div>
        </div>
        <div class="sim-field-row">
          <label class="sim-label">${_esc(_t('sim.field.action'))}</label>
          <div class="sim-field-input-wrap">
            <select id="sim-action-atrid" class="sim-select sim-field-atrid-sel">
              ${_simAttrIdOpts('action', s.actionAttrId || 'urn:oasis:names:tc:xacml:1.0:action:action-id', false)}
            </select>
            <input id="sim-action" class="sim-input" type="text"
                   placeholder="${_esc(_t('sim.field.action.ph'))}"
                   value="${_esc(s.action||'')}">
          </div>
        </div>
        <div class="sim-field-row">
          <label class="sim-label">${_esc(_t('sim.field.resource'))}</label>
          <div class="sim-field-input-wrap">
            <select id="sim-resource-atrid" class="sim-select sim-field-atrid-sel">
              ${_simAttrIdOpts('resource', s.resourceAttrId || 'urn:oasis:names:tc:xacml:1.0:resource:resource-id', false)}
            </select>
            <input id="sim-resource" class="sim-input" type="text"
                   placeholder="${_esc(_t('sim.field.resource.ph'))}"
                   value="${_esc(s.resource||'')}">
          </div>
        </div>
        <div id="sim-extra-attrs" class="sim-extra-attrs">${extraRows}</div>
        <button class="sim-add-attr-btn" id="sim-add-attr">+ ${_esc(_t('sim.extra.add'))}</button>
        ${_renderConditionSectionHtml()}
      </div>`;
  }

  function _renderXmlFormHtml() {
    return `
      <div class="sim-xml-form">
        <label class="sim-label">${_esc(_t('sim.xml.label'))}</label>
        <textarea id="sim-xml-input" class="sim-xml-input"
                  placeholder="${_esc(_t('sim.xml.ph'))}"
                  spellcheck="false">${_esc(_xmlInput)}</textarea>
      </div>`;
  }

  function _renderResultHtml(result) {
    const { decision, combiningAlg, ruleTraces } = result;
    const decisionKey = `sim.decision.${decision.toLowerCase()}`;
    const cls         = decision === 'Permit' ? 'permit' : decision === 'Deny' ? 'deny' : decision === 'NotApplicable' ? 'na' : 'indet';
    const icon        = cls === 'permit' ? '&#x2705;' : cls === 'deny' ? '&#x274C;' : cls === 'na' ? '&#x26AA;' : '&#x26A0;&#xFE0F;';
    const algShort    = (combiningAlg || '').split(':').pop();
    const traceRows   = (ruleTraces || []).map(_renderRuleTraceHtml).join('');

    return `
      <div class="sim-result-wrap">
        <div class="sim-result-banner sim-result-banner--${_esc(cls)}">
          <span class="sim-result-icon">${icon}</span>
          <span class="sim-result-label">${_esc(_t(decisionKey))}</span>
        </div>
        <div class="sim-trace">
          <div class="sim-trace-header">
            <span class="sim-trace-title">${_esc(_t('sim.trace.title'))}</span>
            <span class="sim-trace-alg">${_esc(_t('sim.trace.alg'))}: <code class="sim-alg-code">${_esc(algShort)}</code></span>
          </div>
          <div class="sim-trace-rules">
            ${traceRows || `<div class="sim-trace-empty">${_esc(_t('sim.trace.norules'))}</div>`}
          </div>
        </div>
      </div>`;
  }

  function _renderRuleTraceHtml(rt) {
    const decisionCls  = rt.decision === 'Permit' ? 'permit' : rt.decision === 'Deny' ? 'deny' : 'na';
    const effectIcon   = rt.ruleEffect === 'Permit' ? '&#x2705;' : '&#x274C;';
    const decisionIcon = rt.decision === 'Permit' ? '&#x2705;' : rt.decision === 'Deny' ? '&#x274C;' : '&#x26AA;';

    if (rt.skipped) {
      return `
        <div class="sim-rule-trace sim-rule-trace--skip">
          <div class="sim-rule-hdr">
            <span class="sim-rule-skip-icon">&#x23ED;</span>
            <span class="sim-rule-name">${_esc(rt.ruleName)}</span>
            <span class="sim-rule-id">${rt.ruleId ? '#'+_esc(rt.ruleId) : ''}</span>
            <span class="sim-rule-decision sim-rule-decision--skip">${_esc(_t('sim.trace.skipped'))}</span>
          </div>
        </div>`;
    }

    const targetLabel = rt.targetChecks.length === 0 && rt.targetMatch
      ? `<span class="sim-match-all">${_esc(_t('sim.trace.targetAll'))}</span>`
      : rt.targetMatch
        ? `<span class="sim-match-yes">${_esc(_t('sim.trace.targetMatch'))}</span>`
        : `<span class="sim-match-no">${_esc(_t('sim.trace.targetMiss'))}</span>`;

    const targetChecksHtml = (rt.targetChecks || []).map(c => {
      const icon  = c.match ? '&#x2705;' : '&#x274C;';
      const label = _formatAttrId(c.attrId);
      return `
        <div class="sim-check sim-check--${c.match ? 'match' : 'miss'}">
          ${icon} <span class="sim-check-label">${_esc(label)}</span>:
          <code class="sim-check-val">${_esc(c.expected)}</code>
          ${c.actual ? `&#8596; <code class="sim-check-actual">${_esc(c.actual)}</code>` : `<span class="sim-check-missing">(${_esc(_t('sim.check.noValue'))})</span>`}
        </div>`;
    }).join('');

    const condLabel = rt.conditionMatch === true
      ? `<span class="sim-match-yes">${_esc(_t('sim.trace.condMatch'))}</span>`
      : rt.conditionMatch === false
        ? `<span class="sim-match-no">${_esc(_t('sim.trace.condMiss'))}</span>`
        : '';

    const condChecksHtml = (rt.conditionChecks || []).map(c => {
      const icon  = c.match ? '&#x2705;' : '&#x274C;';
      const label = _formatAttrId(c.attrId);
      const fn    = (c.functionId || '').split(':').pop();
      return `
        <div class="sim-check sim-check--${c.match ? 'match' : 'miss'}">
          ${icon} <span class="sim-check-label">${_esc(label)}</span>
          <code class="sim-check-fn">${_esc(fn)}</code>
          <code class="sim-check-val">${_esc(c.expected)}</code>
          ${c.actual ? `&#8596; <code class="sim-check-actual">${_esc(c.actual)}</code>` : `<span class="sim-check-missing">(${_esc(_t('sim.check.noValue'))})</span>`}
        </div>`;
    }).join('');

    const hasConditions = rt.conditionChecks && rt.conditionChecks.length > 0;

    return `
      <div class="sim-rule-trace sim-rule-trace--${_esc(decisionCls)}">
        <div class="sim-rule-hdr">
          <span class="sim-rule-effect-icon">${effectIcon}</span>
          <span class="sim-rule-name">${_esc(rt.ruleName)}</span>
          ${rt.ruleId ? `<span class="sim-rule-id">#${_esc(rt.ruleId)}</span>` : ''}
          <span class="sim-rule-decision sim-rule-decision--${_esc(decisionCls)}">${decisionIcon} ${_esc(_t(`sim.decision.${rt.decision.toLowerCase()}`))}</span>
        </div>
        <div class="sim-rule-body">
          <div class="sim-check-section">
            <div class="sim-check-section-hdr">${_esc(_t('sim.trace.target'))}: ${targetLabel}</div>
            ${targetChecksHtml}
          </div>
          ${hasConditions ? `
          <div class="sim-check-section">
            <div class="sim-check-section-hdr">${_esc(_t('sim.trace.conditions'))}: ${condLabel}</div>
            ${condChecksHtml}
          </div>` : ''}
        </div>
      </div>`;
  }

  function _renderHistoryHtml() {
    if (_history.length === 0) {
      return `<div class="sim-empty-state">${_esc(_t('sim.history.empty'))}</div>`;
    }
    const rows = _history.map((item, i) => {
      const cls  = item.decision === 'Permit' ? 'permit' : item.decision === 'Deny' ? 'deny' : item.decision === 'NotApplicable' ? 'na' : 'indet';
      const icon = cls === 'permit' ? '&#x2705;' : cls === 'deny' ? '&#x274C;' : cls === 'na' ? '&#x26AA;' : '&#x26A0;&#xFE0F;';
      const ts   = new Date(item.ts).toLocaleTimeString();
      return `
        <div class="sim-history-item">
          <span class="sim-hist-icon">${icon}</span>
          <div class="sim-hist-body">
            <div class="sim-hist-summary">${_esc(_histItemSummary(item))}</div>
            <div class="sim-hist-meta">${_esc(ts)} · <code>${_esc(item.decision)}</code></div>
          </div>
          <button class="sim-hist-replay" data-histidx="${i}" title="${_esc(_t('sim.history.replay'))}">&#x25B6;</button>
        </div>`;
    }).join('');

    return `
      <div class="sim-history-wrap">
        <div class="sim-section-header">
          <span>${_esc(_t('sim.history.title'))}</span>
          <button class="sim-clear-btn" id="sim-history-clear">${_esc(_t('sim.history.clear'))}</button>
        </div>
        <div class="sim-history-list">${rows}</div>
      </div>`;
  }

  function _renderTestsHtml() {
    const rows = _tests.map((test, i) => {
      const lr        = test.lastRun;
      const passIcon  = lr ? (lr.passed ? '&#x2705;' : '&#x274C;') : '–';
      const statusCls = lr ? (lr.passed ? 'pass' : 'fail') : 'pending';
      const expKey    = `sim.decision.${(test.expectedDecision || 'permit').toLowerCase()}`;
      return `
        <div class="sim-test-item">
          <div class="sim-test-row">
            <span class="sim-test-status sim-test-status--${_esc(statusCls)}">${passIcon}</span>
            <div class="sim-test-info">
              <span class="sim-test-name">${_esc(test.name)}</span>
              <span class="sim-test-expected">&#x2192; ${_esc(_t(expKey))}</span>
              ${lr ? `<span class="sim-test-actual sim-test-actual--${lr.passed?'pass':'fail'}">got: <code>${_esc(lr.decision)}</code></span>` : ''}
            </div>
            <div class="sim-test-btns">
              <button class="sim-test-edit" data-testedit="${i}" title="${_esc(_t('sim.tests.edit'))}">&#x270F;</button>
              <button class="sim-test-del" data-testdel="${i}" title="${_esc(_t('sim.tests.delete'))}">&#x2715;</button>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="sim-tests-wrap">
        <div class="sim-section-header">
          <span>${_esc(_t('sim.tests.title'))}</span>
          <div class="sim-tests-actions">
            ${_tests.length > 0 ? `<button class="sim-run-all-btn" id="sim-tests-run-all">&#x25B6; ${_esc(_t('sim.tests.runAll'))}</button>` : ''}
            ${_tests.length > 0 ? `<button class="sim-icon-btn" id="sim-tests-export" title="${_esc(_t('sim.tests.export'))}">&#x2B07; ${_esc(_t('sim.tests.export'))}</button>` : ''}
            <button class="sim-icon-btn" id="sim-tests-import" title="${_esc(_t('sim.tests.import'))}">&#x2B06; ${_esc(_t('sim.tests.import'))}</button>
            <input type="file" id="sim-tests-import-file" accept=".json" style="display:none">
          </div>
        </div>
        ${_tests.length === 0
          ? `<div class="sim-empty-state">${_esc(_t('sim.tests.empty'))}</div>`
          : `<div class="sim-tests-list">${rows}</div>`}
      </div>`;
  }

  function _renderResult() {
    const el = document.getElementById('sim-result-section');
    if (!el) return;
    el.innerHTML = _result
      ? _renderResultHtml(_result)
      : `<div class="sim-result-placeholder">${_esc(_t('sim.result.placeholder'))}</div>`;
  }

  function _refreshInputArea() {
    const el = document.getElementById('sim-input-area');
    if (!el) return;
    el.innerHTML = _mode === 'simple' ? _renderSimpleFormHtml() : _renderXmlFormHtml();
  }

  // ── Event handling ────────────────────────────────────────────────────

  function _attachEvents() {
    const wrap = _container.querySelector('.sim-wrap');
    if (!wrap) return;
    wrap.addEventListener('click',  _handleClick);
    wrap.addEventListener('input',  _handleInput);
    wrap.addEventListener('change', _handleChange);
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.closest('.sim-simple-form')) {
        e.preventDefault();
        _runSimulation();
      }
    });
  }

  function _handleClick(e) {
    // Panel tab
    const panelBtn = e.target.closest('[data-simpanel]');
    if (panelBtn) {
      _collectFormState();
      _panel = panelBtn.dataset.simpanel;
      _render();
      return;
    }

    // Mode toggle
    const modeBtn = e.target.closest('[data-simmode]');
    if (modeBtn) {
      _collectFormState();
      _mode = modeBtn.dataset.simmode;
      _refreshInputArea();
      // Update toggle buttons active state
      _container.querySelectorAll('[data-simmode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.simmode === _mode);
      });
      return;
    }

    // Run simulation
    if (e.target.id === 'sim-run-btn' || e.target.closest('#sim-run-btn')) {
      _runSimulation();
      return;
    }

    // Add extra attribute
    if (e.target.id === 'sim-add-attr' || e.target.closest('#sim-add-attr')) {
      _collectFormState();
      _formState.extraAttrs = _formState.extraAttrs || [];
      _formState.extraAttrs.push({ cat: 'subject', attrId: '', value: '' });
      _refreshInputArea();
      return;
    }

    // Remove extra attribute
    const remBtn = e.target.closest('[data-extrarem]');
    if (remBtn) {
      _collectFormState();
      const idx = parseInt(remBtn.dataset.extrarem, 10);
      if (!isNaN(idx)) _formState.extraAttrs.splice(idx, 1);
      _refreshInputArea();
      return;
    }

    // History replay
    const replayBtn = e.target.closest('[data-histidx]');
    if (replayBtn) {
      const idx = parseInt(replayBtn.dataset.histidx, 10);
      if (!isNaN(idx) && _history[idx]) _replayHistoryItem(_history[idx]);
      return;
    }

    // Clear history
    if (e.target.id === 'sim-history-clear') {
      _history = [];
      _saveHistory();
      _render();
      return;
    }

    // Save as test case
    if (e.target.id === 'sim-save-test-btn' || e.target.closest('#sim-save-test-btn')) {
      _collectFormState();
      _promptSaveTest();
      return;
    }

    // Run all tests
    if (e.target.id === 'sim-tests-run-all' || e.target.closest('#sim-tests-run-all')) {
      _runAllTests();
      return;
    }

    // Export tests
    if (e.target.id === 'sim-tests-export' || e.target.closest('#sim-tests-export')) {
      _exportTests();
      return;
    }

    // Import tests — trigger hidden file input
    if (e.target.id === 'sim-tests-import' || e.target.closest('#sim-tests-import')) {
      document.getElementById('sim-tests-import-file')?.click();
      return;
    }

    // Delete test case
    const delBtn = e.target.closest('[data-testdel]');
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.testdel, 10);
      if (!isNaN(idx)) {
        if (_editingTestIdx === idx) _editingTestIdx = -1;
        _tests.splice(idx, 1);
        _saveTests();
        _render();
      }
      return;
    }

    // Edit test case
    const editBtn = e.target.closest('[data-testedit]');
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.testedit, 10);
      if (!isNaN(idx) && _tests[idx]) {
        const test = _tests[idx];
        if (test.mode === 'simple' && test.formState) {
          _mode      = 'simple';
          _formState = {
            ...test.formState,
            extraAttrs:     [...(test.formState.extraAttrs     || [])],
            conditionAttrs: [...(test.formState.conditionAttrs || [])],
          };
        } else if (test.mode === 'xml' && test.xmlInput) {
          _mode     = 'xml';
          _xmlInput = test.xmlInput;
        }
        _editingTestIdx = idx;
        _panel  = 'evaluate';
        _result = null;
        _render();
      }
      return;
    }

    // Cancel editing
    if (e.target.id === 'sim-edit-cancel' || e.target.closest('#sim-edit-cancel')) {
      _editingTestIdx = -1;
      _panel = 'tests';
      _render();
      return;
    }
  }

  function _handleInput(e) {
    if (e.target.id === 'sim-xml-input') _xmlInput = e.target.value;
  }

  function _handleChange(e) {
    // Import file selected
    if (e.target.id === 'sim-tests-import-file') {
      _importTests(e.target.files?.[0]);
      e.target.value = ''; // reset so same file can be re-imported
      return;
    }
    // Category changed → rebuild attrId dropdown with options for new category
    if (e.target.classList.contains('sim-extra-cat')) {
      const row   = e.target.closest('.sim-extra-attr');
      if (!row) return;
      const newCat = e.target.value;
      const atridSel    = row.querySelector('.sim-extra-atrid-sel');
      const atridCustom = row.querySelector('.sim-extra-atrid');
      if (atridSel) {
        atridSel.innerHTML = _simAttrIdOpts(newCat, '');
        if (atridCustom) atridCustom.style.display = 'none';
      }
      return;
    }
    // AttrId dropdown changed → show/hide custom text input
    if (e.target.classList.contains('sim-extra-atrid-sel')) {
      const row = e.target.closest('.sim-extra-attr');
      if (!row) return;
      const customInput = row.querySelector('.sim-extra-atrid');
      if (customInput) {
        const isCustom = e.target.value === '__custom__';
        customInput.style.display = isCustom ? '' : 'none';
        if (isCustom) { customInput.value = ''; customInput.focus(); }
      }
      return;
    }
  }

  function _captureFormState() {
    return _mode === 'simple' ? {
      ..._formState,
      extraAttrs:     [...(_formState.extraAttrs     || [])],
      conditionAttrs: [...(_formState.conditionAttrs || [])],
    } : null;
  }

  function _promptSaveTest() {
    const validDecisions = ['Permit', 'Deny', 'NotApplicable', 'Indeterminate'];

    if (_editingTestIdx >= 0) {
      // Update existing test case
      const existing = _tests[_editingTestIdx];
      if (!existing) return;
      const defaultExpected = _result?.decision || existing.expectedDecision || 'Permit';
      const expectedRaw = window.prompt(_t('sim.saveTest.expectedPrompt'), defaultExpected);
      if (expectedRaw === null) return;
      const expected = validDecisions.includes(expectedRaw) ? expectedRaw : existing.expectedDecision;
      existing.mode             = _mode;
      existing.formState        = _captureFormState();
      existing.xmlInput         = _mode === 'xml' ? _xmlInput : null;
      existing.expectedDecision = expected;
      existing.lastRun          = null; // reset last run since request changed
      _saveTests();
      _editingTestIdx = -1;
      _panel = 'tests';
      _render();
      return;
    }

    // Create new test case
    const name = window.prompt(_t('sim.saveTest.namePrompt'), `Test ${_tests.length + 1}`);
    if (!name) return;
    const defaultExpected = _result?.decision || 'Permit';
    const expectedRaw = window.prompt(_t('sim.saveTest.expectedPrompt'), defaultExpected);
    if (expectedRaw === null) return;
    const expected = validDecisions.includes(expectedRaw) ? expectedRaw : 'Permit';
    _tests.push({
      id:               Date.now().toString(36),
      name,
      mode:             _mode,
      formState:        _captureFormState(),
      xmlInput:         _mode === 'xml' ? _xmlInput : null,
      expectedDecision: expected,
      lastRun:          null,
    });
    _saveTests();
    _panel = 'tests';
    _render();
  }

  // ── Public API ────────────────────────────────────────────────────────

  function init(container, getPolicy, getNodeEditor) {
    _container     = container;
    _getPolicy     = getPolicy;
    _getNodeEditor = getNodeEditor || null;
    // Note: _result is intentionally NOT reset here so trace persists across tab switches
    _render();
    if (!_i18nRegistered) {
      document.addEventListener('i18n:change', refresh);
      _i18nRegistered = true;
    }
    // Re-apply trace to node canvas if result exists (user switched tabs and back)
    if (_result) {
      const ne = _getNodeEditor ? _getNodeEditor() : null;
      if (ne && ne.setTraceResult) ne.setTraceResult(_result);
    }
  }

  function refresh() {
    if (!_container) return;
    _render();
  }

  function clearTrace() {
    _result = null;
    const ne = _getNodeEditor ? _getNodeEditor() : null;
    if (ne && ne.setTraceResult) ne.setTraceResult(null);
  }

  return { init, refresh, clearTrace };

})();

export { PolicySimulator };
