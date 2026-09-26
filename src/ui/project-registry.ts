import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

export const uiProjectSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1),
  project_path: z.string().min(1),
  database_path: z.string().min(1),
  room_id: z.string().min(1),
  control_participant_id: z.string().min(1),
  port: z.number().int().min(1).max(65535).nullable(),
}).strict();

export type UiProject = z.infer<typeof uiProjectSchema>;

const registrySchema = z.object({
  version: z.literal(1),
  projects: z.array(uiProjectSchema),
}).strict();

const runtimeBindingSchema = z.object({
  database_path: z.string().min(1),
  project_path: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  room_id: z.string().min(1),
  control_participant_id: z.string().min(1),
}).passthrough();

export interface ProjectDiagnostic extends UiProject {
  project_exists: boolean;
  database_exists: boolean;
  runtime_path: string;
  configuration_error: string | null;
}

function requireAbsolute(path: string, field: string): void {
  if (!isAbsolute(path)) throw new Error(`${field} must be an absolute path`);
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

export class ProjectRegistry {
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  list(): UiProject[] {
    if (!existsSync(this.path)) return [];
    const parsed = registrySchema.safeParse(JSON.parse(readFileSync(this.path, 'utf8')));
    if (!parsed.success) throw new Error(`invalid UI project registry: ${parsed.error.message}`);
    return parsed.data.projects;
  }

  diagnostics(): ProjectDiagnostic[] {
    return this.list().map((project) => {
      let configurationError: string | null = null;
      let projectExists = false;
      try {
        projectExists = statSync(project.project_path).isDirectory();
        if (!projectExists) configurationError = 'project_path 不是目录';
      } catch {
        configurationError = 'project_path 不存在';
      }
      const databaseExists = existsSync(project.database_path);
      if (!databaseExists && configurationError === null) configurationError = 'database_path 不存在；请绑定既有 Room 或显式创建新 Room';
      return {
        ...project,
        project_exists: projectExists,
        database_exists: databaseExists,
        runtime_path: resolve(project.project_path, '.agent-room', 'runtime.json'),
        configuration_error: configurationError,
      };
    });
  }

  get(projectId: string): UiProject {
    const project = this.list().find((candidate) => candidate.project_id === projectId);
    if (!project) throw new Error(`UI project ${projectId} not found`);
    return project;
  }

  add(input: Omit<UiProject, 'project_id'> & { project_id?: string }): UiProject {
    requireAbsolute(input.project_path, 'project_path');
    requireAbsolute(input.database_path, 'database_path');
    const project = uiProjectSchema.parse({ ...input, project_id: input.project_id ?? `project-${randomUUID()}` });
    const projects = this.list();
    if (projects.some((candidate) => candidate.project_id === project.project_id)) {
      throw new Error(`UI project id ${project.project_id} already exists`);
    }
    this.write([...projects, project]);
    return project;
  }

  importRuntime(projectPath: string, name?: string): UiProject {
    requireAbsolute(projectPath, 'project_path');
    const runtimePath = resolve(projectPath, '.agent-room', 'runtime.json');
    if (!existsSync(runtimePath)) throw new Error(`runtime binding does not exist: ${runtimePath}`);
    const parsed = runtimeBindingSchema.safeParse(JSON.parse(readFileSync(runtimePath, 'utf8')));
    if (!parsed.success) throw new Error(`invalid runtime binding: ${parsed.error.message}`);
    if (!isAbsolute(parsed.data.database_path) || !isAbsolute(parsed.data.project_path)) {
      throw new Error('runtime database_path and project_path must be absolute');
    }
    if (!samePath(parsed.data.project_path, projectPath)) {
      throw new Error(`runtime project_path does not match selected project: ${parsed.data.project_path}`);
    }
    return this.add({
      name: name?.trim() || projectPath.split(/[\\/]/).filter(Boolean).at(-1) || projectPath,
      project_path: resolve(parsed.data.project_path),
      database_path: resolve(parsed.data.database_path),
      room_id: parsed.data.room_id,
      control_participant_id: parsed.data.control_participant_id,
      port: parsed.data.port,
    });
  }

  remove(projectId: string): void {
    const projects = this.list();
    if (!projects.some((project) => project.project_id === projectId)) {
      throw new Error(`UI project ${projectId} not found`);
    }
    this.write(projects.filter((project) => project.project_id !== projectId));
  }

  private write(projects: UiProject[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, 'utf8');
    renameSync(temporary, this.path);
  }
}
