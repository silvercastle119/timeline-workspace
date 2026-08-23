import { normalizeWorkItem } from "@/lib/work-items/tree-utils";
import type { Project } from "@/types/project";

const DB_NAME = "timeline-workspace";
const DB_VERSION = 2;
const PROJECTS_STORE = "projects";
const META_STORE = "meta";
const CURRENT_PROJECT_ID_KEY = "currentProjectId";
/** Schema v1 stored a single project under this fixed key. */
const LEGACY_SINGLE_PROJECT_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE);
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getFromStore<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putToStore(
  db: IDBDatabase,
  storeName: string,
  value: unknown,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");

    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function deleteFromStore(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");

    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function getAllValues<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function normalizeLoadedProject(raw: Project): Project {
  return {
    ...raw,
    workItems: raw.workItems.map((item) => normalizeWorkItem(item)),
    customColors: raw.customColors ?? [],
  };
}

/**
 * One-time upgrade from schema v1 (a single project under a fixed key) to
 * v2 (many projects keyed by their own id, plus a "currentProjectId"
 * pointer). Safe to call repeatedly — it's a no-op once the legacy key is
 * gone.
 */
async function migrateLegacySingleProject(db: IDBDatabase): Promise<void> {
  const legacy = await getFromStore<Project>(
    db,
    PROJECTS_STORE,
    LEGACY_SINGLE_PROJECT_KEY
  );

  if (!legacy) return;

  const project = normalizeLoadedProject(legacy);

  await putToStore(db, PROJECTS_STORE, project, project.id);
  await putToStore(db, META_STORE, project.id, CURRENT_PROJECT_ID_KEY);
  await deleteFromStore(db, PROJECTS_STORE, LEGACY_SINGLE_PROJECT_KEY);
}

export type StoredProjectSummary = {
  id: string;
  name: string;
  timelineStart: string;
  timelineEnd: string;
  workItemCount: number;
};

/** Saves (creates or overwrites) a project under its own id. */
export async function saveProject(project: Project): Promise<void> {
  const db = await openDatabase();

  await putToStore(db, PROJECTS_STORE, project, project.id);

  db.close();
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await openDatabase();

  await deleteFromStore(db, PROJECTS_STORE, projectId);

  db.close();
}

export async function setCurrentProjectId(projectId: string): Promise<void> {
  const db = await openDatabase();

  await putToStore(db, META_STORE, projectId, CURRENT_PROJECT_ID_KEY);

  db.close();
}

export async function loadProjectById(
  projectId: string
): Promise<Project | null> {
  const db = await openDatabase();
  const raw = await getFromStore<Project>(db, PROJECTS_STORE, projectId);

  db.close();

  return raw ? normalizeLoadedProject(raw) : null;
}

/**
 * Resolves the project that was open last time (migrating the legacy
 * single-project record first, if present). Returns null on a fresh
 * install with nothing saved yet.
 */
export async function loadCurrentProject(): Promise<Project | null> {
  const db = await openDatabase();

  await migrateLegacySingleProject(db);

  const currentId = await getFromStore<string>(
    db,
    META_STORE,
    CURRENT_PROJECT_ID_KEY
  );
  const raw = currentId
    ? await getFromStore<Project>(db, PROJECTS_STORE, currentId)
    : undefined;

  db.close();

  return raw ? normalizeLoadedProject(raw) : null;
}

export async function listProjectSummaries(): Promise<StoredProjectSummary[]> {
  const db = await openDatabase();

  await migrateLegacySingleProject(db);

  const projects = await getAllValues<Project>(db, PROJECTS_STORE);

  db.close();

  return projects
    .map((value) => ({
      id: value.id,
      name: value.name,
      timelineStart: value.timelineStart,
      timelineEnd: value.timelineEnd,
      workItemCount: value.workItems?.length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
