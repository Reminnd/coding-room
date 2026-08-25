import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { ProtocolError } from '../protocol/errors.ts';
import { RoomService } from '../room/room-service.ts';
import { getRoomStateSnapshot, type RoomStateSnapshot } from '../room/state-snapshot.ts';

// read-only Status CLI：显式 --db/--project 与 --room-id，调用共享 snapshot boundary，把
// deterministic pretty JSON 写到 stdout。打开 SQLite 前确认 --db 已存在；missing path 不
// 创建空 database/schema；对有效 database 只读 snapshot，不创建 Room/entity/Event，不执行
// state transition。invalid args / entity / protocol failure 写 stderr 并 non-zero exit。

interface StatusConfig {
  db: string;
  roomId: string;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseConfigOrExit(argv: string[]): StatusConfig {
  let values: { db?: unknown; 'room-id'?: unknown };
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        db: { type: 'string' },
        'room-id': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values as { db?: unknown; 'room-id'?: unknown };
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const db = values.db;
  const roomId = values['room-id'];
  if (typeof db !== 'string' || db === '') fail('--db <path> is required');
  if (typeof roomId !== 'string' || roomId === '') fail('--room-id <id> is required');
  return { db, roomId };
}

function readSnapshotOrExit(service: RoomService, roomId: string): RoomStateSnapshot {
  try {
    return getRoomStateSnapshot(service, { room_id: roomId });
  } catch (err) {
    if (err instanceof ProtocolError) {
      fail(`${err.code}: ${err.message}`);
    }
    fail(err instanceof Error ? err.message : String(err));
  }
}

// deterministic pretty JSON：固定 key 顺序 + 2-space indent。缺失 current entity 用 null。
function formatStatus(snapshot: RoomStateSnapshot): string {
  const run = snapshot.current_run;
  const output = {
    room_id: snapshot.room.room_id,
    state: snapshot.room.state,
    waiting_actor: snapshot.waiting_actor,
    cursor: snapshot.cursor,
    current_task_id: snapshot.current_task?.task_id ?? null,
    current_run_id: snapshot.current_run?.run_id ?? null,
    current_review_id: snapshot.current_review?.review_id ?? null,
    current_question_id: snapshot.current_question?.question_id ?? null,
    latest_run_status: run?.status ?? null,
    latest_run_failure: run?.failure ?? null,
    git_evidence: run?.git_evidence ?? { staged: [], unstaged: [], untracked: [] },
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}

function main(): void {
  const config = parseConfigOrExit(process.argv.slice(2));

  if (!existsSync(config.db)) {
    fail(`database file does not exist: ${config.db}`);
  }

  let db: DatabaseSync;
  try {
    // read-only connection：有效 database 可读，既存空/无 schema 文件在 schema initialization
    // 处抛 "attempt to write a readonly database"，不创建任何 Room table。
    db = new DatabaseSync(config.db, { readOnly: true });
  } catch (err) {
    fail(`cannot open database ${config.db}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let service: RoomService;
  try {
    service = new RoomService(db);
  } catch (err) {
    fail(`cannot read database ${config.db}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const snapshot = readSnapshotOrExit(service, config.roomId);
  process.stdout.write(formatStatus(snapshot));
}

main();
