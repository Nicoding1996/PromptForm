import React, { useEffect, useState } from 'react';

interface ImageUploaderProps {
  onGenerate: (file: File) => void | Promise<void>;
  isLoading?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onGenerate, isLoading = false }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f && f.type.startsWith('image/')) {
      setFile(f);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  const handleGenerateClick = () => {
    if (!file || isLoading) return;
    onGenerate(file);
  };

  return (
    <div className="space-y-4">
      <label
        htmlFor="image-input"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
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
        <div className="text-xs text-gray-500">PNG, JPG, GIF up to ~10MB</div>
        <input
          id="image-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only"
        />
      </label>

      {previewUrl && (
        <div className="overflow-hidden rounded-lg ring-1 ring-gray-200">
          <img
            src={previewUrl}
            alt="Selected preview"
            className="max-h-64 w-full object-contain bg-gray-50"
          />
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleGenerateClick}
          disabled={!file || isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading && (
            <svg
              className="h-5 w-5 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"
              />
            </svg>
          )}
          Generate Form
        </button>
      </div>
    </div>
  );
};

export default ImageUploader;