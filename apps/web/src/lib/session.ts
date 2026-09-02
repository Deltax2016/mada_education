import { cookies } from "next/headers";

export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookie,
  clearedRefreshCookie,
  refreshCookie,
} from "./session-cookies";

import { ACCESS_COOKIE } from "./session-cookies";

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}
