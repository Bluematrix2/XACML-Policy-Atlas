'use strict';

// ================================================================
//  NODE EDITOR  — Visual Policy Creator (Phase 1)
//  Vanilla JS canvas with draggable nodes, SVG edges, undo/redo.
// ================================================================

import { I18n } from './i18n.js';

const NODE_W      = 230; // node width in canvas pixels — must match .ne-node { width: 230px }
const PORT_Y      = 26;  // port center Y = top:19px + half of 13px height
const INIT_PX     = 30;  // initial panX — keeps nodes well inside viewport
const INIT_PY     = 30;  // initial panY
const NE_SESS_KEY = 'xacml-ne-state'; // sessionStorage key for node layout

// ── Allowed connection rules ────────────────────────────────────────────
const ALLOWED_TARGETS = {
  policy:    ['rule'],
  rule:      ['subject', 'action', 'resource', 'condition'],
  subject:   [],
  action:    [],
  resource:  [],
  condition: [],
  note:      [],
};

// ── Node color cycle ────────────────────────────────────────────────────
const NODE_COLORS = ['', 'blue', 'green', 'orange', 'red', 'purple'];

// ── XACML mappings — aligned with form editor ───────────────────────────
const SUBJECT_ATTR_IDS = {
  role: 'urn:oasis:names:tc:xacml:2.0:subject:role',
  id:   'urn:oasis:names:tc:xacml:1.0:subject:subject-id',
  ip:   'urn:oasis:names:tc:xacml:1.0:subject:authn-locality:ip-address',
  dns:  'urn:oasis:names:tc:xacml:1.0:subject:authn-locality:dns-name',
};

