// student-interactions.js
// Logique spécifique au rideau (personnage "student")

import { setPlaneSprite, setPlaneSpriteFrame } from './scenePlanes.js';

/**
 * Initialisation du step "rideau" quand un personnage
 * avec type === "curtain" devient actif.
 */
export function initCurtainStep(step, cfg) {
  if (!step.mesh) return;

  // Activation du perso → rideau au repos sur spritesheetB (pré-anim)
  if (cfg.preSprite) {
    setPlaneSprite(
      step.mesh,
      cfg.preSprite,
      cfg.preFrames || 8,
      cfg.preFps || 8
    );
    step.isAnimated = true;
  } else if (cfg.staticSprite) {
    // fallback rideau.png
    setPlaneSprite(
      step.mesh,
      cfg.staticSprite,
      cfg.staticFrames || 1,
      cfg.staticFps || 0
    );
    step.isAnimated = false;
  }

  step.curtainRewindStarted = false;
  step.curtainDragStarted = false;
}

/**
 * Drag sur le rideau : passage spritesheetB → spritesheetR
 * et frame pilotée par progress.
 */
export function handleCurtainDragMove(step, cfg, dragStartProgress) {
  if (!step.mesh) return;

  // Dès qu'on commence vraiment à bouger, on bascule spritesheetB → spritesheetR
  if (
    !step.curtainDragStarted &&
    Math.abs(step.progress - dragStartProgress) > 0.001
  ) {
    if (cfg.animSprite) {
      setPlaneSprite(
        step.mesh,
        cfg.animSprite,
        cfg.animFrames || 20,
        0 // fps=0 : pas d'anim auto
      );
      step.isAnimated = true;
      step.curtainDragStarted = true;
    }
  }

  // frames de spritesheetR pilotées par le drag (dans les deux sens)
  if (step.curtainDragStarted && cfg.animFrames) {
    const frame = step.progress * (cfg.animFrames - 1);
    setPlaneSpriteFrame(step.mesh, frame);
  }
}

/**
 * PointerUp sur un rideau "student" :
 * si progress ≈ 0, retour à spritesheetB (pré-anim de fond).
 */
export function handleCurtainPointerUp(step, cfg, activeCharacterName, autoClosing) {
  if (
    activeCharacterName === 'student' &&
    !autoClosing &&
    step.progress <= 0.001 &&
    cfg.preSprite &&
    step.mesh
  ) {
    // retour à spritesheetB animée
    setPlaneSprite(
      step.mesh,
      cfg.preSprite,
      cfg.preFrames || 8,
      cfg.preFps || 8
    );
    step.isAnimated = true;
    step.curtainDragStarted = false;
  }
}

/**
 * Update des animations côté rideau :
 * - gère le passage en rideauEnd quand progress ~ 1.
 */
export function updateCurtainAnimations(step, cfg, autoClosing) {
  if (autoClosing) return;
  if (!cfg.endSprite || step.progress < 0.98) return;
  if (!step.mesh) return;

  // image finale rideau fermé
  setPlaneSprite(step.mesh, cfg.endSprite, 1, 0);
  step.isAnimated = false;

  // on réinitialise ce flag pour que le prochain drag rebascule sur spritesheetR
  step.curtainDragStarted = false;
}

/**
 * Rembobinage automatique du rideau pendant un changement de personnage.
 * Fait défiler spritesheetR à l'envers jusqu'à progress = 0.
 */
export function autoCloseCurtainStep(step, cfg, dt, autoCloseSpeed) {
  if (!step.mesh || !cfg.animSprite) return;

  // Premier passage : on bascule sur spritesheetR avec la bonne frame
  if (!step.curtainRewindStarted) {
    step.curtainRewindStarted = true;

    setPlaneSprite(
      step.mesh,
      cfg.animSprite,
      cfg.animFrames || 20,
      0 // fps=0 : pas d'anim auto
    );

    const startFrame = step.progress * ((cfg.animFrames || 20) - 1);
    setPlaneSpriteFrame(step.mesh, startFrame);
    step.isAnimated = true;
  }

  // décrémente la progress
  step.progress -= autoCloseSpeed * dt;
  if (step.progress < 0) step.progress = 0;

  // frame correspondante (rembobinage visuel)
  if (cfg.animFrames) {
    const frame = step.progress * (cfg.animFrames - 1);
    setPlaneSpriteFrame(step.mesh, frame);
  }
}
