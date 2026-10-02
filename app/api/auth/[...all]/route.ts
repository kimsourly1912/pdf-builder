import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const handler = (request: Request) => getAuth().handler(request);

export { handler as GET, handler as POST };
