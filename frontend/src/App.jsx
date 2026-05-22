import React, { useState, useRef } from "react";
import axios from "axios";
import FileUploader from "./components/FileUploader.jsx";
import JsonViewer from "./components/JsonViewer.jsx";
import LoadingState from "./components/LoadingState.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("single"); // "single" or "bulk"

  // Single Resume State
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Bulk Folder State
  const [bulkFolderPath, setBulkFolderPath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredFiles, setDiscoveredFiles] = useState([]); // Array of { fullPath, name, ext, size }
  const [bulkResults, setBulkResults] = useState([]); // Array of { id, filename, filePath, size, status, error, data }
  const [isBulkExtracting, setIsBulkExtracting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0); // number of processed files
  const [bulkConcurrency, setBulkConcurrency] = useState(2); // default concurrency
  
  const isExtractingRef = useRef(false);

  // Single Resume Handlers

  /**
   * Submits the selected single resume file to the backend API for extraction.
   * Updates state with the resulting parsed JSON or displays an error.
   */
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
        timeout: 300000, // 5 min
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

  const handleDownloadError = (err, defaultMsg) => {
    console.error(defaultMsg, err);
    if (err.response?.data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const errorObj = JSON.parse(reader.result);
          setError(errorObj.error || defaultMsg);
        } catch {
          setError(defaultMsg);
        }
      };
      reader.readAsText(err.response.data);
    } else {
      setError(err.response?.data?.error || err.message || defaultMsg);
    }
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

      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${(file?.name || "resume").split(".")[0]}_formatted.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      handleDownloadError(err, "Failed to download resume. Please try again.");
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

      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${(file?.name || "resume").split(".")[0]}_formatted.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      handleDownloadError(err, "Failed to download resume. Please try again.");
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

      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${(file?.name || "resume").split(".")[0]}_formatted.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      handleDownloadError(err, "Failed to download resume. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Bulk Folder Handlers

  /**
   * Scans a local folder path via the backend API to discover all supported resume files.
   * Initializes the bulk extraction results table.
   */
  const handleScanFolder = async () => {
    if (!bulkFolderPath.trim()) return setError("Please enter a folder path.");
    setError("");
    setIsScanning(true);
    setDiscoveredFiles([]);
    setBulkResults([]);
    setBulkProgress(0);

    try {
      const response = await axios.post("/api/scan-folder", {
        folderPath: bulkFolderPath.trim(),
      });
      if (response.data.success) {
        setDiscoveredFiles(response.data.files);
        const initialResults = response.data.files.map((file, idx) => ({
          id: idx,
          filename: file.name,
          filePath: file.fullPath,
          size: file.size,
          status: "pending", // pending, processing, success, failed
          error: null,
          data: null,
        }));
        setBulkResults(initialResults);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Failed to scan folder.";
      setError(msg);
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Initiates the bulk extraction process for all discovered files.
   * Uses a configurable concurrency limit (workers) to process files in parallel.
   * Updates the progress and individual file status in real-time.
   */
  const handleStartBulkExtraction = async () => {
    if (discoveredFiles.length === 0) return;
    setError("");
    setIsBulkExtracting(true);
    setBulkProgress(0);

    const currentResults = [...bulkResults];
    isExtractingRef.current = true;
    let nextIndex = 0;
    let completedCount = 0;

    const runWorker = async () => {
      while (nextIndex < discoveredFiles.length && isExtractingRef.current) {
        const index = nextIndex++;
        
        currentResults[index] = {
          ...currentResults[index],
          status: "processing",
        };
        setBulkResults([...currentResults]);

        try {
          const response = await axios.post("/api/extract-local-file", {
            filePath: currentResults[index].filePath,
          });

          if (response.data.success) {
            currentResults[index] = {
              ...currentResults[index],
              status: "success",
              data: response.data.data,
            };
          } else {
            currentResults[index] = {
              ...currentResults[index],
              status: "failed",
              error: response.data.error || "Unknown extraction error.",
            };
          }
        } catch (err) {
          currentResults[index] = {
            ...currentResults[index],
            status: "failed",
            error: err.response?.data?.error || err.message || "Request failed.",
          };
        }

        completedCount++;
        setBulkProgress(completedCount);
        setBulkResults([...currentResults]);
      }
    };

    const workers = [];
    const concurrency = Math.min(bulkConcurrency, discoveredFiles.length);
    for (let i = 0; i < concurrency; i++) {
      workers.push(runWorker());
    }

    await Promise.all(workers);
    setIsBulkExtracting(false);
  };

  const handleCancelBulkExtraction = () => {
    isExtractingRef.current = false;
    setIsBulkExtracting(false);
    
    // Set remaining pending files to failed/cancelled
    const updated = bulkResults.map(r => {
      if (r.status === "pending" || r.status === "processing") {
        return {
          ...r,
          status: "failed",
          error: "Extraction cancelled by user."
        };
      }
      return r;
    });
    setBulkResults(updated);
  };

  const downloadCombinedJson = () => {
    const successful = bulkResults.filter(r => r.status === "success").map(r => ({
      filename: r.filename,
      data: r.data
    }));
    
    if (successful.length === 0) return;
    
    const blob = new Blob([JSON.stringify(successful, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "extracted_resumes.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    const successful = bulkResults.filter(r => r.status === "success").map(r => ({
      filename: r.filename,
      data: r.data
    }));
    
    if (successful.length === 0) return;
    
    setIsDownloading(true);
    try {
      const response = await axios.post("/api/export-excel", {
        resumes: successful
      }, {
        responseType: "blob"
      });
      
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "extracted_resumes.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      handleDownloadError(err, "Failed to export Excel. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadZip = async () => {
    const successful = bulkResults.filter(r => r.status === "success").map(r => ({
      filename: r.filename,
      data: r.data
    }));
    
    if (successful.length === 0) return;
    
    setIsDownloading(true);
    try {
      const response = await axios.post("/api/export-zip", {
        resumes: successful
      }, {
        responseType: "blob"
      });
      
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "extracted_resumes_json.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      handleDownloadError(err, "Failed to export ZIP. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleResetBulk = () => {
    setDiscoveredFiles([]);
    setBulkResults([]);
    setBulkProgress(0);
    setError("");
  };

  // Helper stats
  const totalCount = discoveredFiles.length;
  const successCount = bulkResults.filter(r => r.status === "success").length;
  const failedCount = bulkResults.filter(r => r.status === "failed").length;
  const progressPercent = totalCount > 0 ? Math.round((bulkProgress / totalCount) * 100) : 0;
  const successRate = bulkProgress > 0 ? Math.round((successCount / bulkProgress) * 100) : 0;

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
            Gemini 2.5 Flash
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
        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 32,
            gap: 12,
            animation: "fadeUp 0.4s ease"
          }}
        >
          <button
            onClick={() => { setActiveTab("single"); handleReset(); }}
            style={{
              padding: "10px 24px",
              background: activeTab === "single" ? "var(--bg-elevated)" : "transparent",
              border: `1px solid ${activeTab === "single" ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 30,
              color: activeTab === "single" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 0.2s ease",
              boxShadow: activeTab === "single" ? "0 4px 12px var(--accent-dim)" : "none",
            }}
          >
            👤 Single Upload Mode
          </button>
          <button
            onClick={() => { setActiveTab("bulk"); handleResetBulk(); }}
            style={{
              padding: "10px 24px",
              background: activeTab === "bulk" ? "var(--bg-elevated)" : "transparent",
              border: `1px solid ${activeTab === "bulk" ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 30,
              color: activeTab === "bulk" ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 0.2s ease",
              boxShadow: activeTab === "bulk" ? "0 4px 12px var(--accent-dim)" : "none",
            }}
          >
            📁 Bulk Folder Mode
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "single" ? (
          /* SINGLE MODE */
          !result ? (
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
          )
        ) : (
          /* BULK FOLDER MODE */
          <div style={{ animation: "fadeUp 0.6s ease" }}>
            {/* Hero / Title */}
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  marginBottom: 10,
                }}
              >
                Bulk Resume Parser
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 500, margin: "0 auto" }}>
                Enter the absolute folder path on your machine. Scan recursively to discover resumes, extract metadata in parallel, and export immediately.
              </p>
            </div>

            {/* Main Action Card */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "28px",
                boxShadow: "var(--shadow)",
                marginBottom: 28,
              }}
            >
              {/* Folder path Input */}
              <div style={{ marginBottom: 20 }}>
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
                  Local Folder Absolute Path
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={bulkFolderPath}
                    onChange={(e) => setBulkFolderPath(e.target.value)}
                    placeholder="e.g. C:\Users\resumes"
                    disabled={isScanning || isBulkExtracting}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-bright)",
                      borderRadius: "var(--radius-sm)",
                      color: "white",
                      fontSize: 14,
                      outline: "none",
                      transition: "all 0.25s ease",
                    }}
                  />
                  <button
                    onClick={handleScanFolder}
                    disabled={isScanning || isBulkExtracting || !bulkFolderPath.trim()}
                    style={{
                      padding: "0 24px",
                      background: "linear-gradient(135deg, var(--accent), #a855f7)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "white",
                      fontWeight: 600,
                      cursor: isScanning || isBulkExtracting || !bulkFolderPath.trim() ? "not-allowed" : "pointer",
                      opacity: isScanning || isBulkExtracting || !bulkFolderPath.trim() ? 0.6 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {isScanning ? "Scanning..." : "🔍 Scan Folder"}
                  </button>
                </div>

                {/* Pre-fill suggestion pill */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Shortcut:</span>
                  <button
                    onClick={() => setBulkFolderPath("test-resumes")}
                    disabled={isScanning || isBulkExtracting}
                    style={{
                      padding: "3px 10px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 11,
                      color: "var(--accent)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    📁 Use Worktree "test-resumes"
                  </button>
                </div>
              </div>

              {/* Concurrency slider */}
              {discoveredFiles.length > 0 && !isBulkExtracting && bulkProgress === 0 && (
                <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 15 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Concurrency (Parallel Workers):</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setBulkConcurrency(n)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: bulkConcurrency === n ? "var(--accent)" : "var(--bg-elevated)",
                          border: "none",
                          color: "white",
                          fontWeight: "bold",
                          fontSize: 12,
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

              {/* Scan Info & Start/Cancel Buttons */}
              {totalCount > 0 && (
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 15,
                  }}
                >
                  <div style={{ display: "flex", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Files Found</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "white" }}>{totalCount}</div>
                    </div>
                    {bulkProgress > 0 && (
                      <>
                        <div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Parsed</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--green)" }}>
                            {successCount} <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: "normal" }}>({successRate}%)</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Failed</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--red)" }}>{failedCount}</div>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    {isBulkExtracting ? (
                      <button
                        onClick={handleCancelBulkExtraction}
                        style={{
                          padding: "10px 24px",
                          background: "rgba(248, 113, 113, 0.15)",
                          border: "1px solid rgba(248, 113, 113, 0.3)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--red)",
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        ⏹️ Stop Processing
                      </button>
                    ) : bulkProgress === 0 ? (
                      <button
                        onClick={handleStartBulkExtraction}
                        style={{
                          padding: "10px 24px",
                          background: "linear-gradient(135deg, var(--green), #059669)",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          color: "white",
                          fontWeight: 600,
                          fontSize: 13,
                          boxShadow: "0 4px 16px rgba(74, 222, 128, 0.2)",
                        }}
                      >
                        🚀 Start Extraction
                      </button>
                    ) : (
                      <button
                        onClick={handleResetBulk}
                        style={{
                          padding: "10px 24px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-secondary)",
                          fontSize: 13,
                        }}
                      >
                        🔄 Reset Scanning
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Progress indicators */}
            {isBulkExtracting || (bulkProgress > 0 && totalCount > 0) ? (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "20px",
                  marginBottom: 28,
                  animation: "fadeUp 0.4s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {isBulkExtracting ? "⏳ Extracting Resumes..." : "🎉 Extraction Complete"}
                  </span>
                  <span style={{ color: "white", fontWeight: 700 }}>
                    {bulkProgress} / {totalCount} ({progressPercent}%)
                  </span>
                </div>
                {/* Progress Bar Container */}
                <div
                  style={{
                    height: 10,
                    background: "var(--bg-elevated)",
                    borderRadius: 5,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progressPercent}%`,
                      background: "linear-gradient(90deg, var(--accent), #a855f7, var(--green))",
                      borderRadius: 5,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            ) : null}

            {/* Download/Export panel (Visible when at least 1 file successfully extracted) */}
            {successCount > 0 && !isBulkExtracting && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid rgba(74, 222, 128, 0.2)",
                  borderRadius: "var(--radius)",
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 28,
                  animation: "pulse-glow 4s ease-in-out infinite",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--green)", marginBottom: 2 }}>
                    ✓ {successCount} Resumes Successfully Extracted!
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Download results instantly as standard structured Excel, individual JSONs, or a combined file.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={downloadExcel}
                    disabled={isDownloading}
                    style={{
                      padding: "10px 18px",
                      background: "linear-gradient(135deg, var(--green), #059669)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isDownloading ? "not-allowed" : "pointer",
                      boxShadow: "0 4px 12px rgba(74, 222, 128, 0.15)",
                    }}
                  >
                    📊 Download Excel (.xlsx)
                  </button>
                  <button
                    onClick={downloadZip}
                    disabled={isDownloading}
                    style={{
                      padding: "10px 18px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--accent)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isDownloading ? "not-allowed" : "pointer",
                    }}
                  >
                    📦 Download JSONs (ZIP)
                  </button>
                  <button
                    onClick={downloadCombinedJson}
                    disabled={isDownloading}
                    style={{
                      padding: "10px 18px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    📄 Combined JSON
                  </button>
                </div>
              </div>
            )}

            {/* Discovered Resumes Table */}
            {totalCount > 0 && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  boxShadow: "var(--shadow)",
                  animation: "fadeUp 0.5s ease",
                }}
              >
                <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
                  📂 File Scanning & Extraction Dashboard
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.01)", color: "var(--text-secondary)" }}>
                        <th style={{ padding: "12px 20px" }}>File Name</th>
                        <th style={{ padding: "12px 20px" }}>Size</th>
                        <th style={{ padding: "12px 20px" }}>Status</th>
                        <th style={{ padding: "12px 20px" }}>Candidate Name</th>
                        <th style={{ padding: "12px 20px" }}>Email</th>
                        <th style={{ padding: "12px 20px" }}>Key Skills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults.map((row) => {
                        const info = row.data?.personal_info || {};
                        const skills = row.data?.skills || [];
                        const shortSkills = Array.isArray(skills)
                          ? skills.slice(0, 3).map((s) => s.name || s).join(", ")
                          : "";

                        return (
                          <tr
                            key={row.id}
                            style={{
                              borderBottom: "1px solid var(--border)",
                              transition: "background 0.25s ease",
                              background:
                                row.status === "processing"
                                  ? "rgba(124, 106, 247, 0.04)"
                                  : row.status === "success"
                                  ? "rgba(74, 222, 128, 0.01)"
                                  : "transparent",
                            }}
                          >
                            <td style={{ padding: "14px 20px", fontWeight: 500, color: "white" }}>
                              {row.filename}
                            </td>
                            <td style={{ padding: "14px 20px", color: "var(--text-secondary)" }}>
                              {(row.size / 1024).toFixed(1)} KB
                            </td>
                            <td style={{ padding: "14px 20px" }}>
                              {row.status === "pending" && (
                                <span style={{ padding: "2px 8px", background: "var(--bg-elevated)", color: "var(--text-muted)", borderRadius: 10, fontSize: 11 }}>
                                  ⏳ Pending
                                </span>
                              )}
                              {row.status === "processing" && (
                                <span style={{ padding: "2px 8px", background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 10, fontSize: 11, fontWeight: "bold" }}>
                                  🔄 Parsing...
                                </span>
                              )}
                              {row.status === "success" && (
                                <span style={{ padding: "2px 8px", background: "var(--green-dim)", color: "var(--green)", borderRadius: 10, fontSize: 11, fontWeight: "bold" }}>
                                  ✓ Success
                                </span>
                              )}
                              {row.status === "failed" && (
                                <span
                                  title={row.error || "Unknown error occurred"}
                                  style={{ padding: "2px 8px", background: "rgba(248, 113, 113, 0.12)", color: "var(--red)", borderRadius: 10, fontSize: 11, cursor: "help" }}
                                >
                                  ⚠️ Failed
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "14px 20px", fontWeight: 600, color: "white" }}>
                              {row.data?.full_name || info.full_name || "—"}
                            </td>
                            <td style={{ padding: "14px 20px", color: "var(--text-secondary)" }}>
                              {row.data?.email || info.email || "—"}
                            </td>
                            <td style={{ padding: "14px 20px" }}>
                              {shortSkills ? (
                                <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-dim)", padding: "2px 8px", borderRadius: 12 }}>
                                  {shortSkills}
                                  {skills.length > 3 ? "..." : ""}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
        ResumeAI • Built with React + Node.js + Gemini 2.5 Flash • Your data is never stored
      </footer>
    </div>
  );
}
