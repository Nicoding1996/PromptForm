import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, Loader2 } from 'lucide-react';

interface CommandBarProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  isLoading?: boolean;
  onSend: () => void;
  mode?: 'creation' | 'editing';
}

const CommandBar: React.FC<CommandBarProps> = ({
  prompt,
  onPromptChange,
  file,
  onFileChange,
  isLoading = false,
  onSend,
  mode = 'creation',
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isCreation = mode !== 'editing';

  // Auto-resize textarea based on content
  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 240); // clamp to keep compact
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const handleFilePickClick = () => {
    if (isLoading) return;
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    const f = e.target.files?.[0] ?? null;
    onFileChange(f);
    // reset input so selecting same file again triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isLoading) return;
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) onFileChange(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const canSend = !isLoading && (isCreation ? (prompt.trim().length > 0 || !!file) : prompt.trim().length > 0);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative w-full rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition ${
        isDragging ? 'ring-2 ring-indigo-400 bg-indigo-50/30' : ''
      }`}
    >
      {/* Left (+) button */}
      <button
        type="button"
        aria-label="Attach a file"
        title="Attach a file"
        onClick={handleFilePickClick}
        disabled={isLoading}
        hidden={!isCreation}
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 shadow-sm hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Paperclip className="h-4 w-4" />
      </button>

      {/* Right (Send) button */}
      <button
        type="button"
        aria-label={isCreation ? 'Generate' : 'Apply edit'}
        title={isCreation ? 'Generate' : 'Apply edit'}
        onClick={onSend}
        disabled={!canSend}
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>

      {/* Textarea */}
      <div className={isCreation ? 'px-12 py-3' : 'px-10 py-2'}>
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onInput={resize}
          placeholder={isCreation ? 'Describe the form you want to create...' : 'Ask PromptForm to edit your form...'}
          className={`w-full resize-none rounded-xl border-0 bg-transparent p-0 ${isCreation ? 'text-base' : 'text-sm'} text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0`}
          rows={1}
          spellCheck={true}
        />
      </div>

      {/* File 'pill' */}
      <div className="px-12 pb-3" hidden={!isCreation}>
        {file ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 ring-1 ring-gray-200">
            <span className="truncate max-w-[240px]">{file.name}</span>
            <button
              type="button"
              aria-label="Remove file"
              title="Remove file"
              onClick={() => onFileChange(null)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-gray-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-gray-500">Attach an image, TXT, PDF, or DOCX (optional).</span>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*, .txt, .pdf, .docx"
        className="hidden"
        onChange={handleFileInput}
        disabled={!isCreation}
      />
    </div>
  );
};

export default CommandBar;