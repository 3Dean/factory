import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { ColorManagement, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';

// Wait for everything to load
window.addEventListener("load", init);

function init() {
  // Global variables
  let scene, camera, renderer;
  let player, navmesh;
  let audioContext, audioSource, gainNode;
  let audioBuffer,
    audioIsPlaying = false;
  let audioInitialized = false;
  let stats;
  let pointLights = [];
  let hues = [];

  const playerHeight = 1.9;
  const playerRadius = 0.25;
  const moveSpeed = 0.1;
  let velocity = new THREE.Vector3();
  let verticalVelocity = 0;
  const gravity = 0.01;
  let isOnGround = false;
  const jumpForce = 0.25;

  // Object to store loaded models
  let models = {};

  // For flower animation
  const scrollingTextures = [];
  const flowerParts = [];
  const windSettings = {
    strength: 0.1,
    speed: 1.5,
    chaos: 0.2,
    maxAngle: 0.15,
  };

  // Detect if on mobile device
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  // Initialize audio system
  setupAudio();

  // Audio control elements
  const playPauseButton = document.getElementById("play-pause");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeLabel = document.getElementById("volume-label");

  // Add event listeners for audio controls
  playPauseButton.addEventListener("click", toggleAudio);
  volumeSlider.addEventListener("input", updateVolume);

  // Setup audio system
  function setupAudio() {
    // Use click (or touch) anywhere to initialize audio (browser requirement)
    document.addEventListener("click", initializeAudioContext, { once: true });
    // Pre-load the audio file
    const audioUrl = "/audio/gentlefogdescends.mp3";
    console.log("Preloading audio from:", audioUrl);
    fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        audioBuffer = arrayBuffer;
        console.log("Audio file preloaded");
      })
      .catch((error) => {
        console.error("Error loading audio file:", error);
      });
  }

  function initializeAudioContext() {
    if (audioInitialized) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.gain.value = volumeSlider.value / 100;
      gainNode.connect(audioContext.destination);
      if (audioBuffer) {
        audioContext.decodeAudioData(audioBuffer)
          .then((decodedData) => {
            audioBuffer = decodedData;
            console.log("Audio ready to play");
          })
          .catch((err) => console.error("Error decoding audio data", err));
      }
      audioInitialized = true;
      console.log("Audio context initialized");
    } catch (e) {
      console.error("Web Audio API not supported in this browser:", e);
    }
  }

  function toggleAudio() {
    if (!audioInitialized || !audioBuffer) {
      console.log("Audio not yet initialized or loaded");
      return;
    }
    if (audioIsPlaying) {
      if (audioSource) {
        audioSource.stop();
        audioSource = null;
      }
      audioIsPlaying = false;
      playPauseButton.textContent = "Play Music";
    } else {
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.loop = true;
      audioSource.connect(gainNode);
      audioSource.start(0);
      audioIsPlaying = true;
      playPauseButton.textContent = "Pause Music";
    }
  }

  function updateVolume() {
    const volumeValue = volumeSlider.value;
    volumeLabel.textContent = `Volume: ${volumeValue}%`;
    if (gainNode) {
      gainNode.gain.value = volumeValue / 100;
    }
  }

  const loadingManager = new THREE.LoadingManager(
    function () {
      console.log("All models loaded successfully");
      document.getElementById("loading").style.display = "none";
    },
    function (url, itemsLoaded, itemsTotal) {
      const progress = Math.round((itemsLoaded / itemsTotal) * 100);
      console.log(`Loading: ${progress}% (${itemsLoaded}/${itemsTotal})`);
      document.getElementById("loading").textContent = `Loading... ${progress}%`;
    },
    function (url) {
      console.error("Error loading:", url);
    }
  );

  // Player movement state
  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    shift: false,
  };

  // Mouse and touch controls
  let mouseEnabled = false;
  let mouseX = 0, mouseY = 0;
  let playerDirection = new THREE.Vector3(0, 0, -1);
  let euler = new THREE.Euler(0, Math.PI / 2, 0, "YXZ");

  // Setup the scene
  function setupScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = playerHeight;
    camera.rotation.copy(euler);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = .2;
    renderer.outputColorSpace = SRGBColorSpace;
    ColorManagement.enabled = true;
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.left = '0px';
    stats.domElement.style.top = '0px';
    document.body.appendChild(stats.domElement);
    document.body.appendChild(renderer.domElement);

    // Load environment map from EXR file
    loadEnvironmentMap();

    // Lights and other scene setup (unchanged) ...

        const ambientLight = new THREE.AmbientLight(0xf7c6a1, 0.5); // Increased ambient intensity
        scene.add(ambientLight);

          // Directional light
            const directionalLight = new THREE.DirectionalLight(0xa1cff7, 10);
            directionalLight.position.set(0, 10, 0);
            scene.add(directionalLight);

            // Create spotlight 1
            const spotLight = new THREE.SpotLight(0xffffff, 600); // (color, intensity)
            spotLight.position.set(-11.0, 33, 0); // adjust to fit your scene
            spotLight.angle = Math.PI / 7; // cone angle
            spotLight.penumbra = 0.2; // softness of the edges
            spotLight.decay = 1; // how the light dims over distance
            spotLight.distance = 50; // how far the light reaches
            
            spotLight.target.position.set(-12.4, 0, 0); // Change this to wherever you want it to point
            
            // Enable shadows (optional but cool)
            spotLight.castShadow = true;
            spotLight.shadow.mapSize.width = 1024;
            spotLight.shadow.mapSize.height = 1024;
            spotLight.shadow.bias = -0.001;       // fixes acne
            spotLight.shadow.normalBias = 0.02;   // fixes peter panning
            spotLight.shadow.camera.near = 1;
            spotLight.shadow.camera.far = 100;
            spotLight.shadow.camera.fov = 30;
            
            // Add to the scene
            scene.add(spotLight);
            scene.add(spotLight.target);
            
            // (Optional) Add a helper to see the spotlight cone while debugging
            const spotLightHelper = new THREE.SpotLightHelper(spotLight);
            //scene.add(spotLightHelper);
            
            // Create spotlight 2
            const spotLight2 = new THREE.SpotLight(0xffffff, 600); // (color, intensity)
            spotLight2.position.set(-11.0, 31, 25); // adjust to fit your scene
            spotLight2.angle = Math.PI / 7; // cone angle
            spotLight2.penumbra = 0.2; // softness of the edges
            spotLight2.decay = 1; // how the light dims over distance
            spotLight2.distance = 50; // how far the light reaches
            
            spotLight2.target.position.set(-12.4, 0, 25); // Change this to wherever you want it to point
            
            // Enable shadows (optional but cool)
            spotLight2.castShadow = true;
            spotLight2.shadow.mapSize.width = 1024;
            spotLight2.shadow.mapSize.height = 1024;
            spotLight2.shadow.bias = -0.001;       // fixes acne
            spotLight2.shadow.normalBias = 0.02;   // fixes peter panning
            spotLight2.shadow.camera.near = 1;
            spotLight2.shadow.camera.far = 100;
            spotLight2.shadow.camera.fov = 30;
            
            // Add to the scene
            scene.add(spotLight2);
            scene.add(spotLight2.target);
            
            // (Optional) Add a helper to see the spotlight cone while debugging
            const spotLight2Helper = new THREE.SpotLightHelper(spotLight2);
            //scene.add(spotLight2Helper);
            
            // Create spotlight 3
            const spotLight3 = new THREE.SpotLight(0xffffff, 600); // (color, intensity)
            spotLight3.position.set(-11.0, 31, -25); // adjust to fit your scene
            spotLight3.angle = Math.PI / 7; // cone angle
            spotLight3.penumbra = 0.2; // softness of the edges
            spotLight3.decay = 1; // how the light dims over distance
            spotLight3.distance = 50; // how far the light reaches
            
            spotLight3.target.position.set(-12.4, 0, -25); // Change this to wherever you want it to point
            
            // Enable shadows (optional but cool)
            spotLight3.castShadow = true;
            spotLight3.shadow.mapSize.width = 1024;
            spotLight3.shadow.mapSize.height = 1024;
            spotLight3.shadow.bias = -0.001;       // fixes acne
            spotLight3.shadow.normalBias = 0.02;   // fixes peter panning
            spotLight3.shadow.camera.near = 1;
            spotLight3.shadow.camera.far = 100;
            spotLight3.shadow.camera.fov = 30;
            
            // Add to the scene
            scene.add(spotLight3);
            scene.add(spotLight3.target);
            
            // (Optional) Add a helper to see the spotlight cone while debugging
            const spotLight3Helper = new THREE.SpotLightHelper(spotLight3);
            //scene.add(spotLight3Helper);

            // Point lights
            const positions = [
              new THREE.Vector3(64, 7, -32),     // Light 1
              new THREE.Vector3(58, 5, -20),     // Light 2
              new THREE.Vector3(58, 5, 10),    // Light 3
              new THREE.Vector3(66, 8, 33)     // Light 4
          ];
          
          positions.forEach((pos, i) => {
            const light = new THREE.PointLight(0xffffff, 300, 50, 2);
            light.position.copy(pos);
            scene.add(light);
             // Optional: Add a helper to visualize the point light
             //const helper = new THREE.PointLightHelper(light, 1);
             //scene.add(helper);
            pointLights.push(light);
            hues.push(Math.random()); // optional: gives each light a different starting color
        });
            
            // Position it
            //pointLight.position.set(60, 5, 5);
                      

  // Load environment map from EXR file
  function loadEnvironmentMap() {
    // Create a basic sky color as a fallback
    scene.background = new THREE.Color(0x000000);

    // Load the EXR file
    const exrLoader = new EXRLoader();
    const exrUrl = "/images/rogland_clear_night_1k.exr";
    console.log("Loading EXR from:", exrUrl);

    exrLoader.load(
      exrUrl,
      function (texture) {
        console.log("EXR loaded successfully");

        // Setup proper texture mapping
        texture.mapping = THREE.EquirectangularReflectionMapping;

        // Using the built-in PMREMGenerator (no need for external script)
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        // Process the environment map for proper PBR lighting
        const envMap =
          pmremGenerator.fromEquirectangular(texture).texture;

        // Apply to scene
        scene.environment = envMap;
        scene.background = envMap;

        // Clean up resources
        pmremGenerator.dispose();
        texture.dispose();

        console.log("Environment map processed and applied");
      },
      function (xhr) {
        console.log(
          "EXR loading: " + (xhr.loaded / xhr.total) * 100 + "%"
        );
      },
      function (error) {
        console.error("Error loading environment map:", error);
      }
    );
  }


    // Handle window resize
    window.addEventListener("resize", onWindowResize);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Model loading functions remain unchanged
  function loadModels() {
    const loader = new GLTFLoader(loadingManager);
// Define all the models to load
    const modelsList = [
      {
        name: "terrain1",
        url: "/models/terrain1.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "terrain2",
        url: "/models/terrain2.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "terrain3",
        url: "/models/terrain3.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "terrain4",
        url: "/models/terrain4.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "navmesh",
        url: "/models/navmesh.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "stairs",
        url: "/models/stairs.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "backroom",
        url: "/models/backroom.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "grass",
        url: "/models/grass.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "frontwall",
        url: "/models/frontwall.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "fence",
        url: "/models/fence.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "wall",
        url: "/models/wall.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        name: "trees",
        url: "/models/trees.glb",
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(0, 0, 0),
      },
    ];
    modelsList.forEach((modelInfo) => {
      loader.load(
        modelInfo.url,
        function (gltf) {
          const model = gltf.scene;
          model.position.copy(modelInfo.position);
          model.scale.copy(modelInfo.scale);
          model.rotation.copy(modelInfo.rotation);
          if (modelInfo.name === "navmesh") {
            const navmeshMaterial = new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              wireframe: true,
              opacity: 0.3,
              transparent: true,
              visible: false,
            });
            model.traverse(function (node) {
              if (node.isMesh) {
                node.material = navmeshMaterial;
                node.castShadow = false;
                node.receiveShadow = false;
              }
            });
            navmesh = model;
          }
          // Special handling for grass to enable wind animation
                    else if (modelInfo.name === "trees") {
                      model.traverse(function (node) {
                        if (node.isMesh && node.material && node.material.emissiveMap) {
                          node.castShadow = true;
                          node.receiveShadow = true;
                          node.material.emissive = new THREE.Color(0xffffff);
                          node.material.emissiveIntensity = 2.5;
                          node.material.emissiveMap.wrapS = THREE.RepeatWrapping;
                          node.material.emissiveMap.wrapT = THREE.RepeatWrapping;
                          scrollingTextures.push(node.material.emissiveMap);
                        }
                      });
                    } else if (modelInfo.name === "grass") {
                      // Process standard model materials
                      model.traverse(function (node) {
                        if (node.isMesh) {
                          node.castShadow = true;
                          node.receiveShadow = true;
          
                          // Store original positions and rotations for the animation
                          node.userData.originalPosition = node.position.clone();
                          node.userData.originalRotation = node.rotation.clone();
          
                          // Add some randomness to make the animation more natural
                          node.userData.windOffset = Math.random() * Math.PI * 2;
                          node.userData.windFactor = 0.8 + Math.random() * 0.4; // Between 0.8 and 1.2
          
                          // Add to flowerParts array for animation
                          flowerParts.push(node);
          
                          // Enhance materials to work with environment lighting
                          if (node.material) {
                            if (node.material.isMeshStandardMaterial) {
                              node.material.envMapIntensity = 0.7;
                              node.material.roughness = Math.max(
                                0.2,
                                node.material.roughness
                              );
                              node.material.metalness = Math.min(
                                0.8,
                                node.material.metalness
                              );
                              node.material.needsUpdate = true;
          
                            } else if (Array.isArray(node.material)) {
                              node.material.forEach((material) => {
                                if (material.isMeshStandardMaterial) {
                                  material.envMapIntensity = 0.7;
                                  material.roughness = Math.max(
                                    0.2,
                                    material.roughness
                                  );
                                  material.metalness = Math.min(
                                    0.8,
                                    material.metalness
                                  );
                                }
                              });
                            }
                          }
                        }
                      });
          
                      console.log(
                        `Found ${flowerParts.length} meshes for flower animation`
                      );
                    } else {
                      // Process standard model materials
                      model.traverse(function (node) {
                        if (node.isMesh) {
                          node.castShadow = true;
                          node.receiveShadow = true;
          
                          // Enhance materials to work with environment lighting
                          if (node.material) {
                            if (node.material.isMeshStandardMaterial) {
                              node.material.envMapIntensity = 0.7;
                              node.material.roughness = Math.max(
                                0.2,
                                node.material.roughness
                              );
                              node.material.metalness = Math.min(
                                0.8,
                                node.material.metalness
                              );
                            } else if (Array.isArray(node.material)) {
                              node.material.forEach((material) => {
                                if (material.isMeshStandardMaterial) {
                                  material.envMapIntensity = 0.7;
                                  material.roughness = Math.max(
                                    0.2,
                                    material.roughness
                                  );
                                  material.metalness = Math.min(
                                    0.8,
                                    material.metalness
                                  );
                                }
                              });
                            }
                          }
                        }
                      });
                    }
          // Process other models as before...
          models[modelInfo.name] = model;
          scene.add(model);
          console.log(`Model "${modelInfo.name}" loaded`);
          if (modelInfo.name === "navmesh" && player) {
            placePlayerOnNavmesh(new THREE.Vector3(30, 10, 0));
          }
        },
        function (xhr) {
          console.log(`${modelInfo.name}: ${Math.round((xhr.loaded / xhr.total) * 100)}% loaded`);
        },
        function (error) {
          console.error(`Error loading ${modelInfo.name}:`, error);
          if (modelInfo.name === "navmesh") {
            createBackupNavmesh();
          }
        }
      );
    });
    loadingManager.onLoad = function () {
      document.getElementById("loading").style.display = "none";
      if (audioBuffer && !audioIsPlaying) {
        playPauseButton.style.backgroundColor = "rgba(80, 200, 120, 0.3)";
        setTimeout(() => {
          playPauseButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
        }, 2000);
      }
    };
  }

  // Backup model functions remain unchanged...
  function createBackupNavmesh() {
    const geometry = new THREE.BoxGeometry(50, 0.1, 50);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      opacity: 0.3,
      transparent: true,
      visible: false,
    });
    navmesh = new THREE.Mesh(geometry, material);
    navmesh.position.y = 0;
    scene.add(navmesh);
    placePlayerOnNavmesh(new THREE.Vector3(0, 2, 0));
  }

  // Setup player and input controls
  function setupPlayer() {
    const geometry = new THREE.CylinderGeometry(playerRadius, playerRadius, playerHeight, 16);
    geometry.translate(0, playerHeight / 2, 0);
    const material = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      opacity: 0,
      transparent: true,
    });
    player = new THREE.Mesh(geometry, material);
    player.position.y = 0;
    player.castShadow = true;
    scene.add(player);
    camera.position.set(0, playerHeight, 0);
    player.add(camera);

    // Keyboard controls for desktop
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Only enable pointer lock for non-mobile devices
    if (!isMobile) {
      renderer.domElement.addEventListener("click", function () {
        if (!mouseEnabled) {
          mouseEnabled = true;
          renderer.domElement.requestPointerLock();
        }
      });
      document.addEventListener("pointerlockchange", onPointerLockChange);
      document.addEventListener("mousemove", onMouseMove);
    } else {
      // Initialize mobile touch controls
      setupMobileControls();
      // Optionally display mobile instructions (already in HTML/CSS)
    }

    // Teleport click remains for desktop; you might extend this for mobile tap jump if desired
    setupTeleport();
  }

  function onKeyDown(event) {
    switch (event.code) {
      case "KeyW": keys.forward = true; break;
      case "KeyS": keys.backward = true; break;
      case "KeyA": keys.left = true; break;
      case "KeyD": keys.right = true; break;
      case "ShiftLeft":
      case "ShiftRight": keys.shift = true; break;
      case "Space":
        if (isOnGround) {
          verticalVelocity = jumpForce;
          isOnGround = false;
        }
        break;
      case "KeyT": toggleNavmeshVisibility(); break;
      case "KeyM": toggleAudio(); break;
    }
  }

  function onKeyUp(event) {
    switch (event.code) {
      case "KeyW": keys.forward = false; break;
      case "KeyS": keys.backward = false; break;
      case "KeyA": keys.left = false; break;
      case "KeyD": keys.right = false; break;
      case "ShiftLeft":
      case "ShiftRight": keys.shift = false; break;
    }
  }

  function onPointerLockChange() {
    mouseEnabled = document.pointerLockElement === renderer.domElement;
  }

  function onMouseMove(event) {
    if (!mouseEnabled) return;
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;
    euler.y -= movementX * 0.002;
    euler.x -= movementY * 0.002;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    camera.rotation.copy(euler);
    playerDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
  }

  // Mobile touch controls for movement and camera rotation
  function setupMobileControls() {
    let leftTouchId = null, rightTouchId = null;
    let leftStart = null, rightStart = null;

    window.addEventListener("touchstart", function(e) {
      for (let touch of e.changedTouches) {
        if (touch.clientX < window.innerWidth / 2 && leftTouchId === null) {
          leftTouchId = touch.identifier;
          leftStart = { x: touch.clientX, y: touch.clientY };
        } else if (touch.clientX >= window.innerWidth / 2 && rightTouchId === null) {
          rightTouchId = touch.identifier;
          rightStart = { x: touch.clientX, y: touch.clientY };
        }
      }
    }, false);

    window.addEventListener("touchmove", function(e) {
      for (let touch of e.changedTouches) {
        if (touch.identifier === leftTouchId) {
          let deltaX = touch.clientX - leftStart.x;
          let deltaY = touch.clientY - leftStart.y;
          keys.forward = deltaY < -20;
          keys.backward = deltaY > 20;
          keys.left = deltaX < -20;
          keys.right = deltaX > 20;
        } else if (touch.identifier === rightTouchId) {
          let deltaX = touch.clientX - rightStart.x;
          let deltaY = touch.clientY - rightStart.y;
          euler.y -= deltaX * 0.005;
          euler.x -= deltaY * 0.005;
          euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
          camera.rotation.copy(euler);
          rightStart = { x: touch.clientX, y: touch.clientY };
        }
      }
    }, false);

    window.addEventListener("touchend", function(e) {
      for (let touch of e.changedTouches) {
        if (touch.identifier === leftTouchId) {
          leftTouchId = null;
          keys.forward = keys.backward = keys.left = keys.right = false;
        } else if (touch.identifier === rightTouchId) {
          rightTouchId = null;
        }
      }
    }, false);
  }

  // Teleport functionality remains unchanged
  function setupTeleport() {
    const raycaster = new THREE.Raycaster();
    renderer.domElement.addEventListener("mousedown", function (event) {
      if (!mouseEnabled) return;
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const intersects = raycaster.intersectObject(navmesh, true);
      if (intersects.length > 0) {
        const targetPosition = intersects[0].point.clone();
        player.position.x = targetPosition.x;
        player.position.z = targetPosition.z;
        player.position.y = targetPosition.y;
        verticalVelocity = 0;
      }
    });
  }

  function placePlayerOnNavmesh(fallbackPosition) {
    if (!navmesh) {
      player.position.copy(fallbackPosition);
      return;
    }
    const raycaster = new THREE.Raycaster();
    const startPosition = new THREE.Vector3(fallbackPosition.x, 100, fallbackPosition.z);
    raycaster.set(startPosition, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(navmesh, true);
    if (intersects.length > 0) {
      player.position.x = intersects[0].point.x;
      player.position.z = intersects[0].point.z;
      player.position.y = intersects[0].point.y;
      console.log("Player placed at position:", player.position);
      verticalVelocity = 0;
      isOnGround = true;
    } else {
      console.log("Navmesh intersection not found, using fallback position");
      player.position.copy(fallbackPosition);
    }
  }

  function checkIsOnNavmesh(x, z) {
    const raycaster = new THREE.Raycaster();
    const pos = new THREE.Vector3(x, 100, z);
    raycaster.set(pos, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(navmesh, true);
    return intersects.length > 0;
  }

  function updatePlayerMovement() {
    if (!player || !navmesh) return;
    velocity.set(0, 0, 0);
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const cameraRight = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);
    const currentSpeed = keys.shift ? moveSpeed * 2 : moveSpeed;
    if (keys.forward) velocity.add(cameraDirection.clone().multiplyScalar(currentSpeed));
    if (keys.backward) velocity.add(cameraDirection.clone().multiplyScalar(-currentSpeed));
    if (keys.right) velocity.add(cameraRight.clone().multiplyScalar(currentSpeed));
    if (keys.left) velocity.add(cameraRight.clone().multiplyScalar(-currentSpeed));
    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(currentSpeed);
    }
    const oldPosition = player.position.clone();
    player.position.x += velocity.x;
    player.position.z += velocity.z;
    let isOnNavmesh = checkIsOnNavmesh(player.position.x, player.position.z);
    if (!isOnNavmesh) {
      player.position.x = oldPosition.x;
      player.position.z = oldPosition.z;
    }
    applyGravityAndVerticalMovement();
  }

  function applyGravityAndVerticalMovement() {
    verticalVelocity -= gravity;
    player.position.y += verticalVelocity;
    const raycaster = new THREE.Raycaster();
    const pos = new THREE.Vector3(player.position.x, player.position.y + 100, player.position.z);
    raycaster.set(pos, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(navmesh, true);
    if (intersects.length > 0) {
      const groundY = intersects[0].point.y;
      if (player.position.y <= groundY) {
        player.position.y = groundY;
        verticalVelocity = 0;
        isOnGround = true;
      } else {
        isOnGround = false;
      }
    } else {
      isOnGround = false;
      if (player.position.y < -50) {
        placePlayerOnNavmesh(new THREE.Vector3(0, 10, 0));
      }
    }
  }

  function animategrass(time) {
    if (!flowerParts.length) return;
    flowerParts.forEach((flowerPart) => {
      if (!flowerPart.userData.originalRotation) return;
      const windTime = time * windSettings.speed * 0.001;
      const windOffset = flowerPart.userData.windOffset || 0;
      const windFactor = flowerPart.userData.windFactor || 1;
      const windAmount = Math.sin(windTime + windOffset) * windSettings.strength * windFactor;
      const chaosX = Math.sin(windTime * 1.3 + windOffset * 2) * windSettings.chaos * windFactor;
      const chaosZ = Math.cos(windTime * 0.7 + windOffset * 3) * windSettings.chaos * windFactor;
      const xAngle = Math.max(-windSettings.maxAngle, Math.min(windSettings.maxAngle, windAmount + chaosX));
      const zAngle = Math.max(-windSettings.maxAngle, Math.min(windSettings.maxAngle, windAmount * 0.5 + chaosZ));
      flowerPart.rotation.x = flowerPart.userData.originalRotation.x + xAngle;
      flowerPart.rotation.z = flowerPart.userData.originalRotation.z + zAngle;
      if (flowerPart.userData.originalPosition) {
        flowerPart.position.x = flowerPart.userData.originalPosition.x + chaosX * 0.02;
        flowerPart.position.z = flowerPart.userData.originalPosition.z + chaosZ * 0.02;
      }
    });
  }

  function animate(time) {
    requestAnimationFrame(animate);
    stats.begin();
    updatePlayerMovement();
    scrollingTextures.forEach(tex => tex.offset.y += 0.0005);
    animategrass(time);

   // === Color cycle each light ===
   pointLights.forEach((light, i) => {
    hues[i] += 0.001; // control speed here
    if (hues[i] > 1) hues[i] = 0;
    light.color.setHSL(hues[i], 1, 0.5);
});
    renderer.render(scene, camera);
    stats.end();
  }

  function start() {
    setupScene();
    setupPlayer();
    loadModels();
    setTimeout(() => { /* Fix shadow artifacts */ }, 2000);
    requestAnimationFrame(animate);
  }

  start();
}
