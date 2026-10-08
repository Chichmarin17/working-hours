import type { Project, Result } from './types';
import { err, ok } from './types';

export const PALETTE = ['#4f7cff', '#22a06b', '#e5484d', '#f5a524', '#8e4ec6', '#12a5b8', '#e54d9a', '#6b7280'];

const MAX_NAME_LENGTH = 40;

export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.archived);
}

function nameError(projects: Project[], name: string, exceptId?: string): string | null {
  if (!name) return "Project name can't be empty.";
  if (name.length > MAX_NAME_LENGTH) return `Project name is too long (max ${MAX_NAME_LENGTH} characters).`;
  const taken = projects.some(
    (p) => p.id !== exceptId && !p.archived && p.name.toLowerCase() === name.toLowerCase(),
  );
  return taken ? `A project named "${name}" already exists.` : null;
}

export function addProject(projects: Project[], name: string, newId: () => string): Result<Project[]> {
  const trimmed = name.trim();
  const error = nameError(projects, trimmed);
  if (error) return err(error);
  const color = PALETTE[projects.length % PALETTE.length];
  return ok([...projects, { id: newId(), name: trimmed, color, archived: false }]);
}

export function renameProject(projects: Project[], id: string, name: string): Result<Project[]> {
  const trimmed = name.trim();
  const error = nameError(projects, trimmed, id);
  if (error) return err(error);
  return ok(projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
}

export function setProjectColor(projects: Project[], id: string, color: string): Project[] {
  return projects.map((p) => (p.id === id ? { ...p, color } : p));
}

export function setArchived(projects: Project[], id: string, archived: boolean): Result<Project[]> {
  const project = projects.find((p) => p.id === id);
  if (!project) return err('This project no longer exists.');
  if (!archived) {
    const error = nameError(projects, project.name, id);
    if (error) return err(error);
  }
  return ok(projects.map((p) => (p.id === id ? { ...p, archived } : p)));
}
