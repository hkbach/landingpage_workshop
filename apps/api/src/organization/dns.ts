import { resolveCname } from "node:dns/promises";

/** The DNS questions the platform asks (D13): which names a domain points to. A port, so a test can answer without the network. */
export interface DnsResolver { cname(host: string): Promise<string[]> }
export const DNS = "DNS_RESOLVER";

export class SystemDns implements DnsResolver {
  async cname(host: string): Promise<string[]> {
    return resolveCname(host);
  }
}
