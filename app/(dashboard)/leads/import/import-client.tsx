'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Upload,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  FileSpreadsheet,
  Cloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '@/lib/timezones';

interface OutreachTypeOption {
  id: string;
  name: string;
}

interface ParsedFileData {
  fileName: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
}

interface ImportResult {
  success: boolean;
  summary: {
    totalRows: number;
    valid: number;
    invalid: number;
    duplicates: number;
    imported: number;
    updated: number;
  };
  invalidRows: { rowIndex: number; reason: string; data: Record<string, string> }[];
  duplicateRows: { rowIndex: number; existingLeadId: string; data: Record<string, string> }[];
}

const STANDARD_FIELDS = [
  { value: 'companyName', label: 'Company Name' },
  { value: 'email', label: 'Email' },
  { value: 'services', label: 'Services' },
  { value: 'country', label: 'Country' },
  { value: 'website', label: 'Website' },
  { value: 'outreachDescription', label: 'Outreach Description' },
  { value: 'preferredTime', label: 'Preferred Time' },
  { value: 'timezone', label: 'Timezone' },
];

type Step = 'upload' | 'mapping' | 'duplicate' | 'preview' | 'importing' | 'done';

export function ImportClient({ outreachTypes }: { outreachTypes: OutreachTypeOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [parsedData, setParsedData] = useState<ParsedFileData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [outreachTypeId, setOutreachTypeId] = useState('');
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [scheduledStartTime, setScheduledStartTime] = useState<string>('');
  const detectedTz = detectBrowserTimezone();
  const [scheduledTimezone, setScheduledTimezone] = useState<string>(detectedTz);

  

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/leads/import/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to parse file.');
        setUploading(false);
        return;
      }

      const data = await res.json();
      setParsedData(data);

      // Auto-initialize mapping with best guesses
      const initialMapping: Record<string, string> = {};
      for (const header of data.headers as string[]) {
        const lower = header.toLowerCase();
        const match = STANDARD_FIELDS.find(
          (f) => lower.includes(f.value.toLowerCase()) || lower.includes(f.label.toLowerCase()),
        );
        initialMapping[header] = match?.value || 'ignore';
      }
      setMapping(initialMapping);

      // Read file as base64 for later import
      const buffer = await file.arrayBuffer();
      setFileContent(Buffer.from(buffer).toString('base64'));

      setStep('mapping');
    } catch {
      toast.error('Failed to parse file.');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleGoogleDriveFile = async (fileId: string, accessToken: string) => {
    setUploading(true);
    try {
      const res = await fetch(`/api/leads/import/google-drive?fileId=${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to fetch file from Google Drive.');
        setUploading(false);
        return;
      }
      const data = await res.json();
      setParsedData(data);
      setFileContent(data.fileContent);

      const initialMapping: Record<string, string> = {};
      for (const header of data.headers as string[]) {
        const lower = header.toLowerCase();
        const match = STANDARD_FIELDS.find(
          (f) => lower.includes(f.value.toLowerCase()) || lower.includes(f.label.toLowerCase()),
        );
        initialMapping[header] = match?.value || 'ignore';
      }
      setMapping(initialMapping);
      setStep('mapping');
    } catch {
      toast.error('Failed to fetch file from Google Drive.');
    } finally {
      setUploading(false);
    }
  };

  const handleMappingNext = () => {
    // Validate required fields
    const hasCompanyName = Object.values(mapping).includes('companyName');
    const hasEmail = Object.values(mapping).includes('email');
    if (!hasCompanyName) {
      toast.error('Please map a column to Company Name.');
      return;
    }
    if (!hasEmail) {
      toast.error('Please map a column to Email.');
      return;
    }
    if (!outreachTypeId) {
      toast.error('Please select an outreach type for the imported leads.');
      return;
    }
    setStep('duplicate');
  };

  const handleImport = async () => {
    if (!scheduledStartTime) {
      toast.error('Please select a start date and time for sending emails.');
      return;
    }

    setStep('importing');
    setImporting(true);
    setImportProgress(0);

    // Simulate progress for large files — the actual import runs in chunks server-side.
    const progressInterval = setInterval(() => {
      setImportProgress((p) => Math.min(p + 10, 90));
    }, 300);

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: parsedData?.fileName || 'import.csv',
          fileContent,
          mapping,
          outreachTypeId,
          duplicateMode,
          scheduledStartTime,
          scheduledTimezone,
        }),
      });

      clearInterval(progressInterval);
      setImportProgress(100);

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Import failed.');
        setStep('preview');
        setImporting(false);
        return;
      }

      const result = await res.json();
      setImportResult(result);
      setStep('done');
      setImporting(false);
    } catch {
      clearInterval(progressInterval);
      toast.error('Import failed.');
      setStep('preview');
      setImporting(false);
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Map Columns' },
    { key: 'duplicate', label: 'Duplicates' },
    { key: 'preview', label: 'Preview' },
    { key: 'done', label: 'Done' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step || (step === 'importing' && s.key === 'preview'));

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">Import Leads</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${i <= currentStepIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-400'
                }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${i <= currentStepIndex ? 'text-gray-900 font-medium' : 'text-gray-400'}`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-medium text-gray-900">Upload a file</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Upload a CSV or Excel file (.csv, .xlsx) containing your leads.
                  Max file size: 10MB.
                </p>
              </div>

              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <p className="text-sm text-gray-500">Parsing file...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                      <Upload className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Click to upload or drag and drop
                      </p>
                      <p className="mt-1 text-xs text-gray-500">CSV or Excel files</p>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </label>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              <GoogleDriveButton onFileFetched={handleGoogleDriveFile} disabled={uploading} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && parsedData && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-base font-medium text-gray-900">Map your columns</h3>
              <p className="mt-1 text-sm text-gray-500">
                Match each column from your file to the corresponding field in the platform.
                Unmapped columns will be ignored. Company Name and Email are required.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Assign to outreach type *</Label>
              <p className="text-sm text-gray-500 mb-2">
                Every imported lead must be assigned to an outreach type.
              </p>
              <Select value={outreachTypeId} onValueChange={setOutreachTypeId}>
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select an outreach type" />
                </SelectTrigger>
                <SelectContent>
                  {outreachTypes.length === 0 ? (
                    <SelectItem value="_none" disabled>No outreach types available</SelectItem>
                  ) : (
                    outreachTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {parsedData.headers.map((header) => (
                <div key={header} className="flex items-center gap-4">
                  <div className="w-1/2">
                    <p className="text-sm font-medium text-gray-900">{header}</p>
                    <p className="text-xs text-gray-400 truncate">
                      Sample: {parsedData.sampleRows[0]?.[header] || '—'}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                  <div className="w-1/2">
                    <Select
                      value={mapping[header] || 'ignore'}
                      onValueChange={(v) => setMapping((prev) => ({ ...prev, [header]: v }))}
                    >
                      <SelectTrigger className="border-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">Ignore this column</SelectItem>
                        {STANDARD_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')} className="border-gray-200">
                Back
              </Button>
              <Button onClick={handleMappingNext} className="bg-blue-600 hover:bg-blue-700">
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Duplicate handling + Schedule Time */}
      {step === 'duplicate' && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-base font-medium text-gray-900">Handle duplicates</h3>
              <p className="mt-1 text-sm text-gray-500">
                If any leads in your file already exist (matched by email), choose how to handle them.
                This setting applies to the entire batch.
              </p>
            </div>

            <RadioGroup
              value={duplicateMode}
              onValueChange={(v) => setDuplicateMode(v as 'skip' | 'update')}
              className="space-y-3"
            >
              <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${duplicateMode === 'skip' ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'
                }`}>
                <RadioGroupItem value="skip" className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Skip duplicates</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Leave existing leads unchanged. Only new leads will be imported.
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${duplicateMode === 'update' ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'
                }`}>
                <RadioGroupItem value="update" className="mt-1" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Update existing</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Overwrite existing lead data with the new values from your file.
                  </p>
                </div>
              </label>
            </RadioGroup>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <div>
                <h3 className="text-base font-medium text-gray-900">Schedule email start time</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select when the first emails should start sending. Leads will be scheduled in batches
                  of 3 per minute to avoid rate limits (e.g., 3 leads at 11:00 PM, 3 at 11:01 PM, etc.).
                </p>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="scheduled-time">Start date and time *</Label>
                  <input
                    id="scheduled-time"
                    type="datetime-local"
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    This is the time when the first batch of emails will start sending
                  </p>
                </div>

              
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone *</Label>
                  <Select value={scheduledTimezone} onValueChange={setScheduledTimezone}>
                    <SelectTrigger id="timezone" className="border-gray-200">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {parsedData && scheduledStartTime && (
                  <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    <p className="font-medium">Scheduling preview:</p>
                    <p className="mt-1">
                      With {parsedData.rowCount} leads, emails will be sent over approximately{' '}
                      {Math.ceil(parsedData.rowCount / 3)} minutes, starting at {scheduledStartTime} {scheduledTimezone}.
                    </p>
                    <p className="mt-1 text-xs">
                      First 3 leads: {scheduledStartTime}, Next 3: +1 minute, Next 3: +2 minutes, etc.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')} className="border-gray-200">
                Back
              </Button>
              <Button onClick={() => setStep('preview')} className="bg-blue-600 hover:bg-blue-700">
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Preview */}
      {step === 'preview' && parsedData && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-base font-medium text-gray-900">Review and confirm</h3>
              <p className="mt-1 text-sm text-gray-500">
                File: {parsedData.fileName} — {parsedData.rowCount} rows found.
                Ready to import with the current settings.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <p className="text-sm font-medium text-gray-900">Total rows</p>
                </div>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{parsedData.rowCount}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <Copy className="h-5 w-5 text-gray-400" />
                  <p className="text-sm font-medium text-gray-900">Duplicate mode</p>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {duplicateMode === 'skip' ? 'Skip duplicates' : 'Update existing'}
                </p>
              </div>
            </div>

            <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
              The import will run in the background. You will see a progress indicator
              and can navigate away once it starts.
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('duplicate')} className="border-gray-200">
                Back
              </Button>
              <Button onClick={handleImport} className="bg-blue-600 hover:bg-blue-700">
                Start import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Importing leads...</h3>
            <p className="mt-2 text-sm text-gray-500">
              Processing your file in chunks. This may take a moment for large files.
            </p>
            <div className="mt-6 w-full max-w-xs">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">{importProgress}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {step === 'done' && importResult && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Import complete</h3>
                <p className="text-sm text-gray-500">Your leads have been processed.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500">Imported</p>
                <p className="mt-1 text-2xl font-semibold text-blue-600">{importResult.summary.imported}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500">Updated</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{importResult.summary.updated}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500">Duplicates</p>
                <p className="mt-1 text-2xl font-semibold text-gray-500">{importResult.summary.duplicates}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-500">Invalid</p>
                <p className="mt-1 text-2xl font-semibold text-red-500">{importResult.summary.invalid}</p>
              </div>
            </div>

            {importResult.invalidRows.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Invalid rows ({importResult.invalidRows.length})
                </h4>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                  {importResult.invalidRows.slice(0, 20).map((row, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-sm last:border-0">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span className="text-gray-500">Row {row.rowIndex}:</span>
                      <span className="text-gray-600">{row.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('upload');
                  setParsedData(null);
                  setImportResult(null);
                }}
                className="border-gray-200"
              >
                Import another file
              </Button>
              <Button
                onClick={() => {
                  router.push('/leads');
                  router.refresh();
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                View leads
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GoogleDriveButton({
  onFileFetched,
  disabled,
}: {
  onFileFetched: (fileId: string, accessToken: string) => void;
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // This uses the Google OAuth flow from stage 1. The user signs in with Google
      // (requesting Drive file read scope), then picks a file. The actual Google Picker
      // integration requires a Google API key and client ID configured in the environment.
      // For now, we provide a UI that lets the user paste a Google Drive file link.
      toast.info('Google Drive import requires connecting your Google account first.');
      // TODO: When GOOGLE_CLIENT_ID is configured, use Google Picker API to let the
      // user select a file from their Drive. Then fetch the file content via the
      // Drive API and pass it through the same mapping/validation pipeline.
    } catch {
      toast.error('Google Drive import failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Cloud className="mr-2 h-4 w-4" />
      )}
      Import from Google Drive
    </Button>
  );
}
