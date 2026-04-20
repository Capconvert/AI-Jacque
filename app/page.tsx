'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentChat = chats.find((c) => c.id === selectedChatId);
  const messages = currentChat?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New chat',
      messages: [],
      timestamp: Date.now(),
    };
    setChats((prev) => [newChat, ...prev]);
    setSelectedChatId(newChat.id);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedChatId) return;

    const userMessage = input.trim();
    setInput('');

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === selectedChatId
          ? { ...chat, messages: [...chat.messages, { role: 'user', content: userMessage }] }
          : chat
      )
    );

    setLoading(true);

    try {
      const res = await fetch('./api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage }),
      });
      const data = await res.json();
      const assistantMessage = data.answer || data.error || 'No response';

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChatId
            ? {
                ...chat,
                messages: [...chat.messages, { role: 'assistant', content: assistantMessage }],
                title: userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : ''),
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
    <main className="min-h-screen bg-black flex font-mono">
      {/* Sidebar */}
      <div className="w-64 bg-black border-r border-green-700 flex flex-col">
        <div className="p-4 border-b border-green-700">
          <button
            onClick={createNewChat}
            className="w-full px-3 py-2 bg-green-700 text-black hover:bg-green-600 font-medium text-xs"
          >
            + New chat
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-4 text-green-700 text-xs text-center">
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
                      ? 'bg-green-700 text-black'
                      : 'text-green-400 hover:bg-green-900'
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
      <div className="flex-1 flex flex-col">
        {selectedChatId ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-green-700">
                  <p>Ask me about any of your clients...</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-2xl px-4 py-2 ${
                          msg.role === 'user'
                            ? 'text-yellow-400'
                            : 'text-green-400'
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="text-green-400 text-sm">
                        <p>Thinking...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-green-700 p-4">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about any client... e.g. 'What's our traffic for Acme Corp?'"
                  className="flex-1 bg-black border border-green-700 text-green-400 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-green-700 placeholder-green-700"
                  rows={2}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-black border border-green-700 text-green-400 hover:bg-green-700 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-green-700">
            <p>Select or create a chat to begin</p>
          </div>
        )}
      </div>
    </main>
  );
}
