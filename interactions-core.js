// interactions-core.js
import * as THREE from 'three';
import { setPlaneSprite } from './scenePlanes.js';
import {
  IS_MOBILE,
  characterInteractionsConfig
} from './interactions-config.js';

import {
  initCurtainStep,
  handleCurtainDragMove,
  handleCurtainPointerUp,
  updateCurtainAnimations,
  autoCloseCurtainStep
} from './student-interactions.js';

// =========================
//  ÉTAT INTERNE
// =========================

let coreRef = null;
let domElementRef = null;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

// characterStates[charName] = { steps: [ { config, mesh?, baseY?, progress, isAnimated, curtainRewindStarted, curtainDragStarted, isSnapping, snapTarget } ] }
const characterStates = {};

let activeCharacterName = null;

// Changement de perso → fermeture auto de l'ancien, ouverture du nouveau
let autoClosing = false;
let autoClosingCharacterName = null;
let pendingCharacterName = null;

// Quand un perso vient d'être activé, on initialise sa séquence
let characterJustActivatedName = null;

// Drag
let dragging = false;
let dragStep = null;
let dragStartY = 0;
let dragStartX = 0;
let dragStartProgress = 0;

// Vitesse de fermeture auto (progress/seconde)
const AUTO_CLOSE_SPEED = 2.0;

// =========================
//  INIT
// =========================

export function initInteractions(core, domElement) {
  coreRef = core;
  domElementRef = domElement;

  Object.keys(characterInteractionsConfig).forEach((charName) => {
    const cfg = characterInteractionsConfig[charName];
    const steps = cfg.sequence.map((stepCfg) => ({
      config: stepCfg,
      mesh: null,
      baseY: null,
      progress: 0,
      isAnimated: false,
      curtainRewindStarted: false,
      curtainDragStarted: false,
      isSnapping: false,
      snapTarget: null
    }));

    characterStates[charName] = { steps };
  });
}

// =========================
//  UTILITAIRES MESH
// =========================

function findMeshByNameFlexible(id) {
  if (!coreRef || !coreRef.scene) return null;

  const target = id.toLowerCase();
  let found = null;

  coreRef.scene.traverse((obj) => {
    if (found) return;
    if (!obj.name) return;
    const n = obj.name.toLowerCase();
    if (n === target || n.includes(target)) {
      found = obj;
    }
  });

  if (!found) {
    console.warn(`[Interactions] Aucun mesh trouvé pour id "${id}" dans la scène.`);
  } else {
    console.log(`[Interactions] Mesh trouvé pour "${id}" :`, found.name);
  }

  return found;
}

function ensureStepMesh(step) {
  if (step.mesh && step.baseY !== null) return;
  if (!coreRef || !coreRef.scene) return;

  const id = step.config.id;
  const mesh = findMeshByNameFlexible(id);
  if (!mesh) return;

  step.mesh = mesh;
  step.baseY = mesh.position.y;
}

// =========================
//  SPRITES GÉNÉRIQUES
// =========================

function setStepSprite(step, animated) {
  ensureStepMesh(step);
  if (!step.mesh) return;

  const cfg = step.config;

  // éviter de recharger la même texture si l'état ne change pas
  if (cfg.type !== 'curtain' && step.isAnimated === animated) return;

  if (animated && cfg.animSprite) {
    setPlaneSprite(
      step.mesh,
      cfg.animSprite,
      cfg.animFrames || 1,
      cfg.animFps || 0
    );
    step.isAnimated = true;
  } else if (cfg.staticSprite) {
    setPlaneSprite(
      step.mesh,
      cfg.staticSprite,
      cfg.staticFrames || 1,
      cfg.staticFps || 0
    );
    step.isAnimated = false;
  }
}

// =========================
//  CHANGEMENT DE PERSONNAGE
// =========================

