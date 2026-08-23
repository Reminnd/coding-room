import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ProtocolError } from '../protocol/errors.ts';
import type {
  Actor,
  Event,
  Question,
  Review,
  RoomState,
  Run,
  TaskContract,
} from '../protocol/schema.ts';

// rooms.state 的持久化 shape。协议未定义独立 Room entity，这里只保存 room_id、
// 当前 state 与时间戳；state 的修改由 application service 通过 transition 校验后执行。
export interface RoomRecord {
  room_id: string;
  state: RoomState;
  created_at: string;
  updated_at: string;
}

type EntityTable = 'tasks' | 'runs' | 'reviews' | 'questions';

const TABLE_ID_COLUMN: Record<EntityTable, string> = {
  tasks: 'task_id',
  runs: 'run_id',
  reviews: 'review_id',
  questions: 'question_id',
};

interface JsonRow {
  content_json: string;
}

// SQLite 是协作实体与状态机的唯一权威来源。repository 只提供 entity CRUD 与
// event append；不暴露任何绕过 transition 校验的 rooms.state 修改原语。
export class RoomRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.createSchema();
  }

  private createSchema(): void {
    this.db.exec(`
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

  // ---- Tasks / Runs / Reviews / Questions ----
  getTask(taskId: string): TaskContract | null {
    return this.getEntity<TaskContract>('tasks', 'task_id', taskId);
  }

  getRun(runId: string): Run | null {
    return this.getEntity<Run>('runs', 'run_id', runId);
  }

  getReview(reviewId: string): Review | null {
    return this.getEntity<Review>('reviews', 'review_id', reviewId);
  }

  getQuestion(questionId: string): Question | null {
    return this.getEntity<Question>('questions', 'question_id', questionId);
  }

  insertTask(task: TaskContract): { created: boolean } {
    return this.insertEntity('tasks', task.task_id, task);
  }

  insertRun(run: Run): { created: boolean } {
    return this.insertEntity('runs', run.run_id, run);
  }

  insertReview(review: Review): { created: boolean } {
    return this.insertEntity('reviews', review.review_id, review);
  }

  insertQuestion(question: Question): { created: boolean } {
    return this.insertEntity('questions', question.question_id, question);
  }

  updateRun(run: Run): void {
    this.db
      .prepare('UPDATE runs SET content_json = ? WHERE run_id = ?')
      .run(JSON.stringify(run), run.run_id);
  }

  updateQuestion(question: Question): void {
    this.db
      .prepare('UPDATE questions SET content_json = ? WHERE question_id = ?')
      .run(JSON.stringify(question), question.question_id);
  }

  // ---- Events ----
  appendEvent(input: {
    room_id: string;
    type: string;
    actor: Actor;
    entity_type: Event['entity_type'];
    entity_id: string;
    summary: string;
    created_at: string;
  }): Event {
    const sequence = this.nextSequence(input.room_id);
    const event: Event = {
      event_id: randomUUID(),
      room_id: input.room_id,
      sequence,
      type: input.type,
      actor: input.actor,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      summary: input.summary,
      created_at: input.created_at,
    };
    this.db
      .prepare('INSERT INTO events (event_id, room_id, sequence, content_json) VALUES (?, ?, ?, ?)')
      .run(event.event_id, event.room_id, event.sequence, JSON.stringify(event));
    return event;
  }

  // 返回指定 room 内 type 匹配且 sequence 最大的 Event 的 entity_id；无匹配返回 null。
  // 用于判定 current Review（最近一次 review_submitted Event 指向的 Review）。
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
