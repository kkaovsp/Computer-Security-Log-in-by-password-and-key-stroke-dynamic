
# Principles to Detect Typing Style (Keystroke Dynamics)

This document explains **in detail** the principles used to detect and verify a user's typing style in this project.

---

## Overview

Keystroke dynamics authentication relies on **timing characteristics** of how users type on a keyboard.  
Every person types with a slightly different rhythm — how fast they press and release keys and how long they pause between them.

This project enhances password login by also verifying the **style of typing** (how the user types their password), not only the password text itself.

---

## 1. Data Collected During Typing

When typing, the system records two key timing features:

| Feature | Description | Example |
|----------|--------------|----------|
| **Dwell Time** | How long a key is held down (time between keydown → keyup) | e.g., key 'A' held for 100 ms |
| **Flight Time (Latency)** | The time between releasing one key and pressing the next | e.g., between 'A' and 'B' = 60 ms |

Together, these form a *typing signature* that represents how the user normally types their password.

---

## 2. Registration Phase (Enrollment)

During registration, the user types their password **three times**.

For each attempt, the system collects:
- `latencies`: list of time gaps between consecutive keys
- `dwell`: list of hold times per key

Then, it calculates:
- **Mean (μ)** of each feature
- **Standard Deviation (σ)** of each feature

Example:
```json
{
  "mean_latencies": [80, 70, 90],
  "std_latencies": [5, 6, 4],
  "mean_dwell": [120, 115, 130],
  "std_dwell": [8, 6, 7]
}
```

These values are stored in the database table `typing_patterns`.

---

## 3. Login Phase (Verification)

When the user logs in again:

1. The password text is verified as usual.
2. The system re-measures the typing pattern of this new attempt.
3. The new typing data (`latencies`, `dwell`) are compared with the stored mean and std.

The system calculates **Z-scores** for each position:

\( Z_i = \frac{|Sample_i - Mean_i|}{Std_i} \)

Each `Z_i` shows how different the new typing is from the user's normal pattern.

Then the **average Z-score** is computed:

\( AverageZ = \frac{1}{n} \sum_i Z_i \)

---

## 4. Decision Principle (Threshold)

If the `AverageZ` ≤ **Threshold (1.75)**  
→ The typing style is similar enough → **Login Accepted** ✅

If the `AverageZ` > 1.75  
→ The typing style differs too much → **Login Rejected** ❌

This threshold defines the tolerance level.  
Lower = stricter (more false rejections).  
Higher = looser (more false acceptances).

Example output:
```json
{
  "ok": true,
  "score": 1.42,
  "threshold": 1.75,
  "message": "Login success (password + typing style matched)."
}
```

---

## 🧮 5. Why This Works (Core Principle)

Each user’s typing timing pattern is **statistically unique**.  
By learning the average behavior and variability (mean + std), the system can recognize whether a new attempt fits within the normal range.

This principle is called **Statistical Keystroke Dynamics Verification**.

---

## 6. Principle Classification Summary

| Category | Type | Description |
|-----------|------|--------------|
| **Verification Mode** | Static | Checked only at login time |
| **Features Used** | Dwell, Latency | Captured during password typing |
| **Method** | Statistical Analysis (Z-Score) | Compare new pattern to stored mean/std |
| **Decision Model** | Threshold-Based | Accept if deviation ≤ 1.75 |

---

## 7. Flow Summary

```
User Registers → System captures timing (3x)
       ↓
Compute Mean & Std → Save to DB
       ↓
User Logs In → Capture timing again
       ↓
Compute Z-Scores & Average
       ↓
Compare with Threshold (1.75)
       ↓
Accept / Reject
```

---

## 8. Advantages & Limitations

| Aspect | Explanation |
|---------|--------------|
| ✅ **Advantages** | No extra hardware, enhances password security, unique per user |
| ⚠️ **Limitations** | Timing can change if user is tired, stressed, or on another keyboard |
| 💪 **Improvements** | Adaptive threshold, continuous learning, or ML-based classifiers |

---

## In Short (Summary for Reports)

> The system authenticates a user by analyzing their *typing behavior* using timing metrics (dwell and flight time). By applying a **statistical Z-score method**, the system checks if a new login’s typing rhythm matches the stored pattern. If the average deviation is within the defined threshold (1.75), the login is accepted as genuine.


## Login by Password + Keystroke Dynamics (SQLite) — Mahidol Style

Mahidol University–styled login/register UI with **password + typing style** authentication.  
Background image is embedded locally and the app runs fully offline (except npm install).

## Quick Start
```bash
npm install
npm start
# open
http://localhost:3000
```

- Register → type the same password 3 times (captures latency + dwell).
- Login → password must match AND your typing style must be within the threshold.

## Files
```
frontend/
  assets/bg.jpg      # Embedded Mahidol background
  index.html         # Mahidol-like login page (link to Register)
  styles.css         # Simple, clean UI
  app.js             # Keystroke capture + API calls
server.js            # Express + SQLite + bcrypt
package.json
```

## Notes
- Threshold default = 1.75 (edit in DB row if you want to tune).
- Delete `users.db` to reset.
- Passwords are hashed with bcryptjs.
