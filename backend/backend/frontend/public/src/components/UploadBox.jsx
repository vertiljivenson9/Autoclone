import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

function UploadBox({ onFilesSelected, maxSize = 100 * 1024 * 1024, acceptedFiles = ['.zip'], disabled = false }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    setError(null);

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors[0].code === 'file-too-large') {
        setError(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB`);
      } else if (rejection.errors[0].code === 'file-invalid-type') {
        setError(`Invalid file type. Only ${acceptedFiles.join(', ')} files are allowed.`);
      } else {
        setError('Cannot upload this file. Please try a different file.');
      }
      return;
    }

    if (acceptedFiles.length === 0) {
      setError('No valid files selected');
      return;
    }

    setUploading(true);

    try {
      // For ZIP files, we can pass them directly
      // For folders, we'd need to create a ZIP first
      const file = acceptedFiles[0];
      
      // Validate file size
      if (file.size > maxSize) {
        throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds limit of ${maxSize / 1024 / 1024}MB`);
      }

      // Validate file type
      if (!file.name.endsWith('.zip') && !acceptedFiles.includes('.zip')) {
        throw new Error('Only ZIP files are supported for folder uploads');
      }

      // Prepare file for upload
      onFilesSelected(acceptedFiles);

    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [onFilesSelected, maxSize, acceptedFiles]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    maxSize,
    accept: {
      'application/zip': acceptedFiles.includes('.zip') ? ['.zip'] : [],
      'application/x-zip-compressed': acceptedFiles.includes('.zip') ? ['.zip'] : []
    },
    multiple: false,
    disabled: disabled || uploading
  });

  return (
    <div className="upload-box">
      <div
        {...getRootProps()}
        className={`
          dropzone 
          ${isDragActive ? 'drag-active' : ''}
          ${isDragReject ? 'drag-reject' : ''}
          ${disabled ? 'disabled' : ''}
          ${uploading ? 'uploading' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {uploading ? (
          <div className="uploading-state">
            <div className="spinner"></div>
            <p>Processing file...</p>
          </div>
        ) : (
          <div className="dropzone-content">
            <div className="dropzone-icon">
              {isDragActive ? '📂' : '📁'}
            </div>
            
            <div className="dropzone-text">
              {isDragActive ? (
                <p className="dropzone-title">Drop the file here...</p>
              ) : (
                <>
                  <p className="dropzone-title">
                    {disabled ? 'Select a repository first' : 'Drag & drop your ZIP file here'}
                  </p>
                  <p className="dropzone-subtitle">
                    or click to browse
                  </p>
                </>
              )}
              
              <div className="dropzone-info">
                <p className="file-types">
                  <strong>Supported:</strong> ZIP archives only
                </p>
                <p className="file-size">
                  <strong>Max size:</strong> {maxSize / 1024 / 1024}MB
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="upload-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      <div className="upload-tips">
        <h4>Tips for successful uploads:</h4>
        <ul>
          <li>Create a ZIP file of your folder before uploading</li>
          <li>Make sure the ZIP file is not password protected</li>
          <li>Check that all file paths are valid (no special characters)</li>
          <li>Large uploads may take several minutes to process</li>
        </ul>
      </div>
    </div>
  );
}

export default UploadBox;
