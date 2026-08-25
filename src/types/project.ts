export type WorkItemStatus =
  | "planned"
  | "in-progress"
  | "completed"
  | "on-hold";

export type WorkItemPriority =
  | "low"
  | "medium"
  | "high";

export type Checkpoint = {
  id: string;
  date: string;
  label: string;
};

export type WorkItem = {
  id: string;
  name: string;

  parentId: string | null;
  order: number;

  startDate: string | null;
  endDate: string | null;
  autoTimeline: boolean;
  isUndecided: boolean;

  active: boolean;
  color: string | null;
  memo: string;
  autoMemoNote: string | null;
  checkpoints: Checkpoint[];

  /** @deprecated 더 이상 UI/Excel에서 사용하지 않음. 기존 데이터 호환을 위해서만 유지 */
  assignee: string;
  /** @deprecated 더 이상 UI/Excel에서 사용하지 않음. 기존 데이터 호환을 위해서만 유지 */
  status: WorkItemStatus;
  /** @deprecated 더 이상 UI/Excel에서 사용하지 않음. 기존 데이터 호환을 위해서만 유지 */
  priority: WorkItemPriority;
};

export type Project = {
  id: string;
  name: string;

  timelineStart: string;
  timelineEnd: string;

  workItems: WorkItem[];
  customColors: string[];
};
