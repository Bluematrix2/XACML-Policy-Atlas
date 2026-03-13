'use strict';

// ================================================================
//  POLICY CREATOR — Phase 2 (Alpha)
//  Standard-Wizard: Typ → Basis-Info → Regeln → Review & Export
// ================================================================

import { esc } from './parser.js';
import { I18n } from './i18n.js';

const COMBINING_ALGS = [
  { labelKey: 'creator.alg.deny',   value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides' },
  { labelKey: 'creator.alg.permit', value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides' },
  { labelKey: 'creator.alg.first',  value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:first-applicable' },
  { labelKey: 'creator.alg.only',   value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:only-one-applicable' },
];

const XACML_NS = {
  '2.0': 'urn:oasis:names:tc:xacml:2.0:policy:schema:os',
  '3.0': 'urn:oasis:names:tc:xacml:3.0:core:schema:wd-17',
};

const MATCH_ID_STR_EQ  = 'urn:oasis:names:tc:xacml:1.0:function:string-equal';
const DATA_TYPE_STRING  = 'http://www.w3.org/2001/XMLSchema#string';
const DEFAULT_ATTR_IDS = {
  subject:  'urn:oasis:names:tc:xacml:1.0:subject:subject-id',
  resource: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',
  action:   'urn:oasis:names:tc:xacml:1.0:action:action-id',
};

const SESSION_KEY = 'xacml-creator-state';

const PolicyCreator = (() => {
  let _initialized = false;
  let _previewTimer = null;

  // ── Attribute ID options per target category (Standard mode) ──────────
  const ATTR_ID_OPTIONS = {
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
  };

  // ── State ──────────────────────────────────────────────────────────────

  function _defaultTarget() {
    return {
      subject:  { value: '', attributeId: ATTR_ID_OPTIONS.subject[0].value },
      resource: { value: '', attributeId: ATTR_ID_OPTIONS.resource[0].value },
      action:   { value: '', attributeId: ATTR_ID_OPTIONS.action[0].value },
    };
  }

  let _state = _loadState();

  function _defaultState() {
    return {
      step: 1,
      policy: {
        id: '',
        version: '3.0',
        description: '',
        combiningAlg: COMBINING_ALGS[0].value,
        rules: []
      }
    };
  }

  function _loadState() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        // Phase 2 migration: ensure all rules have a target object
        if (s.policy && Array.isArray(s.policy.rules)) {
          s.policy.rules.forEach(r => {
            if (!r.target) {
              r.target = _defaultTarget();
            } else {
              for (const cat of ['subject', 'resource', 'action']) {
                if (!r.target[cat].attributeId) {
                  r.target[cat].attributeId = ATTR_ID_OPTIONS[cat][0].value;
                }
              }
            }
          });
        }
        return s;
      }
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
    const ver = p.version === '2.0' ? '2.0' : '3.0';
    const ns  = XACML_NS[ver];
    const alg = _escXml(p.combiningAlg || COMBINING_ALGS[0].value);

    let xml = `<Policy xmlns="${ns}"\n`;
    xml += `        PolicyId="${pid}"\n`;
    xml += `        RuleCombiningAlgId="${alg}"\n`;
    xml += `        Version="1.0">\n`;

    if (p.description.trim()) {
      xml += `\n  <Description>${_escXml(p.description)}</Description>\n`;
    }

    if (p.rules.length === 0) {
      xml += `\n  <!-- ${I18n.t('creator.rules.empty').replace(/[<>]/g, '')} -->\n`;
    } else {
      for (const r of p.rules) {
        xml += `\n  <Rule Effect="${r.effect}" RuleId="${_escXml(r.id)}">\n`;
        if (r.description.trim()) {
          xml += `    <Description>${_escXml(r.description)}</Description>\n`;
        }
        const targetXml = ver === '2.0' ? _ruleTargetXml20(r.target) : _ruleTargetXml30(r.target);
        if (targetXml) xml += targetXml + '\n';
        xml += `  </Rule>\n`;
      }
    }

    xml += `\n</Policy>`;
    return xml;
  }

  function _ruleTargetXml20(target) {
    if (!target) return '';
    const cats = [
      { key: 'subject',  wrap: 'Subjects',  inner: 'Subject',  match: 'SubjectMatch',  des: 'SubjectAttributeDesignator' },
      { key: 'resource', wrap: 'Resources', inner: 'Resource', match: 'ResourceMatch', des: 'ResourceAttributeDesignator' },
      { key: 'action',   wrap: 'Actions',   inner: 'Action',   match: 'ActionMatch',   des: 'ActionAttributeDesignator' },
    ];
    const parts = [];
    for (const c of cats) {
      const t = target[c.key];
      if (!t || !t.value.trim()) continue;
      const aid = _escXml(t.attributeId.trim() || DEFAULT_ATTR_IDS[c.key]);
      parts.push(
        `    <${c.wrap}>\n` +
        `      <${c.inner}>\n` +
        `        <${c.match} MatchId="${MATCH_ID_STR_EQ}">\n` +
        `          <AttributeValue DataType="${DATA_TYPE_STRING}">${_escXml(t.value.trim())}</AttributeValue>\n` +
        `          <${c.des} AttributeId="${aid}" DataType="${DATA_TYPE_STRING}"/>\n` +
        `        </${c.match}>\n` +
        `      </${c.inner}>\n` +
        `    </${c.wrap}>`
      );
    }
    if (parts.length === 0) return '';
    return `    <Target>\n${parts.join('\n')}\n    </Target>`;
  }

  function _ruleTargetXml30(target) {
    if (!target) return '';
    const cats = [
      { key: 'subject',  cat: 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject' },
      { key: 'resource', cat: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource' },
      { key: 'action',   cat: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action' },
    ];
    const matches = [];
    for (const c of cats) {
      const t = target[c.key];
      if (!t || !t.value.trim()) continue;
      const aid = _escXml(t.attributeId.trim() || DEFAULT_ATTR_IDS[c.key]);
      matches.push(
        `          <Match MatchId="${MATCH_ID_STR_EQ}">\n` +
        `            <AttributeValue DataType="${DATA_TYPE_STRING}">${_escXml(t.value.trim())}</AttributeValue>\n` +
        `            <AttributeDesignator Category="${c.cat}" AttributeId="${aid}" DataType="${DATA_TYPE_STRING}" MustBePresent="false"/>\n` +
        `          </Match>`
      );
    }
    if (matches.length === 0) return '';
    return (
      `    <Target>\n` +
      `      <AnyOf>\n` +
      `        <AllOf>\n` +
      matches.join('\n') + '\n' +
      `        </AllOf>\n` +
      `      </AnyOf>\n` +
      `    </Target>`
    );
  }

  // ── Step validation ────────────────────────────────────────────────────

  function _canProceed() {
    const p = _state.policy;
    if (_state.step === 1) return true;
    if (_state.step === 2) return p.id.trim() !== '';
    if (_state.step === 3) return p.rules.length > 0 && p.rules.every(r => r.id.trim() !== '');
    return true;
  }

  // ── UUID helper ────────────────────────────────────────────────────────

  function _makeUuid() {
    return (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
  }

  // ── Init & Render ──────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;
    _render();
    document.addEventListener('i18n:change', _refresh);
  }

  function _render() {
    const container = document.getElementById('layout-creator');
    if (!container) return;

    container.innerHTML = `
      <div class="creator-wrap">
        <div class="creator-header">
          <h2 class="creator-title">&#x1F6E0;&#xFE0F; Policy Creator <span class="alpha-badge">ALPHA</span></h2>
          <p class="creator-subtitle">${esc(I18n.t('creator.subtitle'))}</p>
        </div>
        <div class="creator-main">
          <div class="creator-left">
            <div class="creator-steps" id="creator-steps"></div>
            <div class="creator-form-area" id="creator-form-area"></div>
            <div class="creator-nav" id="creator-nav"></div>
          </div>
          <div class="creator-right">
            <div class="creator-preview" id="creator-preview">
              <div class="creator-preview-header">
                <span class="creator-preview-title">${esc(I18n.t('creator.preview.title'))}</span>
                <button class="creator-copy-btn" id="creator-copy-btn"
                        title="${esc(I18n.t('creator.copy.title'))}">&#x1F4CB;</button>
              </div>
              <pre class="creator-xml-pre" id="creator-xml-pre"></pre>
            </div>
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
    const el = document.getElementById('creator-steps');
    if (!el) return;

    const steps = [1, 2, 3, 4].map(step => {
      const isDone   = step < _state.step;
      const isActive = step === _state.step;
      const cls      = isDone ? 'creator-step done' : isActive ? 'creator-step active' : 'creator-step future';
      const num      = isDone ? '&#x2713;' : step;
      const sep      = step < 4 ? '<div class="creator-step-sep">&#x203A;</div>' : '';
      const label    = I18n.t(`creator.step.${step}`);
      return `<div class="${cls}" data-step="${step}"${isDone ? '' : ' aria-disabled="true"'}>
        <span class="step-num">${num}</span>
        <span class="step-label">${esc(label)}</span>
      </div>${sep}`;
    }).join('');

    el.innerHTML = steps + `
      <div class="creator-stepbar-right">
        <button class="creator-reset-btn" id="creator-reset-btn"
                title="${esc(I18n.t('creator.reset.title'))}"
                aria-label="${esc(I18n.t('creator.reset.aria'))}">
          ${esc(I18n.t('creator.reset.btn'))}
        </button>
        <div class="creator-reset-confirm" id="creator-reset-confirm" style="display:none">
          <span class="creator-reset-confirm-text">${esc(I18n.t('creator.reset.confirm'))}</span>
          <button class="creator-confirm-yes" id="creator-reset-yes">${esc(I18n.t('creator.reset.yes'))}</button>
          <button class="creator-confirm-no"  id="creator-reset-no">${esc(I18n.t('creator.reset.no'))}</button>
        </div>
      </div>`;
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
          <button class="creator-nav-btn" id="creator-back"${canBack ? '' : ' disabled'}>
            ${esc(I18n.t('creator.nav.back'))}
          </button>
          <div class="creator-final-actions">
            <button class="creator-action-btn creator-action-validate" id="creator-validate">
              ${esc(I18n.t('creator.action.validate'))}
            </button>
            <button class="creator-action-btn creator-action-viz" id="creator-viz">
              ${esc(I18n.t('creator.action.viz'))}
            </button>
            <button class="creator-action-btn creator-action-editor" id="creator-editor">
              ${esc(I18n.t('creator.action.editor'))}
            </button>
            <button class="creator-action-btn creator-action-dl" id="creator-dl">
              ${esc(I18n.t('creator.action.dl'))}
            </button>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="creator-nav-row">
          <button class="creator-nav-btn" id="creator-back"${canBack ? '' : ' disabled'}>
            ${esc(I18n.t('creator.nav.back'))}
          </button>
          <button class="creator-nav-btn creator-nav-primary" id="creator-next"${canNext ? '' : ' disabled'}>
            ${esc(I18n.t('creator.nav.next'))}
          </button>
        </div>`;
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
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s1.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <p class="creator-step-desc">${esc(I18n.t('creator.s1.desc'))}</p>
          <div class="creator-type-cards">
            <label class="creator-type-card selected">
              <input type="radio" name="root-type" value="Policy" checked style="display:none">
              <div class="type-card-icon">&#x1F4C4;</div>
              <div class="type-card-label">${esc(I18n.t('creator.type.policy.label'))}</div>
              <div class="type-card-desc">${esc(I18n.t('creator.type.policy.desc'))}</div>
            </label>
            <label class="creator-type-card disabled" title="${esc(I18n.t('creator.type.policyset.title'))}">
              <input type="radio" name="root-type" value="PolicySet" disabled style="display:none">
              <div class="type-card-icon">&#x1F4C1;</div>
              <div class="type-card-label">${esc(I18n.t('creator.type.policyset.label'))} <span class="phase-badge">Phase 3</span></div>
              <div class="type-card-desc">${esc(I18n.t('creator.type.policyset.desc'))}</div>
            </label>
          </div>
        </div>
      </div>`;
  }

  // ── Step 2: Basis-Info ─────────────────────────────────────────────────

  function _step2Html() {
    const p = _state.policy;
    const algOptions = COMBINING_ALGS.map(a =>
      `<option value="${esc(a.value)}"${p.combiningAlg === a.value ? ' selected' : ''}>${esc(I18n.t(a.labelKey))}</option>`
    ).join('');

    return `
      <div class="creator-step-content">
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s2.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <div class="creator-field">
            <label class="creator-label" for="f-policy-id">
              ${esc(I18n.t('creator.field.id.label'))} <span class="field-required">*</span>
            </label>
            <div class="creator-input-row">
              <input class="creator-input" id="f-policy-id" type="text"
                     data-field="id" placeholder="${esc(I18n.t('creator.field.id.ph'))}"
                     value="${esc(p.id)}" autocomplete="off" spellcheck="false">
              <button class="creator-uuid-btn" data-action="gen-uuid"
                      title="${esc(I18n.t('creator.uuid.title'))}"
                      aria-label="${esc(I18n.t('creator.uuid.aria'))}">
                &#x1F3B2; UUID
              </button>
            </div>
            <span class="creator-hint">${esc(I18n.t('creator.field.id.hint'))}</span>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-policy-version">
              ${esc(I18n.t('creator.field.ver.label'))}
            </label>
            <select class="creator-select creator-select-sm" id="f-policy-version" data-field="version">
              <option value="2.0"${p.version === '2.0' ? ' selected' : ''}>XACML 2.0</option>
              <option value="3.0"${p.version === '3.0' ? ' selected' : ''}>XACML 3.0</option>
            </select>
            <span class="creator-hint">${esc(I18n.t('creator.field.ver.hint'))}</span>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-policy-desc">
              ${esc(I18n.t('creator.field.desc.label'))}
            </label>
            <textarea class="creator-textarea" id="f-policy-desc" rows="3"
                      data-field="description"
                      placeholder="${esc(I18n.t('creator.field.desc.ph'))}">${esc(p.description)}</textarea>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-policy-alg">
              ${esc(I18n.t('creator.field.alg.label'))}
            </label>
            <select class="creator-select" id="f-policy-alg" data-field="combiningAlg">
              ${algOptions}
            </select>
            <span class="creator-hint">${esc(I18n.t('creator.field.alg.hint'))}</span>
          </div>
        </div>
      </div>`;
  }

  // ── Step 3: Regeln ─────────────────────────────────────────────────────

  function _step3Html() {
    const rules = _state.policy.rules;
    const rulesHtml = rules.length === 0
      ? `<div class="creator-empty-rules">${esc(I18n.t('creator.rules.empty'))}</div>`
      : rules.map((r, i) => _ruleCardHtml(r, i)).join('');

    return `
      <div class="creator-step-content">
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s3.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <p class="creator-step-desc">${esc(I18n.t('creator.s3.desc'))}</p>
          <div class="creator-rules-list" id="creator-rules-list">
            ${rulesHtml}
          </div>
          <button class="creator-add-rule-btn" id="creator-add-rule">
            ${esc(I18n.t('creator.rule.add'))}
          </button>
        </div>
      </div>`;
  }

  function _attrIdSelectHtml(cat, ruleIdx, currentVal) {
    const opts = ATTR_ID_OPTIONS[cat];
    const sel  = currentVal || opts[0].value;
    const options = opts.map(o =>
      `<option value="${esc(o.value)}"${sel === o.value ? ' selected' : ''}>${esc(I18n.t(o.labelKey))}</option>`
    ).join('');
    return `<select class="creator-select creator-attrId-select"
                    data-rule-idx="${ruleIdx}" data-target-cat="${cat}" data-target-prop="attributeId">
              ${options}
            </select>`;
  }

  function _ruleCardHtml(r, i) {
    const n = i + 1;
    return `
      <div class="creator-rule-card" data-rule-idx="${i}">
        <div class="rule-card-hdr">
          <span class="rule-card-num">${esc(I18n.t('creator.rule.num', { n }))}</span>
          <button class="rule-delete-btn" data-action="delete-rule" data-idx="${i}"
                  title="${esc(I18n.t('creator.rule.delete.title'))}"
                  aria-label="${esc(I18n.t('creator.rule.delete.aria', { n }))}">&#x2715;</button>
        </div>
        <div class="creator-rule-fields">
          <div class="creator-field-row">
            <div class="creator-field creator-field-grow">
              <label class="creator-label" for="f-rule-id-${i}">
                ${esc(I18n.t('creator.rule.id.label'))} <span class="field-required">*</span>
              </label>
              <div class="creator-input-row">
                <input class="creator-input" id="f-rule-id-${i}" type="text"
                       data-rule-idx="${i}" data-rule-field="id"
                       placeholder="${esc(I18n.t('creator.rule.id.ph'))}"
                       value="${esc(r.id)}" autocomplete="off" spellcheck="false">
                <button class="creator-uuid-btn" data-action="gen-rule-uuid" data-idx="${i}"
                        title="${esc(I18n.t('creator.rule.id.uuid.title'))}"
                        aria-label="${esc(I18n.t('creator.rule.id.uuid.aria'))}">
                  &#x1F3B2; UUID
                </button>
              </div>
            </div>
            <div class="creator-field creator-field-sm">
              <label class="creator-label" for="f-rule-effect-${i}">
                ${esc(I18n.t('creator.rule.effect.label'))}
              </label>
              <select class="creator-select" id="f-rule-effect-${i}"
                      data-rule-idx="${i}" data-rule-field="effect">
                <option value="Permit"${r.effect === 'Permit' ? ' selected' : ''}>&#x2705; Permit</option>
                <option value="Deny"${r.effect   === 'Deny'   ? ' selected' : ''}>&#x274C; Deny</option>
              </select>
            </div>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-rule-desc-${i}">
              ${esc(I18n.t('creator.rule.desc.label'))}
            </label>
            <input class="creator-input" id="f-rule-desc-${i}" type="text"
                   data-rule-idx="${i}" data-rule-field="description"
                   placeholder="${esc(I18n.t('creator.rule.desc.ph'))}"
                   value="${esc(r.description)}" autocomplete="off">
          </div>
          <div class="creator-target-section">
            <div class="creator-target-hdr">
              <span class="creator-target-hdr-label">&#x1F3AF; ${esc(I18n.t('creator.target.section'))}</span>
              <span class="creator-hint">${esc(I18n.t('creator.target.hint'))}</span>
            </div>
            <div class="creator-target-grid">
              <span class="creator-target-cat">${esc(I18n.t('creator.target.subject'))}</span>
              ${_attrIdSelectHtml('subject', i, r.target ? r.target.subject.attributeId : '')}
              <input class="creator-input" type="text"
                     data-rule-idx="${i}" data-target-cat="subject" data-target-prop="value"
                     placeholder="${esc(I18n.t('creator.target.value.ph.subject'))}"
                     value="${esc(r.target ? r.target.subject.value : '')}" autocomplete="off">

              <span class="creator-target-cat">${esc(I18n.t('creator.target.resource'))}</span>
              ${_attrIdSelectHtml('resource', i, r.target ? r.target.resource.attributeId : '')}
              <input class="creator-input" type="text"
                     data-rule-idx="${i}" data-target-cat="resource" data-target-prop="value"
                     placeholder="${esc(I18n.t('creator.target.value.ph.resource'))}"
                     value="${esc(r.target ? r.target.resource.value : '')}" autocomplete="off">

              <span class="creator-target-cat">${esc(I18n.t('creator.target.action'))}</span>
              ${_attrIdSelectHtml('action', i, r.target ? r.target.action.attributeId : '')}
              <input class="creator-input" type="text"
                     data-rule-idx="${i}" data-target-cat="action" data-target-prop="value"
                     placeholder="${esc(I18n.t('creator.target.value.ph.action'))}"
                     value="${esc(r.target ? r.target.action.value : '')}" autocomplete="off">
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Step 4: Review ─────────────────────────────────────────────────────

  function _step4Html() {
    const p   = _state.policy;
    const alg = COMBINING_ALGS.find(a => a.value === p.combiningAlg);
    const algLabel = alg ? I18n.t(alg.labelKey) : p.combiningAlg;

    const ruleRows = p.rules.map(r => {
      const targetParts = [];
      if (r.target) {
        if (r.target.subject.value.trim())  targetParts.push(`${I18n.t('creator.target.subject')}: ${r.target.subject.value.trim()}`);
        if (r.target.resource.value.trim()) targetParts.push(`${I18n.t('creator.target.resource')}: ${r.target.resource.value.trim()}`);
        if (r.target.action.value.trim())   targetParts.push(`${I18n.t('creator.target.action')}: ${r.target.action.value.trim()}`);
      }
      return `<tr>
        <td>${esc(r.id)}</td>
        <td><span class="rule-effect-badge ${r.effect === 'Permit' ? 'permit' : 'deny'}">${r.effect}</span></td>
        <td>${esc(r.description || '\u2014')}</td>
        <td>${esc(targetParts.length ? targetParts.join(', ') : '\u2014')}</td>
      </tr>`;
    }).join('');

    return `
      <div class="creator-step-content">
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s4.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <p class="creator-step-desc">${esc(I18n.t('creator.s4.desc'))}</p>
          <div class="creator-summary">
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.id'))}</span>
              <span class="creator-summary-val">${esc(p.id || '\u2014')}</span>
            </div>
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.version'))}</span>
              <span class="creator-summary-val">XACML ${esc(p.version || '3.0')}</span>
            </div>
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.alg'))}</span>
              <span class="creator-summary-val">${esc(algLabel)}</span>
            </div>
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.rules'))}</span>
              <span class="creator-summary-val">${p.rules.length}</span>
            </div>
          </div>
          ${p.rules.length > 0 ? `
          <table class="creator-rules-table">
            <thead>
              <tr>
                <th>${esc(I18n.t('creator.table.ruleId'))}</th>
                <th>${esc(I18n.t('creator.table.effect'))}</th>
                <th>${esc(I18n.t('creator.table.desc'))}</th>
                <th>${esc(I18n.t('creator.table.target'))}</th>
              </tr>
            </thead>
            <tbody>${ruleRows}</tbody>
          </table>` : ''}
          <div class="creator-val-result" id="creator-val-result" style="display:none"></div>
        </div>
      </div>`;
  }

  // ── Event Handling ─────────────────────────────────────────────────────

  function _handleClick(e) {
    const t = e.target;

    const stepEl = t.closest('.creator-step.done');
    if (stepEl) {
      const step = parseInt(stepEl.dataset.step, 10);
      if (step < _state.step) { _state.step = step; _saveState(); _refresh(); }
      return;
    }

    if (t.id === 'creator-copy-btn' || t.closest('#creator-copy-btn')) {
      e.stopPropagation();
      _copyXml();
      return;
    }

    if (t.id === 'creator-next'      || t.closest('#creator-next'))      { if (_canProceed() && _state.step < 4) { _state.step++; _saveState(); _refresh(); } return; }
    if (t.id === 'creator-back'      || t.closest('#creator-back'))      { if (_state.step > 1) { _state.step--; _saveState(); _refresh(); } return; }
    if (t.id === 'creator-add-rule'  || t.closest('#creator-add-rule'))  { _addRule(); return; }
    if (t.id === 'creator-reset-btn' || t.closest('#creator-reset-btn')) { _showResetConfirm(); return; }
    if (t.id === 'creator-reset-yes' || t.closest('#creator-reset-yes')) { _doReset(); return; }
    if (t.id === 'creator-reset-no'  || t.closest('#creator-reset-no'))  { _hideResetConfirm(); return; }
    if (t.id === 'creator-validate'  || t.closest('#creator-validate'))  { _doValidate(); return; }
    if (t.id === 'creator-viz'       || t.closest('#creator-viz'))       { _loadIntoVisualizer(); return; }
    if (t.id === 'creator-editor'    || t.closest('#creator-editor'))    { _openInEditor(); return; }
    if (t.id === 'creator-dl'        || t.closest('#creator-dl'))        { _download(); return; }

    const deleteBtn   = t.closest('[data-action="delete-rule"]');
    if (deleteBtn) { _deleteRule(parseInt(deleteBtn.dataset.idx, 10)); return; }

    if (t.closest('[data-action="gen-uuid"]'))       { _generateUuid(); return; }
    const ruleUuidBtn = t.closest('[data-action="gen-rule-uuid"]');
    if (ruleUuidBtn) { _generateRuleUuid(parseInt(ruleUuidBtn.dataset.idx, 10)); return; }
  }

  function _handleInput(e) {
    const t = e.target;
    if (t.dataset.field !== undefined) {
      _state.policy[t.dataset.field] = t.value;
      _saveState(); _schedulePreview(); _updateNextBtn();
      return;
    }
    if (t.dataset.ruleField !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      if (_state.policy.rules[idx]) {
        _state.policy.rules[idx][t.dataset.ruleField] = t.value;
        _saveState(); _schedulePreview(); _updateNextBtn();
      }
    }
    const cat = t.dataset.targetCat;
    const prop = t.dataset.targetProp;
    if (cat !== undefined && prop !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      const r = _state.policy.rules[idx];
      if (r) {
        if (!r.target) r.target = _defaultTarget();
        if (r.target[cat]) r.target[cat][prop] = t.value;
        _saveState(); _schedulePreview();
      }
    }
  }

  function _handleChange(e) {
    const t = e.target;
    if (t.dataset.field !== undefined) {
      _state.policy[t.dataset.field] = t.value;
      _saveState(); _schedulePreview();
      return;
    }
    if (t.dataset.ruleField !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      if (_state.policy.rules[idx]) {
        _state.policy.rules[idx][t.dataset.ruleField] = t.value;
        _saveState(); _schedulePreview();
      }
      return;
    }
    const cat  = t.dataset.targetCat;
    const prop = t.dataset.targetProp;
    if (cat !== undefined && prop !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      const r   = _state.policy.rules[idx];
      if (r) {
        if (!r.target) r.target = _defaultTarget();
        if (r.target[cat]) r.target[cat][prop] = t.value;
        _saveState(); _schedulePreview();
      }
    }
  }

  // ── Rule Management ────────────────────────────────────────────────────

  function _addRule() {
    const n = _state.policy.rules.length + 1;
    _state.policy.rules.push({ id: `rule-${n}`, effect: 'Permit', description: '', target: _defaultTarget() });
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
      ? `<div class="creator-empty-rules">${esc(I18n.t('creator.rules.empty'))}</div>`
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
    // Re-sync static labels not covered by _renderStepBar / _renderFormStep / _renderNav
    const subtitleEl = document.querySelector('.creator-subtitle');
    if (subtitleEl) subtitleEl.textContent = I18n.t('creator.subtitle');
    const titleEl = document.querySelector('.creator-preview-title');
    if (titleEl) titleEl.textContent = I18n.t('creator.preview.title');
    const copyBtn = document.getElementById('creator-copy-btn');
    if (copyBtn) copyBtn.title = I18n.t('creator.copy.title');
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
      resultEl.innerHTML = `<div class="creator-val-row err">${esc(I18n.t('creator.val.xml.err', { msg }))}</div>`;
      resultEl.style.display = '';
      return;
    }

    if (window.App && window.App.validateXmlForCreator) {
      const result = window.App.validateXmlForCreator(xml);
      const rows = (result.checks || []).map(c =>
        `<div class="creator-val-row ${c.ok ? 'ok' : 'err'}">${c.ok ? '&#x2705;' : '&#x274C;'} ${esc(c.label)}${c.detail ? ` \u2014 <em>${esc(c.detail)}</em>` : ''}</div>`
      ).join('');
      const warns = (result.warnings || []).map(w =>
        `<div class="creator-val-row warn">&#x26A0;&#xFE0F; ${esc(w)}</div>`
      ).join('');
      const titleStr = result.valid ? I18n.t('creator.val.ok') : I18n.t('creator.val.err');
      resultEl.innerHTML = `<div class="creator-val-title ${result.valid ? 'ok' : 'err'}">${esc(titleStr)}</div>${rows}${warns}`;
    } else {
      resultEl.innerHTML = `<div class="creator-val-row ok">${esc(I18n.t('creator.val.xml.ok'))}</div>`;
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

  function _showResetConfirm() {
    const confirmEl = document.getElementById('creator-reset-confirm');
    const resetBtn  = document.getElementById('creator-reset-btn');
    if (confirmEl) confirmEl.style.display = '';
    if (resetBtn)  resetBtn.style.display  = 'none';
  }

  function _hideResetConfirm() {
    const confirmEl = document.getElementById('creator-reset-confirm');
    const resetBtn  = document.getElementById('creator-reset-btn');
    if (confirmEl) confirmEl.style.display = 'none';
    if (resetBtn)  resetBtn.style.display  = '';
  }

  function _doReset() {
    _state = _defaultState();
    _saveState();
    _hideResetConfirm();
    _refresh();
  }

  function _generateUuid() {
    const uuid = _makeUuid();
    _state.policy.id = uuid;
    _saveState();
    const input = document.getElementById('f-policy-id');
    if (input) input.value = uuid;
    _schedulePreview();
    _updateNextBtn();
  }

  function _generateRuleUuid(idx) {
    if (!_state.policy.rules[idx]) return;
    const uuid = _makeUuid();
    _state.policy.rules[idx].id = uuid;
    _saveState();
    const input = document.getElementById(`f-rule-id-${idx}`);
    if (input) input.value = uuid;
    _schedulePreview();
    _updateNextBtn();
  }

  function _copyXml() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(_generateXml()).then(() => {
      const btn = document.getElementById('creator-copy-btn');
      if (btn) {
        btn.textContent = '\u2713';
        setTimeout(() => { btn.innerHTML = '&#x1F4CB;'; }, 1500);
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
