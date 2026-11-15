let matrixInterval: ReturnType<typeof setInterval> | null = null;
let sparkleAnimationId: number | null = null;
let birdAnimationId: number | null = null;

interface SparkleParticle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  fadeSpeed: number;
  color: string;
}

interface BirdEntity {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  flapSpeed: number;
  flapState: number;
  opacity: number;
}

export function clearVisualEffects(): void {
  const circleOverlay = document.getElementById('circle-overlay');
  if (circleOverlay) {
    circleOverlay.style.display = 'none';
    circleOverlay.innerHTML = '';
  }

  if (matrixInterval) {
    clearInterval(matrixInterval);
    matrixInterval = null;
  }
  const matrixCanvas = document.getElementById('matrix-canvas');
  if (matrixCanvas) {
    matrixCanvas.style.opacity = '0';
    matrixCanvas.style.display = 'none';
  }

  if (sparkleAnimationId !== null) {
    cancelAnimationFrame(sparkleAnimationId);
    sparkleAnimationId = null;
  }
  const sparkleCanvas = document.getElementById('sparkle-canvas');
  if (sparkleCanvas) sparkleCanvas.style.display = 'none';

  if (birdAnimationId !== null) {
    cancelAnimationFrame(birdAnimationId);
    birdAnimationId = null;
  }
  const birdCanvas = document.getElementById('bird-canvas');
  if (birdCanvas) birdCanvas.style.display = 'none';
}

export function toggleCircles(): void {
  const overlay = document.getElementById('circle-overlay');
  if (!overlay) return;

  if (overlay.style.display === 'block') {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
    return;
  }

  overlay.style.display = 'block';
  overlay.innerHTML = '';

  for (let i = 0; i < 400; i++) {
    const circle = document.createElement('div');
    circle.className = i % 2 === 0 ? 'magic-circle white' : 'magic-circle blue';
    const size = Math.random() * 40 + 10;
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.left = `${Math.random() * 100}vw`;
    circle.style.top = `${Math.random() * 100}vh`;
    circle.style.animationDuration = `${Math.random() * 4 + 4}s`;
    circle.style.animationDelay = `-${Math.random() * 8}s`;
    overlay.appendChild(circle);
  }
}

export function separateCircles(): void {
  const viewportWidth = window.innerWidth;
  document.querySelectorAll<HTMLElement>('.magic-circle').forEach((circle) => {
    const rect = circle.getBoundingClientRect();
    const delay = (1 - rect.left / viewportWidth) * 1.5;
    circle.style.transitionDelay = `${delay}s`;

    if (circle.classList.contains('white')) {
      circle.style.top = `${Math.random() * 15}vh`;
    } else {
      circle.style.top = `${85 + Math.random() * 15}vh`;
    }
  });
}

export function runMatrixEffect(onComplete: (text: string, color: string) => void): void {
  const canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.style.display = 'block';
  setTimeout(() => {
    canvas.style.opacity = '1';
  }, 10);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVXYZ'.repeat(6).split('');
  const fontSize = 20;
  const columns = canvas.width / fontSize;
  const drops: number[] = [];

  for (let i = 0; i < columns; i++) {
    drops[i] = Math.random() * (canvas.height / fontSize);
  }

  if (matrixInterval) clearInterval(matrixInterval);

  const draw = () => {
    ctx.fillStyle = 'rgba(0, 0, 0, .1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < drops.length; i++) {
      const text = letters[Math.floor(Math.random() * letters.length)];
      ctx.fillStyle = '#0f0';
      ctx.font = `${fontSize}px monospace`;
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      drops[i]++;
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.95) {
        drops[i] = 0;
      }
    }
  };

  matrixInterval = setInterval(draw, 33);

  setTimeout(() => {
    if (matrixInterval) {
      clearInterval(matrixInterval);
      matrixInterval = null;
    }
    canvas.style.opacity = '0';
    onComplete('FIRMAMENT STABILIZED', '#ff0000');
    setTimeout(() => {
      canvas.style.display = 'none';
    }, 1000);
  }, 5000);
}

export function toggleSparkles(): void {
  const canvas = document.getElementById('sparkle-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  if (canvas.style.display === 'block') {
    canvas.style.display = 'none';
    if (sparkleAnimationId !== null) {
      cancelAnimationFrame(sparkleAnimationId);
      sparkleAnimationId = null;
    }
    return;
  }

  canvas.style.display = 'block';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const particles: SparkleParticle[] = [];
  const particleCount = 2000;
  const colors = ['#ffffff', '#ffd700', '#fff8dc'];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 2.5 + 0.5,
      speedY: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.8,
      opacity: Math.random(),
      fadeSpeed: Math.random() * 0.02 + 0.005,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  const animateSparkles = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      p.y += p.speedY;
      p.x += p.speedX;
      p.opacity += p.fadeSpeed;
      if (p.opacity >= 1 || p.opacity <= 0) p.fadeSpeed *= -1;

      ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
      ctx.fillStyle = p.color;

      const s = p.size * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x + s / 4, p.y - s / 4);
      ctx.lineTo(p.x + s, p.y);
      ctx.lineTo(p.x + s / 4, p.y + s / 4);
      ctx.lineTo(p.x, p.y + s);
      ctx.lineTo(p.x - s / 4, p.y + s / 4);
      ctx.lineTo(p.x - s, p.y);
      ctx.lineTo(p.x - s / 4, p.y - s / 4);
      ctx.closePath();
      ctx.fill();

      if (p.y > canvas.height + s) {
        p.y = 0 - s;
        p.x = Math.random() * canvas.width;
      }
    }
    sparkleAnimationId = requestAnimationFrame(animateSparkles);
  };

  animateSparkles();
}

export function toggleBirds(): void {
  const canvas = document.getElementById('bird-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  if (canvas.style.display === 'block') {
    canvas.style.display = 'none';
    if (birdAnimationId !== null) {
      cancelAnimationFrame(birdAnimationId);
      birdAnimationId = null;
    }
    return;
  }

  canvas.style.display = 'block';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const birds: BirdEntity[] = [];
  for (let i = 0; i < 45; i++) {
    const size = Math.random() * 4 + 1.5;
    birds.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.6,
      size,
      speedX: size * 0.6 + Math.random(),
      speedY: (Math.random() - 0.5) * 0.5,
      flapSpeed: Math.random() * 0.05 + 0.05,
      flapState: Math.random() * Math.PI * 2,
      opacity: size / 6 + 0.1,
    });
  }

  const animateBirds = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const b of birds) {
      b.x += b.speedX;
      b.y += b.speedY;
      b.flapState += b.flapSpeed;

      if (b.x > canvas.width + b.size * 10) {
        b.x = -b.size * 10;
        b.y = Math.random() * canvas.height * 0.6;
      }

      const wingY = Math.sin(b.flapState) * b.size * 1.5;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity})`;
      ctx.lineWidth = Math.max(1.5, b.size / 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(b.x - b.size * 3, b.y - wingY);
      ctx.quadraticCurveTo(b.x - b.size, b.y - wingY * 0.5, b.x, b.y);
      ctx.quadraticCurveTo(b.x + b.size, b.y - wingY * 0.5, b.x + b.size * 3, b.y - wingY);
      ctx.stroke();
    }
    birdAnimationId = requestAnimationFrame(animateBirds);
  };

  animateBirds();
}
