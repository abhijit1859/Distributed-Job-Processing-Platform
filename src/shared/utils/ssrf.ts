import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

/**
 * Checks if an IP address is inside private CIDR blocks.
 * Supports allowing private IPs via environment variable for local testing.
 */
export function isPrivateIP(ip: string): boolean {
  if (process.env.ALLOW_PRIVATE_IPS === 'true') {
    return false;
  }

  // Check IPv4 private networks:
  // - 127.0.0.0/8 (Loopback)
  // - 10.0.0.0/8 (Private Network)
  // - 172.16.0.0/12 (Private Network)
  // - 192.168.0.0/16 (Private Network)
  // - 169.254.0.0/16 (Link-Local, AWS/GCP metadata)
  // - 0.0.0.0/8 (Local broadcast)
  const ipv4Regex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  const match = ip.match(ipv4Regex);
  
  if (match) {
    const o1 = parseInt(match[1], 10);
    const o2 = parseInt(match[2], 10);
    const o3 = parseInt(match[3], 10);
    const o4 = parseInt(match[4], 10);

    if (o1 === 127) return true;
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 === 169 && o2 === 254) return true;
    if (o1 === 0) return true;
    
    return false;
  }

  // Check IPv6 private networks:
  // - ::1 (Loopback)
  // - fe80::/10 (Link-Local)
  // - fc00::/7 (Unique Local)
  const normalizedIp = ip.toLowerCase();
  if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') return true;
  if (normalizedIp.startsWith('fe80:')) return true;
  if (normalizedIp.startsWith('fc00:') || normalizedIp.startsWith('fd00:')) return true;

  return false;
}

/**
 * Resolves a hostname to an IP and validates it isn't private.
 */
export async function resolveAndValidateHost(host: string): Promise<string> {
  try {
    const { address } = await dnsLookup(host);
    if (isPrivateIP(address)) {
      throw new Error(`SSRF Prevention: Resolved IP ${address} for host ${host} is in a private network range.`);
    }
    return address;
  } catch (err: any) {
    throw new Error(`DNS Resolution failed for host ${host}: ${err.message}`);
  }
}
