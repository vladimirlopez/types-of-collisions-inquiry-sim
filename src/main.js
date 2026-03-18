const $ = (id) => document.getElementById(id);

const trackCanvas = $("trackCanvas");
const graphCanvas = $("graphCanvas");
const statusLine = $("statusLine");
const scoreLine = $("scoreLine");
const metricsPanel = $("metricsPanel");
const feedback = $("feedback");
const probeReadout = $("probeReadout");

const modeSelect = $("collisionMode");
const activityMode = $("activityMode");
const themeToggleBtn = $("themeToggleBtn");
const restitutionInput = $("restitution");
const restitutionValue = $("restitutionValue");
const mass1Input = $("mass1");
const mass1Value = $("mass1Value");
const mass2Input = $("mass2");
const mass2Value = $("mass2Value");
const velocity1Input = $("velocity1");
const velocity1Value = $("velocity1Value");
const velocity2Input = $("velocity2");
const velocity2Value = $("velocity2Value");
const frictionInput = $("friction");
const frictionValue = $("frictionValue");
const showDetails = $("showDetails");

const runBtn = $("runBtn");
const pauseBtn = $("pauseBtn");
const resetBtn = $("resetBtn");
const checkBtn = $("checkBtn");
const newChallengeBtn = $("newChallengeBtn");

const momentumGuess = $("momentumGuess");
const energyGuess = $("energyGuess");
const gameCollisionGuess = $("gameCollisionGuess");

const scenarioButtons = document.querySelectorAll("[data-preset]");

const CONTAINER_PAD = { left: 58, right: 26, top: 16, bottom: 26 };
const TRACK_Y = 0.5;
const TRACK_CENTER = 0.44;
const TRACK_START_M = 0.4;
const TRACK_LENGTH_M = 8.6;
const CART_WIDTH_M = 0.62;
const CART_HEIGHT_M = 0.32;
const MAX_TIME = 5;
const RESULT_TOLERANCE_PERCENT = 10;
const STOP_SPEED = 0.002;
const EXPLOSION_GAP_M = 0.03;
const EXPLOSION_RELEASE_DELAY = 0.6;

const presets = {
  full: { m1: 1.0, m2: 0.9, v1: 1.1, v2: -0.25, e: 0 },
  partial: { m1: 0.8, m2: 1.2, v1: 1.3, v2: 0.1, e: 0.4 },
  perfect: { m1: 0.9, m2: 1.1, v1: 1.2, v2: -0.55, e: 1 },
  explosion: { m1: 1.0, m2: 1.05, v1: 0.0, v2: 0.0, e: 0.65 },
};

const state = {
  running: false,
  paused: false,
  animationId: null,
  time: 0,
  lastTs: 0,
  config: null,
  x1: 0,
  x2: 0,
  v1: 0,
  v2: 0,
  m1: 0,
  m2: 0,
  e: 0,
  collided: false,
  done: false,
  impactSnapshot: null,
  finalSnapshot: null,
  initialSnapshot: null,
  trail: [],
  results: null,
  trial: 0,
  graphProbe: null,
  showGraphInfo: true,
  activity: "inquiry",
  challenge: null,
  game: {
    total: 0,
    correct: 0,
  },
  releasePending: false,
  releaseAt: EXPLOSION_RELEASE_DELAY,
};

const tCtx = trackCanvas.getContext("2d");
const gCtx = graphCanvas.getContext("2d");

setupInputs();
resizeCanvas(trackCanvas, 1200, 280);
resizeCanvas(graphCanvas, 1200, 240);
restoreSession();
setActivityMode(activityMode.value);
resetTrial();

window.addEventListener("resize", () => {
  resizeCanvas(trackCanvas, 1200, 280);
  resizeCanvas(graphCanvas, 1200, 240);
  render();
});

modeSelect.addEventListener("change", syncControlState);
activityMode.addEventListener("change", () => setActivityMode(activityMode.value));
themeToggleBtn.addEventListener("click", toggleTheme);
runBtn.addEventListener("click", startTrial);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", resetTrial);
checkBtn.addEventListener("click", evaluateInference);
newChallengeBtn.addEventListener("click", generateChallenge);
showDetails.addEventListener("change", applyHideDetails);
scenarioButtons.forEach((btn) => {
  btn.addEventListener("click", () => loadPreset(btn.dataset.preset));
});

graphCanvas.addEventListener("click", handleGraphClick);
graphCanvas.addEventListener("mousemove", handleGraphHover);
graphCanvas.addEventListener("mouseleave", handleGraphLeave);

function setupInputs() {
  const numberInputs = [
    [restitutionInput, restitutionValue, formatNumber],
    [mass1Input, mass1Value, formatNumber],
    [mass2Input, mass2Value, formatNumber],
    [velocity1Input, velocity1Value, formatNumber],
    [velocity2Input, velocity2Value, formatNumber],
    [frictionInput, frictionValue, (value) => Number(value).toFixed(3)],
  ];

  numberInputs.forEach(([input, output, formatter]) => {
    input.addEventListener("input", () => {
      if (input === velocity1Input && modeSelect.value === "explosion") {
        velocity2Input.value = velocity1Input.value;
        velocity2Value.value = formatter(Number(velocity1Input.value));
      }
      output.value = formatter(Number(input.value));
      syncControlState();
    });
  });
}

function restoreSession() {
  const savedTheme = localStorage.getItem("collision-theme") || "dark";
  persistTheme(savedTheme);

  const savedMode = localStorage.getItem("collision-activity") || "inquiry";
  activityMode.value = savedMode;

  state.showGraphInfo = localStorage.getItem("collision-show-data") !== "0";
  showDetails.checked = state.showGraphInfo;
  applyHideDetails();
}

function persistTheme(value) {
  localStorage.setItem("collision-theme", value);
  document.body.dataset.theme = value;
  themeToggleBtn.textContent = value === "light" ? "Dark mode" : "Light mode";
  render();
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
  persistTheme(nextTheme);
}

