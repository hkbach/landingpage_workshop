import { getLocale } from "next-intl/server";
import { apiGet } from "@/lib/api-server";
import { ConsentDialog } from "./consent-dialog";

/** Server side of the re-consent window: asks the API whether the person must agree to a newer Terms or Privacy Policy, and shows the window when so. Nothing when not connected to the API. */
export async function ConsentGate() {
  const status = await apiGet<{ mustAcceptAny: boolean }>(`/legal/consent?locale=${encodeURIComponent(await getLocale())}`);
  return status?.mustAcceptAny ? <ConsentDialog /> : null;
}
