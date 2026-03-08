'use strict';

// ================================================================
//  Simple Markdown → HTML parser
//  Exports: parseMarkdown(text)
// ================================================================

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdown(text) {
  // Bold + italic combined ***text***
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code `code`
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code class="md-inline-code">${escHtml(code)}</code>`);
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return text;
}

function renderTable(rows) {
  if (rows.length < 2) return '';
  const headerRow = rows[0];
  const dataRows  = rows.slice(1).filter(r => !/^\s*\|[-:| ]+\|/.test(r));

  function parseCells(row) {
    return row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  }

  const headers = parseCells(headerRow);
  let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
  for (const h of headers) {
    html += `<th>${inlineMarkdown(h)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const r of dataRows) {
    const cells = parseCells(r);
    html += '<tr>';
    for (let i = 0; i < headers.length; i++) {
      html += `<td>${inlineMarkdown(cells[i] || '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

export function parseMarkdown(text) {
  const lines  = text.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ``` ... ```
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push(`<pre class="md-pre"><code class="md-code">${escHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // ── HTML block passthrough: lines starting with <div, <figure, <aside, <details
    const htmlBlockMatch = line.match(/^<(div|figure|aside|details)(\s|>)/);
    if (htmlBlockMatch) {
      const tagName = htmlBlockMatch[1];
      const blockLines = [line];
      let depth = (line.match(new RegExp(`<${tagName}[\\s>]`, 'g')) || []).length
                - (line.match(new RegExp(`</${tagName}>`, 'g')) || []).length;
      i++;
      while (i < lines.length && depth > 0) {
        const l = lines[i];
        depth += (l.match(new RegExp(`<${tagName}[\\s>]`, 'g')) || []).length;
        depth -= (l.match(new RegExp(`</${tagName}>`, 'g')) || []).length;
        blockLines.push(l);
        i++;
      }
      result.push(blockLines.join('\n'));
      continue;
    }

    // ── Headings
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      const t = h1[1];
      result.push(`<h1 class="md-h1" id="${slugify(t)}">${inlineMarkdown(t)}</h1>`);
      i++; continue;
    }
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      const t = h2[1];
      result.push(`<h2 class="md-h2" id="${slugify(t)}">${inlineMarkdown(t)}</h2>`);
      i++; continue;
    }
    const h3 = line.match(/^### (.+)/);
    if (h3) {
      const t = h3[1];
      result.push(`<h3 class="md-h3" id="${slugify(t)}">${inlineMarkdown(t)}</h3>`);
      i++; continue;
    }

    // ── Horizontal rule
    if (/^---+$/.test(line.trim())) {
      result.push('<hr class="md-hr">');
      i++; continue;
    }

    // ── Blockquote
    if (/^> /.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      const inner = parseMarkdown(bqLines.join('\n'));
      result.push(`<blockquote class="md-blockquote">${inner}</blockquote>`);
      continue;
    }

    // ── Table (line starts with |)
    if (/^\|/.test(line)) {
      const tableRows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableRows.push(lines[i]);
        i++;
      }
      result.push(renderTable(tableRows));
      continue;
    }

    // ── Unordered list
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        items.push(`<li class="md-li">${inlineMarkdown(lines[i].slice(2))}</li>`);
        i++;
      }
      result.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }

    // ── Ordered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li class="md-li">${inlineMarkdown(lines[i].replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      result.push(`<ol class="md-ol">${items.join('')}</ol>`);
      continue;
    }

    // ── Empty line — skip
    if (line.trim() === '') {
      i++; continue;
    }

    // ── Paragraph — collect until empty line
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^[#>`\-|]/.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !/^```/.test(lines[i]) && !lines[i].match(/^<(div|figure|aside|details)(\s|>)/)) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      result.push(`<p class="md-p">${inlineMarkdown(paraLines.join(' '))}</p>`);
    }
  }

  return result.join('\n');
}
