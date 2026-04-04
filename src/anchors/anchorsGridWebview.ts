import { AnchorMatch, BUILTIN_ANCHOR_TYPES } from './anchorService';

/**
 * Generates the HTML content for the anchors grid webview.
 * Uses VS Code CSS variables for theme-awareness.
 */
export function generateAnchorsGridHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      overflow: auto;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
      background: var(--vscode-editor-background);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .toolbar .scope-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-right: auto;
    }

    .search-input {
      padding: 3px 8px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 2px;
      font-size: 12px;
      width: 200px;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--vscode-focusBorder);
    }

    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .filter-btn {
      padding: 3px 8px;
      border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-input-border, transparent));
      background: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
    }

    .filter-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
    }

    .grid-container {
      overflow: auto;
      max-height: calc(100vh - 40px);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }

    th {
      position: sticky;
      top: 0;
      background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
      text-align: left;
      padding: 6px 10px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      border-bottom: 2px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    th:hover {
      color: var(--vscode-editor-foreground);
    }

    th .sort-indicator {
      margin-left: 4px;
      opacity: 0.5;
    }

    th.sorted .sort-indicator {
      opacity: 1;
    }

    td {
      padding: 4px 10px;
      border-bottom: 1px solid var(--vscode-editorGroup-border, rgba(128,128,128,0.2));
      font-size: 12px;
      vertical-align: top;
    }

    tr:hover td {
      background: var(--vscode-list-hoverBackground);
    }

    tr.clickable {
      cursor: pointer;
    }

    .type-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .type-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .type-label {
      font-weight: 500;
      font-size: 11px;
    }

    .file-cell {
      color: var(--vscode-textLink-foreground);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .line-cell {
      text-align: right;
      color: var(--vscode-descriptionForeground);
      font-variant-numeric: tabular-nums;
    }

    .overdue {
      color: var(--vscode-errorForeground, #f44747);
      font-weight: 500;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state .icon {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .empty-state .message {
      font-size: 13px;
    }

    .empty-state .hint {
      font-size: 12px;
      margin-top: 8px;
      opacity: 0.7;
    }

    .filter-dropdown {
      display: none;
      position: absolute;
      right: 12px;
      top: 36px;
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 8px;
      z-index: 20;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      min-width: 150px;
    }

    .filter-dropdown.open {
      display: block;
    }

    .filter-dropdown label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      cursor: pointer;
      font-size: 12px;
    }

    .filter-dropdown label:hover {
      color: var(--vscode-textLink-foreground);
    }

    .count-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 10px;
      margin-left: 4px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="scope-label" id="scopeLabel">Workspace</span>
    <input type="text" class="search-input" id="searchInput" placeholder="Filter anchors..." />
    <button class="filter-btn" id="filterBtn">Type ▾</button>
    <div class="filter-dropdown" id="filterDropdown"></div>
  </div>
  <div class="grid-container">
    <table id="anchorsTable">
      <thead>
        <tr>
          <th data-col="type">Type <span class="sort-indicator"></span></th>
          <th data-col="description">Description <span class="sort-indicator"></span></th>
          <th data-col="file">File <span class="sort-indicator"></span></th>
          <th data-col="line">Line <span class="sort-indicator"></span></th>
          <th data-col="owner">Owner <span class="sort-indicator"></span></th>
          <th data-col="issue">Issue <span class="sort-indicator"></span></th>
          <th data-col="dueDate">Due Date <span class="sort-indicator"></span></th>
        </tr>
      </thead>
      <tbody id="anchorsBody"></tbody>
    </table>
    <div class="empty-state" id="emptyState" style="display: none;">
      <div class="icon">⚓</div>
      <div class="message">No code anchors found</div>
      <div class="hint">Run "Scan Code Anchors" to discover TODO, HACK, NOTE, and other anchor tags in your workspace.</div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let allAnchors = [];
    let sortColumn = 'file';
    let sortAsc = true;
    let typeFilter = new Set();
    let searchQuery = '';

    const typeColors = ${JSON.stringify(Object.fromEntries([...BUILTIN_ANCHOR_TYPES.entries()].map(([k, v]) => [k, v.color])))};

    const body = document.getElementById('anchorsBody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('anchorsTable');
    const searchInput = document.getElementById('searchInput');
    const filterBtn = document.getElementById('filterBtn');
    const filterDropdown = document.getElementById('filterDropdown');
    const scopeLabel = document.getElementById('scopeLabel');

    // Search
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.toLowerCase();
      render();
    });

    // Type filter dropdown
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      filterDropdown.classList.remove('open');
    });

    filterDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Column sorting
    document.querySelectorAll('th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        if (sortColumn === col) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col;
          sortAsc = true;
        }
        updateSortIndicators();
        render();
      });
    });

    function updateSortIndicators() {
      document.querySelectorAll('th[data-col]').forEach(th => {
        const indicator = th.querySelector('.sort-indicator');
        const col = th.getAttribute('data-col');
        if (col === sortColumn) {
          th.classList.add('sorted');
          indicator.textContent = sortAsc ? '▲' : '▼';
        } else {
          th.classList.remove('sorted');
          indicator.textContent = '';
        }
      });
    }

    function buildTypeFilter() {
      const types = [...new Set(allAnchors.map(a => a.tag))].sort();
      filterDropdown.innerHTML = '';
      for (const type of types) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = typeFilter.size === 0 || typeFilter.has(type);
        cb.addEventListener('change', () => {
          if (cb.checked) {
            typeFilter.delete(type);
          } else {
            if (typeFilter.size === 0) {
              // First unchecked: add all except this one
              types.forEach(t => { if (t !== type) typeFilter.add(t); });
            } else {
              typeFilter.delete(type);
            }
          }
          // If all checked, clear filter
          if (typeFilter.size === types.length) typeFilter.clear();
          render();
        });
        const dot = document.createElement('span');
        dot.className = 'type-dot';
        dot.style.background = typeColors[type] || '#DAA520';
        label.appendChild(cb);
        label.appendChild(dot);
        label.appendChild(document.createTextNode(' ' + type));
        filterDropdown.appendChild(label);
      }
    }

    function getFiltered() {
      return allAnchors.filter(a => {
        if (typeFilter.size > 0 && !typeFilter.has(a.tag)) return false;
        if (searchQuery) {
          const haystack = [a.description, a.tag, a.owner || '', getFileName(a.filePath)].join(' ').toLowerCase();
          if (!haystack.includes(searchQuery)) return false;
        }
        return true;
      });
    }

    function getSorted(anchors) {
      return [...anchors].sort((a, b) => {
        let va, vb;
        switch (sortColumn) {
          case 'type': va = a.tag; vb = b.tag; break;
          case 'description': va = a.description; vb = b.description; break;
          case 'file': va = a.filePath; vb = b.filePath; break;
          case 'line': return sortAsc ? a.lineNumber - b.lineNumber : b.lineNumber - a.lineNumber;
          case 'owner': va = a.owner || ''; vb = b.owner || ''; break;
          case 'issue': va = a.issueRef || ''; vb = b.issueRef || ''; break;
          case 'dueDate': va = a.dueDate || '9999'; vb = b.dueDate || '9999'; break;
          default: return 0;
        }
        const cmp = (va || '').localeCompare(vb || '');
        return sortAsc ? cmp : -cmp;
      });
    }

    function getFileName(filePath) {
      return filePath.split(/[\\\\/]/).pop() || filePath;
    }

    function getRelativePath(filePath) {
      // Show just filename for brevity
      const parts = filePath.split(/[\\\\/]/);
      return parts.length > 2 ? parts.slice(-2).join('/') : parts.pop();
    }

    function isOverdue(dateStr) {
      if (!dateStr) return false;
      const due = new Date(dateStr + 'T00:00:00');
      return due < new Date();
    }

    function render() {
      const filtered = getFiltered();
      const sorted = getSorted(filtered);

      if (sorted.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      table.style.display = '';
      emptyState.style.display = 'none';
      body.innerHTML = '';

      for (const anchor of sorted) {
        const tr = document.createElement('tr');
        tr.className = 'clickable';
        tr.addEventListener('click', () => {
          vscode.postMessage({ type: 'navigateTo', filePath: anchor.filePath, lineNumber: anchor.lineNumber });
        });

        // Type
        const tdType = document.createElement('td');
        tdType.innerHTML = '<div class="type-cell"><span class="type-dot" style="background: ' +
          (typeColors[anchor.tag] || '#DAA520') + '"></span><span class="type-label">' +
          escapeHtml(anchor.tag) + '</span></div>';
        tr.appendChild(tdType);

        // Description
        const tdDesc = document.createElement('td');
        tdDesc.textContent = anchor.description || '(no description)';
        tr.appendChild(tdDesc);

        // File
        const tdFile = document.createElement('td');
        tdFile.className = 'file-cell';
        tdFile.textContent = getRelativePath(anchor.filePath);
        tdFile.title = anchor.filePath;
        tr.appendChild(tdFile);

        // Line
        const tdLine = document.createElement('td');
        tdLine.className = 'line-cell';
        tdLine.textContent = String(anchor.lineNumber + 1);
        tr.appendChild(tdLine);

        // Owner
        const tdOwner = document.createElement('td');
        tdOwner.textContent = anchor.owner ? '@' + anchor.owner : '';
        tr.appendChild(tdOwner);

        // Issue
        const tdIssue = document.createElement('td');
        tdIssue.textContent = anchor.issueRef || '';
        tr.appendChild(tdIssue);

        // Due Date
        const tdDue = document.createElement('td');
        tdDue.textContent = anchor.dueDate || '';
        if (isOverdue(anchor.dueDate)) {
          tdDue.className = 'overdue';
        }
        tr.appendChild(tdDue);

        body.appendChild(tr);
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'updateAnchors':
          allAnchors = msg.anchors || [];
          buildTypeFilter();
          render();
          break;
        case 'updateScope':
          scopeLabel.textContent = msg.scope || 'Workspace';
          break;
      }
    });

    // Request initial data
    vscode.postMessage({ type: 'requestRefresh' });
    updateSortIndicators();
  </script>
</body>
</html>`;
}
