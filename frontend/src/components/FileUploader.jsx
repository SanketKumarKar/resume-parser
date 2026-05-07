import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/rtf": [".rtf"],
  "text/rtf": [".rtf"],
  "text/plain": [".txt"],
  "text/html": [".html", ".htm"],
  "text/markdown": [".md", ".markdown"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const FORMAT_ICONS = {
  pdf: "📄",
  docx: "📝",
  doc: "📝",
  rtf: "📃",
  txt: "📋",
  html: "🌐",
  htm: "🌐",
  odt: "📑",
  md: "⬇️",
  markdown: "⬇️",
  jpg: "🖼️",
  jpeg: "🖼️",
  png: "🖼️",
  webp: "🖼️",
};

export default function FileUploader({ onFileSelect, selectedFile, isLoading }) {
  const [dragError, setDragError] = useState("");

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      setDragError("");
      if (rejectedFiles.length > 0) {
        setDragError(`Unsupported format. Please upload: PDF, DOCX, DOC, RTF, TXT, HTML, ODT, MD, JPG, PNG, or WEBP`);
        return;
      }
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: isLoading,
  });

  const getExt = (name) => name?.split(".").pop()?.toLowerCase();

  return (
    <div style={{ width: "100%" }}>
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${
            isDragReject
              ? "var(--red)"
              : isDragActive
              ? "var(--accent)"
              : selectedFile
              ? "var(--green)"
              : "var(--border-bright)"
          }`,
          borderRadius: "var(--radius)",
          padding: "48px 32px",
          textAlign: "center",
          background: isDragActive
            ? "var(--accent-dim)"
            : selectedFile
            ? "var(--green-dim)"
            : "var(--bg-card)",
          cursor: isLoading ? "not-allowed" : "pointer",
          transition: "all 0.25s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Animated background shimmer on drag */}
        {isDragActive && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, transparent, var(--accent-dim), transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
              pointerEvents: "none",
            }}
          />
        )}

        <input {...getInputProps()} />

        {selectedFile ? (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ fontSize: 48, marginBottom: 12, animation: "float 3s ease-in-out infinite" }}>
              {FORMAT_ICONS[getExt(selectedFile.name)] || "📄"}
            </div>
            <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
              {selectedFile.name}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {(selectedFile.size / 1024).toFixed(1)} KB •{" "}
              <span style={{ color: "var(--text-muted)" }}>click to change</span>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 52,
                marginBottom: 16,
                filter: isDragActive ? "drop-shadow(0 0 12px var(--accent))" : "none",
                transition: "filter 0.3s ease",
                animation: "float 4s ease-in-out infinite",
              }}
            >
              {isDragActive ? "⬇️" : "📂"}
            </div>
            <div style={{ color: "var(--text-primary)", fontSize: 18, fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 8 }}>
              {isDragActive ? "Drop your resume here" : "Drop your resume or click to upload"}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Supports PDF, DOCX, DOC, RTF, TXT, HTML, ODT, MD, JPG, PNG, WEBP
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
              Max file size: 10MB
            </div>
          </>
        )}
      </div>

      {dragError && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 16px",
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.3)",
            borderRadius: "var(--radius-sm)",
            color: "var(--red)",
            fontSize: 13,
          }}
        >
          ⚠️ {dragError}
        </div>
      )}

      {/* Supported formats pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
        {["PDF", "DOCX", "DOC", "RTF", "TXT", "HTML", "ODT", "MD", "JPG", "PNG", "WEBP"].map((fmt) => (
          <span
            key={fmt}
            style={{
              padding: "3px 10px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              fontSize: 11,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
              letterSpacing: "0.05em",
            }}
          >
            {fmt}
          </span>
        ))}
      </div>
    </div>
  );
}
