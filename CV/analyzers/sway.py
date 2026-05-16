import collections
import numpy as np
import time

class SwayAnalyzer:
    def __init__(self, fps=30, signal_window_sec=3, pattern_window_sec=30):
        # ── Signal Processing Properties (Short-term) ──
        self.fps = fps
        self.sway_window = int(fps * signal_window_sec)
        self.sway_history = collections.deque(maxlen=self.sway_window)
        
        # ── Pattern Recognition Properties (Long-term) ──
        # Tracks the status of 'is_swaying' over a longer period (e.g., 30 seconds)
        self.pattern_window = int(fps * pattern_window_sec)
        self.detection_history = collections.deque(maxlen=self.pattern_window)
        
        # Thresholds for stroke-like pattern detection
        self.MIN_PATTERN_DENSITY = 0.3  # If swaying is detected 30% of the time in the window
        self.MIN_DURATION_CONFIRM = 5.0 # Minimum seconds of cumulative swaying to trigger alert

    def update_coordinates(self, landmarks):
        """Processes new coordinates and returns current status and long-term pattern alert."""
        if not landmarks:
            return False, False, {}

        # Calculate horizontal displacement between shoulders and hips
        # landmarks[11] = L_SHOULDER, [12] = R_SHOULDER, [23] = L_HIP, [24] = R_HIP
        try:
            shoulder_mid_x = (landmarks[11].x + landmarks[12].x) / 2
            hip_mid_x      = (landmarks[23].x + landmarks[24].x) / 2
            self.sway_history.append(shoulder_mid_x - hip_mid_x)
        except (IndexError, AttributeError):
            return False, False, {}

        # 1. Instantaneous Analysis
        is_swaying_now, metrics = self._detect_instantaneous_sway()
        
        # 2. Accumulate for Pattern Recognition
        self.detection_history.append(1 if is_swaying_now else 0)
        
        # 3. Pattern Alert Logic
        pattern_alert = self._analyze_temporal_pattern()
        
        return is_swaying_now, pattern_alert, metrics

    def _detect_instantaneous_sway(self):
        if len(self.sway_history) < self.sway_window // 2:
            return False, {}

        signal = np.array(self.sway_history)
        signal = signal - np.mean(signal)  # Detrend

        amplitude_m = float(np.max(signal) - np.min(signal))
        zero_crossings = np.where(np.diff(np.sign(signal)))[0]
        crossing_rate = len(zero_crossings) / (len(signal) / float(self.fps))
        
        # Frequency Analysis
        fft_vals = np.abs(np.fft.rfft(signal))
        freqs = np.fft.rfftfreq(len(signal), d=1.0/self.fps)
        fft_vals[0] = 0  # Suppress DC
        dominant_freq = float(freqs[np.argmax(fft_vals)])

        # Criteria for "Swaying"
        is_swaying = (
            amplitude_m >= 0.05 and
            0.8 <= crossing_rate <= 4.0 and
            0.3 <= dominant_freq <= 2.0
        )

        return bool(is_swaying), {
            "sway_amplitude_m": round(amplitude_m, 4),
            "sway_freq_hz": round(dominant_freq, 3),
            "sway_crossing_rate": round(float(crossing_rate), 3),
        }

    def _analyze_temporal_pattern(self):
        """
        Analyzes the sequence of detections to identify persistent or recurring 
        swaying patterns that match clinical stroke symptoms.
        """
        if len(self.detection_history) < self.fps * 10: # Need at least 10s of data
            return False

        # Calculate density (percentage of time swaying was detected in the window)
        sway_density = sum(self.detection_history) / len(self.detection_history)
        
        # Calculate cumulative duration in seconds
        total_sway_time = sum(self.detection_history) / float(self.fps)

        # Trigger alert if the pattern is persistent (density) or sustained (duration)
        # Stroke-related ataxia/sway is often continuous rather than a single trip.
        if sway_density >= self.MIN_PATTERN_DENSITY and total_sway_time >= self.MIN_DURATION_CONFIRM:
            return True
            
        return False
