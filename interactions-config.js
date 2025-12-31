// interactions-config.js

// Détection mobile partagée
export const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(
  navigator.userAgent
);

// Configuration des interactions par personnage
export const characterInteractionsConfig = {
  student: {
    sequence: [
      {
        id: 'rideau',
        type: 'curtain',
        dragPixelsForFull: 300,

        // image de base quand aucun bouton n'est actif
        staticSprite: 'images/rideau.png',
        staticFrames: 1,
        staticFps: 0,

        // animation de fond quand "student" est actif et que le rideau est au repos
        preSprite: 'images/spritesheetB.png',
        preFrames: 8,
        preFps: 8, // loop automatique

        // spritesheet pilotée par le drag / rembobinage
        animSprite: 'images/spritesheetR.png',
        animFrames: 20,
        animFps: 0, // pas d’anim auto (piloté par progress)

        // image finale rideau fermé
        endSprite: 'images/rideauEnd.png'
      },
      {
        id: 'grasse1',
        type: 'pullUp',
        maxOffset: 4.3,
        dragPixelsForFull: 150,

        staticSprite: 'images/grasse.png',
        staticFrames: 1,
        staticFps: 0,

        animSprite: 'images/grasseAnim.png',
        animFrames: 8,
        animFps: 8
      },
      {
        id: 'plante2',
        type: 'pullUp',
        maxOffset: 4.1,
        dragPixelsForFull: 150,

        staticSprite: 'images/planteText.png',
        staticFrames: 1,
        staticFps: 0,

        animSprite: 'images/planteTextAnim.png',
        animFrames: 8,
        animFps: 8
      }
    ]
  }
};
