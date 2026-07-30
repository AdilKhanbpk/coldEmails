// ---------------------------------------------------------------------------
// DNS checking — real SPF, DKIM, and DMARC record lookups using Node's dns module.
// No fake results — every check performs an actual DNS query.
// ---------------------------------------------------------------------------

import { promises as dns } from 'dns';

export interface DnsResult {
  record: string;
  found: boolean;
  value: string | null;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface DomainHealthResult {
  domain: string;
  spf: DnsResult;
  dkim: DnsResult;
  dmarc: DnsResult;
}

// Check SPF record by looking up TXT records on the domain
export async function checkSPF(domain: string): Promise<DnsResult> {
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecord = txtRecords
      .map((r) => r.join(''))
      .find((r) => r.startsWith('v=spf1'));

    if (!spfRecord) {
      return {
        record: 'SPF',
        found: false,
        value: null,
        status: 'fail',
        message: 'No SPF record found. Add a TXT record starting with "v=spf1" to your DNS.',
      };
    }

    // Check if the record includes ~all or -all (strict) vs +all (too permissive)
    if (spfRecord.includes(' +all')) {
      return {
        record: 'SPF',
        found: true,
        value: spfRecord,
        status: 'warn',
        message: 'SPF record found but uses "+all" which allows any sender. Use "~all" or "-all" instead.',
      };
    }

    return {
      record: 'SPF',
      found: true,
      value: spfRecord,
      status: 'pass',
      message: 'SPF record is properly configured.',
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        record: 'SPF',
        found: false,
        value: null,
        status: 'fail',
        message: 'No TXT records found for this domain.',
      };
    }
    return {
      record: 'SPF',
      found: false,
      value: null,
      status: 'fail',
      message: `DNS lookup failed: ${error.message}`,
    };
  }
}

// Check DKIM by looking up a common selector (default, google, selector1, selector2)
// DKIM selectors are provider-specific, so we check common ones.
export async function checkDKIM(domain: string): Promise<DnsResult> {
  const commonSelectors = ['default', 'google', 'selector1', 'selector2', 's1', 'mail'];

  for (const selector of commonSelectors) {
    try {
      const txtRecords = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
      const dkimRecord = txtRecords
        .map((r) => r.join(''))
        .find((r) => r.startsWith('v=DKIM1') || r.includes('p='));

      if (dkimRecord) {
        return {
          record: 'DKIM',
          found: true,
          value: dkimRecord,
          status: 'pass',
          message: `DKIM record found for selector "${selector}".`,
        };
      }
    } catch {
      // Try next selector
    }
  }

  return {
    record: 'DKIM',
    found: false,
    value: null,
    status: 'warn',
    message: 'No DKIM record found for common selectors. DKIM selectors are provider-specific — check your email provider for the correct selector name.',
  };
}

// Check DMARC by looking up TXT records on _dmarc.domain
export async function checkDMARC(domain: string): Promise<DnsResult> {
  try {
    const txtRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = txtRecords
      .map((r) => r.join(''))
      .find((r) => r.startsWith('v=DMARC1'));

    if (!dmarcRecord) {
      return {
        record: 'DMARC',
        found: false,
        value: null,
        status: 'fail',
        message: 'No DMARC record found. Add a TXT record at "_dmarc.yourdomain" starting with "v=DMARC1".',
      };
    }

    // Check policy strength
    const policyMatch = dmarcRecord.match(/p=(none|quarantine|reject)/);
    const policy = policyMatch?.[1] || 'none';

    if (policy === 'none') {
      return {
        record: 'DMARC',
        found: true,
        value: dmarcRecord,
        status: 'warn',
        message: 'DMARC policy is "none" (monitoring only). Consider upgrading to "quarantine" or "reject".',
      };
    }

    return {
      record: 'DMARC',
      found: true,
      value: dmarcRecord,
      status: 'pass',
      message: `DMARC policy is "${policy}". Properly configured.`,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        record: 'DMARC',
        found: false,
        value: null,
        status: 'fail',
        message: 'No DMARC record found. Add a TXT record at "_dmarc.yourdomain" starting with "v=DMARC1".',
      };
    }
    return {
      record: 'DMARC',
      found: false,
      value: null,
      status: 'fail',
      message: `DNS lookup failed: ${error.message}`,
    };
  }
}

// Full domain health check
export async function checkDomainHealth(domain: string): Promise<DomainHealthResult> {
  const [spf, dkim, dmarc] = await Promise.all([
    checkSPF(domain),
    checkDKIM(domain),
    checkDMARC(domain),
  ]);

  return { domain, spf, dkim, dmarc };
}
