import * as path from 'path';
import * as vscode from 'vscode';
import { AnchorMatch, AnchorScopeEntity } from './anchorService';
import { getRepositoryDescriptor } from '../navigation/gitService';

export interface DiscoveredProject {
  id: string;
  label: string;
  path: string;
  directoryPath: string;
}

interface AnchorFileMetadata {
  workspaceFolder?: AnchorScopeEntity;
  repository?: AnchorScopeEntity;
  project?: AnchorScopeEntity;
}

export async function discoverWorkspaceProjects(ignoredFolders: string[]): Promise<DiscoveredProject[]> {
  const excludePattern = ignoredFolders.length > 0
    ? `{${ignoredFolders.map(folder => `**/${folder}/**`).join(',')}}`
    : undefined;
  const projectFiles = await vscode.workspace.findFiles('**/*.csproj', excludePattern);

  return projectFiles
    .map(file => createProject(file.fsPath))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export async function enrichAnchorsWithMetadata(
  anchors: readonly AnchorMatch[],
  projects: readonly DiscoveredProject[],
): Promise<AnchorMatch[]> {
  const metadataByFile = new Map<string, Promise<AnchorFileMetadata>>();

  return Promise.all(anchors.map(async anchor => {
    let metadataPromise = metadataByFile.get(anchor.filePath);
    if (!metadataPromise) {
      metadataPromise = resolveFileMetadata(anchor.filePath, projects);
      metadataByFile.set(anchor.filePath, metadataPromise);
    }

    const metadata = await metadataPromise;
    return {
      ...anchor,
      ...metadata,
    };
  }));
}

export function resolveNearestProject(
  filePath: string,
  projects: readonly DiscoveredProject[],
): DiscoveredProject | undefined {
  const normalizedFilePath = normalizePath(filePath);

  return [...projects]
    .filter(project => normalizedFilePath === normalizePath(project.directoryPath)
      || normalizedFilePath.startsWith(`${normalizePath(project.directoryPath)}\\`))
    .sort((left, right) => right.directoryPath.length - left.directoryPath.length)[0];
}

function createProject(projectPath: string): DiscoveredProject {
  return {
    id: normalizePath(projectPath),
    label: path.basename(projectPath, path.extname(projectPath)),
    path: projectPath,
    directoryPath: path.dirname(projectPath),
  };
}

async function resolveFileMetadata(
  filePath: string,
  projects: readonly DiscoveredProject[],
): Promise<AnchorFileMetadata> {
  const repository = await getRepositoryDescriptor(filePath);
  const project = resolveNearestProject(filePath, projects);

  return {
    workspaceFolder: getWorkspaceFolderEntity(filePath),
    repository: repository
      ? {
          id: repository.id,
          label: repository.label,
          path: repository.rootPath,
        }
      : undefined,
    project: project
      ? {
          id: project.id,
          label: project.label,
          path: project.directoryPath,
        }
      : undefined,
  };
}

function getWorkspaceFolderEntity(filePath: string): AnchorScopeEntity | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!workspaceFolder) {
    return undefined;
  }

  return {
    id: normalizePath(workspaceFolder.uri.fsPath),
    label: workspaceFolder.name,
    path: workspaceFolder.uri.fsPath,
  };
}

function normalizePath(value: string): string {
  return value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}
