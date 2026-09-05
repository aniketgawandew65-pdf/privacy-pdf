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
  Settings2,
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

interface ProviderOption {
  id: string;
  name: string;
  endpoint: string;
  candidateModels: string[];
  placeholder: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'groq',
    name: 'Groq (Free / Ultra-Fast)',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    candidateModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama3-8b-8192',
      'llama3-70b-8192',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
      'deepseek-r1-distill-llama-70b',
    ],
    placeholder: 'gsk_...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    candidateModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    placeholder: 'sk-proj-...',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (All Models)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    candidateModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
      'mistralai/mistral-7b-instruct:free',
    ],
    placeholder: 'sk-or-...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    candidateModels: ['deepseek-chat', 'deepseek-reasoner'],
    placeholder: 'sk-...',
  },
  {
    id: 'custom',
    name: 'Custom / Local (Ollama, LM Studio)',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    candidateModels: ['llama3', 'mistral', 'llama2'],
    placeholder: 'Optional API token...',
  },
];

export const AiSummaryPdf: React.FC<AiSummaryPdfProps> = ({ file, onFileChange }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('1into1_user_ai_key') || '');
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    return localStorage.getItem('1into1_user_ai_provider') || 'groq';
  });
  const [activeWorkingModel, setActiveWorkingModel] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>(() => {
    return localStorage.getItem('1into1_user_ai_model') || '';
  });
  const [customEndpointUrl, setCustomEndpointUrl] = useState<string>(() => {
    return localStorage.getItem('1into1_user_ai_endpoint') || '';
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-detect provider prefix when user pastes key
  const handleKeyChange = (key: string) => {
    const trimmed = key.trim();
    setApiKey(trimmed);
    localStorage.setItem('1into1_user_ai_key', trimmed);
    setErrorMessage(null);

    if (trimmed.startsWith('gsk_') && selectedProvider !== 'groq') {
      handleProviderChange('groq');
    } else if (trimmed.startsWith('sk-or-') && selectedProvider !== 'openrouter') {
      handleProviderChange('openrouter');
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    localStorage.setItem('1into1_user_ai_provider', providerId);
    setActiveWorkingModel('');
    setErrorMessage(null);

    const prov = PROVIDERS.find((p) => p.id === providerId);
    if (prov && prov.id === 'custom' && !customEndpointUrl) {
      setCustomEndpointUrl(prov.endpoint);
    }
  };

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
          setErrorMessage('No selectable text found in this PDF. Use "OCR Searchable" first if this is a scanned document.');
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

  const sendPrompt = async (userPrompt: string) => {
    if (!navigator.onLine) {
      setErrorMessage('No internet connection. Please reconnect to communicate with the AI provider.');
      return;
    }

    const providerConfig = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];
    const isCustomLocal = providerConfig.id === 'custom';

    if (!apiKey.trim() && !isCustomLocal) {
      setErrorMessage('Please enter your API Key in the box above to begin.');
      return;
    }
    if (!extractedText) {
      setErrorMessage('No document text available to analyze.');
      return;
    }

    const endpoint = isCustomLocal
      ? customEndpointUrl.trim() || providerConfig.endpoint
      : providerConfig.endpoint;

    // Assemble model candidate list
    const candidateList: string[] = [];
    if (customModel.trim()) candidateList.push(customModel.trim());
    if (activeWorkingModel && !candidateList.includes(activeWorkingModel)) {
      candidateList.push(activeWorkingModel);
    }
    for (const m of providerConfig.candidateModels) {
      if (!candidateList.includes(m)) candidateList.push(m);
    }

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userPrompt }];
    setMessages(newMessages);
    setInputValue('');
    setIsStreaming(true);
    setErrorMessage(null);

    const contextText = extractedText.slice(0, 45000);
    const systemPrompt = `You are a helpful, accurate document assistant analyzing a PDF client-side.
Answer user questions strictly based on the provided document text below. If the answer is not in the document, explicitly say so.

DOCUMENT TEXT:
${contextText}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    if (providerConfig.id === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = '1into1 PDF Suite';
    }

    let activeResponse: Response | null = null;
    let resolvedModel = '';
    let fatalError = '';

    // Auto-fallback waterfall loop
    for (const modelToAttempt of candidateList) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelToAttempt,
            messages: [
              { role: 'system', content: systemPrompt },
              ...newMessages.slice(-6),
            ],
            stream: true,
          }),
        });

        if (res.status === 401) {
          fatalError = 'Invalid API Key. Please verify the key you copied.';
          break;
        }

        if (res.status === 429) {
          fatalError = 'API rate limit reached or token quota exhausted on this key. Please try again shortly.';
          break;
        }

        if (res.status === 402) {
          fatalError = 'Insufficient balance / credits on your API account.';
          break;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errText = (errData?.error?.message || res.statusText || '').toLowerCase();

          // If model is missing, deprecated, or restricted, try next candidate
          if (
            res.status === 404 ||
            errText.includes('does not exist') ||
            errText.includes('not have access') ||
            errText.includes('model_not_found') ||
            errText.includes('decommissioned') ||
            errText.includes('deprecated')
          ) {
            continue;
          }

          throw new Error(errData?.error?.message || `HTTP ${res.status}`);
        }

        // Successfully connected to an active model
        activeResponse = res;
        resolvedModel = modelToAttempt;
        setActiveWorkingModel(modelToAttempt);
        break;
      } catch (err: any) {
        if (fatalError) break;
        fatalError = err.message || 'Network connection failure.';
      }
    }

    if (!activeResponse) {
      setIsStreaming(false);
      setErrorMessage(
        fatalError || 'Could not find an active model on this key. Please verify your account status.'
      );
      return;
    }

    try {
      const reader = activeResponse.body?.getReader();
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
      console.error('Streaming error:', err);
      setErrorMessage(err.message || 'Stream connection interrupted.');
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

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

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
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to summarize &amp; chat</p>
          <p className="text-xs text-zinc-500 mt-1">
            Auto-Detecting Models • Client-to-Provider Streaming • Zero Cloud Storage
          </p>
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
              className="p-1 rounded text-zinc-400 hover:text-red-400 transition cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Key & Provider Configuration Tray */}
          <div className="p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>API Key</span>
                {activeWorkingModel && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                    active: {activeWorkingModel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>{showAdvanced ? 'Hide Custom Model' : 'Custom Model (Optional)'}</span>
                </button>
                <span className="text-zinc-700">•</span>
                <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved locally in browser</span>
                </div>
              </div>
            </div>

            {/* Provider and Key Row */}
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 shrink-0"
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
                placeholder={`Paste your ${currentProvider.name.split(' ')[0]} API Key (${currentProvider.placeholder})`}
                className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Optional Custom Overrides */}
            {(showAdvanced || selectedProvider === 'custom') && (
              <div className="pt-2 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs animate-in fade-in duration-150">
                <div>
                  <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                    Force Specific Model (Optional):
                  </label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => {
                      setCustomModel(e.target.value);
                      localStorage.setItem('1into1_user_ai_model', e.target.value);
                    }}
                    placeholder="Leave empty for auto-detection"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {selectedProvider === 'custom' && (
                  <div>
                    <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                      Endpoint URL:
                    </label>
                    <input
                      type="text"
                      value={customEndpointUrl}
                      onChange={(e) => {
                        setCustomEndpointUrl(e.target.value);
                        localStorage.setItem('1into1_user_ai_endpoint', e.target.value);
                      }}
                      placeholder="http://localhost:11434/v1/chat/completions"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Action Buttons */}
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
                className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-medium text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 transition disabled:opacity-30 flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Messages Screen */}
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
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
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

          {/* Clean User Feedback Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Prompt Input Form */}
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
              placeholder={isExtracting ? 'Reading PDF text...' : 'Ask anything about this document...'}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => setMessages(messages.slice(0, 1))}
                className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                title="Reset Chat"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isStreaming || !inputValue.trim() || !extractedText}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center gap-1.5 transition text-xs shadow cursor-pointer"
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

export default AiSummaryPdf;