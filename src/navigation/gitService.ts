import * as path from 'path';
import * as fs from 'fs';
import { GitRepositoryInfo, GitHostingProvider } from '../types';

const repoCache = new Map<string, GitRepositoryInfo | null>();
const gitDirCache = new Map<string, string | null>();

export interface RepositoryDescriptor {
  id: string;
  label: string;
  rootPath: string;
  info?: GitRepositoryInfo;
}

/**
 * Clears all cached repository information.
 */
export function clearGitCache(): void {
  repoCache.clear();
  gitDirCache.clear();
}

/**
 * Gets repository info for a file path by finding the Git repository root
 * and parsing the remote URL.
 */
export async function getRepositoryInfo(filePath: string): Promise<GitRepositoryInfo | undefined> {
  if (!filePath) return undefined;

  try {
    const gitDir = findGitDirectory(filePath);
    if (!gitDir) return undefined;

    const cached = repoCache.get(gitDir);
    if (cached !== undefined) return cached ?? undefined;

    const remoteUrl = await getOriginRemoteUrl(gitDir);
    if (!remoteUrl) {
      repoCache.set(gitDir, null);
      return undefined;
    }

    const info = parseRemoteUrl(remoteUrl);
    repoCache.set(gitDir, info ?? null);
    return info ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getRepositoryDescriptor(filePath: string): Promise<RepositoryDescriptor | undefined> {
  if (!filePath) return undefined;

  const gitDir = findGitDirectory(filePath);
  if (!gitDir) return undefined;

  const rootPath = path.dirname(gitDir);
  const info = await getRepositoryInfo(filePath);

  return {
    id: normalizePath(rootPath),
    label: path.basename(rootPath),
    rootPath,
    info,
  };
}

/**
 * Tries to get cached repository info synchronously.
 */
export function getCachedRepositoryInfo(filePath: string): GitRepositoryInfo | undefined {
  if (!filePath) return undefined;
  const gitDir = findGitDirectory(filePath);
  if (!gitDir) return undefined;
  const cached = repoCache.get(gitDir);
  return cached ?? undefined;
}

function findGitDirectory(startPath: string): string | null {
  const cached = gitDirCache.get(startPath);
  if (cached !== undefined) return cached;

  let directory = path.dirname(startPath);

  while (directory) {
    const gitDir = path.join(directory, '.git');
    try {
      const stat = fs.statSync(gitDir);
      if (stat.isDirectory() || stat.isFile()) {
        gitDirCache.set(startPath, gitDir);
        return gitDir;
      }
    } catch {
      // Not found, continue up
    }

    const parentDir = path.dirname(directory);
    if (parentDir === directory) break;
    directory = parentDir;
  }

  gitDirCache.set(startPath, null);
  return null;
}

async function getOriginRemoteUrl(gitDir: string): Promise<string | undefined> {
  const configPath = path.join(gitDir, 'config');
  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    let inOriginSection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('[')) {
        inOriginSection = line.toLowerCase() === '[remote "origin"]';
        continue;
      }
      if (inOriginSection && line.toLowerCase().startsWith('url')) {
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
          return line.substring(eqIndex + 1).trim();
        }
      }
    }
  } catch {
    // Config not found or not readable
  }
  return undefined;
}

// SCP-style remote: git@host:path
const SCP_REMOTE_REGEX = /^(?:[^@]+)@([^:]+):(.+)$/i;

interface RemoteUrlPattern {
  regex: RegExp;
  provider: GitHostingProvider;
  baseUrl: string;
  usesOrgProject?: boolean;
}

