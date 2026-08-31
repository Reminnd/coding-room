import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { ProtocolError } from '../protocol/errors.ts';
import { RoomService } from '../room/room-service.ts';
import { getRoomStateSnapshot, type RoomStateSnapshot } from '../room/state-snapshot.ts';

// read-only Status CLI：显式 --db 与 --room-id，调用共享 snapshot boundary，把 deterministic
// pretty JSON 写到 stdout。打开 SQLite 前确认 --db 已存在；missing path 不创建空
// database/schema；对有效 database 只读 snapshot，不创建 Room/entity/Event，不执行 state
// transition。invalid args / entity / protocol failure 写 stderr 并 non-zero exit。
//
// v0.4：multi-Run 输出 planning_waiting_actor 与全部 run_work_items（稳定排序），不存在单一
// current Run 造成的覆盖。

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

// deterministic pretty JSON：固定 key 顺序 + 2-space indent。runs 是 run_work_items 的稳定
// 排序投影（created_at 升序、同 created_at 按 run_id），每个 work item 的 reference 缺失
// 时用 null。
function formatStatus(snapshot: RoomStateSnapshot): string {
  const output = {
    room_id: snapshot.room.room_id,
    state: snapshot.room.state,
    planning_waiting_actor: snapshot.planning_waiting_actor,
    cursor: snapshot.cursor,
    runs: snapshot.run_work_items.map((item) => ({
      run_id: item.run_id,
      status: item.run_status,
      waiting_actor: item.waiting_actor,
      current_task_id: item.current_task_id,
      current_attempt_id: item.current_attempt_id,
      current_question_id: item.current_question_id,
      current_review_id: item.current_review_id,
    })),
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
