import * as THREE from 'three';
import { OrbitControls } from 'OrbitControls';
import { Sky } from 'Sky';
import { GLTFLoader } from 'GLTFLoader';
import { initScenePlanes } from './scenePlanes.js';
export const DEBUG_CAMERA = false;

// initialisation de la scène, du renderer, de la caméra, du sol, du ciel, des plantes…
export function initCore() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  scene.fog = new THREE.Fog(0x5f3d3f, 25, 90);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  const startPosition = new THREE.Vector3(-5, 5, 70);

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // position "loin" par défaut
  const targetPosition = new THREE.Vector3(0, 1.5, isMobile ? 16.5 : 17.5);

  // on mémorise les deux distances pour pouvoir les modifier/adapter
  const defaultTargetZ = targetPosition.z;                 // 16.5 ou 17.5
  const zoomedTargetZ  = isMobile ? 15.8 : 17.1;           // 16.0 ou 17.0


  camera.position.copy(startPosition);
  camera.lookAt(0, 1.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // ==== SHADOW MAP ====
  // Sur mobile on coupe les ombres (gros gain de perf), on les garde sur desktop
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  let controls = null;
  if (DEBUG_CAMERA) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
  }

  // ==== LUMIÈRES ====
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(45, 10, 30);
  light.castShadow = true;

  // résolution du shadow map, réduite sur mobile pour soulager le GPU
  light.shadow.mapSize.set(isMobile ? 2048 : 4096, isMobile ? 2048 : 4096);

  // on resserre un peu la caméra d’ombre autour de la scène utile
  light.shadow.camera.left   = -30;
  light.shadow.camera.right  =  30;
  light.shadow.camera.top    =  30;
  light.shadow.camera.bottom = -30;
  light.shadow.camera.near   =   2;
  light.shadow.camera.far    =  80;

  // réduisent fortement les rayures / aliasing sur les surfaces planes
  light.shadow.bias = -0.0003;
  light.shadow.normalBias = 0.02;

  scene.add(light);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  // ==== SOL RÉALISTE (sable ondulé) ====
  const textureLoader = new THREE.TextureLoader();

  const groundTexture = textureLoader.load('images/ground.jpg');
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(20, 20);
  groundTexture.offset.set(0.25, 0.1);
  groundTexture.anisotropy = 8;

  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture,
    roughness: 1,
    metalness: 0.0,
    side: THREE.FrontSide // pas besoin du dessous, évite des soucis d'ombre
  });

  const groundGeometry = new THREE.PlaneGeometry(400, 400, 200, 200);
  const pos = groundGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    const wave1 = Math.sin(x * 10.05) * 0.4;
    const wave2 = Math.cos(y * 10.04) * 0.3;
    const noise = Math.sin((x + y) * 0.1) * 0.15;

    const height = (wave1 + wave2 + noise) * 0.35;
    pos.setZ(i, height);
  }
  pos.needsUpdate = true;
  groundGeometry.computeVertexNormals();

  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.75;
  ground.receiveShadow = true;
  ground.renderOrder = -1;
  scene.add(ground);

  // ==== CIEL ====
  const sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 8;
  skyUniforms['rayleigh'].value = 2.5;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.9;

  const sunPosition = new THREE.Vector3();
  const inclination = 0.5;
  const azimuth = 0.25;
  const theta = Math.PI * (inclination - 0.5);
  const phi = 2 * Math.PI * (azimuth - 0.5);
  sunPosition.x = Math.cos(phi);
  sunPosition.y = Math.sin(phi) * Math.sin(theta);
  sunPosition.z = Math.sin(phi) * Math.cos(theta);
  sky.material.uniforms['sunPosition'].value.copy(sunPosition);
  light.position.copy(sunPosition.clone().multiplyScalar(100));

  // ==== CHARGEMENT DU MODÈLE ====
  const gltfLoader = new GLTFLoader();

  const animatedPlants = [];

  const loadPromise = new Promise((resolve, reject) => {
    gltfLoader.load(
      'models/decor2.glb',
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        root.position.set(0, 0, 0);
        scene.add(root);

        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (
              child.name.toLowerCase().includes('lottie11') ||
              child.name.toLowerCase().includes('lottie12') ||
              child.name.toLowerCase().includes('lottie2') ||
              child.name.toLowerCase().includes('lottie3') ||
              child.name.toLowerCase().includes('lottie41') ||
              child.name.toLowerCase().includes('lottie42')
            ) {
              const baseRotation = child.rotation.clone();
              animatedPlants.push({
                mesh: child,
                baseRotation,
                offset: Math.random() * Math.PI * 2
              });
            }
          }
        });

        initScenePlanes(scene);

        resolve({
          scene,
          camera,
          renderer,
          controls,
          targetPosition,
          startPosition,
          loadPromise,
          animatedPlants,
          baseCamPos: camera.position.clone(),
          lookTarget: new THREE.Vector3(0, 1.5, 0),
          shakeAmp: 0,
          speed: isMobile ? 0.004 : 0.005,
          defaultTargetZ,
          zoomedTargetZ
        });
      },
      undefined,
      (error) => {
        console.error('Erreur de chargement GLTF :', error);
        reject(error);
      }
    );
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    targetPosition,
    startPosition,
    loadPromise,
    animatedPlants,
    baseCamPos: camera.position.clone(),
    lookTarget: new THREE.Vector3(0, 1.5, 0),
    shakeAmp: 0,
    speed: isMobile ? 0.004 : 0.005,
    defaultTargetZ,
    zoomedTargetZ
  };
}

