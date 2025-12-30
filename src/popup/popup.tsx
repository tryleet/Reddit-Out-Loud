// src/popup/popup.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

interface Comment {
  id: string;
  author: string | null;
  depth: number;
  text: string;
  permalink: string;
}

interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalComments: number;
  totalItems: number;
  speed: number;
  useUniqueVoices?: boolean;
  voiceCount?: number;
  currentType?: 'title' | 'body' | 'comment' | null;
  hasTitle?: boolean;
  hasBody?: boolean;
  title?: string;
  maxDepth?: number;
  maxTopLevelComments?: number;
  maxTotalComments?: number;
  expansionStrategy?: 'breadth' | 'depth' | 'balanced';
  voiceLocale?: string;
  isExtracting?: boolean;
  extractionProgress?: number;
  comments: Comment[];
}

interface VoiceOption {
  name: string;
  lang: string;
}

interface Settings {
  maxDepth: number;
  maxTopLevelComments: number;
  maxTotalComments: number;
  expansionStrategy: 'breadth' | 'depth' | 'balanced';
  voiceLocale: string;
  selectedVoices: string[];
  hasCompletedSetup: boolean;
}

const DEFAULT_VOICES = [
  'Google UK English Female',
  'Google UK English Male',
  'Google US English'
];

const DEFAULT_SETTINGS: Settings = {
  maxDepth: 3,
  maxTopLevelComments: 50,
  maxTotalComments: 300,
  expansionStrategy: 'balanced',
  voiceLocale: 'en-US',
  selectedVoices: DEFAULT_VOICES,
  hasCompletedSetup: false
};

const EXPANSION_STRATEGIES = [
  {
    value: 'breadth',
    label: '📊 Breadth First',
    description: 'More top-level comments, less depth (good for overview)'
  },
  {
    value: 'depth',
    label: '🔍 Depth First',
    description: 'Fewer top-level, complete deep threads (good for discussions)'
  },
  {
    value: 'balanced',
    label: '⚖️ Balanced',
    description: 'Mix of breadth and depth (recommended)'
  },
];

const VOICE_PREVIEW_TEXT = "Hello! This is how I sound when reading Reddit comments.";

