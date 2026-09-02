import { ProtocolError } from '../protocol/errors.ts';
import type { TaskGraphNode, TaskGraphRevision, WriteScope } from '../protocol/schema.ts';
import { observeContinuation } from '../git/git-observer.ts';
import type { EventActor } from '../protocol/schema.ts';
import type { RoomService } from '../room/room-service.ts';

const GLOB_META = /[*?\[\]{}]/;

export function validateWriteScope(scope: WriteScope): void {
  const value = scope.path;
  if (value === '.') {
    if (scope.kind !== 'tree') {
      throw new ProtocolError('validation_failed', 'repository root scope must use kind=tree');
    }
    return;
  }
  if (
    value === '' ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.includes('\\') ||
    GLOB_META.test(value)
  ) {
    throw new ProtocolError('validation_failed', `invalid repository-relative write scope ${value}`);
  }
  const components = value.split('/');
  if (components.some((part) => part === '' || part === '.' || part === '..')) {
    throw new ProtocolError('validation_failed', `invalid write scope component in ${value}`);
  }
}

function contains(scope: WriteScope, path: string): boolean {
  if (scope.path === '.') return true;
  if (scope.kind === 'file') return path === scope.path;
  return path === scope.path || path.startsWith(`${scope.path}/`);
}

export function scopeContainsPath(scope: WriteScope, path: string): boolean {
  validateWriteScope(scope);
  if (path === '' || path.startsWith('/') || path.includes('\\')) return false;
  const components = path.split('/');
  if (components.some((part) => part === '' || part === '.' || part === '..')) return false;
  return contains(scope, path);
}

export function scopesOverlap(left: readonly WriteScope[], right: readonly WriteScope[]): boolean {
  for (const scope of [...left, ...right]) validateWriteScope(scope);
  return left.some((a) => right.some((b) => contains(a, b.path) || contains(b, a.path)));
}

export function dependencyAncestors(
  nodes: readonly TaskGraphNode[],
  nodeId: string,
): Set<string> {
  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  const result = new Set<string>();
  const visit = (id: string): void => {
    const node = byId.get(id);
    if (!node) return;
    for (const dependency of node.dependencies) {
      if (result.has(dependency)) continue;
      result.add(dependency);
      visit(dependency);
    }
  };
  visit(nodeId);
  return result;
}

