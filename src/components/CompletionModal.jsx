import React from 'react';
import { Award, RotateCcw, Share2, ClipboardList } from 'lucide-react';

export default function CompletionModal({ scanLimit, totalScans, uniqueCount, onReset }) {
  // Generate some CSS-based confetti pieces
  const confettiArray = Array.from({ length: 40 });

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        {/* Confetti decoration */}
        <div className="confetti-holder">
          {confettiArray.map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 3;
            const size = Math.random() * 8 + 4;
            return (
              <span
                key={i}
                className="confetti"
                style={{
                  left: `${left}%`,
                  animationDelay: `${delay}s`,
                  width: `${size}px`,
                  height: `${size}px`,
                }}
              />
            );
          })}
        </div>

        <div className="modal-icon-badge">
          <Award size={44} />
        </div>

        <h2>Goal Completed!</h2>
        <p>
          Fantastic! You have successfully reached your scanning target. The system has stopped recording further scans automatically.
        </p>

        <div className="modal-stats">
          <div className="stat-box">
            <span className="stat-value">{totalScans}</span>
            <span className="stat-label">Total Scans</span>
          </div>
          <div className="modal-divider"></div>
          <div className="stat-box">
            <span className="stat-value">{uniqueCount}</span>
            <span className="stat-label">Unique QR Codes</span>
          </div>
          <div className="modal-divider"></div>
          <div className="stat-box">
            <span className="stat-value">{scanLimit}</span>
            <span className="stat-label">Scan Limit</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', width: '100%', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={onReset} style={{ flex: 1 }}>
            <RotateCcw size={18} />
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );
}
