export interface Project {
  project_id: string;
  name: string;
  project_path: string;
  database_path: string;
  room_id: string;
  control_participant_id: string;
  port: number | null;
  project_exists: boolean;
  database_exists: boolean;
  configuration_error: string | null;
}

export interface Entity { [key: string]: unknown }

export interface EventRecord extends Entity {
  sequence: number;
  type: string;
  summary: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
}

export interface RunRecord extends Entity {
  run_id: string;
  status: string;
  worktree_path: string | null;
  worker_participant_id: string;
  updated_at: string;
}

export interface RunWorkItem extends Entity {
  run_id: string;
  run_status: string;
  waiting_actor: string | null;
  current_task_id: string | null;
  current_attempt_id: string | null;
  current_question_id: string | null;
  current_review_id: string | null;
}

export interface Snapshot {
  room: { room_id: string; state: string; updated_at: string };
  participants: Entity[];
  role_assignments: Entity[];
  tasks: Entity[];
  runs: RunRecord[];
  attempts: Entity[];
  run_guidance: Entity[];
  reviews: Entity[];
  questions: Entity[];
  plans: Entity[];
  task_graph_revisions: Entity[];
  approvals: Entity[];
  node_dispatches: Entity[];
  git_actions: Entity[];
  graph_work_items: Entity[];
  plan_work_items: Entity[];
  planning_waiting_actor: string | null;
  run_work_items: RunWorkItem[];
  cursor: number;
  events: EventRecord[];
}

export interface GitState {
  branch: string | null;
  status: string[];
  worktrees: Array<{ path: string; head: string | null; branch: string | null; bare: boolean }>;
}
