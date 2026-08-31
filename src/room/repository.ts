import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ProtocolError } from '../protocol/errors.ts';
import { PROTOCOL_VERSION } from '../protocol/schema.ts';
import type {
  Event,
  EventActor,
  ParticipantProfile,
  PersistedTask,
  Question,
  Review,
  Role,
  RoleAssignment,
  RoomState,
  Run,
  RunAttempt,
  RunGuidance,
} from '../protocol/schema.ts';

// rooms.state 的持久化 shape。协议未定义独立 Room entity，这里只保存 room_id、
// 当前 state 与时间戳；state 的修改由 application service 通过 transition 校验后执行。
export interface RoomRecord {
  room_id: string;
  state: RoomState;
  created_at: string;
  updated_at: string;
}

type EntityTable = 'tasks' | 'reviews' | 'questions' | 'participants' | 'role_assignments';

const TABLE_ID_COLUMN: Record<EntityTable, string> = {
  tasks: 'task_id',
  reviews: 'review_id',
  questions: 'question_id',
  participants: 'participant_id',
  role_assignments: 'assignment_id',
};

interface JsonRow {
  content_json: string;
}

function isSqliteUniqueError(err: unknown): err is Error {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed');
}

// SQLite 是协作实体与状态机的唯一权威来源。repository 只提供 entity CRUD 与
// event append；不暴露任何绕过 transition 校验的 rooms.state 修改原语。
// v0.4 为支持跨 process 并发事实增加 projection columns 与 partial unique index，
// 并把约束竞争映射为稳定 domain error（run_already_active / worktree_already_owned /
// id_conflict），不泄漏 raw SQLite error。
export class RoomRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    // 多 Run 的并发 CLI process 通过同一 file-backed database 串行化写事务：写锁竞争
    // 等待而非立刻 SQLITE_BUSY，使 loser 在 winner commit 后以 fresh state 走 guard 或
    // unique index 映射路径，保证 double-claim/cancel/settle 竞争确定性收敛。
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.assertWritableProtocol();
    this.createSchema();
    this.writeProtocolVersion();
  }

  // v0.4 writable open 门禁：fresh database 直接建 schema 并写入 protocol metadata；
  // 已有 rooms 等表但无 protocol metadata 的是 v0.2 archive，任何 schema write 前拒绝；
  // 已有 metadata 但 version 不 exact 匹配（v0.3）同样拒绝，绝不原地改写旧数据。
  private assertWritableProtocol(): void {
    const tables = new Set(
      (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>).map((row) => row.name),
    );
    if (tables.size === 0) return; // fresh database：createSchema 后写入 metadata
    if (!tables.has('protocol_metadata')) {
      throw new ProtocolError(
        'protocol_version_mismatch',
        'database is a v0.2 archive without protocol metadata; v0.4 writable open refused',
      );
    }
    const row = this.db
      .prepare('SELECT protocol_version FROM protocol_metadata LIMIT 1')
      .get() as { protocol_version: string } | undefined;
    if (row?.protocol_version !== PROTOCOL_VERSION) {
      throw new ProtocolError(
        'protocol_version_mismatch',
        `database protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${row?.protocol_version ?? '(missing)'}`,
      );
    }
  }

  private writeProtocolVersion(): void {
    // fresh database 只写入一次；已存在的相同 version 由 assertWritableProtocol 放行。
    // read-only 连接（Status CLI）下已存在 metadata 时不做任何写尝试。
    const existing = this.db
      .prepare('SELECT protocol_version FROM protocol_metadata LIMIT 1')
      .get() as { protocol_version: string } | undefined;
    if (existing) return;
    this.db.prepare('INSERT INTO protocol_metadata (protocol_version) VALUES (?)').run(PROTOCOL_VERSION);
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS protocol_metadata (
        protocol_version TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        status TEXT NOT NULL,
        worktree_path TEXT,
        content_json TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_unaccepted_worktree
        ON runs(worktree_path) WHERE worktree_path IS NOT NULL AND status != 'accepted';
      CREATE TABLE IF NOT EXISTS run_attempts (
        attempt_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        attempt_no INTEGER NOT NULL,
        status TEXT NOT NULL,
        content_json TEXT NOT NULL,
        UNIQUE(run_id, attempt_no)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_run_attempts_active
        ON run_attempts(run_id)
        WHERE status IN ('running', 'decision_requested', 'cancel_requested');
      CREATE TABLE IF NOT EXISTS run_guidance (
        guidance_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        content_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        review_id TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS questions (
        question_id TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participants (
        participant_id TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS role_assignments (
        assignment_id TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        content_json TEXT NOT NULL,
        UNIQUE(room_id, sequence)
      );
    `);
  }

  // ---- Room ----
  createRoom(roomId: string, createdAt: string): { room: RoomRecord; created: boolean } {
    const existing = this.getRoom(roomId);
    if (existing) return { room: existing, created: false };
    this.db
      .prepare('INSERT INTO rooms (room_id, state, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(roomId, 'DISCUSSION', createdAt, createdAt);
    const room = this.getRoom(roomId);
    if (!room) throw new ProtocolError('entity_not_found', `room ${roomId} missing after create`);
    return { room, created: true };
  }

  getRoom(roomId: string): RoomRecord | null {
    const row = this.db
      .prepare('SELECT room_id, state, created_at, updated_at FROM rooms WHERE room_id = ?')
      .get(roomId) as RoomRecord | undefined;
    return row ?? null;
  }

  // ---- Tasks / Reviews / Questions ----
  getTask(taskId: string): PersistedTask | null {
    return this.getEntity<PersistedTask>('tasks', 'task_id', taskId);
  }

  getReview(reviewId: string): Review | null {
    return this.getEntity<Review>('reviews', 'review_id', reviewId);
  }

  getQuestion(questionId: string): Question | null {
    return this.getEntity<Question>('questions', 'question_id', questionId);
  }

  insertTask(task: PersistedTask): { created: boolean } {
    return this.insertEntity('tasks', task.task_id, task);
  }

  insertReview(review: Review): { created: boolean } {
    return this.insertEntity('reviews', review.review_id, review);
  }

  insertQuestion(question: Question): { created: boolean } {
    return this.insertEntity('questions', question.question_id, question);
  }

  updateQuestion(question: Question): void {
    this.db
      .prepare('UPDATE questions SET content_json = ? WHERE question_id = ?')
      .run(JSON.stringify(question), question.question_id);
  }

  // ---- Runs（projection columns 与 content_json 同步维护）----
  getRun(runId: string): Run | null {
    const row = this.db.prepare('SELECT content_json FROM runs WHERE run_id = ?').get(runId) as
      | JsonRow
      | undefined;
    return row ? (JSON.parse(row.content_json) as Run) : null;
  }

  insertRun(run: Run): { created: boolean } {
    const contentJson = JSON.stringify(run);
    const existing = this.db.prepare('SELECT content_json FROM runs WHERE run_id = ?').get(run.run_id) as
      | JsonRow
      | undefined;
    if (existing) {
      if (existing.content_json === contentJson) return { created: false };
      throw new ProtocolError('id_conflict', `run id ${run.run_id} already exists with different content`);
    }
    try {
      this.db
        .prepare('INSERT INTO runs (run_id, room_id, status, worktree_path, content_json) VALUES (?, ?, ?, ?, ?)')
        .run(run.run_id, run.room_id, run.status, run.worktree_path, contentJson);
    } catch (err) {
      if (isSqliteUniqueError(err)) {
        if (err.message.includes('idx_runs_unaccepted_worktree') || err.message.includes('runs.worktree_path')) {
          throw new ProtocolError('worktree_already_owned', `worktree ${run.worktree_path ?? ''} is already owned by an unaccepted run`);
        }
        if (err.message.includes('runs.run_id')) {
          throw new ProtocolError('id_conflict', `run id ${run.run_id} already exists with different content`);
        }
      }
      throw err;
    }
    return { created: true };
  }

  updateRun(run: Run): void {
    try {
      this.db
        .prepare('UPDATE runs SET room_id = ?, status = ?, worktree_path = ?, content_json = ? WHERE run_id = ?')
        .run(run.room_id, run.status, run.worktree_path, JSON.stringify(run), run.run_id);
    } catch (err) {
      if (isSqliteUniqueError(err)) {
        if (err.message.includes('idx_runs_unaccepted_worktree') || err.message.includes('runs.worktree_path')) {
          throw new ProtocolError('worktree_already_owned', `worktree ${run.worktree_path ?? ''} is already owned by an unaccepted run`);
        }
      }
      throw err;
    }
  }

  // 指定 room 内全部 Run（rowid 升序，稳定读取顺序）。
  listRuns(roomId: string): Run[] {
    return this.listEntitiesByRoom<Run>('runs', roomId);
  }

  // ---- RunAttempts ----
  getAttempt(attemptId: string): RunAttempt | null {
    const row = this.db
      .prepare('SELECT content_json FROM run_attempts WHERE attempt_id = ?')
      .get(attemptId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as RunAttempt) : null;
  }

  insertAttempt(attempt: RunAttempt): { created: boolean } {
    const contentJson = JSON.stringify(attempt);
    const existing = this.db
      .prepare('SELECT content_json FROM run_attempts WHERE attempt_id = ?')
      .get(attempt.attempt_id) as JsonRow | undefined;
    if (existing) {
      if (existing.content_json === contentJson) return { created: false };
      throw new ProtocolError('id_conflict', `attempt id ${attempt.attempt_id} already exists with different content`);
    }
    try {
      this.db
        .prepare(
          'INSERT INTO run_attempts (attempt_id, run_id, room_id, task_id, attempt_no, status, content_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          attempt.attempt_id,
          attempt.run_id,
          attempt.room_id,
          attempt.task_id,
          attempt.attempt_no,
          attempt.status,
          contentJson,
        );
    } catch (err) {
      if (isSqliteUniqueError(err)) {
        // 同 attempt_id 并发首插：PK 冲突 → id_conflict（content 不同）。
        if (err.message.includes('run_attempts.attempt_id')) {
          throw new ProtocolError('id_conflict', `attempt id ${attempt.attempt_id} already exists with different content`);
        }
        // 同 Run 并发 claim：attempt_no 唯一约束或 active-attempt partial index 冲突。
        if (
          err.message.includes('idx_run_attempts_active') ||
          err.message.includes('run_attempts.run_id') ||
          err.message.includes('run_attempts.attempt_no')
        ) {
          throw new ProtocolError('run_already_active', `run ${attempt.run_id} already has an active or numbered attempt`);
        }
      }
      throw err;
    }
    return { created: true };
  }

  // 条件更新 attempt：expectedStatus 不匹配（另一 writer 已推进）时返回 false 且零写入。
  // settle/cancel 的 first-writer-wins 以此为最终 Oracle：winner 先写，loser 的 UPDATE
  // 命中 0 行后由 service 重新读取并走幂等/id_conflict 判定。
  updateAttemptIfStatus(attempt: RunAttempt, expectedStatus: string): boolean {
    const result = this.db
      .prepare(
        'UPDATE run_attempts SET status = ?, content_json = ? WHERE attempt_id = ? AND status = ?',
      )
      .run(attempt.status, JSON.stringify(attempt), attempt.attempt_id, expectedStatus);
    return result.changes > 0;
  }

  listAttemptsByRoom(roomId: string): RunAttempt[] {
    return this.listEntitiesByRoom<RunAttempt>('run_attempts', roomId);
  }

  // 同一 Run 的全部 attempt，attempt_no 升序（claim 顺序）。
  listAttemptsByRun(runId: string): RunAttempt[] {
    const rows = this.db
      .prepare("SELECT content_json FROM run_attempts WHERE json_extract(content_json, '$.run_id') = ? ORDER BY attempt_no ASC")
      .all(runId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.content_json) as RunAttempt);
  }

  // attempt_no 最大的 attempt（latest attempt of a Run）。
  latestAttemptForRun(runId: string): RunAttempt | null {
    const row = this.db
      .prepare(
        "SELECT content_json FROM run_attempts WHERE json_extract(content_json, '$.run_id') = ? ORDER BY attempt_no DESC LIMIT 1",
      )
      .get(runId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as RunAttempt) : null;
  }

  // 该 Run 当前 active（非终态）attempt；至多一个（partial unique index 保证）。
  activeAttemptForRun(runId: string): RunAttempt | null {
    const row = this.db
      .prepare(
        "SELECT content_json FROM run_attempts WHERE json_extract(content_json, '$.run_id') = ? AND status IN ('running', 'decision_requested', 'cancel_requested') ORDER BY attempt_no DESC LIMIT 1",
      )
      .get(runId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as RunAttempt) : null;
  }

  nextAttemptNo(runId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(json_extract(content_json, '$.attempt_no')), 0) AS max_no FROM run_attempts WHERE json_extract(content_json, '$.run_id') = ?")
      .get(runId) as { max_no: number };
    return row.max_no + 1;
  }

  // ---- RunGuidance ----
  getGuidance(guidanceId: string): RunGuidance | null {
    const row = this.db
      .prepare('SELECT content_json FROM run_guidance WHERE guidance_id = ?')
      .get(guidanceId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as RunGuidance) : null;
  }

  insertGuidance(guidance: RunGuidance): { created: boolean } {
    const contentJson = JSON.stringify(guidance);
    const existing = this.db
      .prepare('SELECT content_json FROM run_guidance WHERE guidance_id = ?')
      .get(guidance.guidance_id) as JsonRow | undefined;
    if (existing) {
      if (existing.content_json === contentJson) return { created: false };
      throw new ProtocolError('id_conflict', `guidance id ${guidance.guidance_id} already exists with different content`);
    }
    this.db
      .prepare('INSERT INTO run_guidance (guidance_id, run_id, room_id, content_json) VALUES (?, ?, ?, ?)')
      .run(guidance.guidance_id, guidance.run_id, guidance.room_id, contentJson);
    return { created: true };
  }

  updateGuidance(guidance: RunGuidance): void {
    this.db
      .prepare('UPDATE run_guidance SET content_json = ? WHERE guidance_id = ?')
      .run(JSON.stringify(guidance), guidance.guidance_id);
  }

  listGuidanceByRoom(roomId: string): RunGuidance[] {
    return this.listEntitiesByRoom<RunGuidance>('run_guidance', roomId);
  }

  // 未被消费的 guidance，rowid 升序（保存顺序，先保存先消费）。
  listUnconsumedGuidance(runId: string): RunGuidance[] {
    const rows = this.db
      .prepare(
        "SELECT content_json FROM run_guidance WHERE json_extract(content_json, '$.run_id') = ? AND json_extract(content_json, '$.consumed_by_attempt_id') IS NULL ORDER BY rowid ASC",
      )
      .all(runId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.content_json) as RunGuidance);
  }

  // 某 attempt 已消费的 guidance（same-ID claim retry 返回时重建首次消费事实）。
  listGuidanceConsumedBy(attemptId: string): RunGuidance[] {
    const rows = this.db
      .prepare(
        "SELECT content_json FROM run_guidance WHERE json_extract(content_json, '$.consumed_by_attempt_id') = ? ORDER BY rowid ASC",
      )
      .all(attemptId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.content_json) as RunGuidance);
  }

  // ---- Participants / RoleAssignments ----
  getParticipant(participantId: string): ParticipantProfile | null {
    return this.getEntity<ParticipantProfile>('participants', 'participant_id', participantId);
  }

  insertParticipant(profile: ParticipantProfile): { created: boolean } {
    return this.insertEntity('participants', profile.participant_id, profile);
  }

  updateParticipant(profile: ParticipantProfile): void {
    this.db
      .prepare('UPDATE participants SET content_json = ? WHERE participant_id = ?')
      .run(JSON.stringify(profile), profile.participant_id);
  }

  getRoleAssignment(assignmentId: string): RoleAssignment | null {
    return this.getEntity<RoleAssignment>('role_assignments', 'assignment_id', assignmentId);
  }

  insertRoleAssignment(assignment: RoleAssignment): { created: boolean } {
    return this.insertEntity('role_assignments', assignment.assignment_id, assignment);
  }

  // 同 scope/role 的最新 assignment 是 active；旧 assignment 只保留历史，resolution 不返回。
  // active 顺序只由成功 insert 的 rowid 决定（Review finding inc9-r5），不信任 caller
  // created_at：backdated/future created_at 不得操纵 active assignment；same-ID retry 不
  // 产生新 row，因此不提升旧 assignment。
  latestAssignment(
    roomId: string,
    scopeType: string,
    scopeId: string | null,
    role: Role,
  ): RoleAssignment | null {
    const row = this.db
      .prepare(
        `SELECT content_json FROM role_assignments WHERE
           json_extract(content_json, '$.room_id') = ?
           AND json_extract(content_json, '$.scope_type') = ?
           AND json_extract(content_json, '$.scope_id') IS ?
           AND json_extract(content_json, '$.role') = ?
         ORDER BY rowid DESC LIMIT 1`,
      )
      .get(roomId, scopeType, scopeId, role) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as RoleAssignment) : null;
  }

  participantHasAssignmentInRoom(participantId: string, roomId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM role_assignments WHERE
           json_extract(content_json, '$.participant_id') = ?
           AND json_extract(content_json, '$.room_id') = ?
         LIMIT 1`,
      )
      .get(participantId, roomId);
    return row !== undefined;
  }

  // Participant 管理 authority 只认可 active latest assignment（Review finding inc9-fr2-4）：
  // 同 (room_id, scope_type, scope_id, role) 组内只有 rowid 最新的 assignment 是 active；
  // 被新 assignment 替换的 historical orchestrator 不授权，重新成为 latest 后恢复。
  isActiveLatestAssignment(participantId: string, role: Role): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM role_assignments AS ra WHERE
           json_extract(ra.content_json, '$.role') = ?
           AND json_extract(ra.content_json, '$.participant_id') = ?
           AND ra.rowid = (
             SELECT MAX(r.rowid) FROM role_assignments AS r WHERE
               json_extract(r.content_json, '$.room_id') = json_extract(ra.content_json, '$.room_id')
               AND json_extract(r.content_json, '$.scope_type') = json_extract(ra.content_json, '$.scope_type')
               AND json_extract(r.content_json, '$.scope_id') IS json_extract(ra.content_json, '$.scope_id')
               AND json_extract(r.content_json, '$.role') = json_extract(ra.content_json, '$.role')
           )
         LIMIT 1`,
      )
      .get(role, participantId);
    return row !== undefined;
  }

  // ---- Room-scoped listing（snapshot 的稳定数组）----
  // entity 按 rowid 升序返回，保证同一状态下的重复读取顺序稳定；
  // room membership 由 content_json 内嵌的 room_id 过滤，跨 Room 不泄漏。
  listTasks(roomId: string): PersistedTask[] {
    return this.listEntitiesByRoom<PersistedTask>('tasks', roomId);
  }

  listReviews(roomId: string): Review[] {
    return this.listEntitiesByRoom<Review>('reviews', roomId);
  }

  listQuestions(roomId: string): Question[] {
    return this.listEntitiesByRoom<Question>('questions', roomId);
  }

  listRoleAssignments(roomId: string): RoleAssignment[] {
    return this.listEntitiesByRoom<RoleAssignment>('role_assignments', roomId);
  }

  // participant 的 room membership 由其在 room 内的 assignment 决定；
  // 只有在该 Room 至少有一个 assignment 的 participant 才会出现在该 Room snapshot。
  listRoomParticipants(roomId: string): ParticipantProfile[] {
    const rows = this.db
      .prepare(
        `SELECT p.content_json FROM participants p WHERE p.participant_id IN (
           SELECT DISTINCT json_extract(content_json, '$.participant_id') FROM role_assignments
           WHERE json_extract(content_json, '$.room_id') = ?
         ) ORDER BY p.rowid ASC`,
      )
      .all(roomId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.content_json) as ParticipantProfile);
  }

  // 某 Run 的最新 Task（同一 Run 的 Fix chain 里 rowid 最大者）。
  latestTaskForRun(runId: string): PersistedTask | null {
    const row = this.db
      .prepare(
        "SELECT content_json FROM tasks WHERE json_extract(content_json, '$.run_id') = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(runId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as PersistedTask) : null;
  }

  // 该 Run 当前 open Question：同一 Run 至多一个 open Question（active attempt 至多 ask 一次，
  // ask 后 attempt 变为 decision_requested 并失去 running 资格）。
  latestOpenQuestionForRun(runId: string): Question | null {
    const row = this.db
      .prepare(
        "SELECT content_json FROM questions WHERE json_extract(content_json, '$.run_id') = ? AND json_extract(content_json, '$.status') = 'open' ORDER BY rowid DESC LIMIT 1",
      )
      .get(runId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as Question) : null;
  }

  // 该 Run 最新 Review（rowid 升序插入，latest 即 rowid 最大者）。
  latestReviewForRun(runId: string): Review | null {
    const row = this.db
      .prepare(
        "SELECT content_json FROM reviews WHERE json_extract(content_json, '$.run_id') = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(runId) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as Review) : null;
  }

  // ---- Events ----
  appendEvent(input: {
    room_id: string;
    type: string;
    actor: EventActor;
    entity_type: Event['entity_type'];
    entity_id: string;
    summary: string;
    created_at: string;
  }): Event {
    const event: Event = {
      event_id: randomUUID(),
      room_id: input.room_id,
      sequence: this.nextSequence(input.room_id),
      type: input.type,
      actor_role: input.actor.actor_role,
      participant_id: input.actor.participant_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      summary: input.summary,
      created_at: input.created_at,
    };
    try {
      this.db
        .prepare('INSERT INTO events (event_id, room_id, sequence, content_json) VALUES (?, ?, ?, ?)')
        .run(event.event_id, event.room_id, event.sequence, JSON.stringify(event));
    } catch (err) {
      // 并发写事务各自在事务开始读到同一 MAX(sequence)，loser 等待 winner commit 后
      // 命中 UNIQUE(room_id, sequence)：此时重读一次 fresh MAX 并重插，让并发 append
      // 确定性收敛，而不是泄漏 raw SQLite error。
      if (isSqliteUniqueError(err) && err.message.includes('events')) {
        event.sequence = this.nextSequence(input.room_id);
        this.db
          .prepare('INSERT INTO events (event_id, room_id, sequence, content_json) VALUES (?, ?, ?, ?)')
          .run(event.event_id, event.room_id, event.sequence, JSON.stringify(event));
      } else {
        throw err;
      }
    }
    return event;
  }

  // 返回指定 room 内 type 匹配且 sequence 最大的 Event 的 entity_id；无匹配返回 null。
  latestEventEntityId(roomId: string, type: string): string | null {
    const row = this.db
      .prepare(
        "SELECT json_extract(content_json, '$.entity_id') AS entity_id FROM events WHERE room_id = ? AND json_extract(content_json, '$.type') = ? ORDER BY sequence DESC LIMIT 1",
      )
      .get(roomId, type) as { entity_id: string | null } | undefined;
    return row?.entity_id ?? null;
  }

  listEvents(roomId: string, afterSequence?: number): Event[] {
    const rows = (afterSequence === undefined
      ? this.db
          .prepare('SELECT content_json FROM events WHERE room_id = ? ORDER BY sequence ASC')
          .all(roomId)
      : this.db
          .prepare('SELECT content_json FROM events WHERE room_id = ? AND sequence > ? ORDER BY sequence ASC')
          .all(roomId, afterSequence)) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.content_json) as Event);
  }

  // ---- Private helpers ----
  private listEntitiesByRoom<T>(table: EntityTable | 'runs' | 'run_attempts' | 'run_guidance', roomId: string): T[] {
    const rows = this.db
      .prepare(
        `SELECT content_json FROM ${table} WHERE json_extract(content_json, '$.room_id') = ? ORDER BY rowid ASC`,
      )
      .all(roomId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.content_json) as T);
  }

  private getEntity<T>(table: EntityTable, idColumn: string, id: string): T | null {
    const row = this.db
      .prepare(`SELECT content_json FROM ${table} WHERE ${idColumn} = ?`)
      .get(id) as JsonRow | undefined;
    return row ? (JSON.parse(row.content_json) as T) : null;
  }

  // Idempotency：相同 ID + 相同 schema-normalized content 返回既有 entity（不重复写），
  // 相同 ID + 不同 content 抛 id_conflict。content 直接做 JSON 字符串结构比较，不用 hash。
  private insertEntity(table: EntityTable, id: string, content: unknown): { created: boolean } {
    const idColumn = TABLE_ID_COLUMN[table];
    const contentJson = JSON.stringify(content);
    const existing = this.db
      .prepare(`SELECT content_json FROM ${table} WHERE ${idColumn} = ?`)
      .get(id) as JsonRow | undefined;
    if (existing) {
      if (existing.content_json === contentJson) {
        return { created: false };
      }
      throw new ProtocolError('id_conflict', `${table} id ${id} already exists with different content`);
    }
    this.db
      .prepare(`INSERT INTO ${table} (${idColumn}, content_json) VALUES (?, ?)`)
      .run(id, contentJson);
    return { created: true };
  }

  private nextSequence(roomId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM events WHERE room_id = ?')
      .get(roomId) as { max_seq: number };
    return row.max_seq + 1;
  }
}
