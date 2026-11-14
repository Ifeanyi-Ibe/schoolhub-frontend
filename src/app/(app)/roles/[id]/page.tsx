import { RoleEditor } from "@/features/staff/RoleEditor";

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoleEditor roleId={id} />;
}
