'use strict';

// ================================================================
//  CONSTANTS — Gemeinsame XACML-Konstanten
//  Wird von creator.js, node-editor.js und simulator.js importiert.
//  Änderungen hier wirken sich auf alle drei Module aus.
// ================================================================

// ── Combining Algorithms ──────────────────────────────────────────────────

// Erzeugt ein Combining-Alg-Array für 'rule' oder 'policy'.
// Einziger Unterschied zwischen den beiden Sets ist das mittlere URI-Segment.
function _makeCombiningAlgs(type) {
  const base = `urn:oasis:names:tc:xacml:1.0:${type}-combining-algorithm`;
  return [
    { labelKey: 'creator.alg.deny',   value: `${base}:deny-overrides` },
    { labelKey: 'creator.alg.permit', value: `${base}:permit-overrides` },
    { labelKey: 'creator.alg.first',  value: `${base}:first-applicable` },
    { labelKey: 'creator.alg.only',   value: `${base}:only-one-applicable` },
  ];
}

// Rule-Combining-Algorithmen — für <Policy RuleCombiningAlgId="...">
const RULE_COMBINING_ALGS = _makeCombiningAlgs('rule');

// Policy-Combining-Algorithmen — für <PolicySet PolicyCombiningAlgId="...">
const POLICY_COMBINING_ALGS = _makeCombiningAlgs('policy');

// ── Condition Functions ───────────────────────────────────────────────────
// XACML-Vergleichsfunktionen für <Condition>/<Apply FunctionId="...">
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

// ── Condition Categories ──────────────────────────────────────────────────
// label    = direkte Anzeige in creator.js
// labelKey = i18n-Schlüssel in node-editor.js (I18n.t(cat.labelKey))
const CONDITION_CATEGORIES = [
  { label: 'Subject (Access)', labelKey: 'ne.cond.cat.subject',     value: 'urn:oasis:names:tc:xacml:1.0:subject-category:access-subject' },
  { label: 'Resource',         labelKey: 'ne.cond.cat.resource',    value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:resource' },
  { label: 'Action',           labelKey: 'ne.cond.cat.action',      value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action' },
  { label: 'Environment',      labelKey: 'ne.cond.cat.environment', value: 'urn:oasis:names:tc:xacml:3.0:attribute-category:environment' },
];

// ── Condition Data Types ──────────────────────────────────────────────────
// Standard-XACML- und HL7-Datentypen für Condition-Argumente
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

// ── Match ID Options ──────────────────────────────────────────────────────
// XACML-Funktionen für Target-Match-Vergleiche (<SubjectMatch MatchId="...">)
const MATCH_ID_OPTIONS = [
  { label: 'string-equal',                          value: 'urn:oasis:names:tc:xacml:1.0:function:string-equal' },
  { label: 'anyURI-equal',                          value: 'urn:oasis:names:tc:xacml:1.0:function:anyURI-equal' },
  { label: 'integer-equal',                         value: 'urn:oasis:names:tc:xacml:1.0:function:integer-equal' },
  { label: 'date-equal',                            value: 'urn:oasis:names:tc:xacml:1.0:function:date-equal' },
  { label: 'CV-equal (HL7) – Coded Value',          value: 'urn:hl7-org:v3:function:CV-equal' },
  { label: 'II-equal (HL7) – Instance Identifier',  value: 'urn:hl7-org:v3:function:II-equal' },
];

// ── Match Data Type Options ───────────────────────────────────────────────
// Datentypen für AttributeValue-Elemente in Target-Matches
const MATCH_DATATYPE_OPTIONS = [
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

// ── Attribute ID Options per Category ────────────────────────────────────
// Gemeinsame AttributeId-Optionen für creator.js (ATTR_ID_OPTIONS)
// und simulator.js (SIM_ATTR_ID_OPTIONS). labelKey verweist auf i18n-Schlüssel.
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
  environment: [],
};

// ── Category-URI → Request-Key ────────────────────────────────────────────
// Konvertiert XACML-Category-URIs in einfache Request-Schlüssel.
// Beispiel: 'urn:oasis:names:tc:xacml:3.0:attribute-category:action' → 'action'
// Wird im Simulator und Node-Editor verwendet.
function condCatToKey(catUri) {
  if (!catUri) return 'subject';
  if (catUri.includes('access-subject') || catUri.includes(':subject:')) return 'subject';
  if (catUri.includes(':resource'))    return 'resource';
  if (catUri.includes(':action'))      return 'action';
  if (catUri.includes(':environment')) return 'environment';
  return 'subject';
}

export {
  RULE_COMBINING_ALGS,
  POLICY_COMBINING_ALGS,
  CONDITION_FUNCTIONS,
  CONDITION_CATEGORIES,
  CONDITION_DATA_TYPES,
  MATCH_ID_OPTIONS,
  MATCH_DATATYPE_OPTIONS,
  ATTR_ID_OPTIONS,
  condCatToKey,
};