export function validateTaskGraphRevision(revision: TaskGraphRevision): void {
  const nodeIds = new Set<string>();
  const taskIds = new Set<string>();
  const runIds = new Set<string>();
  for (const node of revision.nodes) {
    if (nodeIds.has(node.node_id) || taskIds.has(node.task_spec.task_id) || runIds.has(node.task_spec.run_id)) {
      throw new ProtocolError('validation_failed', 'revision node/task/run identifiers must be unique');
    }
    nodeIds.add(node.node_id);
    taskIds.add(node.task_spec.task_id);
    runIds.add(node.task_spec.run_id);
    if (node.task_spec.room_id !== revision.room_id) {
      throw new ProtocolError('validation_failed', `node ${node.node_id} task belongs to another room`);
    }
    for (const scope of node.write_scopes) validateWriteScope(scope);
  }
  for (const node of revision.nodes) {
    for (const dependency of node.dependencies) {
      if (!nodeIds.has(dependency)) {
        throw new ProtocolError('validation_failed', `node ${node.node_id} has missing dependency ${dependency}`);
      }
      if (dependency === node.node_id) {
        throw new ProtocolError('validation_failed', `node ${node.node_id} depends on itself`);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(revision.nodes.map((node) => [node.node_id, node]));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new ProtocolError('validation_failed', 'task graph contains a cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of revision.nodes) visit(node.node_id);

  if (revision.acceptance_policy === 'integration_only') {
    const integrations = revision.nodes.filter((node) => node.kind === 'integration');
    if (integrations.length !== 1) {
      throw new ProtocolError('validation_failed', 'integration_only requires exactly one integration node');
    }
    const integration = integrations[0];
    if (revision.nodes.some((node) => node.dependencies.includes(integration.node_id))) {
      throw new ProtocolError('validation_failed', 'integration node must be terminal');
    }
    const integrationAncestors = dependencyAncestors(revision.nodes, integration.node_id);
    const components = revision.nodes.filter((node) => node.kind !== 'integration');
    if (components.some((node) => !integrationAncestors.has(node.node_id))) {
      throw new ProtocolError('validation_failed', 'every component must reach the integration node');
    }
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const left = components[i];
        const right = components[j];
        const leftAncestors = dependencyAncestors(revision.nodes, left.node_id);
        const rightAncestors = dependencyAncestors(revision.nodes, right.node_id);
        if (!leftAncestors.has(right.node_id) && !rightAncestors.has(left.node_id)) {
          throw new ProtocolError('validation_failed', 'integration_only components must form a total dependency order');
        }
      }
    }
  } else if (revision.nodes.some((node) => node.kind === 'integration')) {
    throw new ProtocolError('validation_failed', 'integration nodes require integration_only policy');
  }
}

export function assertNoUnorderedScopeOverlap(revision: TaskGraphRevision): void {
  for (let i = 0; i < revision.nodes.length; i++) {
    for (let j = i + 1; j < revision.nodes.length; j++) {
      const left = revision.nodes[i];
      const right = revision.nodes[j];
      const leftAncestors = dependencyAncestors(revision.nodes, left.node_id);
      const rightAncestors = dependencyAncestors(revision.nodes, right.node_id);
      if (
        !leftAncestors.has(right.node_id) &&
        !rightAncestors.has(left.node_id) &&
        scopesOverlap(left.write_scopes, right.write_scopes)
      ) {
        throw new ProtocolError(
          'scope_conflict',
          `unordered nodes ${left.node_id} and ${right.node_id} have overlapping write scopes`,
        );
      }
    }
  }
}

// satisfiedRunIds 是显式完成的 dependency Run 集合（Review finding inc12-r1）：caller 必须
// 传入 Run accepted + NodeDispatch completed + scope_violated=false 三者齐全的 run_id 集合，
// pure eligibility 只消费该显式 completed/non-violated set，不自行放宽为 bare accepted Run。
export function orderedEligibleNodes(
  revision: TaskGraphRevision,
  satisfiedRunIds: ReadonlySet<string>,
  dispatchedNodeIds: ReadonlySet<string>,
): TaskGraphNode[] {
  const nodeOrder = new Map(revision.nodes.map((node, index) => [node.node_id, index]));
  const byId = new Map(revision.nodes.map((node) => [node.node_id, node]));
  return revision.nodes
    .filter(
      (node) =>
        !dispatchedNodeIds.has(node.node_id) &&
        node.dependencies.every((dependency) => satisfiedRunIds.has(byId.get(dependency)?.task_spec.run_id ?? '')),
    )
    .sort((a, b) => b.priority - a.priority || (nodeOrder.get(a.node_id) ?? 0) - (nodeOrder.get(b.node_id) ?? 0) || a.node_id.localeCompare(b.node_id));
}

export class PlanScheduler {
  private readonly service: RoomService;

  constructor(service: RoomService) {
    this.service = service;
  }

  async reconcile(
    input: { room_id: string; plan_id: string; worktrees: Array<{ node_id: string; dispatch_id: string; worktree_path?: string | null }> },
    actor: EventActor,
  ): Promise<ReturnType<RoomService['reconcilePlan']>> {
    const canonical = [] as Array<{ node_id: string; dispatch_id: string; canonical_worktree_path: string | null }>;
    for (const mapping of input.worktrees) {
      if (mapping.worktree_path == null) {
        canonical.push({ node_id: mapping.node_id, dispatch_id: mapping.dispatch_id, canonical_worktree_path: null });
        continue;
      }
      const observation = await observeContinuation(mapping.worktree_path);
      canonical.push({
        node_id: mapping.node_id,
        dispatch_id: mapping.dispatch_id,
        canonical_worktree_path: observation.repositoryRoot,
      });
    }
    return this.service.reconcilePlan(
      { room_id: input.room_id, plan_id: input.plan_id, worktrees: canonical },
      actor,
    );
  }
}
