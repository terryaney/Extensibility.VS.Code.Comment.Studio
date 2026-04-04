import { BUILTIN_ANCHOR_TYPES } from './anchorService';
import { DEFAULT_COLUMN_WIDTHS } from './anchorViewState';

const TYPE_METADATA = Object.fromEntries(
  [...BUILTIN_ANCHOR_TYPES.entries()].map(([tag, value]) => [
    tag,
    {
      color: value.color,
      codicon: value.icon,
    },
  ]),
);

/**
 * Generates the HTML content for the anchors grid webview.
 * Uses VS Code CSS variables for theme-awareness.
 */
export function generateAnchorsGridHtml(nonce: string, codiconsCssUri: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${codiconsCssUri}">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      overflow: hidden;
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
      z-index: 20;
    }

    .scope-select,
    .search-input {
      padding: 3px 8px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 2px;
      font-size: 12px;
      outline: none;
      height: 26px;
    }

    .scope-select {
      min-width: 180px;
      max-width: 260px;
    }

    .search-input {
      width: 220px;
      margin-left: auto;
    }

    .scope-select:focus,
    .search-input:focus {
      border-color: var(--vscode-focusBorder);
    }

    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .filter-btn,
    .menu-button {
      padding: 3px 8px;
      border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-input-border, transparent));
      background: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
      height: 26px;
    }

    .filter-btn:hover,
    .menu-button:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
    }

    .menu-button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .grid-container {
      overflow: auto;
      max-height: calc(100vh - 40px);
      position: relative;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      min-width: 700px;
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
      border-right: 1px solid var(--vscode-editorGroup-border, rgba(128,128,128,0.35));
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      position: sticky;
    }

    th:last-child {
      border-right: none;
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

    .column-resizer {
      position: absolute;
      top: 0;
      right: -3px;
      width: 6px;
      height: 100%;
      cursor: col-resize;
      z-index: 3;
    }

    .column-resizer::after {
      content: '';
      position: absolute;
      top: 25%;
      bottom: 25%;
      left: 2px;
      width: 1px;
      background: transparent;
    }

    th:hover .column-resizer::after {
      background: var(--vscode-panel-border, var(--vscode-editorGroup-border));
    }

    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-editorGroup-border, rgba(128,128,128,0.35));
      border-right: 1px solid var(--vscode-editorGroup-border, rgba(128,128,128,0.35));
      font-size: 12px;
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    td:last-child {
      border-right: none;
    }

    tr:hover td {
      background: var(--vscode-list-hoverBackground);
    }

    tr.clickable {
      cursor: pointer;
    }

    .cell-content {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .type-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .type-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      font-size: 14px;
      flex-shrink: 0;
    }

    .type-label {
      font-weight: 700;
      font-size: 11px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-cell {
      color: var(--vscode-textLink-foreground);
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
      gap: 8px;
    }

    .empty-state .icon {
      font-size: 28px;
      opacity: 0.6;
    }

    .empty-state .message {
      font-size: 13px;
      color: var(--vscode-editor-foreground);
    }

    .empty-state .hint {
      font-size: 12px;
      opacity: 0.8;
      text-align: center;
      max-width: 520px;
    }

    .filter-dropdown,
    .context-menu {
      display: none;
      position: absolute;
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 8px;
      z-index: 40;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      min-width: 170px;
    }

    .filter-dropdown {
      top: 100%;
      right: 12px;
    }

    .filter-dropdown.open,
    .context-menu.open {
      display: block;
    }

    .filter-dropdown label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
    }

    .filter-dropdown label:hover {
      color: var(--vscode-textLink-foreground);
    }

    .filter-icon {
      display: inline-flex;
      width: 14px;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
    }

    .context-menu {
      padding: 4px;
      min-width: 140px;
    }

    .context-menu .menu-button {
      display: block;
      width: 100%;
      text-align: left;
      border: none;
      background: transparent;
      height: auto;
      padding: 6px 8px;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <select class="scope-select" id="scopeSelect"></select>
    <input type="text" class="search-input" id="searchInput" placeholder="Filter anchors..." />
    <button class="filter-btn" id="filterBtn">Type ▾</button>
    <div class="filter-dropdown" id="filterDropdown"></div>
  </div>
  <div class="grid-container" id="gridContainer">
    <table id="anchorsTable">
      <colgroup>
        <col data-col="type" />
        <col data-col="description" />
        <col data-col="file" />
        <col data-col="line" />
        <col data-col="owner" />
        <col data-col="issue" />
        <col data-col="dueDate" />
      </colgroup>
      <thead>
        <tr>
          <th data-col="type">Type <span class="sort-indicator"></span><span class="column-resizer" data-col="type"></span></th>
          <th data-col="description">Description <span class="sort-indicator"></span><span class="column-resizer" data-col="description"></span></th>
          <th data-col="file">File <span class="sort-indicator"></span><span class="column-resizer" data-col="file"></span></th>
          <th data-col="line">Line <span class="sort-indicator"></span><span class="column-resizer" data-col="line"></span></th>
          <th data-col="owner">Owner <span class="sort-indicator"></span><span class="column-resizer" data-col="owner"></span></th>
          <th data-col="issue">Issue <span class="sort-indicator"></span><span class="column-resizer" data-col="issue"></span></th>
          <th data-col="dueDate">Due Date <span class="sort-indicator"></span><span class="column-resizer" data-col="dueDate"></span></th>
        </tr>
      </thead>
      <tbody id="anchorsBody"></tbody>
    </table>
    <div class="empty-state" id="emptyState" style="display: none;">
      <div class="icon">⚓</div>
      <div class="message" id="emptyMessage">No code anchors found</div>
      <div class="hint" id="emptyHint">Run "Scan Code Anchors" to discover TODO, HACK, NOTE, and other anchor tags in your workspace.</div>
    </div>
  </div>
  <div class="context-menu" id="contextMenu">
    <button class="menu-button" id="copyRowBtn">Copy Row</button>
    <button class="menu-button" id="copyCellBtn">Copy Cell</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const persistedState = vscode.getState() || {};
    const defaultColumnWidths = ${JSON.stringify(DEFAULT_COLUMN_WIDTHS)};
    const typeMetadata = ${JSON.stringify(TYPE_METADATA)};

    let model = {
      anchors: [],
      availableTypes: [],
      filteredCount: 0,
      totalCount: 0,
      scopeLabel: 'Workspace',
      scopeOptions: [],
      state: {
        scopeId: 'workspace',
        includedTypes: undefined,
        searchQuery: '',
        columnWidths: { ...defaultColumnWidths },
        sortColumn: 'file',
        sortAscending: true,
      },
    };
    let contextMenuState = undefined;

    const body = document.getElementById('anchorsBody');
    const emptyState = document.getElementById('emptyState');
    const emptyMessage = document.getElementById('emptyMessage');
    const emptyHint = document.getElementById('emptyHint');
    const table = document.getElementById('anchorsTable');
    const searchInput = document.getElementById('searchInput');
    const filterBtn = document.getElementById('filterBtn');
    const filterDropdown = document.getElementById('filterDropdown');
    const scopeSelect = document.getElementById('scopeSelect');
    const gridContainer = document.getElementById('gridContainer');
    const contextMenu = document.getElementById('contextMenu');
    const copyRowBtn = document.getElementById('copyRowBtn');
    const copyCellBtn = document.getElementById('copyCellBtn');

    searchInput.addEventListener('input', () => {
      model.state.searchQuery = searchInput.value;
      persistLocalState();
      render();
      vscode.postMessage({ type: 'setSearchQuery', searchQuery: model.state.searchQuery });
    });

    scopeSelect.addEventListener('change', () => {
      model.state.scopeId = scopeSelect.value;
      persistLocalState();
      vscode.postMessage({ type: 'setScope', scopeId: model.state.scopeId });
    });

    filterBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      filterDropdown.classList.toggle('open');
      hideContextMenu();
    });

    document.addEventListener('click', () => {
      filterDropdown.classList.remove('open');
      hideContextMenu();
    });

    filterDropdown.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    contextMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    copyRowBtn.addEventListener('click', () => {
      if (contextMenuState && contextMenuState.anchor) {
        vscode.postMessage({ type: 'copyRow', anchor: contextMenuState.anchor });
      }
      hideContextMenu();
    });

    copyCellBtn.addEventListener('click', () => {
      if (contextMenuState && contextMenuState.cellText) {
        vscode.postMessage({ type: 'copyCell', text: contextMenuState.cellText });
      }
      hideContextMenu();
    });

    gridContainer.addEventListener('scroll', () => {
      hideContextMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideContextMenu();
        filterDropdown.classList.remove('open');
      }
    });

    document.querySelectorAll('th[data-col]').forEach((header) => {
      header.addEventListener('click', () => {
        const column = header.getAttribute('data-col');
        if (!column) {
          return;
        }

        if (model.state.sortColumn === column) {
          model.state.sortAscending = !model.state.sortAscending;
        } else {
          model.state.sortColumn = column;
          model.state.sortAscending = true;
        }

        persistGridPreferences();
        updateSortIndicators();
        render();
      });
    });

    document.querySelectorAll('.column-resizer').forEach((handle) => {
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const column = handle.getAttribute('data-col');
        if (!column) {
          return;
        }

        const startX = event.clientX;
        const startWidth = model.state.columnWidths[column] || defaultColumnWidths[column] || 120;

        const onMouseMove = (moveEvent) => {
          const nextWidth = Math.max(72, startWidth + (moveEvent.clientX - startX));
          model.state.columnWidths[column] = nextWidth;
          applyColumnWidths();
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          persistGridPreferences();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });

    function updateModel(nextModel) {
      model = {
        ...nextModel,
        state: mergeState(nextModel.state),
      };

      syncControls();
      buildScopeOptions();
      buildTypeFilter();
      applyColumnWidths();
      updateSortIndicators();
      persistLocalState();
      render();
    }

    function mergeState(nextState) {
      return {
        scopeId: nextState.scopeId || persistedState.scopeId || 'workspace',
        includedTypes: nextState.includedTypes,
        searchQuery: nextState.searchQuery || '',
        columnWidths: {
          ...defaultColumnWidths,
          ...(persistedState.columnWidths || {}),
          ...(nextState.columnWidths || {}),
        },
        sortColumn: nextState.sortColumn || persistedState.sortColumn || 'file',
        sortAscending: typeof nextState.sortAscending === 'boolean'
          ? nextState.sortAscending
          : (typeof persistedState.sortAscending === 'boolean' ? persistedState.sortAscending : true),
      };
    }

    function syncControls() {
      if (searchInput.value !== model.state.searchQuery) {
        searchInput.value = model.state.searchQuery;
      }
    }

    function buildScopeOptions() {
      const selectedScopeId = model.state.scopeId;
      scopeSelect.innerHTML = '';

      for (const option of model.scopeOptions) {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.textContent = option.label;
        optionElement.disabled = !option.enabled;
        optionElement.selected = option.id === selectedScopeId;
        if (option.description) {
          optionElement.title = option.description;
        }
        scopeSelect.appendChild(optionElement);
      }
    }

    function buildTypeFilter() {
      const includedTypes = model.state.includedTypes;
      filterDropdown.innerHTML = '';

      for (const type of model.availableTypes) {
        const metadata = typeMetadata[type] || { color: '#DAA520', codicon: 'symbol-misc' };
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !includedTypes || includedTypes.includes(type);
        checkbox.addEventListener('change', () => {
          const nextIncludedTypes = [];
          filterDropdown.querySelectorAll('input[type="checkbox"]').forEach((element, index) => {
            if (element.checked) {
              nextIncludedTypes.push(model.availableTypes[index]);
            }
          });

          model.state.includedTypes = nextIncludedTypes.length === model.availableTypes.length
            ? undefined
            : nextIncludedTypes;
          persistLocalState();
          render();
          vscode.postMessage({ type: 'setTypeFilter', includedTypes: model.state.includedTypes });
        });

        const icon = document.createElement('span');
        icon.className = 'filter-icon codicon codicon-' + metadata.codicon;
        icon.style.color = metadata.color;

        const text = document.createElement('span');
        text.textContent = type;
        text.style.color = metadata.color;

        label.appendChild(checkbox);
        label.appendChild(icon);
        label.appendChild(text);
        filterDropdown.appendChild(label);
      }
    }

    function applyColumnWidths() {
      let totalWidth = 0;
      document.querySelectorAll('col[data-col]').forEach((column) => {
        const columnKey = column.getAttribute('data-col');
        const width = model.state.columnWidths[columnKey] || defaultColumnWidths[columnKey] || 120;
        column.style.width = String(width) + 'px';
        totalWidth += width;
      });

      table.style.width = Math.max(totalWidth, gridContainer.clientWidth) + 'px';
    }

    function updateSortIndicators() {
      document.querySelectorAll('th[data-col]').forEach((header) => {
        const indicator = header.querySelector('.sort-indicator');
        const column = header.getAttribute('data-col');
        if (column === model.state.sortColumn) {
          header.classList.add('sorted');
          indicator.textContent = model.state.sortAscending ? '▲' : '▼';
        } else {
          header.classList.remove('sorted');
          indicator.textContent = '';
        }
      });
    }

    function getFilteredAnchors() {
      const includedTypes = model.state.includedTypes ? new Set(model.state.includedTypes) : undefined;
      const searchQuery = model.state.searchQuery.trim().toLowerCase();

      return model.anchors.filter((anchor) => {
        if (includedTypes && !includedTypes.has(anchor.tag)) {
          return false;
        }

        if (!searchQuery) {
          return true;
        }

        const haystack = [
          anchor.tag,
          anchor.description,
          anchor.owner || '',
          anchor.issueRef || '',
          anchor.dueDate || '',
          anchor.filePath,
          anchor.repository ? anchor.repository.label : '',
          anchor.project ? anchor.project.label : '',
        ].join(' ').toLowerCase();

        return haystack.includes(searchQuery);
      });
    }

    function getSortedAnchors(anchors) {
      return [...anchors].sort((left, right) => {
        const column = model.state.sortColumn;

        if (column === 'line') {
          return model.state.sortAscending
            ? left.lineNumber - right.lineNumber
            : right.lineNumber - left.lineNumber;
        }

        let leftValue = '';
        let rightValue = '';

        switch (column) {
          case 'type':
            leftValue = left.tag;
            rightValue = right.tag;
            break;
          case 'description':
            leftValue = left.description || '';
            rightValue = right.description || '';
            break;
          case 'file':
            leftValue = left.filePath;
            rightValue = right.filePath;
            break;
          case 'owner':
            leftValue = left.owner || '';
            rightValue = right.owner || '';
            break;
          case 'issue':
            leftValue = left.issueRef || '';
            rightValue = right.issueRef || '';
            break;
          case 'dueDate':
            leftValue = left.dueDate || '9999-12-31';
            rightValue = right.dueDate || '9999-12-31';
            break;
        }

        const comparison = leftValue.localeCompare(rightValue);
        return model.state.sortAscending ? comparison : -comparison;
      });
    }

    function render() {
      hideContextMenu();
      const filtered = getFilteredAnchors();
      const sorted = getSortedAnchors(filtered);

      if (sorted.length === 0) {
        body.innerHTML = '';
        table.style.display = 'none';
        emptyState.style.display = 'flex';
        if (model.anchors.length === 0) {
          emptyMessage.textContent = 'No code anchors found for this scope';
          emptyHint.textContent = 'Change the scope, scan again, or open a document that belongs to a workspace folder.';
        } else {
          emptyMessage.textContent = 'No code anchors match the current filters';
          emptyHint.textContent = 'Adjust the search box or type filter to widen the result set.';
        }
        return;
      }

      table.style.display = '';
      emptyState.style.display = 'none';
      body.innerHTML = '';

      sorted.forEach((anchor, index) => {
        const row = document.createElement('tr');
        row.className = 'clickable';
        row.dataset.index = String(index);
        row.addEventListener('click', () => {
          vscode.postMessage({ type: 'navigateTo', filePath: anchor.filePath, lineNumber: anchor.lineNumber });
        });
        row.addEventListener('contextmenu', (event) => {
          if (event.target.closest('input, textarea')) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          const cell = event.target.closest('td');
          showContextMenu(event.clientX, event.clientY, anchor, cell ? cell.dataset.copyValue || '' : '');
        });

        row.appendChild(createTypeCell(anchor));
        row.appendChild(createTextCell(anchor.description || '(no description)', 'description'));
        row.appendChild(createTextCell(getRelativePath(anchor), 'file', anchor.filePath, 'file-cell'));
        row.appendChild(createTextCell(String(anchor.lineNumber + 1), 'line', String(anchor.lineNumber + 1), 'line-cell'));
        row.appendChild(createTextCell(anchor.owner || '', 'owner'));
        row.appendChild(createTextCell(anchor.issueRef || '', 'issue'));
        row.appendChild(createTextCell(anchor.dueDate ? formatLocaleDate(anchor.dueDate) : '', 'dueDate', anchor.dueDate || '', isOverdue(anchor.dueDate) ? 'overdue' : ''));

        body.appendChild(row);
      });
    }

    function createTypeCell(anchor) {
      const metadata = typeMetadata[anchor.tag] || { color: '#DAA520', codicon: 'symbol-misc' };
      const cell = document.createElement('td');
      cell.dataset.copyValue = anchor.tag;

      const wrapper = document.createElement('div');
      wrapper.className = 'type-cell';

      const icon = document.createElement('span');
      icon.className = 'type-icon codicon codicon-' + metadata.codicon;
      icon.style.color = metadata.color;

      const label = document.createElement('span');
      label.className = 'type-label';
      label.style.color = metadata.color;
      label.textContent = anchor.tag;

      wrapper.appendChild(icon);
      wrapper.appendChild(label);
      cell.appendChild(wrapper);

      return cell;
    }

    function createTextCell(text, column, copyValue, className) {
      const cell = document.createElement('td');
      cell.dataset.copyValue = typeof copyValue === 'string' ? copyValue : text;
      if (className) {
        cell.className = className;
      }

      const content = document.createElement('div');
      content.className = 'cell-content';
      content.textContent = text;
      if (column === 'file') {
        content.title = copyValue || text;
      }
      cell.appendChild(content);
      return cell;
    }

    function getRelativePath(anchor) {
      var filePath = anchor.filePath;

      // Scope-aware: strip scope root path (project, repo, folder, single-folder workspace)
      if (model.scopeRootPath) {
        var relative = stripPathPrefix(filePath, model.scopeRootPath);
        if (relative !== undefined) {
          return relative || filePath.split(/[\\\\/]/).pop() || filePath;
        }
      }

      // Workspace-folder-aware: strip folder path, prepend folder label
      if (anchor.workspaceFolder && anchor.workspaceFolder.path) {
        var relative = stripPathPrefix(filePath, anchor.workspaceFolder.path);
        if (relative !== undefined) {
          return anchor.workspaceFolder.label + '\\\\' + relative;
        }
      }

      // Fallback: last 3 segments
      var parts = filePath.split(/[\\\\/]/);
      return parts.length > 3 ? parts.slice(-3).join('\\\\') : filePath;
    }

    function stripPathPrefix(filePath, rootPath) {
      var normalizedFile = filePath.replace(/[/]/g, '\\\\').toLowerCase();
      var normalizedRoot = rootPath.replace(/[\\\\/]+$/, '').replace(/[/]/g, '\\\\').toLowerCase();
      if (!normalizedFile.startsWith(normalizedRoot)) {
        return undefined;
      }
      var relative = filePath.substring(normalizedRoot.length);
      if (relative.charAt(0) === '\\\\' || relative.charAt(0) === '/') {
        relative = relative.substring(1);
      }
      return relative;
    }

    function isOverdue(dateString) {
      if (!dateString) {
        return false;
      }

      return new Date(dateString + 'T00:00:00') < new Date();
    }

    function formatLocaleDate(dateString) {
      try {
        return new Date(dateString + 'T00:00:00').toLocaleDateString();
      } catch {
        return dateString;
      }
    }

    function showContextMenu(clientX, clientY, anchor, cellText) {
      contextMenuState = { anchor, cellText };
      copyCellBtn.disabled = !cellText;
      contextMenu.style.left = Math.max(8, Math.min(clientX, window.innerWidth - 160)) + 'px';
      contextMenu.style.top = Math.max(8, Math.min(clientY, window.innerHeight - 120)) + 'px';
      contextMenu.classList.add('open');
    }

    function hideContextMenu() {
      contextMenuState = undefined;
      contextMenu.classList.remove('open');
    }

    function persistLocalState() {
      vscode.setState({
        scopeId: model.state.scopeId,
        includedTypes: model.state.includedTypes,
        searchQuery: model.state.searchQuery,
        columnWidths: model.state.columnWidths,
        sortColumn: model.state.sortColumn,
        sortAscending: model.state.sortAscending,
      });
    }

    function persistGridPreferences() {
      persistLocalState();
      vscode.postMessage({
        type: 'persistGridState',
        state: {
          columnWidths: model.state.columnWidths,
          sortColumn: model.state.sortColumn,
          sortAscending: model.state.sortAscending,
        },
      });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'updateModel') {
        updateModel(message.model || model);
      }
    });

    updateSortIndicators();
  </script>
</body>
</html>`;
}
