import collections
import numpy as np
import time

class SwayAnalyzer:
    def __init__(self, fps=30, signal_window_sec=3, pattern_window_sec=60):
        self.fps = fps
        
        # ── Signal Processing Buffer (Short-term: 3s) ──
        self.sway_window = int(fps * signal_window_sec)
        self.sway_history = collections.deque(maxlen=self.sway_window)
        
        # ── Pattern Recognition Buffer (Long-term: 60s) ──
        self.pattern_window = int(fps * pattern_window_sec)
        # We store the metrics of each detection to analyze trends
        self.metrics_history = collections.deque(maxlen=self.pattern_window)
        
        # ── Thresholds ──
        self.MIN_AMPLITUDE = 0.04
        self.ARRHYTHMIA_THRESHOLD = 0.4  # Coefficient of variation for frequency
        self.ESCALATION_THRESHOLD = 0.02 # Meters per minute increase

    def update_coordinates(self, landmarks):
        """Processes new coordinates and identifies complex stroke-related patterns."""
        if not landmarks:
            return False, False, {}

        try:
            shoulder_mid_x = (landmarks[11].x + landmarks[12].x) / 2
            hip_mid_x      = (landmarks[23].x + landmarks[24].x) / 2
            self.sway_history.append(shoulder_mid_x - hip_mid_x)
        except (IndexError, AttributeError):
            return False, False, {}

        # 1. Instantaneous Analysis
        is_swaying_now, current_metrics = self._detect_instantaneous_sway()
        
        # 2. Store metrics for trend analysis (even if not currently swaying, we store 0s)
        self.metrics_history.append(current_metrics if is_swaying_now else None)
        
        # 3. Complex Pattern Analysis
        patterns = self._analyze_complex_patterns()
        
        return is_swaying_now, patterns, current_metrics

    def _detect_instantaneous_sway(self):
        if len(self.sway_history) < self.sway_window // 2:
            return False, {}

        signal = np.array(self.sway_history)
        signal = signal - np.mean(signal)

        amplitude = float(np.max(signal) - np.min(signal))
        zero_crossings = np.where(np.diff(np.sign(signal)))[0]
        crossing_rate = len(zero_crossings) / (len(signal) / float(self.fps))
        
        fft_vals = np.abs(np.fft.rfft(signal))
        freqs = np.fft.rfftfreq(len(signal), d=1.0/self.fps)
        fft_vals[0] = 0
        dominant_freq = float(freqs[np.argmax(fft_vals)])

        is_swaying = (
            amplitude >= self.MIN_AMPLITUDE and
            0.5 <= dominant_freq <= 2.5 and
            crossing_rate >= 0.8  # NEW: Require rhythmic movement (at least ~1 cycle/sec)
        )

        return bool(is_swaying), {
            "amp": amplitude,
            "freq": dominant_freq,
            "rate": crossing_rate,
            "time": time.time()
        }

    def _analyze_complex_patterns(self):
        """
        Looks for specific neurological signatures: 
        1. Arrhythmia (unstable rhythm)
        2. Escalation (worsening balance)
        """
        valid_history = [m for m in self.metrics_history if m is not None]
        
        if len(valid_history) < self.fps * 5: # Need 5s of active swaying to identify a pattern
            return {"stroke_risk": False, "type": "none"}

        # ── Pattern A: Arrhythmia (Neurological instability) ──
        # We check if the frequency of swaying is jittery/irregular
        freqs = [m['freq'] for m in valid_history]
        freq_std = np.std(freqs)
        freq_mean = np.mean(freqs)
        arrhythmia_score = freq_std / freq_mean if freq_mean > 0 else 0
        
        # ── Pattern B: Amplitude Escalation (Fatigue/Losing control) ──
        # We check if the sway amplitude is trending upwards
        amps = [m['amp'] for m in valid_history]
        x = np.arange(len(amps))
        slope, _ = np.polyfit(x, amps, 1) if len(amps) > 1 else (0, 0)
        
        is_arrhythmic = arrhythmia_score > self.ARRHYTHMIA_THRESHOLD
        is_escalating = slope > (self.ESCALATION_THRESHOLD / self.pattern_window)

        # Result Logic
        risk_detected = is_arrhythmic or is_escalating
        
        pattern_type = "stable_sway"
        if is_arrhythmic and is_escalating: pattern_type = "critical_ataxia"
        elif is_arrhythmic: pattern_type = "arrhythmic_ataxia"
        elif is_escalating: pattern_type = "escalating_instability"

        return {
            "stroke_risk": bool(risk_detected),
            "type": pattern_type,
            "arrhythmia_score": round(float(arrhythmia_score), 3),
            "slope": round(float(slope * self.fps * 60), 4) # Meters per minute increase
        }
