export function normalizeOwnedPath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function treeRoot(pattern) {
  const normalized = normalizeOwnedPath(pattern);
  return normalized.endsWith('/**') ? normalized.slice(0, -3) : null;
}

export function ownedPathMatches(pattern, candidate) {
  const owned = normalizeOwnedPath(pattern);
  const actual = normalizeOwnedPath(candidate);
  const root = treeRoot(owned);
  return root === null ? owned === actual : actual === root || actual.startsWith(`${root}/`);
}

export function scopesOverlap(left, right) {
  const a = normalizeOwnedPath(left);
  const b = normalizeOwnedPath(right);
  const aRoot = treeRoot(a);
  const bRoot = treeRoot(b);
  if (aRoot === null && bRoot === null) return a === b;
  if (aRoot !== null && bRoot !== null) {
    return aRoot === bRoot || aRoot.startsWith(`${bRoot}/`) || bRoot.startsWith(`${aRoot}/`);
  }
  return aRoot !== null ? ownedPathMatches(a, b) : ownedPathMatches(b, a);
}

export function tasksOverlap(left, right) {
  return left.owns.some((a) => right.owns.some((b) => scopesOverlap(a, b)));
}

export function assertOwnedFiles(task, files) {
  const outside = files.filter((file) => !task.owns.some((pattern) => ownedPathMatches(pattern, file)));
  if (outside.length > 0) throw new Error(`changed files outside owned paths: ${outside.join(', ')}`);
}

export function safePathComponent(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}
