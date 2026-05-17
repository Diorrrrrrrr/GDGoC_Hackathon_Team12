'use client';

import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createClient } from '@/lib/supabase/client';

// ── Config ───────────────────────────────────────────────────────────────────
const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
const BODY_TOKEN = process.env.NEXT_PUBLIC_AGORA_BODY_TOKEN ?? process.env.NEXT_PUBLIC_AGORA_TOKEN!;
const BODY_CHANNEL = process.env.NEXT_PUBLIC_AGORA_BODY_CHANNEL ?? 'body';
const BACKEND_URL =
  process.env.NEXT_PUBLIC_CV_BACKEND_URL ??
  'https://gdgoc-hackathon-team12.onrender.com/analyze';
const FPS = 30;
const HEARTBEAT_SEC = 300;

// ── Landmark indices (MediaPipe BlazePose 33-point) ──────────────────────────
const L_EAR = 7, R_EAR = 8;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_ELBOW = 13, R_ELBOW = 14;
const L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24;

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
];

// ── Types & constants ────────────────────────────────────────────────────────
type BodyState =
  | 'NORMAL'
  | 'POSTURAL_ASYMMETRY'
  | 'ARM_DRIFT'
  | 'SLOW_SLUMP'
  | 'IMPACT_FALL'
  | 'FALLEN';

const STATE_COLORS: Record<BodyState, string> = {
  NORMAL: '#50dc50',
  POSTURAL_ASYMMETRY: '#ffa500',
  ARM_DRIFT: '#6464ff',
  SLOW_SLUMP: '#2828e6',
  IMPACT_FALL: '#ff0000',
  FALLEN: '#c80000',
};

const SEVERITY: Record<BodyState, string> = {
  NORMAL: 'low',
  POSTURAL_ASYMMETRY: 'medium',
  ARM_DRIFT: 'high',
  SLOW_SLUMP: 'high',
  IMPACT_FALL: 'high',
  FALLEN: 'high',
};

const RISK_SCORE: Record<BodyState, number> = {
  NORMAL: 0.05,
  POSTURAL_ASYMMETRY: 0.55,
  ARM_DRIFT: 0.85,
  SLOW_SLUMP: 0.90,
  IMPACT_FALL: 0.95,
  FALLEN: 0.95,
};

type Lm = { x: number; y: number; z: number; visibility?: number };
interface Detection { state: BodyState; features: Record<string, unknown> }

// ── Utility functions ────────────────────────────────────────────────────────
function visibilityOk(lms: Lm[], indices: number[], threshold: number): boolean {
  return indices.every(i => (lms[i]?.visibility ?? 1) >= threshold);
}

function torsoLength(lms: Lm[]): number {
  const sy = (lms[L_SHOULDER].y + lms[R_SHOULDER].y) / 2;
  const hy = (lms[L_HIP].y + lms[R_HIP].y) / 2;
  return Math.abs(hy - sy);
}

function bodyAngle(world: Lm[]): number {
  const sx = (world[L_SHOULDER].x + world[R_SHOULDER].x) / 2;
  const sy = (world[L_SHOULDER].y + world[R_SHOULDER].y) / 2;
  const sz = (world[L_SHOULDER].z + world[R_SHOULDER].z) / 2;
  const hx = (world[L_HIP].x + world[R_HIP].x) / 2;
  const hy = (world[L_HIP].y + world[R_HIP].y) / 2;
  const hz = (world[L_HIP].z + world[R_HIP].z) / 2;
  const dx = hx - sx, dy = hy - sy, dz = hz - sz;
  return Math.abs(Math.atan2(Math.sqrt(dx * dx + dz * dz), dy) * 180 / Math.PI);
}

function angleDeg(a: Lm, b: Lm, c: Lm): number {
  const ba = [a.x - b.x, a.y - b.y];
  const bc = [c.x - b.x, c.y - b.y];
  const dot = ba[0] * bc[0] + ba[1] * bc[1];
  const n = Math.sqrt(ba[0] ** 2 + ba[1] ** 2) * Math.sqrt(bc[0] ** 2 + bc[1] ** 2);
  return n === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180 / Math.PI;
}

