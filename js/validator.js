'use strict';

// ================================================================
//  XACML VALIDATOR
// ================================================================

const XACMLValidator = (() => {

  function validate(xmlText, filename) {
    const errors   = [];
    const warnings = [];
    const info     = { filename };

    // 1. Well-formed XML
    let doc;
    try {
      doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const pe = doc.querySelector('parsererror');
      if (pe) {
        errors.push('Kein valides XML: ' + (pe.textContent || '').split('\n')[0].slice(0, 120));
        return { errors, warnings, info };
      }
    } catch (e) {
      errors.push('XML-Parse-Fehler: ' + e.message);
      return { errors, warnings, info };
    }

    const root = doc.documentElement;

    // 2. XACML Namespace
    const ns = root.namespaceURI || '';
    if (ns.includes('2.0')) {
      info.version = '2.0';
    } else if (ns.includes('3.0')) {
      info.version = '3.0';
    } else {
      errors.push('Kein XACML-Namespace erkannt (erwartet: urn:oasis:names:tc:xacml:2.0 oder 3.0)');
    }

    // 3. Root element
    const rootName = root.localName;
    if (rootName === 'Policy' || rootName === 'PolicySet') {
      info.rootElement = rootName;
      info.policyId    = root.getAttribute('PolicyId') || '(keine ID)';
    } else {
      errors.push(`Wurzelelement ist <${rootName}>, erwartet <Policy> oder <PolicySet>`);
    }

    // 4. CombiningAlgId on Policy/PolicySet
    const allEls = Array.from(doc.getElementsByTagName('*'));
    const policyEls = allEls.filter(e => e.localName === 'Policy' || e.localName === 'PolicySet');
    for (const p of policyEls) {
      const alg = p.getAttribute('RuleCombiningAlgId') || p.getAttribute('PolicyCombiningAlgId');
      if (!alg) {
        const pid = p.getAttribute('PolicyId') || '(unbekannt)';
        errors.push(`Policy "${pid.split(':').pop()}" hat kein CombiningAlgId`);
      }
    }

    // 5. Rules have Effect (Permit/Deny)
    const ruleEls = allEls.filter(e => e.localName === 'Rule');
    info.ruleCount   = ruleEls.length;
    info.permitCount = 0;
    info.denyCount   = 0;
    for (const r of ruleEls) {
      const effect = r.getAttribute('Effect') || '';
      if (effect === 'Permit') { info.permitCount++; }
      else if (effect === 'Deny') { info.denyCount++; }
      else {
        const rid = (r.getAttribute('RuleId') || '').split(':').pop() || '(unbekannt)';
        errors.push(`Rule "${rid}" hat kein gültiges Effect-Attribut (Permit/Deny)`);
      }
    }

    // 6. Rules without Description (warning)
    let noDescCount = 0;
    for (const r of ruleEls) {
      const hasDesc = Array.from(r.children).some(c => c.localName === 'Description');
      if (!hasDesc) {
        const rid = (r.getAttribute('RuleId') || '').split(':').pop().slice(-16) || '(unbekannt)';
        warnings.push(`Rule "${rid}" hat keine Description`);
        noDescCount++;
      }
    }

    // 7. AttributeDesignator: AttributeId + DataType
    let badDesig = 0;
    for (const el of allEls) {
      if (el.localName.includes('Designator')) {
        if (!el.getAttribute('AttributeId') || !el.getAttribute('DataType')) {
          errors.push(`${el.localName} ohne AttributeId oder DataType`);
          if (++badDesig >= 3) break;
        }
      }
    }

    // Collect PolicyIds for overview
    info.policyIds = policyEls.map(p => p.getAttribute('PolicyId')).filter(Boolean);

    return { errors, warnings, info };
  }

  return { validate };
})();

export { XACMLValidator };
