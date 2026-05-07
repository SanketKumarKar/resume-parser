import React, { useState } from "react";

const VALUE_COLORS = {
  string: "#7dd3fc",
  number: "#fbbf24",
  boolean: "#c084fc",
  null: "#f87171",
};

function JsonValue({ value, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const indent = depth * 16;

  if (value === null) {
    return <span style={{ color: VALUE_COLORS.null, fontStyle: "italic" }}>null</span>;
  }

  if (typeof value === "boolean") {
    return <span style={{ color: VALUE_COLORS.boolean }}>{String(value)}</span>;
  }

  if (typeof value === "number") {
    return <span style={{ color: VALUE_COLORS.number }}>{value}</span>;
  }

  if (typeof value === "string") {
    if (value === "") {
      return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>""</span>;
    }
    return <span style={{ color: VALUE_COLORS.string }}>"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span style={{ color: "var(--text-muted)" }}>[]</span>;
    }

    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: 13,
            padding: "0 4px",
            cursor: "pointer",
          }}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        {collapsed ? (
          <span
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
              cursor: "pointer",
            }}
            onClick={() => setCollapsed(false)}
          >
            [{value.length} items]
          </span>
        ) : (
          <span>
            {"["}
            <div style={{ paddingLeft: indent + 16 }}>
              {value.map((item, i) => (
                <div key={i} style={{ paddingTop: 2 }}>
                  <JsonValue value={item} depth={depth + 1} />
                  {i < value.length - 1 && (
                    <span style={{ color: "var(--text-muted)" }}>,</span>
                  )}
                </div>
              ))}
            </div>
            {"]"}
          </span>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return <span style={{ color: "var(--text-muted)" }}>{"{}"}</span>;
    }

    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: 13,
            padding: "0 4px",
            cursor: "pointer",
          }}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        {collapsed ? (
          <span
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
              cursor: "pointer",
            }}
            onClick={() => setCollapsed(false)}
          >
            {"{"}{keys.length} fields{"}"}
          </span>
        ) : (
          <span>
            {"{"}
            <div style={{ paddingLeft: 16 }}>
              {keys.map((key, i) => (
                <div key={key} style={{ paddingTop: 3 }}>
                  <span style={{ color: "#86efac" }}>"{key}"</span>
                  <span style={{ color: "var(--text-muted)" }}>: </span>
                  <JsonValue value={value[key]} depth={depth + 1} />
                  {i < keys.length - 1 && (
                    <span style={{ color: "var(--text-muted)" }}>,</span>
                  )}
                </div>
              ))}
            </div>
            {"}"}
          </span>
        )}
      </span>
    );
  }

  return <span>{String(value)}</span>;
}

export default function JsonViewer({ data }) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("pretty"); // "pretty" | "raw"

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume_extracted.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary stats
  const stats = [
    { label: "Skills", value: Object.values(data.technical_skills || {}).flat().length },
    { label: "Experience", value: (data.work_experience || []).length },
    { label: "Projects", value: (data.projects || []).length },
    { label: "Education", value: (data.education || []).length },
    { label: "Certifications", value: (data.certifications || []).length },
  ];

  return (
    <div style={{ animation: "fadeUp 0.5s ease" }}>
      {/* Summary Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: "var(--accent)",
                fontSize: 22,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
              }}
            >
              {s.value}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Name highlight */}
      {data.personal_info?.full_name && (
        <div
          style={{
            marginBottom: 20,
            padding: "16px 20px",
            background: "var(--accent-dim)",
            border: "1px solid rgba(124, 106, 247, 0.3)",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              color: "white",
              fontFamily: "var(--font-display)",
              flexShrink: 0,
            }}
          >
            {data.personal_info.full_name.charAt(0)}
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 18,
                color: "var(--text-primary)",
              }}
            >
              {data.personal_info.full_name}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              {[
                data.personal_info.email,
                data.personal_info.phone,
                data.personal_info.city,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {["pretty", "raw"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: view === v ? "var(--accent)" : "var(--bg-elevated)",
                color: view === v ? "white" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 500,
                transition: "all 0.2s ease",
              }}
            >
              {v === "pretty" ? "🌿 Pretty" : "📃 Raw JSON"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCopy}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: copied ? "var(--green-dim)" : "var(--bg-elevated)",
              color: copied ? "var(--green)" : "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 500,
              transition: "all 0.2s ease",
            }}
          >
            {copied ? "✓ Copied!" : "⎘ Copy"}
          </button>
          <button
            onClick={handleDownload}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            ↓ Download JSON
          </button>
        </div>
      </div>

      {/* JSON Display */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        {/* Bar */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-elevated)",
          }}
        >
          {["#f87171", "#fbbf24", "#4ade80"].map((c) => (
            <div
              key={c}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: c,
                opacity: 0.7,
              }}
            />
          ))}
          <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 8 }}>
            resume_extracted.json
          </span>
        </div>

        <div
          style={{
            padding: "20px",
            maxHeight: "60vh",
            overflowY: "auto",
            fontSize: 13,
            lineHeight: 1.7,
            fontFamily: "var(--font-body)",
          }}
        >
          {view === "raw" ? (
            <pre style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          ) : (
            <div>
              <JsonValue value={data} depth={0} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
