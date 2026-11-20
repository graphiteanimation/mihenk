import { pathToFileURL } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  if (/^[a-zA-Z]:[\\/]/.test(specifier)) specifier = pathToFileURL(specifier).href;
  return nextResolve(specifier, context);
}
