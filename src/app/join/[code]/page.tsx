import { notFound, redirect } from "next/navigation";
import { JoinScreen } from "@/components/join-screen";
import { authenticateRoomAccess } from "@/lib/room-server";
import { normaliseCode } from "@/lib/validation";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normaliseCode((await params).code);
  if (!code) notFound();
  if (await authenticateRoomAccess(code)) redirect(`/room/${code}`);
  return <JoinScreen code={code} />;
}