const RESOURCE_ATTR_IDS = [
  { key: 'resource-id', value: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',         labelKey: 'ne.resource.id' },
  { key: 'fhir',        value: 'http://hl7.org/fhir/resource-types',                         labelKey: 'ne.resource.fhir' },
  { key: 'namespace',   value: 'urn:oasis:names:tc:xacml:2.0:resource:target-namespace',     labelKey: 'ne.resource.ns' },
];

const ACTION_ATTR_IDS = [
  { key: 'action-id',      value: 'urn:oasis:names:tc:xacml:1.0:action:action-id',      labelKey: 'ne.action.attrId.actionId' },
  { key: 'implied-action', value: 'urn:oasis:names:tc:xacml:1.0:action:implied-action', labelKey: 'ne.action.attrId.impliedAction' },
];

const NE_COND_FUNCTIONS = [
  { label: 'string-equal',                  value: 'urn:oasis:names:tc:xacml:1.0:function:string-equal' },
  { label: 'string-equal-ignore-case',      value: 'urn:oasis:names:tc:xacml:1.0:function:string-equal-ignore-case' },
  { label: 'integer-equal',                 value: 'urn:oasis:names:tc:xacml:1.0:function:integer-equal' },
  { label: 'boolean-equal',                 value: 'urn:oasis:names:tc:xacml:1.0:function:boolean-equal' },
  { label: 'anyURI-equal',                  value: 'urn:oasis:names:tc:xacml:1.0:function:anyURI-equal' },
  { label: 'date-equal',                    value: 'urn:oasis:names:tc:xacml:1.0:function:date-equal' },
  { label: 'dateTime-equal',                value: 'urn:oasis:names:tc:xacml:1.0:function:dateTime-equal' },
  { label: 'string-at-least-one-member-of', value: 'urn:oasis:names:tc:xacml:1.0:function:string-at-least-one-member-of' },
  { label: 'string-is-in',                  value: 'urn:oasis:names:tc:xacml:1.0:function:string-is-in' },
];

const NE_COND_CATEGORIES = [
  { labelKey: 'ne.cond.cat.subject',     value: 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject' },
  { labelKey: 'ne.cond.cat.resource',    value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource' },
  { labelKey: 'ne.cond.cat.action',      value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action' },
  { labelKey: 'ne.cond.cat.environment', value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:environment' },
];

// ── Advanced match fields — same options as Form Editor ─────────────────
const NE_MATCH_ID_OPTIONS = [
  { label: 'string-equal',              value: 'urn:oasis:names:tc:xacml:1.0:function:string-equal' },
  { label: 'anyURI-equal',              value: 'urn:oasis:names:tc:xacml:1.0:function:anyURI-equal' },
  { label: 'integer-equal',             value: 'urn:oasis:names:tc:xacml:1.0:function:integer-equal' },
  { label: 'date-equal',                value: 'urn:oasis:names:tc:xacml:1.0:function:date-equal' },
  { label: 'CV-equal (HL7) – Coded Value',          value: 'urn:hl7-org:v3:function:CV-equal' },
  { label: 'II-equal (HL7) – Instance Identifier',  value: 'urn:hl7-org:v3:function:II-equal' },
];

const NE_MATCH_DATATYPE_OPTIONS = [
  { label: 'string',                              value: 'http://www.w3.org/2001/XMLSchema#string' },
  { label: 'anyURI',                              value: 'http://www.w3.org/2001/XMLSchema#anyURI' },
  { label: 'integer',                             value: 'http://www.w3.org/2001/XMLSchema#integer' },
  { label: 'date',                                value: 'http://www.w3.org/2001/XMLSchema#date' },
  { label: 'CV (HL7) – Coded Value',              value: 'urn:hl7-org:v3#CV' },
  { label: 'II (HL7) – Instance Identifier',      value: 'urn:hl7-org:v3#II' },
  { label: 'ST (HL7) – Simple Text',              value: 'urn:hl7-org:v3#ST' },
  { label: 'BL (HL7) – Boolean',                  value: 'urn:hl7-org:v3#BL' },
  { label: 'INT (HL7) – Integer',                 value: 'urn:hl7-org:v3#INT' },
  { label: 'TS (HL7) – Timestamp',                value: 'urn:hl7-org:v3#TS' },
  { label: 'CE (HL7) – Coded with Equivalents',   value: 'urn:hl7-org:v3#CE' },
  { label: 'CS (HL7) – Coded Simple Value',       value: 'urn:hl7-org:v3#CS' },
];

const NE_CONDITION_DATA_TYPES = [
  { label: 'string',   value: 'http://www.w3.org/2001/XMLSchema#string' },
  { label: 'integer',  value: 'http://www.w3.org/2001/XMLSchema#integer' },
  { label: 'boolean',  value: 'http://www.w3.org/2001/XMLSchema#boolean' },
  { label: 'anyURI',   value: 'http://www.w3.org/2001/XMLSchema#anyURI' },
  { label: 'date',     value: 'http://www.w3.org/2001/XMLSchema#date' },
  { label: 'dateTime', value: 'http://www.w3.org/2001/XMLSchema#dateTime' },
  { label: 'ST (HL7) – Simple Text',              value: 'urn:hl7-org:v3#ST' },
  { label: 'BL (HL7) – Boolean',                  value: 'urn:hl7-org:v3#BL' },
  { label: 'INT (HL7) – Integer',                 value: 'urn:hl7-org:v3#INT' },
  { label: 'TS (HL7) – Timestamp',                value: 'urn:hl7-org:v3#TS' },
  { label: 'CE (HL7) – Coded with Equivalents',   value: 'urn:hl7-org:v3#CE' },
  { label: 'CS (HL7) – Coded Simple Value',       value: 'urn:hl7-org:v3#CS' },
];

// ── Phase 2: Policy Templates ───────────────────────────────────────────
// Defined outside IIFE so they can reference _uid() lazily via factory fns.
const NE_TEMPLATE_DEFS = [
  {
    id: 'admin-only',
    titleKey: 'ne.tpl.adminOnly.title',
    descKey:  'ne.tpl.adminOnly.desc',
    icon: '🔐',
  },
  {
    id: 'read-write',
    titleKey: 'ne.tpl.readWrite.title',
    descKey:  'ne.tpl.readWrite.desc',
    icon: '📖',
  },
  {
    id: 'time-based',
    titleKey: 'ne.tpl.timeBased.title',
    descKey:  'ne.tpl.timeBased.desc',
    icon: '🕐',
  },
  {
    id: 'department',
    titleKey: 'ne.tpl.dept.title',
    descKey:  'ne.tpl.dept.desc',
    icon: '🏢',
  },
  {
    id: 'physician',
    titleKey: 'ne.tpl.physician.title',
    descKey:  'ne.tpl.physician.desc',
    icon: '🏥',
  },
];

const NodeEditor = (() => {
  // ── Module-level DOM refs ──
  let _wrap        = null;
  let _viewport    = null;
  let _canvas      = null;
  let _svgEl            = null;
  let _svgTransformGroup= null;
  let _edgesGroup       = null;
  let _tempEdgePath     = null;

  // ── Callbacks ──
  let _onPolicyChange = null;
  let _onDownload     = null;

  // ── Editor state ──
  let _nodes    = [];
  let _edges    = [];
  let _zoom     = 1;
  let _panX     = INIT_PX;
  let _panY     = INIT_PY;
  let _history  = [];
  let _histIdx  = -1;
  let _selNode  = null;
  let _selEdge  = null;

  // ── Drag state (nodes + canvas pan) ──
  let _dragNode = null;   // { nodeId, startMX, startMY, origX, origY }
  let _dragPan  = null;   // { startMX, startMY, origPX, origPY }

  // ── Connection drag state ──
  let _dragConn = null;   // { fromId } — active while port is captured

  // ── Palette drag type ──
  let _paletteType = null;

  // ── Helpers ────────────────────────────────────────────────────────────

  function _uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function _esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function _t(key, vars = {}) {
    return I18n.t(key, vars);
  }

  // ── Default node data ──────────────────────────────────────────────────

  function _defaultData(type) {
    switch (type) {
      case 'policy':    return {
        name: 'meine-policy', description: '', version: '2.0',
        combiningAlg: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',
      };
      case 'rule':      return { name: 'regel-1', description: '', effect: 'Permit' };
      case 'subject':   return {
        attrType: 'role', value: '',
        matchId: '', dataType: '', valueType: 'simple',
        cvCode: '', cvCodeSystem: '', iiRoot: '',
      };
      case 'action':    return {
        attributeId: 'urn:oasis:names:tc:xacml:1.0:action:action-id', action: 'read', customAction: '',
        matchId: '', dataType: '',
      };
      case 'resource':  return {
        attributeId: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id', identifier: '', wildcard: false,
        matchId: '', dataType: '', valueType: 'simple',
        cvCode: '', cvCodeSystem: '', iiRoot: '',
      };
      case 'condition': return {
        category:   'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject',
        attribute:  '',
        functionId: 'urn:oasis:names:tc:xacml:1.0:function:string-equal',
        functionCustom: '',
        value:      '',
        logic:      'AND',
        arg1DataType: 'http://www.w3.org/2001/XMLSchema#string',
        arg2DataType: 'http://www.w3.org/2001/XMLSchema#string',
      };
      case 'note':      return { text: '', color: '' };
      default:          return {};
    }
  }

  // ── Port positions (canvas coords) ─────────────────────────────────────

  function _portPos(node, side) {
    return {
      x: side === 'in' ? node.x : node.x + NODE_W,
      y: node.y + PORT_Y,
    };
  }

  // ── Screen ↔ canvas conversion ──────────────────────────────────────────

  function _s2c(sx, sy) {
    const r = _viewport.getBoundingClientRect();
    return {
      x: (sx - r.left - _panX) / _zoom,
      y: (sy - r.top  - _panY) / _zoom,
    };
  }

  // ── SVG bezier path ────────────────────────────────────────────────────

  function _bezier(x1, y1, x2, y2) {
    const dx = Math.max(Math.abs(x2 - x1) * 0.5, 60);
    return `M ${x1} ${y1} C ${x1+dx} ${y1} ${x2-dx} ${y2} ${x2} ${y2}`;
  }

  // ── Canvas transform ───────────────────────────────────────────────────

  function _applyTransform() {
    if (_canvas) {
      _canvas.style.transform = `translate(${_panX}px,${_panY}px) scale(${_zoom})`;
    }
    if (_svgTransformGroup) {
      _svgTransformGroup.setAttribute('transform', `translate(${_panX},${_panY}) scale(${_zoom})`);
    }
    _updateMinimap();
  }

  // ── History ────────────────────────────────────────────────────────────

  function _pushHistory() {
    const snap = JSON.stringify({ nodes: _nodes, edges: _edges });
    _history = _history.slice(0, _histIdx + 1);
    _history.push(snap);
    if (_history.length > 50) _history.shift();
    _histIdx = _history.length - 1;
    _syncToolbar();
  }

  function _undo() {
    if (_histIdx <= 0) return;
    _histIdx--;
    _restoreSnap(_history[_histIdx]);
  }

  function _redo() {
    if (_histIdx >= _history.length - 1) return;
    _histIdx++;
    _restoreSnap(_history[_histIdx]);
  }

  function _restoreSnap(snap) {
    const s = JSON.parse(snap);
    _nodes = s.nodes;
    _edges = s.edges;
    _rerenderAll();
    _emit();
  }

  function _syncToolbar() {
    const u = _wrap?.querySelector('#ne-undo-btn');
    const r = _wrap?.querySelector('#ne-redo-btn');
    if (u) u.disabled = _histIdx <= 0;
    if (r) r.disabled = _histIdx >= _history.length - 1;
  }

  // ── Validation ─────────────────────────────────────────────────────────

  function _validate() {
    const hasPolicy = _nodes.some(n => n.type === 'policy');
    const ruleNodes = _nodes.filter(n => n.type === 'rule');
    const errors = [], warnings = [];
    if (!hasPolicy) errors.push('no-policy');
    if (ruleNodes.length === 0) errors.push('no-rules');
    ruleNodes.forEach(r => {
      if (!_edges.some(e => e.toId === r.id)) warnings.push('rule-unconnected');
    });
    return { valid: errors.length === 0, errors, warnings };
  }

  function _updateValidation() {
    const el = _wrap?.querySelector('#ne-validation');
    if (!el) return;
    const dot  = el.querySelector('.ne-validation-dot');
    const text = el.querySelector('.ne-validation-text');
    if (!dot || !text) return;
    const { valid, warnings } = _validate();
    if (!valid) {
      dot.className    = 'ne-validation-dot invalid';
      text.textContent = _t('ne.validation.invalid');
    } else if (warnings.length > 0) {
      dot.className    = 'ne-validation-dot warning';
      text.textContent = _t('ne.validation.warnings', { n: warnings.length });
    } else {
      dot.className    = 'ne-validation-dot valid';
      text.textContent = _t('ne.validation.valid');
    }
  }

  // ── Serialisation → policy model ────────────────────────────────────────

  function _toPolicyModel() {
    const pNode = _nodes.find(n => n.type === 'policy');
    if (!pNode) return null;

    let ruleNodes = _nodes.filter(n =>
      n.type === 'rule' && _edges.some(e => e.fromId === pNode.id && e.toId === n.id)
    );
    if (ruleNodes.length === 0) ruleNodes = _nodes.filter(n => n.type === 'rule');

    const rules = ruleNodes.map(rn => {
      const children = _edges
        .filter(e => e.fromId === rn.id)
        .map(e => _nodes.find(n => n.id === e.toId))
        .filter(Boolean);

      const STR_EQ = 'urn:oasis:names:tc:xacml:1.0:function:string-equal';
      const DT_STR = 'http://www.w3.org/2001/XMLSchema#string';

      const matches = [];
      children.filter(n => n.type === 'subject').forEach(s => {
        const vt = s.data.valueType || 'simple';
        matches.push({
          cat: 'subject',
          attributeId: SUBJECT_ATTR_IDS[s.data.attrType] || SUBJECT_ATTR_IDS.role,
          matchId:   s.data.matchId  || STR_EQ,
          dataType:  s.data.dataType || DT_STR,
          valueType: vt,
          value:       vt === 'simple' ? (s.data.value || '') : '',
          cvCode:      s.data.cvCode       || '',
          cvCodeSystem: s.data.cvCodeSystem || '',
          iiRoot:      s.data.iiRoot       || '',
        });
      });
      children.filter(n => n.type === 'action').forEach(a => {
        const val = a.data.action === 'custom' ? (a.data.customAction||'') : (a.data.action||'read');
        matches.push({
          cat: 'action',
          attributeId: a.data.attributeId || 'urn:oasis:names:tc:xacml:1.0:action:action-id',
          matchId:   a.data.matchId  || STR_EQ,
          dataType:  a.data.dataType || DT_STR,
          valueType: 'simple', value: val,
          cvCode: '', cvCodeSystem: '', iiRoot: '',
        });
      });
      children.filter(n => n.type === 'resource').forEach(r => {
        const vt = r.data.valueType || 'simple';
        matches.push({
          cat: 'resource',
          attributeId: r.data.attributeId || 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',
          matchId:   r.data.matchId  || STR_EQ,
          dataType:  r.data.dataType || DT_STR,
          valueType: vt,
          value:       r.data.wildcard ? '*' : (vt === 'simple' ? (r.data.identifier||'') : ''),
          cvCode:      r.data.cvCode       || '',
          cvCodeSystem: r.data.cvCodeSystem || '',
          iiRoot:      r.data.iiRoot       || '',
        });
      });

      const conds = children.filter(n => n.type === 'condition');
      const conditionModels = conds.map(c => {
        const isCustomFn = c.data.functionId === '__custom__' || (c.data.functionId && !NE_COND_FUNCTIONS.find(f => f.value === c.data.functionId));
        return {
          functionId:    isCustomFn ? (c.data.functionCustom || c.data.functionId || STR_EQ) : (c.data.functionId || STR_EQ),
          functionCustom: c.data.functionCustom || '',
          arg1Cat:     c.data.category   || 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject',
          arg1AttrId:  c.data.attribute  || 'urn:oasis:names:tc:xacml:2.0:subject:role',
          arg1DataType: c.data.arg1DataType || DT_STR,
          arg2Value:    c.data.value     || '',
          arg2DataType: c.data.arg2DataType || DT_STR,
        };
      });

      return {
        id: rn.data.name || rn.id, effect: rn.data.effect || 'Permit',
        description: rn.data.description || '',
        target: { groups: [{ matches }] },
        conditions: conditionModels,
        conditionOp: conds.length > 0 ? (conds[0].data.logic || 'AND') : 'AND',
      };
    });

    return {
      id:           pNode.data.name        || 'node-policy',
      version:      pNode.data.version     || '2.0',
      description:  pNode.data.description || '',
      combiningAlg: pNode.data.combiningAlg ||
                    'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',
      target: { groups: [{ matches: [] }] },
      rules,
    };
  }

  // ── Emit policy change ──────────────────────────────────────────────────

  function _emit() {
    _updateValidation();
    try { sessionStorage.setItem(NE_SESS_KEY, JSON.stringify({ nodes: _nodes, edges: _edges })); } catch (_) {}
    if (_onPolicyChange) {
      const p = _toPolicyModel();
      if (p) _onPolicyChange(p);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  function _rerenderAll() {
    _renderNodes();
    _renderEdges();
    _updateValidation();
    _syncToolbar();
    _updateMinimap();
  }

  function _renderNodes() {
    _canvas.querySelectorAll('.ne-node').forEach(el => el.remove());
    _nodes.forEach(n => _canvas.appendChild(_makeNodeEl(n)));
    const hint = _wrap.querySelector('.ne-empty-hint');
    if (hint) hint.style.display = _nodes.length === 0 ? '' : 'none';
  }

  function _renderEdges() {
    if (!_edgesGroup) return;
    _edgesGroup.innerHTML = '';
    _edges.forEach(e => {
      const fn = _nodes.find(n => n.id === e.fromId);
      const tn = _nodes.find(n => n.id === e.toId);
      if (!fn || !tn) return;
      const p1 = _portPos(fn, 'out');
      const p2 = _portPos(tn, 'in');
      const selected = e.id === _selEdge;

      // Edge path
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', _bezier(p1.x, p1.y, p2.x, p2.y));
      path.setAttribute('class', `ne-edge${selected ? ' selected' : ''}`);
      path.dataset.edgeId = e.id;
      _edgesGroup.appendChild(path);

      // Delete button at midpoint (only on selected edge)
      if (selected) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const fo = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
        fo.setAttribute('x', mx - 10);
        fo.setAttribute('y', my - 10);
        fo.setAttribute('width', 20);
        fo.setAttribute('height', 20);
        fo.style.pointerEvents = 'all';
        fo.innerHTML = `<button class="ne-edge-del" data-del-edge="${e.id}"
          title="${_esc(_t('ne.edge.delete'))}">&#x2715;</button>`;
        _edgesGroup.appendChild(fo);
      }
    });
  }

  // ── Node element builder ───────────────────────────────────────────────

  const NODE_TYPE_META = {
    policy:    { icon: '📋', labelKey: 'ne.node.policy.label'    },
    rule:      { icon: '📜', labelKey: 'ne.node.rule.label'      },
    subject:   { icon: '👤', labelKey: 'ne.node.subject.label'   },
    action:    { icon: '⚡', labelKey: 'ne.node.action.label'    },
    resource:  { icon: '📁', labelKey: 'ne.node.resource.label'  },
    condition: { icon: '🔀', labelKey: 'ne.node.condition.label' },
    note:      { icon: '📝', labelKey: 'ne.node.note.label'      },
  };

  function _makeNodeEl(node) {
    const el   = document.createElement('div');
    const meta = NODE_TYPE_META[node.type] || { icon:'❓', labelKey: node.type };
    const isLeaf   = ['subject','action','resource','condition','note'].includes(node.type);
    const isPolicy = node.type === 'policy';
    const isNote   = node.type === 'note';
    const color    = node.data.color || '';

    el.id        = `ne-node-${node.id}`;
    el.className = `ne-node ne-node--${node.type}${
      node.type === 'rule' ? ` effect-${(node.data.effect||'Permit').toLowerCase()}` : ''
    }${node.id === _selNode ? ' selected' : ''}`;
    el.style.cssText = `left:${node.x}px;top:${node.y}px`;
    if (color) el.dataset.color = color;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'ne-node-hdr';
    hdr.dataset.drag = node.id;
    hdr.innerHTML = `
      <span class="ne-node-icon">${meta.icon}</span>
      <span class="ne-node-label">${_esc(_t(meta.labelKey))}</span>
      <button class="ne-node-color" data-color-btn="${_esc(node.id)}" data-color="${_esc(color)}"
        title="${_esc(_t('ne.node.color'))}">&#x25CF;</button>
      ${!isPolicy ? `<button class="ne-node-del" data-del="${node.id}"
        title="${_esc(_t('ne.node.delete'))}" aria-label="${_esc(_t('ne.node.delete'))}">&#x2715;</button>` : ''}
    `;
    el.appendChild(hdr);

    // Body
    const body = document.createElement('div');
    body.className = 'ne-node-body';
    body.id = `ne-body-${node.id}`;
    body.innerHTML = _bodyHtml(node);
    el.appendChild(body);

    // Note nodes have no connection ports
    if (!isNote) {
      // Input port (left side) — all except policy
      if (!isPolicy) {
        const portIn = document.createElement('div');
        portIn.className = 'ne-port ne-port-in';
        portIn.dataset.pin = node.id;
        el.appendChild(portIn);
      }

      // Output port (right side) — all except leaf nodes
      // Ports get direct pointerdown listener — NOT event delegation
      if (!isLeaf) {
        const portOut = document.createElement('div');
        portOut.className = 'ne-port ne-port-out';
        portOut.dataset.pout = node.id;
        portOut.addEventListener('pointerdown', _onPortDown);
        el.appendChild(portOut);
      }
    }

    return el;
  }

  function _bodyHtml(node) {
    const d  = node.data;
    const id = node.id;

    switch (node.type) {
      case 'policy': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.policy.id'))}</span>
          <input type="text" data-node="${id}" data-field="name" value="${_esc(d.name)}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.policy.desc'))}</span>
          <input type="text" data-node="${id}" data-field="description" value="${_esc(d.description)}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.policy.version'))}</span>
          <select data-node="${id}" data-field="version">
            <option value="2.0" ${(d.version||'2.0')==='2.0'?'selected':''}>XACML 2.0</option>
            <option value="3.0" ${(d.version||'2.0')==='3.0'?'selected':''}>XACML 3.0</option>
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.policy.alg'))}</span>
          <select data-node="${id}" data-field="combiningAlg">${_algOpts(d.combiningAlg)}</select>
        </div>`;

      case 'rule': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.rule.id'))}</span>
          <input type="text" data-node="${id}" data-field="name" value="${_esc(d.name)}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.rule.desc'))}</span>
          <input type="text" data-node="${id}" data-field="description" value="${_esc(d.description||'')}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.rule.effect'))}</span>
          <div class="ne-effect-toggle">
            <button class="ne-effect-btn${d.effect==='Permit'?' active-permit':''}"
              data-node="${id}" data-effect="Permit">&#x2705; ${_esc(_t('ne.effect.permit'))}</button>
            <button class="ne-effect-btn${d.effect==='Deny'?' active-deny':''}"
              data-node="${id}" data-effect="Deny">&#x274C; ${_esc(_t('ne.effect.deny'))}</button>
          </div>
        </div>`;

      case 'subject': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.subject.type'))}</span>
          <select data-node="${id}" data-field="attrType">
            <option value="role" ${d.attrType==='role'?'selected':''}>${_esc(_t('ne.subject.role'))}</option>
            <option value="id"   ${d.attrType==='id'  ?'selected':''}>${_esc(_t('ne.subject.id'))}</option>
            <option value="ip"   ${d.attrType==='ip'  ?'selected':''}>${_esc(_t('ne.subject.ip'))}</option>
            <option value="dns"  ${d.attrType==='dns' ?'selected':''}>${_esc(_t('ne.subject.dns'))}</option>
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.value'))}</span>
          ${_matchValueInput(id, d, 'value')}
        </div>
        ${_advMatchSection(id, d, true)}`;

      case 'action': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.action.attrId'))}</span>
          <select data-node="${id}" data-field="attributeId">
            ${ACTION_ATTR_IDS.map(a =>
              `<option value="${_esc(a.value)}" ${d.attributeId===a.value?'selected':''}>${_esc(_t(a.labelKey))}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.action'))}</span>
          <select data-node="${id}" data-field="action">
            <option value="read"    ${d.action==='read'   ?'selected':''}>${_esc(_t('ne.action.read'))}</option>
            <option value="write"   ${d.action==='write'  ?'selected':''}>${_esc(_t('ne.action.write'))}</option>
            <option value="delete"  ${d.action==='delete' ?'selected':''}>${_esc(_t('ne.action.delete'))}</option>
            <option value="execute" ${d.action==='execute'?'selected':''}>${_esc(_t('ne.action.execute'))}</option>
            <option value="*"       ${d.action==='*'      ?'selected':''}>${_esc(_t('ne.action.all'))}</option>
            <option value="custom"  ${d.action==='custom' ?'selected':''}>${_esc(_t('ne.action.custom'))}</option>
          </select>
        </div>
        ${d.action === 'custom' ? `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.action.custom'))}</span>
          <input type="text" data-node="${id}" data-field="customAction" value="${_esc(d.customAction)}">
        </div>` : ''}
        ${_advMatchSection(id, d, false)}`;

      case 'resource': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.resource.attrId'))}</span>
          <select data-node="${id}" data-field="attributeId">
            ${RESOURCE_ATTR_IDS.map(r =>
              `<option value="${_esc(r.value)}" ${d.attributeId===r.value?'selected':''}>${_esc(_t(r.labelKey))}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.resource.id'))}</span>
          ${_matchValueInput(id, d, 'identifier')}
        </div>
        <div class="ne-field ne-field-row">
          <input type="checkbox" id="ne-wc-${id}" data-node="${id}" data-field="wildcard" ${d.wildcard?'checked':''}>
          <label for="ne-wc-${id}" class="ne-field-label" style="margin:0;cursor:pointer">${_esc(_t('ne.field.resource.wildcard'))}</label>
        </div>
        ${_advMatchSection(id, d, true)}`;

      case 'condition': {
        const isCustomFn = d.functionId === '__custom__' || (d.functionId && !NE_COND_FUNCTIONS.find(f => f.value === d.functionId));
        return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.condition.cat'))}</span>
          <select data-node="${id}" data-field="category">
            ${NE_COND_CATEGORIES.map(c =>
              `<option value="${_esc(c.value)}" ${d.category===c.value?'selected':''}>${_esc(_t(c.labelKey))}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.condition.attr'))}</span>
          <input type="text" data-node="${id}" data-field="attribute" value="${_esc(d.attribute)}"
            placeholder="${_esc(_t('ne.placeholder.condition'))}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('creator.condition.arg1.dt'))}</span>
          <select data-node="${id}" data-field="arg1DataType">${_condDtOpts(d.arg1DataType||'http://www.w3.org/2001/XMLSchema#string')}</select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.condition.fn'))}</span>
          <select data-node="${id}" data-field="functionId">
            ${NE_COND_FUNCTIONS.map(f =>
              `<option value="${_esc(f.value)}" ${!isCustomFn && d.functionId===f.value?'selected':''}>${_esc(f.label)}</option>`
            ).join('')}
            <option value="__custom__" ${isCustomFn?'selected':''}>${_esc(_t('creator.condition.fn.custom'))}</option>
          </select>
        </div>
        ${isCustomFn ? `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('creator.condition.fn'))}</span>
          <input type="text" data-node="${id}" data-field="functionCustom" class="ne-custom-input"
            placeholder="${_esc(_t('creator.condition.fn.ph'))}" value="${_esc(d.functionCustom||'')}">
        </div>` : ''}
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.value'))}</span>
          <input type="text" data-node="${id}" data-field="value" value="${_esc(d.value)}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('creator.condition.arg2.dt'))}</span>
          <select data-node="${id}" data-field="arg2DataType">${_condDtOpts(d.arg2DataType||'http://www.w3.org/2001/XMLSchema#string')}</select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.condition.logic'))}</span>
          <select data-node="${id}" data-field="logic">
            <option value="AND" ${d.logic==='AND'?'selected':''}>AND</option>
            <option value="OR"  ${d.logic==='OR' ?'selected':''}>OR</option>
          </select>
        </div>`;
      }

      case 'note': return `
        <textarea class="ne-note-text" data-node="${id}" data-field="text"
          rows="4" placeholder="${_esc(_t('ne.placeholder.note'))}">${_esc(d.text || '')}</textarea>`;

      default: return '';
    }
  }

  // ── Advanced match field helpers ─────────────────────────────────────

  function _matchIdOpts(current) {
    const isCustom = current && current !== '__custom__' && !NE_MATCH_ID_OPTIONS.find(o => o.value === current);
    return `<option value=""${!current ? ' selected' : ''}>${_esc(_t('creator.target.matchId.default'))}</option>` +
      NE_MATCH_ID_OPTIONS.map(o =>
        `<option value="${_esc(o.value)}"${!isCustom && current === o.value ? ' selected' : ''}>${_esc(o.label)}</option>`
      ).join('') +
      `<option value="__custom__"${isCustom ? ' selected' : ''}>${_esc(_t('creator.target.attrId.custom'))}</option>`;
  }

  function _matchDtOpts(current) {
    const isCustom = current && current !== '__custom__' && !NE_MATCH_DATATYPE_OPTIONS.find(o => o.value === current);
    return `<option value=""${!current ? ' selected' : ''}>${_esc(_t('creator.target.dataType.default'))}</option>` +
      NE_MATCH_DATATYPE_OPTIONS.map(o =>
        `<option value="${_esc(o.value)}"${!isCustom && current === o.value ? ' selected' : ''}>${_esc(o.label)}</option>`
      ).join('') +
      `<option value="__custom__"${isCustom ? ' selected' : ''}>${_esc(_t('creator.target.attrId.custom'))}</option>`;
  }

  function _condDtOpts(current) {
    return NE_CONDITION_DATA_TYPES.map(o =>
      `<option value="${_esc(o.value)}"${current === o.value ? ' selected' : ''}>${_esc(o.label)}</option>`
    ).join('');
  }

  // Renders the value input(s) depending on valueType (simple / cv / ii)
  function _matchValueInput(id, d, fieldName) {
    const vt = d.valueType || 'simple';
    if (vt === 'cv') {
      return `
        <div class="ne-cv-fields">
          <input type="text" data-node="${id}" data-field="cvCode"
            placeholder="${_esc(_t('creator.target.cv.code.ph'))}" value="${_esc(d.cvCode||'')}">
          <input type="text" data-node="${id}" data-field="cvCodeSystem"
            placeholder="${_esc(_t('creator.target.cv.sys.ph'))}" value="${_esc(d.cvCodeSystem||'')}">
        </div>`;
    } else if (vt === 'ii') {
      return `<input type="text" data-node="${id}" data-field="iiRoot"
        placeholder="${_esc(_t('creator.target.ii.root.ph'))}" value="${_esc(d.iiRoot||'')}">`;
    } else {
      return `<input type="text" data-node="${id}" data-field="${fieldName||'value'}" value="${_esc(d[fieldName||'value']||'')}"
        placeholder="${_esc(_t('ne.placeholder.' + (fieldName === 'identifier' ? 'resource' : 'subject')))}">`;
    }
  }

  // Renders the collapsible advanced section for subject/action/resource nodes
  function _advMatchSection(id, d, showValueType) {
    const open   = !!d._advOpen;
    const isCustomMatchId = d.matchId && d.matchId !== '__custom__' && !NE_MATCH_ID_OPTIONS.find(o => o.value === d.matchId);
    const isCustomDataType = d.dataType && d.dataType !== '__custom__' && !NE_MATCH_DATATYPE_OPTIONS.find(o => o.value === d.dataType);
    const hasContent = !!(d.matchId || d.dataType || (d.valueType && d.valueType !== 'simple'));
    return `
      <div class="ne-adv-wrap">
        <button class="ne-adv-toggle${hasContent ? ' ne-adv-active' : ''}" type="button"
          data-node="${id}" data-field="_advOpen" data-adv-toggle="1">
          ${open ? '&#x25BE;' : '&#x25B8;'} ${_esc(_t('ne.adv.section'))}${hasContent ? ' ●' : ''}
        </button>
        <div class="ne-adv-body" style="${open ? '' : 'display:none'}">
          <div class="ne-field">
            <span class="ne-field-label">${_esc(_t('creator.target.matchId.label'))}</span>
            <select data-node="${id}" data-field="matchId">${_matchIdOpts(d.matchId)}</select>
            ${isCustomMatchId ? `<input type="text" data-node="${id}" data-field="matchId-custom"
              class="ne-custom-input" placeholder="${_esc(_t('creator.target.matchId.custom.ph'))}"
              value="${_esc(d.matchId)}">` : ''}
          </div>
          <div class="ne-field">
            <span class="ne-field-label">${_esc(_t('creator.target.dataType.label'))}</span>
            <select data-node="${id}" data-field="dataType">${_matchDtOpts(d.dataType)}</select>
            ${isCustomDataType ? `<input type="text" data-node="${id}" data-field="dataType-custom"
              class="ne-custom-input" placeholder="${_esc(_t('creator.target.dataType.custom.ph'))}"
              value="${_esc(d.dataType)}">` : ''}
          </div>
          ${showValueType ? `
          <div class="ne-field">
            <span class="ne-field-label">${_esc(_t('ne.adv.valueType'))}</span>
            <select data-node="${id}" data-field="valueType">
              <option value="simple"${(d.valueType||'simple')==='simple'?' selected':''}>Simple</option>
              <option value="cv"${d.valueType==='cv'?' selected':''}>CV (HL7 Coded Value)</option>
              <option value="ii"${d.valueType==='ii'?' selected':''}>II (HL7 Instance Identifier)</option>
            </select>
          </div>` : ''}
        </div>
      </div>`;
  }

  function _algOpts(current) {
    return [
      ['urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',   'creator.alg.deny'  ],
      ['urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides', 'creator.alg.permit'],
      ['urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:first-applicable', 'creator.alg.first' ],
    ].map(([v, k]) =>
      `<option value="${_esc(v)}" ${current===v?'selected':''}>${_esc(_t(k))}</option>`
    ).join('');
  }

  // ── Node / Edge mutations ──────────────────────────────────────────────

  function _addNode(type, x, y) {
    _pushHistory();
    const node = { id: _uid(), type, x, y, data: _defaultData(type) };
    _nodes.push(node);
    _canvas.appendChild(_makeNodeEl(node));
    _wrap.querySelector('.ne-empty-hint')?.style.setProperty('display', 'none');
    _updateValidation();
    _emit();
    return node;
  }

  function _deleteNode(id) {
    if (_nodes.find(n => n.id === id)?.type === 'policy') return;
    _pushHistory();
    _nodes = _nodes.filter(n => n.id !== id);
    _edges = _edges.filter(e => e.fromId !== id && e.toId !== id);
    if (_selNode === id) _selNode = null;
    _rerenderAll();
    _emit();
  }

  function _addEdge(fromId, toId) {
    if (_edges.some(e => e.fromId === fromId && e.toId === toId)) return;
    const fn = _nodes.find(n => n.id === fromId);
    const tn = _nodes.find(n => n.id === toId);
    if (!fn || !tn) return;
    if (!ALLOWED_TARGETS[fn.type]?.includes(tn.type)) return;
    _pushHistory();
    _edges.push({ id: _uid(), fromId, toId });
    _renderEdges();
    _emit();
  }

  function _deleteEdge(id) {
    _pushHistory();
    _edges = _edges.filter(e => e.id !== id);
    if (_selEdge === id) _selEdge = null;
    _renderEdges();
    _emit();
  }

  // ── Connection drag (port → pointer capture) ───────────────────────────
  // Uses PointerEvent + setPointerCapture so all subsequent events are
  // delivered to the port element regardless of where the pointer moves.

  function _highlightConnectTargets(fromId) {
    const fromNode = _nodes.find(n => n.id === fromId);
    if (!fromNode) return;
    const validTypes = ALLOWED_TARGETS[fromNode.type] || [];
    _nodes.forEach(n => {
      const el = document.getElementById(`ne-node-${n.id}`);
      if (!el) return;
      if (n.id === fromId) {
        el.classList.add('ne-conn-source');
      } else if (validTypes.includes(n.type)) {
        el.classList.add('ne-conn-valid');
      } else {
        el.classList.add('ne-conn-invalid');
      }
    });
  }

  function _clearConnectHighlights() {
    if (!_wrap) return;
    _wrap.querySelectorAll('.ne-conn-source,.ne-conn-valid,.ne-conn-invalid,.ne-conn-hover')
      .forEach(el => el.classList.remove(
        'ne-conn-source','ne-conn-valid','ne-conn-invalid','ne-conn-hover'
      ));
  }

  function _onPortDown(e) {
    // Only handle primary button (left click)
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const nodeId = e.currentTarget.dataset.pout;
    if (!nodeId) return;

    // Capture pointer: all future pointermove / pointerup go to this element
    e.currentTarget.setPointerCapture(e.pointerId);

    _dragConn = { fromId: nodeId };

    // Draw initial temp edge
    const fromNode = _nodes.find(n => n.id === nodeId);
    if (fromNode && _tempEdgePath) {
      const p1  = _portPos(fromNode, 'out');
      const pos = _s2c(e.clientX, e.clientY);
      _tempEdgePath.setAttribute('d', _bezier(p1.x, p1.y, pos.x, pos.y));
      _tempEdgePath.style.display = '';
    }

    _highlightConnectTargets(nodeId);

    // Register move / up / cancel on this specific port element
    e.currentTarget.addEventListener('pointermove',   _onPortMove);
    e.currentTarget.addEventListener('pointerup',     _onPortUp);
    e.currentTarget.addEventListener('pointercancel', _onPortCancel);
  }

  function _onPortMove(e) {
    if (!_dragConn) return;
    const pos    = _s2c(e.clientX, e.clientY);
    const fnNode = _nodes.find(n => n.id === _dragConn.fromId);
    if (fnNode && _tempEdgePath) {
      const p1 = _portPos(fnNode, 'out');
      _tempEdgePath.setAttribute('d', _bezier(p1.x, p1.y, pos.x, pos.y));
    }
    // Hover highlight on valid target
    _wrap.querySelectorAll('.ne-conn-hover').forEach(el => el.classList.remove('ne-conn-hover'));
    const hovEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ne-conn-valid');
    if (hovEl) hovEl.classList.add('ne-conn-hover');
  }

  function _onPortUp(e) {
    _cleanupPortListeners(e.currentTarget);
    if (_tempEdgePath) {
      _tempEdgePath.style.display = 'none';
      _tempEdgePath.setAttribute('d', '');
    }
    _clearConnectHighlights();

    if (_dragConn) {
      // Accept drop on any part of any node (not just the tiny port circle)
      const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ne-node');
      if (targetEl) {
        const toId = targetEl.id.replace('ne-node-', '');
        if (toId && toId !== _dragConn.fromId) {
          _addEdge(_dragConn.fromId, toId);
        }
      }
      _dragConn = null;
    }
  }

  function _onPortCancel(e) {
    _cleanupPortListeners(e.currentTarget);
    if (_tempEdgePath) {
      _tempEdgePath.style.display = 'none';
      _tempEdgePath.setAttribute('d', '');
    }
    _clearConnectHighlights();
    _dragConn = null;
  }

  function _cleanupPortListeners(el) {
    el.removeEventListener('pointermove',   _onPortMove);
    el.removeEventListener('pointerup',     _onPortUp);
    el.removeEventListener('pointercancel', _onPortCancel);
  }

  // ── Node drag + canvas pan (mousedown on container) ────────────────────

  function _onMouseDown(e) {
    // Ignore if a port started this (port uses pointerdown and stops propagation)
    if (e.target.closest('[data-pout]')) return;

    // Node header drag
    const hdr = e.target.closest('[data-drag]');
    if (hdr) {
      e.preventDefault();
      const nodeId = hdr.dataset.drag;
      const node   = _nodes.find(n => n.id === nodeId);
      if (!node) return;
      _dragNode = { nodeId, startMX: e.clientX, startMY: e.clientY, origX: node.x, origY: node.y };
      _selNode  = nodeId;
      _selEdge  = null;
      _wrap.querySelectorAll('.ne-node').forEach(n =>
        n.classList.toggle('selected', n.id === `ne-node-${nodeId}`)
      );
      _renderEdges();
      return;
    }

    // Canvas pan — click on viewport background (not a node, not any UI overlay)
    const onNode = e.target.closest('.ne-node');
    const onPal  = e.target.closest('.ne-palette');
    const onUI   = e.target.closest('.ne-toolbar, .ne-validation, .ne-minimap, .ne-tpl-modal');
    if (!onNode && !onPal && !onUI) {
      e.preventDefault();
      _dragPan = { startMX: e.clientX, startMY: e.clientY, origPX: _panX, origPY: _panY };
      _selNode = null;
      _selEdge = null;
      _wrap.querySelectorAll('.ne-node').forEach(n => n.classList.remove('selected'));
      _renderEdges();
    }
  }

  function _onMouseMove(e) {
    if (_dragNode) {
      const dx = (e.clientX - _dragNode.startMX) / _zoom;
      const dy = (e.clientY - _dragNode.startMY) / _zoom;
      const node = _nodes.find(n => n.id === _dragNode.nodeId);
      if (!node) return;
      node.x = _dragNode.origX + dx;
      node.y = _dragNode.origY + dy;
      const el = document.getElementById(`ne-node-${node.id}`);
      if (el) el.style.cssText = `left:${node.x}px;top:${node.y}px;z-index:20`;
      _renderEdges();
      return;
    }
    if (_dragPan) {
      _panX = _dragPan.origPX + (e.clientX - _dragPan.startMX);
      _panY = _dragPan.origPY + (e.clientY - _dragPan.startMY);
      _applyTransform();
    }
  }

  function _onMouseUp(e) {
    if (_dragNode) {
      _pushHistory();
      const dragEl = document.getElementById(`ne-node-${_dragNode.nodeId}`);
      if (dragEl) dragEl.style.zIndex = '';
      _dragNode = null;
      _emit();
      return;
    }
    if (_dragPan) {
      _dragPan = null;
    }
  }

  function _onClick(e) {
    // Delete node
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      _showDeleteConfirm(del.dataset.del);
      return;
    }

    // Color button — cycle node color
    const colorBtn = e.target.closest('[data-color-btn]');
    if (colorBtn) {
      e.stopPropagation();
      const nodeId = colorBtn.dataset.colorBtn;
      const node = _nodes.find(n => n.id === nodeId);
      if (node) {
        const idx = NODE_COLORS.indexOf(node.data.color || '');
        node.data.color = NODE_COLORS[(idx + 1) % NODE_COLORS.length];
        const el = document.getElementById(`ne-node-${nodeId}`);
        if (el) {
          if (node.data.color) el.dataset.color = node.data.color;
          else delete el.dataset.color;
        }
        colorBtn.dataset.color = node.data.color || '';
        _emit();
      }
      return;
    }

    // Template modal — open/close/load
    if (e.target.id === 'ne-tpl-btn' || e.target.closest('#ne-tpl-btn')) {
      _openTemplateModal(); return;
    }
    if (e.target.id === 'ne-tpl-close' || e.target.closest('#ne-tpl-close')) {
      _closeTemplateModal(); return;
    }
    const tplLoad = e.target.closest('[data-tpl]');
    if (tplLoad && tplLoad.classList.contains('ne-tpl-load-btn')) {
      _applyTemplate(tplLoad.dataset.tpl); return;
    }
    // Close modal when clicking backdrop
    if (e.target.id === 'ne-tpl-modal') {
      _closeTemplateModal(); return;
    }

    // Share link
    if (e.target.id === 'ne-share-btn' || e.target.closest('#ne-share-btn')) {
      _copyShareLink(); return;
    }

    // Advanced section toggle
    const advBtn = e.target.closest('[data-adv-toggle]');
    if (advBtn && advBtn.dataset.node) {
      const nodeId = advBtn.dataset.node;
      const node   = _nodes.find(n => n.id === nodeId);
      if (node) {
        node.data._advOpen = !node.data._advOpen;
        const body = document.getElementById(`ne-body-${nodeId}`);
        if (body) body.innerHTML = _bodyHtml(node);
      }
      return;
    }

    // Effect toggle
    const eff = e.target.closest('[data-effect]');
    if (eff && eff.dataset.node) {
      const nodeId = eff.dataset.node;
      const effect = eff.dataset.effect;
      const node   = _nodes.find(n => n.id === nodeId);
      if (node) {
        node.data.effect = effect;
        const el = document.getElementById(`ne-node-${nodeId}`);
        if (el) {
          el.classList.remove('effect-permit', 'effect-deny');
          el.classList.add(`effect-${effect.toLowerCase()}`);
          el.querySelectorAll('.ne-effect-btn').forEach(btn => {
            btn.className = `ne-effect-btn${
              btn.dataset.effect === effect ? ` active-${effect.toLowerCase()}` : ''
            }`;
          });
        }
        _emit();
      }
      return;
    }

    // Edge delete button
    const delEdge = e.target.closest('[data-del-edge]');
    if (delEdge) {
      e.stopPropagation();
      _deleteEdge(delEdge.dataset.delEdge);
      return;
    }

    // Edge click (select → shows delete button at midpoint)
    const edgeEl = e.target.closest('.ne-edge');
    if (edgeEl) {
      _selEdge = edgeEl.dataset.edgeId;
      _selNode = null;
      _renderEdges();
    }
  }

  function _onInput(e) {
    const nodeId = e.target.dataset?.node;
    const field  = e.target.dataset?.field;
    if (!nodeId || !field) return;
    const node = _nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Advanced-toggle: flip _advOpen and re-render (only on click events)
    if (field === '_advOpen' && e.type === 'click') {
      node.data._advOpen = !node.data._advOpen;
      const body = document.getElementById(`ne-body-${nodeId}`);
      if (body) body.innerHTML = _bodyHtml(node);
      return; // no _emit needed, no policy change
    }

    const prevValueType = node.data.valueType;

    // Handle custom sub-inputs (matchId-custom, dataType-custom)
    if (field === 'matchId-custom') {
      node.data.matchId = e.target.value;
      _emit();
      return;
    }
    if (field === 'dataType-custom') {
      node.data.dataType = e.target.value;
      _emit();
      return;
    }

    node.data[field] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

    // When dataType changes to CV/II, update valueType and re-render
    if (field === 'dataType') {
      const dt = e.target.value;
      if (dt === 'urn:hl7-org:v3#CV' || dt === 'urn:hl7-org:v3#CE')  node.data.valueType = 'cv';
      else if (dt === 'urn:hl7-org:v3#II')                             node.data.valueType = 'ii';
      else if (dt !== '' && dt !== '__custom__')                       node.data.valueType = 'simple';
    }

    const needsRerender = field === 'action' || field === 'valueType' ||
      field === 'functionId' ||
      (field === 'dataType' && node.data.valueType !== prevValueType) ||
      (field === 'matchId' && e.target.value === '__custom__') ||
      (field === 'dataType' && e.target.value === '__custom__');

    if (needsRerender) {
      const body = document.getElementById(`ne-body-${nodeId}`);
      if (body) body.innerHTML = _bodyHtml(node);
    }
    _emit();
  }

  function _onKeyDown(e) {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (_selNode) { _showDeleteConfirm(_selNode); }
      else if (_selEdge) { _deleteEdge(_selEdge); _selEdge = null; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault(); _undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault(); _redo();
    }
  }

  function _onWheel(e) {
    e.preventDefault();
    const r      = _viewport.getBoundingClientRect();
    const mx     = e.clientX - r.left;
    const my     = e.clientY - r.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nz     = Math.max(0.25, Math.min(3, _zoom * factor));
    _panX = mx - (mx - _panX) * (nz / _zoom);
    _panY = my - (my - _panY) * (nz / _zoom);
    _zoom = nz;
    _applyTransform();
  }

  // ── Palette drag & drop ────────────────────────────────────────────────

  function _onPaletteClick(e) {
    const item = e.target.closest('.ne-palette-item');
    if (!item) return;
    const type = item.dataset.nodeType;
    if (!type) return;
    // Place new node near the center of the current viewport
    const r  = _viewport.getBoundingClientRect();
    const cx = (r.width  / 2 - _panX) / _zoom - NODE_W / 2;
    const cy = (r.height / 2 - _panY) / _zoom - 40;
    // Offset slightly so repeated clicks don't stack exactly
    const offset = _nodes.filter(n => n.type === type).length * 20;
    _addNode(type, cx + offset, cy + offset);
  }

  function _onPaletteDragStart(e) {
    const item = e.target.closest('.ne-palette-item');
    if (!item) return;
    _paletteType = item.dataset.nodeType;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', _paletteType);
  }

  function _onViewportDragOver(e) {
    if (_paletteType) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  }

  function _onViewportDrop(e) {
    if (!_paletteType) return;
    e.preventDefault();
    const pos = _s2c(e.clientX, e.clientY);
    _addNode(_paletteType, pos.x - NODE_W / 2, pos.y - 30);
    _paletteType = null;
  }

  // ── Toolbar ────────────────────────────────────────────────────────────

  function _fitView() {
    if (_nodes.length === 0) return;
    const xs = _nodes.map(n => n.x);
    const ys = _nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + NODE_W;
    const maxY = Math.max(...ys) + 200;
    const r    = _viewport.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const sz = Math.min(r.width / (maxX - minX + 60), r.height / (maxY - minY + 60), 1.2);
    _zoom = sz;
    _panX = 30 - minX * sz;
    _panY = 30 - minY * sz;
    _applyTransform();
  }

  function _resetView() {
    _zoom = 1;
    _panX = INIT_PX;
    _panY = INIT_PY;
    _applyTransform();
  }

  function _clearCanvas() {
    if (!confirm(_t('ne.toolbar.clear.confirm'))) return;
    _pushHistory();
    _nodes = [{ id: _uid(), type: 'policy', x: 20, y: 50, data: _defaultData('policy') }];
    _edges = [];
    _selNode = null;
    _selEdge = null;
    _history = [];
    _histIdx = -1;
    _pushHistory();
    try { sessionStorage.removeItem(NE_SESS_KEY); } catch (_) {}
    _rerenderAll();
    _emit();
  }

  // ── Phase 2: Templates ────────────────────────────────────────────────

  function _buildTemplateNodes(id) {
    const uid = () => Math.random().toString(36).slice(2, 9);
    const DENY_OVR  = 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides';
    const PERM_OVR  = 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides';
    const ACT_ID    = 'urn:oasis:names:tc:xacml:1.0:action:action-id';
    const RES_ID    = 'urn:oasis:names:tc:xacml:1.0:resource:resource-id';
    const STR_EQ    = 'urn:oasis:names:tc:xacml:1.0:function:string-equal';
    const DT_EQ     = 'urn:oasis:names:tc:xacml:1.0:function:dateTime-equal';
    const ENV_CAT   = 'urn:oasis:names:tc:xacml:3.0:attribute-category:environment';
    const DT_ATTR   = 'urn:oasis:names:tc:xacml:1.0:environment:current-dateTime';

    switch (id) {
      case 'admin-only': {
        const pId = uid(), rId = uid(), sId = uid();
        return {
          nodes: [
            { id: pId, type: 'policy', x: 30, y: 60,
              data: { name: 'admin-policy', description: '', combiningAlg: DENY_OVR, color: '' } },
            { id: rId, type: 'rule', x: 340, y: 40,
              data: { name: 'admin-permit', effect: 'Permit', color: '' } },
            { id: sId, type: 'subject', x: 660, y: 40,
              data: { attrType: 'role', value: 'admin', color: '' } },
          ],
          edges: [
            { id: uid(), fromId: pId, toId: rId },
            { id: uid(), fromId: rId, toId: sId },
          ],
        };
      }
      case 'read-write': {
        const pId = uid(), r1 = uid(), r2 = uid(), r3 = uid();
        const a1 = uid(), s2 = uid(), a2 = uid();
        return {
          nodes: [
            { id: pId, type: 'policy', x: 30, y: 230,
              data: { name: 'read-write-policy', description: '', combiningAlg: DENY_OVR, color: '' } },
            { id: r1, type: 'rule',    x: 340, y: 40,
              data: { name: 'read-all', effect: 'Permit', color: '' } },
            { id: a1, type: 'action',  x: 660, y: 40,
              data: { attributeId: ACT_ID, action: 'read', customAction: '', color: '' } },
            { id: r2, type: 'rule',    x: 340, y: 270,
              data: { name: 'write-owner', effect: 'Permit', color: '' } },
            { id: s2, type: 'subject', x: 660, y: 230,
              data: { attrType: 'role', value: 'owner', color: '' } },
            { id: a2, type: 'action',  x: 660, y: 420,
              data: { attributeId: ACT_ID, action: 'write', customAction: '', color: '' } },
            { id: r3, type: 'rule',    x: 340, y: 500,
              data: { name: 'deny-all', effect: 'Deny', color: '' } },
          ],
          edges: [
            { id: uid(), fromId: pId, toId: r1 },
            { id: uid(), fromId: r1,  toId: a1 },
            { id: uid(), fromId: pId, toId: r2 },
            { id: uid(), fromId: r2,  toId: s2 },
            { id: uid(), fromId: r2,  toId: a2 },
            { id: uid(), fromId: pId, toId: r3 },
          ],
        };
      }
      case 'time-based': {
        const pId = uid(), rId = uid(), cId = uid();
        return {
          nodes: [
            { id: pId, type: 'policy', x: 30, y: 60,
              data: { name: 'time-based-policy', description: '', combiningAlg: PERM_OVR, color: '' } },
            { id: rId, type: 'rule', x: 340, y: 40,
              data: { name: 'time-permit', effect: 'Permit', color: '' } },
            { id: cId, type: 'condition', x: 660, y: 40,
              data: { category: ENV_CAT, attribute: DT_ATTR,
                      functionId: DT_EQ, value: '2024-01-01T09:00:00', logic: 'AND', color: '' } },
          ],
          edges: [
            { id: uid(), fromId: pId, toId: rId },
            { id: uid(), fromId: rId, toId: cId },
          ],
        };
      }
      case 'department': {
        const pId = uid(), rId = uid(), sId = uid(), resId = uid();
        return {
          nodes: [
            { id: pId, type: 'policy',   x: 30,  y: 100,
              data: { name: 'department-policy', description: '', combiningAlg: DENY_OVR, color: '' } },
            { id: rId, type: 'rule',     x: 340, y: 80,
              data: { name: 'dept-access', effect: 'Permit', color: '' } },
            { id: sId, type: 'subject',  x: 660, y: 40,
              data: { attrType: 'id', value: 'dept-member', color: '' } },
            { id: resId, type: 'resource', x: 660, y: 240,
              data: { attributeId: RES_ID, identifier: 'dept-docs', wildcard: false, color: '' } },
          ],
          edges: [
            { id: uid(), fromId: pId, toId: rId   },
            { id: uid(), fromId: rId, toId: sId   },
            { id: uid(), fromId: rId, toId: resId },
          ],
        };
      }
      case 'physician': {
        const pId = uid(), r1 = uid(), r2 = uid(), r3 = uid();
        const s1 = uid(), a1 = uid(), res1 = uid();
        const s2 = uid(), a2 = uid(), res2 = uid();
        const ROLE = 'urn:oasis:names:tc:xacml:2.0:subject:role';
        return {
          nodes: [
            { id: pId,  type: 'policy',   x: 30,  y: 280,
              data: { name: 'physician-access-policy',
                      description: 'Physicians can read and write patient records',
                      combiningAlg: DENY_OVR, color: '' } },
            // Rule 1: Permit physician read
            { id: r1,   type: 'rule',     x: 340, y: 40,
              data: { name: 'permit-physician-read', effect: 'Permit', color: 'green' } },
            { id: s1,   type: 'subject',  x: 660, y: 40,
              data: { attrType: 'role', value: 'physician', color: '' } },
            { id: a1,   type: 'action',   x: 660, y: 230,
              data: { attributeId: ACT_ID, action: 'read', customAction: '', color: '' } },
            { id: res1, type: 'resource', x: 660, y: 410,
              data: { attributeId: RES_ID, identifier: 'patient-record', wildcard: false, color: '' } },
            // Rule 2: Permit physician write
            { id: r2,   type: 'rule',     x: 340, y: 620,
              data: { name: 'permit-physician-write', effect: 'Permit', color: 'green' } },
            { id: s2,   type: 'subject',  x: 660, y: 620,
              data: { attrType: 'role', value: 'physician', color: '' } },
            { id: a2,   type: 'action',   x: 660, y: 810,
              data: { attributeId: ACT_ID, action: 'write', customAction: '', color: '' } },
            { id: res2, type: 'resource', x: 660, y: 990,
              data: { attributeId: RES_ID, identifier: 'patient-record', wildcard: false, color: '' } },
            // Rule 3: Deny all
            { id: r3,   type: 'rule',     x: 340, y: 1200,
              data: { name: 'deny-all-others', effect: 'Deny', color: 'red' } },
          ],
          edges: [
            { id: uid(), fromId: pId,  toId: r1   },
            { id: uid(), fromId: r1,   toId: s1   },
            { id: uid(), fromId: r1,   toId: a1   },
            { id: uid(), fromId: r1,   toId: res1 },
            { id: uid(), fromId: pId,  toId: r2   },
            { id: uid(), fromId: r2,   toId: s2   },
            { id: uid(), fromId: r2,   toId: a2   },
            { id: uid(), fromId: r2,   toId: res2 },
            { id: uid(), fromId: pId,  toId: r3   },
          ],
        };
      }
      default: return null;
    }
  }

  function _openTemplateModal() {
    const modal = _wrap?.querySelector('#ne-tpl-modal');
    if (modal) modal.style.display = 'flex';
  }

  function _closeTemplateModal() {
    const modal = _wrap?.querySelector('#ne-tpl-modal');
    if (modal) modal.style.display = 'none';
  }

  function _applyTemplate(tplId) {
    const result = _buildTemplateNodes(tplId);
    if (!result) return;
    if (!confirm(_t('ne.tpl.confirm'))) return;
    _nodes = result.nodes;
    _edges = result.edges;
    _history = [];
    _histIdx = -1;
    _pushHistory();
    try { sessionStorage.removeItem(NE_SESS_KEY); } catch (_) {}
    _rerenderAll();
    requestAnimationFrame(_fitView);
    _emit();
    _closeTemplateModal();
  }

  // ── Phase 2: Minimap ─────────────────────────────────────────────────

  function _updateMinimap() {
    const cvs = _wrap?.querySelector('#ne-minimap');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    if (_nodes.length === 0) return;

    const pad = 30;
    const xs = _nodes.map(n => n.x);
    const ys = _nodes.map(n => n.y);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + NODE_W + pad;
    const maxY = Math.max(...ys) + 120 + pad;
    const cW = maxX - minX, cH = maxY - minY;
    if (cW <= 0 || cH <= 0) return;
    const scale = Math.min(W / cW, H / cH) * 0.9;
    const offX = (W - cW * scale) / 2 - minX * scale;
    const offY = (H - cH * scale) / 2 - minY * scale;

    const TYPE_COLOR = {
      policy: '#3B82F6', rule: '#6B7280', subject: '#10B981',
      action: '#F97316', resource: '#A855F7', condition: '#EAB308', note: '#FCD34D',
    };

    // Edges
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#6B7280';
    ctx.lineWidth = 1;
    _edges.forEach(e => {
      const f = _nodes.find(n => n.id === e.fromId);
      const t = _nodes.find(n => n.id === e.toId);
      if (!f || !t) return;
      ctx.beginPath();
      ctx.moveTo((f.x + NODE_W) * scale + offX, (f.y + PORT_Y) * scale + offY);
      ctx.lineTo(t.x             * scale + offX, (t.y + PORT_Y) * scale + offY);
      ctx.stroke();
    });

    // Nodes
    ctx.globalAlpha = 0.8;
    _nodes.forEach(n => {
      ctx.fillStyle = TYPE_COLOR[n.type] || '#6B7280';
      const nx = n.x * scale + offX;
      const ny = n.y * scale + offY;
      const nw = NODE_W * scale;
      const nh = Math.max(55 * scale, 4);
      ctx.fillRect(nx, ny, nw, nh);
    });

    // Viewport rect
    if (_viewport) {
      const vpR = _viewport.getBoundingClientRect();
      const vx1 = -_panX / _zoom, vy1 = -_panY / _zoom;
      const vx2 = (-_panX + vpR.width) / _zoom;
      const vy2 = (-_panY + vpR.height) / _zoom;
      const mx = vx1 * scale + offX, my = vy1 * scale + offY;
      const mw = (vx2 - vx1) * scale, mh = (vy2 - vy1) * scale;
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(mx, my, mw, mh);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx, my, mw, mh);
    }
    ctx.globalAlpha = 1;
  }

  function _onMinimapClick(e) {
    if (_nodes.length === 0) return;
    const cvs = _wrap?.querySelector('#ne-minimap');
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width  * cvs.width;
    const my = (e.clientY - rect.top)  / rect.height * cvs.height;
    const W = cvs.width, H = cvs.height, pad = 30;
    const xs = _nodes.map(n => n.x), ys = _nodes.map(n => n.y);
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + NODE_W + pad, maxY = Math.max(...ys) + 120 + pad;
    const cW = maxX - minX, cH = maxY - minY;
    const scale = Math.min(W / cW, H / cH) * 0.9;
    const offX = (W - cW * scale) / 2 - minX * scale;
    const offY = (H - cH * scale) / 2 - minY * scale;
    const cx = (mx - offX) / scale;
    const cy = (my - offY) / scale;
    const vpR = _viewport.getBoundingClientRect();
    _panX = vpR.width  / 2 - cx * _zoom;
    _panY = vpR.height / 2 - cy * _zoom;
    _applyTransform();
  }

  // ── Phase 2: Node Search ─────────────────────────────────────────────

  function _nodeSearchText(n) {
    const d = n.data || {};
    const parts = [
      d.name, d.description, d.text, d.version,
      d.effect, d.value, d.attrType,
      d.action, d.customAction, d.attributeId,
      d.identifier, d.attribute, d.functionId,
      d.combiningAlg,
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function _onSearchInput(e) {
    const q = (e.target.value || '').trim().toLowerCase();
    let firstMatch = null;
    _nodes.forEach(n => {
      const el = document.getElementById(`ne-node-${n.id}`);
      if (!el) return;
      const hit = q && _nodeSearchText(n).includes(q);
      el.classList.toggle('ne-node--found', hit);
      if (hit && !firstMatch) firstMatch = n;
    });
    if (firstMatch && _viewport) {
      const vpR = _viewport.getBoundingClientRect();
      _panX = vpR.width  / 2 - (firstMatch.x + NODE_W / 2) * _zoom;
      _panY = vpR.height / 2 - (firstMatch.y + 60)        * _zoom;
      _applyTransform();
    }
  }

  // ── Phase 2: Shareable Link ──────────────────────────────────────────

  function _restoreFromHash() {
    try {
      const hash = location.hash;
      if (!hash.startsWith('#ne=')) return false;
      const encoded = hash.slice(4);
      const data = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      if (Array.isArray(data.nodes) && data.nodes.length > 0) {
        _nodes = data.nodes;
        _edges = data.edges || [];
        history.replaceState(null, '', location.pathname + location.search);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function _copyShareLink() {
    try {
      const data = JSON.stringify({ nodes: _nodes, edges: _edges });
      const hash = btoa(unescape(encodeURIComponent(data)));
      const url  = location.href.replace(/#.*$/, '') + '#ne=' + hash;
      navigator.clipboard.writeText(url).then(() => {
        const btn = _wrap?.querySelector('#ne-share-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '&#x2713;';
          setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
      });
    } catch (_) {}
  }

  // ── Auto-layout (tidy) ────────────────────────────────────────────────
  function _tidyLayout() {
    if (_nodes.length === 0) return;
    _pushHistory();

    const COL_GAP  = 80;   // horizontal gap between columns
    const ROW_GAP  = 30;   // vertical gap between nodes in same column
    const NODE_H   = {     // estimated rendered heights per type
      policy: 210, rule: 185, subject: 150, action: 150,
      resource: 155, condition: 160, note: 120,
    };
    const col0X = 30;
    const col1X = col0X + NODE_W + COL_GAP;
    const col2X = col1X + NODE_W + COL_GAP;

    const pNode = _nodes.find(n => n.type === 'policy');

    // Rules directly connected to policy
    const ruleIds  = pNode
      ? _edges.filter(e => e.fromId === pNode.id).map(e => e.toId)
      : [];
    const ruleNodes = ruleIds
      .map(id => _nodes.find(n => n.id === id))
      .filter(Boolean);

    // Unconnected rule nodes
    const orphanRules = _nodes.filter(n =>
      n.type === 'rule' && !ruleNodes.includes(n)
    );
    const allRules = [...ruleNodes, ...orphanRules];

    // Place each rule and its children
    let curY = 30;
    allRules.forEach(rn => {
      const childIds = _edges.filter(e => e.fromId === rn.id).map(e => e.toId);
      const children = childIds
        .map(id => _nodes.find(n => n.id === id))
        .filter(Boolean);

      const ruleH = NODE_H.rule;

      if (children.length === 0) {
        rn.x = col1X;
        rn.y = curY;
        curY += ruleH + ROW_GAP;
      } else {
        // Stack children in col2
        let childY = curY;
        children.forEach(c => {
          c.x = col2X;
          c.y = childY;
          childY += (NODE_H[c.type] || 150) + ROW_GAP;
        });
        const spanH = childY - curY - ROW_GAP;
        // Centre the rule card vertically over its children block
        rn.x = col1X;
        rn.y = curY + Math.max(0, (spanH - ruleH) / 2);
        curY = childY;
      }
      curY += ROW_GAP; // extra gap between rule groups
    });

    // Centre the policy node vertically over all rules
    if (pNode) {
      if (allRules.length > 0) {
        const minY = Math.min(...allRules.map(r => r.y));
        const maxY = Math.max(...allRules.map(r => r.y));
        const policyH = NODE_H.policy;
        pNode.x = col0X;
        pNode.y = Math.max(30, (minY + maxY) / 2 - policyH / 2);
      } else {
        pNode.x = col0X;
        pNode.y = 30;
      }
    }

    // Remaining orphan nodes (not policy, rule or child of any rule)
    const positioned = new Set([
      ...(pNode ? [pNode.id] : []),
      ...allRules.map(n => n.id),
      ..._edges.flatMap(e => {
        const rn = allRules.find(r => r.id === e.fromId);
        return rn ? [e.toId] : [];
      }),
    ]);
    const leftover = _nodes.filter(n => !positioned.has(n.id));
    leftover.forEach(n => {
      n.x = col2X;
      n.y = curY;
      curY += (NODE_H[n.type] || 150) + ROW_GAP;
    });

    _rerenderAll();
    _fitView();
  }

  function _showDeleteConfirm(nodeId) {
    const dlg = _wrap?.querySelector('#ne-del-confirm');
    if (!dlg) { _deleteNode(nodeId); return; }
    const textEl = dlg.querySelector('.ne-del-confirm-text');
    const yesBtn = dlg.querySelector('#ne-del-yes');
    const noBtn  = dlg.querySelector('#ne-del-no');
    if (textEl) textEl.textContent = _t('ne.node.delete.confirm.text');
    if (yesBtn) yesBtn.textContent = _t('ne.node.delete.confirm.yes');
    if (noBtn)  noBtn.textContent  = _t('ne.node.delete.confirm.no');
    dlg.style.display = '';
    const close = () => { dlg.style.display = 'none'; yesBtn.onclick = null; noBtn.onclick = null; };
    yesBtn.onclick = () => { close(); _deleteNode(nodeId); };
    noBtn.onclick  = close;
  }

  function _downloadPolicy() {
    if (_onDownload) { _onDownload(); return; }
  }

  // ── HTML skeleton ─────────────────────────────────────────────────────

  function _buildSkeleton() {
    const palette = [
      { type: 'rule',      icon: '📜', key: 'ne.palette.rule'      },
      { type: 'subject',   icon: '👤', key: 'ne.palette.subject'   },
      { type: 'action',    icon: '⚡', key: 'ne.palette.action'    },
      { type: 'resource',  icon: '📁', key: 'ne.palette.resource'  },
      { type: 'condition', icon: '🔀', key: 'ne.palette.condition' },
      { type: 'note',      icon: '📝', key: 'ne.palette.note'      },
    ];

    const tplCards = NE_TEMPLATE_DEFS.map(t => `
      <div class="ne-tpl-card">
        <div class="ne-tpl-icon">${t.icon}</div>
        <div class="ne-tpl-title">${_esc(_t(t.titleKey))}</div>
        <div class="ne-tpl-desc">${_esc(_t(t.descKey))}</div>
        <button class="ne-tpl-load-btn" data-tpl="${t.id}">${_esc(_t('ne.tpl.load'))}</button>
      </div>`).join('');

    return `
      <div class="ne-wrap">
        <div class="ne-palette">
          <div class="ne-palette-title">${_esc(_t('ne.palette.title'))}</div>
          ${palette.map(p => `
            <div class="ne-palette-item" draggable="true" data-node-type="${p.type}"
                 title="${_esc(_t('ne.palette.drag'))}">
              <span class="ne-palette-item-icon">${p.icon}</span>
              <span>${_esc(_t(p.key))}</span>
            </div>`).join('')}
          <div class="ne-palette-sep"></div>
          <button class="ne-palette-tpl-btn" id="ne-tpl-btn"
            title="${_esc(_t('ne.tpl.btn.title'))}">
            📋 ${_esc(_t('ne.tpl.btn'))}
          </button>
          <div class="ne-palette-hint">${_esc(_t('ne.palette.hint'))}</div>
        </div>
        <div class="ne-viewport" id="ne-viewport">
          <div class="ne-canvas" id="ne-canvas"></div>
          <svg class="ne-svg" id="ne-svg">
            <g id="ne-svg-transform">
              <g id="ne-edges-group"></g>
              <path id="ne-temp-edge" class="ne-edge-temp" style="display:none"/>
            </g>
          </svg>
          <div class="ne-toolbar">
            <button class="ne-toolbar-btn" id="ne-undo-btn"
              title="${_esc(_t('ne.toolbar.undo'))}" disabled>&#x21A9;</button>
            <button class="ne-toolbar-btn" id="ne-redo-btn"
              title="${_esc(_t('ne.toolbar.redo'))}" disabled>&#x21AA;</button>
            <div class="ne-toolbar-sep"></div>
            <button class="ne-toolbar-btn" id="ne-fit-btn"
              title="${_esc(_t('ne.toolbar.fit'))}">&#x229E;</button>
            <button class="ne-toolbar-btn" id="ne-zoom-reset-btn"
              title="${_esc(_t('ne.toolbar.reset'))}"
              style="font-size:0.65rem;width:36px">100%</button>
            <div class="ne-toolbar-sep"></div>
            <input class="ne-toolbar-search" id="ne-search" type="text"
              placeholder="${_esc(_t('ne.search.placeholder'))}"
              title="${_esc(_t('ne.search.title'))}"
              aria-label="${_esc(_t('ne.search.title'))}">
            <div class="ne-toolbar-sep"></div>
            <button class="ne-toolbar-btn" id="ne-tidy-btn"
              title="${_esc(_t('ne.toolbar.tidy'))}" style="font-size:1.1rem;font-weight:700">&#x22A3;</button>
            <button class="ne-toolbar-btn" id="ne-share-btn"
              title="${_esc(_t('ne.share.title'))}">&#x1F517;</button>
            <button class="ne-toolbar-btn" id="ne-download-btn"
              title="${_esc(_t('ne.toolbar.download'))}">&#x2B07;</button>
            <div class="ne-toolbar-sep"></div>
            <button class="ne-toolbar-btn ne-toolbar-btn--danger" id="ne-clear-btn"
              title="${_esc(_t('ne.toolbar.clear'))}">&#x1F5D1;</button>
          </div>
          <canvas id="ne-minimap" class="ne-minimap" width="160" height="90"
            title="${_esc(_t('ne.minimap.title'))}"></canvas>
          <div id="ne-validation" class="ne-validation">
            <span class="ne-validation-dot invalid"></span>
            <span class="ne-validation-text">${_esc(_t('ne.validation.invalid'))}</span>
          </div>
          <div class="ne-empty-hint" style="display:none">
            <div class="ne-empty-hint-icon">🎨</div>
            <p>${_esc(_t('ne.hint.drag'))}</p>
          </div>
          <div id="ne-del-confirm" class="ne-del-confirm" style="display:none">
            <div class="ne-del-confirm-inner">
              <span class="ne-del-confirm-text"></span>
              <button class="ne-del-confirm-yes" id="ne-del-yes"></button>
              <button class="ne-del-confirm-no" id="ne-del-no"></button>
            </div>
          </div>
          <div id="ne-tpl-modal" class="ne-tpl-modal" style="display:none">
            <div class="ne-tpl-modal-inner">
              <div class="ne-tpl-modal-hdr">
                <span class="ne-tpl-modal-title">${_esc(_t('ne.tpl.modal.title'))}</span>
                <button class="ne-tpl-close-btn" id="ne-tpl-close" title="${_esc(_t('ne.tpl.modal.close'))}">&#x2715;</button>
              </div>
              <div class="ne-tpl-grid">${tplCards}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Public: init ───────────────────────────────────────────────────────

  function init(container, onPolicyChange, onDownload) {
    destroy();

    _wrap           = container;
    _onPolicyChange = onPolicyChange;
    _onDownload     = onDownload || null;
    _zoom = 1; _panX = INIT_PX; _panY = INIT_PY;
    _history        = [];
    _histIdx        = -1;
    _selNode = null;
    _selEdge = null;

    // Try to restore layout from sessionStorage
    // 1. URL hash takes highest priority (shared link)
    let restored = _restoreFromHash();

    // 2. Fall back to sessionStorage
    if (!restored) {
      try {
        const saved = sessionStorage.getItem(NE_SESS_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (Array.isArray(s.nodes) && s.nodes.length > 0) {
            _nodes = s.nodes;
            _edges = s.edges || [];
            restored = true;
          }
        }
      } catch (_) {}
    }

    // 3. Start with a single blank policy node
    if (!restored) {
      _nodes = [{ id: _uid(), type: 'policy', x: 20, y: 50, data: _defaultData('policy') }];
      _edges = [];
    }

    container.innerHTML = _buildSkeleton();

    _viewport          = container.querySelector('#ne-viewport');
    _canvas            = container.querySelector('#ne-canvas');
    _svgEl             = container.querySelector('#ne-svg');
    _svgTransformGroup = container.querySelector('#ne-svg-transform');
    _edgesGroup        = container.querySelector('#ne-edges-group');
    _tempEdgePath      = container.querySelector('#ne-temp-edge');

    _applyTransform();
    _pushHistory();
    _renderNodes();
    _renderEdges();
    _updateValidation();
    _updateMinimap();
    if (restored) {
      requestAnimationFrame(_fitView);
      // Notify creator.js so XML preview and visualizer update immediately
      _emit();
    }

    container.addEventListener('mousedown', _onMouseDown);
    container.addEventListener('click',     _onClick);
    container.addEventListener('input',     _onInput);
    container.addEventListener('change',    _onInput);

    _viewport.addEventListener('dragover', _onViewportDragOver);
    _viewport.addEventListener('drop',     _onViewportDrop);

    const palette = container.querySelector('.ne-palette');
    if (palette) {
      palette.addEventListener('dragstart', _onPaletteDragStart);
      palette.addEventListener('click',     _onPaletteClick);
    }

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
    document.addEventListener('keydown',   _onKeyDown);

    _viewport.addEventListener('wheel', _onWheel, { passive: false });

    container.querySelector('#ne-undo-btn')?.addEventListener('click', _undo);
    container.querySelector('#ne-redo-btn')?.addEventListener('click', _redo);
    container.querySelector('#ne-fit-btn')?.addEventListener('click',  _fitView);
    container.querySelector('#ne-zoom-reset-btn')?.addEventListener('click', _resetView);
    container.querySelector('#ne-clear-btn')?.addEventListener('click', _clearCanvas);
    container.querySelector('#ne-download-btn')?.addEventListener('click', _downloadPolicy);
    container.querySelector('#ne-tidy-btn')?.addEventListener('click', _tidyLayout);

    // Phase 2 — minimap click + search
    container.querySelector('#ne-minimap')?.addEventListener('click', _onMinimapClick);
    container.querySelector('#ne-search')?.addEventListener('input',  _onSearchInput);

    // Do NOT call _emit() here — would overwrite saved creator state.
    // setPolicy() will be called by the host if this is a fresh start.
    return restored;
  }

  // ── Public: setPolicy ──────────────────────────────────────────────────

  function setPolicy(policy) {
    if (!policy) return;

    const pId = _uid();
    const nodes = [{
      id: pId, type: 'policy', x: 30, y: 60,
      data: {
        name:         policy.id          || 'meine-policy',
        version:      policy.version     || '2.0',
        description:  policy.description || '',
        combiningAlg: policy.combiningAlg ||
                      'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',
      },
    }];
    const edges = [];

    let ruleY = 40;
    (policy.rules || []).forEach(rule => {
      const rId = _uid();
      nodes.push({ id: rId, type: 'rule', x: 340, y: ruleY,
        data: { name: rule.id || 'regel', description: rule.description || '', effect: rule.effect || 'Permit' } });
      edges.push({ id: _uid(), fromId: pId, toId: rId });

      let childY = ruleY;
      const matches = rule.target?.groups?.[0]?.matches || [];

      matches.filter(m => m.cat === 'subject').forEach(s => {
        const nId = _uid();
        let attrType = 'id';
        if (s.attributeId?.includes('role'))  attrType = 'role';
        if (s.attributeId?.includes('group')) attrType = 'group';
        if (s.attributeId?.includes('email')) attrType = 'email';
        nodes.push({ id: nId, type: 'subject', x: 660, y: childY,
          data: { attrType, operator: 'eq', value: s.value || '' } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 180;
      });

      matches.filter(m => m.cat === 'action').forEach(a => {
        const nId = _uid();
        const known = ['read','write','delete','execute','*'];
        const act   = known.includes(a.value) ? a.value : 'custom';
        nodes.push({ id: nId, type: 'action', x: 660, y: childY,
          data: {
            attributeId:  a.attributeId || 'urn:oasis:names:tc:xacml:1.0:action:action-id',
            action:       act,
            customAction: act === 'custom' ? (a.value||'') : '',
          } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 170;
      });

      matches.filter(m => m.cat === 'resource').forEach(r => {
        const nId = _uid();
        nodes.push({ id: nId, type: 'resource', x: 660, y: childY,
          data: {
            attributeId: r.attributeId || 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',
            identifier:  r.value === '*' ? '' : (r.value||''),
            wildcard:    r.value === '*',
          } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 180;
      });

      (rule.conditions || []).forEach(c => {
        const nId = _uid();
        nodes.push({ id: nId, type: 'condition', x: 660, y: childY,
          data: {
            category:   c.arg1Cat   || 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject',
            attribute:  c.arg1AttrId || '',
            functionId: c.functionId || 'urn:oasis:names:tc:xacml:1.0:function:string-equal',
            value:      c.arg2Value  || '',
            logic:      rule.conditionOp || 'AND',
          } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 240;
      });

      ruleY = Math.max(ruleY + 250, childY + 30);
    });

    _nodes   = nodes;
    _edges   = edges;
    _history = [];
    _histIdx = -1;
    _pushHistory();

    if (_canvas) {
      _rerenderAll();
      // Fit view after layout so all nodes are visible; defer by one frame
      // so the DOM has finalised its dimensions.
      requestAnimationFrame(_fitView);
    }
  }

  // ── Public: apply evaluation trace (Phase 3 simulator) ───────────────

  function setTraceResult(traceResult) {
    if (!_canvas) return;

    // Clear all existing trace classes first
    _nodes.forEach(n => {
      const el = document.getElementById(`ne-node-${n.id}`);
      if (el) el.classList.remove('ne-trace-permit', 'ne-trace-deny', 'ne-trace-na', 'ne-trace-skip');
    });

    if (!traceResult) return;

    // Highlight policy (root) node based on final decision
    const policyNode = _nodes.find(n => n.type === 'policy');
    if (policyNode) {
      const el  = document.getElementById(`ne-node-${policyNode.id}`);
      const cls = traceResult.decision === 'Permit' ? 'ne-trace-permit'
                : traceResult.decision === 'Deny'   ? 'ne-trace-deny'
                : 'ne-trace-na';
      if (el) el.classList.add(cls);
    }

    // Highlight rule nodes and their connected child nodes
    for (const rt of (traceResult.ruleTraces || [])) {
      const ruleNode = _nodes.find(n => n.type === 'rule' && n.data && n.data.id === rt.ruleId);
      if (!ruleNode) continue;

      const ruleEl  = document.getElementById(`ne-node-${ruleNode.id}`);
      const ruleCls = rt.skipped       ? 'ne-trace-skip'
                    : rt.decision === 'Permit' ? 'ne-trace-permit'
                    : rt.decision === 'Deny'   ? 'ne-trace-deny'
                    : 'ne-trace-na';
      if (ruleEl) ruleEl.classList.add(ruleCls);

      // Find child nodes connected from this rule node
      const childEdges = _edges.filter(e => e.fromId === ruleNode.id);
      for (const edge of childEdges) {
        const childNode = _nodes.find(n => n.id === edge.toId);
        if (!childNode) continue;
        const childEl = document.getElementById(`ne-node-${childNode.id}`);
        if (!childEl) continue;

        let childCls = 'ne-trace-na';
        if (rt.skipped) {
          childCls = 'ne-trace-skip';
        } else if (childNode.type === 'subject') {
          const checks = rt.targetChecks.filter(c => c.cat === 'subject');
          childCls = checks.length === 0 ? (rt.targetMatch ? 'ne-trace-permit' : 'ne-trace-na')
                   : checks.every(c => c.match) ? 'ne-trace-permit' : 'ne-trace-deny';
        } else if (childNode.type === 'action') {
          const checks = rt.targetChecks.filter(c => c.cat === 'action');
          childCls = checks.length === 0 ? (rt.targetMatch ? 'ne-trace-permit' : 'ne-trace-na')
                   : checks.every(c => c.match) ? 'ne-trace-permit' : 'ne-trace-deny';
        } else if (childNode.type === 'resource') {
          const checks = rt.targetChecks.filter(c => c.cat === 'resource');
          childCls = checks.length === 0 ? (rt.targetMatch ? 'ne-trace-permit' : 'ne-trace-na')
                   : checks.every(c => c.match) ? 'ne-trace-permit' : 'ne-trace-deny';
        } else if (childNode.type === 'condition') {
          const checks = rt.conditionChecks || [];
          childCls = checks.length === 0 ? 'ne-trace-na'
                   : checks.every(c => c.match) ? 'ne-trace-permit' : 'ne-trace-deny';
        }
        childEl.classList.add(childCls);
      }
    }
  }

  function clearTrace() {
    if (!_canvas) return;
    _nodes.forEach(n => {
      const el = document.getElementById(`ne-node-${n.id}`);
      if (el) el.classList.remove('ne-trace-permit', 'ne-trace-deny', 'ne-trace-na', 'ne-trace-skip');
    });
  }

  // ── Public: refresh labels (i18n change) ──────────────────────────────

  function refresh() {
    if (!_canvas) return;
    _rerenderAll();
    _updateValidation();
  }

  // ── Public: destroy ────────────────────────────────────────────────────

  function destroy() {
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup',   _onMouseUp);
    document.removeEventListener('keydown',   _onKeyDown);
    _canvas            = null;
    _viewport          = null;
    _svgEl             = null;
    _svgTransformGroup = null;
    _edgesGroup        = null;
    _tempEdgePath      = null;
    _wrap         = null;
    _dragConn     = null;
  }

  function clearSession() {
    try { sessionStorage.removeItem(NE_SESS_KEY); } catch (_) {}
  }

  return { init, setPolicy, refresh, destroy, clearSession, setTraceResult, clearTrace };
})();

export { NodeEditor };
