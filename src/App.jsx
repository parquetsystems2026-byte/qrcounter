import React, { useState, useEffect, useRef } from 'react';
import { QrCode, RotateCcw, ShieldCheck, ClipboardList, Info, FileText, CheckCircle2, AlertTriangle, Settings, Eye, HelpCircle, Camera, RefreshCw } from 'lucide-react';
import Scanner from './components/Scanner';
import Generator from './components/Generator';
import CompletionModal from './components/CompletionModal';

export default function App() {
  const [targetLimit, setTargetLimit] = useState(15);
  const [scanLog, setScanLog] = useState([]);
  const [activeTab, setActiveTab] = useState('generator'); // 'scanner' | 'generator' | 'help'
  const [allowDuplicates, setAllowDuplicates] = useState(true);
  const [isTargetReached, setIsTargetReached] = useState(false);
  const [toast, setToast] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null); // { text, type: 'success' | 'warning' }

  // Real-time synchronization states
  const [sessionId, setSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session') || `room-${Math.floor(100000 + Math.random() * 900000)}`;
  });
  const [isPhoneScanSuccess, setIsPhoneScanSuccess] = useState(false);
  const [lastPhoneScanVal, setLastPhoneScanVal] = useState('');
  const [phoneStatus, setPhoneStatus] = useState('sending'); // 'sending' | 'success' | 'duplicate' | 'complete'
  const [mobileStats, setMobileStats] = useState({ count: 0, limit: 15 });
  const [showMobileScanPopup, setShowMobileScanPopup] = useState(false);
  const [mobilePopupStatus, setMobilePopupStatus] = useState('sending');
  const [mobilePopupPayload, setMobilePopupPayload] = useState('');

  // Refs to hold active scan values
  const scanSuccessRef = useRef(null);
  const stateRef = useRef({ targetLimit, scanLog, allowDuplicates, isTargetReached });
  const mobilePopupPayloadRef = useRef('');


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
    setAlertMessage(null); // Clear active alerts
    showToast('Session reset successfully. Ready to scan!', 'info');
    playBeep('success');
    broadcastState([], targetLimit, false, false, 'RESET');
  };

  const parseScanUrl = (urlText) => {
    try {
      if (urlText.startsWith('http') && urlText.includes('session=') && urlText.includes('scan=')) {
        const url = new URL(urlText);
        const session = url.searchParams.get('session');
        const scan = url.searchParams.get('scan');
        return { session, scan };
      }
    } catch (e) {
      // Ignore
    }
    return null;
  };

  // Handle a new successful QR scan
  const handleScanSuccess = (decodedText) => {
    const parsed = parseScanUrl(decodedText);
    if (parsed) {
      const { session, scan } = parsed;
      const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
      
      if (isMobile) {
        setMobilePopupPayload(scan);
        mobilePopupPayloadRef.current = scan;
        setMobilePopupStatus('sending');
        setShowMobileScanPopup(true);
        
        // Transmit via SSE channel
        publishScanToChannel(session, scan);
        return;
      } else {
        window.location.href = decodedText;
        return;
      }
    }

    const { targetLimit, scanLog, allowDuplicates, isTargetReached } = stateRef.current;

    if (isTargetReached) return;

    // Check if duplicate scan
    const isDuplicate = scanLog.some((item) => item.payload === decodedText);

    if (isDuplicate && !allowDuplicates) {
      playBeep('duplicate');
      showToast(`Ignored duplicate scan: "${decodedText}"`, 'warning');
      setAlertMessage({
        text: `Already Scanned: This QR code ("${decodedText}") has already been scanned in this session. Please use a different QR code.`,
        type: 'warning'
      });
      
      // Publish state back to SSE topic: duplicate = true
      broadcastState(scanLog, targetLimit, isTargetReached, true, decodedText);
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

    const isLimitHit = updatedLog.length >= targetLimit;

    if (isLimitHit) {
      setIsTargetReached(true);
      playBeep('complete');
      showToast('Scan target limit reached!', 'success');
      setAlertMessage({
        text: `Goal Completed: All ${updatedLog.length} of ${targetLimit} scans have been completed successfully!`,
        type: 'success'
      });
    } else {
      playBeep('success');
      showToast(`Scan #${updatedLog.length} recorded: "${decodedText}"`, 'success');
      setAlertMessage({
        text: `Scanned Successfully: QR code "${decodedText}" has been recorded.`,
        type: 'success'
      });
    }

    // Publish state back to SSE topic: duplicate = false
    broadcastState(updatedLog, targetLimit, isLimitHit, false, decodedText);
  };

  // Update ref to hold latest state values and scan success handler
  useEffect(() => {
    scanSuccessRef.current = handleScanSuccess;
    stateRef.current = { targetLimit, scanLog, allowDuplicates, isTargetReached };
  });

  // Helper function to broadcast state to all clients in the room
  function broadcastState(updatedLog, limit, isComplete, duplicate, lastPayload) {
    publishState(sessionId, {
      type: 'STATE',
      scanLog: updatedLog,
      targetLimit: limit,
      isComplete,
      duplicate,
      lastPayload
    });
  }

  // Helper to publish states to ntfy.ch
  const publishState = async (sessionRoom, stateObj) => {
    try {
      const response = await fetch(`https://ntfy.ch/qrcounter_${sessionRoom}`, {
        method: 'POST',
        body: JSON.stringify(stateObj)
      });
      if (response.status === 429) {
        showToast('Sync rate-limited. Please close other duplicate browser tabs!', 'warning');
      }
    } catch (err) {
      console.error('Failed to publish state:', err);
    }
  };

  // Publish a scanned payload to ntfy.ch (triggered from the phone scanner client)
  const publishScanToChannel = async (sessionRoom, payload) => {
    try {
      const response = await fetch(`https://ntfy.ch/qrcounter_${sessionRoom}`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'SCAN',
          payload
        })
      });
      if (response.status === 429) {
        showToast('Sync rate-limited. Please close other duplicate browser tabs!', 'warning');
      }
    } catch (err) {
      console.error('Failed to publish scan to channel:', err);
      showToast('Sync server offline', 'warning');
    }
  };

  // Listen for session parameter in URL and initialize EventSource listener
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanPayload = params.get('scan');
    const sessionParam = params.get('session') || sessionId;

    if (scanPayload) {
      // ============================================
      // MOBILE COMPANION CLIENT (Opened via QR link)
      // ============================================
      setIsPhoneScanSuccess(true);
      setLastPhoneScanVal(scanPayload);
      setPhoneStatus('sending');

      // Connect to computer session's SSE topic to receive state feedback
      const topicUrl = `https://ntfy.ch/qrcounter_${sessionParam}/sse`;
      const eventSource = new EventSource(topicUrl);

      eventSource.onmessage = (event) => {
        try {
          if (!event.data) return;
          const data = JSON.parse(event.data);
          if (data.event !== 'message') return;
          
          try {
            const msgObj = JSON.parse(data.message);
            if (msgObj.type === 'STATE') {
              const isPayloadInLog = msgObj.scanLog && msgObj.scanLog.some(item => item.payload === scanPayload);
              if (isPayloadInLog || msgObj.lastPayload === scanPayload) {
                setMobileStats({
                  count: msgObj.scanLog ? msgObj.scanLog.length : 0,
                  limit: msgObj.targetLimit
                });
                
                if (msgObj.isComplete) {
                  setPhoneStatus('complete');
                } else if (msgObj.duplicate) {
                  setPhoneStatus('duplicate');
                } else {
                  setPhoneStatus('success');
                }
              }
            }
          } catch (e) {
            // Not a STATE JSON, ignore
          }
        } catch (err) {
          console.error('Error in mobile SSE message parser:', err);
        }
      };

      // Publish the scan event to the ntfy channel
      const sendScanRequest = async () => {
        await publishScanToChannel(sessionParam, scanPayload);
      };

      // Trigger the request after a short delay to allow SSE connection to establish
      setTimeout(sendScanRequest, 800);

      // Keep the session parameter in mobile URL bar for clean refreshing if needed
      const cleanUrl = window.location.origin + window.location.pathname + `?session=${sessionParam}`;
      window.history.replaceState({}, document.title, cleanUrl);

      return () => {
        eventSource.close();
      };
    } else {
      // ============================================
      // MAIN COMPUTER DASHBOARD CLIENT
      // ============================================
      // Ensure session parameter is pushed to the computer browser's URL address bar
      const cleanUrl = window.location.origin + window.location.pathname + `?session=${sessionId}`;
      window.history.replaceState({}, document.title, cleanUrl);

      // Listen for incoming mobile scans via ntfy.ch SSE stream
      const topicUrl = `https://ntfy.ch/qrcounter_${sessionId}/sse`;
      const eventSource = new EventSource(topicUrl);

      eventSource.onmessage = (event) => {
        try {
          if (!event.data) return;
          const data = JSON.parse(event.data);
          
          // Only process message events, ignore ntfy keepalives/etc
          if (data.event !== 'message') return;
          
          const messageStr = data.message;
          if (!messageStr) return;

          try {
            const msgObj = JSON.parse(messageStr);
            
            // 1. If it's a SCAN request, only the Desktop client processes it
            if (msgObj.type === 'SCAN' && msgObj.payload) {
              const isDesktop = !/Mobi|Android|iPhone/i.test(navigator.userAgent);
              if (isDesktop && scanSuccessRef.current) {
                scanSuccessRef.current(msgObj.payload);
              }
            }
            
            // 2. If it's a STATE update, synchronise the dashboard view on mobile/other clients
            if (msgObj.type === 'STATE') {
              const currentLocalLog = stateRef.current.scanLog;
              const incomingLogLength = msgObj.scanLog ? msgObj.scanLog.length : 0;
              
              // Synchronize popup status for mobile scanner overlay
              if (mobilePopupPayloadRef.current) {
                const targetPayload = mobilePopupPayloadRef.current;
                const isPayloadInLog = msgObj.scanLog && msgObj.scanLog.some(item => item.payload === targetPayload);
                if (isPayloadInLog || msgObj.lastPayload === targetPayload) {
                  if (msgObj.duplicate) {
                    setMobilePopupStatus('duplicate');
                  } else if (msgObj.isComplete) {
                    setMobilePopupStatus('complete');
                  } else {
                    setMobilePopupStatus('success');
                  }
                  // Clear ref to prevent duplicate processing
                  mobilePopupPayloadRef.current = '';
                }
              }
              
              if (incomingLogLength !== currentLocalLog.length || msgObj.targetLimit !== stateRef.current.targetLimit) {
                // Play notification beeps locally if a new scan was registered by someone else
                if (incomingLogLength > currentLocalLog.length && msgObj.lastPayload !== 'LIMIT_CHANGE' && msgObj.lastPayload !== 'RESET' && msgObj.lastPayload !== 'SYNC_RESPONSE') {
                  if (msgObj.isComplete) {
                    playBeep('complete');
                    showToast('Scan target limit reached!', 'success');
                  } else {
                    playBeep('success');
                    showToast(`Scan #${incomingLogLength} recorded: "${msgObj.lastPayload}"`, 'success');
                  }
                }
                
                // Update local states
                if (msgObj.scanLog) setScanLog(msgObj.scanLog);
                if (msgObj.targetLimit) setTargetLimit(msgObj.targetLimit);
                setIsTargetReached(!!msgObj.isComplete);
                
                // Set dismissible alert banners locally
                if (msgObj.lastPayload === 'RESET') {
                  setAlertMessage(null);
                } else if (msgObj.lastPayload === 'LIMIT_CHANGE' || msgObj.lastPayload === 'SYNC_RESPONSE') {
                  // Ignore for alerts
                } else if (msgObj.duplicate) {
                  setAlertMessage({
                    text: `Already Scanned: This QR code ("${msgObj.lastPayload}") has already been scanned in this session. Please use a different QR code.`,
                    type: 'warning'
                  });
                } else {
                  setAlertMessage({
                    text: `Scanned Successfully: QR code "${msgObj.lastPayload}" has been recorded.`,
                    type: 'success'
                  });
                }
              }
            }

            // 3. If it's a SYNC_REQUEST, the master (Desktop) client broadcasts the current state
            if (msgObj.type === 'SYNC_REQUEST') {
              const isDesktop = !/Mobi|Android|iPhone/i.test(navigator.userAgent);
              const currentLog = stateRef.current.scanLog;
              if (isDesktop && currentLog.length > 0) {
                broadcastState(currentLog, stateRef.current.targetLimit, stateRef.current.isTargetReached, false, 'SYNC_RESPONSE');
              }
            }
          } catch (e) {
            // Fallback: If payload is raw text, only desktop processes it
            const isDesktop = !/Mobi|Android|iPhone/i.test(navigator.userAgent);
            if (isDesktop && scanSuccessRef.current) {
              scanSuccessRef.current(messageStr);
            }
          }
        } catch (err) {
          console.error('Error in computer SSE message parser:', err);
        }
      };

      // Send a sync request to fetch active room data from the laptop if it is already running
      const requestSync = async () => {
        try {
          await fetch(`https://ntfy.ch/qrcounter_${sessionId}`, {
            method: 'POST',
            body: JSON.stringify({ type: 'SYNC_REQUEST' })
          });
        } catch (err) {
          console.error('Failed to send sync request', err);
        }
      };

      // Delay slightly to ensure EventSource listeners are ready on all ends
      setTimeout(requestSync, 1000);

      return () => {
        eventSource.close();
      };
    }
  }, [sessionId]);

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

  if (isPhoneScanSuccess) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card text-center" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '2.5rem 1.5rem', alignItems: 'center' }}>
          
          {phoneStatus === 'sending' && (
            <>
              <RefreshCw className="animate-spin" size={56} style={{ color: 'var(--secondary)' }} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Processing Scan...</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Connecting to dashboard and registering <strong>{lastPhoneScanVal}</strong>...
              </p>
            </>
          )}

          {phoneStatus === 'success' && (
            <>
              <CheckCircle2 size={56} style={{ color: 'var(--primary)', marginBottom: '0.25rem' }} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>Scanned Successfully!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                QR code <strong>{lastPhoneScanVal}</strong> has been registered on the dashboard.
              </p>
              <div className="modal-stats" style={{ margin: '0.5rem 0', width: '100%' }}>
                <div className="stat-box">
                  <span className="stat-value">{mobileStats.count}</span>
                  <span className="stat-label">Scans Completed</span>
                </div>
                <div className="modal-divider"></div>
                <div className="stat-box">
                  <span className="stat-value">{mobileStats.limit}</span>
                  <span className="stat-label">Target Limit</span>
                </div>
              </div>
            </>
          )}

          {phoneStatus === 'duplicate' && (
            <>
              <AlertTriangle size={56} style={{ color: 'var(--warning)', marginBottom: '0.25rem' }} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)' }}>Already Scanned!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                This QR code (<strong>{lastPhoneScanVal}</strong>) has already been scanned. Please try scanning a different QR code!
              </p>
              <div className="modal-stats" style={{ margin: '0.5rem 0', width: '100%' }}>
                <div className="stat-box">
                  <span className="stat-value">{mobileStats.count}</span>
                  <span className="stat-label">Current Count</span>
                </div>
                <div className="modal-divider"></div>
                <div className="stat-box">
                  <span className="stat-value">{mobileStats.limit}</span>
                  <span className="stat-label">Target Limit</span>
                </div>
              </div>
            </>
          )}

          {phoneStatus === 'complete' && (
            <>
              <CheckCircle2 size={56} style={{ color: 'var(--primary)', marginBottom: '0.25rem' }} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>Limit Reached!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Goal completed! All <strong>{mobileStats.limit} of {mobileStats.limit}</strong> scans have been completed.
              </p>
            </>
          )}

          {(phoneStatus === 'success' || phoneStatus === 'duplicate' || phoneStatus === 'complete') && (
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setIsPhoneScanSuccess(false);
                setPhoneStatus('sending');
                window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}?session=${sessionId}`);
              }}
              style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Camera size={16} />
              Scan Another QR
            </button>
          )}

          <div style={{ background: 'var(--bg-secondary)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-secondary)', width: '100%', fontWeight: '600', border: '1px solid var(--border-color)', marginTop: '0.25rem' }}>
            Session Room: {sessionId}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            You can close this browser tab now.
          </p>
        </div>
      </div>
    );
  }

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '0.3rem 0.75rem', borderRadius: '12px', fontWeight: '600' }}>
            Room: {sessionId}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            🟢 Sync Active
          </span>
        </div>
      </header>

      {/* Main Alert Message Banner (Top of computer view) */}
      {alertMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid',
          background: alertMessage.type === 'success' ? '#e6fdf4' : alertMessage.type === 'warning' ? '#fffbeb' : '#fef2f2',
          borderColor: alertMessage.type === 'success' ? '#a7f3d0' : alertMessage.type === 'warning' ? '#fde68a' : '#fca5a5',
          color: alertMessage.type === 'success' ? '#065f46' : alertMessage.type === 'warning' ? '#92400e' : '#991b1b',
          fontSize: '0.9rem',
          fontWeight: 500,
          boxShadow: 'var(--shadow-sm)',
          animation: 'slideUp 0.2s ease-out'
        }}>
          {alertMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <div style={{ flex: 1 }}>{alertMessage.text}</div>
          <button 
            onClick={() => setAlertMessage(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold', fontSize: '1.25rem', padding: '0 0.5rem', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

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
                  const isComplete = scanLog.length >= val;
                  if (isComplete) {
                    setIsTargetReached(true);
                    playBeep('complete');
                  } else {
                    setIsTargetReached(false);
                  }
                  broadcastState(scanLog, val, isComplete, false, 'LIMIT_CHANGE');
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
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAllowDuplicates(checked);
                    publishState(sessionId, {
                      type: 'STATE',
                      scanLog,
                      targetLimit,
                      isComplete: isTargetReached,
                      duplicate: false,
                      lastPayload: 'CONFIG_CHANGE'
                    });
                  }}
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
              className={`tab-btn ${activeTab === 'generator' ? 'active' : ''}`}
              onClick={() => setActiveTab('generator')}
            >
              <QrCode size={16} />
              QR Generator
            </button>
            <button
              className={`tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
              onClick={() => setActiveTab('scanner')}
            >
              <ShieldCheck size={16} />
              Scanner View
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
            <p>Go to Scanner View to scan with your camera/file, or use the QR Generator to simulate.</p>
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

      {/* Mobile Scanner Overlay Popup Modal */}
      {showMobileScanPopup && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '1.5rem'
        }}>
          <div className="card text-center" style={{
            maxWidth: '360px',
            width: '100%',
            background: 'var(--bg-primary)',
            padding: '2rem 1.5rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            position: 'relative'
          }}>
            {/* Top-Right Dismiss Button */}
            <button 
              onClick={() => setShowMobileScanPopup(false)}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.5rem',
                color: 'var(--text-muted)',
                fontWeight: 'bold',
                lineHeight: 1,
                padding: '0.25rem'
              }}
            >
              &times;
            </button>

            {mobilePopupStatus === 'sending' && (
              <>
                <RefreshCw className="animate-spin" size={48} style={{ color: 'var(--secondary)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Transmitting Scan...</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Registering scan payload <strong>{mobilePopupPayload}</strong>...
                </p>
              </>
            )}

            {mobilePopupStatus === 'success' && (
              <>
                <CheckCircle2 size={48} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>Scan Successful!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 600, marginTop: '-0.25rem' }}>
                  Counter Updated
                </p>
              </>
            )}

            {mobilePopupStatus === 'duplicate' && (
              <>
                <AlertTriangle size={48} style={{ color: 'var(--warning)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--warning)' }}>Already Scanned!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                  This QR code (<strong>{mobilePopupPayload}</strong>) has already been scanned. Please scan a different code!
                </p>
              </>
            )}

            {mobilePopupStatus === 'complete' && (
              <>
                <CheckCircle2 size={48} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>Limit Reached!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                  Target scan limit has been completed successfully!
                </p>
              </>
            )}

            {mobilePopupStatus !== 'sending' && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowMobileScanPopup(false)}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                Close Scanner
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
