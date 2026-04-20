'use client';

const designs = [
  {
    name: 'Terminal Classic',
    description: 'Authentic hacker terminal: pure black, bright green',
    config: {
      bg: 'bg-black',
      text: 'text-green-400',
      accent: 'bg-green-700',
      border: 'border-green-700',
      button: 'bg-green-700 hover:bg-green-600 text-black',
    }
  },
  {
    name: 'Modern Dark',
    description: 'Professional dark UI: navy, soft purple accents',
    config: {
      bg: 'bg-slate-950',
      text: 'text-blue-300',
      accent: 'bg-purple-600',
      border: 'border-purple-500',
      button: 'bg-purple-600 hover:bg-purple-500 text-white',
    }
  },
  {
    name: 'Cyberpunk Neon',
    description: 'Bold sci-fi: black, neon green + cyan accents',
    config: {
      bg: 'bg-black',
      text: 'text-cyan-400',
      accent: 'bg-pink-600',
      border: 'border-cyan-400',
      button: 'bg-pink-600 hover:bg-pink-500 text-black',
    }
  },
  {
    name: 'Minimal Pro',
    description: 'Clean & professional: light background, dark text',
    config: {
      bg: 'bg-gray-50',
      text: 'text-gray-700',
      accent: 'bg-teal-600',
      border: 'border-teal-200',
      button: 'bg-teal-600 hover:bg-teal-700 text-white',
    }
  },
  {
    name: 'Nord Palette',
    description: 'Calm & refined: blue-gray, cool accents',
    config: {
      bg: 'bg-slate-900',
      text: 'text-cyan-300',
      accent: 'bg-emerald-700',
      border: 'border-cyan-400',
      button: 'bg-emerald-700 hover:bg-emerald-600 text-white',
    }
  }
];

function DesignPreview({ design }: { design: typeof designs[0] }) {
  const { config } = design;

  return (
    <div className={`${config.bg} p-6 rounded-lg overflow-hidden border-2 ${config.border}`}>
      <h3 className={`${config.text} text-lg font-bold mb-2`}>{design.name}</h3>
      <p className={`${config.text} text-xs opacity-70 mb-4`}>{design.description}</p>

      <div className={`${config.bg} rounded border ${config.border} p-4 min-h-96 flex flex-col`}>
        {/* Sidebar */}
        <div className={`${config.accent} rounded px-3 py-2 mb-3`}>
          <button className={`w-full px-2 py-1 ${config.button} text-xs rounded font-medium`}>
            + New chat
          </button>
        </div>

        {/* Chat area preview */}
        <div className={`flex-1 flex flex-col justify-center items-center ${config.text}`}>
          <p className="text-sm opacity-70">Ask me about your clients...</p>
        </div>

        {/* Input simulation */}
        <div className={`border-t ${config.border} pt-3 mt-3`}>
          <div className={`${config.accent} rounded h-8 opacity-30`}></div>
        </div>
      </div>
    </div>
  );
}

export default function PreviewsPage() {
  return (
    <main className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-white text-3xl font-bold mb-2">Design Options</h1>
        <p className="text-gray-400 mb-8">Click on any design to see the full preview. Which style resonates with you?</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {designs.map((design) => (
            <DesignPreview key={design.name} design={design} />
          ))}
        </div>

        <div className="mt-12 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-white text-lg font-bold mb-3">Color Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm text-gray-300">
            {designs.map(design => (
              <div key={design.name}>
                <p className="font-bold mb-2">{design.name}</p>
                <div className="space-y-1 text-xs">
                  <p>Text: {design.config.text}</p>
                  <p>Accent: {design.config.accent}</p>
                  <p>Border: {design.config.border}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
