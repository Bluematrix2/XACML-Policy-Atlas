'use strict';

// ================================================================
//  UTILS
// ================================================================

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isLightColor(hex) {
  try {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 155;
  } catch (e) {
    return false;
  }
}

function lastSegment(uri) {
  return (uri || '').split(/[:/]/).filter(Boolean).pop() || uri;
}

function childrenByName(el, localName) {
  const result = [];
  if (!el) return result;
  for (const child of el.children) {
    if (child.localName === localName) result.push(child);
  }
  return result;
}

function childByName(el, localName) {
  if (!el) return null;
  for (const child of el.children) {
    if (child.localName === localName) return child;
  }
  return null;
}

function descendantByName(el, localName) {
  if (!el) return null;
  for (const child of el.children) {
    if (child.localName === localName) return child;
    const found = descendantByName(child, localName);
    if (found) return found;
  }
  return null;
}

// ================================================================
//  XACML PARSER
// ================================================================

const XACMLParser = (() => {

  function parseAttributeValue(avEl) {
    if (!avEl) return { dataType: 'string', value: '' };
    const dataType = avEl.getAttribute('DataType') || '';

    if (dataType.includes('CV')) {
      const cv = descendantByName(avEl, 'CodedValue');
      if (cv) {
        return {
          dataType: 'CV',
          code: cv.getAttribute('code') || '',
          codeSystem: cv.getAttribute('codeSystem') || ''
        };
      }
    }

    if (dataType.includes('II')) {
      const ii = descendantByName(avEl, 'InstanceIdentifier');
      if (ii) {
        const root = ii.getAttribute('root') || '';
        return { dataType: 'II', root, isWildcard: root === '*' };
      }
    }

    return {
      dataType: dataType.includes('anyURI') ? 'anyURI' : 'string',
      value: (avEl.textContent || '').trim()
    };
  }

  function parseDesignator(el) {
    if (!el) return { attributeId: '', dataType: '' };
    return {
      attributeId: el.getAttribute('AttributeId') || '',
      dataType:    el.getAttribute('DataType') || ''
    };
  }

  function parseMatch(matchEl) {
    const matchId = matchEl.getAttribute('MatchId') || '';
    const avEl    = childByName(matchEl, 'AttributeValue');
    const value   = parseAttributeValue(avEl);

    let designator = { attributeId: '', dataType: '' };
    for (const child of matchEl.children) {
      const ln = child.localName;
      if (ln === 'SubjectAttributeDesignator' ||
          ln === 'ResourceAttributeDesignator' ||
          ln === 'ActionAttributeDesignator' ||
          ln === 'AttributeDesignator') {
        designator = parseDesignator(child);
        break;
      }
    }

    return { matchId, value, designator };
  }

  function parseMatchGroup(containerEl, matchLocalName) {
    return childrenByName(containerEl, matchLocalName).map(parseMatch);
  }

  function parseTarget(targetEl) {
    if (!targetEl) return null;
    const result = { subjects: [], resources: [], actions: [] };

    const subjectsEl  = childByName(targetEl, 'Subjects');
    const resourcesEl = childByName(targetEl, 'Resources');
    const actionsEl   = childByName(targetEl, 'Actions');

    if (subjectsEl) {
      result.subjects = childrenByName(subjectsEl, 'Subject')
        .map(s => parseMatchGroup(s, 'SubjectMatch'));
    }
    if (resourcesEl) {
      result.resources = childrenByName(resourcesEl, 'Resource')
        .map(r => parseMatchGroup(r, 'ResourceMatch'));
    }
    if (actionsEl) {
      result.actions = childrenByName(actionsEl, 'Action')
        .map(a => parseMatchGroup(a, 'ActionMatch'));
    }

    if (!subjectsEl && !resourcesEl && !actionsEl) {
      for (const anyOf of childrenByName(targetEl, 'AnyOf')) {
        for (const allOf of childrenByName(anyOf, 'AllOf')) {
          for (const matchEl of childrenByName(allOf, 'Match')) {
            const m = parseMatch(matchEl);
            let designatorLocalName = '';
            let category = '';
            for (const child of matchEl.children) {
              if (child.localName.includes('Designator')) {
                designatorLocalName = child.localName;
                category = child.getAttribute('Category') || '';
                break;
              }
            }
            // XACML 2.0: named designators carry the category in their element name
            if (designatorLocalName.includes('Subject'))        result.subjects.push([m]);
            else if (designatorLocalName.includes('Resource'))  result.resources.push([m]);
            else if (designatorLocalName.includes('Action'))    result.actions.push([m]);
            // XACML 3.0: generic AttributeDesignator — category is in the Category attribute
            else if (category.includes('subject'))   result.subjects.push([m]);
            else if (category.includes('resource'))  result.resources.push([m]);
            else if (category.includes('action'))    result.actions.push([m]);
            // environment category: store separately if present
            else if (category.includes('environment')) {
              result.environments = result.environments || [];
              result.environments.push([m]);
            }
          }
        }
      }
    }

    return result;
  }

  function parseApply(applyEl) {
    const functionId = applyEl.getAttribute('FunctionId') || '';
    const args = [];
    for (const child of applyEl.children) {
      const ln = child.localName;
      if (ln === 'Apply') {
        args.push({ nodeType: 'Apply', ...parseApply(child) });
      } else if (ln === 'Function') {
        args.push({ nodeType: 'Function', functionId: child.getAttribute('FunctionId') || '' });
      } else if (ln === 'SubjectAttributeDesignator') {
        args.push({ nodeType: 'SubjectAttr', ...parseDesignator(child) });
      } else if (ln === 'ResourceAttributeDesignator') {
        args.push({ nodeType: 'ResourceAttr', ...parseDesignator(child) });
      } else if (ln === 'ActionAttributeDesignator') {
        args.push({ nodeType: 'ActionAttr', ...parseDesignator(child) });
      } else if (ln === 'AttributeDesignator') {
        // XACML 3.0 generic designator — map to nodeType via Category attribute
        const category = child.getAttribute('Category') || '';
        if (category.includes('subject'))        args.push({ nodeType: 'SubjectAttr',   ...parseDesignator(child) });
        else if (category.includes('resource'))  args.push({ nodeType: 'ResourceAttr',  ...parseDesignator(child) });
        else if (category.includes('action'))    args.push({ nodeType: 'ActionAttr',    ...parseDesignator(child) });
        else if (category.includes('environment')) args.push({ nodeType: 'EnvAttr',     ...parseDesignator(child) });
        else                                     args.push({ nodeType: 'Attr',           ...parseDesignator(child) });
      } else if (ln === 'AttributeValue') {
        args.push({ nodeType: 'Value', ...parseAttributeValue(child) });
      }
    }
    return { functionId, args };
  }

  function parseCondition(condEl) {
    if (!condEl) return null;
    const applyEl = childByName(condEl, 'Apply');
    if (!applyEl) return null;
    return parseApply(applyEl);
  }

  function parseRule(ruleEl) {
    const ruleId      = ruleEl.getAttribute('RuleId') || '';
    const effect      = ruleEl.getAttribute('Effect') || 'Permit';
    const descEl      = childByName(ruleEl, 'Description');
    const description = descEl ? (descEl.textContent || '').trim() : '';
    const target      = parseTarget(childByName(ruleEl, 'Target'));
    const condition   = parseCondition(childByName(ruleEl, 'Condition'));
    return { ruleId, effect, description, target, condition };
  }

  // Parse a single <Policy> child element (used by PolicySet handling)
  function parsePolicyEl(policyEl) {
    const policyId    = policyEl.getAttribute('PolicyId') || '';
    const algorithm   = policyEl.getAttribute('RuleCombiningAlgId') || '';
    const descEl      = childByName(policyEl, 'Description');
    const description = descEl ? (descEl.textContent || '').trim() : '';
    const target      = parseTarget(childByName(policyEl, 'Target'));
    const rules       = childrenByName(policyEl, 'Rule').map(parseRule);
    return { policyId, algorithm, description, target, rules };
  }

  function parse(xmlText, filename) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) throw new Error(err.textContent.split('\n')[0]);
    } catch (e) {
      throw new Error('XML Parse-Fehler: ' + e.message);
    }

    const root     = doc.documentElement;
    const rootName = root.localName;
    if (rootName !== 'Policy' && rootName !== 'PolicySet') {
      throw new Error(`Kein <Policy>- oder <PolicySet>-Element gefunden (gefunden: <${rootName}>)`);
    }

    const ns          = root.namespaceURI || '';
    const version     = ns.includes('2.0') ? '2.0' : '3.0';
    const descEl      = childByName(root, 'Description');
    const description = descEl ? (descEl.textContent || '').trim() : '';
    const target      = parseTarget(childByName(root, 'Target'));

    if (rootName === 'PolicySet') {
      const policyId  = root.getAttribute('PolicySetId') || filename;
      const algorithm = root.getAttribute('PolicyCombiningAlgId') || '';
      const policies  = childrenByName(root, 'Policy').map(parsePolicyEl);
      return { policyId, filename, version, algorithm, description, target, rootElement: 'PolicySet', policies, rules: [] };
    }

    // rootName === 'Policy'
    const policyId  = root.getAttribute('PolicyId') || filename;
    const algorithm = root.getAttribute('RuleCombiningAlgId') || '';
    const rules     = childrenByName(root, 'Rule').map(parseRule);
    return { policyId, filename, version, algorithm, description, target, rootElement: 'Policy', rules };
  }

  return { parse };
})();

export { esc, isLightColor, lastSegment, childrenByName, childByName, descendantByName, XACMLParser };