export function setActiveCharacter(charName) {
  // 0) Aucun changement demandé
  if (charName === activeCharacterName) {
    return;
  }

  // 1) Désactivation explicite (re-clic)
  if (!charName) {
    if (!activeCharacterName) {
      // déjà aucun : reset global
      Object.values(characterStates).forEach((state) => {
        state.steps.forEach((step) => {
          ensureStepMesh(step);
          step.progress = 0;
          step.isAnimated = false;
          step.curtainRewindStarted = false;
          step.curtainDragStarted = false;
          step.isSnapping = false;
          step.snapTarget = null;
          applyStepTransform(step);
          const cfg = step.config;
          if (cfg.type === 'curtain' && cfg.staticSprite && step.mesh) {
            // retour à rideau.png
            setPlaneSprite(
              step.mesh,
              cfg.staticSprite,
              cfg.staticFrames || 1,
              cfg.staticFps || 0
            );
          } else {
            setStepSprite(step, false);
          }
        });
      });

      activeCharacterName = null;
      autoClosing = false;
      autoClosingCharacterName = null;
      pendingCharacterName = null;
      characterJustActivatedName = null;
      dragging = false;
      dragStep = null;
      return;
    }

    // il y a un personnage actif → rembobinage
    autoClosing = true;
    autoClosingCharacterName = activeCharacterName;
    pendingCharacterName = null;
    dragging = false;
    dragStep = null;
    return;
  }

  // 2) Aucun personnage actif → activation directe
  if (!activeCharacterName) {
    activeCharacterName = charName;
    autoClosing = false;
    autoClosingCharacterName = null;
    pendingCharacterName = null;
    characterJustActivatedName = charName;
    dragging = false;
    dragStep = null;
    return;
  }

  // 3) Passage d'un personnage A à un autre B
  autoClosing = true;
  autoClosingCharacterName = activeCharacterName;
  pendingCharacterName = charName;
  dragging = false;
  dragStep = null;
}

// =========================
//  LOGIQUE DE SÉQUENCE
// =========================

function getNextOpenableStep(steps, threshold = 0.98) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.progress >= threshold) continue;

    let allPrevOpen = true;
    for (let j = 0; j < i; j++) {
      if (steps[j].progress < threshold) {
        allPrevOpen = false;
        break;
      }
    }
    if (allPrevOpen) return step;
  }
  return null;
}

function getLastClosableStep(steps, threshold = 0.02) {
  let last = null;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].progress > threshold) {
      last = steps[i];
    }
  }
  return last;
}

function initSequenceForCharacter(charName) {
  const state = characterStates[charName];
  if (!state) return;

  state.steps.forEach((step) => {
    const cfg = step.config;
    ensureStepMesh(step);

    step.progress = 0;
    step.isAnimated = false;
    step.curtainRewindStarted = false;
    step.curtainDragStarted = false;
    step.isSnapping = false;
    step.snapTarget = null;
    applyStepTransform(step);

    if (cfg.type === 'curtain') {
      // logique rideau déléguée au module spécifique
      initCurtainStep(step, cfg);
    } else {
      // autres steps en statique au départ
      setStepSprite(step, false);
    }
  });
}

// =========================
//  DRAG
// =========================

export function handlePointerDown(event) {
  if (!coreRef || !domElementRef) return;
  if (!activeCharacterName) return;
  if (autoClosing) return;

  const state = characterStates[activeCharacterName];
  if (!state) return;

  const steps = state.steps;
  if (!steps.length) return;

  const rect = domElementRef.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  pointerNDC.set(x, y);
  raycaster.setFromCamera(pointerNDC, coreRef.camera);

  const openable = getNextOpenableStep(steps);
  const closable = getLastClosableStep(steps);

  const candidates = [];
  if (openable) {
    ensureStepMesh(openable);
    if (openable.mesh) candidates.push(openable.mesh);
  }
  if (closable && closable !== openable) {
    ensureStepMesh(closable);
    if (closable.mesh) candidates.push(closable.mesh);
  }

  if (!candidates.length) return;

  const intersects = raycaster.intersectObjects(candidates, false);
  if (!intersects.length) return;

  const intersectedMesh = intersects[0].object;
  const step = steps.find((s) => s.mesh === intersectedMesh);
  if (!step) return;

  dragging = true;
  dragStep = step;
  dragStartY = event.clientY;
  dragStartX = event.clientX;
  dragStartProgress = step.progress;

  step.isSnapping = false;
  step.snapTarget = null;
}

