'use strict';

// ================================================================
//  CSV PARSER
// ================================================================

const CSVParser = (() => {

  function parse(csvText) {
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV ist leer');

    const headers = lines[0].split(';').map(h => h.trim());
    const idIdx    = headers.indexOf('id');
    const labelIdx = headers.indexOf('label');
    if (idIdx < 0 || labelIdx < 0) throw new Error('CSV muss "id" und "label" Spalten enthalten');

    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(';');
      const entry = {};
      headers.forEach((h, j) => { entry[h] = (cols[j] || '').trim(); });
      entries.push(entry);
    }
    return entries;
  }

  return { parse };
})();

// ================================================================
//  LABEL MAPPER
// ================================================================

const LabelMapper = (() => {
  let _byId = {};
  let _loaded = false;

  function load(entries) {
    _byId = {};
    for (const e of entries) {
      if (e.id) _byId[e.id] = e;
    }
    _loaded = true;
  }

  function lookup(id) {
    if (!id) return null;
    return _byId[id.trim()] || null;
  }

  function lookupCV(code, codeSystem) {
    return _byId[`${code}@${codeSystem}`] || null;
  }

  function isLoaded() { return _loaded; }
  function clear() { _byId = {}; _loaded = false; }

  return { load, lookup, lookupCV, isLoaded, clear };
})();

// ================================================================
//  ENFORCEMENT MAPPER
// ================================================================

const EnforcementMapper = (() => {
  let _data   = new Map(); // fhir_resource → { primaryControl, entries[] }
  let _count  = 0;
  let _loaded = false;

  function load(csvText) {
    // Strip UTF-8 BOM
    const text    = csvText.replace(/^\uFEFF/, '');
    const lines   = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Enforcement-CSV ist leer');
    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    const col = name => headers.indexOf(name);
    const resIdx   = col('fhir_resource');
    const accIdx   = col('access_control');
    const spIdx    = col('search_parameter');
    const enfIdx   = col('enforcement_attribute');
    const xacmlIdx = col('xacml_attribute');
    const commIdx  = col('comment');
    if (resIdx < 0 || accIdx < 0) throw new Error('Spalten fhir_resource und access_control erforderlich');

    _data = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';');
      const res  = (cols[resIdx] || '').trim();
      if (!res) continue;
      const access = (cols[accIdx] || '').trim();
      const sp     = (cols[spIdx]   || '').trim();
      const enf    = (cols[enfIdx]  || '').trim();
      const xacml  = (cols[xacmlIdx]|| '').trim();
      const comm   = (cols[commIdx] || '').trim();

      if (!_data.has(res)) _data.set(res, { primaryControl: access, entries: [] });
      const entry = _data.get(res);
      // Prefer "enforced" over "public" as primary
      if (entry.primaryControl === 'public' && access !== 'public') entry.primaryControl = access;
      if (sp !== '--' && sp !== '') entry.entries.push({ access, sp, enf, xacml, comm });
    }
    _count  = _data.size;
    _loaded = true;
  }

  function lookup(fhirType) { return _data.get(fhirType) || null; }
  function isLoaded()       { return _loaded; }
  function getCount()       { return _count; }
  function clear()          { _data = new Map(); _loaded = false; _count = 0; }

  return { load, lookup, isLoaded, getCount, clear };
})();

export { CSVParser, LabelMapper, EnforcementMapper };
