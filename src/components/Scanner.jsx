import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Upload, AlertCircle, RefreshCw, Sparkles, ShieldAlert } from 'lucide-react';

export default function Scanner({ onScanSuccess, onScanFailure, isDisabled }) {
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [scannedFilename, setScannedFilename] = useState('');

  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Manage camera scanning lifecycle
  useEffect(() => {
    if (!isDisabled) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isDisabled]);

  const startCamera = async () => {
    setCameraError(null);
    setHasCamera(false);
    
    // Tiny delay to ensure reader DOM node is mounted
    setTimeout(async () => {
      try {
        const readerElement = document.getElementById('reader');
        if (!readerElement) return;

        if (scannerRef.current) {
          await stopCamera();
        }

        const html5QrCode = new Html5Qrcode('reader');
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            onScanSuccess(decodedText);
          },
          (errorMessage) => {
            // Keep verbose frame errors out of console
          }
        );
        setHasCamera(true);
      } catch (err) {
        console.error('Camera startup error:', err);
        setCameraError(
          'Camera access failed. Check permissions or upload an image file instead.'
        );
        setHasCamera(false);
      }
    }, 150);
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error('Error stopping camera:', err);
      }
      scannerRef.current = null;
      setHasCamera(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file) => {
    setFileError(null);
    setScannedFilename(file.name);
    
    const html5QrCode = new Html5Qrcode('reader-file-helper');
    
    html5QrCode
      .scanFile(file, true)
      .then((decodedText) => {
        onScanSuccess(decodedText);
        if (fileInputRef.current) fileInputRef.current.value = '';
      })
      .catch((err) => {
        console.error('File scan error:', err);
        setFileError('Could not decode any QR code. Make sure the image is clear and contains a valid QR code.');
        onScanFailure('Failed to read file QR');
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  const triggerFileSelect = () => {
    if (isDisabled) return;
    fileInputRef.current?.click();
  };

  if (isDisabled) {
    return (
      <div className="empty-state" style={{ padding: '3rem 1.5rem', background: '#f8fafc' }}>
        <Sparkles size={40} className="empty-state-icon" style={{ color: 'var(--primary)' }} />
        <h3>Scan Limit Reached</h3>
        <p>Scanner standby mode is active. Reset the counter above to unlock camera and file scanning.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '440px', margin: '0 auto' }}>
      
      {/* Integrated Single Scanner Viewport */}
      <div className="scanner-box" style={{ width: '100%' }}>
        <div className="scanner-box-title" style={{ justifyContent: 'center', marginBottom: '0.25rem' }}>
          <Camera size={18} style={{ color: 'var(--secondary)' }} />
          <span>Live Camera View</span>
        </div>
        
        <div className={`scanner-viewport-wrapper ${hasCamera ? 'has-camera' : ''}`} style={{ width: '100%' }}>
          <div id="reader" style={{ width: '100%' }}></div>
          
          {hasCamera && <div className="scan-laser"></div>}
          
          {!hasCamera && !cameraError && (
            <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
              <RefreshCw className="empty-state-icon animate-spin" size={24} />
              <p style={{ fontSize: '0.85rem' }}>Loading camera stream...</p>
            </div>
          )}

          {cameraError && (
            <div className="empty-state" style={{ border: 'none', background: 'transparent', padding: '1rem' }}>
              <ShieldAlert size={28} style={{ color: 'var(--warning)', marginBottom: '0.25rem' }} />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>{cameraError}</p>
              <button className="btn btn-secondary" onClick={startCamera} style={{ marginTop: '0.75rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                Retry Camera
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Integrated File Upload Trigger */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Or select an image of a QR code:
        </span>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden-file-input"
          accept="image/*"
          onChange={handleFileChange}
        />
        <button className="btn btn-secondary" onClick={triggerFileSelect} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: '100%' }}>
          <Upload size={16} />
          Upload QR Image File
        </button>
        {scannedFilename && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            File selected: {scannedFilename}
          </span>
        )}
      </div>

      {fileError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.8rem', padding: '0.6rem 0.8rem', background: '#fef2f2', borderRadius: 'var(--radius-sm)', border: '1px solid #fca5a5' }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{fileError}</span>
        </div>
      )}

      {/* Hidden helper element needed by the html5-qrcode library for file processing */}
      <div id="reader-file-helper" style={{ display: 'none' }}></div>
    </div>
  );
}
