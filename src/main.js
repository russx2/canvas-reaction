import './style.css';

const WIDTH = 620;
const HEIGHT = 400;
const BALL_COUNT = 60;
const REQUIRED_HITS = 54;
const FRAME_MS = 1000 / 30;
const BALL_RADIUS = 5;
const COLLIDED_RADIUS = 40;
const COLLIDED_LIFETIME = 35;
const COLLISION_SOUND_URL = '/sfx/collide.ogg';

const BallState = {
  Moving: 'moving',
  Collided: 'collided',
  Expanding: 'expanding',
  Shrinking: 'shrinking',
};

class Ball {
  constructor(radius, screenWidth, screenHeight) {
    this.x = randomInt(radius, screenWidth - radius);
    this.y = randomInt(radius, screenHeight - radius);
    this.dx = (randomInt(12, 20) / 10) * randomSign();
    this.dy = (randomInt(12, 20) / 10) * randomSign();
    this.colour = randomHexColour();
    this.radius = radius;
    this.lifetime = COLLIDED_LIFETIME;
    this.generation = 0;
    this.score = null;
    this.state = BallState.Moving;
    this.audio = createAudio();
  }

  playSound() {
    if (!this.audio) {
      return;
    }

    this.audio.currentTime = 0;
    this.audio.play().catch(() => {
      // Browsers can reject playback until the user has interacted with the page.
    });
  }
}

class Game {
  constructor(canvas) {
    this.canvasScreen = canvas;
    this.canvasBuffer = document.createElement('canvas');
    this.canvasBuffer.width = WIDTH;
    this.canvasBuffer.height = HEIGHT;
    this.canvasCtxScreen = this.canvasScreen.getContext('2d');
    this.canvasCtxBuffer = this.canvasBuffer.getContext('2d');
    this.animationFrame = null;
    this.lastFrameTime = 0;
    this.accumulator = 0;

    this.canvasScreen.addEventListener('click', (event) => this.handleClick(event));
    this.reset();
    this.animationFrame = requestAnimationFrame((time) => this.tick(time));
  }

  reset() {
    this.isReacting = false;
    this.isGameOver = false;
    this.score = 0;
    this.numAcquired = 0;
    this.numRequired = REQUIRED_HITS;
    this.aBalls = Array.from(
      { length: BALL_COUNT },
      () => new Ball(BALL_RADIUS, WIDTH, HEIGHT),
    );
    this.aCollided = [];
  }

