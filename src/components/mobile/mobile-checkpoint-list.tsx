import type { Checkpoint } from "@/types/project";

type MobileCheckpointListProps = {
  checkpoints: Checkpoint[];
  onAdd: () => void;
  onUpdate: (checkpointId: string, field: "date" | "label", value: string) => void;
  onDelete: (checkpointId: string) => void;
};

export function MobileCheckpointList({
  checkpoints,
  onAdd,
  onUpdate,
  onDelete,
}: MobileCheckpointListProps) {
  const sorted = [...checkpoints].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-2">
      {sorted.map((checkpoint) => (
        <div key={checkpoint.id} className="flex items-center gap-2">
          <input
            type="date"
            value={checkpoint.date}
            onChange={(event) => onUpdate(checkpoint.id, "date", event.target.value)}
            className="w-[136px] shrink-0 rounded-md border border-zinc-300 px-2 py-1.5 text-xs outline-none focus:border-blue-600"
          />
          <input
            type="text"
            value={checkpoint.label}
            onChange={(event) => onUpdate(checkpoint.id, "label", event.target.value)}
            maxLength={20}
            placeholder="메모"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs outline-none focus:border-blue-600"
          />
          <button
            type="button"
            onClick={() => onDelete(checkpoint.id)}
            aria-label="체크포인트 삭제"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-md border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 transition hover:border-blue-400 hover:text-blue-600"
      >
        + 체크포인트 추가
      </button>
    </div>
  );
}
