'use client';

import { useState, useEffect, useRef } from 'react';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

interface AttachedImage {
  dataUrl: string;
  mediaType: ImageMediaType;
}

interface CalendarReschedulePayload {
  event_id: string;
  calendar_id?: string;
  event_summary?: string;
  attendees?: string[];
  current_start: { dateTime?: string; timeZone?: string };
  current_end: { dateTime?: string; timeZone?: string };
  new_start: { dateTime?: string; timeZone?: string };
  new_end: { dateTime?: string; timeZone?: string };
  reason?: string;
  html_link?: string | null;
}

interface ActionProposal {
  id: string;
  kind: string;
  summary: string;
  payload: CalendarReschedulePayload | unknown;
  status: string;
  expires_at: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: AttachedImage[];
  actionProposals?: ActionProposal[];
}

type ChatMode = 'client_question' | 'guidance' | 'pas' | 'ari';

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
  clientId: number | null;
  askerName: string;
  mode?: ChatMode;
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
  const [sidebarCategory, setSidebarCategory] = useState<ChatMode>('client_question');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [pendingImages, setPendingImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const [clientHighlight, setClientHighlight] = useState(0);
  const [pocQuery, setPocQuery] = useState('');
  const [pocOpen, setPocOpen] = useState(false);
  const [pocHighlight, setPocHighlight] = useState(0);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [previewImage, setPreviewImage] = useState<AttachedImage | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [proposalUiStatus, setProposalUiStatus] = useState<
    Record<string, { status: string; error?: string }>
  >({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientBoxRef = useRef<HTMLDivElement>(null);
  const pocBoxRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const skipFirstPersist = useRef(true);
  const resizingRef = useRef(false);

  const currentChat = chats.find((c) => c.id === selectedChatId);
  const messages = currentChat?.messages || [];
  const currentClient = currentChat?.clientId
    ? clients.find((c) => c.id === currentChat.clientId)
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewImage]);

  useEffect(() => {
    fetch('/cortex/api/clients')
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
      const parsed = JSON.parse(raw) as {
        chats?: Chat[];
        selectedChatId?: string | null;
        sidebarCategory?: ChatMode;
      };
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
      if (
        parsed.sidebarCategory === 'client_question' ||
        parsed.sidebarCategory === 'guidance' ||
        parsed.sidebarCategory === 'pas' ||
        parsed.sidebarCategory === 'ari'
      ) {
        setSidebarCategory(parsed.sidebarCategory);
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
        JSON.stringify({ chats, selectedChatId, sidebarCategory })
      );
    } catch (err) {
      // Quota exceeded or storage disabled - log but keep working
      console.warn('[ai-jacque] failed to persist chat state:', err);
    }
  }, [chats, selectedChatId, sidebarCategory]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ai-jacque:sidebar-width');
      if (!raw) return;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 180 && n <= 480) {
        setSidebarWidth(n);
      }
    } catch {
      // ignore
    }
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.max(180, Math.min(480, ev.clientX));
      setSidebarWidth(next);
    };

    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setSidebarWidth((w) => {
        try {
          localStorage.setItem('ai-jacque:sidebar-width', String(w));
        } catch {
          // ignore
        }
        return w;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

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

  useEffect(() => {
    setPocQuery(currentChat?.askerName ?? '');
    setPocOpen(false);
  }, [selectedChatId, currentChat?.askerName]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (pocBoxRef.current && !pocBoxRef.current.contains(e.target as Node)) {
        setPocOpen(false);
        setPocQuery(currentChat?.askerName ?? '');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [currentChat?.askerName]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New chat',
      messages: [],
      timestamp: Date.now(),
      clientId: null,
      askerName: '',
      mode: sidebarCategory,
    };
    setChats((prev) => [newChat, ...prev]);
    setSelectedChatId(newChat.id);
    setPendingImages([]);
  };

  const currentMode: ChatMode =
    (currentChat?.mode ?? 'client_question') as ChatMode;

  // Filter the chat list to the active sidebar category. Backward-compat:
  // chats missing a mode field default to 'client_question'.
  const visibleChats = chats.filter(
    (c) => (c.mode ?? 'client_question') === sidebarCategory
  );

  const setChatMode = (chatId: string, mode: ChatMode) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        if (mode === 'guidance') {
          return { ...chat, mode, clientId: null, askerName: '' };
        }
        return { ...chat, mode };
      })
    );
    if (mode === 'guidance') {
      setClientQuery('');
      setPocQuery('');
      setClientOpen(false);
      setPocOpen(false);
    }
    // Move the sidebar to follow the chat - the user just re-categorized it,
    // so the chat is no longer in the old category's history.
    setSidebarCategory(mode);
  };

  const pickSidebarCategory = (cat: ChatMode) => {
    setSidebarCategory(cat);
    // If the currently-selected chat is no longer visible in this category,
    // deselect it so the user isn't stuck looking at a chat that's "hidden".
    const stillVisible = chats.some(
      (c) => c.id === selectedChatId && (c.mode ?? 'client_question') === cat
    );
    if (!stillVisible) setSelectedChatId(null);
  };

  const CATEGORY_LABELS: Record<ChatMode, string> = {
    client_question: 'Client Q',
    guidance: 'Guidance',
    pas: 'PAS',
    ari: 'ARI',
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

  const deleteChat = (chatId: string) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (selectedChatId === chatId) {
      setSelectedChatId(null);
    }
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

  const approveProposal = async (proposalId: string) => {
    setProposalUiStatus((prev) => ({ ...prev, [proposalId]: { status: 'executing' } }));
    try {
      const res = await fetch('/cortex/api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setProposalUiStatus((prev) => ({
          ...prev,
          [proposalId]: { status: 'error', error: data.error || 'Failed' },
        }));
        return;
      }
      setProposalUiStatus((prev) => ({ ...prev, [proposalId]: { status: 'executed' } }));
    } catch (err) {
      setProposalUiStatus((prev) => ({
        ...prev,
        [proposalId]: { status: 'error', error: String(err) },
      }));
    }
  };

  const declineProposal = async (proposalId: string) => {
    setProposalUiStatus((prev) => ({ ...prev, [proposalId]: { status: 'declined' } }));
    try {
      await fetch('/cortex/api/actions/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
    } catch {
      // best-effort; the card stays in 'declined' UI state regardless
    }
  };

  const formatTimeForCard = (t: { dateTime?: string; timeZone?: string } | undefined): string => {
    if (!t?.dateTime) return '';
    try {
      return new Date(t.dateTime).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: t.timeZone,
        timeZoneName: 'short',
      });
    } catch {
      return t.dateTime;
    }
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

  const createAndPickClient = async (name: string) => {
    if (!selectedChatId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/cortex/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(`POST /api/clients ${res.status}`);
      const created = (await res.json()) as ClientOption;
      setClients((prev) => {
        const next = prev.filter((c) => c.id !== created.id);
        return [...next, created].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      });
      setChatClient(selectedChatId, created.id);
      setChatAskerName(selectedChatId, '');
      setClientQuery(created.name);
      setClientOpen(false);
      setClientHighlight(0);
    } catch (err) {
      console.error('Failed to create client', err);
    }
  };

  const pocSuggestions = (() => {
    const list = currentClient?.pocs ?? [];
    const q = pocQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.toLowerCase().includes(q));
  })();

  const commitPoc = async (value: string) => {
    if (!selectedChatId) return;
    const trimmed = value.trim();
    setChatAskerName(selectedChatId, trimmed);
    setPocQuery(trimmed);
    setPocOpen(false);
    setPocHighlight(0);

    if (!trimmed || !currentClient) return;
    if (currentClient.pocs?.includes(trimmed)) return;

    setClients((prev) =>
      prev.map((c) =>
        c.id === currentClient.id
          ? { ...c, pocs: [...(c.pocs ?? []), trimmed] }
          : c
      )
    );

    try {
      await fetch('/cortex/api/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentClient.id, add_poc: trimmed }),
      });
    } catch (err) {
      console.error('Failed to add POC', err);
    }
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

      const res = await fetch('/cortex/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          conversationHistory,
          // Guidance: no client / no asker (internal-only). Client Question
          // and PAS both carry the client + POC.
          clientId: currentMode === 'guidance' ? null : currentChat?.clientId ?? null,
          images: apiImages,
          askerName:
            currentMode === 'guidance' ? null : currentChat?.askerName?.trim() || null,
          mode: currentMode,
        }),
      });
      const data = await res.json();
      const assistantMessage = data.answer || data.error || 'No response';
      const proposals: ActionProposal[] = Array.isArray(data.actionProposals)
        ? (data.actionProposals as ActionProposal[])
        : [];

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                messages: [...chat.messages, { role: 'assistant', content: assistantMessage, actionProposals: proposals.length ? proposals : undefined }],
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
    <main className="flex flex-1 min-h-0 bg-custom-black">
      {/* Sidebar */}
      <div
        className="bg-custom-black flex flex-col flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        <div className="p-4 border-b border-custom-darkGrey">
          <button
            onClick={createNewChat}
            className="w-full px-3 py-2 rounded-md bg-custom-cyan text-custom-black hover:opacity-90 font-semibold text-xs"
          >
            + New {CATEGORY_LABELS[sidebarCategory]} chat
          </button>
        </div>

        {/* Category tabs - filter chat history by category. */}
        <div className="px-2 pt-2 pb-1">
          <div className="flex rounded-md border border-custom-darkGrey bg-custom-card p-[2px]">
            {(['client_question', 'guidance', 'pas', 'ari'] as ChatMode[]).map((cat) => {
              const count = chats.filter(
                (c) => (c.mode ?? 'client_question') === cat
              ).length;
              const active = sidebarCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => pickSidebarCategory(cat)}
                  aria-pressed={active}
                  className={`min-w-0 flex-1 truncate rounded px-1 py-[3px] text-center text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-custom-cyan text-custom-black'
                      : 'text-custom-muted hover:text-custom-white'
                  }`}
                  title={CATEGORY_LABELS[cat]}
                >
                  {CATEGORY_LABELS[cat]}
                  {count > 0 && (
                    <span className={active ? 'opacity-70 ml-1' : 'opacity-60 ml-1'}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {visibleChats.length === 0 ? (
            <div className="p-4 text-custom-muted text-xs text-center">
              No {CATEGORY_LABELS[sidebarCategory]} chats yet
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {visibleChats.map((chat) =>
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
                  <div
                    key={chat.id}
                    className={`group flex items-center rounded-md ${
                      selectedChatId === chat.id
                        ? 'bg-custom-cyan text-custom-black font-semibold'
                        : 'text-custom-white hover:bg-custom-card'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      onDoubleClick={() => startEditingChat(chat.id, chat.title)}
                      title="Double-click to rename"
                      className="flex-1 text-left px-3 py-2 text-xs truncate min-w-0"
                    >
                      {chat.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditingChat(chat.id, chat.title)}
                      title="Rename chat"
                      aria-label="Rename chat"
                      className={`opacity-0 group-hover:opacity-100 mr-1 px-1.5 leading-none rounded text-xs ${
                        selectedChatId === chat.id
                          ? 'text-custom-black hover:bg-black/15'
                          : 'text-custom-muted hover:text-custom-white hover:bg-custom-darkGrey'
                      }`}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${chat.title}"?`)) deleteChat(chat.id);
                      }}
                      title="Delete chat"
                      aria-label="Delete chat"
                      className={`opacity-0 group-hover:opacity-100 mr-1 px-1.5 leading-none rounded text-base ${
                        selectedChatId === chat.id
                          ? 'text-custom-black hover:bg-black/15'
                          : 'text-custom-muted hover:text-custom-white hover:bg-custom-darkGrey'
                      }`}
                    >
                      ×
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        onDoubleClick={() => {
          setSidebarWidth(256);
          try {
            localStorage.setItem('ai-jacque:sidebar-width', '256');
          } catch {
            // ignore
          }
        }}
        title="Drag to resize sidebar (double-click to reset)"
        className="w-1 cursor-col-resize bg-custom-darkGrey hover:bg-custom-cyan/60 transition-colors flex-shrink-0"
      />

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
            {/* Mode toggle: Client Question vs Guidance vs PAS vs ARI */}
            <div className="border-b border-custom-darkGrey px-3 py-2 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-md border border-custom-darkGrey bg-custom-card p-[2px]">
                <button
                  type="button"
                  onClick={() => setChatMode(selectedChatId, 'client_question')}
                  aria-pressed={currentMode === 'client_question'}
                  className={`px-3 py-1 text-[11px] font-semibold rounded transition-colors ${
                    currentMode === 'client_question'
                      ? 'bg-custom-cyan text-custom-black'
                      : 'text-custom-muted hover:text-custom-white'
                  }`}
                >
                  Client Question
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode(selectedChatId, 'guidance')}
                  aria-pressed={currentMode === 'guidance'}
                  className={`px-3 py-1 text-[11px] font-semibold rounded transition-colors ${
                    currentMode === 'guidance'
                      ? 'bg-custom-cyan text-custom-black'
                      : 'text-custom-muted hover:text-custom-white'
                  }`}
                >
                  Guidance
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode(selectedChatId, 'pas')}
                  aria-pressed={currentMode === 'pas'}
                  className={`px-3 py-1 text-[11px] font-semibold rounded transition-colors ${
                    currentMode === 'pas'
                      ? 'bg-custom-cyan text-custom-black'
                      : 'text-custom-muted hover:text-custom-white'
                  }`}
                >
                  PAS
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode(selectedChatId, 'ari')}
                  aria-pressed={currentMode === 'ari'}
                  className={`px-3 py-1 text-[11px] font-semibold rounded transition-colors ${
                    currentMode === 'ari'
                      ? 'bg-custom-cyan text-custom-black'
                      : 'text-custom-muted hover:text-custom-white'
                  }`}
                >
                  ARI
                </button>
              </div>
              <span className="text-custom-muted text-[10px]">
                {currentMode === 'client_question'
                  ? 'Paste a question forwarded from a client. The response is written FOR the client.'
                  : currentMode === 'guidance'
                  ? 'Internal mode. Ask anything - the response is written TO you.'
                  : currentMode === 'pas'
                  ? 'State the issue internally. Output is a 3-sentence client-ready message in Problem-Agitate-Solution format.'
                  : 'State the recommendation internally. Output is a 3-sentence client-ready message in Action-Reason-Intention format.'}
              </span>
            </div>

            {/* Chat header: client picker + asker name (Client Question, PAS, ARI modes) */}
            {(currentMode === 'client_question' || currentMode === 'pas' || currentMode === 'ari') && (
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
                      if (c) {
                        pickClient(c.id, c.name);
                      } else if (clientQuery.trim()) {
                        createAndPickClient(clientQuery.trim());
                      }
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
                      clientQuery.trim() ? (
                        <button
                          type="button"
                          onClick={() => createAndPickClient(clientQuery.trim())}
                          className="w-full text-left px-3 py-2 text-xs text-custom-cyan font-semibold hover:bg-custom-hover"
                        >
                          + Add &quot;{clientQuery.trim()}&quot; as new client
                        </button>
                      ) : (
                        <div className="px-3 py-2 text-xs text-custom-muted">
                          No clients match
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
              <label className="text-custom-muted text-[10px] font-semibold uppercase tracking-wider ml-2">POC</label>
              <div ref={pocBoxRef} className="relative w-[180px]">
                <input
                  type="text"
                  value={pocQuery}
                  onChange={(e) => {
                    setPocQuery(e.target.value);
                    setPocOpen(true);
                    setPocHighlight(0);
                  }}
                  onFocus={(e) => {
                    if (currentClient) {
                      setPocOpen(true);
                      setPocHighlight(0);
                      e.currentTarget.select();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const sug = pocSuggestions[pocHighlight];
                      if (sug && pocOpen) {
                        commitPoc(sug);
                      } else {
                        commitPoc(pocQuery);
                      }
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      setPocOpen(false);
                      setPocQuery(currentChat?.askerName ?? '');
                      e.currentTarget.blur();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setPocOpen(true);
                      setPocHighlight((h) => Math.min(h + 1, pocSuggestions.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setPocHighlight((h) => Math.max(h - 1, 0));
                    }
                  }}
                  placeholder={!currentClient ? 'Pick a client first' : 'Type or pick POC'}
                  disabled={!currentClient}
                  className="w-full bg-custom-card border border-custom-darkGrey text-custom-white px-3 py-2 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-custom-cyan disabled:opacity-50"
                />
                {pocOpen && currentClient && (
                  <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-custom-card border border-custom-darkGrey rounded-md shadow-lg">
                    {pocSuggestions.map((p, i) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => commitPoc(p)}
                        onMouseEnter={() => setPocHighlight(i)}
                        className={`w-full text-left px-3 py-2 text-xs ${
                          i === pocHighlight ? 'bg-custom-hover' : ''
                        } ${
                          currentChat?.askerName === p
                            ? 'text-custom-cyan font-semibold'
                            : 'text-custom-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {pocSuggestions.length === 0 && pocQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => commitPoc(pocQuery)}
                        className="w-full text-left px-3 py-2 text-xs text-custom-cyan font-semibold hover:bg-custom-hover"
                      >
                        + Add &quot;{pocQuery.trim()}&quot; to {currentClient.name}
                      </button>
                    )}
                    {pocSuggestions.length === 0 && !pocQuery.trim() && (
                      <div className="px-3 py-2 text-xs text-custom-muted">
                        {(currentClient.pocs?.length ?? 0) > 0 ? 'No matches' : 'Type a POC name and press Enter'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {currentClient && (
                <span className="text-custom-muted text-xs truncate">
                  {currentClient.website_url}
                </span>
              )}
            </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-custom-white text-base">
                    {currentMode === 'guidance'
                      ? 'Ask Jacque anything. Internal mode.'
                      : currentMode === 'pas'
                      ? currentClient
                        ? `State the issue. We will write a 3-sentence PAS message to ${currentClient.name}.`
                        : 'Pick a client above, then state the issue. Output is a 3-sentence PAS message for the client.'
                      : currentClient
                      ? `Paste the question ${currentClient.name} asked...`
                      : 'Pick a client above, then paste the question they asked.'}
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
                              <button
                                key={i}
                                type="button"
                                onClick={() => setPreviewImage(img)}
                                title="Click to preview"
                                className="block rounded-md overflow-hidden border border-custom-darkGrey hover:border-custom-cyan cursor-zoom-in"
                              >
                                <img
                                  src={img.dataUrl}
                                  alt={`screenshot ${i + 1}`}
                                  className="max-w-xs max-h-64 object-contain"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.content && (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                        {msg.role === 'assistant' && msg.actionProposals && msg.actionProposals.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.actionProposals.map((proposal) => {
                              const ui = proposalUiStatus[proposal.id];
                              const status = ui?.status || proposal.status || 'pending';
                              const isCalendar = proposal.kind === 'calendar_reschedule';
                              const p = isCalendar ? (proposal.payload as CalendarReschedulePayload) : null;
                              return (
                                <div
                                  key={proposal.id}
                                  className={`rounded-md border p-3 text-xs ${
                                    status === 'executed'
                                      ? 'border-green-700 bg-green-950/40'
                                      : status === 'declined'
                                      ? 'border-custom-darkGrey bg-custom-card opacity-60'
                                      : status === 'error'
                                      ? 'border-red-700 bg-red-950/40'
                                      : 'border-yellow-700 bg-yellow-950/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-custom-muted">
                                      {isCalendar ? 'Calendar change' : proposal.kind}
                                    </span>
                                    {status === 'executed' && (
                                      <span className="text-green-400 text-[10px] font-semibold">✓ Applied</span>
                                    )}
                                    {status === 'declined' && (
                                      <span className="text-custom-muted text-[10px] font-semibold">Dismissed</span>
                                    )}
                                    {status === 'executing' && (
                                      <span className="text-custom-cyan text-[10px] font-semibold">Applying...</span>
                                    )}
                                    {status === 'error' && (
                                      <span className="text-red-400 text-[10px] font-semibold">Failed</span>
                                    )}
                                  </div>
                                  {p && (
                                    <div className="space-y-1 text-custom-white">
                                      <div className="font-semibold">{p.event_summary || '(untitled event)'}</div>
                                      {p.attendees && p.attendees.length > 0 && (
                                        <div className="text-custom-muted">With: {p.attendees.join(', ')}</div>
                                      )}
                                      <div>
                                        <span className="text-custom-muted">From:</span>{' '}
                                        {formatTimeForCard(p.current_start)}
                                      </div>
                                      <div>
                                        <span className="text-custom-muted">To:</span>{' '}
                                        <span className="font-semibold">{formatTimeForCard(p.new_start)}</span>
                                      </div>
                                      {p.reason && (
                                        <div className="text-custom-muted italic">Reason: {p.reason}</div>
                                      )}
                                    </div>
                                  )}
                                  {!p && (
                                    <div className="text-custom-white">{proposal.summary}</div>
                                  )}
                                  {ui?.error && (
                                    <div className="mt-2 text-red-400 text-[11px]">{ui.error}</div>
                                  )}
                                  {(status === 'pending' || !ui) && status !== 'executed' && status !== 'declined' && status !== 'executing' && status !== 'error' && (
                                    <div className="mt-3 flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => approveProposal(proposal.id)}
                                        className="px-3 py-1 rounded-md bg-custom-cyan text-custom-black font-semibold text-xs hover:opacity-90"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => declineProposal(proposal.id)}
                                        className="px-3 py-1 rounded-md border border-custom-darkGrey text-custom-white text-xs hover:bg-custom-card"
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
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
                      <button
                        type="button"
                        onClick={() => setPreviewImage(img)}
                        title="Click to preview"
                        className="block cursor-zoom-in"
                      >
                        <img
                          src={img.dataUrl}
                          alt={`pending ${i + 1}`}
                          className="h-16 w-16 object-cover rounded-md border border-custom-darkGrey hover:border-custom-cyan"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePendingImage(i);
                        }}
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
                    currentMode === 'guidance'
                      ? 'Ask Jacque anything... (Cmd+V to paste a screenshot)'
                      : currentMode === 'pas'
                      ? 'State the issue internally - we will draft the client-facing message in PAS format...'
                      : currentClient
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

      {previewImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage.dataUrl}
            alt="Screenshot preview"
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