function App() {
  const [status, setStatus] = React.useState('Loading...');
  const [state, setState] = React.useState<PlaybackState | null>(null);
  const [tabId, setTabId] = React.useState<number | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [showSetup, setShowSetup] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [contentExpanded, setContentExpanded] = React.useState(true);
  const [availableVoices, setAvailableVoices] = React.useState<VoiceOption[]>([]);
  const [englishVoices, setEnglishVoices] = React.useState<VoiceOption[]>([]);
  const [playingVoice, setPlayingVoice] = React.useState<string | null>(null);

  // Load ALL English voices (not filtered by locale)
  React.useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const voiceOptions = voices.map(v => ({ name: v.name, lang: v.lang }));
      setAvailableVoices(voiceOptions);

      // Get ALL English voices from all regions
      const allEnglish = voiceOptions.filter(v =>
        v.lang.startsWith('en-') || v.lang === 'en'
      );
      setEnglishVoices(allEnglish);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Load settings from storage
  React.useEffect(() => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      const loadedSettings = items as Settings;

      // Ensure default voices are set if empty
      if (!loadedSettings.selectedVoices || loadedSettings.selectedVoices.length === 0) {
        loadedSettings.selectedVoices = DEFAULT_VOICES;
      }

      setSettings(loadedSettings);

      if (!loadedSettings.hasCompletedSetup) {
        setShowSetup(true);
        setIsLoading(false);
      }
    });
  }, []);

  // Save settings to storage
  const saveSettings = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    chrome.storage.sync.set(updated);
  };

  // Preview voice
  const previewVoice = (voiceName: string) => {
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === voiceName);

    if (voice) {
      setPlayingVoice(voiceName);
      const utterance = new SpeechSynthesisUtterance(VOICE_PREVIEW_TEXT);
      utterance.voice = voice;
      utterance.rate = 1.0;

      utterance.onend = () => {
        setPlayingVoice(null);
      };

      utterance.onerror = () => {
        setPlayingVoice(null);
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle voice selection
  const toggleVoice = (voiceName: string) => {
    const currentSelected = settings.selectedVoices || [];

    if (currentSelected.includes(voiceName)) {
      // Remove voice (but keep at least one)
      if (currentSelected.length > 1) {
        const updated = currentSelected.filter(v => v !== voiceName);
        setSettings({ ...settings, selectedVoices: updated });
      }
    } else {
      // Add voice
      const updated = [...currentSelected, voiceName];
      setSettings({ ...settings, selectedVoices: updated });
    }
  };

  // Select all voices
  const selectAllVoices = () => {
    const allEnglishNames = englishVoices.map(v => v.name);
    setSettings({ ...settings, selectedVoices: allEnglishNames });
  };

  // Select default voices
  const selectDefaultVoices = () => {
    setSettings({ ...settings, selectedVoices: DEFAULT_VOICES });
  };

  const sendMessage = async (action: string, data: any = {}) => {
    if (!tabId) return;

    try {
      const response = await chrome.tabs.sendMessage(tabId, { action, ...data });
      return response;
    } catch (error) {
      console.error('Error sending message:', error);
      setStatus('Error: Please refresh the Reddit page');
      return null;
    }
  };

  const stopExtraction = async () => {
    await sendMessage('stopExtraction');
    // Re-extract what we have so far
    const postContent = await sendMessage('getState');
    if (postContent) {
      setState(postContent);
      setStatus(`Ready - ${postContent.totalComments} comments`);
      setIsLoading(false);
    }
  };

  const extractComments = async () => {
    if (!tabId) return;

    setIsLoading(true);
    setShowSetup(false);
    // Don't close settings - keep it accessible
    setStatus(`Extracting comments...`);

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'extractComments',
        maxDepth: settings.maxDepth,
        maxTopLevelComments: settings.maxTopLevelComments,
        maxTotalComments: settings.maxTotalComments,
        expansionStrategy: settings.expansionStrategy,
        voiceLocale: settings.voiceLocale,
        selectedVoices: settings.selectedVoices
      });

      if (response?.success && response.count > 0) {
        setStatus(`Ready - ${response.count} comments`);
        const newState = await chrome.tabs.sendMessage(tabId, { action: 'getState' });
        setState(newState);
      } else if (response?.count === 0) {
        setStatus('No comments found on this post');
      } else {
        setStatus('Failed to extract comments');
      }
    } catch (error) {
      console.error('Extraction error:', error);
      setStatus('Error: Please refresh the Reddit page');
    } finally {
      setIsLoading(false);
    }
  };

  const completeSetup = () => {
    saveSettings({ hasCompletedSetup: true });
    extractComments();
  };

  const saveAndRefresh = async () => {
    window.speechSynthesis.cancel();
    await chrome.storage.sync.set(settings);

    if (tabId) {
      chrome.tabs.reload(tabId);
    }

    setShowSettings(false);
  };

  // Check initial state on mount
  React.useEffect(() => {
    if (showSetup) return;

    const init = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.id) {
          setStatus('Error: No active tab');
          setIsLoading(false);
          return;
        }

        if (!tab.url?.includes('reddit.com/r/') || !tab.url?.includes('/comments/')) {
          setStatus('Please open a Reddit post to use this extension');
          setIsLoading(false);
          return;
        }

        setTabId(tab.id);

        try {
          const existingState = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });

          if (existingState && existingState.totalComments > 0) {
            setState(existingState);
            setStatus(`Ready - ${existingState.totalComments} comments`);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          // No existing state
        }

        if (settings.hasCompletedSetup) {
          await extractComments();
        } else {
          setIsLoading(false);
        }

      } catch (error) {
        console.error('Initialization error:', error);
        setStatus('Error: Please refresh the Reddit page');
        setIsLoading(false);
      }
    };

    init();
  }, [showSetup, settings.hasCompletedSetup]);

  // Poll for state updates (including extraction progress)
  React.useEffect(() => {
    if (!tabId) return;

    const interval = setInterval(async () => {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'getState' });
        setState(response);

        // Update status if extracting
        if (response.isExtracting) {
          setStatus(`Extracting... ${response.extractionProgress || 0} comments loaded`);
        }
      } catch (error) {
        // Tab might be closed
      }
    }, 500); // Poll every 500ms during extraction

    return () => clearInterval(interval);
  }, [tabId]);

  const play = () => sendMessage('play');
  const pause = () => sendMessage('pause');
  const stop = () => sendMessage('stop');
  const next = () => sendMessage('next');
  const previous = () => sendMessage('previous');
  const setSpeed = (speed: number) => sendMessage('setSpeed', { speed });

  const comments = state?.comments || [];
  const currentIndex = state?.currentIndex || 0;
  const speed = state?.speed || 1.0;
  const isPlaying = state?.isPlaying || false;
  const isExtracting = state?.isExtracting || false;

  // Get selected voice count
  const selectedVoiceCount = settings.selectedVoices.length;

  // Setup screen
  if (showSetup) {
    return (
      <div style={{ width: '500px', padding: '16px', maxHeight: '650px', overflowY: 'auto' }}>
        <h1 style={{ fontSize: '20px', margin: '0 0 16px 0', color: '#0079d3' }}>
          🎙️ Reddit Out Loud - Setup
        </h1>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            📏 Comment Depth
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={settings.maxDepth}
            onChange={(e) => setSettings({ ...settings, maxDepth: parseInt(e.target.value) })}
            style={{ width: '100%', marginBottom: '8px' }}
          />
          <div style={{ fontSize: '13px', color: '#333', textAlign: 'center', fontWeight: 'bold' }}>
            Depth: {settings.maxDepth}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', textAlign: 'center' }}>
            {settings.maxDepth === 1 ? '(Top-level only)' : `(Top-level + ${settings.maxDepth - 1} reply levels)`}
          </div>
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            📊 Maximum Top-Level Comments
          </label>
          <input
            type="number"
            min="10"
            max="500"
            step="10"
            value={settings.maxTopLevelComments}
            onChange={(e) => setSettings({ ...settings, maxTopLevelComments: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            🎯 Maximum Total Comments
          </label>
          <input
            type="number"
            min="50"
            max="1000"
            step="50"
            value={settings.maxTotalComments}
            onChange={(e) => setSettings({ ...settings, maxTotalComments: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            🧭 Expansion Strategy
          </label>
          {EXPANSION_STRATEGIES.map(strategy => (
            <label
              key={strategy.value}
              style={{
                display: 'block',
                padding: '10px',
                marginBottom: '8px',
                background: settings.expansionStrategy === strategy.value ? '#e3f2fd' : 'white',
                border: `2px solid ${settings.expansionStrategy === strategy.value ? '#0079d3' : '#ddd'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="strategy"
                value={strategy.value}
                checked={settings.expansionStrategy === strategy.value}
                onChange={(e) => setSettings({ ...settings, expansionStrategy: e.target.value as any })}
                style={{ marginRight: '8px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{strategy.label}</span>
              <div style={{ fontSize: '11px', color: '#666', marginLeft: '24px', marginTop: '2px' }}>
                {strategy.description}
              </div>
            </label>
          ))}
        </div>

        {/* Voice Selection */}
        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>
              🎤 Select Voices ({selectedVoiceCount} selected)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={selectDefaultVoices}
                style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', background: '#0079d3', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                Default
              </button>
              <button
                onClick={selectAllVoices}
                style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                All
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', background: 'white' }}>
            {englishVoices.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '16px' }}>
                Loading voices...
              </div>
            ) : (
              englishVoices.map(voice => {
                const isSelected = settings.selectedVoices.includes(voice.name);

                return (
                  <div
                    key={voice.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px',
                      marginBottom: '6px',
                      background: isSelected ? '#e3f2fd' : '#f9f9f9',
                      border: `1px solid ${isSelected ? '#0079d3' : '#ddd'}`,
                      borderRadius: '4px'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleVoice(voice.name)}
                        style={{ marginRight: '8px' }}
                      />
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal' }}>
                          {voice.name}
                        </span>
                        <div style={{ fontSize: '10px', color: '#999' }}>
                          {voice.lang}
                        </div>
                      </div>
                    </label>
                    <button
                      onClick={() => previewVoice(voice.name)}
                      disabled={playingVoice === voice.name}
                      style={{
                        fontSize: '18px',
                        padding: '4px 8px',
                        cursor: playingVoice === voice.name ? 'not-allowed' : 'pointer',
                        background: 'none',
                        border: 'none',
                        opacity: playingVoice === voice.name ? 0.5 : 1
                      }}
                      title="Preview voice"
                    >
                      {playingVoice === voice.name ? '⏸️' : '▶️'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            Mix voices from any English region! Click ▶️ to preview.
          </div>
        </div>

        <button
          onClick={completeSetup}
          style={{
            width: '100%',
            padding: '14px',
            background: '#0079d3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 'bold'
          }}
        >
          Start Listening
        </button>

        <div style={{ fontSize: '11px', color: '#999', marginTop: '12px', textAlign: 'center' }}>
          You can change these settings later
        </div>
      </div>
    );
  }

  // Settings screen
  if (showSettings) {
    return (
      <div style={{ width: '500px', padding: '16px', maxHeight: '650px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <button
            onClick={() => {
              window.speechSynthesis.cancel();
              setShowSettings(false);
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', marginRight: '8px' }}
          >
            ←
          </button>
          <h1 style={{ fontSize: '18px', margin: 0 }}>Settings</h1>
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            📏 Comment Depth
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={settings.maxDepth}
            onChange={(e) => saveSettings({ maxDepth: parseInt(e.target.value) })}
            style={{ width: '100%', marginBottom: '8px' }}
          />
          <div style={{ fontSize: '13px', color: '#333', textAlign: 'center' }}>
            Depth: {settings.maxDepth}
          </div>
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            📊 Maximum Top-Level Comments
          </label>
          <input
            type="number"
            min="10"
            max="500"
            step="10"
            value={settings.maxTopLevelComments}
            onChange={(e) => saveSettings({ maxTopLevelComments: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            🎯 Maximum Total Comments
          </label>
          <input
            type="number"
            min="50"
            max="1000"
            step="50"
            value={settings.maxTotalComments}
            onChange={(e) => saveSettings({ maxTotalComments: parseInt(e.target.value) })}
            style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            🧭 Expansion Strategy
          </label>
          {EXPANSION_STRATEGIES.map(strategy => (
            <label
              key={strategy.value}
              style={{
                display: 'block',
                padding: '10px',
                marginBottom: '8px',
                background: settings.expansionStrategy === strategy.value ? '#e3f2fd' : 'white',
                border: `2px solid ${settings.expansionStrategy === strategy.value ? '#0079d3' : '#ddd'}`,
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              <input
                type="radio"
                name="strategy"
                value={strategy.value}
                checked={settings.expansionStrategy === strategy.value}
                onChange={(e) => saveSettings({ expansionStrategy: e.target.value as any })}
                style={{ marginRight: '8px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{strategy.label}</span>
              <div style={{ fontSize: '11px', color: '#666', marginLeft: '24px', marginTop: '2px' }}>
                {strategy.description}
              </div>
            </label>
          ))}
        </div>

        {/* Voice Selection in Settings */}
        <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>
              🎤 Select Voices ({selectedVoiceCount} selected)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={selectDefaultVoices}
                style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', background: '#0079d3', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                Default
              </button>
              <button
                onClick={selectAllVoices}
                style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', borderRadius: '3px' }}
              >
                All
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', background: 'white' }}>
            {englishVoices.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '16px' }}>
                Loading voices...
              </div>
            ) : (
              englishVoices.map(voice => {
                const isSelected = settings.selectedVoices.includes(voice.name);

                return (
                  <div
                    key={voice.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px',
                      marginBottom: '6px',
                      background: isSelected ? '#e3f2fd' : '#f9f9f9',
                      border: `1px solid ${isSelected ? '#0079d3' : '#ddd'}`,
                      borderRadius: '4px'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleVoice(voice.name)}
                        style={{ marginRight: '8px' }}
                      />
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal' }}>
                          {voice.name}
                        </span>
                        <div style={{ fontSize: '10px', color: '#999' }}>
                          {voice.lang}
                        </div>
                      </div>
                    </label>
                    <button
                      onClick={() => previewVoice(voice.name)}
                      disabled={playingVoice === voice.name}
                      style={{
                        fontSize: '18px',
                        padding: '4px 8px',
                        cursor: playingVoice === voice.name ? 'not-allowed' : 'pointer',
                        background: 'none',
                        border: 'none',
                        opacity: playingVoice === voice.name ? 0.5 : 1
                      }}
                      title="Preview voice"
                    >
                      {playingVoice === voice.name ? '⏸️' : '▶️'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            Mix voices from any English region!
          </div>
        </div>

        <button
          onClick={saveAndRefresh}
          style={{
            width: '100%',
            padding: '12px',
            background: '#0079d3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          💾 Save & Refresh Page
        </button>

        <div style={{ fontSize: '11px', color: '#999', marginTop: '8px', textAlign: 'center' }}>
          Page will reload to apply new settings
        </div>
      </div>
    );
  }

  // Loading/Extracting state
  if (isLoading || isExtracting) {
    return (
      <div style={{ width: '420px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '18px', margin: 0 }}>Reddit Out Loud</h1>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p>{status}</p>
          <div style={{ margin: '20px 0', fontSize: '32px' }}>⏳</div>

          {isExtracting && (
            <button
              onClick={stopExtraction}
              style={{
                padding: '12px 24px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              ⏹️ Stop & Use Current Comments
            </button>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (comments.length === 0) {
    return (
      <div style={{ width: '420px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '18px', margin: 0 }}>Reddit Out Loud</h1>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
        <p style={{ margin: '12px 0', color: '#666' }}>{status}</p>
      </div>
    );
  }

  const titleBodyOffset = (state?.hasTitle ? 1 : 0) + (state?.hasBody ? 1 : 0);
  const currentCommentIndex = state?.currentType === 'comment' ? currentIndex - titleBodyOffset : -1;

  // Main UI
  return (
    <div style={{ width: '420px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h1 style={{ fontSize: '18px', margin: 0 }}>Reddit Out Loud</h1>
        <button
          onClick={() => setShowSettings(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {state?.title && (
        <div style={{
          marginBottom: '12px',
          padding: '10px',
          background: '#e8f4f8',
          borderRadius: '4px',
          borderLeft: '4px solid #0079d3'
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>POST TITLE:</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
            {state.title}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px', padding: '12px', background: '#f6f7f8', borderRadius: '4px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button onClick={play} style={buttonStyle} disabled={isPlaying && !state?.isPaused}>
              ▶️ Play
            </button>
            <button onClick={pause} style={buttonStyle} disabled={!isPlaying}>
              ⏸️ Pause
            </button>
            <button onClick={stop} style={buttonStyle}>
              ⏹️ Stop
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={previous} style={buttonStyle}>
              ⏮️ Previous
            </button>
            <button onClick={next} style={buttonStyle}>
              ⏭️ Next
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '8px', padding: '8px', background: 'white', borderRadius: '4px' }}>
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={state?.useUniqueVoices !== false}
              onChange={(e) => sendMessage('toggleUniqueVoices', { enabled: e.target.checked })}
              style={{ marginRight: '6px' }}
            />
            <span>🎤 Unique voice per comment ({state?.voiceCount || 0} voices)</span>
          </label>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
            Speed: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ fontSize: '13px', padding: '8px', background: 'white', borderRadius: '4px' }}>
          <div style={{ marginBottom: '4px' }}>
            <strong>Progress:</strong> {currentIndex + 1} / {state?.totalItems || 0}
          </div>
          {state?.currentType === 'title' && (
            <div style={{ marginBottom: '4px', color: '#0079d3', fontWeight: 'bold' }}>
              📰 Reading: Post Title
            </div>
          )}
          {state?.currentType === 'body' && (
            <div style={{ marginBottom: '4px', color: '#0079d3', fontWeight: 'bold' }}>
              📄 Reading: Post Body
            </div>
          )}
          {state?.currentType === 'comment' && currentCommentIndex >= 0 && comments[currentCommentIndex] && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Author:</strong> u/{comments[currentCommentIndex].author || 'deleted'}
            </div>
          )}
          <div>
            <strong>Status:</strong>{' '}
            <span style={{ color: isPlaying ? '#0079d3' : '#666' }}>
              {isPlaying ? '🔊 Playing' : state?.isPaused ? '⏸️ Paused' : '⏹️ Stopped'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
            Strategy: {state?.expansionStrategy || 'balanced'}
          </div>
        </div>
      </div>

      {/* Collapsible Content List */}
      <div style={{
        border: '1px solid #ccc',
        borderRadius: '4px',
        background: 'white'
      }}>
        <button
          onClick={() => setContentExpanded(!contentExpanded)}
          style={{
            width: '100%',
            padding: '10px',
            background: '#f6f7f8',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          <span>All Content ({state?.totalItems || 0})</span>
          <span>{contentExpanded ? '▼' : '▶'}</span>
        </button>

        {contentExpanded && (
          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px'
          }}>
            {/* Title */}
            {state?.hasTitle && state?.title && (
              <div style={{
                padding: '8px',
                marginBottom: '6px',
                background: currentIndex === 0 ? '#fff3cd' : '#e8f4f8',
                borderRadius: '4px',
                borderLeft: `3px solid ${currentIndex === 0 ? '#ffc107' : '#0079d3'}`,
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#0079d3' }}>
                  📰 POST TITLE
                </div>
                <div style={{ color: '#555', lineHeight: '1.4' }}>
                  {state.title.length > 120 ? state.title.substring(0, 120) + '...' : state.title}
                </div>
              </div>
            )}

            {/* Body */}
            {state?.hasBody && (
              <div style={{
                padding: '8px',
                marginBottom: '6px',
                background: currentIndex === (state?.hasTitle ? 1 : 0) ? '#fff3cd' : '#f0f0f0',
                borderRadius: '4px',
                borderLeft: `3px solid ${currentIndex === (state?.hasTitle ? 1 : 0) ? '#ffc107' : '#666'}`,
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>
                  📄 POST BODY
                </div>
              </div>
            )}

            {/* Comments */}
            {comments.map((comment, index) => {
              const itemIndex = index + titleBodyOffset;
              return (
                <div
                  key={comment.id}
                  style={{
                    marginLeft: `${comment.depth * 16}px`,
                    padding: '8px',
                    marginBottom: '6px',
                    background: itemIndex === currentIndex ? '#fff3cd' : '#f6f7f8',
                    borderRadius: '4px',
                    borderLeft: `3px solid ${itemIndex === currentIndex ? '#ffc107' : comment.depth === 0 ? '#0079d3' : '#ff4500'}`,
                    fontSize: '12px'
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>
                    #{index + 1} · u/{comment.author || 'deleted'}
                    {comment.depth > 0 && <span style={{ color: '#999', marginLeft: '4px' }}>↳ depth {comment.depth}</span>}
                  </div>
                  <div style={{ color: '#555', lineHeight: '1.4' }}>
                    {comment.text.length > 120 ? comment.text.substring(0, 120) + '...' : comment.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#999', textAlign: 'center' }}>
        Playback continues when popup is closed
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#0079d3',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  flex: 1,
  fontWeight: '500'
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}