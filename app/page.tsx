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

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [pendingImages, setPendingImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

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
                  if (userMessage) return userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
                  if (sentImages.length) return `Screenshot (${sentImages.length})`;
                  return 'New chat';
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
    <main className="min-h-screen bg-custom-black flex font-mono">
      {/* Sidebar */}
      <div className="w-64 bg-custom-black border-r border-custom-darkGrey flex flex-col">
        <div className="p-4 border-b border-custom-darkGrey">
          <button
            onClick={createNewChat}
            className="w-full px-3 py-2 bg-custom-cyan text-custom-black hover:opacity-90 font-medium text-xs"
          >
            + New chat
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-4 text-custom-cyan text-xs text-center">
              No chats yet
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className={`w-full text-left px-3 py-2 text-xs rounded ${
                    selectedChatId === chat.id
                      ? 'bg-custom-cyan text-custom-black'
                      : 'text-custom-cyan hover:bg-custom-darkGrey'
                  }`}
                >
                  <p className="truncate">{chat.title}</p>
                </button>
              ))}
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
              <label className="text-custom-cyan text-xs uppercase tracking-wide">Client:</label>
              <select
                value={currentChat?.clientId ?? ''}
                onChange={(e) =>
                  setChatClient(selectedChatId, e.target.value ? Number(e.target.value) : null)
                }
                disabled={clientsLoading}
                className="bg-custom-black border border-custom-darkGrey text-custom-cyan px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-custom-cyan min-w-[200px]"
              >
                <option value="">{clientsLoading ? 'Loading clients...' : 'General (no client)'}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="text-custom-cyan text-xs uppercase tracking-wide ml-2">Asked by:</label>
              <input
                type="text"
                value={currentChat?.askerName ?? ''}
                onChange={(e) => setChatAskerName(selectedChatId, e.target.value)}
                placeholder="e.g. Katrina"
                className="bg-custom-black border border-custom-darkGrey text-custom-cyan px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-custom-cyan w-[140px] placeholder-custom-cyan placeholder-opacity-50"
              />
              {currentClient && (
                <span className="text-custom-cyan opacity-60 text-xs truncate">
                  {currentClient.website_url}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-custom-cyan gap-2">
                  <p>
                    {currentClient
                      ? `Ask Jacque about ${currentClient.name}...`
                      : 'Pick a client above, or ask a general question.'}
                  </p>
                  <p className="text-xs opacity-60">Paste, drag, or attach a screenshot.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="max-w-2xl px-4 py-2 text-custom-cyan">
                        {msg.images && msg.images.length > 0 && (
                          <div className={`flex flex-wrap gap-2 mb-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.images.map((img, i) => (
                              <a
                                key={i}
                                href={img.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block border border-custom-darkGrey hover:border-custom-cyan"
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
                          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="text-custom-cyan text-sm">
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
                        className="h-16 w-16 object-cover border border-custom-darkGrey"
                      />
                      <button
                        onClick={() => removePendingImage(i)}
                        className="absolute -top-1 -right-1 bg-custom-cyan text-custom-black w-4 h-4 text-xs leading-none flex items-center justify-center font-bold"
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
                  className="flex-1 bg-custom-black border border-custom-darkGrey text-custom-cyan px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-custom-cyan placeholder-custom-cyan placeholder-opacity-50"
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
                  className="px-3 py-2 border border-custom-darkGrey text-custom-cyan hover:bg-custom-darkGrey disabled:opacity-50 text-sm"
                >
                  Attach
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || (!input.trim() && pendingImages.length === 0)}
                  className="px-4 py-2 bg-custom-cyan text-custom-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-custom-cyan">
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
