'use client';

import { useEffect, useState } from 'react';

interface Client {
  id: number;
  name: string;
  website_url: string;
  summary: string;
}

export default function SummariesAdmin() {
  const [clients, setClients] = useState<Client[]>([]);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const res = await fetch('/cortex/api/clients');
    const data = await res.json();
    setClients(data);
  };

  const generateSummaries = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/cortex/api/generate-summaries', { method: 'POST' });
      const result = await res.json();
      alert(result.message);
      fetchClients();
    } catch (error) {
      alert('Error generating summaries');
    }
    setGenerating(false);
  };

  const startEdit = (client: Client) => {
    setEditingId(client.id);
    setEditValue(client.summary || '');
  };

  const saveSummary = async (clientId: number) => {
    setSaving(true);
    try {
      const res = await fetch('/cortex/api/update-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, summary: editValue }),
      });
      const result = await res.json();
      if (result.success) {
        fetchClients();
        setEditingId(null);
      }
    } catch (error) {
      alert('Error saving summary');
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Client Summaries</h1>
        <p className="text-gray-600 mb-8">Manage AI-generated summaries for each client</p>

        <button
          onClick={generateSummaries}
          disabled={generating}
          className="mb-8 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
        >
          {generating ? 'Generating...' : 'Generate All Summaries'}
        </button>

        <div className="grid gap-6">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{client.name}</h2>
              <p className="text-sm text-gray-500 mb-4">{client.website_url}</p>

              {editingId === client.id ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg mb-3 font-mono text-sm"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveSummary(client.id)}
                      disabled={saving}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    {client.summary || <em className="text-gray-400">No summary yet</em>}
                  </p>
                  <button
                    onClick={() => startEdit(client)}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