function linearSlope(vals: number[], fps: number): number {
  const n = vals.length;
  if (n < 2) return 0;
  const xs = vals.map((_, i) => i / fps);
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = vals.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((s, x, i) => s + x * vals[i], 0);
  const sx2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sx2 - sx * sx;
  return Math.abs(denom) < 1e-10 ? 0 : (n * sxy - sx * sy) / denom;
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

// ── FixedDeque ───────────────────────────────────────────────────────────────
class FixedDeque {
  private buf: number[] = [];
  constructor(private maxLen: number) {}
  push(v: number) { this.buf.push(v); if (this.buf.length > this.maxLen) this.buf.shift(); }
  get length() { return this.buf.length; }
  get isFull() { return this.buf.length >= this.maxLen; }
  get values() { return [...this.buf]; }
  get last() { return this.buf[this.buf.length - 1]; }
  get first() { return this.buf[0]; }
  clear() { this.buf = []; }
  max() { return this.buf.length ? Math.max(...this.buf) : -Infinity; }
  min() { return this.buf.length ? Math.min(...this.buf) : Infinity; }
}

// ── ImpactFallDetector ───────────────────────────────────────────────────────
class ImpactFallDetector {
  private angleHist: FixedDeque;
  private recovBuf: FixedDeque;
  isFallen = false;

  constructor(fps = 30) {
    this.angleHist = new FixedDeque(Math.max(2, Math.round(fps * 0.5)));
    this.recovBuf = new FixedDeque(Math.max(2, Math.round(fps * 2.0)));
  }

  detect(img: Lm[], world: Lm[]): Detection | null {
    if (!visibilityOk(img, [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP], 0.5)) return null;
    const angle = bodyAngle(world);
    this.angleHist.push(angle);

    if (this.isFallen) {
      this.recovBuf.push(angle);
      if (this.recovBuf.isFull && this.recovBuf.max() < 35) {
        this.isFallen = false; this.recovBuf.clear(); this.angleHist.clear(); return null;
      }
      return { state: 'FALLEN', features: { body_angle_deg: +angle.toFixed(1) } };
    }

    if (!this.angleHist.isFull) return null;
    const delta = this.angleHist.last - this.angleHist.first;
    if (delta > 45 && angle > 60) {
      this.isFallen = true; this.recovBuf.clear();
      return {
        state: 'IMPACT_FALL',
        features: { body_angle_deg: +angle.toFixed(1), delta_angle_500ms: +delta.toFixed(1) },
      };
    }
    return null;
  }
}

// ── SlowSlumpDetector ────────────────────────────────────────────────────────
class SlowSlumpDetector {
  private angleHist: FixedDeque;
  private holdBuf: FixedDeque;
  isSlumped = false;

  constructor(fps = 30) {
    this.angleHist = new FixedDeque(Math.max(2, Math.round(fps * 7.0)));
    this.holdBuf = new FixedDeque(Math.max(2, Math.round(fps * 2.0)));
  }

  pause() { this.angleHist.clear(); this.holdBuf.clear(); }

  detect(img: Lm[], world: Lm[]): Detection | null {
    if (!visibilityOk(img, [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP], 0.6)) return null;
    const angle = bodyAngle(world);

    if (this.isSlumped) {
      if (angle < 15) {
        this.isSlumped = false; this.angleHist.clear(); this.holdBuf.clear(); return null;
      }
      return { state: 'SLOW_SLUMP', features: { final_angle_deg: +angle.toFixed(1), status: 'sustained' } };
    }

    this.angleHist.push(angle);
    this.holdBuf.push(angle);
    if (!this.angleHist.isFull) return null;

    const vals = this.angleHist.values;
    const slope = linearSlope(vals, FPS);
    const headN = Math.min(FPS, vals.length);
    const initialAngle = vals.slice(0, headN).reduce((a, b) => a + b, 0) / headN;
    const finalAngle = vals.slice(-headN).reduce((a, b) => a + b, 0) / headN;
    const delta = finalAngle - initialAngle;

    if (slope < 2 || slope > 30) return null;
    if (delta < 18) return null;
    if (finalAngle < 25) return null;
    if (!this.holdBuf.isFull) return null;
    if (this.holdBuf.min() < 20) return null;

    this.isSlumped = true;
    return {
      state: 'SLOW_SLUMP',
      features: {
        slump_rate_deg_per_sec: +slope.toFixed(2),
        final_angle_deg: +finalAngle.toFixed(1),
        delta_angle_deg: +delta.toFixed(1),
        status: 'onset',
      },
    };
  }
}

// ── ArmDriftDetector ─────────────────────────────────────────────────────────
class ArmDriftDetector {
  // fps unused: timing uses Date.now() directly
  constructor(_fps = 30) {}
  private dstate: 'idle' | 'locking' | 'testing' = 'idle';
  private lockStartTs = 0;
  private testStartTs = 0;
  private initLeftDrop = 0;
  private initRightDrop = 0;

  get busy() { return this.dstate !== 'idle'; }

  progress(): { phase: string; elapsed: number; total: number } | null {
    const now = Date.now() / 1000;
    if (this.dstate === 'locking') return { phase: 'locking', elapsed: now - this.lockStartTs, total: 1.0 };
    if (this.dstate === 'testing') return { phase: 'testing', elapsed: now - this.testStartTs, total: 10.0 };
    return null;
  }

  private inTestPose(lms: Lm[], torso: number): boolean {
    const ls = lms[L_SHOULDER], rs = lms[R_SHOULDER];
    const le = lms[L_ELBOW], re = lms[R_ELBOW];
    const lw = lms[L_WRIST], rw = lms[R_WRIST];
    const wristHeight = Math.abs(lw.y - ls.y) < 0.18 * torso && Math.abs(rw.y - rs.y) < 0.18 * torso;
    const elbowStraight = angleDeg(ls, le, lw) > 150 && angleDeg(rs, re, rw) > 150;
    const llat = lw.x - ls.x, rlat = rw.x - rs.x;
    const lateralExt =
      Math.abs(llat) > 0.55 * torso &&
      Math.abs(rlat) > 0.55 * torso &&
      Math.sign(llat) !== Math.sign(rlat);
    return wristHeight && elbowStraight && lateralExt;
  }

  private poseDuringTest(lms: Lm[], torso: number): boolean {
    const ls = lms[L_SHOULDER], rs = lms[R_SHOULDER];
    const lw = lms[L_WRIST], rw = lms[R_WRIST];
    if ((lw.y - ls.y) < -0.05 * torso || (rw.y - rs.y) < -0.05 * torso) return false;
    const llat = lw.x - ls.x, rlat = rw.x - rs.x;
    return (
      Math.abs(llat) > 0.35 * torso &&
      Math.abs(rlat) > 0.35 * torso &&
      Math.sign(llat) !== Math.sign(rlat)
    );
  }

  detect(img: Lm[], _world: Lm[]): Detection | null {
    const req = [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST, L_HIP, R_HIP];
    if (!visibilityOk(img, req, 0.7)) { this.dstate = 'idle'; return null; }
    const torso = torsoLength(img);
    if (torso < 0.08) { this.dstate = 'idle'; return null; }

    if (this.dstate === 'testing') {
      if (!this.poseDuringTest(img, torso)) { this.dstate = 'idle'; return null; }
    } else {
      if (!this.inTestPose(img, torso)) { this.dstate = 'idle'; return null; }
    }

    const ls = img[L_SHOULDER], rs = img[R_SHOULDER];
    const lw = img[L_WRIST], rw = img[R_WRIST];
    const leftDrop = (lw.y - ls.y) / torso;
    const rightDrop = (rw.y - rs.y) / torso;
    const asym = Math.abs(leftDrop - rightDrop);
    const now = Date.now() / 1000;

    if (this.dstate === 'idle') {
      this.dstate = 'locking'; this.lockStartTs = now;
      this.initLeftDrop = leftDrop; this.initRightDrop = rightDrop;
      return null;
    }

    if (this.dstate === 'locking') {
      if (asym > 0.06) {
        this.lockStartTs = now; this.initLeftDrop = leftDrop; this.initRightDrop = rightDrop;
        return null;
      }
      if (now - this.lockStartTs < 1.0) return null;
      this.dstate = 'testing'; this.testStartTs = now;
      this.initLeftDrop = leftDrop; this.initRightDrop = rightDrop;
      return null;
    }

    const elapsed = now - this.testStartTs;
    const leftChange = leftDrop - this.initLeftDrop;
    const rightChange = rightDrop - this.initRightDrop;
    const drift = Math.abs(leftChange - rightChange);

    if (elapsed >= 3.0 && drift > 0.22) {
      const dropped = leftChange > rightChange ? 'left' : 'right';
      this.dstate = 'idle';
      return {
        state: 'ARM_DRIFT',
        features: {
          dropped_side: dropped,
          drift: +drift.toFixed(3),
          left_change: +leftChange.toFixed(3),
          right_change: +rightChange.toFixed(3),
          test_duration_sec: +elapsed.toFixed(1),
        },
      };
    }

    if (elapsed > 10.0) this.dstate = 'idle';
    return null;
  }
}

// ── PosturalAsymmetryDetector ────────────────────────────────────────────────
class PosturalAsymmetryDetector {
  private shAsymHist: FixedDeque;
  private wrAsymHist: FixedDeque;
  private htiltHist: FixedDeque;
  private shMidXHist: FixedDeque;
  private shMidYHist: FixedDeque;
  private firstSustained: number | null = null;

  constructor(fps = 30) {
    const nw = Math.max(2, Math.round(fps * 2.0));
    const nm = Math.max(2, Math.round(fps * 0.7));
    this.shAsymHist = new FixedDeque(nw);
    this.wrAsymHist = new FixedDeque(nw);
    this.htiltHist = new FixedDeque(nw);
    this.shMidXHist = new FixedDeque(nm);
    this.shMidYHist = new FixedDeque(nm);
  }

  detect(img: Lm[], _world: Lm[]): Detection | null {
    const req = [L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_HIP, R_HIP];
    if (!visibilityOk(img, req, 0.55)) { this.firstSustained = null; return null; }
    const torso = torsoLength(img);
    if (torso < 0.06) { this.firstSustained = null; return null; }

    const ls = img[L_SHOULDER], rs = img[R_SHOULDER];
    const lw = img[L_WRIST], rw = img[R_WRIST];
    const lhip = img[L_HIP], rhip = img[R_HIP];

    this.shMidXHist.push((ls.x + rs.x) / 2);
    this.shMidYHist.push((ls.y + rs.y) / 2);
    const motion = this.shMidXHist.isFull
      ? Math.sqrt(stddev(this.shMidXHist.values) ** 2 + stddev(this.shMidYHist.values) ** 2)
      : 0;

    const lHang = (lw.y - ls.y) > 0.15 * torso;
    const rHang = (rw.y - rs.y) > 0.15 * torso;
    if (!lHang || !rHang) { this.firstSustained = null; return null; }

    const shAsym = (ls.y - rs.y) / torso;
    const wrAsym = (lw.y - rw.y) / torso;

    const le = img[L_EAR], re = img[R_EAR];
    const earsVisible = (le?.visibility ?? 0) >= 0.55 && (re?.visibility ?? 0) >= 0.55;
    const htilt = earsVisible
      ? Math.atan2(re.y - le.y, re.x - le.x + 1e-6) * 180 / Math.PI
      : 0;

    this.shAsymHist.push(shAsym);
    this.wrAsymHist.push(wrAsym);
    this.htiltHist.push(htilt);

    if (motion >= 0.018 || !this.shAsymHist.isFull) { this.firstSustained = null; return null; }

    const medSh = median(this.shAsymHist.values);
    const medWr = median(this.wrAsymHist.values);
    const medTilt = median(this.htiltHist.values);
    const shOk = Math.abs(medSh) > 0.08;
    const wrOk = Math.abs(medWr) > 0.25;
    if (!shOk && !wrOk) { this.firstSustained = null; return null; }

    const sign = shOk && wrOk ? Math.sign(medSh + medWr) : shOk ? Math.sign(medSh) : Math.sign(medWr);
    const affected = sign > 0 ? 'left' : 'right';

    const now = Date.now() / 1000;
    if (this.firstSustained === null) { this.firstSustained = now; return null; }
    if (now - this.firstSustained < 2.0) return null;

    // suppress unused variable warning
    void lhip; void rhip;

    return {
      state: 'POSTURAL_ASYMMETRY',
      features: {
        affected_side: affected,
        shoulder_asym: +medSh.toFixed(3),
        wrist_asym: +medWr.toFixed(3),
        head_tilt_deg: +medTilt.toFixed(1),
        sustained_sec: +(now - this.firstSustained).toFixed(1),
        motion: +motion.toFixed(4),
      },
    };
  }
}

// ── State machine (same priority chain as Python bodycv.py) ──────────────────
interface Detectors {
  impactFall: ImpactFallDetector;
  slowSlump: SlowSlumpDetector;
  armDrift: ArmDriftDetector;
  posturalAsymmetry: PosturalAsymmetryDetector;
}

function stepState(img: Lm[], world: Lm[], dets: Detectors): Detection {
  const { impactFall, slowSlump, armDrift, posturalAsymmetry } = dets;

  if (slowSlump.isSlumped) {
    const d = slowSlump.detect(img, world);
    return d && d.state !== 'NORMAL' ? d : { state: 'NORMAL', features: {} };
  }

  if (impactFall.isFallen) {
    slowSlump.pause();
    const d = impactFall.detect(img, world);
    return d && d.state !== 'NORMAL' ? d : { state: 'NORMAL', features: {} };
  }

  for (const det of [slowSlump, impactFall, armDrift] as const) {
    const d = det.detect(img, world);
    if (d && d.state !== 'NORMAL') return d;
  }

  if (!armDrift.busy) {
    const d = posturalAsymmetry.detect(img, world);
    if (d && d.state !== 'NORMAL') return d;
  }

  return { state: 'NORMAL', features: {} };
}

// ── Canvas drawing ───────────────────────────────────────────────────────────
function drawSkeleton(ctx: CanvasRenderingContext2D, lms: Lm[], w: number, h: number) {
  const pts: Record<number, [number, number]> = {};
  lms.forEach((lm, i) => { if ((lm.visibility ?? 1) > 0.5) pts[i] = [lm.x * w, lm.y * h]; });
  ctx.strokeStyle = '#0000ff'; ctx.lineWidth = 2;
  for (const [s, e] of POSE_CONNECTIONS) {
    if (pts[s] && pts[e]) {
      ctx.beginPath(); ctx.moveTo(...pts[s]); ctx.lineTo(...pts[e]); ctx.stroke();
    }
  }
  ctx.fillStyle = '#00ff00';
  for (const [x, y] of Object.values(pts)) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawStateText(ctx: CanvasRenderingContext2D, state: BodyState, features: Record<string, unknown>) {
  const color = STATE_COLORS[state];
  ctx.font = 'bold 22px monospace'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  const label = state.replace(/_/g, ' ');
  ctx.strokeText(label, 20, 50); ctx.fillStyle = color; ctx.fillText(label, 20, 50);
  ctx.font = 'bold 13px monospace';
  let y = 75;
  for (const [k, v] of Object.entries(features)) {
    if (k === 'event_kind') continue;
    const line = `${k}: ${v}`;
    ctx.strokeText(line, 20, y); ctx.fillStyle = color; ctx.fillText(line, 20, y);
    y += 20;
  }
}

function drawAlertBorder(ctx: CanvasRenderingContext2D, state: BodyState, w: number, h: number) {
  if (state === 'NORMAL') return;
  ctx.strokeStyle = STATE_COLORS[state]; ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
}

function drawTestOverlay(ctx: CanvasRenderingContext2D, armDrift: ArmDriftDetector, w: number, h: number) {
  const prog = armDrift.progress();
  if (!prog) return;
  const { phase, elapsed, total } = prog;
  const remaining = Math.max(0, total - elapsed);
  const msg = phase === 'locking'
    ? `ARM DRIFT TEST  lock-in: ${remaining.toFixed(1)}s`
    : `ARM DRIFT TEST  time left: ${remaining.toFixed(1)}s`;
  const barCol = phase === 'locking' ? '#c8c800' : '#00c8ff';
  ctx.fillStyle = 'rgba(30,30,30,0.85)'; ctx.fillRect(0, h - 45, w, 45);
  ctx.font = 'bold 14px monospace'; ctx.lineWidth = 2; ctx.strokeStyle = '#000';
  ctx.strokeText(msg, 15, h - 20); ctx.fillStyle = barCol; ctx.fillText(msg, 15, h - 20);
  const bw = Math.round((w - 30) * Math.min(1, elapsed / total));
  ctx.fillStyle = barCol; ctx.fillRect(15, h - 12, bw, 6);
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BroadcastBodyClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorsRef = useRef<Detectors>({
    impactFall: new ImpactFallDetector(FPS),
    slowSlump: new SlowSlumpDetector(FPS),
    armDrift: new ArmDriftDetector(FPS),
    posturalAsymmetry: new PosturalAsymmetryDetector(FPS),
  });
  const lastStateRef = useRef<BodyState | null>(null);
  const lastFeaturesRef = useRef<Record<string, unknown>>({});
  const lastHeartbeatRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const supabaseRef = useRef(createClient());
  const broadcastRef = useRef(createClient().channel('body-state'));

  const [broadcasting, setBroadcasting] = useState(false);
  const [status, setStatus] = useState('대기 중');
  const [bodyState, setBodyState] = useState<BodyState>('NORMAL');

  // Init MediaPipe PoseLandmarker
  useEffect(() => {
    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    }
    init();
  }, []);

  async function postEvent(state: BodyState, features: Record<string, unknown>, eventKind: string) {
    const uid = userIdRef.current ?? '00000000-0000-0000-0000-000000000001';
    try {
      await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          timestamp: new Date().toISOString(),
          alert_type: state,
          overall_severity: SEVERITY[state],
          risk_score: RISK_SCORE[state],
          features: { ...features, event_kind: eventKind },
        }),
      });
    } catch { /* network error – ignore */ }

    if (eventKind === 'transition') {
      supabaseRef.current.from('body_events').insert({
        user_id: uid,
        state,
        severity: SEVERITY[state],
        risk_score: RISK_SCORE[state],
        features,
      }).then(({ error }) => {
        if (error) console.error('[body_events insert]', error.message, error.details);
      });
    }
  }

  async function startBroadcast() {
    setStatus('연결 중...');
    const { data: { session } } = await supabaseRef.current.auth.getSession();
    userIdRef.current = session?.user?.id ?? '00000000-0000-0000-0000-000000000001';

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = videoRef.current!;
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    broadcastRef.current.subscribe();

    // setInterval loop: works even in background tabs (RAF would throttle)
    function loop() {
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c || v.readyState < 2) return;

      const ctx = c.getContext('2d')!;
      if (c.width !== v.videoWidth) c.width = v.videoWidth;
      if (c.height !== v.videoHeight) c.height = v.videoHeight;
      ctx.drawImage(v, 0, 0);

      const timestamp = performance.now();
      if (!landmarkerRef.current) return;
      const result = landmarkerRef.current.detectForVideo(v, timestamp);

      if (result.landmarks.length > 0) {
        const imgLms = result.landmarks[0] as Lm[];
        const worldLms = result.worldLandmarks[0] as Lm[];
        const { armDrift } = detectorsRef.current;

        drawSkeleton(ctx, imgLms, c.width, c.height);
        const det = stepState(imgLms, worldLms, detectorsRef.current);
        drawStateText(ctx, det.state, det.features);
        drawAlertBorder(ctx, det.state, c.width, c.height);
        drawTestOverlay(ctx, armDrift, c.width, c.height);
        setBodyState(det.state);

        const now = Date.now() / 1000;
        if (det.state !== lastStateRef.current) {
          postEvent(det.state, det.features, 'transition');
          broadcastRef.current.send({
            type: 'broadcast', event: 'body-state',
            payload: { state: det.state, severity: SEVERITY[det.state], risk_score: RISK_SCORE[det.state] },
          });
          lastStateRef.current = det.state;
          lastFeaturesRef.current = det.features;
          lastHeartbeatRef.current = now;
        } else if (now - lastHeartbeatRef.current >= HEARTBEAT_SEC) {
          postEvent(lastStateRef.current ?? 'NORMAL', lastFeaturesRef.current, 'heartbeat');
          lastHeartbeatRef.current = now;
        }
      } else {
        const ctx2 = canvasRef.current?.getContext('2d');
        if (ctx2) {
          ctx2.font = 'bold 18px monospace'; ctx2.strokeStyle = '#000'; ctx2.lineWidth = 3;
          ctx2.strokeText('no person', 20, 50); ctx2.fillStyle = '#808080'; ctx2.fillText('no person', 20, 50);
        }
      }
    }
    intervalRef.current = setInterval(loop, 33);

    // wait for canvas to have content before Agora capture
    await new Promise(r => setTimeout(r, 300));

    try {
      const canvas = canvasRef.current!;
      const canvasStream = canvas.captureStream(30);
      const videoTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: canvasStream.getVideoTracks()[0],
      });
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      client.setClientRole('host');
      clientRef.current = client;
      await client.join(APP_ID, BODY_CHANNEL, BODY_TOKEN, null);
      await client.publish([videoTrack]);
    } catch (e) {
      console.warn('[Agora] 스트리밍 연결 실패 (CV는 정상 동작):', e);
    }

    setBroadcasting(true);
    setStatus('방송 중');
  }

  async function stopBroadcast() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const video = videoRef.current;
    if (video) {
      (video.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    await clientRef.current?.leave();
    setBroadcasting(false);
    setStatus('방송 종료');
  }

  useEffect(() => () => { stopBroadcast(); }, []);

  const stateColor = STATE_COLORS[bodyState];

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-white text-xl font-bold">📡 신체 방송 송출 (Body CV)</div>

      <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/10">
        {/* hidden video: webcam source for MediaPipe */}
        <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none" />
        {/* canvas: webcam + skeleton overlay, captured for Agora stream */}
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
        {!broadcasting && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/30 text-sm">방송 시작 후 미리보기가 표시됩니다</span>
          </div>
        )}
      </div>

      {broadcasting && (
        <div className="w-full max-w-2xl bg-white/5 rounded-2xl p-4 flex items-center gap-4">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: stateColor, boxShadow: `0 0 8px ${stateColor}` }}
          />
          <span className="text-white font-bold text-lg">{bodyState.replace(/_/g, ' ')}</span>
          <span className="text-white/40 text-sm ml-auto">
            {SEVERITY[bodyState].toUpperCase()} · {RISK_SCORE[bodyState].toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${broadcasting ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white/70 text-sm">{status}</span>
      </div>

      {!broadcasting ? (
        <button
          onClick={startBroadcast}
          className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all"
        >
          방송 시작
        </button>
      ) : (
        <button
          onClick={stopBroadcast}
          className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition-all"
        >
          방송 종료
        </button>
      )}
    </div>
  );
}
