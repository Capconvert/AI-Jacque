'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const res = await fetch('/api/clients');
    const data = await res.json();
    setClients(data);
  };

  const handleAsk = async () => {
    if (!selectedClient || !question.trim()) return;

    setLoading(true);
    setAnswer('');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient, question }),
      });
      const data = await res.json();
      setAnswer(data.answer || data.error || 'No response');
    } catch (error) {
      setAnswer('Error: ' + String(error));
    }
    setLoading(false);
  };

  const handleCrawlAll = async () => {
    setIsCrawling(true);
    try {
      const res = await fetch('/api/crawl', { method: 'GET' });
      const data = await res.json();
      alert(`Crawled ${data.total} clients successfully`);
      fetchClients();
    } catch (error) {
      alert('Crawl error: ' + String(error));
    }
    setIsCrawling(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">AI Jacque</h1>
        <p className="text-gray-600 mb-8">Search Marketing Assistant</p>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <button
            onClick={handleCrawlAll}
            disabled={isCrawling}
            className="mb-4 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {isCrawling ? 'Crawling...' : 'Crawl All Clients'}
          </button>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Select Client</label>
              <select
                value={selectedClient || ''}
                onChange={(e) => setSelectedClient(Number(e.target.value))}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">-- Choose a client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.last_crawled ? '✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Your Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about the client..."
                className="w-full border border-gray-300 rounded px-3 py-2 h-24"
              />
            </div>

            <button
              onClick={handleAsk}
              disabled={loading || !selectedClient}
              className="w-full px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {loading ? 'Thinking...' : 'Ask AI Jacque'}
            </button>

            {answer && (
              <div className="bg-gray-100 rounded p-4 mt-4">
                <h3 className="font-semibold mb-2">AI Jacque's Response:</h3>
                <p className="text-gray-800 whitespace-pre-wrap">{answer}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
