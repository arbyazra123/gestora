// ---------- HEALTH/ACCURACY METER ----------
// Speedometer-style gauge that shows recent performance

const HISTORY_SIZE = 20; // Track last 20 actions (hits + misses)
const hitHistory = []; // true for hit, false for miss

let canvas = null;
let ctx = null;

// Initialize the meter canvas
export function initHealthMeter() {
  canvas = document.getElementById('health-meter');
  if (!canvas) {
    console.error('Health meter canvas not found');
    return;
  }
  ctx = canvas.getContext('2d');

  // Set canvas size
  canvas.width = 200;
  canvas.height = 150;

  // Initial draw
  drawMeter();
}

// Record a hit (successful box destruction)
export function recordHit() {
  hitHistory.push(true);
  if (hitHistory.length > HISTORY_SIZE) {
    hitHistory.shift(); // Remove oldest
  }
  drawMeter();
}

// Record a miss (box passed player)
export function recordMiss() {
  hitHistory.push(false);
  if (hitHistory.length > HISTORY_SIZE) {
    hitHistory.shift(); // Remove oldest
  }
  drawMeter();
}

// Calculate current accuracy (0 to 1)
export function getAccuracy() {
  if (hitHistory.length === 0) return 1; // Start at perfect

  const hits = hitHistory.filter(h => h).length;
  return hits / hitHistory.length;
}

// Get color based on accuracy
function getColorForAccuracy(accuracy) {
  // Red (bad) -> Yellow (ok) -> Green (good)
  if (accuracy < 0.4) {
    // Red zone
    return { r: 255, g: 0, b: 0 };
  } else if (accuracy < 0.7) {
    // Red to Yellow transition
    const t = (accuracy - 0.4) / 0.3;
    return {
      r: 255,
      g: Math.floor(255 * t),
      b: 0
    };
  } else {
    // Yellow to Green transition
    const t = (accuracy - 0.7) / 0.3;
    return {
      r: Math.floor(255 * (1 - t)),
      g: 255,
      b: 0
    };
  }
}

// Draw the speedometer gauge
function drawMeter() {
  if (!ctx) return;

  const centerX = canvas.width / 2;
  const centerY = canvas.height - 20;
  const radius = 80;
  const accuracy = getAccuracy();

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw background arc (gauge outline)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
  ctx.stroke();

  // Draw colored arc based on accuracy
  const color = getColorForAccuracy(accuracy);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

  if (accuracy < 0.4) {
    // Red zone
    gradient.addColorStop(0, `rgb(255, 0, 0)`);
    gradient.addColorStop(1, `rgb(200, 0, 0)`);
  } else if (accuracy < 0.7) {
    // Yellow zone
    gradient.addColorStop(0, `rgb(255, 100, 0)`);
    gradient.addColorStop(1, `rgb(255, 200, 0)`);
  } else {
    // Green zone
    gradient.addColorStop(0, `rgb(100, 255, 0)`);
    gradient.addColorStop(1, `rgb(0, 255, 100)`);
  }

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 12;
  ctx.shadowBlur = 15;
  ctx.shadowColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
  ctx.beginPath();

  // Draw arc from left (0% = PI) to accuracy position
  const endAngle = Math.PI + (accuracy * Math.PI);
  ctx.arc(centerX, centerY, radius, Math.PI, endAngle);
  ctx.stroke();

  // Reset shadow
  ctx.shadowBlur = 0;

  // Draw needle/pointer
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(Math.PI + (accuracy * Math.PI));

  // Needle
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(radius - 15, 0);
  ctx.stroke();

  // Needle tip
  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  ctx.beginPath();
  ctx.arc(radius - 10, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Draw center circle
  ctx.fillStyle = '#1a1a2e';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw percentage text
  const percentage = Math.round(accuracy * 100);
  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${percentage}%`, centerX, centerY - 40);

  // Draw label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '12px monospace';
  ctx.fillText('ACCURACY', centerX, centerY - 60);
}

// Reset the meter
export function resetHealthMeter() {
  hitHistory.length = 0;
  if (ctx) {
    drawMeter();
  }
}
