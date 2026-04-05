/**
 * src/workspaces/GraphWorkspace/TimelinePanel.tsx
 *
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Timeline } from "vis-timeline";
import type { TimelineOptions } from "vis-timeline";
import { DataSet } from "vis-data";
import "vis-timeline/styles/vis-timeline-graph2d.css";


export interface TimelinePanelProps {
  onTimeChange: (time: Date) => void;
}


const MIN_DATE = new Date("1970-01-01T00:00:00Z");
const MAX_DATE = new Date("2025-01-01T00:00:00Z");
const PLAYHEAD_ID = "playhead";
const PLAY_INTERVAL_MS = 500;
const PLAY_STEP_MONTHS = 6;


const VIS_OVERRIDE_CSS = `
  .sem-timeline-wrap .vis-timeline {
    border: none !important;
    background: transparent !important;
    overflow: visible !important;
  }
  .sem-timeline-wrap .vis-panel.vis-background,
  .sem-timeline-wrap .vis-panel.vis-center {
    background: transparent !important;
  }
  .sem-timeline-wrap .vis-panel {
    border-color: rgba(88, 166, 255, 0.15) !important;
  }
  .sem-timeline-wrap .vis-time-axis .vis-text {
    color: #8b949e !important;
    font-size: 11px !important;
    font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
    padding-top: 3px !important;
  }
  .sem-timeline-wrap .vis-time-axis .vis-text.vis-major {
    color: #c9d1d9 !important;
    font-weight: 700 !important;
    font-size: 12px !important;
  }
  .sem-timeline-wrap .vis-time-axis .vis-grid.vis-minor {
    border-color: rgba(88, 166, 255, 0.07) !important;
  }
  .sem-timeline-wrap .vis-time-axis .vis-grid.vis-major {
    border-color: rgba(88, 166, 255, 0.18) !important;
  }
  /* Playhead needle */
  .sem-timeline-wrap .vis-custom-time.${PLAYHEAD_ID} {
    background: rgba(88, 166, 255, 0.15) !important;
    width: 2px !important;
    cursor: ew-resize !important;
    z-index: 5 !important;
  }
  .sem-timeline-wrap .vis-custom-time.${PLAYHEAD_ID} > .vis-custom-time-marker {
    background: #58a6ff !important;
    color: #0d1117 !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    border-radius: 3px !important;
    padding: 1px 5px !important;
    white-space: nowrap !important;
    box-shadow: 0 0 8px rgba(88, 166, 255, 0.7) !important;
  }
  .sem-timeline-wrap .vis-current-time { display: none !important; }
  .sem-timeline-wrap .vis-panel.vis-left { display: none !important; }
`;

function formatPlayheadLabel(d: Date): string {
  return d.getFullYear().toString() + "/" + String(d.getMonth() + 1).padStart(2, "0");
}

export function TimelinePanel({ onTimeChange }: TimelinePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const playheadRef = useRef<Date>(new Date("2000-01-01T00:00:00Z"));
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayDate, setDisplayDate] = useState("2000 / 01");


  useEffect(() => {
    if (!containerRef.current || timelineRef.current) return;

    const items = new DataSet<any>([]);

    const options: TimelineOptions = {
      height: "100%",
      min: MIN_DATE,
      max: MAX_DATE,
      start: MIN_DATE,
      end: MAX_DATE,
      showCurrentTime: false,
      zoomable: true,
      moveable: true,
      zoomMin: 1000 * 60 * 60 * 24 * 365 * 2,   // ≥ 2 years zoom
      zoomMax: 1000 * 60 * 60 * 24 * 365 * 60,   // ≤ 60 years zoom
      showMajorLabels: true,
      showMinorLabels: true,
      timeAxis: { scale: "year", step: 5 },
      format: {
        minorLabels: { year: "YYYY" },
        majorLabels: { year: "YYYY" },
      },
      orientation: { axis: "bottom" },
      margin: { item: 0, axis: 0 },
      selectable: false,
      stack: false,
    } as TimelineOptions;

    const tl = new Timeline(containerRef.current, items, options);
    timelineRef.current = tl;

    const defaultTime = new Date("2000-01-01T00:00:00Z");
    playheadRef.current = defaultTime;
    tl.addCustomTime(defaultTime, PLAYHEAD_ID);


    onTimeChange(defaultTime);
    setDisplayDate(formatPlayheadLabel(defaultTime));


    tl.on("timechange", (props: any) => {
      if (props.id !== PLAYHEAD_ID) return;
      const t: Date = props.time;
      playheadRef.current = t;
      tl.setCustomTime(t, PLAYHEAD_ID);
      onTimeChange(t);
      setDisplayDate(formatPlayheadLabel(t));
    });

    return () => {
      tl.destroy();
      timelineRef.current = null;
    };

  }, []);


  const startPlay = useCallback(() => {
    if (playIntervalRef.current) return;
    playIntervalRef.current = setInterval(() => {
      const tl = timelineRef.current;
      if (!tl) return;

      const next = new Date(playheadRef.current);
      next.setMonth(next.getMonth() + PLAY_STEP_MONTHS);

      if (next >= MAX_DATE) {

        next.setTime(MIN_DATE.getTime());
      }

      playheadRef.current = next;
      tl.setCustomTime(next, PLAYHEAD_ID);
      onTimeChange(next);
      setDisplayDate(formatPlayheadLabel(next));
    }, PLAY_INTERVAL_MS);
  }, [onTimeChange]);

  const stopPlay = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (prev) {
        stopPlay();
        return false;
      } else {
        startPlay();
        return true;
      }
    });
  }, [startPlay, stopPlay]);


  useEffect(() => () => stopPlay(), [stopPlay]);


  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "90px",
        borderTop: "1px solid rgba(88,166,255,0.2)",
        background: "rgba(1, 4, 9, 0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
      }}
    >
      <style>{VIS_OVERRIDE_CSS}</style>

      {/* Play/Pause button */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "0 16px",
          borderRight: "1px solid rgba(88,166,255,0.15)",
          minWidth: 80,
          flexShrink: 0,
        }}
      >
        <button
          id="temporal-play-btn"
          onClick={togglePlay}
          title={isPlaying ? "Pause Evolution" : "Play Evolution"}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `1.5px solid ${isPlaying ? "#58a6ff" : "rgba(88,166,255,0.35)"}`,
            background: isPlaying
              ? "rgba(88,166,255,0.2)"
              : "rgba(88,166,255,0.06)",
            color: "#58a6ff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
            boxShadow: isPlaying ? "0 0 10px rgba(88,166,255,0.4)" : "none",
          }}
        >
          {isPlaying ? (
            /* Pause icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            /* Play icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <span
          style={{
            fontSize: 10,
            color: isPlaying ? "#58a6ff" : "#8b949e",
            fontFamily: "monospace",
            letterSpacing: "0.04em",
            transition: "color 0.2s",
          }}
        >
          {displayDate}
        </span>
      </div>

      {/* Label */}
      <div
        style={{
          position: "absolute",
          top: 5,
          left: 100,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "rgba(88,166,255,0.55)",
          textTransform: "uppercase",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        Temporal Scrubber · 1970–2025
      </div>

      {/* Timeline canvas */}
      <div className="sem-timeline-wrap" style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div
          ref={containerRef}
          style={{ width: "100%", height: "100%", position: "relative" }}
        />
      </div>
    </div>
  );
}
