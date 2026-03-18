'use strict';

// ================================================================
//  NODE EDITOR  — Visual Policy Creator (Phase 1)
//  Vanilla JS canvas with draggable nodes, SVG edges, undo/redo.
// ================================================================

import { I18n } from './i18n.js';

const NODE_W = 230; // node width in canvas pixels

// Port Y-offset from node top (center of header at ~38px / 2 ≈ 19)
const PORT_Y = 19;

// ── Allowed connection rules ────────────────────────────────────────────
const ALLOWED_TARGETS = {
  policy:    ['rule'],
  rule:      ['subject', 'action', 'resource', 'condition'],
  subject:   [],
  action:    [],
  resource:  [],
  condition: [],
};

// ── XACML mappings ──────────────────────────────────────────────────────
const SUBJECT_ATTR_IDS = {
  role:  'urn:oasis:names:tc:xacml:2.0:subject:role',
  id:    'urn:oasis:names:tc:xacml:1.0:subject:subject-id',
  group: 'urn:oasis:names:tc:xacml:1.0:subject:group',
  email: 'urn:oasis:names:tc:xacml:1.0:subject:email',
};

const OP_TO_COND_FN = {
  eq:       'urn:oasis:names:tc:xacml:1.0:function:string-equal',
  neq:      'urn:oasis:names:tc:xacml:1.0:function:string-equal',
  lt:       'urn:oasis:names:tc:xacml:1.0:function:integer-less-than',
  gt:       'urn:oasis:names:tc:xacml:1.0:function:integer-greater-than',
  contains: 'urn:oasis:names:tc:xacml:1.0:function:string-equal',
  inList:   'urn:oasis:names:tc:xacml:1.0:function:string-at-least-one-member-of',
};

