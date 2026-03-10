'use strict';

// ================================================================
//  TREE RENDERER
// ================================================================

import { esc, isLightColor, lastSegment } from './parser.js';
import { LabelMapper, EnforcementMapper } from './mappers.js';

const TreeRenderer = (() => {
  const FALLBACK_COLOR = '#607D8B';
  const FHIR_VERSION   = 'R4';
  // FHIR resource-type attributeId
  const FHIR_ATTR_ID   = 'http://hl7.org/fhir/resource-types';

  // ── Logic chips ──

  function oderChip() {
    return `<span class="logic-chip oder">ODER (or)`
         + `<span class="tooltip" style="min-width:210px">Eine dieser Bedingungen muss zutreffen</span>`
         + `</span>`;
  }

  function undChip() {
    return `<span class="logic-chip und">UND (and)`
         + `<span class="tooltip" style="min-width:210px">Alle Bedingungen m&uuml;ssen gleichzeitig zutreffen</span>`
         + `</span>`;
  }

  // ── Chip rendering ──

  function chipHtml(label, description, uri, color, prefix, attrHint) {
    const bg = color || FALLBACK_COLOR;
    const fg = isLightColor(bg) ? '#212121' : '#ffffff';
    const tooltipParts = [];
    if (attrHint)    tooltipParts.push(`<span class="tooltip-attr">${attrHint}</span>`);
    if (description) tooltipParts.push(esc(description));
    if (uri)         tooltipParts.push(`<span class="tooltip-uri">${esc(uri)}</span>`);
    const tooltip = tooltipParts.length
      ? `<span class="tooltip">${tooltipParts.join('<br>')}</span>` : '';
    return `<span class="chip" style="background:${bg};color:${fg};border-color:${bg}">`
         + (prefix || '')
         + esc(label)
         + tooltip
         + `</span>`;
  }

  function fallbackChip(uri, attrHint) {
    const parts = [];
    if (attrHint) parts.push(`<span class="tooltip-attr">${attrHint}</span>`);
    if (LabelMapper.isLoaded()) parts.push(`Kein Label im Mapping gefunden`);
    parts.push(`<span class="tooltip-uri">${esc(uri)}</span>`);
    return `<span class="chip fallback">${esc(uri)}<span class="tooltip">${parts.join('<br>')}</span></span>`;
  }

  // Returns chip HTML + optional FHIR link for a match value
  function valueChip(matchValue, attributeId, attrHint) {
    const { dataType, value, code, codeSystem, root, isWildcard } = matchValue;
    const isFhir = attributeId === FHIR_ATTR_ID;

    if (dataType === 'CV') {
      const e = LabelMapper.lookupCV(code, codeSystem);
      if (e) return chipHtml(e.label, e.description, `${code}@${codeSystem}`, e.color, null, attrHint);
      return chipHtml(code, `CodeSystem: ${codeSystem}`, `${code}@${codeSystem}`, FALLBACK_COLOR, null, attrHint);
    }

    if (dataType === 'II') {
      if (isWildcard) {
        const wParts = [];
        if (attrHint) wParts.push(`<span class="tooltip-attr">${attrHint}</span>`);
        wParts.push(`Wildcard-Policy: Gilt automatisch f&uuml;r alle Patientenakten`);
        wParts.push(`<span class="tooltip-uri">root=&apos;*&apos;</span>`);
        return `<span class="chip" style="background:#fff8e1;color:#f57f17;border-color:#ffe082">`
             + `<span class="star">&#x2B50;</span>Alle Patienten (Wildcard)`
             + `<span class="tooltip">${wParts.join('<br>')}</span></span>`;
      }
      return chipHtml(root || 'II', '', root, '#795548', null, attrHint);
    }

    // string / anyURI
    const v = (value || '').trim();
    const e = LabelMapper.lookup(v);

    if (isFhir) {
      const enfData = EnforcementMapper.isLoaded() ? EnforcementMapper.lookup(v) : null;
      let chipColor = e ? (e.color || '#1565c0') : '#1565c0';
      if (enfData) {
        const ac = enfData.primaryControl;
        if (ac === 'public') chipColor = '#9E9E9E';
        else if (ac.endsWith('*')) chipColor = '#E65100';
        else chipColor = '#7B1FA2';
      }
      const label = e ? e.label : v;
      const desc  = e ? (e.description || '') : '';
      const bg = chipColor;
      const fg = isLightColor(bg) ? '#212121' : '#ffffff';
      const tooltipParts = [];
      if (attrHint) tooltipParts.push(`<span class="tooltip-attr">${attrHint}</span>`);
      if (desc)     tooltipParts.push(esc(desc));
      tooltipParts.push(`<span class="tooltip-uri">${esc(v)}</span>`);
      tooltipParts.push(`<span class="tooltip-uri" style="color:#80cbc4">&#x1F517; FHIR ${FHIR_VERSION} Spezifikation</span>`);
      const tooltip = `<span class="tooltip">${tooltipParts.join('<br>')}</span>`;
      const href = `https://hl7.org/fhir/${esc(v.toLowerCase())}.html`;
      const chip = `<a class="chip fhir-chip" href="${href}" target="_blank" rel="noopener"`
                 + ` style="background:${bg};color:${fg};border-color:${bg}">`
                 + esc(label) + tooltip + `</a>`;
      const info = enfData
        ? `<span class="enf-info-btn" title="Enforcement-Details: ${esc(v)}" onclick="event.stopPropagation();App.openEnfPanel(${JSON.stringify(v)})">&#x2139;&#xFE0F;</span>`
        : '';
      return chip + info;
    }

    if (e) return chipHtml(e.label, e.description, v, e.color, null, attrHint);
    return fallbackChip(v, attrHint);
  }

  // Returns plain text label for a matchValue (for summary box)
  function getValueLabel(matchValue) {
    const { dataType, value, code, codeSystem, root } = matchValue;
    if (dataType === 'CV') {
      const e = LabelMapper.lookupCV(code, codeSystem);
      return e ? e.label : code;
    }
    if (dataType === 'II') return root || 'II';
    const v = (value || '').trim();
    const e = LabelMapper.lookup(v);
    return e ? e.label : lastSegment(v);
  }

  // ── Match group rendering (outer=ODER, inner=UND) ──

  function renderMatchGroups(groups, groupLabel, showRawValue = false) {
    if (!groups || groups.length === 0) return '';

    const groupsHtml = groups.map(group => {
      if (!group || group.length === 0) return '';

      const parts = group.map(match => {
        const attrId    = match.designator ? match.designator.attributeId : '';
        const attrEntry = attrId ? LabelMapper.lookup(attrId) : null;
        const attrLabel = attrEntry ? attrEntry.label : (attrId ? lastSegment(attrId) : '');
        const attrDesc  = attrEntry ? (attrEntry.description || '') : '';
        const attrHint  = attrId
          ? `${attrDesc ? esc(attrDesc) + '<br>' : ''}${esc(attrLabel)} &mdash; <span class="tooltip-uri">${esc(attrId)}</span>`
          : '';
        let hint = attrHint;
        if (showRawValue) {
          const raw = (match.value.value || '').trim();
          if (raw) {
            const rawLine = `<span class="tooltip-raw-value">AttributeValue &mdash; <span class="tooltip-uri">${esc(raw)}</span></span>`;
            hint = rawLine + (hint ? '<br>' + hint : '');
          }
        }
        return valueChip(match.value, attrId, hint);
      });

      return parts.join(undChip());
    });

    const combined = groupsHtml
      .filter(Boolean)
      .map(g => `<span class="or-group">${g}</span>`)
      .join(oderChip());

    return `<div class="match-group">`
         + `<div class="mg-label">${groupLabel}</div>`
         + `<div class="mg-items">${combined}</div>`
         + `</div>`;
  }

  // ── Condition rendering ──

  function condNode(node) {
    if (!node) return '';
    switch (node.nodeType) {
      case 'Apply':   return condApply(node);
      case 'Function': {
        const e = LabelMapper.lookup(node.functionId);
        const label = e ? e.label : lastSegment(node.functionId);
        return `<em>${esc(label)}</em>`;
      }
      case 'SubjectAttr': {
        const e = LabelMapper.lookup(node.attributeId);
        return `<span class="cond-subj">${esc(e ? e.label : lastSegment(node.attributeId))}</span>`;
      }
      case 'ResourceAttr': {
        const e = LabelMapper.lookup(node.attributeId);
        return `<span class="cond-res">${esc(e ? e.label : lastSegment(node.attributeId))}</span>`;
      }
      case 'ActionAttr': {
        const e = LabelMapper.lookup(node.attributeId);
        return `<span class="cond-act">${esc(e ? e.label : lastSegment(node.attributeId))}</span>`;
      }
      case 'Value': {
        if (node.dataType === 'CV')  return `<span class="cond-val">${esc(node.code)}@${esc(node.codeSystem)}</span>`;
        if (node.dataType === 'II')  return `<span class="cond-val">${node.isWildcard ? '*' : esc(node.root)}</span>`;
        return `<span class="cond-val">${esc((node.value || '').trim())}</span>`;
      }
      default: return '';
    }
  }

  function condApply(apply) {
    const fn = apply.functionId || '';

    if (fn.includes(':not')) {
      const inner = apply.args[0] ? condNode(apply.args[0]) : '';
      return `<span class="cond-not">&#x26D4; NICHT</span>(${inner})`;
    }

    if (fn.includes('any-of-any')) {
      // Render as readable: [left attr] entspricht [right attr]
      const attrArgs = apply.args.filter(a => a.nodeType !== 'Function');
      if (attrArgs.length === 2) {
        return `${condNode(attrArgs[0])} <em style="color:#9e9e9e">entspricht</em> ${condNode(attrArgs[1])}`;
      }
      const argStrs = apply.args.map(condNode).filter(Boolean);
      return `<span class="cond-fn">${esc(lastSegment(fn))}</span>(${argStrs.join(', ')})`;
    }

    const e = LabelMapper.lookup(fn);
    const fnLabel = e ? e.label : lastSegment(fn);
    const argStrs = apply.args.map(condNode).filter(Boolean);
    return `<span class="cond-fn">${esc(fnLabel)}</span>(${argStrs.join(', ')})`;
  }

  function renderCondition(cond, effect) {
    if (!cond) return '';

    const isDeny    = effect === 'Deny';
    const impactCls = isDeny ? 'deny' : 'permit';
    const impactIco = isDeny ? '&#x274C;' : '&#x2705;';
    const impactLbl = isDeny ? 'Deny' : 'Permit';

    // Detect top-level NOT (negated condition)
    const isNegated = cond.functionId && cond.functionId.includes(':not');
    const negHint   = isNegated
      ? ` <span style="font-size:11px;color:#757575;font-weight:400">&mdash; Bedingung ist negiert (NOT)</span>`
      : '';

    const impactHtml = `<div class="cond-impact ${impactCls}">`
                     + `${impactIco} Wenn WAHR &rarr; Regel wird angewendet (${impactLbl})`
                     + negHint
                     + `</div>`;

    const condHtml = condApply(cond);

    return `<div class="match-group">`
         + `<div class="mg-label">&#x1F50D; Bedingung</div>`
         + `<div class="condition-block">${impactHtml}${condHtml}</div>`
         + `</div>`;
  }

  // ── Target ──

  function renderTarget(target) {
    if (!target) return '';
    const { subjects = [], resources = [], actions = [] } = target;
    let html = '';
    if (subjects.length)  html += renderMatchGroups(subjects,  '&#x1F464; Wer (Subject)');
    if (resources.length) html += renderMatchGroups(resources, '&#x1F4E6; Ressourcen');
    if (actions.length)   html += renderMatchGroups(actions,   '&#x26A1; Action', true);
    return html;
  }

  // ── Algorithm chip ──

  function renderAlgo(algoUri) {
    const e = LabelMapper.lookup(algoUri);
    const label = e ? e.label : lastSegment(algoUri);
    const desc  = e ? e.description : '';
    const tip   = `${desc ? esc(desc) + '<br>' : ''}<span class="tooltip-uri">${esc(algoUri)}</span>`;
    return `<span class="algo-chip">&#x2699;&#xFE0F; ${esc(label)}`
         + `<span class="tooltip">${tip}</span></span>`;
  }

  // ── Summary box ──

  function renderSummaryBox(policy) {
    const permitCount = policy.rules.filter(r => r.effect !== 'Deny').length;
    const denyCount   = policy.rules.filter(r => r.effect === 'Deny').length;

    // Collect subjects/roles from policy target
    const subjectLabels = [];
    if (policy.target && policy.target.subjects) {
      for (const group of policy.target.subjects) {
        for (const match of group) {
          const label = getValueLabel(match.value);
          if (label && !subjectLabels.includes(label)) subjectLabels.push(label);
        }
      }
    }

    // Detect wildcard-policy
    const isStarPolicy = (policy.target && policy.target.resources || []).some(
      group => group.some(m => m.value && m.value.isWildcard)
    );

    // Collect FHIR resources and their access modes from rules
    const fhirResMap = new Map(); // type → Set<'read'|'write'>
    for (const rule of policy.rules) {
      if (!rule.target) continue;
      const actions = (rule.target.actions || []).flatMap(ag => ag.map(m => (m.value.value || '').toLowerCase()));
      const hasRead  = actions.some(a => a.includes('view') || a.includes('retrieve') || a.includes('query') || a.includes('response'));
      const hasWrite = actions.some(a =>
        a.includes('add-clinical') || a.includes('register') || a.includes('provide') ||
        a.includes('delete') || a.includes('update') || a.includes('remove')
      );
      for (const group of (rule.target.resources || [])) {
        for (const match of group) {
          if (match.designator && match.designator.attributeId === FHIR_ATTR_ID) {
            const type = (match.value.value || '').trim();
            if (!type) continue;
            if (!fhirResMap.has(type)) fhirResMap.set(type, new Set());
            if (hasRead)  fhirResMap.get(type).add('read');
            if (hasWrite) fhirResMap.get(type).add('write');
          }
        }
      }
    }

    let html = `<div class="summary-box">`;
    html += `<div class="summary-box-title">&#x1F4CA; Zusammenfassung</div>`;

    // Rule counts
    html += `<div class="summary-row">`;
    html += `<span class="summary-label">Regeln</span>`;
    html += `<span class="summary-chip" style="color:#2e7d32;border-color:#c8e6c9">&#x2705; ${permitCount}&nbsp;Permit</span>`;
    html += `<span class="summary-chip" style="color:#c62828;border-color:#ffcdd2">&#x274C; ${denyCount}&nbsp;Deny</span>`;
    html += `</div>`;

    // Subjects / roles
    if (subjectLabels.length > 0) {
      html += `<div class="summary-row">`;
      html += `<span class="summary-label">Zugang f&uuml;r</span>`;
      html += subjectLabels.map(l => `<span class="summary-chip">&#x1F464; ${esc(l)}</span>`).join('');
      html += `</div>`;
    }

    // FHIR resources
    if (fhirResMap.size > 0) {
      const entries = Array.from(fhirResMap.entries());
      const MAX_SHOW = 5;
      const visible = entries.slice(0, MAX_SHOW);
      const hidden  = entries.slice(MAX_SHOW);
      const togId   = 'smr_' + Math.random().toString(36).slice(2, 7);

      html += `<div class="summary-row">`;
      html += `<span class="summary-label">FHIR-Ressourcen</span>`;

      const renderResChip = ([type, modes]) => {
        const readOnly = !modes.has('write');
        const badge    = readOnly ? 'READ' : 'READ+WRITE';
        const bColor   = readOnly ? '#1565c0' : '#2e7d32';
        return `<span class="summary-chip">`
             + `<a class="fhir-link" href="https://hl7.org/fhir/${type.toLowerCase()}.html" target="_blank" rel="noopener" title="FHIR ${FHIR_VERSION}: ${esc(type)}">&#x1F517;</a>`
             + ` ${esc(type)}&nbsp;<span style="color:${bColor};font-size:10px;font-weight:700">${badge}</span>`
             + `</span>`;
      };

      html += visible.map(renderResChip).join('');

      if (hidden.length > 0) {
        html += `<span class="summary-chip summary-chip--more" id="${togId}"`
              + ` onclick="document.querySelectorAll('.${togId}').forEach(e=>e.style.display='inline-flex');document.getElementById('${togId}').style.display='none'"`
              + `>+${hidden.length} weitere</span>`;
        html += hidden.map(e => {
          const chip = renderResChip(e);
          return chip.replace('class="summary-chip"', `class="summary-chip ${togId}" style="display:none"`);
        }).join('');
      }

      html += `</div>`;
    }

    // Enforcement count
    if (EnforcementMapper.isLoaded()) {
      html += `<div class="summary-row">`;
      html += `<span class="summary-label">Enforcement</span>`;
      html += `<span class="summary-chip" style="color:#7B1FA2;border-color:#ce93d8">&#x1F4CA; ${EnforcementMapper.getCount()} Ressourcen geladen</span>`;
      html += `</div>`;
    }

    if (isStarPolicy) {
      html += `<div class="star-hint">&#x2B50; Wildcard-Policy: Gilt automatisch f&uuml;r alle Patientenakten &mdash; kein Zustimmungsdokument erforderlich.</div>`;
    }

    html += `</div>`;
    return html;
  }

  // ── Rule ──

  function renderRule(rule, index) {
    const isDeny    = rule.effect === 'Deny';
    const cls       = isDeny ? 'deny' : 'permit';
    const badge     = isDeny ? 'DENY' : 'PERMIT';
    const titleText = rule.description
      ? esc(rule.description)
      : `<span class="rule-no-desc">Regel ${index + 1} (keine Beschreibung)</span>`;

    // Plain-text for search
    const searchText = (rule.description || `Regel ${index + 1}`).toLowerCase();

    let body = '';
    if (rule.target)    body += renderTarget(rule.target);
    if (rule.condition) {
      body += renderCondition(rule.condition, rule.effect);
    } else {
      body += `<div class="no-cond-hint">&#x2139;&#xFE0F; Keine Zusatzbedingung &mdash; Regel greift immer wenn Subject übereinstimmt</div>`;
    }

    const bodyId = `rb_${index}_${Math.random().toString(36).slice(2, 7)}`;

    return `<div class="rule-card ${cls}" data-effect="${cls}" data-search="${esc(searchText)}">`
         + `<div class="rule-hdr" onclick="TreeRenderer.toggleRule('${bodyId}',this)">`
         + `<span class="effect-badge">${badge}</span>`
         + `<span class="rule-title">${titleText}</span>`
         + (body ? `<span class="rule-toggle">&#x25B6;</span>` : '')
         + `</div>`
         + (body ? `<div class="rule-body" id="${bodyId}">${body}</div>` : '')
         + `</div>`;
  }

  // ── Full policy (accordion wrapper) ──

  function render(policy) {
    const permitCount = policy.rules.filter(r => r.effect !== 'Deny').length;
    const denyCount   = policy.rules.filter(r => r.effect === 'Deny').length;
    const shortId     = policy.policyId.split(':').pop();
    const bodyId      = 'accb_' + Math.random().toString(36).slice(2, 7);

    // Accordion header
    let html = `<div class="acc-panel">`;
    html += `<div class="acc-hdr is-open" onclick="TreeRenderer.toggleAccordion('${bodyId}',this)">`;
    html += `<span class="acc-hdr-icon">&#x1F4CB;</span>`;
    html += `<div class="acc-hdr-info">`;
    html += `<div class="acc-hdr-title">${esc(shortId)}</div>`;
    if (policy.description) {
      html += `<div class="acc-hdr-desc">${esc(policy.description)}</div>`;
    }
    html += `</div>`;
    html += `<div class="acc-hdr-badges">`;
    html += `<span style="color:#2e7d32;font-size:12px;font-weight:700">&#x2705;&nbsp;${permitCount}P</span>`;
    html += `<span style="color:#c62828;font-size:12px;font-weight:700">&#x274C;&nbsp;${denyCount}D</span>`;
    html += renderAlgo(policy.algorithm);
    html += `<span style="font-size:11px;color:#9e9e9e">XACML&nbsp;${policy.version}</span>`;
    html += `</div>`;
    html += `<span class="acc-chevron open">&#x25B6;</span>`;
    html += `</div>`; // acc-hdr

    // Accordion body
    html += `<div class="acc-body open" id="${bodyId}">`;
    html += `<div class="acc-inner"><div class="acc-inner-content">`;

    // Summary box
    html += renderSummaryBox(policy);

    // Policy-level target
    if (policy.target) {
      const t = policy.target;
      const hasContent = (t.subjects || []).length + (t.resources || []).length + (t.actions || []).length > 0;
      if (hasContent) {
        html += `<div class="policy-target">`;
        html += `<div class="section-label">&#x1F3AF; Policy-Target &mdash; gilt f&uuml;r alle Regeln</div>`;
        html += renderTarget(policy.target);
        html += `</div>`;
      }
    }

    // Expand/collapse buttons
    html += `<div class="policy-hdr-ctrl">`;
    html += `<button class="ctrl-btn" onclick="TreeRenderer.expandAll()">&#x25BC; Alle aufklappen</button>`;
    html += `<button class="ctrl-btn" onclick="TreeRenderer.collapseAll()">&#x25B6; Alle zuklappen</button>`;
    html += `</div>`;

    // Rules
    policy.rules.forEach((rule, i) => { html += renderRule(rule, i); });

    html += `</div></div></div>`; // acc-inner-content, acc-inner, acc-body
    html += `</div>`; // acc-panel

    return html;
  }

  // ── Public interaction ──

  function toggleAccordion(bodyId, hdrEl) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const open = body.classList.toggle('open');
    const chevron = hdrEl.querySelector('.acc-chevron');
    if (chevron) chevron.classList.toggle('open', open);
    hdrEl.classList.toggle('is-open', open);
  }

  function toggleRule(bodyId, headerEl) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const open = body.classList.toggle('open');
    const toggle = headerEl.querySelector('.rule-toggle');
    if (toggle) toggle.classList.toggle('open', open);
  }

  function expandAll() {
    document.querySelectorAll('.rule-body').forEach(b => b.classList.add('open'));
    document.querySelectorAll('.rule-toggle').forEach(t => t.classList.add('open'));
    document.querySelectorAll('.acc-body').forEach(b => b.classList.add('open'));
    document.querySelectorAll('.acc-chevron').forEach(c => c.classList.add('open'));
    document.querySelectorAll('.acc-hdr').forEach(h => h.classList.add('is-open'));
  }

  function collapseAll() {
    document.querySelectorAll('.rule-body').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.rule-toggle').forEach(t => t.classList.remove('open'));
    // Keep accordion panels visible so controls are accessible
  }

  return { render, toggleAccordion, toggleRule, expandAll, collapseAll };
})();

export { TreeRenderer };