export function handlePointerMove(event) {
  if (!dragging || !dragStep) return;
  if (autoClosing) return;

  const cfg = dragStep.config;
  const basePixelsForFull = cfg.dragPixelsForFull || 300;
  const pixelsForFull = IS_MOBILE ? basePixelsForFull * 0.6 : basePixelsForFull;

  let deltaProgress = 0;

  if (cfg.type === 'curtain') {
    const deltaPixels = event.clientX - dragStartX;
    deltaProgress = deltaPixels / pixelsForFull;
  } else {
    const deltaPixels = dragStartY - event.clientY;
    deltaProgress = deltaPixels / pixelsForFull;
  }

  let targetProgress = dragStartProgress + deltaProgress;
  targetProgress = Math.max(0, Math.min(1, targetProgress));

  if (cfg.type === 'curtain') {
    dragStep.progress = targetProgress;
  } else {
    const SMOOTH = IS_MOBILE ? 0.4 : 0.3;
    dragStep.progress = THREE.MathUtils.lerp(
      dragStep.progress,
      targetProgress,
      SMOOTH
    );
  }

  applyStepTransform(dragStep);

  // rideau : délégué au module spécifique
  if (cfg.type === 'curtain') {
    handleCurtainDragMove(dragStep, cfg, dragStartProgress);
  }
}

export function handlePointerUp() {
  if (!dragging || !dragStep) return;

  const step = dragStep;
  const cfg = step.config;

  dragging = false;
  dragStep = null;

  step.progress = Math.max(0, Math.min(1, step.progress));
  applyStepTransform(step);

  if (cfg.type === 'curtain') {
    // logique de relâchement rideau spécifique "student"
    handleCurtainPointerUp(step, cfg, activeCharacterName, autoClosing);
  } else if (cfg.type === 'pullUp' || !cfg.type) {
    // SNAP auto pour grasse1 / plante2
    const SNAP_THRESHOLD = 0.20;

    let target = null;
    if (step.progress > 1 - SNAP_THRESHOLD) {
      target = 1;
    } else if (step.progress < SNAP_THRESHOLD) {
      target = 0;
    }

    if (target !== null) {
      step.snapTarget = target;
      step.isSnapping = true;
    }
  }
}

// =========================
//  TRANSFORM
// =========================

function applyStepTransform(step) {
  ensureStepMesh(step);
  if (!step.mesh || step.baseY === null) return;

  const mesh = step.mesh;
  const cfg = step.config;

  if (cfg.type === 'pullUp' || !cfg.type) {
    const baseY = step.baseY;
    const maxOffset = cfg.maxOffset || 0;
    mesh.position.y = baseY + step.progress * maxOffset;
  }
}

// =========================
//  ANIMATIONS DES SPRITES
// =========================

function updateStepAnimations() {
  if (!activeCharacterName) return;

  if (autoClosing && autoClosingCharacterName === activeCharacterName) {
    const closingState = characterStates[activeCharacterName];
    if (closingState) {
      closingState.steps.forEach((step) => {
        const cfg = step.config;
        if (cfg.type !== 'curtain') {
          setStepSprite(step, false);
        }
      });
    }
    return;
  }

  const state = characterStates[activeCharacterName];
  if (!state) return;

  const steps = state.steps;
  const openable = getNextOpenableStep(steps);

  steps.forEach((step) => {
    const cfg = step.config;

    if (cfg.type === 'curtain') {
      updateCurtainAnimations(step, cfg, autoClosing);
    } else {
      if (step === openable && step.progress < 0.999) {
        setStepSprite(step, true);
      } else if (cfg.endSprite && step.progress >= 0.98) {
        ensureStepMesh(step);
        if (step.mesh) {
          setPlaneSprite(step.mesh, cfg.endSprite, 1, 0);
          step.isAnimated = false;
        }
      } else {
        setStepSprite(step, false);
      }
    }
  });
}

