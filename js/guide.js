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

  function init() {
    if (_initialized) return;
    _initialized = true;

    const container = document.getElementById('layout-guide');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<div class="guide-loading">Inhalte werden geladen…</div>';

    Promise.all(SECTIONS.map(s => fetch(s.file).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} beim Laden von ${s.file}`);
      return r.text();
    })))
      .then(texts => {
        render(texts);
      })
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
  }

  function render(markdownTexts) {
    const container = document.getElementById('layout-guide');
    if (!container) return;

    // Build ToC
    const tocItems = SECTIONS.map(s =>
      `<li><a href="#${s.id}" class="guide-toc-link" data-id="${s.id}">${s.title}</a></li>`
    ).join('');

    const toc = `<nav class="guide-toc" id="guide-toc">
      <div class="guide-toc-title">Inhalt</div>
      <ul class="guide-toc-list">${tocItems}</ul>
    </nav>`;

    // Build content sections
    const sections = SECTIONS.map((s, idx) => {
      const html    = parseMarkdown(markdownTexts[idx] || '');
      const isLast  = idx === SECTIONS.length - 1;
      const divider = isLast ? '' : '<hr class="guide-section-divider">';
      return `<section class="guide-section" id="${s.id}">${html}${divider}</section>`;
    }).join('');

    const content = `<div class="guide-content" id="guide-content">${sections}</div>`;

    container.innerHTML = toc + content;

    // Anchor copy buttons on all headings
    addAnchorButtons(container);

    // Smooth scroll for ToC links (scroll inside guide-content, not window)
    const guideContent = document.getElementById('guide-content');
    container.querySelectorAll('.guide-toc-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.getElementById(a.dataset.id);
        if (target && guideContent) {
          guideContent.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
        }
      });
    });

    // IntersectionObserver — track topmost visible section in document order
    if (_observer) _observer.disconnect();
    const _visibleSections = new Set();
    const sectionIds = SECTIONS.map(s => s.id);

    function updateActiveLink() {
      const activeId = sectionIds.find(id => _visibleSections.has(id));
      if (!activeId) return;
      container.querySelectorAll('.guide-toc-link').forEach(a => {
        a.classList.toggle('active', a.dataset.id === activeId);
      });
    }

    _observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          _visibleSections.add(entry.target.id);
        } else {
          _visibleSections.delete(entry.target.id);
        }
      }
      updateActiveLink();
    }, {
      root: guideContent,
      rootMargin: '0px 0px -50% 0px',
      threshold: 0,
    });

    container.querySelectorAll('.guide-section').forEach(el => _observer.observe(el));

    // Highlight first item initially
    _visibleSections.add(sectionIds[0]);
    updateActiveLink();
  }

  function addAnchorButtons(container) {
    container.querySelectorAll('.guide-section h1[id], .guide-section h2[id], .guide-section h3[id]').forEach(heading => {
      const btn = document.createElement('button');
      btn.className = 'heading-anchor-btn';
      btn.title = 'Link zu diesem Abschnitt kopieren';
      btn.setAttribute('aria-label', 'Abschnittslink kopieren');
      btn.innerHTML = '<span class="heading-anchor-icon">#</span>';
      btn.addEventListener('click', () => {
        const url = `${location.origin}${location.pathname}#${heading.id}`;
        navigator.clipboard.writeText(url).then(() => {
          btn.innerHTML = '<span class="heading-anchor-icon heading-anchor-copied">✓</span>';
          setTimeout(() => {
            btn.innerHTML = '<span class="heading-anchor-icon">#</span>';
          }, 1500);
        }).catch(() => {
          // Fallback for browsers without clipboard API
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

  return { init, render, get _initialized() { return _initialized; } };
})();

export { XACMLGuide };
