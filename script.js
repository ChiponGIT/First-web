// =========================
// AudioFlow Core
// =========================

let audioContext;
let audioElement;
let sourceNode;
let analyserNode;
let gainNode;
let bassFilter;
let trebleFilter;
let reverbNode;
let convolverBuffer = null;
let pannerNode;

let isPlaying = false;
let isLooping = false;
let reverbOn = false;
let spatialOn = false;

let visualizerCanvas;
let visualizerCtx;

let lyrics = []; // { time: seconds, text: string }
let currentLyricIndex = -1;

const audioFileInput = document.getElementById("audioFileInput");
const browseBtn = document.getElementById("browseBtn");
const uploadArea = document.getElementById("uploadArea");
const fileNameLabel = document.getElementById("fileName");

const playPauseBtn = document.getElementById("playPauseBtn");
const loopToggle = document.getElementById("loopToggle");
const volumeSlider = document.getElementById("volumeSlider");
const seekBar = document.getElementById("seekBar");
const currentTimeLabel = document.getElementById("currentTime");
const durationLabel = document.getElementById("duration");

const bassSlider = document.getElementById("bassSlider");
const trebleSlider = document.getElementById("trebleSlider");
const beatSlider = document.getElementById("beatSlider");
const reverbToggle = document.getElementById("reverbToggle");
const spatialToggle = document.getElementById("spatialToggle");

const lyricsInput = document.getElementById("lyricsInput");
const lyricsDisplay = document.getElementById("lyricsDisplay");
const lrcFileInput = document.getElementById("lrcFileInput");
const loadLrcBtn = document.getElementById("loadLrcBtn");

// =========================
// Init
// =========================

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function createAudioGraph() {
  ensureAudioContext();

  if (!audioElement) {
    audioElement = new Audio();
  }

  if (sourceNode) {
    sourceNode.disconnect();
  }

  sourceNode = audioContext.createMediaElementSource(audioElement);

  gainNode = audioContext.createGain();
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;

  bassFilter = audioContext.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.value = 200;

  trebleFilter = audioContext.createBiquadFilter();
  trebleFilter.type = "highshelf";
  trebleFilter.frequency.value = 3000;

  reverbNode = audioContext.createConvolver();
  pannerNode = audioContext.createPanner();
  pannerNode.panningModel = "HRTF";
  pannerNode.setPosition(0, 0, -0.5);

  // Graph: source -> bass -> treble -> gain -> analyser -> destination
  sourceNode
    .connect(bassFilter)
    .connect(trebleFilter)
    .connect(gainNode)
    .connect(analyserNode)
    .connect(audioContext.destination);

  // Reverb & spatial toggles will rewire if enabled
}

function connectReverb() {
  if (!reverbNode || !convolverBuffer) return;
  reverbNode.buffer = convolverBuffer;

  sourceNode.disconnect();
  sourceNode
    .connect(bassFilter)
    .connect(trebleFilter)
    .connect(gainNode)
    .connect(analyserNode)
    .connect(audioContext.destination);

  // Simple parallel reverb send
  const reverbSend = audioContext.createGain();
  reverbSend.gain.value = 0.4;
  sourceNode.connect(reverbSend).connect(reverbNode).connect(audioContext.destination);
}

function disconnectReverb() {
  if (!reverbNode) return;
  createAudioGraph();
}

function connectSpatial() {
  if (!pannerNode) return;
  gainNode.disconnect();
  gainNode.connect(pannerNode).connect(analyserNode).connect(audioContext.destination);
}

function disconnectSpatial() {
  if (!pannerNode) return;
  gainNode.disconnect();
  gainNode.connect(analyserNode).connect(audioContext.destination);
}

// Simple impulse response for reverb (short noise burst)
function generateImpulseResponse() {
  ensureAudioContext();
  const length = audioContext.sampleRate * 1.5;
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
  for (let c = 0; c < 2; c++) {
    const channelData = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }
  convolverBuffer = impulse;
}

// =========================
// File loading
// =========================

browseBtn.addEventListener("click", () => audioFileInput.click());

audioFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    loadAudioFile(file);
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove("drag-over");
  });
});

uploadArea.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("audio/")) {
    loadAudioFile(file);
  }
});

function loadAudioFile(file) {
  ensureAudioContext();
  createAudioGraph();
  generateImpulseResponse();

  const url = URL.createObjectURL(file);
  audioElement.src = url;
  audioElement.load();

  fileNameLabel.textContent = file.name;
  audioElement.onloadedmetadata = () => {
    durationLabel.textContent = formatTime(audioElement.duration);
    seekBar.value = 0;
    fadeInAudio();
  };
}

// =========================
// Playback controls
// =========================

playPauseBtn.addEventListener("click", () => {
  if (!audioElement) return;
  if (!audioContext) ensureAudioContext();

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (audioElement.paused) {
    audioElement.play();
    isPlaying = true;
    playPauseBtn.textContent = "⏸";
  } else {
    audioElement.pause();
    isPlaying = false;
    playPauseBtn.textContent = "▶";
  }
});

loopToggle.addEventListener("click", () => {
  if (!audioElement) return;
  isLooping = !isLooping;
  audioElement.loop = isLooping;
  loopToggle.textContent = `Loop: ${isLooping ? "On" : "Off"}`;
});

volumeSlider.addEventListener("input", () => {
  if (!gainNode) return;
  gainNode.gain.value = parseFloat(volumeSlider.value);
});

seekBar.addEventListener("input", () => {
  if (!audioElement || !audioElement.duration) return;
  const pct = parseFloat(seekBar.value) / 100;
  audioElement.currentTime = audioElement.duration * pct;
});

