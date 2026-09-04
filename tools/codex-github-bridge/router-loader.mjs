import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadRouter({ repositoryRoot, source, readerPath = '.github/scripts/read-router-contract.mjs' }) {
  const module = await import(pathToFileURL(resolve(repositoryRoot, readerPath)).href);
  if (typeof module.readRouterContract !== 'function') {
    throw new Error(`Router reader does not export readRouterContract: ${readerPath}`);
  }
  return module.readRouterContract(source);
}
