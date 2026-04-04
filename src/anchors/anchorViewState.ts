import { AnchorMatch } from './anchorService';

export type AnchorBaseScopeId = 'workspace' | 'folder' | 'document' | 'openDocuments';
export type AnchorScopeId = AnchorBaseScopeId | `repo:${string}` | `project:${string}`;
export type AnchorScopeKind = 'workspace' | 'folder' | 'document' | 'openDocuments' | 'repo' | 'project';
export type AnchorGridColumn = 'type' | 'description' | 'file' | 'line' | 'owner' | 'issue' | 'dueDate';

export interface AnchorFilterContext {
  activeFilePath?: string;
  openDocumentPaths: string[];
  workspaceFolders: ReadonlyArray<{
    name: string;
    path: string;
  }>;
}

export interface AnchorScopeOption {
  id: AnchorScopeId;
  kind: AnchorScopeKind;
  label: string;
  enabled: boolean;
  description?: string;
}

export interface AnchorViewState {
  scopeId: AnchorScopeId;
  includedTypes?: string[];
  searchQuery: string;
  columnWidths: Record<AnchorGridColumn, number>;
  sortColumn: AnchorGridColumn;
  sortAscending: boolean;
}

export const DEFAULT_ANCHOR_SCOPE: AnchorScopeId = 'workspace';

export const DEFAULT_COLUMN_WIDTHS: Record<AnchorGridColumn, number> = {
  type: 140,
  description: 420,
  file: 260,
  line: 72,
  owner: 120,
  issue: 100,
  dueDate: 120,
};

export function createDefaultAnchorViewState(): AnchorViewState {
  return {
    scopeId: DEFAULT_ANCHOR_SCOPE,
    includedTypes: undefined,
    searchQuery: '',
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    sortColumn: 'file',
    sortAscending: true,
  };
}

export function normalizeAnchorViewState(value: Partial<AnchorViewState> | undefined): AnchorViewState {
  const defaults = createDefaultAnchorViewState();
  const includedTypes = value?.includedTypes
    ? [...new Set(value.includedTypes.filter(Boolean).map(type => type.toUpperCase()))].sort()
    : undefined;

  return {
    scopeId: value?.scopeId ?? defaults.scopeId,
    includedTypes,
    searchQuery: value?.searchQuery?.trim() ?? defaults.searchQuery,
    columnWidths: {
      ...DEFAULT_COLUMN_WIDTHS,
      ...(value?.columnWidths ?? {}),
    },
    sortColumn: value?.sortColumn ?? defaults.sortColumn,
    sortAscending: value?.sortAscending ?? defaults.sortAscending,
  };
}

export function getAvailableAnchorTypes(anchors: readonly AnchorMatch[]): string[] {
  return [...new Set(anchors.map(anchor => anchor.tag))].sort((left, right) => left.localeCompare(right));
}

export function buildAnchorScopeOptions(
  anchors: readonly AnchorMatch[],
  context: AnchorFilterContext,
): AnchorScopeOption[] {
  const currentFolderPath = resolveCurrentFolderPath(context);
  const currentFolder = currentFolderPath
    ? context.workspaceFolders.find(folder => arePathsEqual(folder.path, currentFolderPath))
    : undefined;
  const activeDocumentAvailable = Boolean(context.activeFilePath);
  const openDocumentsAvailable = context.openDocumentPaths.length > 0;

  const options: AnchorScopeOption[] = [
    {
      id: 'workspace',
      kind: 'workspace',
      label: 'Workspace',
      enabled: true,
    },
    {
      id: 'folder',
      kind: 'folder',
      label: 'Current Folder',
      enabled: Boolean(currentFolderPath),
      description: currentFolder?.name,
    },
    {
      id: 'document',
      kind: 'document',
      label: 'Current Document',
      enabled: activeDocumentAvailable,
    },
    {
      id: 'openDocuments',
      kind: 'openDocuments',
      label: 'Open Documents',
      enabled: openDocumentsAvailable,
      description: openDocumentsAvailable ? `${context.openDocumentPaths.length} open` : undefined,
    },
  ];

  const repositories = new Map<string, { label: string }>();
  const projects = new Map<string, { label: string }>();

  for (const anchor of anchors) {
    if (anchor.repository) {
      repositories.set(anchor.repository.id, { label: anchor.repository.label });
    }
    if (anchor.project) {
      projects.set(anchor.project.id, { label: anchor.project.label });
    }
  }

  for (const [id, repository] of [...repositories.entries()].sort((left, right) => left[1].label.localeCompare(right[1].label))) {
    options.push({
      id: `repo:${id}`,
      kind: 'repo',
      label: `Repo: ${repository.label}`,
      enabled: true,
    });
  }

  for (const [id, project] of [...projects.entries()].sort((left, right) => left[1].label.localeCompare(right[1].label))) {
    options.push({
      id: `project:${id}`,
      kind: 'project',
      label: `Project: ${project.label}`,
      enabled: true,
    });
  }

  return options;
}

export function ensureValidScopeId(scopeId: AnchorScopeId, options: readonly AnchorScopeOption[]): AnchorScopeId {
  const option = options.find(candidate => candidate.id === scopeId);
  if (!option || !option.enabled) {
    return DEFAULT_ANCHOR_SCOPE;
  }

  return option.id;
}