function updateTime() {
  if (!audioElement) return;
  currentTimeLabel.textContent = formatTime(audioElement.currentTime || 0);
  if (audioElement.duration) {
    const pct = (audioElement.currentTime / audioElement.duration) * 100;
    seekBar.value = pct;
  }
  requestAnimationFrame(updateTime);
}

requestAnimationFrame(updateTime);

function fadeInAudio() {
  if (!gainNode) return;
  gainNode.gain.cancelScheduledValues(audioContext.currentTime);
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(parseFloat(volumeSlider.value), audioContext.currentTime + 1.2);
}

// =========================
// Visualizer
// =========================

visualizerCanvas = document.getElementById("visualizer");
visualizerCtx = visualizerCanvas.getContext("2d");

function resizeCanvas() {
  visualizerCanvas.width = visualizerCanvas.clientWidth * window.devicePixelRatio;
  visualizerCanvas.height = visualizerCanvas.clientHeight * window.devicePixelRatio;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  if (!analyserNode) {
    visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    return;
  }

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;
  visualizerCtx.clearRect(0, 0, width, height);

  const barCount = 80;
  const step = Math.floor(bufferLength / barCount);
  const beatIntensity = parseFloat(beatSlider.value);

  for (let i = 0; i < barCount; i++) {
    const value = dataArray[i * step] || 0;
    const pct = value / 255;
    const barHeight = pct * height * 0.7 * beatIntensity;

    const x = (i / barCount) * width;
    const barWidth = (width / barCount) * 0.7;

    const gradient = visualizerCtx.createLinearGradient(x, height, x, height - barHeight);
    gradient.addColorStop(0, "rgba(10,10,30,0)");
    gradient.addColorStop(0.3, "rgba(91,141,255,0.4)");
    gradient.addColorStop(1, "rgba(255,79,216,0.9)");

    visualizerCtx.fillStyle = gradient;
    visualizerCtx.fillRect(x, height - barHeight, barWidth, barHeight);
  }
}

drawVisualizer();

// =========================
// Sound controls
// =========================

bassSlider.addEventListener("input", () => {
  if (!bassFilter) return;
  bassFilter.gain.value = parseFloat(bassSlider.value);
});

trebleSlider.addEventListener("input", () => {
  if (!trebleFilter) return;
  trebleFilter.gain.value = parseFloat(trebleSlider.value);
});

beatSlider.addEventListener("input", () => {
  // visualizer uses this directly
});

reverbToggle.addEventListener("click", () => {
  reverbOn = !reverbOn;
  reverbToggle.textContent = `Reverb: ${reverbOn ? "On" : "Off"}`;
  if (reverbOn) {
    connectReverb();
  } else {
    disconnectReverb();
  }
});

spatialToggle.addEventListener("click", () => {
  spatialOn = !spatialOn;
  spatialToggle.textContent = `3D: ${spatialOn ? "On" : "Off"}`;
  if (spatialOn) {
    connectSpatial();
  } else {
    disconnectSpatial();
  }
});

// =========================
// Lyrics handling
// =========================

lyricsInput.addEventListener("input", () => {
  parseLyrics(lyricsInput.value);
  renderLyrics();
});

loadLrcBtn.addEventListener("click", () => lrcFileInput.click());

lrcFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    lyricsInput.value = reader.result;
    parseLyrics(reader.result);
    renderLyrics();
  };
  reader.readAsText(file);
});

function parseLyrics(text) {
  lyrics = [];
  const lines = text.split(/\r?\n/);
  const timeRegex = /

\[(\d{2}):(\d{2})(?:\.(\d{2}))?\]

/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (!match) continue;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3], 10) : 0;
    const time = min * 60 + sec + ms / 100;

    const textPart = line.replace(timeRegex, "").trim();
    if (textPart) {
      lyrics.push({ time, text: textPart });
    }
  }

  lyrics.sort((a, b) => a.time - b.time);
}

function renderLyrics() {
  lyricsDisplay.innerHTML = "";
  currentLyricIndex = -1;
  lyrics.forEach((line, index) => {
    const div = document.createElement("div");
    div.className = "lyric-line";
    div.dataset.index = index;
    div.textContent = line.text;
    lyricsDisplay.appendChild(div);
  });
}

function updateLyricsHighlight() {
  if (!audioElement || !lyrics.length) {
    requestAnimationFrame(updateLyricsHighlight);
    return;
  }

  const currentTime = audioElement.currentTime;
  let newIndex = -1;

  for (let i = 0; i < lyrics.length; i++) {
    if (currentTime >= lyrics[i].time) {
      newIndex = i;
    } else {
      break;
    }
  }

  if (newIndex !== currentLyricIndex) {
    currentLyricIndex = newIndex;
    const lines = lyricsDisplay.querySelectorAll(".lyric-line");
    lines.forEach((line) => line.classList.remove("active"));
    if (currentLyricIndex >= 0 && lines[currentLyricIndex]) {
      const activeLine = lines[currentLyricIndex];
      activeLine.classList.add("active");

      const offsetTop = activeLine.offsetTop - lyricsDisplay.clientHeight / 2 + activeLine.clientHeight / 2;
      lyricsDisplay.scrollTo({
        top: offsetTop,
        behavior: "smooth",
      });
    }
  }

  requestAnimationFrame(updateLyricsHighlight);
}

requestAnimationFrame(updateLyricsHighlight);

// =========================
// Helpers
// =========================

function formatTime(sec) {
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

