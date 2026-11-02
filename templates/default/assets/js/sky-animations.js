const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sceneTransitionsReduced = reducedMotion;
const sceneExitRoutes = new WeakMap();
const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDifference = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const wrap = (value, min, max) => value < min ? max - ((min - value) % (max - min)) : value > max ? min + ((value - max) % (max - min)) : value;
const sceneMargin = 200;
const sceneTransitionInStart = .52;
const canvas = document.querySelector(".nature-scene canvas");
const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
const spriteAtlas = document.createElement("canvas");
spriteAtlas.width = 1536;
spriteAtlas.height = 128;
const spriteContext = spriteAtlas.getContext("2d");
let spriteX = 0;
let spriteRow = 0;
let spriteRowHeight = 0;

function allocateSprite(width, height) {
  if (spriteX + width > spriteAtlas.width) {
    spriteX = 0;
    spriteRow += spriteRowHeight;
    spriteRowHeight = 0;
  }
  if (spriteRow + height > spriteAtlas.height) throw new Error("Sky sprite atlas is full");
  const sprite = { x: spriteX, y: spriteRow, width, height };
  spriteX += width;
  spriteRowHeight = Math.max(spriteRowHeight, height);
  return sprite;
}

function constrainToSceneLane(mover, width, edgeLane, dt = 1 / 60) {
  const [min, max] = edgeLane(mover.side);
  steerSceneMover(mover, dt, width, min, max);
}

function sceneEdgeLane(side, width) {
  return side < 0 ? [42, width * .30] : [width * .70, width - 42];
}

function sceneEdgeTargetX(side, width) {
  if (Math.random() < .04) return random(width * .43, width * .57);
  const [min, max] = side < 0 ? [42, width * .18] : [width * .82, width - 42];
  return random(min + 16, max - 16);
}

function createSceneClock() {
  let previousTime = null;
  let elapsed = 0;
  return (timestamp) => {
    const dt = previousTime === null ? 0 : Math.min((timestamp - previousTime) / 1000, .04);
    previousTime = timestamp;
    elapsed += dt;
    return { dt, elapsed };
  };
}

function moveTowardPoint(mover, target, dt, turnRate, speedOverride = null) {
  const dx = target.x - mover.x;
  const dy = target.y - mover.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return;
  const heading = Math.atan2(dy, dx);
  mover.heading += clamp(angleDifference(mover.heading, heading), -turnRate * dt, turnRate * dt);
  const speed = speedOverride ?? (Number(mover.speed) > 1
    ? Number(mover.speed)
    : Math.max(8, Number(mover.cruiseSpeed) || Number(mover.targetSpeed) || 28));
  const step = Math.min(distance, speed * dt);
  mover.x += Math.cos(mover.heading) * step;
  mover.y += Math.sin(mover.heading) * step;
}

function resizeAnimalCanvas(canvas, context, width, height) {
  const viewport = canvas.parentElement.getBoundingClientRect();
  const marginX = sceneMargin * viewport.width / width;
  const marginY = sceneMargin * viewport.height / height;
  Object.assign(canvas.style, {
    left: `${-marginX}px`,
    top: `${-marginY}px`,
    width: `${viewport.width + marginX * 2}px`,
    height: `${viewport.height + marginY * 2}px`,
  });
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const scaleX = canvas.width / (width + sceneMargin * 2);
  const scaleY = canvas.height / (height + sceneMargin * 2);
  context.setTransform(scaleX, 0, 0, scaleY, sceneMargin * scaleX, sceneMargin * scaleY);
}

function clearAnimalCanvas(context, width, height) {
  context.clearRect(-sceneMargin, -sceneMargin, width + sceneMargin * 2, height + sceneMargin * 2);
}

function sceneCanvasPoint(event, canvas, width, height) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * (width + sceneMargin * 2) - sceneMargin,
    y: (event.clientY - rect.top) / rect.height * (height + sceneMargin * 2) - sceneMargin,
  };
}

function steerSceneMover(mover, dt, width, min, max) {
  const margin = 100;
  let targetHeading;
  let strength;

  if (mover.side < 0) {
    const centerPull = clamp((mover.x - (max - margin)) / margin, 0, 1);
    const returnPull = clamp((-mover.x - 80) / 140, 0, 1);
    strength = Math.max(centerPull, returnPull);
    targetHeading = centerPull >= returnPull ? Math.PI : 0;
  } else {
    const centerPull = clamp((min + margin - mover.x) / margin, 0, 1);
    const returnPull = clamp((mover.x - width - 80) / 140, 0, 1);
    strength = Math.max(centerPull, returnPull);
    targetHeading = centerPull >= returnPull ? 0 : Math.PI;
  }

  if (strength) {
    mover.heading += angleDifference(mover.heading, targetHeading) * Math.min(1, dt * (3.6 + strength * 2.2));
  }
}

function sceneEdgePoint(width, height, origin, margin = sceneMargin) {
  const distances = [origin.x, width - origin.x, origin.y, height - origin.y];
  const edge = distances.indexOf(Math.min(...distances));
  if (edge === 0) return { x: -margin, y: clamp(origin.y, 0, height) };
  if (edge === 1) return { x: width + margin, y: clamp(origin.y, 0, height) };
  if (edge === 2) return { x: clamp(origin.x, 0, width), y: -margin };
  return { x: clamp(origin.x, 0, width), y: height + margin };
}

function sceneEntityOpacity(x, y, width, height) {
  const outsideX = Math.max(0, -x, x - width);
  const outsideY = Math.max(0, -y, y - height);
  const distance = Math.hypot(outsideX, outsideY);
  const progress = Math.max(0, Math.min(1, distance / 200));
  const smooth = progress * progress * (3 - 2 * progress);
  return 1 - smooth;
}

function drawActors(actors, draw, time, width, height) {
  for (const actor of actors) {
    draw(actor, time, sceneEntityOpacity(actor.x, actor.y, width, height));
  }
}

function sceneStarReveal(scene, star) {
  const root = document.documentElement;
  const startedAt = Number(root.dataset.skyTransitionStartedAt);
  if (!startedAt) return 1;

  const duration = Number(root.dataset.skyTransitionDuration) || 22000;
  const progress = clamp((performance.now() - startedAt) / duration, 0, 1);
  if (root.dataset.skyTransitionFrom === scene) {
    return 1 - smoothstep((progress - .28) / .24);
  }
  if (root.dataset.skyScene !== scene) return 1;
  const revealProgress = clamp((performance.now() - startedAt - duration * sceneTransitionInStart - star.revealDelay) / 650, 0, 1);
  return smoothstep(revealProgress);
}

function updateSceneTransitionMover(scene, mover, dt, width, height, turnRate = 2.8) {
  const root = document.documentElement;
  const from = root.dataset.skyTransitionFrom;
  const to = root.dataset.skyScene;
  const startedAt = Number(root.dataset.skyTransitionStartedAt);
  const duration = Number(root.dataset.skyTransitionDuration) || 22000;
  let route = sceneExitRoutes.get(mover);
  if (sceneTransitionsReduced) return false;

  if (!startedAt || (scene !== from && scene !== to)) {
    if (route?.role !== "in" || route.completed) return false;
    moveTowardPoint(mover, route.home, dt, turnRate);
    if (Math.hypot(route.home.x - mover.x, route.home.y - mover.y) < 12) {
      route.completed = true;
      return false;
    }
    return true;
  }

  const progress = Math.max(0, Math.min(1, (performance.now() - startedAt) / duration));
  if (!route || route.startedAt !== startedAt) {
    if (scene === from) {
      const cruiseSpeed = Math.max(
        28,
        Number(mover.speed) || 0,
        Number(mover.cruiseSpeed) || 0,
        Number(mover.targetSpeed) || 0,
      );
      route = {
        startedAt,
        role: "out",
        target: sceneEdgePoint(width, height, mover),
        cruiseSpeed,
        speed: Math.max(8, Number(mover.speed) || 8),
      };
    } else {
      const home = { x: mover.x, y: mover.y };
      const entry = sceneEdgePoint(width, height, home);
      const cruiseSpeed = Math.max(
        28,
        Number(mover.speed) || 0,
        Number(mover.cruiseSpeed) || 0,
        Number(mover.targetSpeed) || 0,
      );
      route = {
        startedAt,
        role: "in",
        home,
        cruiseSpeed,
        speed: Math.max(8, Number(mover.speed) || 8),
      };
      mover.x = entry.x;
      mover.y = entry.y;
      mover.trail = [];
      mover.trailLast = null;
      mover.trailCurrentDash = null;
    }
    sceneExitRoutes.set(mover, route);
  }

  if (route.completed) return route.role === "out";
  if (route.role === "in" && progress < sceneTransitionInStart) return true;

  const target = route.role === "out" ? route.target : route.home;
  route.speed += (route.cruiseSpeed - route.speed) * Math.min(1, dt * 1.8);
  mover.speed = route.speed;
  moveTowardPoint(mover, target, dt, turnRate, route.speed);
  if (Math.hypot(target.x - mover.x, target.y - mover.y) < 12) {
    route.completed = true;
    return route.role === "out";
  }
  return true;
}

// Afternoon canvas animation, adapted from /animations/afternoon.html
function createAfternoonScene() {
      const width = 1440;
      const height = 900;
      const pointer = { x: 0, y: 0, active: false };
      const leafColors = ["#b6a45f", "#c3a46b", "#9fae75", "#c78f63", "#a9b77b"];
      const leaves = Array.from({ length: 20 }, (_, index) => ({
        x: random(0, width),
        y: random(-30, height + 30),
        vx: random(-35, 35),
        vy: random(-15, 15),
        heading: random(0, Math.PI * 2),
        speed: random(42, 78),
        size: index < 6 ? random(.35, .58) : random(.58, 1.12),
        angle: random(0, Math.PI * 2),
        spin: random(-.55, .55),
        phase: random(0, Math.PI * 2),
        color: leafColors[Math.floor(Math.random() * leafColors.length)],
      }));
      const wind = {
        angle: random(-.35, .35),
        targetAngle: random(-.6, .6),
        directionIn: random(10, 18),
        nextGustIn: random(1.8, 4.2),
        gustRemaining: 0,
        gustDuration: 0,
        gustStrength: 0,
        vortexIn: random(6, 12),
        vortexRemaining: 0,
        vortexDuration: 0,
        vortexStrength: 0,
        vortexDirection: 1,
        vortexX: 0,
        vortexY: 0,
        vortexRadius: 0,
      };
      const clock = createSceneClock();
      let elapsed = 0;


      function updateWind(dt) {
        wind.directionIn -= dt;
        if (wind.directionIn <= 0) {
          wind.targetAngle = random(-Math.PI, Math.PI);
          wind.directionIn = random(10, 20);
        }
        wind.angle += angleDifference(wind.angle, wind.targetAngle) * Math.min(1, dt * .24);
        if (wind.gustRemaining > 0) {
          wind.gustRemaining -= dt;
        } else {
          wind.nextGustIn -= dt;
          if (wind.nextGustIn <= 0) {
            wind.gustDuration = random(1.4, 2.8);
            wind.gustRemaining = wind.gustDuration;
            wind.gustStrength = random(75, 145);
            wind.nextGustIn = random(3.2, 7);
          }
        }
        const gustProgress = wind.gustDuration > 0
          ? 1 - wind.gustRemaining / wind.gustDuration
          : 0;
        const gust = wind.gustRemaining > 0 ? Math.sin(gustProgress * Math.PI) * wind.gustStrength : 0;

        if (wind.vortexRemaining > 0) {
          wind.vortexRemaining -= dt;
        } else {
          wind.vortexIn -= dt;
          if (wind.vortexIn <= 0) {
            wind.vortexX = random(120, width - 120);
            wind.vortexY = random(100, height - 100);
            wind.vortexRadius = random(110, 210);
            wind.vortexStrength = random(90, 165);
            wind.vortexDirection = Math.random() < .5 ? -1 : 1;
            wind.vortexDuration = random(2.1, 3.8);
            wind.vortexRemaining = wind.vortexDuration;
            wind.vortexIn = random(8, 16);
          }
        }
        const vortexProgress = wind.vortexDuration > 0 ? 1 - wind.vortexRemaining / wind.vortexDuration : 0;
        const vortexEnvelope = wind.vortexRemaining > 0 ? Math.sin(vortexProgress * Math.PI) : 0;
        const windSpeed = 34 + gust;
        const windX = Math.cos(wind.angle) * windSpeed;
        const windY = Math.sin(wind.angle) * windSpeed;

        for (const leaf of leaves) {
          if (updateSceneTransitionMover("afternoon", leaf, dt, width, height, 1.8)) {
            leaf.angle += leaf.spin / leaf.size * dt;
            continue;
          }
          const sizeWind = 1.35 - leaf.size * .62;
          const response = clamp(1.65 - leaf.size * .65, .75, 1.5);
          const turbulence = (Math.sin(elapsed * 1.35 + leaf.phase) * 22 + Math.sin(elapsed * 2.6 + leaf.phase * 1.7) * 11) * sizeWind;
          let avoidX = 0;
          let avoidY = 0;
          if (pointer.active) {
            const awayX = leaf.x - pointer.x;
            const awayY = leaf.y - pointer.y;
            const distance = Math.hypot(awayX, awayY);
            if (distance < 165) {
              const strength = Math.pow(1 - distance / 165, 2);
              const awayAngle = distance > 1 ? Math.atan2(awayY, awayX) : leaf.phase;
              avoidX = Math.cos(awayAngle) * strength * 220;
              avoidY = Math.sin(awayAngle) * strength * 220;
            }
          }
          let vortexX = 0;
          let vortexY = 0;
          let vortexSpin = 0;
          if (vortexEnvelope > 0) {
            const dx = leaf.x - wind.vortexX;
            const dy = leaf.y - wind.vortexY;
            const distance = Math.hypot(dx, dy);
            if (distance > 0 && distance < wind.vortexRadius) {
              const weight = Math.pow(1 - distance / wind.vortexRadius, 2) * vortexEnvelope;
              const swirl = wind.vortexDirection * wind.vortexStrength * weight * sizeWind;
              vortexX = (-dy / distance) * swirl - (dx / distance) * swirl * .14;
              vortexY = (dx / distance) * swirl - (dy / distance) * swirl * .14;
              vortexSpin = wind.vortexDirection * weight * 1.4;
            }
          }
          const targetVx = windX * sizeWind + turbulence + avoidX + vortexX;
          const updraft = -gust * (.12 + .06 * Math.sin(elapsed * 2 + leaf.phase));
          const targetVy = (windY + Math.sin(elapsed * .95 + leaf.phase) * 17 + updraft) * sizeWind + avoidY + vortexY;
          leaf.vx += (targetVx - leaf.vx) * Math.min(1, dt * (1.1 + gust * .008) * response);
          leaf.vy += (targetVy - leaf.vy) * Math.min(1, dt * 1.25 * response);
          leaf.x += leaf.vx * dt;
          leaf.y += leaf.vy * dt;
          leaf.angle += (leaf.spin / leaf.size + gust * .0025 + turbulence * .0015 + vortexSpin) * dt;
          if (leaf.x < -90) leaf.x = width + 90;
          else if (leaf.x > width + 90) leaf.x = -90;
          if (leaf.y < -100) leaf.y = height + 100;
          else if (leaf.y > height + 100) leaf.y = -100;
        }
      }

      function drawLeaf(leaf, opacity = 1) {
        context.save();
        context.translate(leaf.x, leaf.y);
        context.rotate(leaf.angle);
        context.scale(leaf.size, leaf.size);
        context.globalAlpha = .5 * opacity;
        context.fillStyle = leaf.color;
        context.strokeStyle = "#36423b";
        context.lineWidth = 1.05;
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(0, -22);
        context.bezierCurveTo(13, -14, 13, 8, 0, 22);
        context.bezierCurveTo(-13, 8, -13, -14, 0, -22);
        context.closePath();
        context.fill();
        context.globalAlpha = .58 * opacity;
        context.stroke();
        context.globalAlpha = .55 * opacity;
        context.lineWidth = 1;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(0, -18);
        context.lineTo(0, 18);
        context.moveTo(0, -4);
        context.lineTo(7, -11);
        context.moveTo(0, 3);
        context.lineTo(-7, -5);
        context.moveTo(0, 9);
        context.lineTo(6, 3);
        context.stroke();
        context.restore();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        if (!reducedMotion) updateWind(dt);
        drawActors(leaves, drawLeaf, elapsed, width, height);
      }

      function updatePointer(event) {
        const point = sceneCanvasPoint(event, canvas, width, height);
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.active = point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
      }

          return { render: renderScene, pointerMove: updatePointer, pointerLeave: () => { pointer.active = false; } };
    }

