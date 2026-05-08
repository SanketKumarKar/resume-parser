import React, { useState } from "react";
import axios from "axios";
import FileUploader from "./components/FileUploader.jsx";
import JsonViewer from "./components/JsonViewer.jsx";
import LoadingState from "./components/LoadingState.jsx";

export default function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleExtract = async () => {
    if (!file) return setError("Please upload a resume file.");

    setError("");
    setResult(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const response = await axios.post("/api/extract", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 120000, // 2 min
      });

      setResult(response.data.data);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Extraction failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError("");
  };

  const handleDownloadPDF = async () => {
    if (!result) return;

    setIsDownloading(true);
    try {
      const response = await axios.post(
        "/api/download",
        {
          resumeData: result,
          filename: file?.name || "resume",
          format: "pdf",
        },
        {
          responseType: "blob",
          timeout: 30000,
        }
      );

      // Create a blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${(file?.name || "resume").split(".")[0]}_formatted.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Failed to download resume. Please try again.";
      setError(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!result) return;

    setIsDownloading(true);
    try {
      const response = await axios.post(
        "/api/download",
        {
          resumeData: result,
          filename: file?.name || "resume",
          format: "docx",
        },
        {
          responseType: "blob",
          timeout: 30000,
        }
      );

      // Create a blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${(file?.name || "resume").split(".")[0]}_formatted.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Failed to download resume. Please try again.";
      setError(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadHTML = async () => {
    if (!result) return;

    setIsDownloading(true);
    try {
      const response = await axios.post(
        "/api/download",
        {
          resumeData: result,
          filename: file?.name || "resume",
          format: "html",
        },
        {
          responseType: "blob",
          timeout: 30000,
        }
      );

      // Create a blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${(file?.name || "resume").split(".")[0]}_formatted.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Failed to download resume. Please try again.";
      setError(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Background pattern */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `radial-gradient(ellipse at 20% 20%, rgba(124, 106, 247, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, rgba(74, 222, 128, 0.05) 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          pointerEvents: "none",
          opacity: 0.5,
        }}
      />

      {/* Header */}
      <header
        style={{
          padding: "20px 40px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(10, 10, 15, 0.8)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent), #a855f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              animation: "pulse-glow 3s ease-in-out infinite",
            }}
          >
            📄
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: "-0.02em",
                background: "linear-gradient(135deg, #fff, var(--accent))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ResumeAI
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -2 }}>
              Intelligent Resume Extractor
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              padding: "4px 10px",
              background: "var(--green-dim)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              borderRadius: 20,
              fontSize: 11,
              color: "var(--green)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--green)",
                display: "inline-block",
              }}
            />
            Gemini 3 Flash Preview
          </div>
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          maxWidth: 900,
          width: "100%",
          margin: "0 auto",
          padding: "40px 24px",
          position: "relative",
        }}
      >
        {!result ? (
          <div style={{ animation: "fadeUp 0.6s ease" }}>
            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 14px",
                  background: "var(--accent-dim)",
                  border: "1px solid rgba(124, 106, 247, 0.3)",
                  borderRadius: 20,
                  fontSize: 12,
                  color: "var(--accent)",
                  marginBottom: 16,
                  letterSpacing: "0.05em",
                }}
              >
                ✦ POWERED BY GEMINI AI
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(32px, 5vw, 52px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  marginBottom: 16,
                }}
              >
                Extract{" "}
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    background: "linear-gradient(135deg, var(--accent), #e879f9)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  everything
                </span>{" "}
                from any resume
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 500, margin: "0 auto" }}>
                Upload a resume in any format. Get back structured JSON with all details — name, skills, experience, education, and more.
              </p>
            </div>

            {/* Card */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "32px",
                boxShadow: "var(--shadow)",
              }}
            >
              {/* File Upload */}
              <div style={{ marginBottom: 28 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Resume File
                </label>
                <FileUploader
                  onFileSelect={setFile}
                  selectedFile={file}
                  isLoading={isLoading}
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(248, 113, 113, 0.08)",
                    border: "1px solid rgba(248, 113, 113, 0.25)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--red)",
                    fontSize: 13,
                    marginBottom: 20,
                    animation: "fadeUp 0.3s ease",
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* Loading or Button */}
              {isLoading ? (
                <LoadingState />
              ) : (
                <button
                  onClick={handleExtract}
                  disabled={!file}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background:
                      !file
                        ? "var(--bg-elevated)"
                        : "linear-gradient(135deg, var(--accent), #a855f7)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    color: !file ? "var(--text-muted)" : "white",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "var(--font-display)",
                    cursor: !file ? "not-allowed" : "pointer",
                    transition: "all 0.25s ease",
                    letterSpacing: "0.01em",
                    boxShadow:
                      !file
                        ? "none"
                        : "0 4px 24px var(--accent-glow)",
                  }}
                  onMouseEnter={(e) => {
                    if (file) {
                      e.target.style.transform = "translateY(-1px)";
                      e.target.style.boxShadow = "0 8px 32px var(--accent-glow)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow =
                      !file ? "none" : "0 4px 24px var(--accent-glow)";
                  }}
                >
                  ✦ Extract Resume Data
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            {/* Result header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 12px",
                    background: "var(--green-dim)",
                    border: "1px solid rgba(74, 222, 128, 0.3)",
                    borderRadius: 20,
                    fontSize: 12,
                    color: "var(--green)",
                    marginBottom: 10,
                  }}
                >
                  ✓ Extraction Complete
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Extracted Resume Data
                </h2>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                  style={{
                    padding: "10px 20px",
                    background: "linear-gradient(135deg, var(--accent), #a855f7)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    cursor: isDownloading ? "not-allowed" : "pointer",
                    opacity: isDownloading ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isDownloading) {
                      e.target.style.transform = "translateY(-1px)";
                      e.target.style.boxShadow = "0 4px 16px var(--accent-glow)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "none";
                  }}
                >
                  {isDownloading ? "🔄 Generating..." : "⬇️ Download PDF"}
                </button>
                <button
                  onClick={handleDownloadHTML}
                  disabled={isDownloading}
                  style={{
                    padding: "10px 20px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--accent)",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    cursor: isDownloading ? "not-allowed" : "pointer",
                    opacity: isDownloading ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isDownloading) {
                      e.target.style.transform = "translateY(-1px)";
                      e.target.style.background = "var(--accent-dim)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.background = "var(--bg-elevated)";
                  }}
                >
                  📄 Download HTML
                </button>
                  <button
                    onClick={handleDownloadDocx}
                    disabled={isDownloading}
                    style={{
                      padding: "10px 20px",
                      background: "var(--bg-elevated)",
                      border: "1px solid #0066cc",
                      borderRadius: "var(--radius-sm)",
                      color: "#0066cc",
                      fontSize: 13,
                      fontWeight: 600,
                      transition: "all 0.2s ease",
                      cursor: isDownloading ? "not-allowed" : "pointer",
                      opacity: isDownloading ? 0.7 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isDownloading) {
                        e.target.style.transform = "translateY(-1px)";
                        e.target.style.background = "rgba(0, 102, 204, 0.08)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = "translateY(0)";
                      e.target.style.background = "var(--bg-elevated)";
                    }}
                  >
                    📝 Download DOCX
                  </button>
                <button
                  onClick={handleReset}
                  style={{
                    padding: "10px 20px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = "var(--accent)";
                    e.target.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.color = "var(--text-secondary)";
                  }}
                >
                  ← Extract Another
                </button>
              </div>
            </div>

            <JsonViewer data={result} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "20px 40px",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        ResumeAI • Built with React + Node.js + Gemini 3 Flash Preview • Your data is never stored
      </footer>
    </div>
  );
}
