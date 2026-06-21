import { useState } from 'react'

const STORAGE_KEY = 'trashPackageIds'

function App() {
  const [inputIds, setInputIds] = useState('')
  const [status, setStatus] = useState('')

  const handleSave = () => {
    const ids = inputIds
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0)

    chrome.storage.local.set({ [STORAGE_KEY]: ids }, () => {
      setStatus(`Saved ${ids.length} package ID(s).`)
    })
  }

  const handleLoad = () => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const ids: string[] = result[STORAGE_KEY] ?? []
      setInputIds(ids.join('\n'))
      setStatus(`Loaded ${ids.length} package ID(s).`)
    })
  }

  const handleClear = () => {
    chrome.storage.local.remove(STORAGE_KEY, () => {
      setInputIds('')
      setStatus('Cleared saved package IDs.')
    })
  }

  const handleStart = () => {
    const ids = inputIds
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0)

    if (ids.length === 0) {
      setStatus('Please enter at least one package ID.')
      return
    }

    chrome.storage.local.set({ [STORAGE_KEY]: ids }, () => {
      chrome.tabs.query({ url: '*://store.steampowered.com/account/licenses/' }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id != null) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'START_CLEANUP', ids })
          setStatus(`Started cleanup for ${ids.length} ID(s). Check the Steam licenses page.`)
          window.close()
        } else {
          chrome.tabs.create({ url: 'https://store.steampowered.com/account/licenses/' })
          setStatus('Opened Steam licenses page. Re-open the extension to start.')
        }
      })
    })
  }

  return (
    <div style={{ width: 360, padding: 16, fontFamily: 'Arial, sans-serif', background: '#171a21', color: '#c6d4df', minHeight: 300 }}>
      <h2 style={{ margin: '0 0 12px 0', color: '#66c0f4', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 }}>
        🧹 Steam Weed Wacker
      </h2>

      <p style={{ fontSize: 12, color: '#8f98a0', margin: '0 0 10px 0' }}>
        Paste your trash package IDs below (one per line or comma-separated).
        You can get these from{' '}
        <a
          href="https://steamdb.info/freepackages/"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#66c0f4' }}
        >
          SteamDB Free Packages
        </a>
        .
      </p>

      <textarea
        value={inputIds}
        onChange={(e) => setInputIds(e.target.value)}
        placeholder="12345&#10;67890&#10;..."
        rows={8}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: '#1b2838',
          border: '1px solid #2a475e',
          color: '#c6d4df',
          borderRadius: 4,
          padding: 8,
          fontSize: 13,
          resize: 'vertical',
          fontFamily: 'monospace',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={handleStart} style={btnStyle('#1a9bdc')}>
          ▶ Start Cleanup
        </button>
        <button onClick={handleSave} style={btnStyle('#2a475e')}>
          💾 Save IDs
        </button>
        <button onClick={handleLoad} style={btnStyle('#2a475e')}>
          📂 Load IDs
        </button>
        <button onClick={handleClear} style={btnStyle('#6b3535')}>
          🗑 Clear
        </button>
      </div>

      {status && (
        <p style={{ fontSize: 12, color: '#a4d007', marginTop: 10, borderTop: '1px solid #2a475e', paddingTop: 8 }}>
          {status}
        </p>
      )}
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 80,
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 'bold',
  }
}

export default App
