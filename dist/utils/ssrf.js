"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrivateIP = isPrivateIP;
exports.resolveAndValidateHost = resolveAndValidateHost;
const dns_1 = __importDefault(require("dns"));
const util_1 = require("util");
const dnsLookup = (0, util_1.promisify)(dns_1.default.lookup);
/**
 * Checks if an IP address is inside private CIDR blocks.
 * Supports allowing private IPs via environment variable for local testing.
 */
function isPrivateIP(ip) {
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
        if (o1 === 127)
            return true;
        if (o1 === 10)
            return true;
        if (o1 === 172 && o2 >= 16 && o2 <= 31)
            return true;
        if (o1 === 192 && o2 === 168)
            return true;
        if (o1 === 169 && o2 === 254)
            return true;
        if (o1 === 0)
            return true;
        return false;
    }
    // Check IPv6 private networks:
    // - ::1 (Loopback)
    // - fe80::/10 (Link-Local)
    // - fc00::/7 (Unique Local)
    const normalizedIp = ip.toLowerCase();
    if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1')
        return true;
    if (normalizedIp.startsWith('fe80:'))
        return true;
    if (normalizedIp.startsWith('fc00:') || normalizedIp.startsWith('fd00:'))
        return true;
    return false;
}
/**
 * Resolves a hostname to an IP and validates it isn't private.
 */
function resolveAndValidateHost(host) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { address } = yield dnsLookup(host);
            if (isPrivateIP(address)) {
                throw new Error(`SSRF Prevention: Resolved IP ${address} for host ${host} is in a private network range.`);
            }
            return address;
        }
        catch (err) {
            throw new Error(`DNS Resolution failed for host ${host}: ${err.message}`);
        }
    });
}
