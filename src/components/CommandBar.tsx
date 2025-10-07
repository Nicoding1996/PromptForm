import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

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
    // Allow natural vertical growth: reset to auto then expand to full scroll height.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
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
      className={`relative w-full rounded-full bg-white shadow-sm ring-1 ring-neutral-200 transition ${isCreation ? 'min-h-[64px] focus-within:ring-2 focus-within:ring-primary-400' : 'min-h-[48px] focus-within:ring-2 focus-within:ring-indigo-300'} ${
        isDragging ? (isCreation ? 'ring-2 ring-primary-400 bg-primary-50/30' : 'ring-2 ring-indigo-400 bg-indigo-50/30') : ''
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
        className={`absolute left-3 ${isCreation ? 'bottom-2' : 'top-1/2 -translate-y-1/2'} transform inline-flex ${isCreation ? 'h-7 w-7' : 'h-8 w-8'} items-center justify-center rounded-full bg-gray-100 text-gray-700 shadow-sm hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Paperclip className="h-4 w-4" />
      </button>

      {/* Right (Send) button */}
      <motion.button
        type="button"
        aria-label={isCreation ? 'Generate' : 'Apply edit'}
        title={isCreation ? 'Generate' : 'Apply edit'}
        onClick={onSend}
        disabled={!canSend}
        className={`absolute right-3 top-1/2 -translate-y-1/2 transform inline-flex items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-60 ${
          isCreation ? 'h-11 w-11 bg-primary-600 hover:bg-primary-700 shadow-md' : 'h-8 w-8 bg-indigo-600 hover:bg-indigo-500 shadow-sm'
        }`}
        animate={isCreation && !isLoading ? { scale: [1, 1.05, 1] } : undefined}
        transition={isCreation && !isLoading ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        {isLoading ? <Loader2 className={isCreation ? 'h-5 w-5 animate-spin' : 'h-4 w-4 animate-spin'} /> : <Send className={isCreation ? 'h-5 w-5' : 'h-4 w-4'} />}
      </motion.button>

      {/* Textarea */}
      <div className={isCreation ? 'px-12 pt-3 pb-7' : 'px-12 py-2'}>
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onInput={resize}
          placeholder={isCreation ? 'e.g., A customer satisfaction survey for my coffee shop' : 'Ask PromptForm to edit your form...'}
          className={`w-full resize-none border-0 bg-transparent p-0 pr-16 ${isCreation ? 'text-base min-h-[48px] max-h-[50vh]' : 'text-sm min-h-[40px] max-h-[40vh]'} leading-6 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 break-words overflow-y-auto`}
          rows={1}
          spellCheck={true}
        />
      </div>

      {isCreation && !file && (
        <div className="absolute left-12 bottom-2 text-sm text-neutral-400 select-none pointer-events-none">
          Attach an image, TXT, PDF, or DOCX (optional).
        </div>
      )}

      {/* File 'pill' */}
      <div className="px-12 pb-3" hidden={!isCreation || !file}>
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
        ) : null}
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