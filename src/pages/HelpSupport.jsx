import React, { useState, useRef, useEffect } from 'react';
import { sajilo } from '../api/sajiloClient';const HelpSupport = () => {
  const [category, setCategory] = useState('Bug Report');
  const [rawText, setRawText] = useState('');
  const [files, setFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef(null);
  
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    // Fetch session data once
    const fetchUserData = async () => {
      try {
        const user = await sajilo.auth.me();
        setUserData({
          id: user.id,
          email: user.email,
          // user_metadata might contain employee name, falling back to email prefix
          employee_name: user.user_metadata?.full_name || user.email.split('@')[0], 
        });
      } catch (error) {
        console.error("Failed to get user session", error);
      }
    };
    fetchUserData();
  }, []);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    
    // Check total files (existing + new)
    if (files.length + selectedFiles.length > 10) {
      setMessage({ type: 'error', text: 'You can only upload a maximum of 10 files.' });
      return;
    }

    // Check total size limit (10 MB = 10 * 1024 * 1024 bytes)
    const currentSize = files.reduce((acc, f) => acc + f.size, 0);
    const newSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    
    if (currentSize + newSize > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Total file size cannot exceed 10 MB.' });
      return;
    }

    setFiles([...files, ...selectedFiles]);
    setMessage({ type: '', text: '' });
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rawText.trim()) {
      setMessage({ type: 'error', text: 'Please enter a description.' });
      return;
    }
    
    setIsSubmitting(true);
    setMessage({ type: '', text: '' });
    
    try {
      let attachment_urls = [];
      
      // Upload files concurrently
      if (files.length > 0) {
        attachment_urls = await sajilo.storage.uploadFiles('support-attachments', files, `tickets/${userData?.id}/`);
      }
      
      // Create ticket
      await sajilo.entities.SystemSupportTicket.create({
        company_id: sajilo.getCompanyId(),
        user_id: userData?.id,
        employee_name: userData?.employee_name,
        contact_email: userData?.email,
        category,
        raw_user_statement: rawText,
        ai_optimized_statement: null,
        attachment_urls,
        status: 'Open'
      });
      
      setMessage({ type: 'success', text: 'Your ticket has been submitted successfully.' });
      // Reset form
      setRawText('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    } catch (error) {
      console.error("Submission error:", error);
      setMessage({ type: 'error', text: error.message || 'Failed to submit ticket. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col h-auto w-full gap-6">
      <div className="flex justify-between items-end border-b pb-4 border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Help & Support</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Log Bug Reports, Improvements, or Feedback.</p>
        </div>
        <div className="font-mono text-right text-sm text-gray-500 dark:text-gray-400">
          <div>{new Date().toLocaleDateString()}</div>
          {userData && <div>{userData.email}</div>}
        </div>
      </div>

      {message.text && (
        <div className={`p-4 rounded-md ${message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col h-auto w-full gap-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        
        <div className="flex flex-col h-auto w-full gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 left-aligned">Category</label>
          <select 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            className="p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white w-full sm:w-1/3"
          >
            <option>Bug Report</option>
            <option>Improvement</option>
            <option>Feedback</option>
            <option>Technical Support</option>
          </select>
        </div>

        <div className="flex flex-col h-auto w-full gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 left-aligned">Describe your issue or suggestion</label>
          <textarea 
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="E.g., I tried to generate a ledger report but it showed an empty page..."
            className="p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white w-full resize-y"
            required
          />
        </div>

        <div className="flex flex-col h-auto w-full gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 left-aligned">Attachments (Max 10 files, total 10MB)</label>
          <input 
            type="file" 
            multiple 
            onChange={handleFileChange}
            ref={fileInputRef}
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-200"
          />
          {files.length > 0 && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {files.map((file, index) => (
                <li key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-sm">
                  <span className="truncate max-w-[200px] font-mono text-xs dark:text-gray-300">{file.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                    <button type="button" onClick={() => removeFile(index)} className="text-red-500 hover:text-red-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700 mt-2">
          <button 
            type="submit" 
            disabled={isSubmitting || !userData}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Submitting Ticket...
              </>
            ) : 'Submit Ticket'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default HelpSupport;
