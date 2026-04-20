'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('./api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage }),
      });
      const data = await res.json();
      const assistantMessage = data.answer || data.error || 'No response';
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: ' + String(error) }]);
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
    <main className="min-h-screen bg-black flex flex-col font-mono">
      <div className="bg-black border-b border-green-700 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-green-400">AI Jacque</h1>
          <p className="text-green-600 text-sm">Search Marketing Assistant</p>
        </div>
      </div>

      <div className="flex-1 flex p-4 max-w-4xl mx-auto w-full">
        <div className="flex-1 flex flex-col">
          <div className="bg-black rounded-none flex flex-col h-full border border-green-700">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                        className={`max-w-xl p-2 ${
                          msg.role === 'user'
                            ? 'text-yellow-400'
                            : 'text-green-400'
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="text-green-400 text-xs">
                        <p>Thinking...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-green-700 p-4">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about any client... e.g. 'What's our traffic for Acme Corp?'"
                  className="flex-1 bg-black border border-green-700 text-green-400 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-green-700 placeholder-green-700"
                  rows={2}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="px-3 py-2 bg-black border border-green-700 text-green-400 hover:bg-green-700 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