function setActivityMode(mode) {
  state.activity = mode;
  localStorage.setItem("collision-activity", mode);
  document.body.classList.toggle("test-mode", mode === "test");

  const inGame = mode === "test";
  if (inGame) {
    if (!state.challenge) {
      generateChallenge();
    }
    statusLine.textContent = "Test-your-knowledge mode. Launch the challenge and make a prediction.";
  } else {
    statusLine.textContent = "Set up a trial and click Run.";
  }

  resetTrial();
  updateMetricCards();
}

function syncControlState() {
  const mode = modeSelect.value;
  if (mode === "full") {
    restitutionInput.disabled = true;
    restitutionInput.value = 0;
  } else if (mode === "perfect") {
    restitutionInput.disabled = true;
    restitutionInput.value = 1;
  } else {
    restitutionInput.disabled = false;
  }

  if (mode === "explosion") {
    velocity2Input.disabled = true;
    velocity2Input.value = velocity1Input.value;
    velocity2Value.value = formatNumber(Number(velocity1Input.value));
  } else {
    velocity2Input.disabled = false;
  }

  restitutionValue.value = mode === "full" || mode === "perfect" ? formatNumber(Number(restitutionInput.value)) : formatNumber(Number(restitutionInput.value));
}

function setSliderValues(config) {
  mass1Input.value = String(config.m1);
  mass2Input.value = String(config.m2);
  velocity1Input.value = String(config.v1);
  velocity2Input.value = String(config.v2);
  restitutionInput.value = String(config.e);
  mass1Value.value = formatNumber(config.m1);
  mass2Value.value = formatNumber(config.m2);
  velocity1Value.value = formatNumber(config.v1);
  velocity2Value.value = formatNumber(config.v2);
  restitutionValue.value = formatNumber(config.e);
  syncControlState();
}

function loadPreset(type) {
  const preset = presets[type];
  if (!preset) return;

  modeSelect.value = type;
  if (type === "explosion") {
    activityMode.value = "inquiry";
    setActivityMode("inquiry");
  }
  setSliderValues(preset);
  frictionInput.value = "0.00";
  frictionValue.value = "0.000";
  state.challenge = null;
  resetTrial();
  statusLine.textContent = "Preset loaded. Run this trial and compare initial and final conservation.";
}

function generateChallenge() {
  const types = ["full", "partial", "perfect", "explosion"];
  const type = types[Math.floor(Math.random() * types.length)];

  const m1 = randRange(0.45, 1.7, 0.05);
  const m2 = randRange(0.45, 1.7, 0.05);

  let v1;
  let v2;
  let e;

  if (type === "full") {
    e = 0;
    v1 = randRange(0.4, 1.9, 0.05) * (Math.random() < 0.7 ? 1 : -1);
    v2 = randRange(-1.1, 0.2, 0.05);
  } else if (type === "partial") {
    e = randRange(0.15, 0.8, 0.05);
    v1 = randRange(0.2, 2.0, 0.05);
    v2 = randRange(-1.2, 0.4, 0.05);
  } else if (type === "perfect") {
    e = 1;
    v1 = randRange(0.25, 2.0, 0.05);
    v2 = randRange(-1.0, 0.6, 0.05);
  } else {
    e = randRange(0.25, 0.8, 0.05);
    v1 = randRange(-0.6, 0.6, 0.05);
    v2 = v1;
  }

  state.challenge = {
    type,
    m1,
    m2,
    v1,
    v2,
    e,
  };

  modeSelect.value = type;
  setSliderValues(state.challenge);
  state.showGraphInfo = true;
  showDetails.checked = true;
  applyHideDetails();
  statusLine.textContent = "Challenge created. Run it and make your predictions.";
  syncControlState();
  resetTrial();
}

function applyHideDetails() {
  state.showGraphInfo = showDetails.checked;
  localStorage.setItem("collision-show-data", state.showGraphInfo ? "1" : "0");
  document.body.classList.toggle("hide-details", !state.showGraphInfo);
  render();
}

