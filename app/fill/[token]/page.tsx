import { FillRouter } from "@/features/forms/form-fill";

export default async function FillPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  return <FillRouter token={token} />;
}
