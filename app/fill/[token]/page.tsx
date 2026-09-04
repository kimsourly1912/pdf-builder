import { RecipientFill } from "@/features/templates/recipient-fill";

export default async function FillPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  return <RecipientFill token={token} />;
}
