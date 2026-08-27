import { ImageResponse } from "next/og";

export const alt = "TO-DO-LINE | AI 일정표 · 프로젝트 타임라인 관리";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: "linear-gradient(135deg, #0f172a 0%, #1463ff 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(255,255,255,0.16)",
            }}
          />
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#ffffff" }}>
            TO-DO-LINE
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 64,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.25,
          }}
        >
          AI로 만드는 프로젝트 일정표
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 32,
            color: "rgba(255,255,255,0.82)",
          }}
        >
          타임라인 · 업무 일정 관리 · 엑셀 Import/Export
        </div>
      </div>
    ),
    { ...size }
  );
}
