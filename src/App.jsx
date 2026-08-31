import React, { useState, useEffect } from 'react';
import { QrCode, RotateCcw, ShieldCheck, ClipboardList, Info, FileText, CheckCircle2, AlertTriangle, Settings, Eye, HelpCircle } from 'lucide-react';
import Scanner from './components/Scanner';
import Generator from './components/Generator';
import CompletionModal from './components/CompletionModal';

export default function App() {
  const [targetLimit, setTargetLimit] = useState(15);
  const [scanLog, setScanLog] = useState([]);
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'generator' | 'help'
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [isTargetReached, setIsTargetReached] = useState(false);
  const [toast, setToast] = useState(null);

  // Web Audio Synth for feedback sounds
  const playBeep = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'error' || type === 'duplicate') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, ctx.currentTime); // low pitch
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'complete') {
        const playNote = (freq, delay, duration) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.setValueAtTime(freq, ctx.currentTime + delay);
          g.gain.setValueAtTime(0.08, ctx.currentTime + delay);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
          o.start(ctx.currentTime + delay);
          o.stop(ctx.currentTime + delay + duration);
        };
        // Chord progression
        playNote(523.25, 0, 0.15); // C5
        playNote(659.25, 0.1, 0.15); // E5
        playNote(783.99, 0.2, 0.25); // G5
        playNote(1046.50, 0.3, 0.45); // C6
      }
    } catch (err) {
      console.warn('Web Audio API is not fully initialized or supported.', err);
    }
  };

  // Trigger Toast Notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Reset current scanning session
  const handleResetSession = () => {
    setScanLog([]);
    setIsTargetReached(false);
    showToast('Session reset successfully. Ready to scan!', 'info');
    playBeep('success');
  };

  // Handle a new successful QR scan
  const handleScanSuccess = (decodedText) => {
    if (isTargetReached) return;

    // Check if duplicate scan
    const isDuplicate = scanLog.some((item) => item.payload === decodedText);

    if (isDuplicate && !allowDuplicates) {
      playBeep('duplicate');
      showToast(`Ignored duplicate scan: "${decodedText}"`, 'warning');
      return;
    }

    // Add to scan registry
    const newLogItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      index: scanLog.length + 1,
      payload: decodedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isDuplicate,
    };

    const updatedLog = [newLogItem, ...scanLog];
    setScanLog(updatedLog);

    // Check if target is now reached
    if (updatedLog.length >= targetLimit) {
      setIsTargetReached(true);
      playBeep('complete');
      showToast('Scan target limit reached!', 'success');
    } else {
      playBeep('success');
      showToast(`Scan #${updatedLog.length} recorded: "${decodedText}"`, 'success');
    }
  };

  const handleScanFailure = (errorMsg) => {
    // Standard fail log
  };

  // Handle download of current audit logs
  const handleExportLog = () => {
    if (scanLog.length === 0) return;
    
    let content = `QRCounter Pro Session Audit Logs\n`;
    content += `Target Limit: ${targetLimit}\n`;
    content += `Export Time: ${new Date().toLocaleString()}\n`;
    content += `==============================================\n\n`;
    content += `Index | Timestamp | Payload | Type\n`;
    
    scanLog.forEach((item) => {
      content += `#${item.index} | ${item.timestamp} | ${item.payload} | ${item.isDuplicate ? 'Duplicate' : 'New'}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qrcounter_audit_log_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Audit log file downloaded!', 'success');
  };

  // Circular progress configuration
  const radius = 55;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const scanCount = scanLog.length;
  const progressRatio = targetLimit > 0 ? Math.min(scanCount / targetLimit, 1) : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <QrCode className="logo-icon" size={32} />
          <div>
            <h1>QRCounter Pro</h1>
            <p className="logo-subtitle">Real-time QR scan counter and generator dashboard</p>
          </div>
        </div>
        <div>
          {/* <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)', padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
            Prototype Mode
          </span> */}
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Sidebar / Configuration */}
        <aside className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card-title-container">
            <Settings className="card-title-icon" size={20} />
            <h2>Counter Config</h2>
          </div>

          <div className="progress-container">
            <svg height={radius * 2} width={radius * 2} className="circular-progress">
              <circle
                className="progress-bg"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
              <circle
                className="progress-bar"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
                strokeDasharray={circumference + ' ' + circumference}
                style={{ strokeDashoffset }}
              />
            </svg>
            <div className="progress-text">
              <span className="progress-count">{scanCount}</span>
              <span className="progress-label">of {targetLimit}</span>
            </div>
          </div>

          <div className="settings-section">
            <div className="input-group">
              <label htmlFor="limit-input">Target Scan Limit</label>
              <input
                id="limit-input"
                type="number"
                min="1"
                max="999"
                value={targetLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setTargetLimit(val);
                  // Dynamic checks in case limit is decreased under current scan log length
                  if (scanLog.length >= val) {
                    setIsTargetReached(true);
                    playBeep('complete');
                  } else {
                    setIsTargetReached(false);
                  }
                }}
                disabled={isTargetReached}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Allow Duplicate Scans</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={allowDuplicates}
                  onChange={(e) => setAllowDuplicates(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <button className="btn btn-danger" onClick={handleResetSession} style={{ width: '100%', marginTop: '0.5rem' }}>
              <RotateCcw size={16} />
              Reset Session
            </button>
          </div>
        </aside>

        {/* Dashboard Tabs & Main Panels */}
        <main className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
              onClick={() => setActiveTab('scanner')}
            >
              <ShieldCheck size={16} />
              Scanner View
            </button>
            <button
              className={`tab-btn ${activeTab === 'generator' ? 'active' : ''}`}
              onClick={() => setActiveTab('generator')}
            >
              <QrCode size={16} />
              QR Generator
            </button>
            
          </div>

          <div style={{ flex: 1 }}>
            {activeTab === 'scanner' && (
              <Scanner
                onScanSuccess={handleScanSuccess}
                onScanFailure={handleScanFailure}
                isDisabled={isTargetReached}
              />
            )}

            {activeTab === 'generator' && (
              <Generator
                onSimulateScan={handleScanSuccess}
                isDisabled={isTargetReached}
              />
            )}

            
          </div>
        </main>
      </div>

      {/* Bottom Log Section */}
      <section className="card log-section">
        <div className="log-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardList style={{ color: 'var(--primary)' }} size={22} />
            <h2>Scan Registry Log</h2>
          </div>
          {/* {scanLog.length > 0 && (
            <button className="btn btn-secondary" onClick={handleExportLog} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <FileText size={14} />
              Export log
            </button>
          )} */}
        </div>

        {scanLog.length === 0 ? (
          <div className="empty-state">
            <QrCode className="empty-state-icon" size={32} />
            <h3>No codes scanned yet</h3>
            <p>Go to Scanner View and point your camera or upload an image to begin.</p>
          </div>
        ) : (
          <div className="log-list">
            {scanLog.map((item) => (
              <div key={item.id} className="log-item">
                <div className="log-item-info">
                  <span className="log-index">#{item.index}</span>
                  <div>
                    <div className="log-payload">{item.payload}</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Decoded Payload</span>
                  </div>
                </div>
                <div className="log-meta">
                  <span>{item.timestamp}</span>
                  {item.isDuplicate ? (
                    <span className="badge badge-dup">Duplicate</span>
                  ) : (
                    <span className="badge badge-new">New</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completion Celebration Overlay */}
      {isTargetReached && (
        <CompletionModal
          scanLimit={targetLimit}
          totalScans={scanLog.length}
          uniqueCount={scanLog.filter(item => !item.isDuplicate).length}
          onReset={handleResetSession}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className="toast"
          style={{
            borderLeftColor:
              toast.type === 'success'
                ? 'var(--primary)'
                : toast.type === 'warning'
                ? 'var(--warning)'
                : 'var(--secondary)',
          }}
        >
          {toast.type === 'success' && <CheckCircle2 size={18} style={{ color: 'var(--primary)' }} />}
          {toast.type === 'warning' && <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />}
          {toast.type === 'info' && <Info size={18} style={{ color: 'var(--secondary)' }} />}
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
