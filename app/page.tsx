'use client';

import { useState, useEffect, useRef } from 'react';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

interface AttachedImage {
  dataUrl: string;
  mediaType: ImageMediaType;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: AttachedImage[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
  clientId: number | null;
  askerName: string;
}

interface ClientOption {
  id: number;
  name: string;
  website_url: string;
  pocs?: string[];
}

const SUPPORTED_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_DIM = 1568;
const MAX_BYTES = 4 * 1024 * 1024;

async function processImage(file: File): Promise<AttachedImage | null> {
  if (!file.type.startsWith('image/')) return null;
  if (file.size > 20 * 1024 * 1024) {
    alert(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.`);
    return null;
  }

  const originalUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = originalUrl;
  });

  const supported = SUPPORTED_TYPES.includes(file.type as ImageMediaType);
  const tooBig = img.width > MAX_DIM || img.height > MAX_DIM;
  const tooHeavy = file.size > MAX_BYTES;

  if (supported && !tooBig && !tooHeavy) {
    return { dataUrl: originalUrl, mediaType: file.type as ImageMediaType };
  }

  const ratio = tooBig ? Math.min(MAX_DIM / img.width, MAX_DIM / img.height) : 1;
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  const isPng = file.type === 'image/png';
  const outType: ImageMediaType = isPng ? 'image/png' : 'image/jpeg';
  const outUrl = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  return { dataUrl: outUrl, mediaType: outType };
}

function summarizeQuestion(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const firstSentence = cleaned.split(/[.?!]\s+/)[0];
  const max = 40;
  if (firstSentence.length <= max) return firstSentence;
  const truncated = firstSentence.slice(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  const cut = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  return cut + '...';
}

function buildChatTitle(
  clientName: string | null,
  question: string,
  imageCount: number
): string {
  const summary = question.trim()
    ? summarizeQuestion(question)
    : imageCount > 0
    ? `Screenshot${imageCount > 1 ? `s (${imageCount})` : ''}`
    : '';
  if (!summary) return clientName ?? 'New chat';
  return clientName ? `${clientName} - ${summary}` : summary;
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [pendingImages, setPendingImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const [clientHighlight, setClientHighlight] = useState(0);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientBoxRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const skipFirstPersist = useRef(true);

  const currentChat = chats.find((c) => c.id === selectedChatId);
  const messages = currentChat?.messages || [];
  const currentClient = currentChat?.clientId
    ? clients.find((c) => c.id === currentChat.clientId)
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('./api/clients')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setClients(data);
      })
      .catch(() => {})
      .finally(() => setClientsLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ai-jacque:state');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { chats?: Chat[]; selectedChatId?: string | null };
      if (Array.isArray(parsed.chats)) {
        const cleaned = parsed.chats.map((c) =>
          c.messages.length === 0 ? { ...c, clientId: null, askerName: '' } : c
        );
        setChats(cleaned);
        if (
          typeof parsed.selectedChatId === 'string' &&
          cleaned.some((c) => c.id === parsed.selectedChatId)
        ) {
          setSelectedChatId(parsed.selectedChatId);
        }
      }
    } catch {
      // Corrupt storage - ignore and start fresh
    }
  }, []);

  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(
        'ai-jacque:state',
        JSON.stringify({ chats, selectedChatId })
      );
    } catch (err) {
      // Quota exceeded or storage disabled - log but keep working
      console.warn('[ai-jacque] failed to persist chat state:', err);
    }
  }, [chats, selectedChatId]);

  useEffect(() => {
    setClientQuery(currentClient?.name ?? '');
    setClientOpen(false);
  }, [selectedChatId, currentClient?.name]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setClientOpen(false);
        setClientQuery(currentClient?.name ?? '');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [currentClient?.name]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New chat',
      messages: [],
      timestamp: Date.now(),
      clientId: null,
      askerName: '',
    };
    setChats((prev) => [newChat, ...prev]);
    setSelectedChatId(newChat.id);
    setPendingImages([]);
  };

  const setChatClient = (chatId: string, clientId: number | null) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, clientId } : chat))
    );
  };

  const setChatAskerName = (chatId: string, askerName: string) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, askerName } : chat))
    );
  };

  const renameChat = (chatId: string, title: string) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, title } : chat))
    );
  };

  const startEditingChat = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditingTitle(currentTitle);
  };

  const commitChatRename = () => {
    if (editingChatId === null) return;
    const next = editingTitle.trim() || 'Untitled';
    renameChat(editingChatId, next);
    setEditingChatId(null);
    setEditingTitle('');
  };

  const cancelChatRename = () => {
    setEditingChatId(null);
    setEditingTitle('');
  };

  const filteredClients = clientQuery.trim()
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(clientQuery.trim().toLowerCase())
      )
    : clients;

  const pickClient = (id: number | null, name: string) => {
    if (!selectedChatId) return;
    setChatClient(selectedChatId, id);
    setChatAskerName(selectedChatId, '');
    setClientQuery(name);
    setClientOpen(false);
    setClientHighlight(0);
  };

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    const processed = await Promise.all(arr.map(processImage));
    const valid = processed.filter((p): p is AttachedImage => p !== null);
    if (valid.length > 0) setPendingImages((prev) => [...prev, ...valid]);
  };

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || !selectedChatId) return;

    const userMessage = input.trim();
    const sentImages = pendingImages;
    setInput('');
    setPendingImages([]);

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === selectedChatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                { role: 'user', content: userMessage, images: sentImages.length ? sentImages : undefined },
              ],
            }
          : chat
      )
    );

    setLoading(true);

    try {
      const conversationHistory = messages
        .map((m) => {
          const imgNote = m.images?.length ? ` [+${m.images.length} screenshot${m.images.length === 1 ? '' : 's'}]` : '';
          return `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}${imgNote}`;
        })
        .join('\n\n');

      const apiImages = sentImages.map((img) => ({
        mediaType: img.mediaType,
        data: img.dataUrl.split(',')[1] || '',
      }));

      const res = await fetch('./api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          conversationHistory,
          clientId: currentChat?.clientId ?? null,
          images: apiImages,
          askerName: currentChat?.askerName?.trim() || null,
        }),
      });
      const data = await res.json();
      const assistantMessage = data.answer || data.error || 'No response';

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                messages: [...chat.messages, { role: 'assistant', content: assistantMessage }],
                title: (() => {
                  if (chat.title !== 'New chat') return chat.title;
                  const resolvedClientName = chat.clientId
                    ? clients.find((c) => c.id === chat.clientId)?.name ?? null
                    : typeof data.client_name === 'string'
                    ? data.client_name
                    : null;
                  return buildChatTitle(resolvedClientName, userMessage, sentImages.length);
                })(),
                clientId:
                  chat.clientId ??
                  (typeof data.client_name === 'string'
                    ? clients.find((c) => c.name === data.client_name)?.id ?? null
                    : null),
              }
            : chat
        )
      );
    } catch (error) {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                messages: [...chat.messages, { role: 'assistant', content: 'Error: ' + String(error) }],
              }
            : chat
        )
      );
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="min-h-screen bg-custom-black flex">
      {/* Sidebar */}
      <div className="w-64 bg-custom-black border-r border-custom-darkGrey flex flex-col">
        <div className="p-4 border-b border-custom-darkGrey">
          <button
            onClick={createNewChat}
            className="w-full px-3 py-2 rounded-md bg-custom-cyan text-custom-black hover:opacity-90 font-semibold text-xs"
          >
            + New chat
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-4 text-custom-muted text-xs text-center">
              No chats yet
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {chats.map((chat) =>
                editingChatId === chat.id ? (
                  <input
                    key={chat.id}
                    type="text"
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={commitChatRename}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitChatRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelChatRename();
                      }
                    }}
                    className="w-full bg-custom-card border border-custom-cyan text-custom-white px-3 py-2 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-custom-cyan"
                  />
                ) : (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChatId(chat.id)}
                    onDoubleClick={() => startEditingChat(chat.id, chat.title)}
                    title="Double-click to rename"
                    className={`w-full text-left px-3 py-2 text-xs rounded-md ${
                      selectedChatId === chat.id
                        ? 'bg-custom-cyan text-custom-black font-semibold'
                        : 'text-custom-white hover:bg-custom-card'
                    }`}
                  >
                    <p className="truncate">{chat.title}</p>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div
        className="flex-1 flex flex-col relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedChatId ? (
          <>
            {/* Chat header: client picker + asker name */}
            <div className="border-b border-custom-darkGrey p-3 flex items-center gap-3 flex-wrap">
              <label className="text-custom-muted text-[10px] font-semibold uppercase tracking-wider">Client</label>
              <div ref={clientBoxRef} className="relative w-[240px]">
                <input
                  type="text"
                  value={clientQuery}
                  onChange={(e) => {
                    setClientQuery(e.target.value);
                    setClientOpen(true);
                    setClientHighlight(0);
                  }}
                  onFocus={(e) => {
                    setClientOpen(true);
                    setClientHighlight(0);
                    e.currentTarget.select();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setClientOpen(false);
                      setClientQuery(currentClient?.name ?? '');
                      e.currentTarget.blur();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setClientOpen(true);
                      setClientHighlight((h) =>
                        Math.min(h + 1, filteredClients.length - 1)
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setClientHighlight((h) => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const c = filteredClients[clientHighlight];
                      if (c) pickClient(c.id, c.name);
                    }
                  }}
                  placeholder={clientsLoading ? 'Loading clients...' : 'Search clients or pick General'}
                  disabled={clientsLoading}
                  className="w-full bg-custom-card border border-custom-darkGrey text-custom-white px-3 py-2 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-custom-cyan"
                />
                {clientOpen && !clientsLoading && (
                  <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-custom-card border border-custom-darkGrey rounded-md shadow-lg">
                    <button
                      type="button"
                      onClick={() => pickClient(null, '')}
                      className={`w-full text-left px-3 py-2 text-xs ${
                        currentChat?.clientId == null
                          ? 'text-custom-cyan font-semibold'
                          : 'text-custom-muted hover:bg-custom-hover'
                      }`}
                    >
                      General (no client)
                    </button>
                    {filteredClients.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickClient(c.id, c.name)}
                        onMouseEnter={() => setClientHighlight(i)}
                        className={`w-full text-left px-3 py-2 text-xs ${
                          i === clientHighlight ? 'bg-custom-hover' : ''
                        } ${
                          currentChat?.clientId === c.id
                            ? 'text-custom-cyan font-semibold'
                            : 'text-custom-white'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="px-3 py-2 text-xs text-custom-muted">
                        No clients match
                      </div>
                    )}
                  </div>
                )}
              </div>
              <label className="text-custom-muted text-[10px] font-semibold uppercase tracking-wider ml-2">POC</label>
              {(() => {
                const askerName = currentChat?.askerName ?? '';
                const pocs = currentClient?.pocs ?? [];
                const hasPocs = pocs.length > 0;
                const optionList = askerName && !pocs.includes(askerName)
                  ? [askerName, ...pocs]
                  : pocs;
                return (
                  <select
                    value={askerName}
                    onChange={(e) => setChatAskerName(selectedChatId, e.target.value)}
                    disabled={!currentClient || !hasPocs}
                    className="bg-custom-card border border-custom-darkGrey text-custom-white px-3 py-2 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-custom-cyan w-[160px] disabled:opacity-50"
                  >
                    <option value="">
                      {!currentClient
                        ? 'Pick a client first'
                        : !hasPocs
                        ? 'No POCs configured'
                        : 'Select POC...'}
                    </option>
                    {optionList.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                );
              })()}
              {currentClient && (
                <span className="text-custom-muted text-xs truncate">
                  {currentClient.website_url}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-custom-white text-base">
                    {currentClient
                      ? `Ask Jacque about ${currentClient.name}...`
                      : 'Pick a client above, or ask a general question.'}
                  </p>
                  <p className="text-custom-muted text-xs">Paste, drag, or attach a screenshot.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-2xl px-4 py-3 rounded-lg text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-custom-card text-custom-white'
                          : 'text-custom-white'
                      }`}>
                        {msg.images && msg.images.length > 0 && (
                          <div className={`flex flex-wrap gap-2 mb-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.images.map((img, i) => (
                              <a
                                key={i}
                                href={img.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded-md overflow-hidden border border-custom-darkGrey hover:border-custom-cyan"
                              >
                                <img
                                  src={img.dataUrl}
                                  alt={`screenshot ${i + 1}`}
                                  className="max-w-xs max-h-64 object-contain"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        {msg.content && (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="text-custom-cyan text-sm px-4 py-3">
                        <p>Thinking...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-custom-darkGrey p-4">
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img.dataUrl}
                        alt={`pending ${i + 1}`}
                        className="h-16 w-16 object-cover rounded-md border border-custom-darkGrey"
                      />
                      <button
                        onClick={() => removePendingImage(i)}
                        className="absolute -top-1 -right-1 bg-custom-cyan text-custom-black w-4 h-4 text-xs leading-none flex items-center justify-center font-bold rounded-full"
                        title="Remove"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-stretch">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    currentClient
                      ? `Paste the question ${currentClient.name} asked... (Cmd+V to paste a screenshot)`
                      : "Paste the client's question or screenshot... (Cmd+V works)"
                  }
                  className="flex-1 bg-custom-card border border-custom-darkGrey text-custom-white px-3 py-2 text-sm rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-custom-cyan"
                  rows={3}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="Attach screenshot"
                  className="px-4 py-2 rounded-md border border-custom-darkGrey text-custom-white hover:bg-custom-card disabled:opacity-50 text-sm"
                >
                  Attach
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || (!input.trim() && pendingImages.length === 0)}
                  className="px-5 py-2 rounded-md bg-custom-cyan text-custom-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-custom-muted">
            <p>Select or create a chat to begin</p>
          </div>
        )}

        {isDragging && (
          <div className="absolute inset-0 bg-custom-black bg-opacity-90 border-4 border-dashed border-custom-cyan flex items-center justify-center pointer-events-none z-50">
            <p className="text-custom-cyan text-xl">Drop screenshot to attach</p>
          </div>
        )}
      </div>
    </main>
  );
}