// Dawn canvas animation, adapted from /animations/dawn.html
function createDawnScene() {
      const logicalWidth = 1440;
      const logicalHeight = 900;
      const beeWorld = { left: -logicalWidth * .35, right: logicalWidth * 1.35, top: -logicalHeight * .35, bottom: logicalHeight * 1.35 };
      const clock = createSceneClock();
      let elapsed = 0;
      const pointer = { x: 0, y: 0, active: false };
      const cursorVisit = { x: 0, y: 0, active: false, pending: 0 };
      const socialInteraction = { a: null, b: null, x: 0, y: 0, phase: 0, remaining: 0, nextIn: 2 };

      const edgeLane = (side) => sceneEdgeLane(side, logicalWidth);
      const edgeTargetX = (side) => sceneEdgeTargetX(side, logicalWidth);


      const bees = [
        [290, 180], [600, 390], [970, 600], [1190, 780], [440, 700], [1340, 510],
        [180, 520], [810, 180], [1080, 360],
      ].map(([x, y], index) => {
        const side = index % 2 === 0 ? -1 : 1;
        return {
        side,
        x: edgeTargetX(side), y,
        heading: random(0, Math.PI * 2),
        speed: random(40, 58),
        cruiseSpeed: random(54, 78),
        dartIn: random(3, 7),
        dartFor: 0,
        dartHeading: 0,
        dartSpeed: 0,
        turnPhase: random(0, Math.PI * 2),
        phase: random(0, Math.PI * 2),
        scale: 1,
        targetX: edgeTargetX(side),
        targetY: random(70, logicalHeight - 70),
        mode: "cruise",
        hoverTime: 0,
        trail: [],
        trailLast: null,
        trailPhase: 0,
        trailCurrentDash: null,
        cursorVisitor: false,
        cursorVisitRemaining: 0,
        cursorOrbitAngle: 0,
        cursorOrbitDirection: 1,
        cursorOrbitSpeed: 1,
        cursorApproachSpeed: random(54, 78),
        socialPartner: null,
      };
      });


      function steerBeeHome(bee) {
        const edgeMargin = 120;
        const edgeDistance = Math.min(
          bee.x - beeWorld.left,
          beeWorld.right - bee.x,
          bee.y - beeWorld.top,
          beeWorld.bottom - bee.y,
        );
        const edgeWeight = clamp((edgeMargin - edgeDistance) / edgeMargin, 0, 1);
        const outsideDistance = Math.max(0, -bee.x, bee.x - logicalWidth, -bee.y, bee.y - logicalHeight);
        const outsideWeight = clamp(outsideDistance / 150, 0, 1);
        const homeHeading = Math.atan2(logicalHeight / 2 - bee.y, logicalWidth / 2 - bee.x);
        return angleDifference(bee.heading, homeHeading) * (edgeWeight * 1.5 + outsideWeight * 1.8);
      }

      function chooseNextWaypoint(bee) {
        let x = bee.x;
        let y = bee.y;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          x = edgeTargetX(bee.side);
          y = random(70, logicalHeight - 70);
          if (Math.hypot(x - bee.x, y - bee.y) > 190) break;
        }
        bee.targetX = x;
        bee.targetY = y;
      }

      function separateFromOtherBees(bee) {
        let x = 0;
        let y = 0;
        for (const other of bees) {
          if (other === bee || other.side !== bee.side) continue;
          const dx = bee.x - other.x;
          const dy = bee.y - other.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < 42) {
            const strength = (42 - distance) / 42;
            x += dx / distance * strength;
            y += dy / distance * strength;
          }
        }
        return { x, y };
      }

      function clearSocialInteraction() {
        for (const bee of [socialInteraction.a, socialInteraction.b]) {
          if (!bee) continue;
          bee.socialPartner = null;
          bee.mode = "cruise";
          chooseNextWaypoint(bee);
        }
        socialInteraction.a = null;
        socialInteraction.b = null;
        socialInteraction.remaining = 0;
        socialInteraction.nextIn = random(3, 7);
      }

      function updateSocialInteraction(dt) {
        if (socialInteraction.a && socialInteraction.b) {
          socialInteraction.remaining -= dt;
          const orbit = elapsed * .85 + socialInteraction.phase;
          for (const [bee, side] of [[socialInteraction.a, 1], [socialInteraction.b, -1]]) {
            const angle = orbit + (side < 0 ? Math.PI : 0);
            const [minX, maxX] = edgeLane(bee.side);
            bee.targetX = clamp(socialInteraction.x + Math.cos(angle) * 48, minX, maxX);
            bee.targetY = clamp(socialInteraction.y + Math.sin(angle) * 36, 55, logicalHeight - 55);
          }
          if (socialInteraction.remaining <= 0) clearSocialInteraction();
          return;
        }

        socialInteraction.nextIn -= dt;
        if (socialInteraction.nextIn > 0) return;
        const candidates = [];
        for (let first = 0; first < bees.length; first += 1) {
          for (let second = first + 1; second < bees.length; second += 1) {
            const a = bees[first];
            const b = bees[second];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (a.side === b.side && !a.cursorVisitor && !b.cursorVisitor && !a.socialPartner && !b.socialPartner && distance > 70 && distance < 280) {
              candidates.push([a, b]);
            }
          }
        }
        if (!candidates.length) {
          socialInteraction.nextIn = 1.5;
          return;
        }

        const [a, b] = candidates[Math.floor(Math.random() * candidates.length)];
        socialInteraction.a = a;
        socialInteraction.b = b;
        const [minX, maxX] = edgeLane(a.side);
        socialInteraction.x = clamp((a.x + b.x) / 2, minX, maxX);
        socialInteraction.y = clamp((a.y + b.y) / 2, 100, logicalHeight - 100);
        socialInteraction.phase = random(0, Math.PI * 2);
        socialInteraction.remaining = random(4, 6);
        a.socialPartner = b;
        b.socialPartner = a;
      }

      function recordBeeTrail(bee, dt) {
        let liveDashes = 0;
        for (const dash of bee.trail) {
          dash.age += dt;
          if (dash.age < 1.5) bee.trail[liveDashes++] = dash;
        }
        bee.trail.length = liveDashes;

        const current = {
          x: bee.x - Math.cos(bee.heading) * 10.5,
          y: bee.y - Math.sin(bee.heading) * 10.5,
        };
        if (!bee.trailLast) {
          bee.trailLast = current;
          return;
        }

        const start = bee.trailLast;
        const distance = Math.hypot(current.x - start.x, current.y - start.y);
        if (distance > 80) {
          bee.trailLast = current;
          bee.trailPhase = 0;
          bee.trailCurrentDash = null;
          return;
        }

        let traveled = 0;
        const dashLength = 2.8;
        const period = 10.3;
        while (traveled < distance) {
          const drawingDash = bee.trailPhase < dashLength;
          const boundary = drawingDash ? dashLength : period;
          const step = Math.min(distance - traveled, boundary - bee.trailPhase);
          const fromRatio = distance > 0 ? traveled / distance : 0;
          traveled += step;
          const toRatio = distance > 0 ? traveled / distance : 1;
          const fromX = start.x + (current.x - start.x) * fromRatio;
          const fromY = start.y + (current.y - start.y) * fromRatio;
          const toX = start.x + (current.x - start.x) * toRatio;
          const toY = start.y + (current.y - start.y) * toRatio;

          if (drawingDash) {
            if (!bee.trailCurrentDash) {
              bee.trailCurrentDash = { x1: fromX, y1: fromY, x2: fromX, y2: fromY, age: 0 };
              bee.trail.push(bee.trailCurrentDash);
            }
            bee.trailCurrentDash.x2 = toX;
            bee.trailCurrentDash.y2 = toY;
          } else bee.trailCurrentDash = null;

          bee.trailPhase += step;
          if (bee.trailPhase >= period - .001) {
            bee.trailPhase = 0;
            bee.trailCurrentDash = null;
          }
        }
        bee.trailLast = current;
      }

      function moveBee(bee, dt) {
        if (updateSceneTransitionMover("dawn", bee, dt, logicalWidth, logicalHeight, 2.5)) {
          recordBeeTrail(bee, dt);
          return;
        }
        if (bee.cursorVisitor && cursorVisit.active) {
          bee.cursorVisitRemaining -= dt;
          if (bee.cursorVisitRemaining <= 0) {
            bee.cursorVisitor = false;
            cursorVisit.active = bees.some((other) => other.cursorVisitor);
            chooseNextWaypoint(bee);
          } else {
            bee.cursorOrbitAngle += bee.cursorOrbitDirection * bee.cursorOrbitSpeed * dt;
            const radius = 66 + Math.sin(elapsed * 1.7 + bee.phase) * 6;
            const [minX, maxX] = edgeLane(bee.side);
            const orbitX = clamp(cursorVisit.x + Math.cos(bee.cursorOrbitAngle) * radius, minX, maxX);
            const orbitY = clamp(cursorVisit.y + Math.sin(bee.cursorOrbitAngle) * radius, 36, logicalHeight - 36);
            const toOrbitX = orbitX - bee.x;
            const toOrbitY = orbitY - bee.y;
            const toOrbitDistance = Math.hypot(toOrbitX, toOrbitY);
            const approachStep = Math.min(toOrbitDistance, bee.cursorApproachSpeed * dt);
            if (toOrbitDistance > 0) {
              bee.x += toOrbitX / toOrbitDistance * approachStep;
              bee.y += toOrbitY / toOrbitDistance * approachStep;
            }
            const faceCursor = Math.atan2(cursorVisit.y - bee.y, cursorVisit.x - bee.x);
            bee.heading += clamp(angleDifference(bee.heading, faceCursor), -7 * dt, 7 * dt);
            bee.speed = radius * bee.cursorOrbitSpeed;
            constrainToSceneLane(bee, logicalWidth, edgeLane, dt);
            recordBeeTrail(bee, dt);
            return;
          }
        }

        if (bee.mode === "hover") {
          bee.hoverTime -= dt;
          const separation = separateFromOtherBees(bee);
          const focus = bee.cursorVisitor && cursorVisit.active ? cursorVisit : bee.socialPartner;
          if (focus) {
            const lookAt = Math.atan2(focus.y - bee.y, focus.x - bee.x);
            bee.heading += clamp(angleDifference(bee.heading, lookAt), -4.2 * dt, 4.2 * dt);
          }
          bee.x += Math.sin(elapsed * 5.6 + bee.phase) * 3.2 * dt + separation.x * 44 * dt;
          bee.y += Math.cos(elapsed * 5.1 + bee.phase) * 3.2 * dt + separation.y * 44 * dt;
          constrainToSceneLane(bee, logicalWidth, edgeLane, dt);
          if (bee.hoverTime <= 0) {
            if (bee.cursorVisitor) {
              bee.cursorVisitor = false;
              cursorVisit.active = bees.some((other) => other.cursorVisitor);
            }
            if (bee.socialPartner) {
              bee.targetX += Math.sin(elapsed * 1.6 + bee.phase) * 14;
              bee.targetY += Math.cos(elapsed * 1.4 + bee.phase) * 12;
            } else chooseNextWaypoint(bee);
            bee.mode = "cruise";
          }
          return;
        }

        const toX = bee.targetX - bee.x;
        const toY = bee.targetY - bee.y;
        const distance = Math.hypot(toX, toY);
        if (distance < (bee.cursorVisitor ? 38 : 28)) {
          bee.mode = "hover";
          bee.hoverTime = bee.cursorVisitor ? random(1.1, 1.8) : bee.socialPartner ? random(.6, 1) : random(.18, .48);
          bee.speed = 0;
          return;
        }

        bee.dartIn -= dt;
        if (!bee.socialPartner && bee.dartIn <= 0 && bee.dartFor <= 0) {
          bee.dartFor = random(.16, .28);
          bee.dartHeading = bee.heading + random(-1.45, 1.45);
          bee.dartSpeed = random(150, 215);
          bee.dartIn = random(4, 8);
        }

        const separation = separateFromOtherBees(bee);
        const focusBee = bee.socialPartner;
        const focusDistance = focusBee ? Math.hypot(focusBee.x - bee.x, focusBee.y - bee.y) : Infinity;
        const targetHeading = focusBee && focusDistance < 150
          ? Math.atan2(focusBee.y - bee.y, focusBee.x - bee.x)
          : Math.atan2(toY, toX);
        const weave = Math.sin(elapsed * 5.8 + bee.phase) * .29 + Math.sin(elapsed * 2.7 + bee.turnPhase) * .15;
        const separationHeading = Math.hypot(separation.x, separation.y) > 0 ? Math.atan2(separation.y, separation.x) : bee.heading;
        const separationTurn = angleDifference(bee.heading, separationHeading) * Math.min(1, Math.hypot(separation.x, separation.y)) * 1.3;
        const turn = angleDifference(bee.heading, targetHeading + weave) + separationTurn;
        const turnLimit = 2.35 * dt;
        bee.heading += clamp(turn, -turnLimit, turnLimit);

        // Bees keep forward momentum, weave gently, then brake as they reach a waypoint.
        const approach = clamp((distance - 20) / 135, 0, 1);
        const easedApproach = approach * approach * (3 - 2 * approach);
        let targetSpeed = bee.cruiseSpeed * (.5 + easedApproach * .5);
        if (bee.dartFor > 0) {
          bee.dartFor -= dt;
          bee.heading += angleDifference(bee.heading, bee.dartHeading) * Math.min(1, dt * 10);
          targetSpeed = bee.dartSpeed;
        }
        bee.speed += (targetSpeed - bee.speed) * Math.min(1, dt * 3.8);
        const lateralWeave = Math.sin(elapsed * 5.8 + bee.phase) * 16 + Math.sin(elapsed * 2.8 + bee.turnPhase) * 8;
        bee.x += (Math.cos(bee.heading) * bee.speed - Math.sin(bee.heading) * lateralWeave + separation.x * 38) * dt;
        bee.y += (Math.sin(bee.heading) * bee.speed + Math.cos(bee.heading) * lateralWeave + separation.y * 38) * dt;
        constrainToSceneLane(bee, logicalWidth, edgeLane, dt);
        bee.y = wrap(bee.y, beeWorld.top, beeWorld.bottom);
        recordBeeTrail(bee, dt);
      }

      function resolveBeeCollisions() {
        const minimumDistance = 40;
        for (let pass = 0; pass < 2; pass += 1) {
          for (let first = 0; first < bees.length; first += 1) {
            for (let second = first + 1; second < bees.length; second += 1) {
              const a = bees[first];
              const b = bees[second];
              if (a.side !== b.side) continue;
              let dx = b.x - a.x;
              let dy = b.y - a.y;
              let distance = Math.hypot(dx, dy);
              if (distance >= minimumDistance) continue;
              if (distance < .001) {
                const angle = (a.phase + b.phase) * .5;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
                distance = 1;
              }
              const overlap = (minimumDistance - distance) * .51;
              const nx = dx / distance;
              const ny = dy / distance;
              a.x = wrap(a.x - nx * overlap, beeWorld.left, beeWorld.right);
              a.y = wrap(a.y - ny * overlap, beeWorld.top, beeWorld.bottom);
              b.x = wrap(b.x + nx * overlap, beeWorld.left, beeWorld.right);
              b.y = wrap(b.y + ny * overlap, beeWorld.top, beeWorld.bottom);
              constrainToSceneLane(a, logicalWidth, edgeLane);
              constrainToSceneLane(b, logicalWidth, edgeLane);
            }
          }
        }
      }

      function drawBeeTrail(bee, opacity = 1) {
        if (!bee.trail.length) return;

        context.save();
        context.strokeStyle = "#382e2a";
        context.lineCap = "round";
        context.lineWidth = 1;
        for (const dash of bee.trail) {
          context.globalAlpha = .3402 * (1 - dash.age / 1.5) * opacity;
          context.beginPath();
          context.moveTo(dash.x1, dash.y1);
          context.lineTo(dash.x2, dash.y2);
          context.stroke();
        }
        context.restore();
      }

      function drawWing(side, rootX, rootY, length, width, angle, phase, alpha) {
        context.save();
        context.translate(rootX, rootY);
        context.rotate(side * (angle + Math.sin(phase) * .24));
        context.globalAlpha = alpha;
        context.fillStyle = "#e5e6e8";
        context.beginPath();
        context.ellipse(side * length * .48, -1, length * .55, width, side * -.1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      function drawBee(bee, time, opacity = 1) {
        drawBeeTrail(bee, opacity);
        context.save();
        context.globalAlpha = opacity;
        context.translate(bee.x, bee.y);
        context.rotate(bee.heading + Math.PI / 2);
        context.scale(bee.scale, bee.scale);

        // Soft, rounded wings give the bee a friendly silhouette without tiny details.
        const flap = time * 48 + bee.phase;
        for (const side of [-1, 1]) {
          drawWing(side, side * 2.4, -1, 12, 3.4, .34, flap, .52 * opacity);
        }

        // Front-facing body: one warm oval, one stripe, and a big round face.
        context.fillStyle = "#e1c07a";
        context.beginPath();
        context.ellipse(0, 5.1, 3.7, 3.1, 0, 0, Math.PI * 2);
        context.fill();
        context.save();
        context.beginPath();
        context.ellipse(0, 5.1, 3.7, 3.1, 0, 0, Math.PI * 2);
        context.clip();
        context.fillStyle = "#705b50";
        context.fillRect(-4, 3.6, 8, 1.25);
        context.fillRect(-4, 6.25, 8, 1.25);
        context.restore();
        context.fillStyle = "#705b50";
        context.beginPath();
        context.moveTo(-1.5, 8);
        context.lineTo(0, 10.5);
        context.lineTo(1.5, 8);
        context.closePath();
        context.fill();

        context.fillStyle = "#cfaa70";
        context.beginPath();
        context.ellipse(0, -.5, 4, 3.8, 0, 0, Math.PI * 2);
        context.fill();

        context.save();
        context.translate(0, 1.5);
        context.fillStyle = "#382e2a";
        context.beginPath();
        context.arc(0, -4.4, 4.2, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = "#382e2a";
        context.lineWidth = 1.35;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(-1.4, -7.8);
        context.quadraticCurveTo(-.25, -9.4, -4.1, -10.6);
        context.moveTo(1.4, -7.8);
        context.quadraticCurveTo(.25, -9.4, 4.1, -10.6);
        context.stroke();
        context.fillStyle = "#382e2a";
        context.beginPath();
        context.arc(-4.1, -10.6, .58, 0, Math.PI * 2);
        context.arc(4.1, -10.6, .58, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#fff0d5";
        context.beginPath();
        context.arc(-1.4, -4.9, .5, 0, Math.PI * 2);
        context.arc(1.4, -4.9, .5, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(202, 132, 117, .38)";
        context.beginPath();
        context.ellipse(-2.35, -3.7, .65, .34, 0, 0, Math.PI * 2);
        context.ellipse(2.35, -3.7, .65, .34, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#fff0d5";
        context.lineWidth = .55;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(-.5, -2.9);
        context.quadraticCurveTo(0, -2.45, .5, -2.9);
        context.stroke();
        context.restore();
        context.restore();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        if (!reducedMotion) {
          if (pointer.active && cursorVisit.pending > 0) {
            cursorVisit.pending -= dt;
            if (cursorVisit.pending <= 0) beginCursorVisit(cursorVisit.x, cursorVisit.y);
          }
          updateSocialInteraction(dt);
          for (const bee of bees) moveBee(bee, dt);
          resolveBeeCollisions();
        }
        drawActors(bees, drawBee, elapsed, logicalWidth, logicalHeight);
        context.globalAlpha = 1;
      }

      function releaseCursorVisitors() {
        cursorVisit.active = false;
        const departing = [];
        for (const bee of bees) {
          if (!bee.cursorVisitor) continue;
          departing.push(bee);
          bee.cursorVisitor = false;
          bee.mode = "cruise";
          chooseNextWaypoint(bee);
        }
        return departing;
      }

      function beginCursorVisit(x, y) {
        if (socialInteraction.a) clearSocialInteraction();
        const departing = releaseCursorVisitors();
        cursorVisit.pending = 0;
        pointer.x = x;
        pointer.y = y;
        pointer.active = true;
        cursorVisit.side = x < logicalWidth / 2 ? -1 : 1;
        const [visitMinX, visitMaxX] = edgeLane(cursorVisit.side);
        cursorVisit.x = clamp(x, visitMinX, visitMaxX);
        cursorVisit.y = clamp(y, 55, logicalHeight - 55);
        const available = bees.filter((bee) => bee.side === cursorVisit.side && !departing.includes(bee));
        const visitorCount = Math.floor(random(1, 4));
        const visitors = [...available].sort(() => Math.random() - .5).slice(0, visitorCount);
        const startAngle = random(0, Math.PI * 2);
        const radius = 58;
        const orbitDirection = Math.random() < .5 ? -1 : 1;
        const orbitSpeed = random(.65, .85);
        visitors.forEach((bee, index) => {
          const angle = startAngle + Math.PI * 2 * index / visitors.length;
          bee.cursorVisitor = true;
          bee.cursorVisitRemaining = random(3.6, 5.2);
          bee.cursorOrbitAngle = angle;
          bee.cursorOrbitDirection = orbitDirection;
          bee.cursorOrbitSpeed = orbitSpeed;
          bee.mode = "cruise";
          const [minX, maxX] = edgeLane(bee.side);
          bee.targetX = clamp(cursorVisit.x + Math.cos(angle) * radius, minX, maxX);
          bee.targetY = clamp(cursorVisit.y + Math.sin(angle) * radius, 38, logicalHeight - 38);
        });
        cursorVisit.active = true;
      }

      function updatePointer(event) {
        const { x, y } = sceneCanvasPoint(event, canvas, logicalWidth, logicalHeight);
        const inside = x >= 0 && x <= logicalWidth && y >= 0 && y <= logicalHeight;
        if (!inside) return;
        const moved = !pointer.active || Math.hypot(x - pointer.x, y - pointer.y) > 4;
        if (!moved) return;
        pointer.x = x;
        pointer.y = y;
        pointer.active = true;
        cursorVisit.x = clamp(x, 55, logicalWidth - 55);
        cursorVisit.y = clamp(y, 55, logicalHeight - 55);
        cursorVisit.pending = random(2, 3);
        if (socialInteraction.a) clearSocialInteraction();
        releaseCursorVisitors();
      }

          return { render: renderScene, pointerMove: updatePointer, pointerLeave: () => { pointer.active = false; cursorVisit.pending = 0; releaseCursorVisitors(); } };
    }

// Dusk canvas animation, adapted from /animations/dusk.html
function createDuskScene() {
      const logicalWidth = 1440;
      const logicalHeight = 900;
      const worldBounds = {
        left: -logicalWidth * .35,
        right: logicalWidth * 1.35,
        top: -logicalHeight * .35,
        bottom: logicalHeight * 1.35,
      };
      let width = 0;
      let height = 0;
      const clock = createSceneClock();
      let elapsed = 0;
      const pointer = { x: 0, y: 0, active: false };

      const edgeLane = (side) => sceneEdgeLane(side, logicalWidth);
      const edgeTargetX = (side) => sceneEdgeTargetX(side, logicalWidth);


      // Sparse, dim stars: just a few breathe in the background behind the fireflies.
      const stars = Array.from({ length: 26 }, () => ({
        x: random(16, logicalWidth - 16),
        y: random(18, logicalHeight * .76),
        radius: random(.42, .84),
        phase: random(0, Math.PI * 2),
        rate: random(1.5, 3.2),
        twinkle: Math.random() < .5,
        color: Math.random() < .7 ? "#fff1d4" : "#dce7ff",
        revealDelay: random(0, 2600),
      }));

      const fireflyPalettes = [
        { core: "#e8f28a", inner: "247, 246, 154", middle: "223, 239, 117", trail: "#d9e879", shadow: "#e1ed7d" },
        { core: "#d9ef7c", inner: "235, 245, 143", middle: "206, 236, 105", trail: "#cbe66d", shadow: "#d2eb75" },
        { core: "#cfee78", inner: "224, 243, 137", middle: "187, 231, 97", trail: "#bce266", shadow: "#c5e974" },
        { core: "#c8e88a", inner: "221, 241, 153", middle: "181, 224, 112", trail: "#b9dc79", shadow: "#c1e582" },
      ];

      const startingPoints = [
        [85, 190], [330, 530], [1350, 260], [1280, 610], [500, 150],
        [900, 575], [690, 350], [1070, 440], [250, 760], [1190, 800], [90, 410],
        [220, 320], [430, 680], [750, 120], [980, 250], [1160, 650],
      ];
      const fireflies = startingPoints.map(([x, y], index) => {
        const side = index % 2 === 0 ? -1 : 1;
        return {
        side,
        x: edgeTargetX(side), y,
        heading: random(0, Math.PI * 2),
        turnRate: random(-.35, .35),
        targetTurn: random(-1.1, 1.1),
        turnChangeIn: random(.25, .95),
        speed: random(10, 24),
        targetSpeed: random(14, 36),
        hoverIn: random(1, 5),
        dartIn: random(3, 11),
        dartFor: 0,
        dartHeading: 0,
        dartSpeed: 0,
        canDart: index === 0 || index === 3 || index === 6 || index === 9,
        phase: random(0, Math.PI * 2),
        flickerRate: random(3.2, 6.2),
        palette: fireflyPalettes[Math.floor(Math.random() * fireflyPalettes.length)],
        radius: random(1.65, 2.35),
        trail: [],
        trailIn: 0,
      };
      });
      const haloSprites = new Map(fireflyPalettes.map((palette) => {
        const sprite = allocateSprite(64, 64);
        const halo = spriteContext.createRadialGradient(sprite.x + 32, sprite.y + 32, 0, sprite.x + 32, sprite.y + 32, 32);
        halo.addColorStop(0, `rgba(${palette.inner}, .24)`);
        halo.addColorStop(.18, `rgba(${palette.middle}, .18)`);
        halo.addColorStop(.42, `rgba(${palette.middle}, .085)`);
        halo.addColorStop(.72, `rgba(${palette.middle}, .025)`);
        halo.addColorStop(1, `rgba(${palette.middle}, 0)`);
        spriteContext.fillStyle = halo;
        spriteContext.fillRect(sprite.x, sprite.y, 64, 64);
        return [palette, sprite];
      }));
      for (const bug of fireflies) bug.haloSprite = haloSprites.get(bug.palette);


      function updateFirefly(bug, dt, time) {
        if (updateSceneTransitionMover("dusk", bug, dt, logicalWidth, logicalHeight, 2.2)) {
          bug.trailIn -= dt;
          if (bug.trailIn <= 0) {
            bug.trail.unshift({ x: bug.x, y: bug.y });
            bug.trail.length = Math.min(bug.trail.length, 8);
            bug.trailIn = .035;
          }
          return;
        }
        bug.turnChangeIn -= dt;
        if (bug.turnChangeIn <= 0) {
          bug.targetTurn = random(-1.25, 1.25);
          bug.targetSpeed = random(13, 38);
          bug.turnChangeIn = random(.35, 1.05);
          bug.hoverIn -= 1;
          if (bug.hoverIn <= 0) {
            bug.targetSpeed = random(2, 7);
            bug.hoverIn = random(2, 6);
          }
        }

        bug.dartIn -= dt;
        if (bug.canDart && bug.dartIn <= 0 && bug.dartFor <= 0) {
          bug.dartFor = random(.16, .32);
          bug.dartHeading = bug.heading + random(-1.1, 1.1);
          bug.dartSpeed = random(150, 235);
          bug.dartIn = random(5, 12);
        }

        const edgeMargin = 120;
        const edgeDistance = Math.min(
          bug.x - worldBounds.left,
          worldBounds.right - bug.x,
          bug.y - worldBounds.top,
          worldBounds.bottom - bug.y,
        );
        const edgeWeight = clamp((edgeMargin - edgeDistance) / edgeMargin, 0, 1);
        const outsideDistance = Math.max(0, -bug.x, bug.x - logicalWidth, -bug.y, bug.y - logicalHeight);
        const outsideWeight = clamp(outsideDistance / 150, 0, 1);
        const inwardHeading = Math.atan2(logicalHeight / 2 - bug.y, logicalWidth / 2 - bug.x);
        const edgeSteer = angleDifference(bug.heading, inwardHeading) * (edgeWeight * 1.5 + outsideWeight * 1.8);
        let pointerWeight = 0;
        let pointerSteer = 0;
        if (pointer.active) {
          const awayX = bug.x - pointer.x;
          const awayY = bug.y - pointer.y;
          const distance = Math.hypot(awayX, awayY);
          if (distance < 190) {
            pointerWeight = Math.pow(1 - distance / 190, 2);
            const fleeHeading = distance > 1 ? Math.atan2(awayY, awayX) : bug.heading + random(-Math.PI, Math.PI);
            pointerSteer = angleDifference(bug.heading, fleeHeading) * pointerWeight * 3.2;
          }
        }

        bug.turnRate += (bug.targetTurn + edgeSteer + pointerSteer - bug.turnRate) * Math.min(1, dt * 2.2);
        bug.heading += (bug.turnRate + pointerSteer * 2.4) * dt;
        let speed = bug.speed + (bug.targetSpeed - bug.speed) * Math.min(1, dt * 1.8);
        speed += pointerWeight * 90;
        if (bug.dartFor > 0) {
          bug.dartFor -= dt;
          bug.heading += angleDifference(bug.heading, bug.dartHeading) * Math.min(1, dt * 9);
          speed = bug.dartSpeed;
        }
        bug.speed = speed;

        const flutter = Math.sin(time * 8 + bug.phase) * 1.7;
        bug.x += Math.cos(bug.heading) * speed * dt + Math.cos(time * 5 + bug.phase) * flutter * dt;
        bug.y += Math.sin(bug.heading) * speed * dt + flutter * dt;
        constrainToSceneLane(bug, logicalWidth, edgeLane, dt);
        bug.y = wrap(bug.y, worldBounds.top, worldBounds.bottom);

        bug.trailIn -= dt;
        if (bug.trailIn <= 0) {
          bug.trail.unshift({ x: bug.x, y: bug.y });
          bug.trail.length = Math.min(bug.trail.length, 8);
          bug.trailIn = .035;
        }
      }

      function drawStar(star, time) {
        const wave = (Math.sin(time * star.rate + star.phase) + 1) / 2;
        const alpha = star.twinkle ? .16 + wave * .46 : .1 + wave * .12;
        context.globalAlpha = alpha * sceneStarReveal("dusk", star);
        context.fillStyle = star.color;
        context.shadowColor = star.twinkle ? star.color : "transparent";
        context.shadowBlur = star.twinkle ? 1.5 + wave * 2.8 : 0;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * (star.twinkle ? .9 + wave * .25 : 1), 0, Math.PI * 2);
        context.fill();
      }

      function drawFirefly(bug, time, opacity = 1) {
        const blink = Math.pow((Math.sin(time * bug.flickerRate + bug.phase) + 1) / 2, 5);
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        for (let i = bug.trail.length - 1; i >= 0; i -= 1) {
          const point = bug.trail[i];
          const fade = (1 - i / bug.trail.length) * .11 * opacity;
          context.globalAlpha = fade;
          context.fillStyle = bug.palette.trail;
          context.beginPath();
          context.arc(point.x, point.y, Math.max(.35, bug.radius * (1 - i / bug.trail.length) * .62), 0, Math.PI * 2);
          context.fill();
        }

        const haloRadius = 14 + blink * 5;
        context.globalAlpha = (.5 + blink * .5) * opacity;
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        const halo = bug.haloSprite;
        context.drawImage(spriteAtlas, halo.x, halo.y, halo.width, halo.height, bug.x - haloRadius, bug.y - haloRadius, haloRadius * 2, haloRadius * 2);

        context.globalAlpha = (.35 + blink * .63) * opacity;
        context.fillStyle = bug.palette.core;
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.beginPath();
        context.ellipse(bug.x, bug.y, bug.radius * 1.3, bug.radius * .82, bug.heading, 0, Math.PI * 2);
        context.fill();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        const time = elapsed;

        context.shadowBlur = 0;
        for (const star of stars) drawStar(star, time);
        if (!reducedMotion) for (const bug of fireflies) updateFirefly(bug, dt, time);
        drawActors(fireflies, drawFirefly, time, logicalWidth, logicalHeight);
        context.globalAlpha = 1;
        context.shadowBlur = 0;
      }

      function updatePointer(event) {
        const point = sceneCanvasPoint(event, canvas, logicalWidth, logicalHeight);
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.active = point.x >= 0 && point.x <= logicalWidth && point.y >= 0 && point.y <= logicalHeight;
      }

          return { render: renderScene, pointerMove: updatePointer, pointerLeave: () => { pointer.active = false; } };
    }

// Golden canvas animation, adapted from /animations/golden.html
function createGoldenScene() {
      const width = 1440;
      const height = 900;
      const color = "#2c2526";
      const edgeLane = (side) => sceneEdgeLane(side, width);
      const edgeTargetX = (side) => sceneEdgeTargetX(side, width);

      const flock = Array.from({ length: 14 }, (_, index) => {
        const side = index < 7 ? -1 : 1;
        return {
        side,
        x: edgeTargetX(side),
        y: height * .38 + random(-105, 105),
        heading: random(0, Math.PI * 2),
        speed: random(82, 112),
        cruiseSpeed: random(105, 145),
        scale: random(.62, .96),
        phase: random(0, Math.PI * 2),
        dartIn: random(3, 8),
        dartFor: 0,
        dartHeading: 0,
        dartSpeed: 0,
        targetX: edgeTargetX(side),
        targetY: random(100, height - 100),
        targetIn: random(3, 6),
      };
      });
      const leaders = [flock[0], flock[7]];
      let pointer = null;
      const clock = createSceneClock();
      let elapsed = 0;

      function pointerFlee(bird, radius) {
        if (!pointer) return null;
        const dx = bird.x - pointer.x;
        const dy = bird.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) return null;
        const angle = distance > .001 ? Math.atan2(dy, dx) : bird.phase;
        return { x: Math.cos(angle), y: Math.sin(angle), strength: 1 - distance / radius };
      }


      function moveLeader(leader, dt) {
        if (updateSceneTransitionMover("golden", leader, dt, width, height, 2.4)) return;
        leader.targetIn -= dt;
        if (leader.targetIn <= 0) {
          leader.targetX = edgeTargetX(leader.side);
          leader.targetY = random(65, height - 65);
          leader.targetIn = random(3.2, 6.2);
        }
        const flee = pointerFlee(leader, 230);
        const aim = flee
          ? Math.atan2(flee.y, flee.x)
          : Math.atan2(leader.targetY - leader.y, leader.targetX - leader.x);
        const weave = flee ? 0 : Math.sin(elapsed * 2.8 + leader.phase) * .16;
        const turnRate = flee ? 5 : 2.1;
        leader.heading += clamp(angleDifference(leader.heading, aim + weave), -turnRate * dt, turnRate * dt);
        leader.dartIn -= dt;
        let targetSpeed = leader.cruiseSpeed + (flee ? flee.strength * 155 : 0);
        if (flee) leader.dartFor = 0;
        if (!flee && leader.dartIn <= 0 && leader.dartFor <= 0) {
          leader.dartFor = random(.12, .2);
          leader.dartHeading = leader.heading + random(-.75, .75);
          leader.dartSpeed = random(175, 235);
          leader.dartIn = random(4, 8);
        }
        if (leader.dartFor > 0) {
          leader.dartFor -= dt;
          leader.heading += angleDifference(leader.heading, leader.dartHeading) * Math.min(1, dt * 7);
          targetSpeed = leader.dartSpeed;
        }
        leader.speed += (targetSpeed - leader.speed) * Math.min(1, dt * 2.8);
        leader.x += Math.cos(leader.heading) * leader.speed * dt;
        leader.y += Math.sin(leader.heading) * leader.speed * dt;
        constrainToSceneLane(leader, width, edgeLane, dt);
        leader.y = wrap(leader.y, -60, height + 60);
      }

      function moveFollowers(dt) {
        const snapshots = flock.map((bird) => ({ x: bird.x, y: bird.y, heading: bird.heading, speed: bird.speed, side: bird.side }));
        for (let index = 0; index < flock.length; index += 1) {
          const bird = flock[index];
          if (leaders.includes(bird)) continue;
          if (updateSceneTransitionMover("golden", bird, dt, width, height, 2.7)) continue;
          const leader = bird.side < 0 ? leaders[0] : leaders[1];
          const own = snapshots[index];
          let centerX = 0;
          let centerY = 0;
          let alignX = 0;
          let alignY = 0;
          let separationX = 0;
          let separationY = 0;
          let neighbors = 0;
          for (let otherIndex = 0; otherIndex < snapshots.length; otherIndex += 1) {
            if (otherIndex === index) continue;
            const other = snapshots[otherIndex];
            if (other.side !== bird.side) continue;
            const dx = other.x - own.x;
            const dy = other.y - own.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 220) {
              centerX += other.x;
              centerY += other.y;
              alignX += Math.cos(other.heading);
              alignY += Math.sin(other.heading);
              neighbors += 1;
            }
            if (distance > 0 && distance < 48) {
              const strength = (48 - distance) / 48;
              separationX -= dx / distance * strength;
              separationY -= dy / distance * strength;
            }
          }

          let steerX = Math.cos(leader.heading) * .55;
          let steerY = Math.sin(leader.heading) * .55;
          if (neighbors > 0) {
            centerX = centerX / neighbors - own.x;
            centerY = centerY / neighbors - own.y;
            const centerLength = Math.hypot(centerX, centerY) || 1;
            const alignLength = Math.hypot(alignX, alignY) || 1;
            steerX += centerX / centerLength * .9 + alignX / alignLength * .75;
            steerY += centerY / centerLength * .9 + alignY / alignLength * .75;
          }
          steerX += separationX * 1.6;
          steerY += separationY * 1.6;
          const flee = pointerFlee(bird, 205);
          if (flee) {
            steerX += flee.x * (2.2 + flee.strength * 2.2);
            steerY += flee.y * (2.2 + flee.strength * 2.2);
          }
          const desired = Math.atan2(steerY, steerX) + Math.sin(elapsed * 2.2 + bird.phase) * .12;
          const turnRate = flee ? 4.8 : 2.7;
          bird.heading += clamp(angleDifference(bird.heading, desired), -turnRate * dt, turnRate * dt);

          bird.dartIn -= dt;
          let targetSpeed = bird.cruiseSpeed + (flee ? flee.strength * 125 : 0);
          if (flee) bird.dartFor = 0;
          if (!flee && bird.dartIn <= 0 && bird.dartFor <= 0) {
            bird.dartFor = random(.1, .18);
            bird.dartHeading = bird.heading + random(-.8, .8);
            bird.dartSpeed = random(165, 225);
            bird.dartIn = random(4.5, 9);
          }
          if (bird.dartFor > 0) {
            bird.dartFor -= dt;
            bird.heading += angleDifference(bird.heading, bird.dartHeading) * Math.min(1, dt * 8);
            targetSpeed = bird.dartSpeed;
          }
          bird.speed += (targetSpeed - bird.speed) * Math.min(1, dt * 3.2);
          const flutter = Math.sin(elapsed * 3.5 + bird.phase) * 5;
          bird.x += (Math.cos(bird.heading) * bird.speed - Math.sin(bird.heading) * flutter + separationX * 65) * dt;
          bird.y += (Math.sin(bird.heading) * bird.speed + Math.cos(bird.heading) * flutter + separationY * 65) * dt;
          constrainToSceneLane(bird, width, edgeLane, dt);
          bird.y = wrap(bird.y, -60, height + 60);
        }
      }

      function drawSwallow(bird, time, opacity = 1) {
        context.save();
        context.translate(bird.x, bird.y);
        context.rotate(bird.heading);
        context.scale(bird.scale, bird.scale);
        context.fillStyle = color;
        context.globalAlpha = opacity;
        const wingBeat = Math.sin(time * 8 + bird.phase);
        context.beginPath();
        context.moveTo(-7, -1.6);
        context.bezierCurveTo(-13, -3.7, -20, -3.4, -25, -3.2);
        context.quadraticCurveTo(-19, -.9, -10, .5);
        context.closePath();
        context.fill();
        context.beginPath();
        context.moveTo(-7, 1.6);
        context.bezierCurveTo(-13, 3.7, -20, 3.4, -25, 3.2);
        context.quadraticCurveTo(-19, .9, -10, -.5);
        context.closePath();
        context.fill();

        for (const side of [-1, 1]) {
          context.save();
          context.translate(1, side * 1.2);
          context.rotate(side * (.08 + wingBeat * .16));
          context.beginPath();
          context.moveTo(1, side * 2.2);
          context.bezierCurveTo(-2, side * 7, -7, side * 16, -24, side * 20);
          context.bezierCurveTo(-13, side * 13, -9, side * 3, -4, side * 1);
          context.quadraticCurveTo(-1, side * .5, 1, side * 2.2);
          context.closePath();
          context.fill();
          context.restore();
        }

        context.beginPath();
        context.moveTo(10, 0);
        context.bezierCurveTo(5, -3.1, -1, -4.2, -8, -3.8);
        context.bezierCurveTo(-14, -3.4, -19, -1.5, -21, -.5);
        context.bezierCurveTo(-15, -.1, -10, .4, -7, .8);
        context.bezierCurveTo(-12, 1.5, -16, 2.5, -18, 3.3);
        context.bezierCurveTo(-10, 4.8, -1, 4, 6, 2.8);
        context.quadraticCurveTo(10, 1.5, 10, 0);
        context.closePath();
        context.fill();
        context.beginPath();
        context.arc(7.3, 0, 2.1, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(8.3, -.8);
        context.lineTo(11.2, 0);
        context.lineTo(8.3, .8);
        context.closePath();
        context.fill();

        context.restore();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        if (!reducedMotion) {
          for (const leader of leaders) moveLeader(leader, dt);
          moveFollowers(dt);
        }
        drawActors(flock, drawSwallow, elapsed, width, height);
      }

      function pointerMove(event) {
        const point = sceneCanvasPoint(event, canvas, width, height);
        pointer = point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height ? point : null;
      }
          return { render: renderScene, pointerMove: pointerMove, pointerLeave: () => { pointer = null; } };
    }

// Morning canvas animation, adapted from /animations/morning.html
function createMorningScene() {
      const width = 1440;
      const height = 900;
      const pointer = { x: 0, y: 0, active: false };
      const clock = createSceneClock();
      let elapsed = 0;
      const edgeLane = (side) => sceneEdgeLane(side, width);
      const edgeTargetX = (side) => sceneEdgeTargetX(side, width);

      const colorChannels = (color) => color[0] === "#"
        ? [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 1]
        : color.match(/[\d.]+/g).map(Number);
      const blendColor = (from, to, amount) => {
        const a = colorChannels(from);
        const b = colorChannels(to);
        return `rgba(${Math.round(a[0] + (b[0] - a[0]) * amount)},${Math.round(a[1] + (b[1] - a[1]) * amount)},${Math.round(a[2] + (b[2] - a[2]) * amount)},${a[3] + (b[3] - a[3]) * amount})`;
      };
      const wingPalettes = [
        { glow: "#b2d8bb", colors: ["rgba(171,211,158,.76)", "rgba(145,197,164,.64)", "rgba(205,227,179,.52)"], pale: ["rgba(238,245,226,.82)", "rgba(220,237,220,.7)", "rgba(231,242,222,.58)"] },
        { glow: "#cbd8a9", colors: ["rgba(198,211,153,.76)", "rgba(169,197,143,.64)", "rgba(222,228,183,.52)"], pale: ["rgba(246,243,224,.82)", "rgba(229,235,213,.7)", "rgba(240,239,221,.58)"] },
        { glow: "#c5b9da", colors: ["rgba(190,171,218,.76)", "rgba(168,164,211,.64)", "rgba(219,196,226,.52)"], pale: ["rgba(242,235,244,.82)", "rgba(226,222,239,.7)", "rgba(238,230,242,.58)"] },
        { glow: "#d5b5d2", colors: ["rgba(216,177,211,.76)", "rgba(190,166,207,.64)", "rgba(230,201,224,.52)"], pale: ["rgba(247,236,242,.82)", "rgba(232,222,239,.7)", "rgba(242,231,240,.58)"] },
        { glow: "#afcddd", colors: ["rgba(158,197,218,.76)", "rgba(147,178,215,.64)", "rgba(190,218,226,.52)"], pale: ["rgba(235,243,246,.82)", "rgba(216,230,243,.7)", "rgba(228,240,245,.58)"] },
        { glow: "#b5c2dc", colors: ["rgba(164,181,218,.76)", "rgba(148,177,218,.64)", "rgba(195,211,231,.52)"], pale: ["rgba(237,240,247,.82)", "rgba(218,230,244,.7)", "rgba(230,237,246,.58)"] },
      ];
      const dragonflies = Array.from({ length: 8 }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        return {
        side,
        x: edgeTargetX(side),
        y: 130 + Math.floor(index / 4) * 520 + random(-90, 90),
        heading: random(0, Math.PI * 2),
        speed: random(75, 105),
        cruiseSpeed: random(105, 150),
        scale: random(.52, .72),
        phase: random(0, Math.PI * 2),
        targetX: edgeTargetX(side),
        targetY: random(70, height - 70),
        targetIn: random(1, 3),
        dartIn: random(2, 5),
        dartFor: 0,
        dartHeading: 0,
        dartSpeed: 0,
        wingPaletteIndex: Math.floor(Math.random() * wingPalettes.length),
        wingPaletteTargetIndex: -1,
        wingPaletteProgress: 1,
        wingPaletteDuration: random(2.2, 3.5),
        wingPaletteIn: random(3, 6),
      };
      });


      function pointerMove(event) {
        const point = sceneCanvasPoint(event, canvas, width, height);
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.active = point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
      }

      function steer(dragonfly, dt) {
        if (updateSceneTransitionMover("morning", dragonfly, dt, width, height, 3.2)) return;
        if (dragonfly.wingPaletteTargetIndex < 0) dragonfly.wingPaletteTargetIndex = dragonfly.wingPaletteIndex;
        if (dragonfly.wingPaletteTargetIndex !== dragonfly.wingPaletteIndex) {
          dragonfly.wingPaletteProgress += dt / dragonfly.wingPaletteDuration;
          if (dragonfly.wingPaletteProgress >= 1) {
            dragonfly.wingPaletteIndex = dragonfly.wingPaletteTargetIndex;
            dragonfly.wingPaletteProgress = 1;
            dragonfly.wingPaletteIn = random(3, 6);
          }
        } else {
          dragonfly.wingPaletteIn -= dt;
          if (dragonfly.wingPaletteIn <= 0) {
            dragonfly.wingPaletteTargetIndex = (dragonfly.wingPaletteIndex + 1 + Math.floor(Math.random() * (wingPalettes.length - 1))) % wingPalettes.length;
            dragonfly.wingPaletteProgress = 0;
            dragonfly.wingPaletteDuration = random(2.2, 3.5);
          }
        }

        dragonfly.targetIn -= dt;
        if (dragonfly.targetIn <= 0) {
          dragonfly.targetX = edgeTargetX(dragonfly.side);
          dragonfly.targetY = random(50, height - 50);
          dragonfly.targetIn = random(1.2, 3.4);
        }

        dragonfly.dartIn -= dt;
        if (dragonfly.dartIn <= 0 && dragonfly.dartFor <= 0) {
          dragonfly.dartFor = random(.12, .22);
          dragonfly.dartHeading = dragonfly.heading + random(-1.15, 1.15);
          dragonfly.dartSpeed = random(240, 330);
          dragonfly.dartIn = random(2.4, 5.2);
        }

        let flee = 0;
        let desired = Math.atan2(dragonfly.targetY - dragonfly.y, dragonfly.targetX - dragonfly.x);
        if (pointer.active) {
          const awayX = dragonfly.x - pointer.x;
          const awayY = dragonfly.y - pointer.y;
          const distance = Math.hypot(awayX, awayY);
          if (distance < 250) {
            flee = Math.pow(1 - distance / 250, 2);
            const away = distance > 1 ? Math.atan2(awayY, awayX) : dragonfly.heading + random(-Math.PI, Math.PI);
            desired += angleDifference(desired, away) * Math.min(1, flee * 1.8);
          }
        }

        let spacingX = 0;
        let spacingY = 0;
        for (const other of dragonflies) {
          if (other === dragonfly || other.side !== dragonfly.side) continue;
          const dx = dragonfly.x - other.x;
          const dy = dragonfly.y - other.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < 40) {
            const weight = (40 - distance) / 40;
            spacingX += dx / distance * weight;
            spacingY += dy / distance * weight;
          }
        }
        if (Math.hypot(spacingX, spacingY) > .01) {
          const away = Math.atan2(spacingY, spacingX);
          desired += angleDifference(desired, away) * Math.min(.8, Math.hypot(spacingX, spacingY));
        }

        const turnRate = 3.2 + flee * 6.5;
        dragonfly.heading += clamp(angleDifference(dragonfly.heading, desired), -turnRate * dt, turnRate * dt);
        let targetSpeed = dragonfly.cruiseSpeed * (1 + flee * 1.8);
        if (dragonfly.dartFor > 0) {
          dragonfly.dartFor -= dt;
          dragonfly.heading += angleDifference(dragonfly.heading, dragonfly.dartHeading) * Math.min(1, dt * 12);
          targetSpeed = dragonfly.dartSpeed;
        }
        dragonfly.speed += (targetSpeed - dragonfly.speed) * Math.min(1, dt * (3 + flee * 5));
        const flutter = Math.sin(elapsed * 6.3 + dragonfly.phase) * 13 + Math.sin(elapsed * 2.7 + dragonfly.phase) * 6;
        dragonfly.x += (Math.cos(dragonfly.heading) * dragonfly.speed - Math.sin(dragonfly.heading) * flutter) * dt;
        dragonfly.y += (Math.sin(dragonfly.heading) * dragonfly.speed + Math.cos(dragonfly.heading) * flutter) * dt;
        constrainToSceneLane(dragonfly, width, edgeLane, dt);
        dragonfly.y = wrap(dragonfly.y, -70, height + 70);
      }

      function drawDragonfly(dragonfly, time, opacity = 1) {
        context.save();
        context.globalAlpha = opacity;
        context.translate(dragonfly.x, dragonfly.y);
        context.rotate(dragonfly.heading);
        context.scale(dragonfly.scale, dragonfly.scale);
        const flap = Math.sin(time * 86 + dragonfly.phase);
        const fromPalette = wingPalettes[dragonfly.wingPaletteIndex];
        const toPalette = wingPalettes[dragonfly.wingPaletteTargetIndex < 0 ? dragonfly.wingPaletteIndex : dragonfly.wingPaletteTargetIndex];
        const paletteBlend = dragonfly.wingPaletteTargetIndex === dragonfly.wingPaletteIndex ? 0 : clamp(dragonfly.wingPaletteProgress, 0, 1);
        const wingPalette = {
          glow: blendColor(fromPalette.glow, toPalette.glow, paletteBlend),
          color: blendColor(fromPalette.colors[1], toPalette.colors[1], paletteBlend),
          pale: blendColor(fromPalette.pale[1], toPalette.pale[1], paletteBlend),
        };
        for (const side of [-1, 1]) {
          for (const [rootX, length, width, sweep, whitePair] of [[4, 18, 1.9, .22, false], [-5.5, 16, 1.8, -.18, true]]) {
            context.save();
            context.translate(rootX, side * 1.8);
            const pairFlap = whitePair ? Math.sin(time * 86 + dragonfly.phase + .85) : flap;
            context.rotate(side * (sweep + pairFlap * .3));
            context.fillStyle = whitePair ? wingPalette.pale : wingPalette.color;
            context.globalAlpha = (whitePair ? .72 : .68) * opacity;
            context.shadowColor = wingPalette.glow;
            context.shadowBlur = whitePair ? .7 : 1.25 + Math.max(0, pairFlap) * .7;
            context.beginPath();
            context.ellipse(0, side * length * .48, width, length * .53, side * -.035, 0, Math.PI * 2);
            context.fill();
            context.shadowBlur = 0;
            context.globalAlpha = (whitePair ? .42 : .34) * opacity;
            context.strokeStyle = whitePair ? "rgba(255,255,255,.8)" : wingPalette.glow;
            context.lineWidth = .35;
            context.beginPath();
            context.moveTo(0, side * 1.5);
            context.lineTo(0, side * (length - .5));
            context.moveTo(-width * .7, side * (length * .38));
            context.lineTo(width * .7, side * (length * .46));
            context.moveTo(-width * .7, side * (length * .64));
            context.lineTo(width * .7, side * (length * .72));
            context.stroke();
            context.restore();
          }
        }

        context.globalAlpha = .94 * opacity;
        context.fillStyle = "#263a34";
        context.beginPath();
        context.ellipse(-5, 0, 11, 1.35, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.ellipse(2, 0, 3.2, 2.5, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(8, 0, 2.1, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = .72 * opacity;
        context.fillStyle = "rgba(255,255,255,.6)";
        context.beginPath();
        context.arc(8.8, -.75, .55, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        if (!reducedMotion) for (const dragonfly of dragonflies) steer(dragonfly, dt);
        drawActors(dragonflies, drawDragonfly, elapsed, width, height);
      }

          return { render: renderScene, pointerMove: pointerMove, pointerLeave: () => { pointer.active = false; } };
    }

// Night canvas animation, adapted from /animations/night.html
function createNightScene() {
      const viewBox = { width: 1440, height: 900 };
      let rotation = 0;
      const clock = createSceneClock();

      const backgroundStars = [[131.700,151.080,0.710,"#c6d9ff",true,0.000000,0.00200],
        [325.680,275.100,0.532,"#f0f3fb",true,2.399963,0.00224],
        [573.720,118.220,0.532,"#fff0d0",true,4.799926,0.00248],
        [902.320,214.680,0.710,"#f5f6ff",false,0.916704,0.00272],
        [1158.840,102.320,0.532,"#a9c6ff",false,3.316668,0.00296],
        [1334.800,282.520,0.710,"#fff6e7",false,5.716631,0.00320],
        [1059.200,390.640,0.361,"#ffe2b5",false,1.833409,0.00344],
        [476.200,349.300,0.532,"#e8efff",false,4.233372,0.00368],
        [762.400,68.400,0.459,"#c6d9ff",false,0.350150,0.00392],
        [1419.600,147.900,0.496,"#f0f3fb",false,2.750113,0.00416],
        [720.000,471.200,0.428,"#fff0d0",true,5.150076,0.00440],
        [54.320,354.600,0.428,"#f5f6ff",true,1.266854,0.00200],
        [253.600,55.680,0.569,"#a9c6ff",true,3.666818,0.00224],
        [428.500,195.600,0.361,"#fff6e7",false,6.066781,0.00248],
        [672.300,312.200,0.496,"#ffe2b5",false,2.183559,0.00272],
        [826.000,84.300,0.428,"#e8efff",false,4.583522,0.00296],
        [1000.900,331.280,0.532,"#c6d9ff",false,0.700300,0.00320],
        [1239.400,428.800,0.392,"#f0f3fb",false,3.100263,0.00344],
        [1403.700,513.600,0.496,"#fff0d0",false,5.500226,0.00368],
        [550.400,503.000,0.361,"#f5f6ff",false,1.617004,0.00392],
        [4.500,79.000,0.496,"#a9c6ff",true,4.016967,0.00416],
        [730.600,248.600,0.428,"#fff6e7",true,0.133745,0.00440],
        [1440.800,365.200,0.532,"#ffe2b5",true,2.533709,0.00200],
        [36.300,550.700,0.428,"#e8efff",false,4.933672,0.00224],
        [794.200,545.400,0.496,"#c6d9ff",false,1.050450,0.00248],
        [1366.600,619.600,0.459,"#f0f3fb",false,3.450413,0.00272],
        [492.100,26.000,0.428,"#fff0d0",false,5.850376,0.00296],
        [1122.800,534.800,0.392,"#f5f6ff",false,1.967154,0.00320],
        [317.200,704.400,0.532,"#a9c6ff",false,4.367117,0.00344],
        [741.200,778.600,0.606,"#fff6e7",false,0.483895,0.00368],
        [1186.400,715.000,0.459,"#ffe2b5",true,2.883859,0.00392],
        [41.600,810.400,0.496,"#e8efff",true,5.283822,0.00416],
        [1398.400,842.200,0.569,"#c6d9ff",true,1.400600,0.00440],
        [809.803,842.741,0.312,"#f0f3fb",false,3.800563,0.00200],
        [554.195,562.371,0.489,"#fff0d0",false,6.200526,0.00224],
        [209.197,76.424,0.300,"#f5f6ff",false,2.317304,0.00248],
        [1177.517,205.405,0.373,"#a9c6ff",false,4.717267,0.00272],
        [1309.233,851.295,0.453,"#fff6e7",false,0.834045,0.00296],
        [877.823,836.487,0.483,"#ffe2b5",false,3.234008,0.00320],
        [1119.196,772.738,0.398,"#e8efff",false,5.633972,0.00344],
        [595.079,691.076,0.477,"#c6d9ff",true,1.750750,0.00368],
        [1226.744,100.062,0.422,"#f0f3fb",true,4.150713,0.00392],
        [1382.595,56.284,0.441,"#fff0d0",true,0.267491,0.00416],
        [139.215,729.755,0.294,"#f5f6ff",false,2.667454,0.00440],
        [749.298,395.601,0.379,"#a9c6ff",false,5.067417,0.00200],
        [813.248,168.952,0.447,"#fff6e7",false,1.184195,0.00224],
        [206.123,616.452,0.471,"#ffe2b5",false,3.584158,0.00248],
        [76.135,441.064,0.275,"#e8efff",false,5.984122,0.00272],
        [507.862,708.958,0.483,"#c6d9ff",false,2.100899,0.00296],
        [413.247,42.896,0.318,"#f0f3fb",false,4.500863,0.00320],
        [1011.129,160.366,0.477,"#fff0d0",true,0.617641,0.00344],
        [1085.265,191.349,0.428,"#f5f6ff",true,3.017604,0.00368],
        [442.757,635.839,0.373,"#a9c6ff",true,5.417567,0.00392],
        [1259.964,704.665,0.281,"#fff6e7",false,1.534345,0.00416],
        [95.130,629.914,0.379,"#ffe2b5",false,3.934308,0.00440],
        [939.155,141.381,0.330,"#e8efff",false,0.051086,0.00200],
        [974.888,59.782,0.318,"#c6d9ff",false,2.451049,0.00224],
        [1373.395,713.442,0.275,"#f0f3fb",false,4.851013,0.00248],
        [1231.938,286.092,0.367,"#fff0d0",false,0.967791,0.00272],
        [426.497,773.247,0.447,"#f5f6ff",false,3.367754,0.00296],
        [1174.411,305.522,0.367,"#a9c6ff",true,5.767717,0.00320],
        [813.386,365.529,0.502,"#fff6e7",true,1.884495,0.00344],
        [593.659,614.629,0.367,"#ffe2b5",true,4.284458,0.00368],
        [827.579,783.253,0.428,"#e8efff",false,0.401236,0.00392],
        [1011.701,234.216,0.294,"#c6d9ff",false,2.801199,0.00416],
        [1316.674,766.770,0.471,"#f0f3fb",false,5.201163,0.00440],
        [1143.703,829.756,0.410,"#fff0d0",false,1.317940,0.00200],
        [158.454,852.344,0.288,"#f5f6ff",false,3.717904,0.00224],
        [1375.101,316.451,0.312,"#a9c6ff",false,6.117867,0.00248],
        [627.844,814.799,0.337,"#fff6e7",false,2.234645,0.00272],
        [1051.515,800.012,0.300,"#ffe2b5",true,4.634608,0.00296],
        [907.196,54.079,0.483,"#e8efff",true,0.751386,0.00320],
        [229.633,767.163,0.355,"#c6d9ff",true,3.151349,0.00344],
        [645.959,65.623,0.281,"#f0f3fb",false,5.551312,0.00368],
        [412.706,697.436,0.465,"#fff0d0",false,1.668090,0.00392],
        [210.000,235.000,0.802,"#c6d9ff",false,4.068054,0.00416],
        [238.000,218.000,0.635,"#f0f3fb",false,0.184832,0.00440],
        [266.000,226.000,0.733,"#fff0d0",false,2.584795,0.00200],
        [286.000,250.000,0.600,"#f5f6ff",false,4.984758,0.00224],
        [318.000,255.000,0.802,"#a9c6ff",false,1.101536,0.00248],
        [935.000,390.000,0.733,"#c6d9ff",true,3.501499,0.00272],
        [962.000,365.000,0.571,"#f0f3fb",true,5.901462,0.00296],
        [990.000,377.000,0.704,"#fff0d0",true,2.018240,0.00320],
        [1008.000,405.000,0.600,"#f5f6ff",false,4.418204,0.00344],
        [1036.000,396.000,0.733,"#a9c6ff",false,0.534981,0.00368]] .map(([x, y, radius, color, glow, phase, rate]) => ({ x, y, radius, color, glow, phase, rate }));
      // d3-celestial (Olaf Frohn), IAU-style western constellation line figures.
      const constellationPaths = {"Ursa Major":[[[-176.1435,57.0326,3.32,0.077],[165.932,61.751,1.81,1.061],[165.4603,56.3824,2.34,0.033],[178.4577,53.6948,2.41,0.044],[-176.1435,57.0326,3.32,0.077],[-166.4927,55.9598,1.76,-0.022],[-159.0186,54.9254,2.23,0.057],[-153.1148,49.3133,1.85,-0.099]],[[178.4577,53.6948,2.41,0.044],[176.5126,47.7794,3.69,1.181],[169.6197,33.0943,3.49,1.4],[169.5468,31.5308,3.79,0.606]],[[176.5126,47.7794,3.69,1.181],[167.4159,44.4985,3,1.144],[155.5823,41.4995,3.06,1.603]],[[167.4159,44.4985,3,1.144],[154.2741,42.9144,3.45,0.029]],[[165.932,61.751,1.81,1.061],[142.8821,63.0619,3.65,0.36],[127.5661,60.7182,3.35,0.856],[147.7473,59.0387,3.78,0.291],[165.4603,56.3824,2.34,0.033]],[[165.4603,56.3824,2.34,0.033],[148.0265,54.0643,4.55,0.038],[143.2143,51.6773,3.17,0.475],[134.8019,48.0418,3.12,0.223]],[[135.9064,47.1565,3.57,0.007],[143.2143,51.6773,3.17,0.475]]],"Orion":[[[91.893,14.7685,4.42,-0.164],[88.5958,20.2762,4.39,0.594],[90.9799,20.1385,4.64,0.236],[92.985,14.2088,4.45,-0.18],[90.5958,9.6473,4.12,0.17],[88.7929,7.4071,0.45,1.5],[81.2828,6.3497,1.64,-0.224],[73.7239,10.1508,4.64,0.085]],[[74.6371,1.714,4.47,1.369],[73.5629,2.4407,3.71,-0.179],[72.8015,5.6051,3.68,-0.157],[72.46,6.9613,3.19,0.484],[72.653,8.9002,4.35,0.01],[73.7239,10.1508,4.64,0.085],[74.0928,13.5145,4.06,1.158],[76.1423,15.4041,4.65,-0.064],[77.4248,15.5972,4.81,0.313]],[[78.6345,-8.2016,0.18,-0.03],[81.1192,-2.3971,3.35,-0.24],[83.0017,-0.2991,2.25,-0.175],[81.2828,6.3497,1.64,-0.224],[83.7845,9.9342,3.39,-0.16],[88.7929,7.4071,0.45,1.5],[85.1897,-1.9426,1.74,-0.199],[86.9391,-9.6696,2.07,-0.168]],[[85.1897,-1.9426,1.74,-0.199],[84.0534,-1.2019,1.69,-0.184],[83.0017,-0.2991,2.25,-0.175]]],"Gemini":[[[93.7194,22.5068,3.31,1.6],[95.7401,22.5136,2.87,1.621],[100.983,25.1311,3.06,1.377],[107.7849,30.2452,4.41,1.261],[113.6494,31.8883,1.58,0.034],[116.329,28.0262,1.16,0.991],[113.9806,26.8957,4.06,1.54],[110.0307,21.9823,3.5,0.374],[106.0272,20.5703,4.01,0.899],[99.4279,16.3993,1.93,0.001],[101.3224,12.8956,3.35,0.443]],[[110.0307,21.9823,3.5,0.374],[109.5232,16.5404,3.58,0.106]]],"Virgo":[[[176.4648,6.5294,4.04,1.501],[177.6738,1.7647,3.59,0.518],[-175.0235,-0.6668,3.89,0.026],[-169.5848,-1.4494,2.74,0.368],[-162.5125,-5.539,4.38,-0.008],[-158.7018,-11.1613,0.98,-0.235],[-145.9964,-6.0005,4.07,0.511],[-139.2349,-5.6582,3.87,0.385]],[[-164.4558,10.9592,2.85,0.934],[-166.0991,3.3975,3.39,1.571],[-169.5848,-1.4494,2.74,0.368]],[[-162.5125,-5.539,4.38,-0.008],[-156.3267,-0.5958,3.38,0.114],[-149.5884,1.5445,4.23,0.121],[-138.4378,1.8929,3.73,-0.005]]],"Libra":[[[-133.9824,-25.282,3.25,1.674],[-137.2804,-16.0418,2.75,0.147],[-130.7483,-9.3829,2.61,-0.071],[-126.1184,-14.7895,3.91,1.007],[-125.744,-28.1351,3.6,1.361],[-125.336,-29.7778,3.66,-0.177]],[[-137.2804,-16.0418,2.75,0.147],[-126.1184,-14.7895,3.91,1.007]]]};
      const colorFromBV = (bv) => bv < -.15 ? "#c9dcff" : bv < .15 ? "#eef3ff" : bv < .45 ? "#fff1d4" : bv < .9 ? "#ffe1ad" : "#ffc98c";
      const pointKey = (point) => `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
      const pointByKey = new Map();
      const dipperStarKeys = new Set(constellationPaths["Ursa Major"][0].map(pointKey));
      for (const [name, paths] of Object.entries(constellationPaths)) {
        paths.forEach((path, pathIndex) => {
          const points = path.map((point) => {
            const key = pointKey(point);
            if (!pointByKey.has(key)) pointByKey.set(key, { id: key, lon: point[0], dec: point[1], mag: point[2], bv: point[3] });
            return pointByKey.get(key);
          });
        });
      }
      const constellationStars = [...pointByKey.values()];
      const radians = Math.PI / 180;
      const centerRa = 10.3 * 15 * radians;
      const centerDec = 20 * radians;
      const projected = constellationStars.map((star) => {
        const ra = ((star.lon + 360) % 360) * radians;
        const dec = star.dec * radians;
        const deltaRa = ra - centerRa;
        const denominator = 1 + Math.sin(centerDec) * Math.sin(dec) + Math.cos(centerDec) * Math.cos(dec) * Math.cos(deltaRa);
        const factor = 2 / denominator;
        return { ...star, x: -factor * Math.cos(dec) * Math.sin(deltaRa), y: -factor * (Math.cos(centerDec) * Math.sin(dec) - Math.sin(centerDec) * Math.cos(dec) * Math.cos(deltaRa)) };
      });
      const projectedBounds = {
        minX: Math.min(...projected.map((star) => star.x)),
        maxX: Math.max(...projected.map((star) => star.x)),
        minY: Math.min(...projected.map((star) => star.y)),
        maxY: Math.max(...projected.map((star) => star.y)),
      };
      const projectedCenterX = (projectedBounds.minX + projectedBounds.maxX) / 2;
      const projectedCenterY = (projectedBounds.minY + projectedBounds.maxY) / 2;
      const projectedScale = Math.min(viewBox.width * .9 / (projectedBounds.maxX - projectedBounds.minX), viewBox.height * .82 / (projectedBounds.maxY - projectedBounds.minY));
      projected.forEach((star, index) => Object.assign(star, {
        x: viewBox.width / 2 + (star.x - projectedCenterX) * projectedScale,
        y: viewBox.height / 2 + (star.y - projectedCenterY) * projectedScale,
        radius: .68 + Math.max(0, 3.5 - star.mag) * .18 + (dipperStarKeys.has(star.id) ? .24 : 0),
        color: colorFromBV(star.bv),
        glow: dipperStarKeys.has(star.id) || index % 3 === 0,
        phase: (index * 2.399963229728653) % (Math.PI * 2),
        rate: .002 + (index % 11) * .00024,
      }));
      const stars = [...backgroundStars, ...projected].map((star) => ({ ...star, revealDelay: Math.random() * 2600 }));
      const glowSprites = new Map();
      for (const star of stars) {
        if (!star.glow || glowSprites.has(star.color)) continue;
        const sprite = allocateSprite(32, 32);
        const channels = star.color.startsWith("#")
          ? [parseInt(star.color.slice(1, 3), 16), parseInt(star.color.slice(3, 5), 16), parseInt(star.color.slice(5, 7), 16)]
          : star.color.match(/[\d.]+/g).slice(0, 3).map(Number);
        const halo = spriteContext.createRadialGradient(sprite.x + 16, sprite.y + 16, 0, sprite.x + 16, sprite.y + 16, 16);
        halo.addColorStop(0, `rgba(${channels[0]},${channels[1]},${channels[2]},.44)`);
        halo.addColorStop(.22, `rgba(${channels[0]},${channels[1]},${channels[2]},.24)`);
        halo.addColorStop(.58, `rgba(${channels[0]},${channels[1]},${channels[2]},.08)`);
        halo.addColorStop(1, `rgba(${channels[0]},${channels[1]},${channels[2]},0)`);
        spriteContext.fillStyle = halo;
        spriteContext.fillRect(sprite.x, sprite.y, 32, 32);
        glowSprites.set(star.color, sprite);
      }
      let meteor = null;
      let nextMeteorIn = random(0, 5);

      function startMeteor() {
        const direction = Math.random() < .5 ? 1 : -1;
        const startX = direction > 0 ? -random(0, 180) : viewBox.width + random(0, 180);
        const startY = random(0, viewBox.height * .48) - 60;
        const endX = direction > 0 ? viewBox.width + random(0, 260) : -random(0, 260);
        const endY = viewBox.height * random(.58, 1.13);
        const duration = random(200, 1400);
        const speedFactor = (1400 - duration) / 1200;
        meteor = {
          x: startX,
          y: startY,
          dx: endX - startX,
          dy: endY - startY,
          angle: Math.atan2(endY - startY, endX - startX),
          duration,
          progress: 0,
          length: 72 + speedFactor * 76 + random(0, 20),
          width: .75 + speedFactor * .35,
          radius: random(.72, 1.12),
        };
      }

      function updateMeteor(dt) {
        if (!meteor) {
          nextMeteorIn -= dt;
          if (nextMeteorIn <= 0) startMeteor();
          return;
        }
        meteor.progress += dt * 1000 / meteor.duration;
        if (meteor.progress >= 1) {
          meteor = null;
          nextMeteorIn = random(3, 12);
        }
      }

      function drawMeteor() {
        if (!meteor) return;
        const progress = meteor.progress;
        const fadeIn = Math.min(1, progress / .06);
        const fadeOut = Math.min(1, (1 - progress) / .16);
        context.save();
        context.translate(meteor.x + meteor.dx * progress, meteor.y + meteor.dy * progress);
        context.rotate(meteor.angle);
        context.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
        context.shadowColor = "#ffd27a";
        context.shadowBlur = 2.5;
        const tailGradient = context.createLinearGradient(-meteor.length, 0, 0, 0);
        tailGradient.addColorStop(0, "rgba(255,243,207,0)");
        tailGradient.addColorStop(.76, "rgba(255,230,170,.08)");
        tailGradient.addColorStop(.94, "rgba(255,210,122,.48)");
        tailGradient.addColorStop(1, "rgba(255,240,187,1)");
        context.strokeStyle = tailGradient;
        context.lineWidth = meteor.width;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(-meteor.length, 0);
        context.lineTo(0, 0);
        context.stroke();
        context.shadowBlur = 0;
        context.fillStyle = "#fff0bb";
        context.beginPath();
        context.arc(0, 0, meteor.radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }


      function renderScene(time) {
        const { dt } = clock(time);
        rotation = (rotation + dt * Math.PI * 2 / 1800) % (Math.PI * 2);
        updateMeteor(dt);
        const centerX = viewBox.width / 2;
        const centerY = viewBox.height / 2;
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        for (const star of stars) {
          const wave = (Math.sin(time * star.rate + star.phase) + 1) / 2;
          const dx = star.x - centerX;
          const dy = star.y - centerY;
          const x = centerX + dx * cosine - dy * sine;
          const y = centerY + dx * sine + dy * cosine;
          context.fillStyle = star.color;
          if (star.glow) {
            const haloSize = 10 + star.radius * 3;
            context.globalAlpha = (.2 + wave * .25) * sceneStarReveal("night", star);
            const sprite = glowSprites.get(star.color);
            context.drawImage(spriteAtlas, sprite.x, sprite.y, sprite.width, sprite.height, x - haloSize / 2, y - haloSize / 2, haloSize, haloSize);
          }
          context.globalAlpha = (.34 + wave * .56) * sceneStarReveal("night", star);
          context.shadowBlur = 0;
          context.beginPath();
          context.arc(x, y, star.radius * (.9 + wave * .2), 0, Math.PI * 2);
          context.fill();
        }
        drawMeteor();
      }

          return { render: renderScene };
    }

// Noon canvas animation, adapted from /animations/noon.html
function createNoonScene() {
      const width = 1440;
      const height = 900;
      const edgeLane = (side) => sceneEdgeLane(side, width);
      const edgeTargetX = (side) => sceneEdgeTargetX(side, width);

      const palettes = [
        { fore: ["rgba(244,133,131,.94)", "rgba(255,191,112,.9)"], hind: ["rgba(255,194,111,.92)", "rgba(245,145,160,.88)"] },
        { fore: ["rgba(105,146,232,.94)", "rgba(183,135,225,.9)"], hind: ["rgba(181,135,225,.92)", "rgba(116,191,225,.88)"] },
        { fore: ["rgba(235,116,164,.94)", "rgba(255,176,141,.9)"], hind: ["rgba(255,185,137,.92)", "rgba(236,132,178,.88)"] },
        { fore: ["rgba(97,183,151,.94)", "rgba(212,199,104,.9)"], hind: ["rgba(210,198,105,.92)", "rgba(109,190,161,.88)"] },
      ];
      function makeWingSprite(colors, forewing) {
        const sprite = allocateSprite(80, 64);
        spriteContext.save();
        spriteContext.translate(sprite.x, sprite.y);
        spriteContext.scale(2, 2);
        spriteContext.translate(16, 4);
        const gradient = spriteContext.createLinearGradient(-8, 3, 18, 19);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(.58, colors[1]);
        gradient.addColorStop(1, colors[0]);
        spriteContext.fillStyle = gradient;
        spriteContext.beginPath();
        if (forewing) {
          spriteContext.moveTo(0, 0);
          spriteContext.bezierCurveTo(3, 4, 10, 3, 14, 7);
          spriteContext.bezierCurveTo(23, 14, 20, 24, 10, 23);
          spriteContext.bezierCurveTo(2, 22, -2, 10, 0, 0);
        } else {
          spriteContext.moveTo(0, 0);
          spriteContext.bezierCurveTo(-4, 4, -11, 5, -12, 11);
          spriteContext.bezierCurveTo(-13, 19, -4, 23, 2, 18);
          spriteContext.bezierCurveTo(6, 13, 4, 5, 0, 0);
        }
        spriteContext.closePath();
        spriteContext.fill();
        spriteContext.restore();
        return sprite;
      }
      const wingSprites = palettes.map((palette) => [
        makeWingSprite(palette.fore, true),
        makeWingSprite(palette.hind, false),
      ]);
      const butterflies = Array.from({ length: 7 }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        return {
        side,
        x: edgeTargetX(side),
        y: 160 + Math.floor(index / 4) * 500 + random(-80, 80),
        heading: random(0, Math.PI * 2),
        speed: random(38, 54),
        cruiseSpeed: random(50, 86),
        scale: random(.7, .96),
        phase: random(0, Math.PI * 2),
        targetX: edgeTargetX(side),
        targetY: random(60, height - 60),
        targetIn: random(4, 7),
        paletteIndex: index % palettes.length,
        palette: palettes[index % palettes.length],
        flapCycle: random(2.3, 3.1),
        flapBeats: Math.random() < .45 ? 1 : 2,
        isChaser: false,
        isChased: false,
      };
      });
      const clock = createSceneClock();
      let elapsed = 0;
      let chaserIndex = 0;
      let chaseTargetIndex = butterflies.findIndex((butterfly, index) => index !== chaserIndex && butterfly.side === butterflies[chaserIndex].side);
      let chaseTime = random(7, 11);
      butterflies[chaserIndex].isChaser = true;
      butterflies[chaseTargetIndex].isChased = true;


      function updateChase(dt) {
        chaseTime -= dt;
        const chaser = butterflies[chaserIndex];
        const target = butterflies[chaseTargetIndex];
        const distance = Math.hypot(target.x - chaser.x, target.y - chaser.y);
        if (chaseTime > 0 && distance > 66) return;

        chaserIndex = Math.floor(Math.random() * butterflies.length);
        const sameSide = butterflies.map((butterfly, index) => index).filter((index) => index !== chaserIndex && butterflies[index].side === butterflies[chaserIndex].side);
        chaseTargetIndex = sameSide[Math.floor(Math.random() * sameSide.length)];
        butterflies.forEach((butterfly, index) => {
          butterfly.isChaser = index === chaserIndex;
          butterfly.isChased = index === chaseTargetIndex;
        });
        chaseTime = random(7, 11);
      }

      function moveButterfly(butterfly, dt) {
        if (updateSceneTransitionMover("noon", butterfly, dt, width, height, 2.8)) return;
        butterfly.targetIn -= dt;
        if (butterfly.targetIn <= 0) {
          for (let attempt = 0; attempt < 8; attempt += 1) {
            butterfly.targetX = edgeTargetX(butterfly.side);
            butterfly.targetY = random(55, height - 55);
            if (Math.hypot(butterfly.targetX - butterfly.x, butterfly.targetY - butterfly.y) > 390) break;
          }
          butterfly.targetIn = random(4, 7);
        }
        let aimX = butterfly.targetX;
        let aimY = butterfly.targetY;
        let chaseDistance = Infinity;
        let chaseHeading = 0;
        if (butterfly.isChaser) {
          const target = butterflies[chaseTargetIndex];
          aimX = target.x + Math.cos(target.heading) * target.speed * .6;
          aimY = target.y + Math.sin(target.heading) * target.speed * .6;
        } else if (butterfly.isChased) {
          const chaser = butterflies[chaserIndex];
          const awayX = butterfly.x - chaser.x;
          const awayY = butterfly.y - chaser.y;
          chaseDistance = Math.hypot(awayX, awayY);
          chaseHeading = chaseDistance > 1 ? Math.atan2(awayY, awayX) : butterfly.heading + Math.PI;
        }
        let desired = Math.atan2(aimY - butterfly.y, aimX - butterfly.x);
        const flee = butterfly.isChased ? clamp((250 - chaseDistance) / 250, 0, 1) : 0;
        if (flee > 0) desired += angleDifference(desired, chaseHeading) * flee;
        let separationX = 0;
        let separationY = 0;
        for (const other of butterflies) {
          if (other === butterfly || other.side !== butterfly.side) continue;
          const dx = butterfly.x - other.x;
          const dy = butterfly.y - other.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < 90) {
            const weight = (90 - distance) / 90;
            separationX += dx / distance * weight;
            separationY += dy / distance * weight;
          }
        }
        const flightCycle = (elapsed + butterfly.phase) % butterfly.flapCycle;
        const burstLength = butterfly.flapBeats * .28;
        const flapping = flightCycle < burstLength;
        const weave = Math.sin(elapsed * (flapping ? 2.4 : .75) + butterfly.phase) * (flapping ? .12 : .035);
        const turnRate = (flapping ? 1.4 : .48) + flee * 1.8 + (butterfly.isChaser ? .28 : 0);
        let steerHeading = desired + weave;
        if (Math.hypot(separationX, separationY) > .01) {
          const separationHeading = Math.atan2(separationY, separationX);
          steerHeading += angleDifference(steerHeading, separationHeading) * Math.min(1, Math.hypot(separationX, separationY) * 1.8);
        }
        butterfly.heading += clamp(angleDifference(butterfly.heading, steerHeading), -turnRate * dt, turnRate * dt);
        const approach = clamp(Math.hypot(aimX - butterfly.x, aimY - butterfly.y) / 180, .45, 1);
        const playBoost = butterfly.isChaser ? 1.22 : 1 + flee * .65;
        const targetSpeed = butterfly.cruiseSpeed * approach * (flapping ? 1.65 : .72) * playBoost;
        butterfly.speed += (targetSpeed - butterfly.speed) * Math.min(1, dt * (flapping ? 4.8 : .72));
        const flutter = flapping
          ? Math.sin(elapsed * 3.2 + butterfly.phase) * 5
          : Math.sin(elapsed * 1.1 + butterfly.phase) * 1.8;
        butterfly.x += (Math.cos(butterfly.heading) * butterfly.speed - Math.sin(butterfly.heading) * flutter + separationX * 40) * dt;
        butterfly.y += (Math.sin(butterfly.heading) * butterfly.speed + Math.cos(butterfly.heading) * flutter + separationY * 40) * dt;
        constrainToSceneLane(butterfly, width, edgeLane, dt);
        butterfly.y = wrap(butterfly.y, -60, height + 60);
      }

      function keepButterfliesApart() {
        const minDistance = 46;
        for (let pass = 0; pass < 2; pass += 1) {
          for (let first = 0; first < butterflies.length; first += 1) {
            for (let second = first + 1; second < butterflies.length; second += 1) {
              const a = butterflies[first];
              const b = butterflies[second];
              if (a.side !== b.side) continue;
              let dx = b.x - a.x;
              let dy = b.y - a.y;
              let distance = Math.hypot(dx, dy);
              if (distance >= minDistance) continue;
              if (distance < .01) {
                const angle = random(0, Math.PI * 2);
                dx = Math.cos(angle);
                dy = Math.sin(angle);
                distance = 1;
              }
              const overlap = (minDistance - distance) * .5;
              const nx = dx / distance;
              const ny = dy / distance;
              a.x = wrap(a.x - nx * overlap, -60, width + 60);
              a.y = wrap(a.y - ny * overlap, -60, height + 60);
              b.x = wrap(b.x + nx * overlap, -60, width + 60);
              b.y = wrap(b.y + ny * overlap, -60, height + 60);
            }
          }
        }
      }

      function drawButterfly(butterfly, time, opacity = 1) {
        context.save();
        context.globalAlpha = opacity;
        context.translate(butterfly.x, butterfly.y);
        context.rotate(butterfly.heading);
        context.scale(butterfly.scale, butterfly.scale);
        const cycleTime = (time + butterfly.phase) % butterfly.flapCycle;
        const beatLength = .28;
        const burstLength = butterfly.flapBeats * beatLength;
        let wingOpen = 1;
        if (cycleTime < burstLength) {
          const beatProgress = (cycleTime % beatLength) / beatLength;
          wingOpen = beatProgress < .42
            ? 1 - (beatProgress / .42) * .72
            : .28 + ((beatProgress - .42) / .58) * .72;
        }
        const bodyColor = "#655b50";
        for (const side of [-1, 1]) {
          for (const [rootX, forewing] of [[1.2, true], [-2, false]]) {
            context.save();
            context.translate(rootX, side * 1.3);
            context.scale(1, side * wingOpen);
            context.rotate(side * (1 - wingOpen) * .12);
            context.globalAlpha = .92 * opacity;
            const wing = wingSprites[butterfly.paletteIndex][forewing ? 0 : 1];
            context.drawImage(spriteAtlas, wing.x, wing.y, wing.width, wing.height, -16, -4, 40, 32);
            context.restore();
          }
        }

        context.globalAlpha = .94 * opacity;
        context.fillStyle = bodyColor;
        context.beginPath();
        context.ellipse(-2.8, 0, 4.6, 2.35, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.ellipse(.5, 0, 3.1, 2.9, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = bodyColor;
        context.beginPath();
        context.arc(5.2, 0, 2.55, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = bodyColor;
        context.lineWidth = .78;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(6.1, -.9);
        context.quadraticCurveTo(8, -3.4, 10.5, -3);
        context.moveTo(6.1, .9);
        context.quadraticCurveTo(8, 3.4, 10.5, 3);
        context.stroke();
        context.fillStyle = bodyColor;
        context.beginPath();
        context.arc(10.5, -3, .62, 0, Math.PI * 2);
        context.arc(10.5, 3, .62, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#fff6e7";
        context.beginPath();
        context.arc(5.1, -.85, .64, 0, Math.PI * 2);
        context.arc(5.1, .85, .64, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = bodyColor;
        context.beginPath();
        context.arc(5.28, -.85, .3, 0, Math.PI * 2);
        context.arc(5.28, .85, .3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(228,132,135,.58)";
        context.beginPath();
        context.ellipse(6.35, -1.7, .52, .3, 0, 0, Math.PI * 2);
        context.ellipse(6.35, 1.7, .52, .3, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = bodyColor;
        context.lineWidth = .55;
        context.beginPath();
        context.moveTo(7.2, -.22);
        context.quadraticCurveTo(7.65, .12, 8.1, -.22);
        context.stroke();
        context.restore();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        if (!reducedMotion) {
          const inSceneTransition = Boolean(document.documentElement.dataset.skyTransitionStartedAt);
          if (!inSceneTransition) updateChase(dt);
          for (const butterfly of butterflies) moveButterfly(butterfly, dt);
          if (!inSceneTransition) keepButterfliesApart();
        }
        drawActors(butterflies, drawButterfly, elapsed, width, height);
      }

          return { render: renderScene };
    }

// Predawn canvas animation, adapted from /animations/predawn.html
function createPredawnScene() {
      const logicalWidth = 1440;
      const logicalHeight = 900;
      const bugWorld = { left: -logicalWidth * .35, right: logicalWidth * 1.35, top: -logicalHeight * .35, bottom: logicalHeight * 1.35 };
      const clock = createSceneClock();
      let elapsed = 0;
      let skyRotation = 0;

      const edgeLane = (side) => sceneEdgeLane(side, logicalWidth);
      const edgeTargetX = (side) => sceneEdgeTargetX(side, logicalWidth);


      // Match the night preview: tiny multicolour points, random twinkle phases and selective glow.
      const starColors = ["#eef3ff", "#ffe1ad", "#c9dcff", "#fff1d4", "#dce8ff", "#fff6e7", "#ffd49a"];
      const stars = Array.from({ length: 112 }, () => ({
        x: random(8, logicalWidth - 8),
        y: random(8, logicalHeight - 8),
        radius: random(.38, .86),
        color: starColors[Math.floor(Math.random() * starColors.length)],
        glow: Math.random() < .3,
        phase: random(0, Math.PI * 2),
        rate: random(1.4, 2.9),
        revealDelay: random(0, 2600),
      }));

      const bugs = [
        [225, 295], [1130, 670], [495, 200], [1320, 350], [720, 690], [870, 445],
        [135, 610], [385, 420], [575, 780], [635, 290], [805, 105],
        [1010, 755], [1165, 185], [1245, 495], [310, 115], [1040, 350],
      ].map(([x, y], index) => {
        const side = index % 2 === 0 ? -1 : 1;
        return {
        side,
        x: edgeTargetX(side), y,
        heading: random(0, Math.PI * 2),
        turnRate: random(-.4, .4),
        targetTurn: random(-1.1, 1.1),
        turnIn: random(.3, .9),
        speed: random(18, 34),
        targetSpeed: random(24, 52),
        hoverIn: random(3, 7),
        dartIn: random(1.5, 5.5),
        dartFor: 0,
        dartHeading: 0,
        dartSpeed: 0,
        phase: random(0, Math.PI * 2),
        size: random(.42, 1),
        color: index % 2 ? "#202235" : "#2a2738",
      };
      });

      const bats = [-1, 1].map((side) => ({
        side,
        x: edgeTargetX(side),
        y: side < 0 ? 340 : 560,
        heading: side < 0 ? 0 : Math.PI,
        speed: 108,
        targetBug: null,
        roamTargetX: edgeTargetX(side),
        roamTargetY: random(120, logicalHeight - 120),
        roamTargetIn: random(2.5, 4.5),
        echoCooldown: random(.8, 2.1),
        echoPulseRemaining: 0,
      }));


      function steerBugFromBounds(bug) {
        const edgeMargin = 120;
        const edgeDistance = Math.min(
          bug.x - bugWorld.left,
          bugWorld.right - bug.x,
          bug.y - bugWorld.top,
          bugWorld.bottom - bug.y,
        );
        const edgeWeight = clamp((edgeMargin - edgeDistance) / edgeMargin, 0, 1);
        const outsideDistance = Math.max(0, -bug.x, bug.x - logicalWidth, -bug.y, bug.y - logicalHeight);
        const outsideWeight = clamp(outsideDistance / 150, 0, 1);
        const inwardHeading = Math.atan2(logicalHeight / 2 - bug.y, logicalWidth / 2 - bug.x);
        return angleDifference(bug.heading, inwardHeading) * (edgeWeight * 1.5 + outsideWeight * 1.8);
      }

      function moveBug(bug, dt) {
        if (updateSceneTransitionMover("predawn", bug, dt, logicalWidth, logicalHeight, 3.2)) return;
        bug.turnIn -= dt;
        if (bug.turnIn <= 0) {
          bug.targetTurn = random(-1.25, 1.25);
          bug.targetSpeed = random(22, 58);
          bug.turnIn = random(.28, .8);
          bug.hoverIn -= 1;
          if (bug.hoverIn <= 0) {
            bug.targetSpeed = random(4, 10);
            bug.hoverIn = random(3, 7);
          }
        }

        bug.dartIn -= dt;
        if (bug.dartIn <= 0 && bug.dartFor <= 0) {
          bug.dartFor = random(.14, .27);
          const bat = bats.find((candidate) => candidate.side === bug.side);
          const fleeX = bug.x - bat.x;
          const fleeY = bug.y - bat.y;
          const threatDistance = Math.hypot(fleeX, fleeY);
          bug.dartHeading = threatDistance < 230
            ? Math.atan2(fleeY, fleeX) + random(-.45, .45)
            : bug.heading + random(-1.15, 1.15);
          bug.dartSpeed = random(210, 310);
          bug.dartIn = random(3.5, 8);
        }

        const steer = steerBugFromBounds(bug);
        const bat = bats.find((candidate) => candidate.side === bug.side);
        const fleeX = bug.x - bat.x;
        const fleeY = bug.y - bat.y;
        const threatDistance = Math.hypot(fleeX, fleeY);
        const fleeWeight = threatDistance < 230 ? Math.pow(1 - threatDistance / 230, 2) : 0;
        const fleeHeading = threatDistance > 1 ? Math.atan2(fleeY, fleeX) : bug.heading + Math.PI;
        const fleeSteer = angleDifference(bug.heading, fleeHeading) * fleeWeight * 3.4;
        bug.turnRate += (bug.targetTurn + steer + fleeSteer - bug.turnRate) * Math.min(1, dt * 2.2);
        bug.heading += (bug.turnRate + fleeSteer * 2) * dt;
        let speed = bug.speed + (bug.targetSpeed - bug.speed) * Math.min(1, dt * 1.8);
        speed += fleeWeight * 75;
        if (bug.dartFor > 0) {
          bug.dartFor -= dt;
          bug.heading += angleDifference(bug.heading, bug.dartHeading) * Math.min(1, dt * 9);
          speed = bug.dartSpeed;
        }
        bug.speed = speed;

        const flutter = Math.sin(elapsed * 14 + bug.phase) * 2;
        bug.x += Math.cos(bug.heading) * speed * dt + Math.cos(elapsed * 7 + bug.phase) * flutter * dt;
        bug.y += Math.sin(bug.heading) * speed * dt + flutter * dt;
        constrainToSceneLane(bug, logicalWidth, edgeLane, dt);
        bug.y = wrap(bug.y, bugWorld.top, bugWorld.bottom);
      }

      function moveBat(bat, dt) {
        if (updateSceneTransitionMover("predawn", bat, dt, logicalWidth, logicalHeight, 2.8)) return;
        let nearestBug = null;
        let nearestDistance = Infinity;
        for (const bug of bugs) {
          if (bug.side !== bat.side || bug.x < 0 || bug.x > logicalWidth || bug.y < 0 || bug.y > logicalHeight) continue;
          const distance = Math.hypot(bug.x - bat.x, bug.y - bat.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestBug = bug;
          }
        }

        let currentTargetDistance = Infinity;
        if (bat.targetBug && bat.targetBug.side === bat.side && bat.targetBug.x >= 0 && bat.targetBug.x <= logicalWidth && bat.targetBug.y >= 0 && bat.targetBug.y <= logicalHeight) {
          currentTargetDistance = Math.hypot(bat.targetBug.x - bat.x, bat.targetBug.y - bat.y);
        } else {
          bat.targetBug = null;
        }
        if (nearestBug && (!bat.targetBug || currentTargetDistance > 520 || (nearestBug !== bat.targetBug && nearestDistance < currentTargetDistance * .62))) {
          bat.targetBug = nearestBug;
          currentTargetDistance = nearestDistance;
        }

        let target;
        let targetDistance;
        if (bat.targetBug) {
          targetDistance = Math.hypot(bat.targetBug.x - bat.x, bat.targetBug.y - bat.y);
          const leadTime = clamp(targetDistance / Math.max(80, bat.speed), .15, .7);
          target = {
            x: bat.targetBug.x + Math.cos(bat.targetBug.heading) * Math.min(70, bat.targetBug.speed) * leadTime,
            y: bat.targetBug.y + Math.sin(bat.targetBug.heading) * Math.min(70, bat.targetBug.speed) * leadTime,
          };
        } else {
          bat.roamTargetIn -= dt;
          if (bat.roamTargetIn <= 0 || Math.hypot(bat.roamTargetX - bat.x, bat.roamTargetY - bat.y) < 90) {
            bat.roamTargetX = edgeTargetX(bat.side);
            bat.roamTargetY = random(100, logicalHeight - 100);
            bat.roamTargetIn = random(3, 5.5);
          }
          target = { x: bat.roamTargetX, y: bat.roamTargetY };
          targetDistance = Math.hypot(target.x - bat.x, target.y - bat.y);
        }

        bat.echoPulseRemaining = Math.max(0, bat.echoPulseRemaining - dt);
        if (bat.targetBug && targetDistance < 170) {
          bat.echoPulseRemaining = 0;
          bat.echoCooldown = random(.25, .65);
        } else if (bat.echoPulseRemaining <= 0) {
          bat.echoCooldown -= dt;
          if (bat.echoCooldown <= 0) {
            bat.echoPulseRemaining = .28;
            bat.echoCooldown = random(1.3, 3.6);
          }
        }

        const targetHeading = Math.atan2(target.y - bat.y, target.x - bat.x);
        const turnRate = bat.targetBug ? 2.8 : 1.9;
        bat.heading += clamp(angleDifference(bat.heading, targetHeading), -turnRate * dt, turnRate * dt);
        const targetSpeed = bat.targetBug ? 96 + Math.min(targetDistance * .035, 38) : 86;
        bat.speed += (targetSpeed - bat.speed) * Math.min(1, dt * 1.5);
        bat.x += Math.cos(bat.heading) * bat.speed * dt;
        bat.y += Math.sin(bat.heading) * bat.speed * dt;
        constrainToSceneLane(bat, logicalWidth, edgeLane, dt);
        bat.y = wrap(bat.y, bugWorld.top, bugWorld.bottom);
      }

      function drawStar(star, time) {
        const wave = (Math.sin(time * star.rate + star.phase) + 1) / 2;
        context.globalAlpha = (.34 + wave * .56) * sceneStarReveal("predawn", star);
        context.fillStyle = star.color;
        context.shadowColor = star.glow ? star.color : "transparent";
        context.shadowBlur = star.glow ? 2.4 + wave * 3.4 : 0;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * (.9 + wave * .2), 0, Math.PI * 2);
        context.fill();
      }

      function drawBug(bug, time, opacity = 1) {
        const flutter = Math.sin(time * 34 + bug.phase) * .65;
        context.save();
        context.globalAlpha = opacity;
        context.translate(bug.x, bug.y);
        context.rotate(bug.heading);
        context.scale(bug.size, bug.size);
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.fillStyle = bug.color;
        // Two tiny beating wings and a single body dot keep the bug mark simple.
        context.save();
        context.rotate(flutter);
        context.beginPath();
        context.ellipse(-2.1, -1.7, 2.2, 1.05, -.35, 0, Math.PI * 2);
        context.ellipse(2.1, -1.7, 2.2, 1.05, .35, 0, Math.PI * 2);
        context.fill();
        context.restore();
        context.globalAlpha = .9 * opacity;
        context.beginPath();
        context.arc(0, 0, 2.2, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      function drawBatWing(side, flap) {
        context.save();
        context.translate(side * 4, 1);
        context.rotate(side * flap);
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(side * 20, -7);
        context.lineTo(side * 17, 4);
        context.closePath();
        context.fill();
        context.restore();
      }

      function drawBat(bat, time, opacity = 1) {
        context.save();
        context.globalAlpha = opacity;
        context.translate(bat.x, bat.y);
        context.rotate(bat.heading + Math.PI / 2);
        context.fillStyle = "#1e2032";
        context.shadowColor = "transparent";
        context.shadowBlur = 0;

        // Brief sonar pings: two quick rings, followed by a quiet pause.
        const echoAge = .28 - bat.echoPulseRemaining;
        for (let ring = 0; ring < 2; ring += 1) {
          const age = echoAge - ring * .075;
          if (bat.echoPulseRemaining > 0 && age >= 0 && age < .24) {
            const progress = age / .24;
            context.globalAlpha = .82 * (1 - progress) * opacity;
            context.strokeStyle = "#91aee8";
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(0, 0, 12 + progress * 55, Math.PI * 13 / 12, Math.PI * 23 / 12);
            context.stroke();
          }
        }

        const flap = Math.sin(time * 18) * .38;
        context.globalAlpha = .88 * opacity;
        drawBatWing(-1, flap);
        drawBatWing(1, flap);
        context.beginPath();
        context.ellipse(0, 4, 3, 5, 0, 0, Math.PI * 2);
        context.fill();
        // Small triangular ears and a round head.
        context.beginPath();
        context.moveTo(-4.5, -3);
        context.lineTo(-5.5, -9);
        context.lineTo(-1, -5.5);
        context.closePath();
        context.moveTo(4.5, -3);
        context.lineTo(5.5, -9);
        context.lineTo(1, -5.5);
        context.closePath();
        context.fill();
        context.beginPath();
        context.arc(0, 0, 5, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      function renderScene(timestamp = 0) {
        const { dt, elapsed: sceneTime } = clock(timestamp);
        elapsed = sceneTime;
        skyRotation = (skyRotation + dt * Math.PI * 2 / 1800) % (Math.PI * 2);
        context.shadowBlur = 0;
        const centerX = logicalWidth / 2;
        const centerY = logicalHeight / 2;
        context.save();
        context.translate(centerX, centerY);
        context.rotate(skyRotation);
        context.translate(-centerX, -centerY);
        for (const star of stars) drawStar(star, elapsed);
        context.restore();
        context.globalAlpha = 1;
        context.shadowBlur = 0;
        if (!reducedMotion) {
          for (const bug of bugs) moveBug(bug, dt);
          for (const bat of bats) moveBat(bat, dt);
        }
        drawActors(bugs, drawBug, elapsed, logicalWidth, logicalHeight);
        drawActors(bats, drawBat, elapsed, logicalWidth, logicalHeight);
        context.globalAlpha = 1;
        context.shadowBlur = 0;
      }

          return { render: renderScene };
    }


const scenes = {
  afternoon: createAfternoonScene(),
  dawn: createDawnScene(),
  dusk: createDuskScene(),
  golden: createGoldenScene(),
  morning: createMorningScene(),
  night: createNightScene(),
  noon: createNoonScene(),
  predawn: createPredawnScene(),
};
let animationFrame = null;

function resize() {
  resizeAnimalCanvas(canvas, context, 1440, 900);
  requestRender();
}

function paintScene(scene, timestamp) {
  const renderer = scenes[scene];
  if (!renderer) return;
  context.save();
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  renderer.render(timestamp);
  context.restore();
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function renderFrame(timestamp = performance.now()) {
  animationFrame = null;
  if (document.hidden) return;

  const root = document.documentElement;
  const scene = root.dataset.skyScene || "night";
  const from = root.dataset.skyTransitionFrom;
  const startedAt = Number(root.dataset.skyTransitionStartedAt);
  const duration = Number(root.dataset.skyTransitionDuration) || 22000;
  const progress = startedAt ? clamp((timestamp - startedAt) / duration, 0, 1) : 1;

  const sceneWidth = 1440 + sceneMargin * 2;
  const sceneHeight = 900 + sceneMargin * 2;
  const scaleX = canvas.width / sceneWidth;
  const scaleY = canvas.height / sceneHeight;
  context.setTransform(scaleX, 0, 0, scaleY, sceneMargin * scaleX, sceneMargin * scaleY);
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  clearAnimalCanvas(context, 1440, 900);

  const sceneToPaint = from && startedAt && progress < sceneTransitionInStart ? from : scene;
  paintScene(sceneToPaint, timestamp);

  scheduleFrame();
}

function scheduleFrame() {
  if (!reducedMotion && !document.hidden && animationFrame === null) {
    animationFrame = requestAnimationFrame(renderFrame);
  }
}

function requestRender() {
  if (reducedMotion || document.hidden) renderFrame(performance.now());
  else scheduleFrame();
}

function dispatchPointer(event) {
  scenes[document.documentElement.dataset.skyScene]?.pointerMove?.(event);
}

function leavePointer() {
  for (const scene of Object.values(scenes)) scene.pointerLeave?.();
}

window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pointermove", dispatchPointer, { passive: true });
window.addEventListener("pointerdown", dispatchPointer, { passive: true });
window.addEventListener("pointerout", (event) => { if (!event.relatedTarget) leavePointer(); }, { passive: true });
window.addEventListener("pointercancel", leavePointer, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (!document.hidden) requestRender();
});
new MutationObserver(requestRender).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-sky-scene", "data-sky-transition-from", "data-sky-transition-started-at", "data-sky-transition-duration"],
});
resizeAnimalCanvas(canvas, context, 1440, 900);
requestRender();
