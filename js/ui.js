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

  function remove(idx) {
    if (idx < 0 || idx >= policies.length) return;
    const wasActive = activeIdx === idx;
    policies.splice(idx, 1);
    if (wasActive) {
      activeIdx = policies.length > 0 ? 0 : -1;
    } else if (activeIdx > idx) {
      activeIdx--;
    }
    return wasActive;
  }

  function getActiveIdx() { return activeIdx; }
  function setActive(idx) { activeIdx = idx; }
  function getActive()    { return activeIdx >= 0 ? policies[activeIdx] : null; }
  function getAll()       { return policies; }
  function clear()        { policies = []; activeIdx = -1; }

  return { addOrReplace, remove, getActiveIdx, setActive, getActive, getAll, clear };
})();

export { UIState };
