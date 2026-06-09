import { useState, useRef } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Paperclip, X, Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function DocumentUploader({ urls = [], onChange, label = 'Attachments' }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const newUrls = [];
    for (const file of files) {
      const { file_url } = await sajilo.integrations.Core.UploadFile({ file });
      newUrls.push(file_url);
    }
    onChange([...urls, ...newUrls]);
    setUploading(false);
    toast.success(`${newUrls.length} file(s) uploaded`);
    e.target.value = '';
  };

  const remove = (url) => onChange(urls.filter(u => u !== url));

  const fileName = (url) => {
    try { return decodeURIComponent(url.split('/').pop().split('?')[0]); } catch { return url; }
  };

  return (
    <div>
      <p className="text-sm font-medium mb-2">{label}</p>
      <div className="space-y-2">
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary underline truncate flex-1">{fileName(url)}</a>
            <button onClick={() => remove(url)} className="text-muted-foreground hover:text-destructive shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={uploading}
          onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
          {uploading ? 'Uploading…' : 'Upload Document'}
        </Button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFiles}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv" />
      </div>
    </div>
  );
}