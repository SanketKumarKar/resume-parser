import React, { useEffect, useState } from "react";

const MESSAGES = [
  "Parsing resume structure...",
  "Identifying contact details...",
  "Extracting work experience...",
  "Analyzing technical skills...",
  "Mapping education history...",
  "Finding projects & certifications...",
  "Organizing extracted data...",
  "Almost there...",
];

export default function LoadingState() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2000);

    const progInterval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 8, 90));
    }, 400);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progInterval);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 40px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        gap: 24,
        animation: "fadeUp 0.4s ease",
      }}
    >
      {/* Spinner */}
      <div style={{ position: "relative", width: 80, height: 80 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid var(--border)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid transparent",
            borderTopColor: "var(--accent)",
            animation: "spin 1s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 8,
            borderRadius: "50%",
            border: "1px solid transparent",
            borderTopColor: "var(--green)",
            animation: "spin 1.5s linear infinite reverse",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          🧠
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          Extracting Resume Data
        </div>
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: 13,
            height: 20,
            transition: "opacity 0.3s ease",
          }}
        >
          {MESSAGES[msgIndex]}
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          maxWidth: 320,
          height: 4,
          background: "var(--bg-elevated)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--accent), var(--green))",
            borderRadius: 2,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
        Powered by Gemini 3 Flash
      </div>
    </div>
  );
}
