'use client';

import { useState } from 'react';

export default function Admin() {
  const [csvText, setCsvText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpload = async () => {
    if (!csvText.trim()) {
      setMessage('Please paste CSV data');
      return;
    }

    setUploading(true);
    setMessage('Uploading...');

    try {
      const lines = csvText.trim().split('\n');
      const clients = lines
        .map((line) => {
          const [name, website] = line.split(',').map((s) => s.trim());
          return { name, website_url: website };
        })
        .filter((c) => c.name && c.website_url);

      for (const client of clients) {
        const res = await fetch('/cortex/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(client),
        });

        if (!res.ok) {
          console.error(`Failed to add ${client.name}`);
        }
      }

      setMessage(`✓ Added ${clients.length} clients`);
      setCsvText('');
    } catch (error) {
      setMessage('Error: ' + String(error));
    }

    setUploading(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Admin: Bulk Upload Clients</h1>
          <a
            href="/admin/summaries"
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Manage Summaries
          </a>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-4">
            Paste CSV format: <code>Client Name,https://website.com</code>
          </p>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Company A,https://company-a.com&#10;Company B,https://company-b.com"
            className="w-full border border-gray-300 rounded px-3 py-2 h-64 font-mono text-sm mb-4"
          />

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Clients'}
          </button>

          {message && <p className="mt-4 text-center font-semibold">{message}</p>}
        </div>
      </div>
    </main>
  );
}
