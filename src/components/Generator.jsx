import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Play, RefreshCw, Check } from 'lucide-react';

const makeRandomQRId = () => `QR-${Math.floor(1000 + Math.random() * 9000)}`;

export default function Generator({ onSimulateScan, isDisabled }) {
  const [qrId, setQrId] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    setQrId(makeRandomQRId());
  }, []);

  const handleGenerateNew = () => {
    setQrId(makeRandomQRId());
    setDownloaded(false);
  };

  const handleDownload = () => {
    const svgElement = document.getElementById('generated-qr');
    if (!svgElement) return;

    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const context = canvas.getContext('2d');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, 300, 300);
      context.drawImage(image, 0, 0, 300, 300);

      const png = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = png;
      downloadLink.download = `qr-code-${qrId.toLowerCase()}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    };
    image.src = blobURL;
  };

  const handleSimulate = () => {
    onSimulateScan(qrId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', maxWidth: '440px', margin: '0 auto', width: '100%' }}>
      {/* 1. QR Code Display Container (centered at top) */}
      <div className="qr-output-card" style={{ width: '100%', padding: '1.5rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="qr-canvas-container">
          <QRCodeSVG
            id="generated-qr"
            value={qrId ? `${window.location.origin}/?scan=${encodeURIComponent(qrId)}` : ' '}
            size={180}
            level="H"
            includeMargin={true}
          />
        </div>

        <div style={{ textAlign: 'center', width: '100%', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>QR Code ID</span>
          <span style={{ fontWeight: '700', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block', fontSize: '1.15rem' }}>
            {qrId || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Empty ID</span>}
          </span>
        </div>
      </div>

      {/* 2. Form & Actions Container (neatly stacked below QR) */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="input-group">
          <label htmlFor="qr-id-input">QR Code Value</label>
          <input
            id="qr-id-input"
            type="text"
            value={qrId}
            onChange={(e) => {
              setQrId(e.target.value);
              setDownloaded(false);
            }}
            placeholder="Type custom ID payload..."
            disabled={isDisabled}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={handleGenerateNew}
            disabled={isDisabled}
            style={{ flex: 1, whiteSpace: 'nowrap', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} />
            Generate New ID
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={handleDownload}
            disabled={!qrId || isDisabled}
            style={{ flex: 1, whiteSpace: 'nowrap', fontSize: '0.85rem' }}
          >
            {downloaded ? (
              <>
                <Check size={14} style={{ color: 'var(--primary)' }} />
                Downloaded
              </>
            ) : (
              <>
                <Download size={14} />
                Download PNG
              </>
            )}
          </button>
        </div>

        {/* <button
          className="btn btn-primary"
          onClick={handleSimulate}
          disabled={!qrId || isDisabled}
          style={{ width: '100%', fontSize: '0.95rem', padding: '0.75rem' }}
        >
          <Play size={16} />
          Simulate Scan
        </button> */}
      </div>
    </div>
  );
}
