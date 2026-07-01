import React, { useState, useCallback, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/api/sajiloClient';
import { UploadCloud, File, Image as ImageIcon, X, Loader2, CheckCircle2, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export default function FileUpload({ companyId, moduleName, recordId, existingAttachments = [], onChange }) {
  const [files, setFiles] = useState([]);
  const [attachments, setAttachments] = useState(existingAttachments);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (existingAttachments && existingAttachments.length > 0) {
      setAttachments(existingAttachments);
    }
  }, [existingAttachments]);

  useEffect(() => {
    async function fetchAttachments() {
      if (recordId && moduleName && companyId) {
        const { data, error } = await supabase
          .from('DocumentAttachment')
          .select('*')
          .eq('record_id', recordId)
          .eq('module_type', moduleName)
          .order('created_date', { ascending: true });
        
        if (!error && data) {
          setAttachments(data);
        }
      }
    }
    // Only fetch if we didn't get them passed in
    if (!existingAttachments || existingAttachments.length === 0) {
      fetchAttachments();
    }
  }, [recordId, moduleName, companyId]);

  const onFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    setUploading(true);
    setUploadProgress(0);

    const newAttachments = [...attachments];

    for (let i = 0; i < selectedFiles.length; i++) {
      let file = selectedFiles[i];
      const isImage = file.type.startsWith('image/');
      
      try {
        if (isImage) {
          const options = {
            maxSizeMB: 2,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            onProgress: (progress) => {
              // rough progress for compression
            }
          };
          file = await imageCompression(file, options);
        }

        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
        const filePath = `${companyId}/${moduleName}/${recordId}/${fileName}`;

        // simulate chunk progress or just show overall progress
        setUploadProgress(Math.round(((i + 0.5) / selectedFiles.length) * 100));

        const { data, error } = await supabase.storage
          .from('erp_documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const attachmentMeta = {
          company_id: companyId,
          module_type: moduleName,
          record_id: recordId,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type
        };

        const { data: dbData, error: dbError } = await supabase
          .from('DocumentAttachment')
          .insert([attachmentMeta])
          .select()
          .single();

        if (dbError) {
          console.error("DB Insert error:", dbError);
          // Rollback storage upload if DB insert fails
          await supabase.storage.from('erp_documents').remove([filePath]);
          throw dbError;
        }

        newAttachments.push(dbData);
        
        setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      } catch (err) {
        console.error("Upload error:", err);
        alert(`Failed to upload ${file.name}: ${err.message}`);
      }
    }

    setAttachments(newAttachments);
    setUploading(false);
    setUploadProgress(0);
    if (onChange) onChange(newAttachments);
    
    // reset input
    e.target.value = null;
  };

  const removeAttachment = async (indexToRemove) => {
    const attachment = attachments[indexToRemove];
    
    // Only attempt to remove from bucket if it's already uploaded to Supabase 
    // (In our case, all in attachments array are uploaded)
    try {
      if (attachment.file_path) {
        const { error } = await supabase.storage
          .from('erp_documents')
          .remove([attachment.file_path]);
          
        if (error) {
           console.error("Storage deletion error:", error);
           // proceed with UI deletion anyway or alert
        } else {
           // Delete from DB as well
           if (attachment.id) {
             await supabase.from('DocumentAttachment').delete().eq('id', attachment.id);
           } else {
             await supabase.from('DocumentAttachment').delete().eq('file_path', attachment.file_path);
           }
        }
      }
    } catch(err) {
      console.error(err);
    }
    
    const newAttachments = attachments.filter((_, idx) => idx !== indexToRemove);
    setAttachments(newAttachments);
    if (onChange) onChange(newAttachments);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handlePreview = async (filePath) => {
    try {
      const { data, error } = await supabase.storage
        .from('erp_documents')
        .createSignedUrl(filePath, 60 * 60); // 1 hour

      if (error) throw error;
      
      if (data && data.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      console.error("Preview error:", err);
      alert("Failed to load preview.");
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
        <input 
          type="file" 
          multiple 
          onChange={onFileChange} 
          disabled={uploading || !recordId || !companyId}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          accept="image/jpeg, image/png, image/webp, application/pdf, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
        <div className="flex flex-col items-center justify-center space-y-2">
          <UploadCloud className="w-10 h-10 text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {uploading ? 'Uploading...' : 'Drag & drop files here, or click to select'}
          </p>
          <p className="text-xs text-gray-500">
            Supports JPG, PNG, WEBP, PDF, DOCX, XLSX (Max 5MB)
          </p>
        </div>
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative border dark:border-gray-700 rounded-md p-3 flex items-center space-x-3 bg-white dark:bg-gray-900 group">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded bg-gray-100 dark:bg-gray-800">
                {att.mime_type?.startsWith('image/') ? (
                   <ImageIcon className="w-5 h-5 text-blue-500" />
                ) : (
                   <File className="w-5 h-5 text-gray-500" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {att.file_name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {formatSize(att.file_size)}
                </p>
              </div>

              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                <button
                  type="button"
                  onClick={() => handlePreview(att.file_path)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300"
                  title="Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