// gestion du zoom caméra
export function setZoomState(core, isZoomedIn) {
  core.targetPosition.z = isZoomedIn
    ? core.zoomedTargetZ
    : core.defaultTargetZ;
}

// met à jour la caméra + les plantes qui bougent
export function updateCameraAndPlants(time, deltaMs, core, appState) {
  const t = (time || 0) * 0.001;

  if (!DEBUG_CAMERA && appState.isStarted) {
    // =========================
    //  INTRO : start → target
    // =========================
    if (appState.progress < 1) {
      appState.progress += core.speed;
      if (appState.progress > 1) appState.progress = 1;
    }

    if (appState.progress < 1) {
      // phase d'intro : on lerp entre start et target
      core.baseCamPos.lerpVectors(core.startPosition, core.targetPosition, appState.progress);
    } else {
      // =========================
      //  MOUVEMENTS DE ZOOM APRÈS INTRO
      // =========================
      const smoothFactor = 0.05; // plus petit = zoom/dézoom plus lent
      core.baseCamPos.lerp(core.targetPosition, smoothFactor);

      // si on est en phase de "switch de personnage" et qu'on dézoome
      if (
        appState.cameraSwitchPending &&
        core.targetPosition.z === core.defaultTargetZ
      ) {
        const dz = Math.abs(core.baseCamPos.z - core.defaultTargetZ);
        const threshold = 0.1;
        if (dz < threshold) {
          core.baseCamPos.z = core.defaultTargetZ;
          appState.cameraSwitchPending = false;
          if (appState.decorClosingDoneForSwitch) {
            appState.decorClosingDoneForSwitch = false;
          }
        }
      }
    }

    core.camera.position.copy(core.baseCamPos);

    const shakeAmount = core.shakeAmp || 0;
    if (shakeAmount > 0.001) {
      const shakeX = (Math.random() - 0.5) * shakeAmount;
      const shakeY = (Math.random() - 0.5) * shakeAmount * 0.5;
      const shakeZ = (Math.random() - 0.5) * shakeAmount * 0.2;
      core.camera.position.x += shakeX;
      core.camera.position.y += shakeY;
      core.camera.position.z += shakeZ;

      const decay = 0.93;
      core.shakeAmp *= decay;
      if (core.shakeAmp < 0.0001) core.shakeAmp = 0;
    }

    const desiredLook = new THREE.Vector3(0, 1.5, 0);
    core.lookTarget.lerp(desiredLook, 0.08);
    core.camera.lookAt(core.lookTarget);
  }

  if (appState.isStarted) {
    core.animatedPlants.forEach((item) => {
      const { mesh, baseRotation, offset } = item;
      const sway = Math.sin(t * 0.5 + offset) * 0.04;
      mesh.rotation.x = baseRotation.x + sway;
    });
  }
}