const KNOWN_PATTERNS: RemoteUrlPattern[] = [
  // GitHub
  { regex: /https?:\/\/github\.com\/([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.GitHub, baseUrl: 'https://github.com' },
  { regex: /git@github\.com:([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.GitHub, baseUrl: 'https://github.com' },
  // GitLab
  { regex: /https?:\/\/gitlab\.com\/([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.GitLab, baseUrl: 'https://gitlab.com' },
  { regex: /git@gitlab\.com:([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.GitLab, baseUrl: 'https://gitlab.com' },
  // Bitbucket
  { regex: /https?:\/\/bitbucket\.org\/([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.Bitbucket, baseUrl: 'https://bitbucket.org' },
  { regex: /git@bitbucket\.org:([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.Bitbucket, baseUrl: 'https://bitbucket.org' },
  // Azure DevOps (new)
  { regex: /https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/.]+)/i, provider: GitHostingProvider.AzureDevOps, baseUrl: 'https://dev.azure.com', usesOrgProject: true },
  { regex: /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/.]+)/i, provider: GitHostingProvider.AzureDevOps, baseUrl: 'https://dev.azure.com', usesOrgProject: true },
  // Azure DevOps (old)
  { regex: /https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/.]+)/i, provider: GitHostingProvider.AzureDevOps, baseUrl: 'https://dev.azure.com', usesOrgProject: true },
];

/**
 * Parses a remote URL to determine the hosting provider and repo info.
 * Exported for testing.
 */
export function parseRemoteUrl(remoteUrl: string): GitRepositoryInfo | undefined {
  if (!remoteUrl?.trim()) return undefined;

  // Try known patterns first
  for (const pattern of KNOWN_PATTERNS) {
    const match = pattern.regex.exec(remoteUrl);
    if (match) {
      if (pattern.usesOrgProject) {
        return {
          provider: pattern.provider,
          owner: match[1],
          repository: match[2],
          baseUrl: pattern.baseUrl,
        };
      }
      return {
        provider: pattern.provider,
        owner: match[1],
        repository: trimGitSuffix(match[2]),
        baseUrl: pattern.baseUrl,
      };
    }
  }

  // Try standard URL parsing for enterprise/self-hosted
  return tryParseStandardRemoteUrl(remoteUrl);
}

function tryParseStandardRemoteUrl(remoteUrl: string): GitRepositoryInfo | undefined {
  let host: string;
  let baseUrl: string;
  let pathSegments: string[];

  try {
    const url = new URL(remoteUrl);
    if (url.host) {
      host = url.host;
      baseUrl = `${url.protocol}//${url.host}`;
      pathSegments = url.pathname.split('/').filter(s => s);
    } else {
      return tryParseScp(remoteUrl);
    }
  } catch {
    return tryParseScp(remoteUrl);
  }

  if (pathSegments.length < 2) return undefined;

  const provider = getProviderFromHost(host, pathSegments.length);
  if (provider === GitHostingProvider.Unknown) return undefined;

  const repository = trimGitSuffix(pathSegments[pathSegments.length - 1]);
  if (!repository) return undefined;

  let owner: string;
  if (provider === GitHostingProvider.GitLab) {
    // GitLab supports nested groups
    owner = pathSegments.slice(0, -1).join('/');
  } else {
    if (pathSegments.length !== 2) return undefined;
    owner = pathSegments[0];
  }

  if (!owner) return undefined;

  return { provider, owner, repository, baseUrl };
}

function tryParseScp(remoteUrl: string): GitRepositoryInfo | undefined {
  const match = SCP_REMOTE_REGEX.exec(remoteUrl);
  if (!match) return undefined;

  const host = match[1];
  const baseUrl = `https://${host}`;
  const pathSegments = match[2].split('/').filter(s => s);

  if (pathSegments.length < 2) return undefined;

  const provider = getProviderFromHost(host, pathSegments.length);
  if (provider === GitHostingProvider.Unknown) return undefined;

  const repository = trimGitSuffix(pathSegments[pathSegments.length - 1]);
  if (!repository) return undefined;

  let owner: string;
  if (provider === GitHostingProvider.GitLab) {
    owner = pathSegments.slice(0, -1).join('/');
  } else {
    if (pathSegments.length !== 2) return undefined;
    owner = pathSegments[0];
  }

  return { provider, owner, repository, baseUrl };
}

function getProviderFromHost(host: string, segmentCount: number): GitHostingProvider {
  const lower = host.toLowerCase();
  if (lower.includes('gitlab')) return GitHostingProvider.GitLab;
  if (lower.includes('github')) return GitHostingProvider.GitHub;
  if (lower.includes('bitbucket')) return GitHostingProvider.Bitbucket;
  // Enterprise/self-hosted: infer from path depth
  return segmentCount > 2 ? GitHostingProvider.GitLab : GitHostingProvider.GitHub;
}

function trimGitSuffix(name: string): string {
  if (!name) return name;
  return name.endsWith('.git') ? name.slice(0, -4) : name;
}

function normalizePath(value: string): string {
  return value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}
