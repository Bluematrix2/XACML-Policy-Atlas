'use strict';

// ================================================================
//  POLICY CREATOR — Phase 3 (Alpha)
//  Standard-Wizard: Typ → Basis-Info → Regeln → Review & Export
//  Phase 3: PolicySet-Support with embedded Policies
// ================================================================

import { esc, XACMLParser } from './parser.js';
import { I18n } from './i18n.js';

const COMBINING_ALGS = [
  { labelKey: 'creator.alg.deny',   value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:deny-overrides' },
  { labelKey: 'creator.alg.permit', value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides' },
  { labelKey: 'creator.alg.first',  value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:first-applicable' },
  { labelKey: 'creator.alg.only',   value: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:only-one-applicable' },
];

const PS_COMBINING_ALGS = [
  { labelKey: 'creator.alg.deny',   value: 'urn:oasis:names:tc:xacml:1.0:policy-combining-algorithm:deny-overrides' },
  { labelKey: 'creator.alg.permit', value: 'urn:oasis:names:tc:xacml:1.0:policy-combining-algorithm:permit-overrides' },
  { labelKey: 'creator.alg.first',  value: 'urn:oasis:names:tc:xacml:1.0:policy-combining-algorithm:first-applicable' },
  { labelKey: 'creator.alg.only',   value: 'urn:oasis:names:tc:xacml:1.0:policy-combining-algorithm:only-one-applicable' },
];

const CONDITION_FUNCTIONS = [
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

const CONDITION_CATEGORIES = [
  { label: 'Subject (Access)', value: 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject' },
  { label: 'Resource',         value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource' },
  { label: 'Action',           value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action' },
  { label: 'Environment',      value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:environment' },
];

const CONDITION_DATA_TYPES = [
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

// Maps dataType → matching "one-and-only" bag function (for Condition Arg1 wrapper Apply)
const ONE_AND_ONLY_FN = {
  'http://www.w3.org/2001/XMLSchema#string':   'urn:oasis:names:tc:xacml:1.0:function:string-one-and-only',
  'http://www.w3.org/2001/XMLSchema#integer':  'urn:oasis:names:tc:xacml:1.0:function:integer-one-and-only',
  'http://www.w3.org/2001/XMLSchema#boolean':  'urn:oasis:names:tc:xacml:1.0:function:boolean-one-and-only',
  'http://www.w3.org/2001/XMLSchema#anyURI':   'urn:oasis:names:tc:xacml:1.0:function:anyURI-one-and-only',
  'http://www.w3.org/2001/XMLSchema#date':     'urn:oasis:names:tc:xacml:1.0:function:date-one-and-only',
  'http://www.w3.org/2001/XMLSchema#dateTime': 'urn:oasis:names:tc:xacml:1.0:function:dateTime-one-and-only',
};

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

const MATCH_ID_OPTIONS = [
  { label: 'string-equal',    value: 'urn:oasis:names:tc:xacml:1.0:function:string-equal' },
  { label: 'anyURI-equal',    value: 'urn:oasis:names:tc:xacml:1.0:function:anyURI-equal' },
  { label: 'integer-equal',   value: 'urn:oasis:names:tc:xacml:1.0:function:integer-equal' },
  { label: 'date-equal',      value: 'urn:oasis:names:tc:xacml:1.0:function:date-equal' },
  { label: 'CV-equal (HL7) – Coded Value',         value: 'urn:hl7-org:v3:function:CV-equal' },
  { label: 'II-equal (HL7) – Instance Identifier', value: 'urn:hl7-org:v3:function:II-equal' },
];

const MATCH_DATATYPE_OPTIONS = [
  { label: 'string',    value: 'http://www.w3.org/2001/XMLSchema#string' },
  { label: 'anyURI',    value: 'http://www.w3.org/2001/XMLSchema#anyURI' },
  { label: 'integer',   value: 'http://www.w3.org/2001/XMLSchema#integer' },
  { label: 'date',      value: 'http://www.w3.org/2001/XMLSchema#date' },
  { label: 'CV (HL7) – Coded Value',               value: 'urn:hl7-org:v3#CV' },
  { label: 'II (HL7) – Instance Identifier',       value: 'urn:hl7-org:v3#II' },
  { label: 'ST (HL7) – Simple Text',               value: 'urn:hl7-org:v3#ST' },
  { label: 'BL (HL7) – Boolean',                   value: 'urn:hl7-org:v3#BL' },
  { label: 'INT (HL7) – Integer',                  value: 'urn:hl7-org:v3#INT' },
  { label: 'TS (HL7) – Timestamp',                 value: 'urn:hl7-org:v3#TS' },
  { label: 'CE (HL7) – Coded with Equivalents',    value: 'urn:hl7-org:v3#CE' },
  { label: 'CS (HL7) – Coded Simple Value',        value: 'urn:hl7-org:v3#CS' },
];

const SESSION_KEY       = 'xacml-creator-state';
const SESSION_MAX_BYTES = 524288; // 512 KB

const PolicyCreator = (() => {
  let _initialized  = false;
  let _previewTimer = null;
  let _previewMode  = 'visual'; // 'visual' | 'xml'
  let _xmlCm        = null;     // CodeMirror read-only instance for XML tab
  // Track accordion open/closed state across re-renders (by index, since IDs are random)
  const _accState = {
    closedPolicies: new Set(), // policy-panel indices that are closed
    openRules:      new Map(), // policyIdx → Set<ruleIdx> of opened rule bodies
  };
  // Track which PS policy cards are collapsed (by index)
  const _psPolicyCollapsed = new Set();

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

  function _defaultMatchRow(cat) {
    return {
      cat:          cat || 'subject',
      attributeId:  ATTR_ID_OPTIONS[cat || 'subject'][0].value,
      matchId:      '',
      dataType:     '',
      valueType:    'simple',
      value:        '',
      cvCode:       '',
      cvCodeSystem: '',
      iiRoot:       '',
    };
  }

  function _defaultTarget() {
    return {
      groups: [{
        matches: [
          _defaultMatchRow('subject'),
          _defaultMatchRow('resource'),
          _defaultMatchRow('action'),
        ],
      }],
    };
  }

  function _defaultCondition() {
    return {
      functionId:   CONDITION_FUNCTIONS[0].value,
      functionCustom: '',
      arg1Cat:      CONDITION_CATEGORIES[0].value,
      arg1AttrId:   'urn:oasis:names:tc:xacml:2.0:subject:role',
      arg1DataType: CONDITION_DATA_TYPES[0].value,
      arg2Value:    '',
      arg2DataType: CONDITION_DATA_TYPES[0].value,
    };
  }

  function _migrateTarget(t) {
    if (!t) return _defaultTarget();
    if (Array.isArray(t.groups)) return t; // already new format
    if (Array.isArray(t.matches)) {
      // Previous format: { combineOp, matches[] }
      if (t.combineOp === 'OR') {
        return { groups: t.matches.map(m => ({ matches: [m] })) };
      }
      return { groups: [{ matches: t.matches }] };
    }
    // Original flat format: { subject: {}, resource: {}, action: {} }
    return {
      groups: [{
        matches: ['subject', 'resource', 'action'].map(cat => ({
          cat,
          attributeId: (t[cat] && t[cat].attributeId) || ATTR_ID_OPTIONS[cat][0].value,
          value:       (t[cat] && t[cat].value)        || '',
        })),
      }],
    };
  }

  function _migrateRuleConditions(r) {
    if (!('conditions' in r)) {
      r.conditions = r.condition != null ? [r.condition] : [];
      delete r.condition;
    }
    if (!('conditionOp' in r)) r.conditionOp = 'AND';
  }

  let _state = _loadState();

  function _defaultPsPolicy() {
    return {
      id: '',
      version: '3.0',
      description: '',
      combiningAlg: COMBINING_ALGS[0].value,
      target: _defaultTarget(),
      rules: [],
    };
  }

  function _defaultState() {
    return {
      step: 1,
      rootType: 'Policy',
      policy: {
        id: '',
        version: '3.0',
        description: '',
        combiningAlg: COMBINING_ALGS[0].value,
        target: _defaultTarget(),
        rules: []
      },
      policySet: {
        id: '',
        version: '3.0',
        description: '',
        combiningAlg: PS_COMBINING_ALGS[0].value,
        target: _defaultTarget(),
        policies: [],
      },
    };
  }

  function _loadState() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        // Migrate policy targets
        if (s.policy) {
          s.policy.target = _migrateTarget(s.policy.target);
          if (Array.isArray(s.policy.rules)) {
            s.policy.rules.forEach(r => { r.target = _migrateTarget(r.target); _migrateRuleConditions(r); });
          }
        }
        // Migrate policySet targets
        if (s.policySet) {
          s.policySet.target = _migrateTarget(s.policySet.target);
          if (Array.isArray(s.policySet.policies)) {
            s.policySet.policies.forEach(p => {
              p.target = _migrateTarget(p.target);
              if (Array.isArray(p.rules)) {
                p.rules.forEach(r => { r.target = _migrateTarget(r.target); _migrateRuleConditions(r); });
              }
            });
          }
        } else {
          s.policySet = _defaultState().policySet;
        }
        if (!s.rootType) s.rootType = 'Policy';
        return s;
      }
    } catch { /* ignore */ }
    return _defaultState();
  }

  function _saveState() {
    try {
      const json = JSON.stringify(_state);
      if (json.length > SESSION_MAX_BYTES) return;
      sessionStorage.setItem(SESSION_KEY, json);
    } catch { /* ignore */ }
  }

  // ── XML Generation ─────────────────────────────────────────────────────

  function _escXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _generatePolicyXml(p, ver, indent, includeNs) {
    const pid  = _escXml(p.id || 'neue-policy');
    const alg  = _escXml(p.combiningAlg || COMBINING_ALGS[0].value);
    const ns   = XACML_NS[ver] || XACML_NS['3.0'];
    const i1   = indent + '  ';   // inside policy
    const i2   = indent + '    '; // inside rule

    const nsAttr = includeNs ? ` xmlns="${ns}"` : '';
    let xml = `${indent}<Policy${nsAttr}\n`;
    xml += `${indent}        PolicyId="${pid}"\n`;
    xml += `${indent}        RuleCombiningAlgId="${alg}"\n`;
    xml += `${indent}        Version="1.0">\n`;

    if (p.description && p.description.trim()) {
      xml += `\n${i1}<Description>${_escXml(p.description)}</Description>\n`;
    }

    const pTargetXml = ver === '2.0' ? _targetXml20(p.target, i1) : _targetXml30(p.target, i1);
    if (pTargetXml) xml += '\n' + pTargetXml + '\n';

    if (!p.rules || p.rules.length === 0) {
      xml += `\n${i1}<!-- ${I18n.t('creator.rules.empty').replace(/[<>]/g, '')} -->\n`;
    } else {
      for (const r of p.rules) {
        xml += `\n${i1}<Rule Effect="${r.effect}" RuleId="${_escXml(r.id)}">\n`;
        if (r.description && r.description.trim()) {
          xml += `${i2}<Description>${_escXml(r.description)}</Description>\n`;
        }
        const targetXml = ver === '2.0' ? _targetXml20(r.target, i2) : _targetXml30(r.target, i2);
        if (targetXml) xml += targetXml + '\n';
        const condXml = _conditionXml(r.conditions, r.conditionOp, ver, i2);
        if (condXml) xml += condXml + '\n';
        xml += `${i1}</Rule>\n`;
      }
    }

    xml += `\n${indent}</Policy>`;
    return xml;
  }

  function _generatePolicySetXml() {
    const ps  = _state.policySet;
    const ver = ps.version === '2.0' ? '2.0' : '3.0';
    const ns  = XACML_NS[ver];
    const pid = _escXml(ps.id || 'neue-policyset');
    const alg = _escXml(ps.combiningAlg || PS_COMBINING_ALGS[0].value);

    let xml = `<PolicySet xmlns="${ns}"\n`;
    xml += `           PolicySetId="${pid}"\n`;
    xml += `           PolicyCombiningAlgId="${alg}"\n`;
    xml += `           Version="1.0">\n`;

    if (ps.description && ps.description.trim()) {
      xml += `\n  <Description>${_escXml(ps.description)}</Description>\n`;
    }

    const psTargetXml = ver === '2.0' ? _targetXml20(ps.target, '  ') : _targetXml30(ps.target, '  ');
    if (psTargetXml) xml += '\n' + psTargetXml + '\n';

    if (!ps.policies || ps.policies.length === 0) {
      xml += `\n  <!-- Keine eingebetteten Policies -->\n`;
    } else {
      for (const p of ps.policies) {
        const pVer = p.version === '2.0' ? '2.0' : '3.0';
        xml += '\n' + _generatePolicyXml(p, pVer, '  ', false) + '\n';
      }
    }

    xml += `\n</PolicySet>`;
    return xml;
  }

  function _generateXml() {
    if (_state.rootType === 'PolicySet') return _generatePolicySetXml();
    const p   = _state.policy;
    const ver = p.version === '2.0' ? '2.0' : '3.0';
    return _generatePolicyXml(p, ver, '', true);
  }

  function _matchHasValue(m) {
    const vt = m.valueType || 'simple';
    if (vt === 'cv') return (m.cvCode || '').trim() !== '' || (m.cvCodeSystem || '').trim() !== '';
    if (vt === 'ii') return (m.iiRoot || '').trim() !== '';
    return (m.value || '').trim() !== '';
  }

  function _matchValueXml(m, ind) {
    const dt = _escXml(m.dataType || DATA_TYPE_STRING);
    const vt = m.valueType || 'simple';
    if (vt === 'cv') {
      return `${ind}<AttributeValue DataType="${dt}"><CodedValue xmlns="urn:hl7-org:v3" code="${_escXml(m.cvCode || '')}" codeSystem="${_escXml(m.cvCodeSystem || '')}" /></AttributeValue>`;
    }
    if (vt === 'ii') {
      return `${ind}<AttributeValue DataType="${dt}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><InstanceIdentifier xmlns="urn:hl7-org:v3" xsi:type="II" root="${_escXml(m.iiRoot || '')}" /></AttributeValue>`;
    }
    return `${ind}<AttributeValue DataType="${dt}">${_escXml((m.value || '').trim())}</AttributeValue>`;
  }

  function _targetXml20(target, ind) {
    if (!target || !Array.isArray(target.groups)) return '';
    const allMatches = target.groups.flatMap(g => g.matches.filter(_matchHasValue));
    if (!allMatches.length) return '';
    const i1 = ind, i2 = ind + '  ', i3 = ind + '    ', i4 = ind + '      ';
    const CAT_META = {
      subject:  { wrap: 'Subjects',  inner: 'Subject',  match: 'SubjectMatch',  des: 'SubjectAttributeDesignator' },
      resource: { wrap: 'Resources', inner: 'Resource', match: 'ResourceMatch', des: 'ResourceAttributeDesignator' },
      action:   { wrap: 'Actions',   inner: 'Action',   match: 'ActionMatch',   des: 'ActionAttributeDesignator' },
    };
    const bycat = { subject: [], resource: [], action: [] };
    for (const m of allMatches) if (bycat[m.cat]) bycat[m.cat].push(m);
    const catParts = [];
    for (const cat of ['subject', 'resource', 'action']) {
      const ms = bycat[cat];
      if (!ms.length) continue;
      const meta = CAT_META[cat];
      const innerHtml = ms.map(m => {
        const aid  = _escXml(m.attributeId || DEFAULT_ATTR_IDS[cat]);
        const mId  = _escXml(m.matchId || MATCH_ID_STR_EQ);
        const mDt  = _escXml(m.dataType || DATA_TYPE_STRING);
        return `${i2}<${meta.inner}>\n` +
               `${i3}<${meta.match} MatchId="${mId}">\n` +
               _matchValueXml(m, i4) + '\n' +
               `${i4}<${meta.des} AttributeId="${aid}" DataType="${mDt}"/>\n` +
               `${i3}</${meta.match}>\n` +
               `${i2}</${meta.inner}>`;
      }).join('\n');
      catParts.push(`${i1}<${meta.wrap}>\n${innerHtml}\n${i1}</${meta.wrap}>`);
    }
    if (!catParts.length) return '';
    return `${ind}<Target>\n${catParts.join('\n')}\n${ind}</Target>`;
  }

  function _targetXml30(target, ind) {
    if (!target || !Array.isArray(target.groups)) return '';
    const activeGroups = target.groups.filter(g => g.matches.some(_matchHasValue));
    if (!activeGroups.length) return '';
    const i1 = ind + '  ', i2 = ind + '    ', i3 = ind + '      ', i4 = ind + '        ';
    const CAT_URI = {
      subject:  'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject',
      resource: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource',
      action:   'urn:oasis:names:tc:xacml:3.0:attribute-category:action',
    };
    const matchXml = m => {
      const aid  = _escXml(m.attributeId || DEFAULT_ATTR_IDS[m.cat]);
      const catU = _escXml(CAT_URI[m.cat] || CAT_URI.subject);
      const mId  = _escXml(m.matchId || MATCH_ID_STR_EQ);
      const mDt  = _escXml(m.dataType || DATA_TYPE_STRING);
      return `${i3}<Match MatchId="${mId}">\n` +
             _matchValueXml(m, i4) + '\n' +
             `${i4}<AttributeDesignator Category="${catU}" AttributeId="${aid}" DataType="${mDt}" MustBePresent="false"/>\n` +
             `${i3}</Match>`;
    };
    const allOfs = activeGroups.map(g => {
      const lines = g.matches.filter(_matchHasValue).map(matchXml).join('\n');
      return `${i2}<AllOf>\n${lines}\n${i2}</AllOf>`;
    }).join('\n');
    return `${ind}<Target>\n${i1}<AnyOf>\n${allOfs}\n${i1}</AnyOf>\n${ind}</Target>`;
  }

  // ── Condition XML & HTML ────────────────────────────────────────────────

  const _COND_DES_TAG = {
    'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject': 'SubjectAttributeDesignator',
    'urn:oasis:names:tc:xacml:3.0:attribute-category:resource':     'ResourceAttributeDesignator',
    'urn:oasis:names:tc:xacml:3.0:attribute-category:action':       'ActionAttributeDesignator',
  };

  function _condFnId(c) {
    return c.functionId === '__custom__' ? (c.functionCustom || '') : c.functionId;
  }

  // Generates the inner <Apply> block for a single condition (without <Condition> wrapper)
  function _condApplyBlock20(c, ind) {
    const fnId = _condFnId(c);
    if (!fnId || !fnId.trim()) return '';
    const i1 = ind + '  ', i2 = ind + '    ';
    const attrId = _escXml(c.arg1AttrId || '');
    const oaoFn  = ONE_AND_ONLY_FN[c.arg1DataType] || ONE_AND_ONLY_FN[CONDITION_DATA_TYPES[0].value];
    const desTag = _COND_DES_TAG[c.arg1Cat] || 'SubjectAttributeDesignator';
    return `${ind}<Apply FunctionId="${_escXml(fnId)}">\n` +
           `${i1}<Apply FunctionId="${_escXml(oaoFn)}">\n` +
           `${i2}<${desTag} AttributeId="${attrId}" DataType="${_escXml(c.arg1DataType)}" MustBePresent="false"/>\n` +
           `${i1}</Apply>\n` +
           `${i1}<AttributeValue DataType="${_escXml(c.arg2DataType)}">${_escXml(c.arg2Value)}</AttributeValue>\n` +
           `${ind}</Apply>`;
  }

  function _condApplyBlock30(c, ind) {
    const fnId = _condFnId(c);
    if (!fnId || !fnId.trim()) return '';
    const i1 = ind + '  ', i2 = ind + '    ';
    const attrId = _escXml(c.arg1AttrId || '');
    const oaoFn  = ONE_AND_ONLY_FN[c.arg1DataType] || ONE_AND_ONLY_FN[CONDITION_DATA_TYPES[0].value];
    return `${ind}<Apply FunctionId="${_escXml(fnId)}">\n` +
           `${i1}<Apply FunctionId="${_escXml(oaoFn)}">\n` +
           `${i2}<AttributeDesignator Category="${_escXml(c.arg1Cat)}" AttributeId="${attrId}" DataType="${_escXml(c.arg1DataType)}" MustBePresent="false"/>\n` +
           `${i1}</Apply>\n` +
           `${i1}<AttributeValue DataType="${_escXml(c.arg2DataType)}">${_escXml(c.arg2Value)}</AttributeValue>\n` +
           `${ind}</Apply>`;
  }

  function _conditionXml(conditions, conditionOp, ver, ind) {
    if (!conditions || conditions.length === 0) return '';
    const active = conditions.filter(c => (_condFnId(c) || '').trim());
    if (!active.length) return '';
    const i1 = ind + '  ', i2 = ind + '    ';

    if (active.length === 1) {
      const c    = active[0];
      const fnId = _escXml(_condFnId(c));
      const attrId = _escXml(c.arg1AttrId || '');
      const oaoFn  = ONE_AND_ONLY_FN[c.arg1DataType] || ONE_AND_ONLY_FN[CONDITION_DATA_TYPES[0].value];
      if (ver === '2.0') {
        const desTag = _COND_DES_TAG[c.arg1Cat] || 'SubjectAttributeDesignator';
        return `${ind}<Condition FunctionId="${fnId}">\n` +
               `${i1}<Apply FunctionId="${_escXml(oaoFn)}">\n` +
               `${i2}<${desTag} AttributeId="${attrId}" DataType="${_escXml(c.arg1DataType)}" MustBePresent="false"/>\n` +
               `${i1}</Apply>\n` +
               `${i1}<AttributeValue DataType="${_escXml(c.arg2DataType)}">${_escXml(c.arg2Value)}</AttributeValue>\n` +
               `${ind}</Condition>`;
      } else {
        return `${ind}<Condition>\n` +
               `${i1}<Apply FunctionId="${fnId}">\n` +
               `${i2}<Apply FunctionId="${_escXml(oaoFn)}">\n` +
               `${i2}  <AttributeDesignator Category="${_escXml(c.arg1Cat)}" AttributeId="${attrId}" DataType="${_escXml(c.arg1DataType)}" MustBePresent="false"/>\n` +
               `${i2}</Apply>\n` +
               `${i2}<AttributeValue DataType="${_escXml(c.arg2DataType)}">${_escXml(c.arg2Value)}</AttributeValue>\n` +
               `${i1}</Apply>\n` +
               `${ind}</Condition>`;
      }
    }

    // Multiple conditions: wrap in AND / OR Apply
    const combineFn = conditionOp === 'OR'
      ? 'urn:oasis:names:tc:xacml:1.0:function:or'
      : 'urn:oasis:names:tc:xacml:1.0:function:and';

    if (ver === '2.0') {
      const blocks = active.map(c => _condApplyBlock20(c, i2)).filter(Boolean).join('\n');
      if (!blocks) return '';
      return `${ind}<Condition FunctionId="${_escXml(combineFn)}">\n${blocks}\n${ind}</Condition>`;
    } else {
      const blocks = active.map(c => _condApplyBlock30(c, i2)).filter(Boolean).join('\n');
      if (!blocks) return '';
      return `${ind}<Condition>\n${i1}<Apply FunctionId="${_escXml(combineFn)}">\n${blocks}\n${i1}</Apply>\n${ind}</Condition>`;
    }
  }

  function _condIdxFrom(el, key) {
    return el.dataset[key] !== undefined ? parseInt(el.dataset[key], 10) : undefined;
  }

  function _getRule(scope, ruleIdx, psPolicyIdx) {
    if (scope === 'rule')    return _state.policy.rules[ruleIdx] ?? null;
    if (scope === 'ps-rule') return _state.policySet.policies[psPolicyIdx]?.rules[ruleIdx] ?? null;
    return null;
  }

  function _addCondition(scope, ruleIdx, psPolicyIdx) {
    const rule = _getRule(scope, ruleIdx, psPolicyIdx);
    if (!rule) return;
    if (!rule.conditions) rule.conditions = [];
    if (!rule.conditionOp) rule.conditionOp = 'AND';
    rule.conditions.push(_defaultCondition());
    _saveState(); _schedulePreview();
    _reRenderConditionSection(scope, ruleIdx, psPolicyIdx);
  }

  function _removeConditionItem(scope, ruleIdx, conditionIdx, psPolicyIdx) {
    const rule = _getRule(scope, ruleIdx, psPolicyIdx);
    if (!rule || !rule.conditions) return;
    rule.conditions.splice(conditionIdx, 1);
    _saveState(); _schedulePreview();
    _reRenderConditionSection(scope, ruleIdx, psPolicyIdx);
  }

  function _setConditionOp(scope, ruleIdx, op, psPolicyIdx) {
    const rule = _getRule(scope, ruleIdx, psPolicyIdx);
    if (!rule) return;
    rule.conditionOp = op;
    _saveState(); _schedulePreview();
    _reRenderConditionSection(scope, ruleIdx, psPolicyIdx);
  }

  function _reRenderConditionSection(scope, ruleIdx, psPolicyIdx) {
    let section;
    if (scope === 'rule') {
      const card = document.querySelector(`.creator-rule-card[data-rule-idx="${ruleIdx}"]`);
      if (card) section = card.querySelector('.creator-condition-section');
    } else if (scope === 'ps-rule') {
      const psCard = document.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${psPolicyIdx}"]`);
      if (psCard) {
        const rCard = psCard.querySelector(`.creator-rule-card[data-rule-idx="${ruleIdx}"]`);
        if (rCard) section = rCard.querySelector('.creator-condition-section');
      }
    }
    if (!section) return;
    const rule = _getRule(scope, ruleIdx, psPolicyIdx);
    if (!rule) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _conditionSectionHtml(rule, scope, ruleIdx, psPolicyIdx);
    section.replaceWith(tmp.firstElementChild);
  }

  function _conditionItemHtml(c, ci, conditionOp, totalCount, sa) {
    const isCustomFn = c.functionId === '__custom__';
    const fnOpts = CONDITION_FUNCTIONS.map(f =>
      `<option value="${esc(f.value)}"${!isCustomFn && c.functionId === f.value ? ' selected' : ''}>${esc(f.label)}</option>`
    ).join('') + `<option value="__custom__"${isCustomFn ? ' selected' : ''}>${esc(I18n.t('creator.condition.fn.custom'))}</option>`;

    const catOpts = CONDITION_CATEGORIES.map(cat =>
      `<option value="${esc(cat.value)}"${c.arg1Cat === cat.value ? ' selected' : ''}>${esc(cat.label)}</option>`
    ).join('');
    const dt1Opts = CONDITION_DATA_TYPES.map(d =>
      `<option value="${esc(d.value)}"${c.arg1DataType === d.value ? ' selected' : ''}>${esc(d.label)}</option>`
    ).join('');
    const dt2Opts = CONDITION_DATA_TYPES.map(d =>
      `<option value="${esc(d.value)}"${c.arg2DataType === d.value ? ' selected' : ''}>${esc(d.label)}</option>`
    ).join('');

    const connector = ci < totalCount - 1
      ? `<div class="creator-cond-connector">${esc(conditionOp === 'OR' ? I18n.t('creator.target.op.or') : I18n.t('creator.target.op.and'))}</div>`
      : '';

    return `<div class="creator-condition-item" data-cond-item-idx="${ci}">
      <div class="creator-condition-item-hdr">
        <span class="creator-condition-item-num">${esc(I18n.t('creator.condition.item.num', { n: ci + 1 }))}</span>
        <button class="creator-condition-remove" data-action="remove-condition-item"
                data-cond-item-idx="${ci}" ${sa}
                title="${esc(I18n.t('creator.condition.remove.title'))}"
                aria-label="${esc(I18n.t('creator.condition.remove.aria'))}">&#x2715;</button>
      </div>
      <div class="creator-condition-body">
        <div class="creator-condition-row">
          <label class="creator-label creator-condition-label">${esc(I18n.t('creator.condition.fn'))}</label>
          <div class="creator-attrId-wrap">
            <select class="creator-select" data-cond-field="functionId" data-cond-item-idx="${ci}" ${sa}>${fnOpts}</select>
            <input class="creator-input creator-attrId-custom" type="text"
                   data-cond-field="functionCustom" data-cond-item-idx="${ci}" ${sa}
                   placeholder="${esc(I18n.t('creator.condition.fn.ph'))}"
                   value="${esc(c.functionCustom)}" autocomplete="off"
                   style="${isCustomFn ? '' : 'display:none'}">
          </div>
        </div>
        <div class="creator-condition-group">
          <div class="creator-condition-group-label">${esc(I18n.t('creator.condition.arg1'))}</div>
          <div class="creator-condition-row">
            <label class="creator-label creator-condition-label">${esc(I18n.t('creator.condition.arg1.cat'))}</label>
            <select class="creator-select" data-cond-field="arg1Cat" data-cond-item-idx="${ci}" ${sa}>${catOpts}</select>
          </div>
          <div class="creator-condition-row">
            <label class="creator-label creator-condition-label">${esc(I18n.t('creator.condition.arg1.attrId'))}</label>
            <input class="creator-input" type="text"
                   data-cond-field="arg1AttrId" data-cond-item-idx="${ci}" ${sa}
                   placeholder="${esc(I18n.t('creator.condition.arg1.attrId.ph'))}"
                   value="${esc(c.arg1AttrId)}" autocomplete="off">
          </div>
          <div class="creator-condition-row">
            <label class="creator-label creator-condition-label">${esc(I18n.t('creator.condition.arg1.dt'))}</label>
            <select class="creator-select" data-cond-field="arg1DataType" data-cond-item-idx="${ci}" ${sa}>${dt1Opts}</select>
          </div>
        </div>
        <div class="creator-condition-group">
          <div class="creator-condition-group-label">${esc(I18n.t('creator.condition.arg2'))}</div>
          <div class="creator-condition-row">
            <label class="creator-label creator-condition-label">${esc(I18n.t('creator.condition.arg2'))}</label>
            <input class="creator-input" type="text"
                   data-cond-field="arg2Value" data-cond-item-idx="${ci}" ${sa}
                   placeholder="${esc(I18n.t('creator.condition.arg2.val.ph'))}"
                   value="${esc(c.arg2Value)}" autocomplete="off">
          </div>
          <div class="creator-condition-row">
            <label class="creator-label creator-condition-label">${esc(I18n.t('creator.condition.arg2.dt'))}</label>
            <select class="creator-select" data-cond-field="arg2DataType" data-cond-item-idx="${ci}" ${sa}>${dt2Opts}</select>
          </div>
        </div>
      </div>
    </div>${connector}`;
  }

  function _conditionSectionHtml(rule, scope, ruleIdx, psPolicyIdx) {
    const piAttr = psPolicyIdx !== undefined ? ` data-cond-ps-policy-idx="${psPolicyIdx}"` : '';
    const riAttr = ruleIdx !== undefined ? ` data-cond-rule-idx="${ruleIdx}"` : '';
    const sa     = `data-cond-scope="${scope}"${riAttr}${piAttr}`;
    const conditions  = rule.conditions || [];
    const conditionOp = rule.conditionOp || 'AND';

    if (conditions.length === 0) {
      return `<div class="creator-condition-section">
        <button class="creator-add-condition-btn" data-action="add-condition" ${sa}>
          ${esc(I18n.t('creator.condition.add'))}
        </button>
      </div>`;
    }

    const opToggle = conditions.length >= 2
      ? `<div class="creator-cond-op-wrap">
          <span class="creator-cond-op-label">${esc(I18n.t('creator.target.op.label'))}</span>
          <button class="creator-cond-op-btn${conditionOp === 'AND' ? ' active' : ''}"
                  data-action="set-condition-op" data-cond-op="AND" ${sa}>${esc(I18n.t('creator.target.op.and'))}</button>
          <button class="creator-cond-op-btn${conditionOp === 'OR' ? ' active' : ''}"
                  data-action="set-condition-op" data-cond-op="OR" ${sa}>${esc(I18n.t('creator.target.op.or'))}</button>
        </div>`
      : '';

    const itemsHtml = conditions.map((c, ci) =>
      _conditionItemHtml(c, ci, conditionOp, conditions.length, sa)
    ).join('');

    return `<div class="creator-condition-section creator-condition-active">
      <div class="creator-condition-hdr">
        <span class="creator-condition-title">${esc(I18n.t('creator.condition.title'))}</span>
        ${opToggle}
        <button class="creator-add-condition-item-btn" data-action="add-condition" ${sa}>
          + ${esc(I18n.t('creator.condition.item.add'))}
        </button>
      </div>
      <div class="creator-condition-items">
        ${itemsHtml}
      </div>
    </div>`;
  }

  // ── Step validation ────────────────────────────────────────────────────

  function _canProceed() {
    if (_state.rootType === 'PolicySet') {
      const ps = _state.policySet;
      if (_state.step === 1) return true;
      if (_state.step === 2) return ps.id.trim() !== '';
      if (_state.step === 3) {
        return ps.policies.length > 0 &&
               ps.policies.every(p => p.id.trim() !== '' && p.rules.length > 0 && p.rules.every(r => r.id.trim() !== ''));
      }
      return true;
    }
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
                <div class="creator-preview-tabs">
                  <button class="creator-preview-tab${_previewMode === 'visual' ? ' active' : ''}" data-action="preview-mode" data-mode="visual">${esc(I18n.t('creator.preview.mode.visual'))}</button>
                  <button class="creator-preview-tab${_previewMode === 'xml'    ? ' active' : ''}" data-action="preview-mode" data-mode="xml">&lt;/&gt; XML</button>
                </div>
                <button class="creator-copy-btn" id="creator-copy-btn"
                        title="${esc(I18n.t('creator.copy.title'))}">&#x1F4CB;</button>
              </div>
              <div class="creator-visual-pre" id="creator-visual-pre"></div>
              <div class="creator-xml-pane" id="creator-xml-pre"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    _renderStepBar();
    _renderFormStep();
    _renderNav();
    _updatePreview();

    // Copy button only relevant in XML mode
    const copyBtn = document.getElementById('creator-copy-btn');
    if (copyBtn) copyBtn.style.display = _previewMode === 'xml' ? '' : 'none';

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
    const isPS = _state.rootType === 'PolicySet';
    return `
      <div class="creator-step-content">
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s1.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <p class="creator-step-desc">${esc(I18n.t('creator.s1.desc'))}</p>
          <div class="creator-type-cards">
            <label class="creator-type-card${!isPS ? ' selected' : ''}">
              <input type="radio" name="root-type" value="Policy"${!isPS ? ' checked' : ''} style="display:none">
              <div class="type-card-icon">&#x1F4C4;</div>
              <div class="type-card-label">${esc(I18n.t('creator.type.policy.label'))}</div>
              <div class="type-card-desc">${esc(I18n.t('creator.type.policy.desc'))}</div>
            </label>
            <label class="creator-type-card${isPS ? ' selected' : ''}">
              <input type="radio" name="root-type" value="PolicySet"${isPS ? ' checked' : ''} style="display:none">
              <div class="type-card-icon">&#x1F4C1;</div>
              <div class="type-card-label">${esc(I18n.t('creator.type.policyset.label'))}</div>
              <div class="type-card-desc">${esc(I18n.t('creator.type.policyset.desc'))}</div>
            </label>
          </div>
        </div>
      </div>`;
  }

  // ── Step 2: Basis-Info ─────────────────────────────────────────────────

  function _step2Html() {
    if (_state.rootType === 'PolicySet') return _psStep2Html();
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
          ${_policyTargetSectionHtml()}
        </div>
      </div>`;
  }

  function _policyTargetSectionHtml() {
    return _targetSectionHtml(_state.policy.target, 'policy');
  }

  // ── Step 3: Regeln ─────────────────────────────────────────────────────

  function _step3Html() {
    if (_state.rootType === 'PolicySet') return _psStep3Html();
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

  function _targetMatchRowHtml(m, mi, gi, sa) {
    const catOpts = ['subject', 'resource', 'action'].map(c =>
      `<option value="${c}"${m.cat === c ? ' selected' : ''}>${esc(I18n.t(`creator.target.${c}`))}</option>`
    ).join('');
    const knownOpts = ATTR_ID_OPTIONS[m.cat] || ATTR_ID_OPTIONS.subject;
    const isCustomAttr = !knownOpts.find(o => o.value === m.attributeId);
    const attrOpts = knownOpts.map(o =>
      `<option value="${esc(o.value)}"${!isCustomAttr && m.attributeId === o.value ? ' selected' : ''}>${esc(I18n.t(o.labelKey))}</option>`
    ).join('') + `<option value="__custom__"${isCustomAttr ? ' selected' : ''}>${esc(I18n.t('creator.target.attrId.custom'))}</option>`;

    // Advanced: MatchId
    const isCustomMatchId = m.matchId && !MATCH_ID_OPTIONS.find(o => o.value === m.matchId);
    const matchIdOpts =
      `<option value=""${!m.matchId ? ' selected' : ''}>${esc(I18n.t('creator.target.matchId.default'))}</option>` +
      MATCH_ID_OPTIONS.map(o =>
        `<option value="${esc(o.value)}"${!isCustomMatchId && m.matchId === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
      ).join('') +
      `<option value="__custom__"${isCustomMatchId ? ' selected' : ''}>${esc(I18n.t('creator.target.attrId.custom'))}</option>`;

    // Advanced: DataType
    const isCustomDataType = m.dataType && !MATCH_DATATYPE_OPTIONS.find(o => o.value === m.dataType);
    const dataTypeOpts =
      `<option value=""${!m.dataType ? ' selected' : ''}>${esc(I18n.t('creator.target.dataType.default'))}</option>` +
      MATCH_DATATYPE_OPTIONS.map(o =>
        `<option value="${esc(o.value)}"${!isCustomDataType && m.dataType === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
      ).join('') +
      `<option value="__custom__"${isCustomDataType ? ' selected' : ''}>${esc(I18n.t('creator.target.attrId.custom'))}</option>`;

    // Value area depends on valueType
    const vt = m.valueType || 'simple';
    let valueAreaHtml;
    if (vt === 'cv') {
      valueAreaHtml =
        `<div class="creator-target-cv-fields">` +
        `<input class="creator-input" type="text" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="cvCode"` +
        ` placeholder="${esc(I18n.t('creator.target.cv.code.ph'))}" value="${esc(m.cvCode || '')}" autocomplete="off">` +
        `<input class="creator-input" type="text" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="cvCodeSystem"` +
        ` placeholder="${esc(I18n.t('creator.target.cv.sys.ph'))}" value="${esc(m.cvCodeSystem || '')}" autocomplete="off">` +
        `</div>`;
    } else if (vt === 'ii') {
      valueAreaHtml =
        `<input class="creator-input" type="text" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="iiRoot"` +
        ` placeholder="${esc(I18n.t('creator.target.ii.root.ph'))}" value="${esc(m.iiRoot || '')}" autocomplete="off">`;
    } else {
      valueAreaHtml =
        `<input class="creator-input" type="text" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="value"` +
        ` placeholder="${esc(I18n.t(`creator.target.value.ph.${m.cat}`))}" value="${esc(m.value)}" autocomplete="off">`;
    }

    const hasAdv = !!(m.matchId || m.dataType || (m.valueType && m.valueType !== 'simple'));

    return `<div class="creator-target-match-wrap">
      <div class="creator-target-row" data-match-idx="${mi}">
        <select class="creator-select creator-cat-select" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="cat">${catOpts}</select>
        <div class="creator-attrId-wrap">
          <select class="creator-select creator-attrId-select" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="attributeId">${attrOpts}</select>
          <input class="creator-input creator-attrId-custom" type="text" ${sa}
                 data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="attributeId-custom"
                 placeholder="${esc(I18n.t('creator.target.attrId.custom.ph'))}"
                 value="${esc(isCustomAttr ? m.attributeId : '')}" autocomplete="off"
                 style="${isCustomAttr ? '' : 'display:none'}">
        </div>
        ${valueAreaHtml}
        <div class="creator-match-actions">
          <button class="creator-match-adv-btn${hasAdv ? ' active' : ''}" data-action="toggle-match-adv"
                  title="${esc(I18n.t('creator.target.adv.title'))}" aria-expanded="${hasAdv}">&#x2699;&#xFE0F;</button>
          <button class="creator-match-del-btn" data-action="del-match" ${sa} data-group-idx="${gi}" data-match-idx="${mi}"
                  title="${esc(I18n.t('creator.target.match.del.title'))}"
                  aria-label="${esc(I18n.t('creator.target.match.del.aria'))}">&#x2715;</button>
        </div>
      </div>
      <div class="creator-target-adv" style="${hasAdv ? '' : 'display:none'}">
        <div class="creator-target-adv-row">
          <label class="creator-label creator-condition-label">${esc(I18n.t('creator.target.matchId.label'))}</label>
          <div class="creator-attrId-wrap">
            <select class="creator-select" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="matchId">${matchIdOpts}</select>
            <input class="creator-input creator-attrId-custom" type="text" ${sa}
                   data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="matchId-custom"
                   placeholder="${esc(I18n.t('creator.target.matchId.custom.ph'))}"
                   value="${esc(isCustomMatchId ? m.matchId : '')}" autocomplete="off"
                   style="${isCustomMatchId ? '' : 'display:none'}">
          </div>
        </div>
        <div class="creator-target-adv-row">
          <label class="creator-label creator-condition-label">${esc(I18n.t('creator.target.dataType.label'))}</label>
          <div class="creator-attrId-wrap">
            <select class="creator-select" ${sa} data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="dataType">${dataTypeOpts}</select>
            <input class="creator-input creator-attrId-custom" type="text" ${sa}
                   data-group-idx="${gi}" data-match-idx="${mi}" data-match-prop="dataType-custom"
                   placeholder="${esc(I18n.t('creator.target.dataType.custom.ph'))}"
                   value="${esc(isCustomDataType ? m.dataType : '')}" autocomplete="off"
                   style="${isCustomDataType ? '' : 'display:none'}">
          </div>
        </div>
      </div>
    </div>`;
  }

  function _targetSectionHtml(target, scope, ruleIdx, psPolicyIdx) {
    const t  = target || _defaultTarget();
    const ri = ruleIdx !== undefined ? ruleIdx : '';
    const pi = psPolicyIdx !== undefined ? ` data-ps-policy-idx="${psPolicyIdx}"` : '';
    let sa;
    if (scope === 'policy')    sa = `data-target-scope="policy"`;
    else if (scope === 'rule') sa = `data-target-scope="rule" data-target-rule-idx="${ri}"`;
    else if (scope === 'ps')   sa = `data-target-scope="ps"`;
    else if (scope === 'ps-policy') sa = `data-target-scope="ps-policy"${pi}`;
    else if (scope === 'ps-rule')   sa = `data-target-scope="ps-rule" data-target-rule-idx="${ri}"${pi}`;
    else sa = `data-target-scope="policy"`;
    const labelKey = (scope === 'policy' || scope === 'ps' || scope === 'ps-policy')
      ? 'creator.ptarget.section' : 'creator.target.section';
    const hintKey = scope === 'policy'    ? 'creator.ptarget.hint'
      : scope === 'ps'                    ? 'creator.ps.ptarget.hint'
      : scope === 'ps-policy'             ? 'creator.ptarget.hint'
      : 'creator.target.hint';

    const groups = t.groups || [];
    const groupsHtml = groups.map((g, gi) => {
      const rowsHtml = g.matches.map((m, mi) => _targetMatchRowHtml(m, mi, gi, sa)).join('');
      const orSep = gi < groups.length - 1
        ? `<div class="creator-target-or-sep">${esc(I18n.t('creator.target.op.or'))}</div>`
        : '';
      return `<div class="creator-target-group" data-group-idx="${gi}">
          <div class="creator-target-group-hdr">
            <span class="creator-target-group-num">${esc(I18n.t('creator.target.group.num', { n: gi + 1 }))}</span>
            <button class="creator-match-del-btn" data-action="del-group" ${sa} data-group-idx="${gi}"
                    title="${esc(I18n.t('creator.target.group.del.title'))}"
                    aria-label="${esc(I18n.t('creator.target.group.del.aria'))}">&#x2715;</button>
          </div>
          <div class="creator-target-matches">${rowsHtml}</div>
          <button class="creator-add-match-btn" data-action="add-match" ${sa} data-group-idx="${gi}">${esc(I18n.t('creator.target.match.add'))}</button>
        </div>${orSep}`;
    }).join('');

    return `
        <div class="creator-target-section">
          <div class="creator-target-hdr">
            <span class="creator-target-hdr-label">${esc(I18n.t(labelKey))}</span>
            <span class="creator-hint">${esc(I18n.t(hintKey))}</span>
          </div>
          <div class="creator-target-groups">${groupsHtml}</div>
          <button class="creator-add-group-btn" data-action="add-group" ${sa}>${esc(I18n.t('creator.target.group.add'))}</button>
        </div>`;
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
          ${_targetSectionHtml(r.target, 'rule', i)}
          ${_conditionSectionHtml(r, 'rule', i)}
        </div>
      </div>`;
  }

  // ── Step 4: Review ─────────────────────────────────────────────────────

  function _step4Html() {
    if (_state.rootType === 'PolicySet') return _psStep4Html();
    const p   = _state.policy;
    const alg = COMBINING_ALGS.find(a => a.value === p.combiningAlg);
    const algLabel = alg ? I18n.t(alg.labelKey) : p.combiningAlg;

    const ruleRows = p.rules.map(r => {
      const targetParts = [];
      if (r.target && Array.isArray(r.target.groups)) {
        r.target.groups.forEach((g, gi) => {
          const active = g.matches.filter(m => m.value.trim());
          if (!active.length) return;
          const parts = active.map(m => `${I18n.t(`creator.target.${m.cat}`)}: ${m.value.trim()}`).join(' & ');
          targetParts.push(gi > 0 ? `${I18n.t('creator.target.op.or')} ${parts}` : parts);
        });
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
            ${(() => {
              const pt = p.target;
              if (!pt || !Array.isArray(pt.groups)) return '';
              const groupParts = pt.groups.map(g =>
                g.matches.filter(m => m.value.trim()).map(m => `${I18n.t(`creator.target.${m.cat}`)}: ${m.value.trim()}`).join(' & ')
              ).filter(s => s);
              if (!groupParts.length) return '';
              return `<div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.ptarget'))}</span>
              <span class="creator-summary-val">${esc(groupParts.join(` ${I18n.t('creator.target.op.or')} `))}</span>
            </div>`;
            })()}
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

  // ── PolicySet HTML Builders ─────────────────────────────────────────────

  function _psStep2Html() {
    const ps = _state.policySet;
    const algOptions = PS_COMBINING_ALGS.map(a =>
      `<option value="${esc(a.value)}"${ps.combiningAlg === a.value ? ' selected' : ''}>${esc(I18n.t(a.labelKey))}</option>`
    ).join('');
    return `
      <div class="creator-step-content">
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s2.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <div class="creator-field">
            <label class="creator-label" for="f-ps-id">
              ${esc(I18n.t('creator.ps.field.id.label'))} <span class="field-required">*</span>
            </label>
            <div class="creator-input-row">
              <input class="creator-input" id="f-ps-id" type="text"
                     data-ps-field="id" placeholder="${esc(I18n.t('creator.ps.field.id.ph'))}"
                     value="${esc(ps.id)}" autocomplete="off" spellcheck="false">
              <button class="creator-uuid-btn" data-action="gen-ps-uuid"
                      title="${esc(I18n.t('creator.ps.uuid.title'))}"
                      aria-label="${esc(I18n.t('creator.ps.uuid.aria'))}">
                &#x1F3B2; UUID
              </button>
            </div>
            <span class="creator-hint">${esc(I18n.t('creator.ps.field.id.hint'))}</span>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-ps-version">${esc(I18n.t('creator.field.ver.label'))}</label>
            <select class="creator-select creator-select-sm" id="f-ps-version" data-ps-field="version">
              <option value="2.0"${ps.version === '2.0' ? ' selected' : ''}>XACML 2.0</option>
              <option value="3.0"${ps.version === '3.0' ? ' selected' : ''}>XACML 3.0</option>
            </select>
            <span class="creator-hint">${esc(I18n.t('creator.field.ver.hint'))}</span>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-ps-desc">${esc(I18n.t('creator.field.desc.label'))}</label>
            <textarea class="creator-textarea" id="f-ps-desc" rows="3"
                      data-ps-field="description"
                      placeholder="${esc(I18n.t('creator.field.desc.ph'))}">${esc(ps.description)}</textarea>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-ps-alg">${esc(I18n.t('creator.field.alg.label'))}</label>
            <select class="creator-select" id="f-ps-alg" data-ps-field="combiningAlg">
              ${algOptions}
            </select>
            <span class="creator-hint">${esc(I18n.t('creator.ps.field.alg.hint'))}</span>
          </div>
          ${_targetSectionHtml(ps.target, 'ps')}
        </div>
      </div>`;
  }

  function _psStep3Html() {
    const policies = _state.policySet.policies;
    const policiesHtml = policies.length === 0
      ? `<div class="creator-empty-rules">${esc(I18n.t('creator.ps.policy.empty'))}</div>`
      : policies.map((p, pi) => _psPolicyCardHtml(p, pi)).join('');
    return `
      <div class="creator-step-content">
        <div class="creator-step-hdr">
          <h3 class="creator-step-title">${esc(I18n.t('creator.s3.title'))}</h3>
        </div>
        <div class="creator-step-body">
          <p class="creator-step-desc">${esc(I18n.t('creator.ps.s3.desc'))}</p>
          <div class="creator-ps-policies-list" id="creator-ps-policies-list">
            ${policiesHtml}
          </div>
          <button class="creator-add-rule-btn" id="creator-ps-add-policy" data-action="ps-add-policy">
            ${esc(I18n.t('creator.ps.policy.add'))}
          </button>
        </div>
      </div>`;
  }

  function _psStep4Html() {
    const ps  = _state.policySet;
    const alg = PS_COMBINING_ALGS.find(a => a.value === ps.combiningAlg);
    const algLabel = alg ? I18n.t(alg.labelKey) : ps.combiningAlg;
    const policyRows = ps.policies.map(p => {
      const pAlg = COMBINING_ALGS.find(a => a.value === p.combiningAlg);
      const pAlgLabel = pAlg ? I18n.t(pAlg.labelKey) : p.combiningAlg;
      return `<tr>
        <td>${esc(p.id || '\u2014')}</td>
        <td>XACML ${esc(p.version)}</td>
        <td>${p.rules.length}</td>
        <td>${esc(pAlgLabel)}</td>
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
              <span class="creator-summary-key">${esc(I18n.t('creator.ps.summary.id'))}</span>
              <span class="creator-summary-val">${esc(ps.id || '\u2014')}</span>
            </div>
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.version'))}</span>
              <span class="creator-summary-val">XACML ${esc(ps.version || '3.0')}</span>
            </div>
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.summary.alg'))}</span>
              <span class="creator-summary-val">${esc(algLabel)}</span>
            </div>
            <div class="creator-summary-row">
              <span class="creator-summary-key">${esc(I18n.t('creator.ps.summary.policies'))}</span>
              <span class="creator-summary-val">${ps.policies.length}</span>
            </div>
          </div>
          ${ps.policies.length > 0 ? `
          <table class="creator-rules-table">
            <thead>
              <tr>
                <th>${esc(I18n.t('creator.ps.field.id.label'))}</th>
                <th>${esc(I18n.t('creator.summary.version'))}</th>
                <th>${esc(I18n.t('creator.summary.rules'))}</th>
                <th>${esc(I18n.t('creator.summary.alg'))}</th>
              </tr>
            </thead>
            <tbody>${policyRows}</tbody>
          </table>` : ''}
          <div class="creator-val-result" id="creator-val-result" style="display:none"></div>
        </div>
      </div>`;
  }

  function _psPolicyCardHtml(p, pi) {
    const n = pi + 1;
    const algOptions = COMBINING_ALGS.map(a =>
      `<option value="${esc(a.value)}"${p.combiningAlg === a.value ? ' selected' : ''}>${esc(I18n.t(a.labelKey))}</option>`
    ).join('');
    const rulesHtml = p.rules.length === 0
      ? `<div class="creator-empty-rules">${esc(I18n.t('creator.rules.empty'))}</div>`
      : p.rules.map((r, ri) => _psRuleCardHtml(r, ri, pi)).join('');
    return `
      <div class="creator-ps-policy-card" data-ps-policy-idx="${pi}">
        <div class="creator-ps-policy-hdr" data-action="ps-toggle-policy" data-ps-policy-idx="${pi}"
             role="button" aria-expanded="true" title="${esc(I18n.t('creator.ps.policy.toggle'))}">
          <span class="creator-ps-toggle" aria-hidden="true">&#x25BC;</span>
          <span class="creator-ps-policy-num">${esc(I18n.t('creator.ps.policy.num', { n }))}</span>
          <span class="creator-ps-policy-id-preview">${esc(p.id || '\u2014')}</span>
          <button class="creator-ps-policy-del" data-action="ps-del-policy" data-ps-policy-idx="${pi}"
                  title="${esc(I18n.t('creator.ps.policy.del.title'))}"
                  aria-label="${esc(I18n.t('creator.ps.policy.del.aria', { n }))}">&#x2715;</button>
        </div>
        <div class="creator-ps-policy-body">
          <div class="creator-field-row">
            <div class="creator-field creator-field-grow">
              <label class="creator-label" for="f-ps-policy-id-${pi}">
                ${esc(I18n.t('creator.field.id.label'))} <span class="field-required">*</span>
              </label>
              <div class="creator-input-row">
                <input class="creator-input" id="f-ps-policy-id-${pi}" type="text"
                       data-ps-policy-idx="${pi}" data-ps-policy-field="id"
                       placeholder="${esc(I18n.t('creator.field.id.ph'))}"
                       value="${esc(p.id)}" autocomplete="off" spellcheck="false">
                <button class="creator-uuid-btn" data-action="gen-ps-policy-uuid" data-ps-policy-idx="${pi}"
                        title="${esc(I18n.t('creator.uuid.title'))}"
                        aria-label="${esc(I18n.t('creator.uuid.aria'))}">
                  &#x1F3B2; UUID
                </button>
              </div>
            </div>
            <div class="creator-field creator-field-sm">
              <label class="creator-label" for="f-ps-policy-ver-${pi}">${esc(I18n.t('creator.field.ver.label'))}</label>
              <select class="creator-select creator-select-sm" id="f-ps-policy-ver-${pi}"
                      data-ps-policy-idx="${pi}" data-ps-policy-field="version">
                <option value="2.0"${p.version === '2.0' ? ' selected' : ''}>XACML 2.0</option>
                <option value="3.0"${p.version === '3.0' ? ' selected' : ''}>XACML 3.0</option>
              </select>
            </div>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-ps-policy-desc-${pi}">${esc(I18n.t('creator.field.desc.label'))}</label>
            <input class="creator-input" id="f-ps-policy-desc-${pi}" type="text"
                   data-ps-policy-idx="${pi}" data-ps-policy-field="description"
                   placeholder="${esc(I18n.t('creator.field.desc.ph'))}"
                   value="${esc(p.description)}" autocomplete="off">
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-ps-policy-alg-${pi}">${esc(I18n.t('creator.field.alg.label'))}</label>
            <select class="creator-select" id="f-ps-policy-alg-${pi}"
                    data-ps-policy-idx="${pi}" data-ps-policy-field="combiningAlg">
              ${algOptions}
            </select>
          </div>
          ${_targetSectionHtml(p.target, 'ps-policy', undefined, pi)}
          <div class="creator-ps-rules-section">
            <div class="creator-ps-rules-hdr">${esc(I18n.t('creator.ps.rules.title'))}</div>
            <div class="creator-ps-rules-list" data-ps-policy-idx="${pi}">
              ${rulesHtml}
            </div>
            <button class="creator-add-rule-btn creator-add-rule-btn-sm" data-action="ps-add-rule" data-ps-policy-idx="${pi}">
              ${esc(I18n.t('creator.rule.add'))}
            </button>
          </div>
        </div>
      </div>`;
  }

  function _psRuleCardHtml(r, ri, pi) {
    const n = ri + 1;
    return `
      <div class="creator-rule-card" data-rule-idx="${ri}">
        <div class="rule-card-hdr">
          <span class="rule-card-num">${esc(I18n.t('creator.rule.num', { n }))}</span>
          <button class="rule-delete-btn" data-action="ps-del-rule"
                  data-ps-policy-idx="${pi}" data-ps-rule-idx="${ri}"
                  title="${esc(I18n.t('creator.rule.delete.title'))}"
                  aria-label="${esc(I18n.t('creator.rule.delete.aria', { n }))}">&#x2715;</button>
        </div>
        <div class="creator-rule-fields">
          <div class="creator-field-row">
            <div class="creator-field creator-field-grow">
              <label class="creator-label" for="f-ps-rule-id-${pi}-${ri}">
                ${esc(I18n.t('creator.rule.id.label'))} <span class="field-required">*</span>
              </label>
              <div class="creator-input-row">
                <input class="creator-input" id="f-ps-rule-id-${pi}-${ri}" type="text"
                       data-ps-policy-idx="${pi}" data-ps-rule-idx="${ri}" data-ps-rule-field="id"
                       placeholder="${esc(I18n.t('creator.rule.id.ph'))}"
                       value="${esc(r.id)}" autocomplete="off" spellcheck="false">
                <button class="creator-uuid-btn" data-action="gen-ps-rule-uuid"
                        data-ps-policy-idx="${pi}" data-ps-rule-idx="${ri}"
                        title="${esc(I18n.t('creator.rule.id.uuid.title'))}"
                        aria-label="${esc(I18n.t('creator.rule.id.uuid.aria'))}">
                  &#x1F3B2; UUID
                </button>
              </div>
            </div>
            <div class="creator-field creator-field-sm">
              <label class="creator-label" for="f-ps-rule-effect-${pi}-${ri}">
                ${esc(I18n.t('creator.rule.effect.label'))}
              </label>
              <select class="creator-select" id="f-ps-rule-effect-${pi}-${ri}"
                      data-ps-policy-idx="${pi}" data-ps-rule-idx="${ri}" data-ps-rule-field="effect">
                <option value="Permit"${r.effect === 'Permit' ? ' selected' : ''}>&#x2705; Permit</option>
                <option value="Deny"${r.effect === 'Deny' ? ' selected' : ''}>&#x274C; Deny</option>
              </select>
            </div>
          </div>
          <div class="creator-field">
            <label class="creator-label" for="f-ps-rule-desc-${pi}-${ri}">
              ${esc(I18n.t('creator.rule.desc.label'))}
            </label>
            <input class="creator-input" id="f-ps-rule-desc-${pi}-${ri}" type="text"
                   data-ps-policy-idx="${pi}" data-ps-rule-idx="${ri}" data-ps-rule-field="description"
                   placeholder="${esc(I18n.t('creator.rule.desc.ph'))}"
                   value="${esc(r.description)}" autocomplete="off">
          </div>
          ${_targetSectionHtml(r.target, 'ps-rule', ri, pi)}
          ${_conditionSectionHtml(r, 'ps-rule', ri, pi)}
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

    const modeBtn = t.closest('[data-action="preview-mode"]');
    if (modeBtn) {
      _previewMode = modeBtn.dataset.mode;
      document.querySelectorAll('.creator-preview-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === _previewMode)
      );
      const copyBtn = document.getElementById('creator-copy-btn');
      if (copyBtn) copyBtn.style.display = _previewMode === 'xml' ? '' : 'none';
      _updatePreview();
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

    const deleteBtn = t.closest('[data-action="delete-rule"]');
    if (deleteBtn) { _deleteRule(parseInt(deleteBtn.dataset.idx, 10)); return; }

    // PS actions
    if (t.closest('[data-action="ps-add-policy"]'))    { _psAddPolicy(); return; }
    const psPolicyDelBtn = t.closest('[data-action="ps-del-policy"]');
    if (psPolicyDelBtn) { _psDeletePolicy(parseInt(psPolicyDelBtn.dataset.psPolicyIdx, 10)); return; }
    const psPolicyToggleBtn = t.closest('[data-action="ps-toggle-policy"]');
    if (psPolicyToggleBtn) { _psTogglePolicy(parseInt(psPolicyToggleBtn.dataset.psPolicyIdx, 10)); return; }
    const psAddRuleBtn = t.closest('[data-action="ps-add-rule"]');
    if (psAddRuleBtn) { _psAddRule(parseInt(psAddRuleBtn.dataset.psPolicyIdx, 10)); return; }
    const psDelRuleBtn = t.closest('[data-action="ps-del-rule"]');
    if (psDelRuleBtn) { _psDeleteRule(parseInt(psDelRuleBtn.dataset.psPolicyIdx, 10), parseInt(psDelRuleBtn.dataset.psRuleIdx, 10)); return; }
    if (t.closest('[data-action="gen-ps-uuid"]'))       { _psGenerateUuid(); return; }
    const psPolicyUuidBtn = t.closest('[data-action="gen-ps-policy-uuid"]');
    if (psPolicyUuidBtn) { _psGeneratePolicyUuid(parseInt(psPolicyUuidBtn.dataset.psPolicyIdx, 10)); return; }
    const psRuleUuidBtn = t.closest('[data-action="gen-ps-rule-uuid"]');
    if (psRuleUuidBtn) { _psGenerateRuleUuid(parseInt(psRuleUuidBtn.dataset.psPolicyIdx, 10), parseInt(psRuleUuidBtn.dataset.psRuleIdx, 10)); return; }

    // Target match/group actions — extract psPolicyIdx for PS scopes
    const addMatchBtn = t.closest('[data-action="add-match"]');
    if (addMatchBtn) {
      const scope = addMatchBtn.dataset.targetScope;
      const rIdx  = addMatchBtn.dataset.targetRuleIdx !== undefined ? parseInt(addMatchBtn.dataset.targetRuleIdx, 10) : undefined;
      const piIdx = addMatchBtn.dataset.psPolicyIdx !== undefined ? parseInt(addMatchBtn.dataset.psPolicyIdx, 10) : undefined;
      _addMatch(scope, rIdx, parseInt(addMatchBtn.dataset.groupIdx, 10), piIdx);
      return;
    }

    const delMatchBtn = t.closest('[data-action="del-match"]');
    if (delMatchBtn) {
      const scope = delMatchBtn.dataset.targetScope;
      const rIdx  = delMatchBtn.dataset.targetRuleIdx !== undefined ? parseInt(delMatchBtn.dataset.targetRuleIdx, 10) : undefined;
      const piIdx = delMatchBtn.dataset.psPolicyIdx !== undefined ? parseInt(delMatchBtn.dataset.psPolicyIdx, 10) : undefined;
      _deleteMatch(scope, rIdx, parseInt(delMatchBtn.dataset.groupIdx, 10), parseInt(delMatchBtn.dataset.matchIdx, 10), piIdx);
      return;
    }

    const addGroupBtn = t.closest('[data-action="add-group"]');
    if (addGroupBtn) {
      const scope = addGroupBtn.dataset.targetScope;
      const rIdx  = addGroupBtn.dataset.targetRuleIdx !== undefined ? parseInt(addGroupBtn.dataset.targetRuleIdx, 10) : undefined;
      const piIdx = addGroupBtn.dataset.psPolicyIdx !== undefined ? parseInt(addGroupBtn.dataset.psPolicyIdx, 10) : undefined;
      _addGroup(scope, rIdx, piIdx);
      return;
    }

    const delGroupBtn = t.closest('[data-action="del-group"]');
    if (delGroupBtn) {
      const scope = delGroupBtn.dataset.targetScope;
      const rIdx  = delGroupBtn.dataset.targetRuleIdx !== undefined ? parseInt(delGroupBtn.dataset.targetRuleIdx, 10) : undefined;
      const piIdx = delGroupBtn.dataset.psPolicyIdx !== undefined ? parseInt(delGroupBtn.dataset.psPolicyIdx, 10) : undefined;
      _deleteGroup(scope, rIdx, parseInt(delGroupBtn.dataset.groupIdx, 10), piIdx);
      return;
    }

    if (t.closest('[data-action="gen-uuid"]'))       { _generateUuid(); return; }
    const ruleUuidBtn = t.closest('[data-action="gen-rule-uuid"]');
    if (ruleUuidBtn) { _generateRuleUuid(parseInt(ruleUuidBtn.dataset.idx, 10)); return; }

    const addCondBtn = t.closest('[data-action="add-condition"]');
    if (addCondBtn) {
      _addCondition(addCondBtn.dataset.condScope, _condIdxFrom(addCondBtn, 'condRuleIdx'), _condIdxFrom(addCondBtn, 'condPsPolicyIdx'));
      return;
    }
    const removeCondItemBtn = t.closest('[data-action="remove-condition-item"]');
    if (removeCondItemBtn) {
      _removeConditionItem(
        removeCondItemBtn.dataset.condScope,
        _condIdxFrom(removeCondItemBtn, 'condRuleIdx'),
        parseInt(removeCondItemBtn.dataset.condItemIdx, 10),
        _condIdxFrom(removeCondItemBtn, 'condPsPolicyIdx')
      );
      return;
    }
    const setCondOpBtn = t.closest('[data-action="set-condition-op"]');
    if (setCondOpBtn) {
      _setConditionOp(setCondOpBtn.dataset.condScope, _condIdxFrom(setCondOpBtn, 'condRuleIdx'), setCondOpBtn.dataset.condOp, _condIdxFrom(setCondOpBtn, 'condPsPolicyIdx'));
      return;
    }
    const toggleMatchAdvBtn = t.closest('[data-action="toggle-match-adv"]');
    if (toggleMatchAdvBtn) {
      const adv = toggleMatchAdvBtn.closest('.creator-target-match-wrap')?.querySelector('.creator-target-adv');
      if (adv) adv.style.display = adv.style.display === 'none' ? '' : 'none';
      return;
    }
  }

  // ── Target helpers ─────────────────────────────────────────────────────

  function _getTarget(scope, psPolicyIdx, ruleIdx) {
    if (scope === 'policy')    return _state.policy.target;
    if (scope === 'rule')      return _state.policy.rules[ruleIdx]?.target ?? null;
    if (scope === 'ps')        return _state.policySet.target;
    if (scope === 'ps-policy') return _state.policySet.policies[psPolicyIdx]?.target ?? null;
    if (scope === 'ps-rule')   return _state.policySet.policies[psPolicyIdx]?.rules[ruleIdx]?.target ?? null;
    return null;
  }

  function _targetFromEl(el) {
    const scope = el.dataset.targetScope;
    const pi = el.dataset.psPolicyIdx !== undefined ? parseInt(el.dataset.psPolicyIdx, 10) : undefined;
    const ri = el.dataset.targetRuleIdx !== undefined ? parseInt(el.dataset.targetRuleIdx, 10) : undefined;
    return _getTarget(scope, pi, ri);
  }

  function _addMatch(scope, ruleIdx, groupIdx, psPolicyIdx) {
    const target = _getTarget(scope, psPolicyIdx, ruleIdx);
    if (!target || !target.groups[groupIdx]) return;
    target.groups[groupIdx].matches.push(_defaultMatchRow('subject'));
    _saveState(); _schedulePreview();
    _reRenderTargetSection(scope, ruleIdx, psPolicyIdx);
  }

  function _deleteMatch(scope, ruleIdx, groupIdx, matchIdx, psPolicyIdx) {
    const target = _getTarget(scope, psPolicyIdx, ruleIdx);
    if (!target || !target.groups[groupIdx]) return;
    const g = target.groups[groupIdx];
    if (g.matches.length <= 1) return;
    g.matches.splice(matchIdx, 1);
    _saveState(); _schedulePreview();
    _reRenderTargetSection(scope, ruleIdx, psPolicyIdx);
  }

  function _addGroup(scope, ruleIdx, psPolicyIdx) {
    const target = _getTarget(scope, psPolicyIdx, ruleIdx);
    if (!target) return;
    target.groups.push({ matches: [_defaultMatchRow('subject')] });
    _saveState(); _schedulePreview();
    _reRenderTargetSection(scope, ruleIdx, psPolicyIdx);
  }

  function _deleteGroup(scope, ruleIdx, groupIdx, psPolicyIdx) {
    const target = _getTarget(scope, psPolicyIdx, ruleIdx);
    if (!target || target.groups.length <= 1) return;
    target.groups.splice(groupIdx, 1);
    _saveState(); _schedulePreview();
    _reRenderTargetSection(scope, ruleIdx, psPolicyIdx);
  }

  function _reRenderTargetSection(scope, ruleIdx, psPolicyIdx) {
    let section;
    if (scope === 'policy' || scope === 'ps') {
      section = document.querySelector('#creator-form-area .creator-target-section');
    } else if (scope === 'rule') {
      const card = document.querySelector(`.creator-rule-card[data-rule-idx="${ruleIdx}"]`);
      if (card) section = card.querySelector('.creator-target-section');
    } else if (scope === 'ps-policy') {
      const card = document.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${psPolicyIdx}"]`);
      if (card) section = card.querySelector('.creator-ps-policy-body > .creator-target-section');
    } else if (scope === 'ps-rule') {
      const psCard = document.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${psPolicyIdx}"]`);
      if (psCard) {
        const rCard = psCard.querySelector(`.creator-rule-card[data-rule-idx="${ruleIdx}"]`);
        if (rCard) section = rCard.querySelector('.creator-target-section');
      }
    }
    if (!section) return;
    const target = _getTarget(scope, psPolicyIdx, ruleIdx);
    const tmp = document.createElement('div');
    tmp.innerHTML = _targetSectionHtml(target, scope, ruleIdx, psPolicyIdx);
    section.replaceWith(tmp.firstElementChild);
  }

  function _handleInput(e) {
    const t = e.target;
    // Policy-level fields
    if (t.dataset.field !== undefined) {
      _state.policy[t.dataset.field] = t.value;
      _saveState(); _schedulePreview(); _updateNextBtn();
      return;
    }
    // Policy rule fields
    if (t.dataset.ruleField !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      if (_state.policy.rules[idx]) {
        _state.policy.rules[idx][t.dataset.ruleField] = t.value;
        _saveState(); _schedulePreview(); _updateNextBtn();
      }
      return;
    }
    // PolicySet top-level fields
    if (t.dataset.psField !== undefined) {
      _state.policySet[t.dataset.psField] = t.value;
      _saveState(); _schedulePreview(); _updateNextBtn();
      return;
    }
    // PolicySet embedded-policy fields
    if (t.dataset.psPolicyField !== undefined && t.dataset.psPolicyIdx !== undefined) {
      const pi = parseInt(t.dataset.psPolicyIdx, 10);
      if (_state.policySet.policies[pi]) {
        _state.policySet.policies[pi][t.dataset.psPolicyField] = t.value;
        if (t.dataset.psPolicyField === 'id') {
          const card = document.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${pi}"]`);
          if (card) {
            const preview = card.querySelector('.creator-ps-policy-id-preview');
            if (preview) preview.textContent = t.value || '\u2014';
          }
        }
        _saveState(); _schedulePreview(); _updateNextBtn();
      }
      return;
    }
    // PolicySet embedded-policy rule fields
    if (t.dataset.psRuleField !== undefined && t.dataset.psPolicyIdx !== undefined && t.dataset.psRuleIdx !== undefined) {
      const pi = parseInt(t.dataset.psPolicyIdx, 10);
      const ri = parseInt(t.dataset.psRuleIdx, 10);
      if (_state.policySet.policies[pi]?.rules[ri]) {
        _state.policySet.policies[pi].rules[ri][t.dataset.psRuleField] = t.value;
        _saveState(); _schedulePreview(); _updateNextBtn();
      }
      return;
    }
    // Target match text inputs (value, attributeId-custom, matchId-custom, dataType-custom, cvCode, cvCodeSystem, iiRoot)
    const matchPropInp = t.dataset.matchProp;
    if (matchPropInp !== undefined && t.tagName === 'INPUT') {
      const target = _targetFromEl(t);
      const gi = parseInt(t.dataset.groupIdx, 10);
      const mi = parseInt(t.dataset.matchIdx, 10);
      if (target && target.groups[gi] && target.groups[gi].matches[mi]) {
        const m = target.groups[gi].matches[mi];
        if (matchPropInp === 'attributeId-custom') m.attributeId = t.value;
        else if (matchPropInp === 'matchId-custom') m.matchId = t.value;
        else if (matchPropInp === 'dataType-custom') m.dataType = t.value;
        else m[matchPropInp] = t.value;
        _saveState(); _schedulePreview();
      }
      return;
    }
    // Condition field inputs
    if (t.dataset.condField !== undefined && t.dataset.condItemIdx !== undefined) {
      const rule = _getRule(t.dataset.condScope, _condIdxFrom(t, 'condRuleIdx'), _condIdxFrom(t, 'condPsPolicyIdx'));
      const ci = parseInt(t.dataset.condItemIdx, 10);
      if (rule && rule.conditions && rule.conditions[ci]) {
        rule.conditions[ci][t.dataset.condField] = t.value;
        _saveState(); _schedulePreview();
      }
    }
  }

  function _handleChange(e) {
    const t = e.target;
    // Root type selection
    if (t.name === 'root-type') {
      _state.rootType = t.value;
      _saveState();
      document.querySelectorAll('.creator-type-card').forEach(c => {
        const inp = c.querySelector('input[type=radio]');
        c.classList.toggle('selected', inp?.value === t.value);
      });
      return;
    }
    // Policy-level fields
    if (t.dataset.field !== undefined) {
      _state.policy[t.dataset.field] = t.value;
      _saveState(); _schedulePreview();
      return;
    }
    // Policy rule fields
    if (t.dataset.ruleField !== undefined) {
      const idx = parseInt(t.dataset.ruleIdx, 10);
      if (_state.policy.rules[idx]) {
        _state.policy.rules[idx][t.dataset.ruleField] = t.value;
        _saveState(); _schedulePreview();
      }
      return;
    }
    // PolicySet top-level fields
    if (t.dataset.psField !== undefined) {
      _state.policySet[t.dataset.psField] = t.value;
      _saveState(); _schedulePreview(); _updateNextBtn();
      return;
    }
    // PolicySet embedded-policy fields
    if (t.dataset.psPolicyField !== undefined && t.dataset.psPolicyIdx !== undefined) {
      const pi = parseInt(t.dataset.psPolicyIdx, 10);
      if (_state.policySet.policies[pi]) {
        _state.policySet.policies[pi][t.dataset.psPolicyField] = t.value;
        _saveState(); _schedulePreview();
      }
      return;
    }
    // PolicySet embedded-policy rule fields
    if (t.dataset.psRuleField !== undefined && t.dataset.psPolicyIdx !== undefined && t.dataset.psRuleIdx !== undefined) {
      const pi = parseInt(t.dataset.psPolicyIdx, 10);
      const ri = parseInt(t.dataset.psRuleIdx, 10);
      if (_state.policySet.policies[pi]?.rules[ri]) {
        _state.policySet.policies[pi].rules[ri][t.dataset.psRuleField] = t.value;
        _saveState(); _schedulePreview();
      }
      return;
    }
    // Condition field selects (now array-based, needs data-cond-item-idx)
    if (t.dataset.condField !== undefined && t.dataset.condItemIdx !== undefined) {
      const rule = _getRule(t.dataset.condScope, _condIdxFrom(t, 'condRuleIdx'), _condIdxFrom(t, 'condPsPolicyIdx'));
      const ci = parseInt(t.dataset.condItemIdx, 10);
      if (rule && rule.conditions && rule.conditions[ci]) {
        rule.conditions[ci][t.dataset.condField] = t.value;
        if (t.dataset.condField === 'functionId') {
          const customInput = t.closest('.creator-condition-row')?.querySelector('input[data-cond-field="functionCustom"]');
          if (customInput) customInput.style.display = t.value === '__custom__' ? '' : 'none';
        }
        _saveState(); _schedulePreview();
      }
      return;
    }
    // Target match properties (cat, attributeId, matchId, dataType — works for all scopes via _targetFromEl)
    const matchProp = t.dataset.matchProp;
    if (matchProp !== undefined) {
      const target = _targetFromEl(t);
      const gi = parseInt(t.dataset.groupIdx, 10);
      const mi = parseInt(t.dataset.matchIdx, 10);
      if (target && target.groups[gi] && target.groups[gi].matches[mi]) {
        const m = target.groups[gi].matches[mi];
        const scope = t.dataset.targetScope;
        const rIdx  = t.dataset.targetRuleIdx !== undefined ? parseInt(t.dataset.targetRuleIdx, 10) : undefined;
        const piIdx = t.dataset.psPolicyIdx !== undefined ? parseInt(t.dataset.psPolicyIdx, 10) : undefined;

        if (matchProp === 'attributeId' && t.value === '__custom__') {
          m.attributeId = '';
          const row = t.closest('.creator-target-row');
          const customInput = row?.querySelector('.creator-attrId-custom');
          if (customInput) { customInput.style.display = ''; customInput.value = ''; customInput.focus(); }
        } else if (matchProp === 'attributeId') {
          m.attributeId = t.value;
          const row = t.closest('.creator-target-row');
          row?.querySelector('.creator-attrId-custom') && (row.querySelector('.creator-attrId-custom').style.display = 'none');
        } else if (matchProp === 'matchId') {
          if (t.value === '__custom__') {
            m.matchId = '';
            const adv = t.closest('.creator-target-adv');
            const ci2 = adv?.querySelector('input[data-match-prop="matchId-custom"]');
            if (ci2) { ci2.style.display = ''; ci2.value = ''; ci2.focus(); }
          } else {
            m.matchId = t.value;
            const adv = t.closest('.creator-target-adv');
            const ci2 = adv?.querySelector('input[data-match-prop="matchId-custom"]');
            if (ci2) ci2.style.display = 'none';
          }
        } else if (matchProp === 'dataType') {
          const prevVT = m.valueType || 'simple';
          if (t.value === '__custom__') {
            m.dataType = '';
            const adv = t.closest('.creator-target-adv');
            const ci2 = adv?.querySelector('input[data-match-prop="dataType-custom"]');
            if (ci2) { ci2.style.display = ''; ci2.value = ''; ci2.focus(); }
          } else {
            m.dataType = t.value;
            if (t.value === 'urn:hl7-org:v3#CV' || t.value === 'urn:hl7-org:v3#CE')  m.valueType = 'cv';
            else if (t.value === 'urn:hl7-org:v3#II')  m.valueType = 'ii';
            else if (t.value !== '')                    m.valueType = 'simple';
            const adv = t.closest('.creator-target-adv');
            const ci2 = adv?.querySelector('input[data-match-prop="dataType-custom"]');
            if (ci2) ci2.style.display = 'none';
            if (m.valueType !== prevVT) {
              _saveState(); _schedulePreview();
              _reRenderTargetSection(scope, rIdx, piIdx);
              return;
            }
          }
        } else if (matchProp === 'cat') {
          m.cat = t.value;
          m.attributeId = ATTR_ID_OPTIONS[t.value][0].value;
          const row = t.closest('.creator-target-row');
          if (row) {
            const attrSel = row.querySelector('.creator-attrId-select');
            if (attrSel) {
              attrSel.innerHTML = ATTR_ID_OPTIONS[t.value].map((o, oi) =>
                `<option value="${esc(o.value)}"${oi === 0 ? ' selected' : ''}>${esc(I18n.t(o.labelKey))}</option>`
              ).join('') + `<option value="__custom__">${esc(I18n.t('creator.target.attrId.custom'))}</option>`;
            }
            const customInput = row.querySelector('.creator-attrId-custom');
            if (customInput) { customInput.style.display = 'none'; customInput.value = ''; }
            const valInput = row.querySelector('input[data-match-prop="value"]');
            if (valInput) valInput.placeholder = I18n.t(`creator.target.value.ph.${t.value}`);
          }
        } else {
          m[matchProp] = t.value;
        }
        _saveState(); _schedulePreview();
      }
    }
  }

  // ── Rule Management ────────────────────────────────────────────────────

  function _addRule() {
    const n = _state.policy.rules.length + 1;
    _state.policy.rules.push({ id: `rule-${n}`, effect: 'Permit', description: '', target: _defaultTarget(), conditions: [], conditionOp: 'AND' });
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

  function _cmHeight() {
    // Match the visual preview height: viewport minus header (52px), tab bar (46px), preview header (~52px), padding
    return Math.max(300, window.innerHeight - 200);
  }

  function _saveAccState(vizDiv) {
    vizDiv.querySelectorAll('.acc-panel').forEach((panel, pi) => {
      const accBody = panel.querySelector('.acc-body');
      if (accBody && !accBody.classList.contains('open')) {
        _accState.closedPolicies.add(pi);
      } else {
        _accState.closedPolicies.delete(pi);
      }
      const openRules = new Set();
      panel.querySelectorAll('.rule-card').forEach((card, ri) => {
        if (card.querySelector('.rule-body')?.classList.contains('open')) openRules.add(ri);
      });
      _accState.openRules.set(pi, openRules);
    });
  }

  function _restoreAccState(vizDiv) {
    vizDiv.querySelectorAll('.acc-panel').forEach((panel, pi) => {
      if (_accState.closedPolicies.has(pi)) {
        panel.querySelector('.acc-body')?.classList.remove('open');
        panel.querySelector('.acc-hdr')?.classList.remove('is-open');
      }
      const openRules = _accState.openRules.get(pi) || new Set();
      panel.querySelectorAll('.rule-card').forEach((card, ri) => {
        if (!openRules.has(ri)) return;
        card.querySelector('.rule-body')?.classList.add('open');
        card.querySelector('.rule-toggle')?.classList.add('open');
        card.querySelector('.rule-hdr')?.setAttribute('aria-expanded', 'true');
      });
    });
  }

  function _updatePreview() {
    const xml    = _generateXml();
    const xmlPre = document.getElementById('creator-xml-pre');
    const vizDiv = document.getElementById('creator-visual-pre');
    if (!xmlPre || !vizDiv) return;

    if (_previewMode === 'xml') {
      vizDiv.style.display = 'none';
      xmlPre.style.display = '';
      // Lazy-init a read-only CodeMirror instance
      if (!_xmlCm && window.CodeMirror) {
        _xmlCm = window.CodeMirror(xmlPre, {
          mode: 'xml', lineNumbers: true, readOnly: true,
          lineWrapping: false, theme: 'default', tabSize: 2,
          extraKeys: {},
        });
      }
      if (_xmlCm) {
        _xmlCm.setValue(xml);
        // Use container width explicitly so CodeMirror doesn't expand beyond its column
        const w = xmlPre.parentElement?.clientWidth || '100%';
        _xmlCm.setSize(w || '100%', _cmHeight());
        _xmlCm.refresh();
      } else {
        xmlPre.textContent = xml;
      }
    } else {
      xmlPre.style.display = 'none';
      _saveAccState(vizDiv);
      vizDiv.style.display = '';
      try {
        const policy = XACMLParser.parse(xml, 'preview');
        vizDiv.innerHTML = window.TreeRenderer ? window.TreeRenderer.render(policy) : `<pre>${esc(xml)}</pre>`;
      } catch {
        vizDiv.innerHTML = `<pre style="padding:1rem;font-size:.8rem">${esc(xml)}</pre>`;
        return;
      }
      _restoreAccState(vizDiv);
    }
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

  function _rootId() {
    return _state.rootType === 'PolicySet'
      ? (_state.policySet.id || 'neue-policyset')
      : (_state.policy.id || 'neue-policy');
  }

  function _loadIntoVisualizer() {
    const xml  = _generateXml();
    const name = `creator-${_rootId()}.xml`;
    if (window.App && window.App.loadCreatorXml) {
      window.App.loadCreatorXml(xml, name);
    }
  }

  function _openInEditor() {
    const xml  = _generateXml();
    const name = `creator-${_rootId()}.xml`;
    if (window.App && window.App.loadCreatorXmlIntoEditor) {
      window.App.loadCreatorXmlIntoEditor(xml, name);
    }
  }

  function _download() {
    const xml  = _generateXml();
    const ts   = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const name = `xacml-${_rootId()}_${ts}.xml`;
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

  // ── PolicySet Management ────────────────────────────────────────────────

  function _psAddPolicy() {
    const n = _state.policySet.policies.length + 1;
    _state.policySet.policies.push(_defaultPsPolicy());
    _state.policySet.policies[n - 1].id = `embedded-policy-${n}`;
    _state.policySet.policies[n - 1].version = _state.policySet.version;
    _saveState();
    _psReRenderPolicies();
    _schedulePreview();
    _updateNextBtn();
  }

  function _psDeletePolicy(pi) {
    _state.policySet.policies.splice(pi, 1);
    // Shift collapsed indices: remove deleted, decrement those above it
    _psPolicyCollapsed.delete(pi);
    for (const idx of [..._psPolicyCollapsed]) {
      if (idx > pi) { _psPolicyCollapsed.delete(idx); _psPolicyCollapsed.add(idx - 1); }
    }
    _saveState();
    _psReRenderPolicies();
    _schedulePreview();
    _updateNextBtn();
  }

  function _psTogglePolicy(pi) {
    const card = document.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${pi}"]`);
    if (!card) return;
    const body = card.querySelector('.creator-ps-policy-body');
    const hdr  = card.querySelector('.creator-ps-policy-hdr');
    const icon = card.querySelector('.creator-ps-toggle');
    const isOpen = !body?.classList.contains('closed');
    body?.classList.toggle('closed', isOpen);
    if (isOpen) _psPolicyCollapsed.add(pi); else _psPolicyCollapsed.delete(pi);
    if (icon) icon.innerHTML = isOpen ? '&#x25B6;' : '&#x25BC;';
    if (hdr)  hdr.setAttribute('aria-expanded', String(!isOpen));
  }

  function _psAddRule(pi) {
    const policy = _state.policySet.policies[pi];
    if (!policy) return;
    const n = policy.rules.length + 1;
    policy.rules.push({ id: `rule-${n}`, effect: 'Permit', description: '', target: _defaultTarget(), conditions: [], conditionOp: 'AND' });
    _saveState();
    _psReRenderRules(pi);
    _schedulePreview();
    _updateNextBtn();
  }

  function _psDeleteRule(pi, ri) {
    const policy = _state.policySet.policies[pi];
    if (!policy) return;
    policy.rules.splice(ri, 1);
    _saveState();
    _psReRenderRules(pi);
    _schedulePreview();
    _updateNextBtn();
  }

  function _psReRenderRules(pi) {
    const container = document.querySelector(`.creator-ps-rules-list[data-ps-policy-idx="${pi}"]`);
    if (!container) return;
    const policy = _state.policySet.policies[pi];
    if (!policy) return;
    container.innerHTML = policy.rules.length === 0
      ? `<div class="creator-empty-rules">${esc(I18n.t('creator.rules.empty'))}</div>`
      : policy.rules.map((r, ri) => _psRuleCardHtml(r, ri, pi)).join('');
  }

  function _psReRenderPolicies() {
    const list = document.getElementById('creator-ps-policies-list');
    if (!list) return;
    const policies = _state.policySet.policies;
    list.innerHTML = policies.length === 0
      ? `<div class="creator-empty-rules">${esc(I18n.t('creator.ps.policy.empty'))}</div>`
      : policies.map((p, pi) => _psPolicyCardHtml(p, pi)).join('');
    // Restore collapsed state
    _psPolicyCollapsed.forEach(pi => {
      const card = list.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${pi}"]`);
      if (!card) return;
      card.querySelector('.creator-ps-policy-body')?.classList.add('closed');
      const icon = card.querySelector('.creator-ps-toggle');
      if (icon) icon.innerHTML = '&#x25B6;';
      const hdr = card.querySelector('.creator-ps-policy-hdr');
      if (hdr) hdr.setAttribute('aria-expanded', 'false');
    });
  }

  function _psGenerateUuid() {
    const uuid = _makeUuid();
    _state.policySet.id = uuid;
    _saveState();
    const input = document.getElementById('f-ps-id');
    if (input) input.value = uuid;
    _schedulePreview();
    _updateNextBtn();
  }

  function _psGeneratePolicyUuid(pi) {
    const policy = _state.policySet.policies[pi];
    if (!policy) return;
    const uuid = _makeUuid();
    policy.id = uuid;
    _saveState();
    const input = document.getElementById(`f-ps-policy-id-${pi}`);
    if (input) input.value = uuid;
    const card = document.querySelector(`.creator-ps-policy-card[data-ps-policy-idx="${pi}"]`);
    if (card) {
      const preview = card.querySelector('.creator-ps-policy-id-preview');
      if (preview) preview.textContent = uuid;
    }
    _schedulePreview();
    _updateNextBtn();
  }

  function _psGenerateRuleUuid(pi, ri) {
    const policy = _state.policySet.policies[pi];
    if (!policy?.rules[ri]) return;
    const uuid = _makeUuid();
    policy.rules[ri].id = uuid;
    _saveState();
    const input = document.getElementById(`f-ps-rule-id-${pi}-${ri}`);
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