  tick(time) {
    if (!this.lastFrameTime) {
      this.lastFrameTime = time;
    }

    this.accumulator += time - this.lastFrameTime;
    this.lastFrameTime = time;

    while (this.accumulator >= FRAME_MS) {
      this.loop();
      this.accumulator -= FRAME_MS;
    }

    this.animationFrame = requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  loop() {
    const bufferCtx = this.canvasCtxBuffer;

    bufferCtx.globalAlpha = 1;
    bufferCtx.globalCompositeOperation = 'source-over';
    bufferCtx.fillStyle = '#222222';
    bufferCtx.fillRect(0, 0, WIDTH, HEIGHT);

    if (this.isGameOver) {
      bufferCtx.globalAlpha = 0.3;
    }

    bufferCtx.globalCompositeOperation = 'lighter';
    this.updateBalls();
    this.cleanCollapsedCollisions();
    this.renderBalls();

    if (this.isGameOver || (this.isReacting && this.aCollided.length === 0)) {
      this.isGameOver = true;
      this.renderEnd();
    } else {
      this.renderScores();
    }

    this.canvasCtxScreen.drawImage(this.canvasBuffer, 0, 0);
  }

  updateBalls() {
    for (let i = 0; i < this.aBalls.length; i += 1) {
      const ball = this.aBalls[i];

      if (ball.state === BallState.Moving) {
        this.updateMovingBall(ball);
      } else if (ball.state === BallState.Collided) {
        ball.lifetime -= 1;

        if (ball.lifetime <= 0) {
          ball.state = BallState.Shrinking;
        }
      } else if (ball.state === BallState.Shrinking) {
        ball.radius -= 5;

        if (ball.radius <= 0) {
          this.aBalls.splice(i, 1);
          i -= 1;
        }
      } else if (ball.state === BallState.Expanding) {
        ball.radius += 2;

        if (ball.radius >= COLLIDED_RADIUS) {
          ball.radius = COLLIDED_RADIUS;
          ball.state = BallState.Collided;
        }
      }
    }
  }

  updateMovingBall(ball) {
    for (const staticBall of this.aCollided) {
      const combinedRadius = ball.radius + staticBall.radius;
      const dx = ball.x - staticBall.x;
      const dy = ball.y - staticBall.y;

      if (combinedRadius * combinedRadius > dx * dx + dy * dy) {
        ball.state = BallState.Expanding;
        ball.generation = staticBall.generation + 1;
        ball.score = ball.generation ** 3 * 100;
        staticBall.score = null;

        this.score += ball.score;
        this.numAcquired += 1;
        this.aCollided.push(ball);
        ball.playSound();
        return;
      }
    }

    if (ball.x + ball.dx + ball.radius > WIDTH || ball.x + ball.dx - ball.radius < 0) {
      ball.dx = -ball.dx;
    }

    if (ball.y + ball.dy + ball.radius > HEIGHT || ball.y + ball.dy - ball.radius < 0) {
      ball.dy = -ball.dy;
    }

    ball.x += ball.dx;
    ball.y += ball.dy;
  }

  cleanCollapsedCollisions() {
    this.aCollided = this.aCollided.filter(
      (ball) => !(ball.state === BallState.Shrinking && ball.radius <= 3),
    );
  }

  renderBalls() {
    const ctx = this.canvasCtxBuffer;

    for (const ball of this.aBalls) {
      ctx.fillStyle = ball.colour;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  renderScores() {
    const ctx = this.canvasCtxBuffer;

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textBaseline = 'middle';

    for (const ball of this.aCollided) {
      if (ball.generation > 0 && ball.score) {
        ctx.fillText(`+${formatNumber(ball.score)}`, ball.x, ball.y);
      }
    }

    const ballsLeft = Math.max(this.numRequired - this.numAcquired, 0);

    ctx.save();
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'end';
    ctx.textBaseline = 'bottom';
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000000';
    ctx.fillText(formatNumber(this.score), WIDTH - 15, HEIGHT - 15);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';
    ctx.fillText(`Annihilate ${ballsLeft} more stinkin' circles`, 15, 15);
    ctx.restore();
  }

  renderEnd() {
    const ctx = this.canvasCtxBuffer;
    const success = this.numRequired - this.numAcquired <= 0;
    const messageA = success ? "Congratulations! You showed 'em!" : 'Fail';
    const messageB = success
      ? `You annihilated ${this.numAcquired} of the suckers`
      : `You needed ${this.numRequired - this.numAcquired} more to win`;
    const messageC = `Score: ${formatNumber(this.score)}`;
    const messageD = success
      ? 'Not so smug now, are they?'
      : "Look at those circles. They're laughing at you";

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText(messageA, WIDTH / 2, 125);

    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(messageB, WIDTH / 2, 174);

    ctx.fillStyle = '#bbbbbb';
    ctx.fillText(messageC, WIDTH / 2, 300);
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(messageD, WIDTH / 2, 340);
    ctx.fillText('Click to play again', WIDTH / 2, 365);
  }

  handleClick(event) {
    if (this.isGameOver) {
      this.reset();
      return;
    }

    if (this.isReacting) {
      return;
    }

    const { x, y } = this.getCanvasPoint(event);
    const ball = new Ball(1, WIDTH, HEIGHT);
    ball.x = x;
    ball.y = y;
    ball.colour = '#aaaaaa';
    ball.state = BallState.Expanding;

    this.aBalls.push(ball);
    this.aCollided.push(ball);
    this.isReacting = true;
  }

  getCanvasPoint(event) {
    const rect = this.canvasScreen.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

function randomHexColour() {
  return `#${randomInt(0, 0xffffff).toString(16).padStart(6, '0')}`;
}

function createAudio() {
  if (typeof Audio === 'undefined') {
    return null;
  }

  return new Audio(COLLISION_SOUND_URL);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en').format(value);
}

const canvas = document.querySelector('#screen');

if (canvas) {
  new Game(canvas);
}
