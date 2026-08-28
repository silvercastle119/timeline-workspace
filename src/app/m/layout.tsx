import type { ReactNode } from "react";
import { MobileProjectProvider } from "@/components/mobile/use-mobile-project";

export default function MobileLayout({ children }: { children: ReactNode }) {
  return <MobileProjectProvider>{children}</MobileProjectProvider>;
}