export function getScopeLabel(scopeId: AnchorScopeId, options: readonly AnchorScopeOption[]): string {
  return options.find(option => option.id === scopeId)?.label ?? 'Workspace';
}

export function filterAnchors(
  anchors: readonly AnchorMatch[],
  state: Pick<AnchorViewState, 'scopeId' | 'includedTypes' | 'searchQuery'>,
  context: AnchorFilterContext,
): AnchorMatch[] {
  const scoped = applyScopeFilter(anchors, state.scopeId, context);
  const typeFiltered = applyTypeFilter(scoped, state.includedTypes);
  return applySearchFilter(typeFiltered, state.searchQuery);
}

export function resolveCurrentFolderPath(context: AnchorFilterContext): string | undefined {
  const singleWorkspaceFolder = context.workspaceFolders.length === 1 ? context.workspaceFolders[0] : undefined;

  if (context.activeFilePath) {
    const containingFolder = resolveWorkspaceFolderForFile(context.activeFilePath, context.workspaceFolders);
    if (containingFolder) {
      return containingFolder.path;
    }
  }

  return singleWorkspaceFolder?.path;
}

export function formatAnchorCopyRow(anchor: AnchorMatch, displayPath: string): string {
  const description = anchor.description || '(no description)';
  return `${anchor.tag} | ${description} | ${displayPath}:${anchor.lineNumber + 1}`;
}

export function resolveScopeRootPath(
  scopeId: AnchorScopeId,
  context: AnchorFilterContext,
  anchors: readonly AnchorMatch[],
): string | undefined {
  if (scopeId === 'workspace') {
    return context.workspaceFolders.length === 1
      ? context.workspaceFolders[0].path
      : undefined;
  }

  if (scopeId === 'folder') {
    return resolveCurrentFolderPath(context);
  }

  if (scopeId === 'document') {
    return undefined;
  }

  if (scopeId === 'openDocuments') {
    return undefined;
  }

  if (scopeId.startsWith('repo:')) {
    const repoId = scopeId.slice('repo:'.length);
    const anchor = anchors.find(a => a.repository?.id === repoId);
    return anchor?.repository?.path;
  }

  if (scopeId.startsWith('project:')) {
    const projectId = scopeId.slice('project:'.length);
    const anchor = anchors.find(a => a.project?.id === projectId);
    return anchor?.project?.path;
  }

  return undefined;
}

function applyScopeFilter(
  anchors: readonly AnchorMatch[],
  scopeId: AnchorScopeId,
  context: AnchorFilterContext,
): AnchorMatch[] {
  if (scopeId === 'workspace') {
    return [...anchors];
  }

  if (scopeId === 'folder') {
    const folderPath = resolveCurrentFolderPath(context);
    if (!folderPath) {
      return [];
    }

    return anchors.filter(anchor => isSamePathOrDescendant(anchor.filePath, folderPath));
  }

  if (scopeId === 'document') {
    const activeFilePath = context.activeFilePath;
    if (!activeFilePath) {
      return [];
    }

    return anchors.filter(anchor => arePathsEqual(anchor.filePath, activeFilePath));
  }

  if (scopeId === 'openDocuments') {
    const openDocuments = new Set(context.openDocumentPaths.map(normalizePath));
    return anchors.filter(anchor => openDocuments.has(normalizePath(anchor.filePath)));
  }

  if (scopeId.startsWith('repo:')) {
    const repositoryId = scopeId.slice('repo:'.length);
    return anchors.filter(anchor => anchor.repository?.id === repositoryId);
  }

  if (scopeId.startsWith('project:')) {
    const projectId = scopeId.slice('project:'.length);
    return anchors.filter(anchor => anchor.project?.id === projectId);
  }

  return [...anchors];
}

function applyTypeFilter(anchors: readonly AnchorMatch[], includedTypes?: string[]): AnchorMatch[] {
  if (!includedTypes) {
    return [...anchors];
  }

  const included = new Set(includedTypes.map(type => type.toUpperCase()));
  return anchors.filter(anchor => included.has(anchor.tag));
}

function applySearchFilter(anchors: readonly AnchorMatch[], searchQuery: string): AnchorMatch[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...anchors];
  }

  return anchors.filter(anchor => {
    const haystack = [
      anchor.tag,
      anchor.description,
      anchor.owner ?? '',
      anchor.issueRef ?? '',
      anchor.dueDate ?? '',
      anchor.anchorName ?? '',
      anchor.filePath,
      anchor.workspaceFolder?.label ?? '',
      anchor.repository?.label ?? '',
      anchor.project?.label ?? '',
    ].join(' ').toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function resolveWorkspaceFolderForFile(
  filePath: string,
  workspaceFolders: AnchorFilterContext['workspaceFolders'],
): AnchorFilterContext['workspaceFolders'][number] | undefined {
  return [...workspaceFolders]
    .filter(folder => isSamePathOrDescendant(filePath, folder.path))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function isSamePathOrDescendant(filePath: string, parentPath: string): boolean {
  const normalizedFilePath = normalizePath(filePath);
  const normalizedParentPath = normalizePath(parentPath);

  return normalizedFilePath === normalizedParentPath
    || normalizedFilePath.startsWith(`${normalizedParentPath}\\`);
}

function arePathsEqual(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  return value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}
