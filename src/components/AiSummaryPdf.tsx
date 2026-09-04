import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  FileText,
  X,
  AlertCircle,
  Bot,
  Key,
  Send,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { extractTextFromPDF } from '../utils/pdfEngine';

interface AiSummaryPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI (GPT-4o-mini)', endpoint: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' },
  { id: 'groq', name: 'Groq (Fast / Llama 3.3)', endpoint: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.3-70b-versatile' },
];

export const AiSummaryPdf: React.FC<AiSummaryPdfProps> = ({ file, onFileChange }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('1into1_user_ai_key') || '');
  const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0].id);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Save API key locally
  const handleKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('1into1_user_ai_key', key);
  };

  // Extract text immediately when file is selected
  useEffect(() => {
    if (!file) {
      setExtractedText('');
      setMessages([]);
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsExtracting(true);
    setErrorMessage(null);

    extractTextFromPDF(file)
      .then((text) => {
        if (!isMounted) return;
        if (!text.trim()) {
          setErrorMessage('No selectable text found in this PDF. Use "OCR PDF" first if this is a scan.');
        } else {
          setExtractedText(text);
          setMessages([
            {
              role: 'assistant',
              content: `Hello! I've loaded "${file.name}" into your browser's memory (${text.length.toLocaleString()} characters extracted). What would you like to know or summarize?`,
            },
          ]);
        }
      })
      .catch((err) => {
        console.error('Failed to extract text for AI:', err);
        if (isMounted) setErrorMessage('Failed to read document text. The file may be password-protected.');
      })
      .finally(() => {
        if (isMounted) setIsExtracting(false);
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Direct client-side streaming call
  const sendPrompt = async (userPrompt: string) => {
    if (!apiKey.trim()) {
      setErrorMessage('Please enter your API Key below to start chatting.');
      return;
    }
    if (!extractedText) {
      setErrorMessage('No document text available to analyze.');
      return;
    }

    const providerConfig = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userPrompt }];
    setMessages(newMessages);
    setInputValue('');
    setIsStreaming(true);
    setErrorMessage(null);

    // Context truncation to preserve tokens (~40k chars max)
    const contextText = extractedText.slice(0, 40000);

    const systemPrompt = `You are a helpful, accurate document assistant analyzing a PDF client-side.
Answer user questions strictly based on the provided document text below. If the answer is not in the document, explicitly say so.

DOCUMENT TEXT:
${contextText}`;

    try {
      const response = await fetch(providerConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: providerConfig.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...newMessages.slice(-6), // Keep recent conversation history
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error?.message || `API error: ${response.statusText} (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream not readable.');

      const decoder = new TextDecoder('utf-8');
      let assistantReply = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const token = data.choices?.[0]?.delta?.content || '';
              assistantReply += token;

              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: assistantReply,
                };
                return updated;
              });
            } catch {
              // Ignore partial stream chunks
            }
          }
        }
      }
    } catch (err: any) {
      console.error('AI streaming error:', err);
      setErrorMessage(err.message || 'Failed to communicate with the AI provider.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (isStreaming) return;
    sendPrompt(prompt);
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClear = () => {
    onFileChange(null);
    setExtractedText('');
    setMessages([]);
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to summarize and chat"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Bot className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to summarize & chat</p>
          <p className="text-xs text-zinc-500 mt-1">100% Client-Side • Bring Your Own Key • Zero Server Egress</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                onFileChange(selected);
              }
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-4 text-left">
          {/* File Card */}
          <div className="flex items-center justify-between p-3 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {isExtracting
                    ? 'Extracting text layer locally...'
                    : `${extractedText.length.toLocaleString()} characters extracted`}
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1 rounded text-zinc-400 hover:text-red-400 transition"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* BYO-Key Configuration Bar */}
          <div className="p-3 bg-zinc-950/50 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bring Your Own API Key</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Saved only in your browser</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="Paste your API key (sk-...)"
                className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Quick Action Prompt Chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Executive Summary', prompt: 'Provide a concise 3-paragraph executive summary of this document.' },
              { label: 'Key Action Items', prompt: 'Extract all key takeaways and action items as a bulleted checklist.' },
              { label: 'Explain Like I\'m 5', prompt: 'Explain the core thesis and conclusions of this document in simple terms for a beginner.' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleQuickAction(chip.prompt)}
                disabled={isStreaming || isExtracting || !extractedText}
                className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-medium text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 transition disabled:opacity-30 flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Messages Log */}
          <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 h-[320px] overflow-y-auto space-y-3.5 scrollbar-thin text-xs">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                )}
                <div
                  className={`relative group max-w-[85%] p-3 rounded-xl whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-black font-medium rounded-tr-none'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                  {msg.role === 'assistant' && msg.content && (
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
                      title="Copy response"
                    >
                      {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputValue.trim() && !isStreaming) {
                sendPrompt(inputValue);
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isStreaming || isExtracting || !extractedText}
              placeholder={isExtracting ? 'Reading PDF...' : 'Ask any question about this document...'}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => setMessages(messages.slice(0, 1))}
                className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-red-400 transition"
                title="Reset Chat"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isStreaming || !inputValue.trim() || !extractedText}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center gap-1.5 transition text-xs shadow"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};