function randRange(min, max, step) {
  const raw = Math.random() * (max - min) + min;
  if (!step) return Number(raw.toFixed(3));
  return Number((Math.round(raw / step) * step).toFixed(3));
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function resizeCanvas(canvas, baseWidth, baseHeight) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : baseWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(baseHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getConfig() {
  const mode = modeSelect.value;
  const restitution =
    mode === "perfect" ? 1 : mode === "full" ? 0 : Number(restitutionInput.value);
  return {
    mode,
    restitution,
    m1: Number(mass1Input.value),
    m2: Number(mass2Input.value),
    v1: Number(velocity1Input.value),
    v2: Number(velocity2Input.value),
    friction: Number(frictionInput.value),
  };
}

function startTrial() {
  if (state.activity === "test" && !state.challenge) {
    generateChallenge();
  }

  if (state.activity === "test" && state.challenge) {
    modeSelect.value = state.challenge.type;
    setSliderValues(state.challenge);
  }

  state.trial += 1;
  state.config = getConfig();
  state.time = 0;
  state.collided = false;
  state.done = false;
  state.running = true;
  state.paused = false;
  state.x1 = TRACK_START_M + (TRACK_LENGTH_M * 0.3);
  state.x2 = TRACK_START_M + TRACK_LENGTH_M - 0.25 - CART_WIDTH_M;

  if (state.config.mode === "explosion") {
    const center = TRACK_START_M + TRACK_LENGTH_M * 0.48;
    state.x1 = center - CART_WIDTH_M - EXPLOSION_GAP_M * 0.5;
    state.x2 = center + EXPLOSION_GAP_M * 0.5;
  }

  state.m1 = state.config.m1;
  state.m2 = state.config.m2;
  state.v1 = state.config.v1;
  state.v2 = state.config.v2;
  state.e = state.config.restitution;

  if (state.config.mode === "explosion") {
    const sharedVelocity = totalMomentum(state.v1, state.v2, state.m1, state.m2) / (state.m1 + state.m2);
    state.v1 = sharedVelocity;
    state.v2 = sharedVelocity;
  }

  state.lastTs = performance.now();
  state.trail = [];
  state.impactSnapshot = null;
  state.finalSnapshot = null;
  state.results = null;
  state.graphProbe = null;
  state.releasePending = state.config.mode === "explosion";
  state.releaseAt = EXPLOSION_RELEASE_DELAY;
  feedback.textContent = "";
  scoreLine.textContent = "";

  state.initialSnapshot = makeSnapshot(0, state.v1, state.v2, state.m1, state.m2);
  state.trail.push({
    t: 0,
    v1: state.v1,
    v2: state.v2,
    x1: state.x1,
    x2: state.x2,
    collided: false,
  });

  updateMetricCards();

  statusLine.textContent = `Trial ${state.trial}: running. ${state.config.mode === "explosion" ? "Watch the carts before the release event." : "Watch carts interact."}`;
  runBtn.textContent = state.activity === "test" ? "Run New Trial" : "Run Trial";

  if (state.animationId) cancelAnimationFrame(state.animationId);
  state.animationId = requestAnimationFrame(tick);
}

function togglePause() {
  if (!state.running) {
    statusLine.textContent = "Nothing to pause. Start a trial first.";
    return;
  }

  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  statusLine.textContent = state.paused ? "Trial paused." : "Trial resumed.";
  if (!state.paused && !state.done) {
    state.lastTs = performance.now();
    state.animationId = requestAnimationFrame(tick);
  }
}

function resetTrial() {
  if (state.animationId) cancelAnimationFrame(state.animationId);
  state.running = false;
  state.paused = false;
  state.done = true;
  state.trail = [];
  state.collided = false;
  state.trial += 1;
  state.config = getConfig();
  state.m1 = Number(mass1Input.value);
  state.m2 = Number(mass2Input.value);
  state.v1 = Number(velocity1Input.value);
  state.v2 = Number(velocity2Input.value);

  if (state.config.mode === "explosion") {
    const sharedVelocity = totalMomentum(state.v1, state.v2, state.m1, state.m2) / (state.m1 + state.m2);
    state.v1 = sharedVelocity;
    state.v2 = sharedVelocity;
  }

  state.x1 = TRACK_START_M + (TRACK_LENGTH_M * 0.3);
  state.x2 = TRACK_START_M + TRACK_LENGTH_M - 0.25 - CART_WIDTH_M;

  if (state.config.mode === "explosion") {
    const center = TRACK_START_M + TRACK_LENGTH_M * 0.48;
    state.x1 = center - CART_WIDTH_M - EXPLOSION_GAP_M * 0.5;
    state.x2 = center + EXPLOSION_GAP_M * 0.5;
  }

  state.initialSnapshot = makeSnapshot(0, state.v1, state.v2, state.m1, state.m2);
  state.impactSnapshot = null;
  state.finalSnapshot = null;
  state.results = null;
  state.graphProbe = null;
  state.time = 0;
  state.releasePending = state.config.mode === "explosion";
  state.releaseAt = EXPLOSION_RELEASE_DELAY;
  feedback.textContent = "";

  if (state.activity === "test") {
    statusLine.textContent = "Challenge ready. Press Run Trial.";
    runBtn.textContent = "Run Challenge";
  } else {
    statusLine.textContent = "Reset complete. Configure values and run again.";
    runBtn.textContent = "Run Trial";
  }

  pauseBtn.textContent = "Pause";
  applyHideDetails();
  render();
  updateMetricCards();
}

function tick(ts) {
  if (state.paused || state.done) return;

  const dt = Math.min((ts - state.lastTs) / 1000, 0.04);
  state.lastTs = ts;
  state.time += dt;

  const oldV1 = state.v1;
  const oldV2 = state.v2;

  state.x1 += state.v1 * dt;
  state.x2 += state.v2 * dt;

  const leftEdge1 = state.x1;
  const rightEdge1 = state.x1 + CART_WIDTH_M;
  const leftEdge2 = state.x2;

  if (!state.collided && state.config.mode !== "explosion" && oldV1 > oldV2 && rightEdge1 >= leftEdge2) {
    applyCollision(oldV1, oldV2);
    state.collided = true;
    state.x1 = Math.min(state.x1, state.x2 - CART_WIDTH_M);
  }

  if (state.config.mode === "explosion" && state.releasePending && state.time >= state.releaseAt) {
    applyCollision(oldV1, oldV2);
    state.collided = true;
    state.releasePending = false;
  }

  if (state.running && !state.config) {
    state.config = getConfig();
  }

  if (state.config?.mode && (state.config.mode !== "explosion" || !state.releasePending)) {
    applyRollingFriction(dt);
  }

  if (state.collided && state.config.mode === "full") {
    // A fully inelastic collision should keep both carts locked together.
    const sharedVelocity = 0.5 * (state.v1 + state.v2);
    state.v1 = sharedVelocity;
    state.v2 = sharedVelocity;
    state.x2 = state.x1 + CART_WIDTH_M;
  }

  state.trail.push({
    t: state.time,
    v1: state.v1,
    v2: state.v2,
    x1: state.x1,
    x2: state.x2,
    collided: state.collided,
  });

  if (state.trail.length > 750) state.trail.shift();

  const allAtRest = Math.abs(state.v1) < STOP_SPEED && Math.abs(state.v2) < STOP_SPEED;

  if (state.time >= getMaxTrialTime() || (state.collided && allAtRest)) {
    if (state.config.mode === "explosion") {
      finishTrial("Explosion complete.");
    } else {
      finishTrial();
    }
    return;
  }

  render();
  if (!state.done) {
    state.animationId = requestAnimationFrame(tick);
  }
}

function getMaxTrialTime() {
  return state.config?.mode === "explosion" ? 3.2 : MAX_TIME;
}

function applyCollision(preV1, preV2) {
  const preKE = totalKinetic(maybeStateM1(), maybeStateM2(), preV1, preV2);
  const preMomentum = totalMomentum(preV1, preV2, maybeStateM1(), maybeStateM2());
  const m1 = state.m1;
  const m2 = state.m2;
  const e = state.e;
  let v1f;
  let v2f;

  if (state.config.mode === "explosion") {
    const p = preMomentum;
    const vcm = p / (m1 + m2);
    const keCm = 0.5 * (m1 + m2) * vcm * vcm;
    // Explosion mode injects internal energy even if the carts start at rest.
    const addedEnergy = 0.18 + 0.9 * Math.max(0, Math.min(1, e));
    const targetKE = Math.max(preKE + addedEnergy, keCm + addedEnergy);
    const dSquared = Math.max(0, (2 * (targetKE - keCm)) / (1 / m1 + 1 / m2));
    const d = Math.sqrt(dSquared);

    v1f = vcm - d / m1;
    v2f = vcm + d / m2;
  } else {
    v1f = ((m1 - e * m2) / (m1 + m2)) * preV1 + (((1 + e) * m2) / (m1 + m2)) * preV2;
    v2f = (((1 + e) * m1) / (m1 + m2)) * preV1 + ((m2 - e * m1) / (m1 + m2)) * preV2;
  }

  state.v1 = limitVelocity(v1f);
  state.v2 = limitVelocity(v2f);
  state.impactSnapshot = {
    time: state.time,
    p: preMomentum,
    ke: preKE,
    cart1: { mass: m1, velocity: preV1 },
    cart2: { mass: m2, velocity: preV2 },
  };

  statusLine.textContent = `Impact at t=${state.time.toFixed(2)} s. Final velocities applied using mode = ${readableMode(state.config.mode)}.`;
}

function limitVelocity(v) {
  const limit = 4.6;
  return Math.max(-limit, Math.min(limit, v));
}

function applyRollingFriction(dt) {
  state.v1 = decayVelocity(state.v1, state.config.friction, dt);
  state.v2 = decayVelocity(state.v2, state.config.friction, dt);

  if (Math.abs(state.v1) < STOP_SPEED) state.v1 = 0;
  if (Math.abs(state.v2) < STOP_SPEED) state.v2 = 0;
}

function decayVelocity(v, friction, dt) {
  return v - Math.sign(v) * Math.min(Math.abs(v), friction * dt);
}

function finishTrial(reason = "") {
  state.done = true;
  state.running = false;

  const finalV1 = state.v1;
  const finalV2 = state.v2;
  state.finalSnapshot = makeSnapshot(state.time, finalV1, finalV2, state.m1, state.m2);

  if (state.impactSnapshot) {
    state.results = evaluateConservation(state.initialSnapshot, state.finalSnapshot);
  } else {
    state.results = {
      momentum: null,
      energy: null,
      momentumConserved: false,
      energyConserved: false,
      noCollision: true,
      message: reason || "No collision was detected.",
    };
  }

  if (reason) {
    statusLine.textContent = reason;
  } else {
    statusLine.textContent = "Trial complete. Analyze results and run Check My Conclusions.";
  }

  if (state.activity === "test" && state.challenge) {
    statusLine.textContent += ` | Challenge mode: ${state.challenge.type.toUpperCase()}`;
  }

  updateMetricCards();
  render();
}

function evaluateConservation(initial, final) {
  const momentumDelta = percentDifference(final.p, initial.p);
  const energyDelta = percentDifference(final.ke, initial.ke);
  return {
    momentum: momentumDelta,
    energy: energyDelta,
    momentumConserved: Math.abs(momentumDelta) <= RESULT_TOLERANCE_PERCENT,
    energyConserved: Math.abs(energyDelta) <= RESULT_TOLERANCE_PERCENT,
    noCollision: false,
    message: "",
  };
}

function evaluateInference() {
  if (!state.finalSnapshot || !state.results) {
    feedback.textContent = "Run a trial first so results can be checked.";
    feedback.className = "hint error";
    return;
  }

  if (state.results.noCollision) {
    feedback.textContent = "No collision occurred. Try reversing one velocity or create a challenge.";
    feedback.className = "hint error";
    return;
  }

  if (state.activity === "test") {
    const collisionCorrect = classifyCollision(state.challenge?.type);
    const userCollision = gameCollisionGuess.value;

    const actualConservationMomentum = state.results.momentumConserved;
    const actualConservationEnergy = classifyEnergyState(state.results.energy, state.results.energyConserved);

    const predictedMomentum = momentumGuess.value === "conserved";
    const predictedEnergy = mapEnergyGuess(energyGuess.value);

    const correctMomentum = predictedMomentum === actualConservationMomentum;
    const correctEnergy = predictedEnergy === actualConservationEnergy;
    const correctCollision = userCollision === collisionCorrect;

    const correctCount = Number(correctMomentum) + Number(correctEnergy) + Number(correctCollision);
    state.game.total += 1;
    if (correctCount === 3) {
      state.game.correct += 1;
    }

    const percent = Math.round((state.game.correct / state.game.total) * 100);
    scoreLine.textContent = `Test score: ${state.game.correct}/${state.game.total} (${percent}%)`;

    if (correctCount === 3) {
      feedback.textContent = `Perfect. You identified ${readableMode(state.challenge?.type || state.config.mode)} and the conservation behavior.`;
      feedback.className = "hint success";
    } else {
      feedback.className = "hint error";
      const parts = [];
      if (!correctCollision) {
        parts.push(`Collision type was ${readableMode(state.challenge?.type || state.config.mode)}.`);
      }
      if (!correctMomentum) {
        parts.push(
          `Momentum was ${state.results.momentumConserved ? "conserved" : "not conserved"}, but your answer was ${momentumGuess.options[momentumGuess.selectedIndex].text}`
        );
      }
      if (!correctEnergy) {
        parts.push(
          `Kinetic energy was ${state.results.energyConserved ? "conserved" : (state.results.energy > 0 ? "increased" : "decreased")}, but your answer was ${energyGuess.options[energyGuess.selectedIndex].text}`
        );
      }
      feedback.textContent = `Review: ${parts.join(" ")}`;
    }

    statusLine.textContent = `Challenge complete. ${correctCount}/3 answers correct.`;
    return;
  }

  const momentumOk = state.results.momentumConserved;
  const energyOk = classifyEnergyState(state.results.energy, state.results.energyConserved);
  const guessedMomentum = momentumGuess.value === "conserved";
  const guessedEnergy = mapEnergyGuess(energyGuess.value);
  const goodMomentum = guessedMomentum === momentumOk;
  const goodEnergy =
    energyOk === "conserved"
      ? guessedEnergy === "conserved"
      : guessedEnergy === "not-conserved" || guessedEnergy === energyOk;

  if (goodMomentum && goodEnergy) {
    feedback.textContent = "Great. Your conclusions match the observed behavior.";
    feedback.className = "hint success";
    return;
  }

  const msgs = [];
  if (!goodMomentum) {
    const observed = momentumOk ? "Conserved" : "Not conserved";
    msgs.push(`Momentum: observed ${observed}, your choice was ${momentumGuess.options[momentumGuess.selectedIndex].text}.`);
  }
  if (!goodEnergy) {
    const observed = energyOk;
    msgs.push(`Kinetic energy: observed ${observed}, your choice was ${energyGuess.options[energyGuess.selectedIndex].text}.`);
  }
  feedback.textContent = msgs.join(" ");
  feedback.className = "hint error";
}

function mapEnergyGuess(guess) {
  if (guess === "conserved" || guess === "decreased" || guess === "increased") {
    return guess;
  }
  return "not-conserved";
}

function classifyCollision(type) {
  if (type === "full") return "full";
  if (type === "perfect") return "perfect";
  if (type === "explosion") return "explosion";
  return "partial";
}

function readableMode(mode) {
  if (mode === "full") return "Fully Inelastic";
  if (mode === "perfect") return "Perfectly Elastic";
  if (mode === "explosion") return "Explosion";
  return "Partially Inelastic";
}

function classifyEnergyState(deltaK, conserved) {
  if (conserved) return "conserved";
  if (deltaK === null || !Number.isFinite(deltaK)) return "not-conserved";
  return deltaK > 0 ? "increased" : "decreased";
}

function maybeStateM1() {
  return state.m1 || Number(mass1Input.value);
}

function maybeStateM2() {
  return state.m2 || Number(mass2Input.value);
}

function makeSnapshot(time, v1, v2, m1, m2) {
  return {
    t: time,
    v1,
    v2,
    p1: m1 * v1,
    p2: m2 * v2,
    p: totalMomentum(v1, v2, m1, m2),
    ke1: kineticPart(m1, v1),
    ke2: kineticPart(m2, v2),
    ke: totalKinetic(m1, m2, v1, v2),
  };
}

function totalMomentum(v1, v2, m1, m2) {
  return m1 * v1 + m2 * v2;
}

function kineticPart(m, v) {
  return 0.5 * m * v * v;
}

function totalKinetic(m1, m2, v1, v2) {
  return kineticPart(m1, v1) + kineticPart(m2, v2);
}

function percentDifference(finalVal, initialVal) {
  if (!Number.isFinite(initialVal) || Math.abs(initialVal) < 1e-9) return null;
  return ((finalVal - initialVal) / initialVal) * 100;
}

function formatPercent(value) {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)} %`;
}

function metricRow(label, value) {
  return `<div class="metric-line"><span>${label}</span><span>${value}</span></div>`;
}

function updateMetricCards() {
  const cfg = getConfig();
  const initial = state.initialSnapshot;
  const impact = state.impactSnapshot;
  const final = state.finalSnapshot;

  const cards = [];

  cards.push(`
    <article class="metric-card">
      <h3>Trial setup</h3>
      ${metricRow("Collision type", readableMode(cfg.mode))}
      ${metricRow("Mass (kg): cart A, cart B", `${formatNumber(cfg.m1)}, ${formatNumber(cfg.m2)}`)}
      ${metricRow("Initial velocity (m/s): A, B", `${formatNumber(cfg.v1)}, ${formatNumber(cfg.v2)}`)}
    </article>
  `);

  cards.push(`
    <article class="metric-card">
      <h3>Initial state</h3>
      ${metricRow("Cart A momentum", initial ? `${formatNumber(initial.p1)} kg·m/s` : "Waiting")}
      ${metricRow("Cart B momentum", initial ? `${formatNumber(initial.p2)} kg·m/s` : "Waiting")}
      ${metricRow("Total momentum", initial ? `${formatNumber(initial.p)} kg·m/s` : "Waiting")}
      ${metricRow("Total KE", initial ? `${formatNumber(initial.ke)} J` : "Waiting")}
    </article>
  `);

  cards.push(`
    <article class="metric-card">
      <h3>Impact state</h3>
      ${metricRow("Cart A vx", impact ? `${formatNumber(impact.cart1.velocity)} m/s` : "n/a")}
      ${metricRow("Cart B vx", impact ? `${formatNumber(impact.cart2.velocity)} m/s` : "n/a")}
      ${metricRow("Total momentum", impact ? `${formatNumber(impact.p)} kg·m/s` : "n/a")}
      ${metricRow("Total KE", impact ? `${formatNumber(impact.ke)} J` : "n/a")}
      ${metricRow("Impact time", impact ? `${impact.time.toFixed(2)} s` : "n/a")}
    </article>
  `);

  cards.push(`
    <article class="metric-card">
      <h3>Final state</h3>
      ${metricRow("Cart A velocity", final ? `${formatNumber(final.v1)} m/s` : `${formatNumber(state.v1)} m/s`)}
      ${metricRow("Cart B velocity", final ? `${formatNumber(final.v2)} m/s` : `${formatNumber(state.v2)} m/s`)}
      ${metricRow("Total momentum", final ? `${formatNumber(final.p)} kg·m/s` : `${formatNumber(momentum(state.v1, state.v2))} kg·m/s`)}
      ${metricRow("Total KE", final ? `${formatNumber(final.ke)} J` : `${formatNumber(totalKinetic(state.m1, state.m2, state.v1, state.v2))} J`)}
    </article>
  `);

  let conservLine = `<article class="metric-card"><h3>Conservation diagnostics</h3>`;
  if (state.results && !state.results.noCollision) {
    const momentumClass = state.results.momentumConserved ? "metric-ok" : "metric-bad";
    const energyClass = state.results.energyConserved ? "metric-ok" : "metric-bad";
    conservLine += metricRow(
      "Δp (initial to final)",
      `<span class="${momentumClass}">${formatPercent(state.results.momentum)}</span>`
    );
    conservLine += metricRow(
      "ΔK (initial to final)",
      `<span class="${energyClass}">${formatPercent(state.results.energy)}</span>`
    );
    conservLine += metricRow(
      "Momentum assessment",
      `<span class="${momentumClass}">${state.results.momentumConserved ? "Conserved" : "Not conserved"}</span>`
    );
    conservLine += metricRow(
      "Kinetic energy assessment",
      `<span class="${energyClass}">${state.results.energyConserved ? "Conserved" : "Not conserved"}</span>`
    );
  } else {
    conservLine += metricRow("Status", `<span class="metric-warn">${state.results ? state.results.message : "Run a trial to compute values."}</span>`);
  }
  conservLine += "</article>";

  cards.push(conservLine);

  metricsPanel.innerHTML = cards.join("");
}

function momentum(v1, v2) {
  return maybeStateM1() * v1 + maybeStateM2() * v2;
}

function handleGraphHover(event) {
  updateGraphProbeFromPointer(event);
}

function handleGraphClick(event) {
  updateGraphProbeFromPointer(event);
  render();
}

function handleGraphLeave() {
  if (state.trail.length) {
    const latest = state.trail[state.trail.length - 1];
    setGraphProbe(latest);
  }
  render();
}

function updateGraphProbeFromPointer(event) {
  if (!state.trail.length || !state.showGraphInfo) {
    if (!state.showGraphInfo) {
      probeReadout.textContent = "Graph readout hidden. Enable detailed readouts to use click-to-read.";
    } else {
      probeReadout.textContent = "Run a trial to gather graph data.";
    }
    return;
  }

  const rect = graphCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const trail = state.trail;
  if (!trail.length) return;

  const xDomain = Math.max(0.01, trail[trail.length - 1]?.t || 1);
  const left = CONTAINER_PAD.left;
  const right = rect.width - CONTAINER_PAD.right;
  const innerW = right - left;
  const tClicked = ((x - left) / innerW) * xDomain;

  const tClamped = Math.max(0, Math.min(xDomain, tClicked));
  let best = trail[0];
  let bestDist = Math.abs(best.t - tClamped);

  for (let i = 1; i < trail.length; i += 1) {
    const d = Math.abs(trail[i].t - tClamped);
    if (d < bestDist) {
      bestDist = d;
      best = trail[i];
    }
  }

  setGraphProbe(best, left, innerW, xDomain);
}

function setGraphProbe(sample, left = CONTAINER_PAD.left, innerW = null, xDomain = null) {
  const domain = xDomain ?? Math.max(0.01, state.trail[state.trail.length - 1]?.t || 1);
  const graphWidth = innerW ?? Math.max(1, graphCanvas.getBoundingClientRect().width - CONTAINER_PAD.left - CONTAINER_PAD.right);
  state.graphProbe = {
    t: sample.t,
    v1: sample.v1,
    v2: sample.v2,
    x: left + (sample.t / domain) * graphWidth,
  };
  if (state.showGraphInfo) {
    const pNow = totalMomentum(sample.v1, sample.v2, state.m1, state.m2);
    const keNow = totalKinetic(state.m1, state.m2, sample.v1, sample.v2);
    const dp = percentDifference(pNow, state.initialSnapshot.p);
    const dKE = percentDifference(keNow, state.initialSnapshot.ke);
    probeReadout.textContent = `Graph probe\nTime: ${sample.t.toFixed(2)} s\nvA: ${formatNumber(sample.v1)} m/s, vB: ${formatNumber(sample.v2)} m/s\nTotal p: ${formatNumber(pNow)} kg·m/s\nTotal K: ${formatNumber(keNow)} J\nΔp: ${formatPercent(dp)} | ΔK: ${formatPercent(dKE)}`;
  }
}

function render() {
  renderTrack();
  renderGraph();
  updateMetricCards();
  updateProbeVisibility();
}

function updateProbeVisibility() {
  if (state.showGraphInfo && state.graphProbe) {
    probeReadout.classList.remove("hidden-details");
  } else {
    probeReadout.classList.toggle("hidden-details", true);
  }
  if (!state.showGraphInfo) {
    probeReadout.textContent = "Detailed readouts are hidden.";
  } else if (state.graphProbe) {
    probeReadout.classList.remove("hidden-details");
  } else if (state.trail.length) {
    const latest = state.trail[state.trail.length - 1];
    probeReadout.textContent = `Live graph readout\nCart A velocity: ${formatNumber(latest.v1)} m/s\nCart B velocity: ${formatNumber(latest.v2)} m/s\nHover or click on the graph to inspect any earlier time.`;
    probeReadout.classList.remove("hidden-details");
  } else {
    probeReadout.textContent = "Live graph readout\nCart A velocity: 0.00 m/s\nCart B velocity: 0.00 m/s\nHover or click on the velocity graph after you run a trial.";
    probeReadout.classList.remove("hidden-details");
  }
}

function getThemePalette() {
  if (bodyHasMode("light")) {
    return {
      trackTop: "#7586a6",
      trackMid: "#5c6d8d",
      trackBottom: "#3f4d67",
      rail: "#d9bc7e",
      tick: "rgba(245, 249, 255, 0.18)",
      overlay: "#123140",
      overlayMuted: "#4b6570",
      cartA: "#e3c96a",
      cartB: "#8ec7ff",
      labelInk: "#102433",
      wheel: "#2b3446",
      wheelRim: "#d9ba70",
      arrow: "#1d2f46",
      graphBg: "#f7fbff",
      graphAxis: "#c5d7df",
      graphGrid: "rgba(18, 49, 64, 0.08)",
      graphText: "#8090a8",
      graphProbeBg: "#e7f0f5",
      graphProbeText: "#16364a",
      lineA: "#c69827",
      lineB: "#88b8ff",
    };
  }

  return {
    trackTop: "#3a4558",
    trackMid: "#262f3e",
    trackBottom: "#1a1f2d",
    rail: "rgba(232, 201, 136, 0.7)",
    tick: "rgba(232, 201, 136, 0.25)",
    overlay: "#f1dc9d",
    overlayMuted: "#c9d1df",
    cartA: "#b78e36",
    cartB: "#5a8dd6",
    labelInk: "#161b24",
    wheel: "#1a1c26",
    wheelRim: "#ecddad",
    arrow: "#e5cc8f",
    graphBg: "#0f1420",
    graphAxis: "rgba(216, 183, 103, 0.35)",
    graphGrid: "rgba(201, 214, 236, 0.12)",
    graphText: "#96a0ba",
    graphProbeBg: "#2a2f40",
    graphProbeText: "#f3e8bf",
    lineA: "#d8b767",
    lineB: "#a8c9ff",
  };
}

function renderTrack() {
  const ctx = tCtx;
  const rect = trackCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const trackY = height * TRACK_Y;
  const topY = height * TRACK_CENTER - 44;
  const bottomY = height * TRACK_CENTER + 44;
  const leftX = CONTAINER_PAD.left;
  const rightX = width - CONTAINER_PAD.right;
  const usableWidth = rightX - leftX;
  const yCenter = height * TRACK_CENTER;
  const palette = getThemePalette();

  const toPixelX = (x) => leftX + ((x - TRACK_START_M) / TRACK_LENGTH_M) * usableWidth;

  const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
  grad.addColorStop(0, palette.trackTop);
  grad.addColorStop(0.5, palette.trackMid);
  grad.addColorStop(1, palette.trackBottom);
  ctx.fillStyle = grad;
  roundRect(ctx, leftX, topY, usableWidth, 88, 8);
  ctx.fill();

  ctx.strokeStyle = palette.rail;
  ctx.beginPath();
  ctx.moveTo(leftX, trackY);
  ctx.lineTo(rightX, trackY);
  ctx.stroke();

  for (let i = 0; i <= 20; i += 1) {
    const x = leftX + (usableWidth * i) / 20;
    ctx.globalAlpha = i % 4 === 0 ? 0.5 : 0.25;
    ctx.beginPath();
    ctx.strokeStyle = palette.tick;
    ctx.moveTo(x, topY + 2);
    ctx.lineTo(x, bottomY - 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const cartHeightPx = height * 0.14;
  drawCart(
    ctx,
    toPixelX(state.x1),
    yCenter,
    toPixelX(state.x1 + CART_WIDTH_M),
    cartHeightPx,
    "A",
    state.v1,
    palette.cartA,
    palette
  );
  drawCart(
    ctx,
    toPixelX(state.x2),
    yCenter,
    toPixelX(state.x2 + CART_WIDTH_M),
    cartHeightPx,
    "B",
    state.v2,
    palette.cartB,
    palette
  );

  if (state.impactSnapshot) {
    const impactX = toPixelX(TRACK_START_M + TRACK_LENGTH_M * 0.48);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(impactX, topY + 5);
    ctx.lineTo(impactX, bottomY - 5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = palette.overlay;
  ctx.font = "14px 'Inter', 'IBM Plex Sans', sans-serif";
  ctx.fillText(`mode: ${readableMode(state.config?.mode || modeSelect.value)} | e = ${(state.config?.restitution ?? Number(restitutionInput.value)).toFixed(2)} | trial: ${state.trial}`, leftX, 22);
  ctx.fillStyle = palette.overlayMuted;
  ctx.fillText(`xA=${formatNumber(state.x1)} m   xB=${formatNumber(state.x2)} m`, leftX + 300, 22);

  if (state.config?.mode === "explosion" && state.showGraphInfo) {
    ctx.fillText("Explosion mode: carts launch together at impact time", leftX, height - 6);
  }
}

function drawCart(ctx, xLeft, top, xRight, h, label, v, color, palette) {
  const w = xRight - xLeft;
  const y = top - h;

  const cartGrad = ctx.createLinearGradient(xLeft, top - h, xLeft, top);
  cartGrad.addColorStop(0, shadeColor(color, 35));
  cartGrad.addColorStop(1, shadeColor(color, -25));
  ctx.fillStyle = cartGrad;
  roundRect(ctx, xLeft, y, w, h, 7);
  ctx.fill();

  const wheelR = Math.max(8, h * 0.22);
  const cy = top + 2;
  for (let i = 0; i < 2; i += 1) {
    const cx = xLeft + (i === 0 ? 10 : w - 10);
    ctx.beginPath();
    ctx.fillStyle = palette.wheel;
    ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = palette.wheelRim;
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, wheelR * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = palette.labelInk;
  ctx.font = "bold 14px 'Inter', 'IBM Plex Sans', sans-serif";
  ctx.fillText(`Cart ${label}`, xLeft + 8, y + h * 0.7);

  const arrowY = y - 6;
  const centerX = xLeft + w * 0.45;
  const arrowLen = Math.max(-50, Math.min(50, v * 35));
  ctx.strokeStyle = palette.arrow;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(centerX, arrowY);
  ctx.lineTo(centerX + arrowLen, arrowY);
  ctx.stroke();
  if (arrowLen > 0) drawArrowHead(ctx, centerX + arrowLen, arrowY, 1, palette.arrow);
  if (arrowLen < 0) drawArrowHead(ctx, centerX + arrowLen, arrowY, -1, palette.arrow);
}

function drawArrowHead(ctx, x, y, dir, color) {
  const size = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dir * size, y - size * 0.8);
  ctx.lineTo(x - dir * size, y + size * 0.8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function renderGraph() {
  const ctx = gCtx;
  const rect = graphCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const left = CONTAINER_PAD.left;
  const right = width - CONTAINER_PAD.right;
  const top = 18;
  const bottom = height - 24;
  const innerW = right - left;
  const innerH = bottom - top;
  const palette = getThemePalette();

  ctx.fillStyle = palette.graphBg;
  ctx.fillRect(0, 0, width, height);

  const samples = state.trail;
  const allY = [
    ...samples.map((s) => Math.abs(s.v1)),
    ...samples.map((s) => Math.abs(s.v2)),
  ];
  const yDomain = Math.max(1, ...allY);
  const xDomain = Math.max(0.1, ...samples.map((s) => s.t));

  ctx.strokeStyle = palette.graphAxis;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  for (let i = 0; i <= 5; i += 1) {
    const x = left + (innerW * i) / 5;
    const t = (xDomain * i) / 5;
    ctx.fillStyle = palette.graphText;
    ctx.font = "12px 'Inter', 'IBM Plex Sans', sans-serif";
    ctx.fillText(`${t.toFixed(1)} s`, x - 8, bottom + 16);
    ctx.beginPath();
    ctx.strokeStyle = palette.graphGrid;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  for (let i = 0; i <= 6; i += 1) {
    const y = top + (innerH * i) / 6;
    const v = (yDomain - (2 * yDomain * i) / 6).toFixed(1);
    ctx.fillStyle = palette.graphText;
    ctx.fillText(`${v}`, 6, y + 3);
    ctx.beginPath();
    ctx.strokeStyle = Math.abs(Number(v)) < 0.05 ? palette.graphAxis : palette.graphGrid;
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  if (samples.length < 2) {
    ctx.fillStyle = "#c7d0df";
    ctx.font = "14px 'Inter', 'IBM Plex Sans', sans-serif";
    ctx.fillText("Run a trial to generate a velocity-time trace.", left, 80);
    return;
  }

  drawLine(samples, "v1", palette.lineA, xDomain, yDomain, left, right, top, bottom);
  drawLine(samples, "v2", palette.lineB, xDomain, yDomain, left, right, top, bottom);

  if (state.impactSnapshot) {
    const impactX = left + (state.impactSnapshot.time / xDomain) * innerW;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(impactX, top);
    ctx.lineTo(impactX, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.graphProbe && state.showGraphInfo) {
    const x = Math.max(left, Math.min(right, state.graphProbe.x));
    const y1 = toGraphY(state.graphProbe.v1, xDomain, yDomain, left, right, top, bottom);
    const y2 = toGraphY(state.graphProbe.v2, xDomain, yDomain, left, right, top, bottom);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.fillStyle = palette.graphProbeBg;
    ctx.fillRect(x + 6, y1 - 10, 74, 20);
    ctx.fillStyle = palette.graphProbeText;
    ctx.font = "11px 'Inter', 'IBM Plex Sans', sans-serif";
    ctx.fillText(`vA ${formatNumber(state.graphProbe.v1)}`, x + 10, y1 + 4);

    ctx.fillStyle = palette.graphProbeBg;
    ctx.fillRect(x + 6, y2 + 6, 74, 20);
    ctx.fillStyle = palette.graphProbeText;
    ctx.fillText(`vB ${formatNumber(state.graphProbe.v2)}`, x + 10, y2 + 20);
    ctx.setLineDash([]);
  }

  const latest = samples[samples.length - 1];
  const legendY = 16;
  ctx.fillStyle = palette.lineA;
  ctx.fillText(`Cart A ${formatNumber(latest.v1)} m/s`, left + 6, legendY);
  ctx.fillStyle = palette.lineB;
  ctx.fillText(`Cart B ${formatNumber(latest.v2)} m/s`, left + 210, legendY);

  const latestX = right - 96;
  const latestY1 = toGraphY(latest.v1, xDomain, yDomain, left, right, top, bottom);
  const latestY2 = toGraphY(latest.v2, xDomain, yDomain, left, right, top, bottom);
  ctx.fillStyle = palette.graphProbeBg;
  ctx.fillRect(latestX, latestY1 - 10, 88, 20);
  ctx.fillRect(latestX, latestY2 + 6, 88, 20);
  ctx.fillStyle = palette.graphProbeText;
  ctx.fillText(`A ${formatNumber(latest.v1)} m/s`, latestX + 6, latestY1 + 4);
  ctx.fillText(`B ${formatNumber(latest.v2)} m/s`, latestX + 6, latestY2 + 20);
}

function toGraphY(v, xDomain, yDomain, left, right, top, bottom) {
  const innerH = bottom - top;
  const normalized = (v + yDomain) / (2 * yDomain);
  return bottom - normalized * innerH;
}

function drawLine(samples, key, color, xDomain, yDomain, left, right, top, bottom) {
  const innerW = right - left;
  const innerH = bottom - top;
  const toX = (t) => left + (t / xDomain) * innerW;
  const toY = (v) => bottom - ((v + yDomain) / (2 * yDomain)) * innerH;

  gCtx.strokeStyle = color;
  gCtx.lineWidth = 2.2;
  gCtx.beginPath();
  samples.forEach((point, idx) => {
    const x = toX(point.t);
    const y = toY(point[key]);
    if (idx === 0) gCtx.moveTo(x, y);
    else gCtx.lineTo(x, y);
  });
  gCtx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  const minRadius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + minRadius, y);
  ctx.arcTo(x + w, y, x + w, y + h, minRadius);
  ctx.arcTo(x + w, y + h, x, y + h, minRadius);
  ctx.arcTo(x, y + h, x, y, minRadius);
  ctx.arcTo(x, y, x + w, y, minRadius);
  ctx.closePath();
}

function shadeColor(hex, percent) {
  const num = Number.parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `rgb(${R}, ${G}, ${B})`;
}

function bodyHasMode(mode) {
  return document.body.dataset.theme === mode;
}
