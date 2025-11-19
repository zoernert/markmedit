import simpleGit, { SimpleGit } from 'simple-git';
import { config } from '../config/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

let git: SimpleGit | null = null;

export async function initializeGit() {
  const repoPath = config.git.repoPath;
  
  // Create directory if it doesn't exist
  await fs.mkdir(repoPath, { recursive: true });
  
  git = simpleGit(repoPath);
  
  // Check if it's already a git repo
  const isRepo = await git.checkIsRepo();
  
  if (!isRepo) {
    await git.init();
    await git.addConfig('user.name', config.git.authorName);
    await git.addConfig('user.email', config.git.authorEmail);
    
    // Create initial commit
    const readmePath = path.join(repoPath, 'README.md');
    await fs.writeFile(readmePath, '# MarkMEdit Documents\n\nThis repository contains all documents managed by MarkMEdit.\n');
    await git.add('README.md');
    await git.commit('Initial commit');
    
    console.log('✓ Git repository initialized');
  } else {
    console.log('✓ Using existing Git repository');
  }
}

export function getGit() {
  if (!git) {
    throw new Error('Git not initialized');
  }
  return git;
}

export async function saveDocument(slug: string, content: string, commitMessage?: string) {
  const git = getGit();
  const filePath = path.join(config.git.repoPath, `${slug}.md`);
  
  await fs.writeFile(filePath, content, 'utf-8');
  
  if (config.git.autoCommit) {
    await git.add(`${slug}.md`);
    await git.commit(commitMessage || `Update ${slug}`);
  }
  
  return filePath;
}

export async function getDocumentHistory(slug: string) {
  const git = getGit();
  const log = await git.log({ file: `${slug}.md` });
  return log.all;
}

export async function getDocumentVersion(slug: string, commitHash: string) {
  const git = getGit();
  const content = await git.show([`${commitHash}:${slug}.md`]);
  return content;
}
