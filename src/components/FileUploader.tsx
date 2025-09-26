import React, { useEffect, useMemo, useState } from 'react';

interface FileUploaderProps {
  value: File | null;
  onChange: (file: File | null) => void;
  isLoading?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ value, onChange, isLoading = false }) => {
  const file = value;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isImage = useMemo(() => file?.type?.startsWith('image/'), [file]);

  useEffect(() => {
    if (!file || !isImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    const f = e.target.files?.[0] ?? null;
    onChange(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (isLoading) return;
    const f = e.dataTransfer.files?.[0] ?? null;
    onChange(f);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (isLoading) return;
  };


  return (
    <div className="space-y-4">
      <label
        htmlFor="file-input"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        aria-disabled={isLoading}
        className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center transition ${isLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400 hover:bg-indigo-50'}`}
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path stroke="currentColor" strokeWidth="2" d="M3 7a4 4 0 014-4h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7z" />
          <path stroke="currentColor" strokeWidth="2" d="M8 13l2.5-2.5L13 13l3-3 3 3" />
        </svg>
        <div className="text-sm text-gray-700">
          <span className="font-medium text-indigo-700">Click to upload</span> or drag and drop
        </div>
        <div className="text-xs text-gray-500">Images, TXT, PDF, DOCX (up to ~10MB)</div>
        <input
          id="file-input"
          type="file"
          accept="image/*, .txt, .pdf, .docx"
          onChange={handleFileChange}
          disabled={isLoading}
          className="sr-only"
        />
      </label>

      {file && (
        <div className="overflow-hidden rounded-lg ring-1 ring-gray-200">
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt="Selected preview"
              className="max-h-64 w-full object-contain bg-gray-50"
            />
          ) : (
            <div className="flex items-center gap-3 bg-gray-50 p-3">
              <svg
                className="h-6 w-6 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 3h6l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
              </svg>
              <div className="text-sm text-gray-700">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-gray-500">{file.type || 'Unknown type'}</div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default FileUploader;