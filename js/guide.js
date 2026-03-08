'use strict';

import { parseMarkdown } from './markdown.js';

const SECTIONS = [
  { id: 'was-ist-xacml',        title: '1. Was ist XACML?',                    file: 'content/xacml-01-was-ist-xacml.md' },
  { id: 'aufbau-policy',        title: '2. Aufbau einer Policy',               file: 'content/xacml-02-aufbau-policy.md' },
  { id: 'target',               title: '3. Target — Für wen gilt die Regel?',  file: 'content/xacml-03-target.md' },
  { id: 'und-oder',             title: '4. UND- und ODER-Verknüpfungen',       file: 'content/xacml-04-und-oder.md' },
  { id: 'conditions',           title: '5. Conditions',                        file: 'content/xacml-05-conditions.md' },
  { id: 'combining-algorithms', title: '6. Combining Algorithms',              file: 'content/xacml-06-combining-algorithms.md' },
  { id: 'praxisbeispiel',       title: '7. Praxisbeispiel',                    file: 'content/xacml-07-praxisbeispiel.md' },
];

const XACMLGuide = (() => {
  let _initialized = false;
  let _observer    = null;
  let _initPromise = null;
  // Plain-text cache for search (filled after render)
  const _textCache = {};

  function init() {
    if (_initialized) return _initPromise || Promise.resolve();
    _initialized = true;

    const container = document.getElementById('layout-guide');
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
            Hinweis: Der Guide benötigt einen HTTP-Server. Wenn du die Datei direkt als
            <code>file://</code>-URL öffnest, blockiert der Browser das Laden der
            Markdown-Dateien. Starte einen lokalen HTTP-Server (z.&nbsp;B.
            <code>npx serve .</code>) oder nutze GitHub&nbsp;Pages.
          </p>
        </div>`;
      });

    return _initPromise;
  }

  // ── Open a single accordion, close all others ──────────────────────────────
  function openSection(id, scroll = false) {
    const container = document.getElementById('layout-guide');
    if (!container) return;

    SECTIONS.forEach(s => {
      const hdr  = container.querySelector(`.guide-acc-hdr[data-id="${s.id}"]`);
      const body = document.getElementById(`acc-body-${s.id}`);
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

  // ── Build & inject DOM ─────────────────────────────────────────────────────
  function render(markdownTexts) {
    const container = document.getElementById('layout-guide');
    if (!container) return;

    // ToC (search + links)
    const tocItems = SECTIONS.map(s =>
      `<li class="guide-toc-item" data-id="${s.id}">` +
      `<a href="#${s.id}" class="guide-toc-link" data-id="${s.id}">${s.title}</a></li>`
    ).join('');

    const toc = `<nav class="guide-toc" id="guide-toc">
      <div class="guide-toc-title">Inhalt</div>
      <div class="guide-search-wrap">
        <span class="guide-search-icon">⌕</span>
        <input type="search" class="guide-search" id="guide-search"
               placeholder="Suche…" aria-label="Guide durchsuchen" autocomplete="off">
      </div>
      <ul class="guide-toc-list" id="guide-toc-list">${tocItems}</ul>
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
        <div class="guide-acc-body" id="acc-body-${s.id}" style="display:none">
          <div class="guide-section-inner">${html}</div>
        </div>
      </div>`;
    }).join('');

    const backToTop = `<button class="guide-back-top" id="guide-back-top"
        title="Zurück nach oben" aria-label="Zurück nach oben"
        onclick="window.scrollTo({top:0,behavior:'smooth'})">&#x2191;</button>`;

    const content = `<div class="guide-content" id="guide-content">${accItems}${backToTop}</div>`;
    container.innerHTML = `<div class="guide-body">${toc}${content}</div>`;

    // Cache plain text for search
    SECTIONS.forEach(s => {
      const inner = document.querySelector(`#acc-body-${s.id} .guide-section-inner`);
      _textCache[s.id] = (inner ? inner.textContent : '').toLowerCase();
    });

    addAnchorButtons(container);
    setupAccordionClicks(container);
    setupTocLinks(container);
    setupSearch(container);
    setupObserver(container);

    // Handle URL anchor (open correct accordion + scroll)
    const hash = location.hash.slice(1);
    if (hash) {
      const matchId = SECTIONS.find(s => s.id === hash || document.getElementById(hash)?.closest(`#${s.id}`))?.id || hash;
      setTimeout(() => openSection(matchId, true), 80);
    }
  }

  // ── Accordion click — toggle open/close ───────────────────────────────────
  function setupAccordionClicks(container) {
    container.querySelectorAll('.guide-acc-hdr').forEach(hdr => {
      hdr.addEventListener('click', () => {
        if (hdr.classList.contains('open')) {
          // Close this accordion
          const body = document.getElementById(`acc-body-${hdr.dataset.id}`);
          hdr.classList.remove('open');
          hdr.setAttribute('aria-expanded', 'false');
          if (body) body.style.display = 'none';
        } else {
          openSection(hdr.dataset.id, false);
        }
      });
    });
  }

  // ── ToC links ──────────────────────────────────────────────────────────────
  function setupTocLinks(container) {
    container.querySelectorAll('.guide-toc-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        openSection(a.dataset.id, true);
      });
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  function setupSearch(container) {
    const input = document.getElementById('guide-search');
    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();

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

      // If exactly one result, open it automatically
      if (q) {
        const visible = SECTIONS.filter(s => {
          const acc = document.getElementById(s.id);
          return acc && acc.style.display !== 'none';
        });
        if (visible.length === 1) openSection(visible[0].id, false);
      }
    });
  }

  // ── IntersectionObserver (watches accordion wrappers) ─────────────────────
  function setupObserver(container) {
    if (_observer) _observer.disconnect();
    const visible   = new Set();
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

  // ── Anchor copy buttons on headings inside the section bodies ─────────────
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

  return { init, render, openSection, get _initialized() { return _initialized; } };
})();

export { XACMLGuide };
