import { KB } from "@/lib/kb";
import Advisor from "./advisor";

export default function Page() {
  // Only a slim roster ships to the client — the full corpus stays server-side.
  const roster = KB.investors.map((i: any) => ({
    name: i.name,
    firm: i.firm,
    role: i.role,
    stage: i.stage.join(" / "),
  }));
  return <Advisor roster={roster} />;
}
