import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getEnv } from "@/server/env";
import { cookieNames } from "@/server/session";

export default async function RootPage() {
  const env = getEnv();
  const names = cookieNames(new URL(env.APP_ORIGIN).protocol === "https:");
  const jar = await cookies();
  redirect(jar.get(names.access)?.value || jar.get(names.refresh)?.value ? "/home" : "/login");
}