const NodeEditor = (() => {
  // ── Module-level DOM refs ──
  let _wrap        = null;
  let _viewport    = null;
  let _canvas      = null;
  let _svgEl       = null;
  let _edgesGroup  = null;
  let _tempEdgePath= null;

  // ── Callback ──
  let _onPolicyChange = null;

  // ── Editor state ──
  let _nodes    = [];
  let _edges    = [];
  let _zoom     = 1;
  let _panX     = 260;
  let _panY     = 60;
  let _history  = [];
  let _histIdx  = -1;
  let _selNode  = null;   // selected node id
  let _selEdge  = null;   // selected edge id

  // ── Drag state ──
  let _dragNode = null;   // { nodeId, startMX, startMY, origX, origY }
  let _dragPan  = null;   // { startMX, startMY, origPX, origPY }
  let _dragConn = null;   // { fromId, curX, curY }
  let _paletteType = null; // type being dragged from palette

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
        name: 'meine-policy',
        description: '',
        combiningAlg: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',
      };
      case 'rule':      return { name: 'regel-1', effect: 'Permit' };
      case 'subject':   return { attrType: 'role', operator: 'eq', value: '' };
      case 'action':    return { action: 'read', customAction: '' };
      case 'resource':  return { resourceType: 'document', identifier: '', wildcard: false };
      case 'condition': return { attribute: '', operator: 'eq', value: '', logic: 'AND' };
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

  // ── Screen ↔ canvas coordinate conversion ──────────────────────────────

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
    const errors = [];
    const warnings = [];
    if (!hasPolicy) errors.push('no-policy');
    if (ruleNodes.length === 0) errors.push('no-rules');
    ruleNodes.forEach(r => {
      const connectedToPolicy = _edges.some(e => e.toId === r.id);
      if (!connectedToPolicy) warnings.push('rule-unconnected');
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
      dot.className  = 'ne-validation-dot invalid';
      text.textContent = _t('ne.validation.invalid');
    } else if (warnings.length > 0) {
      dot.className  = 'ne-validation-dot warning';
      text.textContent = _t('ne.validation.warnings', { n: warnings.length });
    } else {
      dot.className  = 'ne-validation-dot valid';
      text.textContent = _t('ne.validation.valid');
    }
  }

  // ── Serialisation → policy model ────────────────────────────────────────

  function _toPolicyModel() {
    const pNode = _nodes.find(n => n.type === 'policy');
    if (!pNode) return null;

    // Find connected rule nodes (or all rule nodes if none connected)
    let ruleNodes = _nodes.filter(n =>
      n.type === 'rule' && _edges.some(e => e.fromId === pNode.id && e.toId === n.id)
    );
    if (ruleNodes.length === 0) {
      ruleNodes = _nodes.filter(n => n.type === 'rule');
    }

    const rules = ruleNodes.map(rn => {
      const children = _edges
        .filter(e => e.fromId === rn.id)
        .map(e => _nodes.find(n => n.id === e.toId))
        .filter(Boolean);

      const subjects   = children.filter(n => n.type === 'subject');
      const actions    = children.filter(n => n.type === 'action');
      const resources  = children.filter(n => n.type === 'resource');
      const conditions = children.filter(n => n.type === 'condition');

      const matches = [];

      subjects.forEach(s => {
        matches.push({
          cat: 'subject',
          attributeId: SUBJECT_ATTR_IDS[s.data.attrType] || SUBJECT_ATTR_IDS.role,
          matchId:  'urn:oasis:names:tc:xacml:1.0:function:string-equal',
          dataType: 'http://www.w3.org/2001/XMLSchema#string',
          valueType: 'simple',
          value: s.data.value || '',
        });
      });

      actions.forEach(a => {
        const val = a.data.action === 'custom'
          ? (a.data.customAction || '')
          : (a.data.action || 'read');
        matches.push({
          cat: 'action',
          attributeId: 'urn:oasis:names:tc:xacml:1.0:action:action-id',
          matchId:  'urn:oasis:names:tc:xacml:1.0:function:string-equal',
          dataType: 'http://www.w3.org/2001/XMLSchema#string',
          valueType: 'simple',
          value: val,
        });
      });

      resources.forEach(r => {
        matches.push({
          cat: 'resource',
          attributeId: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',
          matchId:  'urn:oasis:names:tc:xacml:1.0:function:string-equal',
          dataType: 'http://www.w3.org/2001/XMLSchema#string',
          valueType: 'simple',
          value: r.data.wildcard ? '*' : (r.data.identifier || ''),
        });
      });

      const conditionModels = conditions.map(c => ({
        functionId:    OP_TO_COND_FN[c.data.operator] || OP_TO_COND_FN.eq,
        functionCustom: '',
        arg1Cat:    'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject',
        arg1AttrId: c.data.attribute || 'urn:oasis:names:tc:xacml:2.0:subject:role',
        arg1DataType: 'http://www.w3.org/2001/XMLSchema#string',
        arg2Value:    c.data.value || '',
        arg2DataType: 'http://www.w3.org/2001/XMLSchema#string',
      }));

      return {
        id:          rn.data.name || rn.id,
        effect:      rn.data.effect || 'Permit',
        description: '',
        target:      { groups: [{ matches }] },
        conditions:  conditionModels,
        conditionOp: conditions.length > 0 ? (conditions[0].data.logic || 'AND') : 'AND',
      };
    });

    return {
      id:           pNode.data.name || 'node-policy',
      version:      '3.0',
      description:  pNode.data.description || '',
      combiningAlg: pNode.data.combiningAlg ||
                    'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',
      target:       { groups: [{ matches: [] }] },
      rules,
    };
  }

  // ── Emit policy change ──────────────────────────────────────────────────

  function _emit() {
    _updateValidation();
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
  }

  function _renderNodes() {
    _canvas.querySelectorAll('.ne-node').forEach(el => el.remove());
    _nodes.forEach(n => _canvas.appendChild(_makeNodeEl(n)));
    const hint = _wrap.querySelector('.ne-empty-hint');
    if (hint) hint.style.display = _nodes.length <= 1 ? '' : 'none';
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
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', _bezier(p1.x, p1.y, p2.x, p2.y));
      path.setAttribute('class', `ne-edge${e.id === _selEdge ? ' selected' : ''}`);
      path.dataset.edgeId = e.id;
      _edgesGroup.appendChild(path);
    });
  }

  // ── Node element builder ───────────────────────────────────────────────

  const NODE_TYPE_META = {
    policy:    { icon: '📋', labelKey: 'ne.node.policy.label' },
    rule:      { icon: '📜', labelKey: 'ne.node.rule.label'   },
    subject:   { icon: '👤', labelKey: 'ne.node.subject.label'   },
    action:    { icon: '⚡', labelKey: 'ne.node.action.label'    },
    resource:  { icon: '📁', labelKey: 'ne.node.resource.label'  },
    condition: { icon: '🔀', labelKey: 'ne.node.condition.label' },
  };

  function _makeNodeEl(node) {
    const el   = document.createElement('div');
    const meta = NODE_TYPE_META[node.type] || { icon:'❓', labelKey: node.type };
    const isLeaf   = ['subject','action','resource','condition'].includes(node.type);
    const isPolicy = node.type === 'policy';
    const canDel   = !isPolicy;

    el.id        = `ne-node-${node.id}`;
    el.className = `ne-node ne-node--${node.type}${
      node.type === 'rule' ? ` effect-${(node.data.effect||'Permit').toLowerCase()}` : ''
    }${node.id === _selNode ? ' selected' : ''}`;
    el.style.cssText = `left:${node.x}px;top:${node.y}px`;

    el.innerHTML = `
      <div class="ne-node-hdr" data-drag="${node.id}">
        <span class="ne-node-icon">${meta.icon}</span>
        <span class="ne-node-label">${_esc(_t(meta.labelKey))}</span>
        ${canDel ? `<button class="ne-node-del" data-del="${node.id}"
          title="${_esc(_t('ne.node.delete'))}" aria-label="${_esc(_t('ne.node.delete'))}">&#x2715;</button>` : ''}
      </div>
      <div class="ne-node-body" id="ne-body-${node.id}">
        ${_bodyHtml(node)}
      </div>
      ${!isPolicy ? `<div class="ne-port ne-port-in"  data-pin="${node.id}"></div>` : ''}
      ${!isLeaf   ? `<div class="ne-port ne-port-out" data-pout="${node.id}"></div>` : ''}
    `;
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
          <span class="ne-field-label">${_esc(_t('ne.field.policy.alg'))}</span>
          <select data-node="${id}" data-field="combiningAlg">
            ${_algOpts(d.combiningAlg)}
          </select>
        </div>`;

      case 'rule': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.rule.id'))}</span>
          <input type="text" data-node="${id}" data-field="name" value="${_esc(d.name)}">
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
            <option value="role"  ${d.attrType==='role' ?'selected':''}>${_esc(_t('ne.subject.role'))}</option>
            <option value="id"    ${d.attrType==='id'   ?'selected':''}>${_esc(_t('ne.subject.id'))}</option>
            <option value="group" ${d.attrType==='group'?'selected':''}>${_esc(_t('ne.subject.group'))}</option>
            <option value="email" ${d.attrType==='email'?'selected':''}>${_esc(_t('ne.subject.email'))}</option>
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.operator'))}</span>
          <select data-node="${id}" data-field="operator">
            <option value="eq"         ${d.operator==='eq'        ?'selected':''}>${_esc(_t('ne.op.eq'))}</option>
            <option value="neq"        ${d.operator==='neq'       ?'selected':''}>${_esc(_t('ne.op.neq'))}</option>
            <option value="contains"   ${d.operator==='contains'  ?'selected':''}>${_esc(_t('ne.op.contains'))}</option>
            <option value="startsWith" ${d.operator==='startsWith'?'selected':''}>${_esc(_t('ne.op.startsWith'))}</option>
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.value'))}</span>
          <input type="text" data-node="${id}" data-field="value" value="${_esc(d.value)}"
            placeholder="${_esc(_t('ne.placeholder.subject'))}">
        </div>`;

      case 'action': return `
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
        </div>` : ''}`;

      case 'resource': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.resource.type'))}</span>
          <select data-node="${id}" data-field="resourceType">
            <option value="document" ${d.resourceType==='document'?'selected':''}>${_esc(_t('ne.resource.document'))}</option>
            <option value="endpoint" ${d.resourceType==='endpoint'?'selected':''}>${_esc(_t('ne.resource.endpoint'))}</option>
            <option value="service"  ${d.resourceType==='service' ?'selected':''}>${_esc(_t('ne.resource.service'))}</option>
            <option value="custom"   ${d.resourceType==='custom'  ?'selected':''}>${_esc(_t('ne.resource.custom'))}</option>
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.resource.id'))}</span>
          <input type="text" data-node="${id}" data-field="identifier" value="${_esc(d.identifier)}"
            placeholder="${_esc(_t('ne.placeholder.resource'))}">
        </div>
        <div class="ne-field ne-field-row">
          <input type="checkbox" id="ne-wc-${id}" data-node="${id}" data-field="wildcard" ${d.wildcard?'checked':''}>
          <label for="ne-wc-${id}" class="ne-field-label" style="margin:0;cursor:pointer">${_esc(_t('ne.field.resource.wildcard'))}</label>
        </div>`;

      case 'condition': return `
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.condition.attr'))}</span>
          <input type="text" data-node="${id}" data-field="attribute" value="${_esc(d.attribute)}"
            placeholder="${_esc(_t('ne.placeholder.condition'))}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.operator'))}</span>
          <select data-node="${id}" data-field="operator">
            <option value="eq"       ${d.operator==='eq'      ?'selected':''}>= (${_esc(_t('ne.op.eq'))})</option>
            <option value="neq"      ${d.operator==='neq'     ?'selected':''}>≠ (${_esc(_t('ne.op.neq'))})</option>
            <option value="lt"       ${d.operator==='lt'      ?'selected':''}>&lt;</option>
            <option value="gt"       ${d.operator==='gt'      ?'selected':''}>&gt;</option>
            <option value="contains" ${d.operator==='contains'?'selected':''}>${_esc(_t('ne.op.contains'))}</option>
            <option value="inList"   ${d.operator==='inList'  ?'selected':''}>${_esc(_t('ne.op.inList'))}</option>
          </select>
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.value'))}</span>
          <input type="text" data-node="${id}" data-field="value" value="${_esc(d.value)}">
        </div>
        <div class="ne-field">
          <span class="ne-field-label">${_esc(_t('ne.field.condition.logic'))}</span>
          <select data-node="${id}" data-field="logic">
            <option value="AND" ${d.logic==='AND'?'selected':''}>AND</option>
            <option value="OR"  ${d.logic==='OR' ?'selected':''}>OR</option>
          </select>
        </div>`;

      default: return '';
    }
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
    const el = _makeNodeEl(node);
    _canvas.appendChild(el);
    const hint = _wrap.querySelector('.ne-empty-hint');
    if (hint) hint.style.display = 'none';
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

  // ── Event handlers ─────────────────────────────────────────────────────

  function _onMouseDown(e) {
    // Port out → start connection
    const pout = e.target.closest('[data-pout]');
    if (pout) {
      e.preventDefault();
      e.stopPropagation();
      const pos = _s2c(e.clientX, e.clientY);
      _dragConn = { fromId: pout.dataset.pout, curX: pos.x, curY: pos.y };
      if (_tempEdgePath) _tempEdgePath.style.display = '';
      return;
    }

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

    // Canvas pan (click on viewport background)
    if (
      e.target === _viewport ||
      e.target === _canvas   ||
      e.target === _svgEl    ||
      e.target === _edgesGroup
    ) {
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
      if (el) el.style.cssText = `left:${node.x}px;top:${node.y}px`;
      _renderEdges();
      return;
    }

    if (_dragPan) {
      _panX = _dragPan.origPX + (e.clientX - _dragPan.startMX);
      _panY = _dragPan.origPY + (e.clientY - _dragPan.startMY);
      _applyTransform();
      return;
    }

    if (_dragConn && _tempEdgePath) {
      const pos = _s2c(e.clientX, e.clientY);
      _dragConn.curX = pos.x;
      _dragConn.curY = pos.y;
      const fn = _nodes.find(n => n.id === _dragConn.fromId);
      if (fn) {
        const p1 = _portPos(fn, 'out');
        _tempEdgePath.setAttribute('d', _bezier(p1.x, p1.y, pos.x, pos.y));
      }
    }
  }

  function _onMouseUp(e) {
    if (_dragNode) {
      _pushHistory();
      _dragNode = null;
      _emit();
      return;
    }

    if (_dragPan) {
      _dragPan = null;
      return;
    }

    if (_dragConn) {
      if (_tempEdgePath) {
        _tempEdgePath.style.display = 'none';
        _tempEdgePath.setAttribute('d', '');
      }
      const pin = e.target.closest('[data-pin]');
      if (pin && pin.dataset.pin !== _dragConn.fromId) {
        _addEdge(_dragConn.fromId, pin.dataset.pin);
      }
      _dragConn = null;
    }
  }

  function _onClick(e) {
    // Delete node
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      _deleteNode(del.dataset.del);
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

    // Edge click
    const edgeEl = e.target.closest('.ne-edge');
    if (edgeEl) {
      _selEdge = edgeEl.dataset.edgeId;
      _selNode = null;
      _renderEdges();
      return;
    }
  }

  function _onInput(e) {
    const nodeId = e.target.dataset?.node;
    const field  = e.target.dataset?.field;
    if (!nodeId || !field) return;
    const node = _nodes.find(n => n.id === nodeId);
    if (!node) return;

    node.data[field] = e.target.type === 'checkbox'
      ? e.target.checked
      : e.target.value;

    // Re-render body if action changed (to show/hide custom input)
    if (field === 'action') {
      const body = document.getElementById(`ne-body-${nodeId}`);
      if (body) body.innerHTML = _bodyHtml(node);
    }

    _emit();
  }

  function _onKeyDown(e) {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (_selNode) { _deleteNode(_selNode); _selNode = null; }
      else if (_selEdge) { _deleteEdge(_selEdge); _selEdge = null; }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      _undo();
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      _redo();
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

  // Palette drag & drop
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

  // ── Toolbar actions ────────────────────────────────────────────────────

  function _fitView() {
    if (_nodes.length === 0) return;
    const xs = _nodes.map(n => n.x);
    const ys = _nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + NODE_W;
    const maxY = Math.max(...ys) + 200;
    const r    = _viewport.getBoundingClientRect();
    const sz   = Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80), 1.5);
    _zoom = sz;
    _panX = 40 - minX * sz;
    _panY = 40 - minY * sz;
    _applyTransform();
  }

  function _resetView() {
    _zoom = 1; _panX = 260; _panY = 60;
    _applyTransform();
  }

  // ── HTML skeleton ─────────────────────────────────────────────────────

  function _buildSkeleton() {
    const palette = [
      { type: 'rule',      icon: '📜', key: 'ne.palette.rule'      },
      { type: 'subject',   icon: '👤', key: 'ne.palette.subject'   },
      { type: 'action',    icon: '⚡', key: 'ne.palette.action'    },
      { type: 'resource',  icon: '📁', key: 'ne.palette.resource'  },
      { type: 'condition', icon: '🔀', key: 'ne.palette.condition' },
    ];

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
          <div class="ne-palette-hint">${_esc(_t('ne.palette.hint'))}</div>
        </div>
        <div class="ne-viewport" id="ne-viewport">
          <div class="ne-canvas" id="ne-canvas">
            <svg class="ne-svg" id="ne-svg">
              <g id="ne-edges-group"></g>
              <path id="ne-temp-edge" class="ne-edge-temp" style="display:none"/>
            </svg>
          </div>
          <div class="ne-toolbar">
            <button class="ne-toolbar-btn" id="ne-undo-btn"
              title="${_esc(_t('ne.toolbar.undo'))}" aria-label="${_esc(_t('ne.toolbar.undo'))}" disabled>&#x21A9;</button>
            <button class="ne-toolbar-btn" id="ne-redo-btn"
              title="${_esc(_t('ne.toolbar.redo'))}" aria-label="${_esc(_t('ne.toolbar.redo'))}" disabled>&#x21AA;</button>
            <div class="ne-toolbar-sep"></div>
            <button class="ne-toolbar-btn" id="ne-fit-btn"
              title="${_esc(_t('ne.toolbar.fit'))}" aria-label="${_esc(_t('ne.toolbar.fit'))}">&#x229E;</button>
            <button class="ne-toolbar-btn" id="ne-reset-btn"
              title="${_esc(_t('ne.toolbar.reset'))}" aria-label="${_esc(_t('ne.toolbar.reset'))}"
              style="font-size:0.65rem;width:36px">100%</button>
          </div>
          <div id="ne-validation" class="ne-validation">
            <span class="ne-validation-dot invalid"></span>
            <span class="ne-validation-text">${_esc(_t('ne.validation.invalid'))}</span>
          </div>
          <div class="ne-empty-hint" style="display:none">
            <div class="ne-empty-hint-icon">🎨</div>
            <p>${_esc(_t('ne.hint.drag'))}</p>
          </div>
        </div>
      </div>`;
  }

  // ── Public: init ───────────────────────────────────────────────────────

  function init(container, onPolicyChange) {
    destroy();

    _wrap             = container;
    _onPolicyChange   = onPolicyChange;
    _nodes            = [{ id: _uid(), type: 'policy', x: 60, y: 80, data: _defaultData('policy') }];
    _edges            = [];
    _zoom = 1; _panX = 260; _panY = 60;
    _history          = [];
    _histIdx          = -1;
    _selNode = null;
    _selEdge = null;

    container.innerHTML = _buildSkeleton();

    _viewport    = container.querySelector('#ne-viewport');
    _canvas      = container.querySelector('#ne-canvas');
    _svgEl       = container.querySelector('#ne-svg');
    _edgesGroup  = container.querySelector('#ne-edges-group');
    _tempEdgePath= container.querySelector('#ne-temp-edge');

    _applyTransform();
    _pushHistory();
    _renderNodes();
    _renderEdges();
    _updateValidation();

    // Bind events
    container.addEventListener('mousedown', _onMouseDown);
    container.addEventListener('click',     _onClick);
    container.addEventListener('input',     _onInput);
    container.addEventListener('change',    _onInput);

    _viewport.addEventListener('dragover', _onViewportDragOver);
    _viewport.addEventListener('drop',     _onViewportDrop);

    const palette = container.querySelector('.ne-palette');
    if (palette) palette.addEventListener('dragstart', _onPaletteDragStart);

    // Global events (detached in destroy)
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
    document.addEventListener('keydown',   _onKeyDown);

    _viewport.addEventListener('wheel', _onWheel, { passive: false });

    // Toolbar
    container.querySelector('#ne-undo-btn')?.addEventListener('click', _undo);
    container.querySelector('#ne-redo-btn')?.addEventListener('click', _redo);
    container.querySelector('#ne-fit-btn')?.addEventListener('click',  _fitView);
    container.querySelector('#ne-reset-btn')?.addEventListener('click', _resetView);

    _emit();
  }

  // ── Public: setPolicy ──────────────────────────────────────────────────

  function setPolicy(policy) {
    if (!policy) return;

    const pId = _uid();
    const nodes = [{
      id: pId, type: 'policy', x: 60, y: 80,
      data: {
        name:         policy.id          || 'meine-policy',
        description:  policy.description || '',
        combiningAlg: policy.combiningAlg ||
                      'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides',
      },
    }];
    const edges = [];

    let ruleY = 60;
    (policy.rules || []).forEach(rule => {
      const rId = _uid();
      nodes.push({ id: rId, type: 'rule', x: 360, y: ruleY,
        data: { name: rule.id || 'regel', effect: rule.effect || 'Permit' } });
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
        childY += 160;
      });

      matches.filter(m => m.cat === 'action').forEach(a => {
        const nId = _uid();
        const known = ['read','write','delete','execute','*'];
        const act   = known.includes(a.value) ? a.value : 'custom';
        nodes.push({ id: nId, type: 'action', x: 660, y: childY,
          data: { action: act, customAction: act === 'custom' ? (a.value||'') : '' } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 130;
      });

      matches.filter(m => m.cat === 'resource').forEach(r => {
        const nId = _uid();
        nodes.push({ id: nId, type: 'resource', x: 660, y: childY,
          data: { resourceType: 'document', identifier: r.value||'', wildcard: r.value==='*' } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 160;
      });

      (rule.conditions || []).forEach(c => {
        const nId = _uid();
        nodes.push({ id: nId, type: 'condition', x: 660, y: childY,
          data: { attribute: c.arg1AttrId||'', operator: 'eq', value: c.arg2Value||'', logic: rule.conditionOp||'AND' } });
        edges.push({ id: _uid(), fromId: rId, toId: nId });
        childY += 180;
      });

      ruleY = Math.max(ruleY + 220, childY + 20);
    });

    _nodes   = nodes;
    _edges   = edges;
    _history = [];
    _histIdx = -1;
    _pushHistory();

    if (_canvas) _rerenderAll();
  }

  // ── Public: refresh labels (on i18n change) ────────────────────────────

  function refresh() {
    if (!_canvas) return;
    // Re-render all node elements in place (preserve positions from _nodes)
    _rerenderAll();
    const valText = _wrap?.querySelector('.ne-validation-text');
    if (valText) _updateValidation();
  }

  // ── Public: destroy ────────────────────────────────────────────────────

  function destroy() {
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup',   _onMouseUp);
    document.removeEventListener('keydown',   _onKeyDown);
    _canvas      = null;
    _viewport    = null;
    _svgEl       = null;
    _edgesGroup  = null;
    _tempEdgePath= null;
    _wrap        = null;
  }

  return { init, setPolicy, refresh, destroy };
})();

export { NodeEditor };
