import * as THREE from 'three';

// --- Configuration ---
const CONFIG = {
    fog: { color: 0x000000, density: 0.0015 },
    camera: { fov: 75, near: 0.1, far: 3000, zStart: 60, zEndOffset: 1200 },
    stars: { count: 50000, range: 1500, zMin: -500, zMax: 2500 },
    text: {
        old: { text: "2025", sub: "Goodbye", color: "#aaddff", z: 0 },
        new: { text: "2026", sub: "Happy New Year", color: "#ffdd44", z: 1180 }
    }
};

// --- 1. Scene Setup ---
const container = document.getElementById('canvas-container');
if (!container) throw new Error("Canvas container not found");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.fog.color, CONFIG.fog.density);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, CONFIG.camera.near, CONFIG.camera.far);
camera.position.z = CONFIG.camera.zStart;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// --- 2. Particle Text System ---
function createParticleText({ text, sub, z, color }: { text: string, sub?: string, z: number, color: string }) {
    const width = 2048, height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context");

    // Draw Text
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height);
    
    ctx.font = 'bold 350px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FF0000'; // Red channel for main text
    ctx.fillText(text, width / 2, height / 2);

    if (sub) {
        ctx.font = 'bold 120px Arial';
        ctx.fillStyle = '#00FF00'; // Green channel for sub text
        ctx.fillText(sub, width / 2, height / 2 + 250);
    }

    // Generate Particles
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const points: number[] = [], sizes: number[] = [], randoms: number[] = [];
    const step = 3; // High density

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i + 1];
            
            if (r > 50 || g > 50) {
                const pX = (x - width / 2) * 0.06;
                const pY = -(y - height / 2) * 0.06;
                points.push(pX, pY, 0);
                sizes.push(r > 50 ? 1.0 : 0.45); // Smaller size for sub text
                randoms.push(Math.random());
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('aSizeScale', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 1));

    // Shader Material
    const threeColor = new THREE.Color(color);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Vector3(threeColor.r, threeColor.g, threeColor.b) },
            uOpacity: { value: 1.0 }
        },
        vertexShader: `
            uniform float uTime;
            attribute float aRandom;
            attribute float aSizeScale;
            void main() {
                vec3 pos = position;
                float time = uTime * 0.8;
                pos.x += sin(time + aRandom * 10.0) * 0.15;
                pos.y += cos(time * 0.9 + aRandom * 20.0) * 0.15;
                pos.z += sin(time * 0.5 + aRandom * 5.0) * 0.5;
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                float baseSize = 280.0;
                float twinkle = 0.9 + sin(time * 2.5 + aRandom * 100.0) * 0.3;
                gl_PointSize = (baseSize * aSizeScale / -mvPosition.z) * twinkle;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float dist = length(uv);
                if (dist > 0.5) discard;
                float strength = pow(1.0 - (dist * 2.0), 2.0);
                vec3 finalColor = mix(uColor, vec3(1.0), strength * 0.6);
                gl_FragColor = vec4(finalColor, uOpacity * strength);
            }
        `,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    const mesh = new THREE.Points(geometry, material);
    mesh.position.z = z;
    scene.add(mesh);
    return mesh;
}

const text2025 = createParticleText(CONFIG.text.old);
const text2026 = createParticleText(CONFIG.text.new);
text2026.material.uniforms.uOpacity.value = 0;

// --- 3. Star Field ---
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(CONFIG.stars.count * 3);
for(let i = 0; i < CONFIG.stars.count; i++) {
    starPos[i*3] = (Math.random() - 0.5) * CONFIG.stars.range;
    starPos[i*3+1] = (Math.random() - 0.5) * CONFIG.stars.range;
    starPos[i*3+2] = (Math.random() * (CONFIG.stars.zMax - CONFIG.stars.zMin)) + CONFIG.stars.zMin;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ size: 0.6, color: 0xffffff, transparent: true });
const starField = new THREE.Points(starGeo, starMat);
scene.add(starField);

// --- 4. Fireworks ---
interface FireworkVelocity {
    x: number;
    y: number;
    z: number;
}

let fireworks: Firework[] = [];
const particleTex = (() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    if (!ctx) return new THREE.Texture();
    const g = ctx.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0,'white'); g.addColorStop(1,'transparent');
    ctx.fillStyle = g; ctx.fillRect(0,0,32,32);
    return new THREE.CanvasTexture(c);
})();

