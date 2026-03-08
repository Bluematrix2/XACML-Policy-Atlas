'use strict';

// ================================================================
//  UI STATE
// ================================================================

const UIState = (() => {
  let policies  = [];
  let activeIdx = -1;

  function addOrReplace(policy) {
    const existing = policies.findIndex(p => p.filename === policy.filename);
    if (existing >= 0) { policies[existing] = policy; return existing; }
    policies.push(policy);
    return policies.length - 1;
  }

  function setActive(idx) { activeIdx = idx; }
  function getActive()    { return activeIdx >= 0 ? policies[activeIdx] : null; }
  function getAll()       { return policies; }

  return { addOrReplace, setActive, getActive, getAll };
})();

export { UIState };
