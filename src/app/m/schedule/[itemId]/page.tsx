import { MobileScheduleScreen } from "@/components/mobile/mobile-schedule-screen";

export default async function MobileSchedulePage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;

  return <MobileScheduleScreen itemId={itemId} />;
}