class Firework {
    done: boolean = false;
    dest: THREE.Vector3;
    exploded: boolean = false;
    velocities: FireworkVelocity[] = [];
    pos: THREE.Vector3;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
    mesh: THREE.Points;

    constructor(target: THREE.Vector3) {
        this.dest = target;
        this.pos = new THREE.Vector3(target.x, target.y - 50, target.z);
        this.geometry = new THREE.BufferGeometry().setFromPoints([this.pos]);
        this.material = new THREE.PointsMaterial({ size: 3, color: Math.random() * 0xffffff, map: particleTex, blending: THREE.AdditiveBlending, transparent: true });
        this.mesh = new THREE.Points(this.geometry, this.material);
        scene.add(this.mesh);
    }
    update() {
        if(this.done) return;
        const pos = this.geometry.attributes.position;
        if(!this.exploded) {
            pos.setY(0, pos.getY(0) + (this.dest.y - pos.getY(0)) * 0.15 + 0.2);
            if(this.dest.y - pos.getY(0) < 1) this.explode();
            pos.needsUpdate = true;
        } else {
            for(let i=0; i<this.velocities.length; i++) {
                pos.setXYZ(i, pos.getX(i)+this.velocities[i].x, pos.getY(i)+this.velocities[i].y, pos.getZ(i)+this.velocities[i].z);
                this.velocities[i].y -= 0.03;
                this.velocities[i].x *= 0.96; this.velocities[i].y *= 0.96; this.velocities[i].z *= 0.96;
            }
            pos.needsUpdate = true;
            this.material.opacity -= 0.02;
            if(this.material.opacity <= 0) { this.done = true; scene.remove(this.mesh); }
        }
    }
    explode() {
        this.exploded = true;
        const positions: number[] = [];
        for(let i=0; i<100; i++) {
            positions.push(this.pos.x, this.pos.y, this.pos.z);
            const theta = Math.random() * 6.28, phi = Math.random() * 3.14, r = Math.random() * 0.8 + 0.2;
            this.velocities.push({x: r*Math.sin(phi)*Math.cos(theta), y: r*Math.sin(phi)*Math.sin(theta), z: r*Math.cos(phi)});
        }
        this.geometry.dispose();
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.mesh.geometry = this.geometry;
    }
}

// --- 5. Interaction & Animation ---
let scrollProgress = 0, canClick = false;
const mapRange = (v: number, iMin: number, iMax: number, oMin: number, oMax: number) => oMin + Math.max(0, Math.min(1, (v - iMin) / (iMax - iMin))) * (oMax - oMin);

window.addEventListener('scroll', () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = window.scrollY / maxScroll;
    
    const hint = document.getElementById('hint-text');
    if (hint) {
        const isEnd = scrollProgress > 0.9;
        hint.innerText = isEnd ? "CLICK ANYWHERE!" : "SCROLL DOWN ▼";
        hint.style.color = isEnd ? "#ffd700" : "rgba(255,255,255,0.8)";
    }
    canClick = scrollProgress > 0.9;
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener('pointerdown', (e) => {
    if(!canClick) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const dist = (CONFIG.text.new.z - camera.position.z) / raycaster.ray.direction.z;
    fireworks.push(new Firework(raycaster.ray.at(dist, new THREE.Vector3())));
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);

    // Camera Movement
    const targetZ = CONFIG.camera.zStart + (scrollProgress * CONFIG.camera.zEndOffset);
    camera.position.z += (targetZ - camera.position.z) * 0.08;

    // Text Opacity & Scale
    text2025.material.uniforms.uOpacity.value = mapRange(scrollProgress, 0.0, 0.2, 1, 0);
    text2025.scale.setScalar(mapRange(scrollProgress, 0.0, 0.2, 1, 0.5));

    text2026.material.uniforms.uOpacity.value = mapRange(scrollProgress, 0.6, 0.9, 0, 1);

    // Updates
    const time = performance.now() * 0.001;
    text2025.material.uniforms.uTime.value = time;
    text2026.material.uniforms.uTime.value = time;
    starField.rotation.z += 0.001;

    for(let i=fireworks.length-1; i>=0; i--) {
        fireworks[i].update();
        if(fireworks[i].done) fireworks.splice(i,1);
    }

    renderer.render(scene, camera);
}
animate();
