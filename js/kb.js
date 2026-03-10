'use strict';

import { parseMarkdown } from './markdown.js';

const SECTIONS = [
  { id: 'kb-mapping-csv',     title: '1. Mapping-CSV',     file: 'content/kb-01-mapping-csv.md' },
  { id: 'kb-enforcement-csv', title: '2. Enforcement-CSV', file: 'content/kb-02-enforcement-csv.md' },
//  { id: 'kb-validation',      title: '3. Validierungsregeln', file: 'content/kb-03-validation.md' },
];

const KnowledgeBase = (() => {
  let _initialized = false;
  let _observer    = null;
  let _initPromise = null;
  const _textCache = {};

  function init() {
    if (_initialized) return _initPromise || Promise.resolve();
    _initialized = true;

    const container = document.getElementById('layout-kb');
    if (!container) return Promise.resolve();

    container.innerHTML = '<div class="guide-loading">Inhalte werden geladen…</div>';

    _initPromise = Promise.all(SECTIONS.map(s => fetch(s.file).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} beim Laden von ${s.file}`);
      return r.text();
    })))
      .then(texts => render(texts))
      .catch(err => {
        container.innerHTML = `<div class="guide-error">
          <h3>Inhalte konnten nicht geladen werden</h3>
          <p>${err.message}</p>
          <p style="margin-top:10px;font-size:13px;color:var(--text-muted)">
            Hinweis: Lokaler HTTP-Server erforderlich (z.&nbsp;B. <code>npx serve .</code>).
          </p>
        </div>`;
      });

    return _initPromise;
  }

  function openSection(id, scroll = false) {
    const container = document.getElementById('layout-kb');
    if (!container) return;

    SECTIONS.forEach(s => {
      const hdr  = container.querySelector(`.guide-acc-hdr[data-id="${s.id}"]`);
      const body = document.getElementById(`kb-body-${s.id}`);
      if (!hdr || !body) return;
      const isTarget = s.id === id;
      hdr.classList.toggle('open', isTarget);
      hdr.setAttribute('aria-expanded', isTarget);
      body.style.display = isTarget ? '' : 'none';
    });

    if (scroll) {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function render(markdownTexts) {
    const container = document.getElementById('layout-kb');
    if (!container) return;

    // ToC
    const tocItems = SECTIONS.map(s =>
      `<li class="guide-toc-item" data-id="${s.id}">` +
      `<a href="#${s.id}" class="guide-toc-link" data-id="${s.id}">${s.title}</a></li>`
    ).join('');

    const toc = `<nav class="guide-toc" id="kb-toc">
      <div class="guide-toc-title">Inhalt</div>
      <div class="guide-search-wrap">
        <span class="guide-search-icon">⌕</span>
        <input type="search" class="guide-search" id="kb-search"
               placeholder="Suche…" aria-label="Knowledge Base durchsuchen" autocomplete="off">
        <button class="guide-search-clear" id="kb-search-clear" style="display:none" title="Suche leeren" aria-label="Suche leeren">&#x2715;</button>
      </div>
      <ul class="guide-toc-list" id="kb-toc-list">${tocItems}</ul>
    </nav>`;

    // Accordions
    const accItems = SECTIONS.map((s, idx) => {
      const html   = parseMarkdown(markdownTexts[idx] || '');
      const numStr = String(idx + 1).padStart(2, '0');
      const label  = s.title.replace(/^\d+\.\s*/, '');
      return `<div class="guide-acc" id="${s.id}">
        <button class="guide-acc-hdr"
                aria-expanded="false"
                data-id="${s.id}">
          <span class="guide-acc-num">${numStr}</span>
          <span class="guide-acc-label">${label}</span>
          <span class="guide-acc-chevron" aria-hidden="true"></span>
        </button>
        <div class="guide-acc-body" id="kb-body-${s.id}" style="display:none">
          <div class="guide-section-inner">${html}</div>
        </div>
      </div>`;
    }).join('');

    const backToTop = `<button class="guide-back-top" id="kb-back-top"
        title="Zurück nach oben" aria-label="Zurück nach oben"
        onclick="window.scrollTo({top:0,behavior:'smooth'})">&#x2191;</button>`;

    const content = `<div class="guide-content" id="kb-content">${accItems}${backToTop}</div>`;
    container.innerHTML = `<div class="guide-body">${toc}${content}</div>`;

    SECTIONS.forEach(s => {
      const inner = document.querySelector(`#kb-body-${s.id} .guide-section-inner`);
      _textCache[s.id] = (inner ? inner.textContent : '').toLowerCase();
    });

    addAnchorButtons(container);
    setupAccordionClicks(container);
    setupTocLinks(container);
    setupSearch(container);
    setupObserver(container);
  }

  function setupAccordionClicks(container) {
    container.querySelectorAll('.guide-acc-hdr').forEach(hdr => {
      hdr.addEventListener('click', () => {
        if (hdr.classList.contains('open')) {
          const body = document.getElementById(`kb-body-${hdr.dataset.id}`);
          hdr.classList.remove('open');
          hdr.setAttribute('aria-expanded', 'false');
          if (body) body.style.display = 'none';
        } else {
          openSection(hdr.dataset.id, false);
        }
      });
    });
  }

  function setupTocLinks(container) {
    container.querySelectorAll('.guide-toc-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        openSection(a.dataset.id, true);
      });
    });
  }

  function setupSearch(container) {
    const input    = document.getElementById('kb-search');
    const clearBtn = document.getElementById('kb-search-clear');
    if (!input) return;

    function runSearch() {
      const q = input.value.trim().toLowerCase();
      if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';

      SECTIONS.forEach(s => {
        const tocItem = container.querySelector(`.guide-toc-item[data-id="${s.id}"]`);
        const acc     = document.getElementById(s.id);
        if (!tocItem || !acc) return;

        const matches = !q
          || s.title.toLowerCase().includes(q)
          || (_textCache[s.id] || '').includes(q);

        tocItem.style.display = matches ? '' : 'none';
        acc.style.display     = matches ? '' : 'none';
      });

      if (q) {
        const visible = SECTIONS.filter(s => {
          const acc = document.getElementById(s.id);
          return acc && acc.style.display !== 'none';
        });
        if (visible.length === 1) openSection(visible[0].id, false);
      }
    }

    input.addEventListener('input', runSearch);

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    }
  }

  function setupObserver(container) {
    if (_observer) _observer.disconnect();
    const visible    = new Set();
    const sectionIds = SECTIONS.map(s => s.id);

    function updateActive() {
      const activeId = sectionIds.find(id => visible.has(id));
      if (!activeId) return;
      container.querySelectorAll('.guide-toc-link').forEach(a =>
        a.classList.toggle('active', a.dataset.id === activeId)
      );
    }

    _observer = new IntersectionObserver(entries => {
      entries.forEach(e => e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
      updateActive();
    }, { root: null, rootMargin: '-10% 0px -55% 0px', threshold: 0 });

    container.querySelectorAll('.guide-acc').forEach(el => _observer.observe(el));
  }

  function addAnchorButtons(container) {
    container.querySelectorAll('.guide-section-inner h1[id], .guide-section-inner h2[id], .guide-section-inner h3[id]')
      .forEach(heading => {
        const btn = document.createElement('button');
        btn.className = 'heading-anchor-btn';
        btn.title = 'Link zu diesem Abschnitt kopieren';
        btn.setAttribute('aria-label', 'Abschnittslink kopieren');
        btn.innerHTML = '<span class="heading-anchor-icon">#</span>';
        btn.addEventListener('click', () => {
          const url = `${location.origin}${location.pathname}#${heading.id}`;
          navigator.clipboard.writeText(url).then(() => {
            btn.innerHTML = '<span class="heading-anchor-icon heading-anchor-copied">✓</span>';
            setTimeout(() => { btn.innerHTML = '<span class="heading-anchor-icon">#</span>'; }, 1500);
          }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          });
        });
        heading.appendChild(btn);
      });
  }

  return { init, openSection, get _initialized() { return _initialized; } };
})();

export { KnowledgeBase };