// =========================
//  SNAP ANIMÉ (pullUp)
// =========================

function updateSnapping(dt) {
  if (autoClosing) return;

  Object.values(characterStates).forEach((state) => {
    state.steps.forEach((step) => {
      if (!step.isSnapping) return;
      const cfg = step.config;

      if (cfg.type !== 'pullUp' && cfg.type) return;
      if (step.snapTarget == null) {
        step.isSnapping = false;
        return;
      }

      const target = step.snapTarget;
      const SNAP_SPEED = 4.0;

      const dir = target > step.progress ? 1 : -1;
      let newProg = step.progress + dir * SNAP_SPEED * dt;

      if ((dir > 0 && newProg >= target) || (dir < 0 && newProg <= target)) {
        newProg = target;
        step.isSnapping = false;
        step.snapTarget = null;
      }

      step.progress = THREE.MathUtils.clamp(newProg, 0, 1);
      applyStepTransform(step);
    });
  });
}

// =========================
//  FIN DE REMBOBINAGE
// =========================

function finishAutoClosingForCharacter(charName, appState) {
  const state = characterStates[charName];
  if (state) {
    state.steps.forEach((step) => {
      const cfg = step.config;
      ensureStepMesh(step);

      step.progress = 0;
      step.curtainRewindStarted = false;
      step.curtainDragStarted = false;
      step.isSnapping = false;
      step.snapTarget = null;
      step.isAnimated = false;
      applyStepTransform(step);

      if (cfg.type === 'curtain' && cfg.staticSprite && step.mesh) {
        setPlaneSprite(
          step.mesh,
          cfg.staticSprite,
          cfg.staticFrames || 1,
          cfg.staticFps || 0
        );
      } else {
        setStepSprite(step, false);
      }
    });
  }

  autoClosing = false;
  autoClosingCharacterName = null;

  if (appState && appState.cameraSwitchPending) {
    appState.decorClosingDoneForSwitch = true;
  }

  if (pendingCharacterName) {
    activeCharacterName = pendingCharacterName;
    characterJustActivatedName = pendingCharacterName;
    pendingCharacterName = null;
  } else {
    activeCharacterName = null;
  }
}

// =========================
//  UPDATE GLOBAL
// =========================

export function updateInteractions(deltaMs, appState) {
  const dt = (deltaMs || 0) / 1000;

  if (characterJustActivatedName) {
    initSequenceForCharacter(characterJustActivatedName);
    characterJustActivatedName = null;
  }

  if (autoClosing && autoClosingCharacterName) {
    const charName = autoClosingCharacterName;
    const state = characterStates[charName];

    if (state) {
      const closingStep = getLastClosableStep(state.steps, 0.001);
      if (closingStep && closingStep.progress > 0) {
        const cfg = closingStep.config;

        if (cfg.type === 'curtain') {
          autoCloseCurtainStep(closingStep, cfg, dt, AUTO_CLOSE_SPEED);
        } else {
          closingStep.progress -= AUTO_CLOSE_SPEED * dt;
          if (closingStep.progress < 0) closingStep.progress = 0;
          applyStepTransform(closingStep);
        }
      } else {
        finishAutoClosingForCharacter(charName, appState);
      }
    } else {
      finishAutoClosingForCharacter(charName, appState);
    }
  }

  updateSnapping(dt);
  updateStepAnimations();
}


