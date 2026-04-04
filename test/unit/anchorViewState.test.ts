import { describe, expect, it } from 'vitest';
import { AnchorMatch } from '../../src/anchors/anchorService';
import {
  buildAnchorScopeOptions,
  filterAnchors,
  formatAnchorCopyRow,
  resolveCurrentFolderPath,
  resolveScopeRootPath,
} from '../../src/anchors/anchorViewState';

function createAnchor(overrides: Partial<AnchorMatch> = {}): AnchorMatch {
  return {
    tag: 'TODO',
    fullText: 'TODO: Example',
    description: 'Example',
    filePath: 'C:\\Workspace\\App\\src\\File.cs',
    lineNumber: 4,
    column: 3,
    ...overrides,
  };
}

describe('anchorViewState', () => {
  it('filters anchors by current folder in a multi-root workspace', () => {
    const anchors = [
      createAnchor({
        filePath: 'C:\\Workspace\\App\\src\\File.cs',
        workspaceFolder: { id: 'c:\\workspace\\app', label: 'App', path: 'C:\\Workspace\\App' },
      }),
      createAnchor({
        filePath: 'C:\\Workspace\\Tools\\src\\Tool.cs',
        workspaceFolder: { id: 'c:\\workspace\\tools', label: 'Tools', path: 'C:\\Workspace\\Tools' },
      }),
    ];

    const filtered = filterAnchors(anchors, {
      scopeId: 'folder',
      includedTypes: undefined,
      searchQuery: '',
    }, {
      activeFilePath: 'C:\\Workspace\\Tools\\src\\Current.cs',
      openDocumentPaths: [],
      workspaceFolders: [
        { name: 'App', path: 'C:\\Workspace\\App' },
        { name: 'Tools', path: 'C:\\Workspace\\Tools' },
      ],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].filePath).toContain('\\Tools\\');
  });

  it('filters anchors by repo, project, type, and search text together', () => {
    const anchors = [
      createAnchor({
        tag: 'BUG',
        description: 'Critical payment bug',
        repository: { id: 'repo-a', label: 'org/repo-a', path: 'C:\\Workspace\\RepoA' },
        project: { id: 'proj-a', label: 'Payments', path: 'C:\\Workspace\\RepoA\\Payments\\Payments.csproj' },
      }),
      createAnchor({
        tag: 'TODO',
        description: 'Follow-up clean-up',
        repository: { id: 'repo-a', label: 'org/repo-a', path: 'C:\\Workspace\\RepoA' },
        project: { id: 'proj-a', label: 'Payments', path: 'C:\\Workspace\\RepoA\\Payments\\Payments.csproj' },
      }),
      createAnchor({
        tag: 'BUG',
        description: 'Different repo bug',
        repository: { id: 'repo-b', label: 'org/repo-b', path: 'C:\\Workspace\\RepoB' },
        project: { id: 'proj-b', label: 'Orders', path: 'C:\\Workspace\\RepoB\\Orders\\Orders.csproj' },
      }),
    ];

    const filtered = filterAnchors(anchors, {
      scopeId: 'repo:repo-a',
      includedTypes: ['BUG'],
      searchQuery: 'payment',
    }, {
      activeFilePath: undefined,
      openDocumentPaths: [],
      workspaceFolders: [{ name: 'Workspace', path: 'C:\\Workspace' }],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].description).toContain('payment');
  });

  it('builds repo and project scope options and disables current folder without context', () => {
    const anchors = [
      createAnchor({
        repository: { id: 'repo-a', label: 'org/repo-a', path: 'C:\\Workspace\\RepoA' },
        project: { id: 'proj-a', label: 'Payments', path: 'C:\\Workspace\\RepoA\\Payments\\Payments.csproj' },
      }),
    ];

    const options = buildAnchorScopeOptions(anchors, {
      activeFilePath: undefined,
      openDocumentPaths: [],
      workspaceFolders: [
        { name: 'RepoA', path: 'C:\\Workspace\\RepoA' },
        { name: 'RepoB', path: 'C:\\Workspace\\RepoB' },
      ],
    });

    expect(options.find(option => option.id === 'folder')?.enabled).toBe(false);
    expect(options.some(option => option.id === 'repo:repo-a')).toBe(true);
    expect(options.some(option => option.id === 'project:proj-a')).toBe(true);
  });

  it('uses the single workspace folder as current folder without an active editor', () => {
    expect(resolveCurrentFolderPath({
      activeFilePath: undefined,
      openDocumentPaths: [],
      workspaceFolders: [{ name: 'App', path: 'C:\\Workspace\\App' }],
    })).toBe('C:\\Workspace\\App');
  });

  it('formats copied rows predictably', () => {
    const text = formatAnchorCopyRow(
      createAnchor({ tag: 'BUG', description: 'Fix auth edge case', lineNumber: 11 }),
      'src\\auth\\login.ts',
    );

    expect(text).toBe('BUG | Fix auth edge case | src\\auth\\login.ts:12');
  });
});

describe('resolveScopeRootPath', () => {
  const context = {
    activeFilePath: 'c:\\project\\src\\file.cs',
    openDocumentPaths: [] as string[],
    workspaceFolders: [{ name: 'project', path: 'c:\\project' }],
  };

  const anchors: AnchorMatch[] = [
    createAnchor({
      filePath: 'c:\\project\\src\\file.cs',
      repository: { id: 'repo1', label: 'MyRepo', path: 'c:\\project' },
      project: { id: 'proj1', label: 'MyProject', path: 'c:\\project\\src' },
    }),
  ];

  it('should return workspace folder for single-folder workspace', () => {
    expect(resolveScopeRootPath('workspace', context, anchors)).toBe('c:\\project');
  });

  it('should return undefined for multi-root workspace', () => {
    const multiRoot = {
      ...context,
      workspaceFolders: [
        { name: 'a', path: 'c:\\a' },
        { name: 'b', path: 'c:\\b' },
      ],
    };
    expect(resolveScopeRootPath('workspace', multiRoot, anchors)).toBeUndefined();
  });

  it('should return current folder path for folder scope', () => {
    expect(resolveScopeRootPath('folder', context, anchors)).toBe('c:\\project');
  });

  it('should return repo path for repo scope', () => {
    expect(resolveScopeRootPath('repo:repo1', context, anchors)).toBe('c:\\project');
  });

  it('should return project path for project scope', () => {
    expect(resolveScopeRootPath('project:proj1', context, anchors)).toBe('c:\\project\\src');
  });

  it('should return undefined for document scope', () => {
    expect(resolveScopeRootPath('document', context, anchors)).toBeUndefined();
  });

  it('should return undefined for openDocuments scope', () => {
    expect(resolveScopeRootPath('openDocuments', context, anchors)).toBeUndefined();
  });
});
