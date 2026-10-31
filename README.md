# SpaceGuard AI

Space domain awareness and orbital threat monitoring: an interactive web prototype that shows how satellite surveillance, orbital collision-risk assessment and decision support can work together in one dashboard.

> **Scope note.** This version uses **simulated orbital data** and **rule-based** risk and anomaly logic. It is not a trained AI threat-detection model and not an operational defence system.

## Modules

1. **Orbital Surveillance Explorer** – 3D view of 247 simulated satellites, defunct craft, rocket bodies and debris. Filter by class and orbit regime, click an object to inspect altitude, speed, perigee/apogee, inclination and period.
2. **Collision Risk Predictor** – screens a 6–24 h window for close approaches, refines the time of closest approach, estimates collision probability, rates risk red/amber/green against configurable thresholds, and compares avoidance manoeuvres (direction, delta-v, propellant).
3. **Space Defence Decision Centre** – eight simulated anomaly events with adjustable telemetry. A transparent rule set classifies the likely cause, confidence and severity, and seven response strategies are ranked with adjustable weights.

## Run it

No build step and no dependencies. Either open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

An internet connection is only needed for the Google Fonts; the page works without it using fallback fonts.

## Tests

```bash
node tests/engine.test.js
```

Checks the orbit maths (state/element round trip, energy conservation), the deterministic catalogue, a known conjunction, a manoeuvre outcome and the anomaly classifier.

## Project layout

```
index.html        page structure
css/style.css     theme tokens (dark and light) and layout
js/engine.js      orbital maths, conjunction search, risk, anomaly rules, response scoring
js/app.js         user interface, 3D canvas, plots, tables
tests/            engine tests (Node)
```

## How it works

- **Propagation:** two-body Keplerian motion; Kepler's equation solved by Newton iteration.
- **Conjunctions:** separation sampled every 20 s, each local minimum refined with golden-section search.
- **Collision probability:** simplified isotropic Gaussian model, `Pc ≈ (R² / 2σ²) · exp(−d² / 2σ²)`.
- **Manoeuvres:** impulsive delta-v in the radial / along-track / cross-track frame, converted back to orbital elements and re-screened. Propellant from the rocket equation (500 kg craft, Isp 220 s).
- **Anomalies:** 17 weighted rules over 9 telemetry values score 6 causes; confidence comes from the margin over the runner-up.
- **Responses:** weighted multi-criteria scoring over effectiveness, cost, side-effect risk, speed and reversibility.

## Known limits

No J2, drag or solar radiation pressure; one isotropic uncertainty value instead of full covariance; spherical Earth; anomalies are scripted.

## Roadmap

- Load real TLE data from CelesTrak and propagate with SGP4
- 2D encounter-plane probability integral using covariance from conjunction data messages
- Add J2 and drag perturbations
- Train and benchmark an anomaly classifier on labelled telemetry
- Constellation-level avoidance planning

## Licence

MIT, see `LICENSE`.
