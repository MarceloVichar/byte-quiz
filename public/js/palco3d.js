// Cenas 3D do telão (Three.js). Cada cena desenha em um canvas próprio, atrás do texto,
// nunca por cima dele. Sem WebGL, as funções devolvem null e a tela usa a versão plana.

import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const gsap = window.gsap;
const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let fontePromessa = null;

function fonte() {
  if (!fontePromessa) {
    fontePromessa = new Promise((ok, falha) => {
      new FontLoader().load('/vendor/three/examples/fonts/helvetiker_bold.typeface.json', ok, undefined, falha);
    });
  }
  return fontePromessa;
}

function webglDisponivel() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (_) {
    return false;
  }
}

function montarPalco(container, { fov = 35 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x2a3040, 1.7));
  const luz = new THREE.DirectionalLight(0xffffff, 1.6);
  luz.position.set(4, 6, 8);
  cena.add(luz);

  const ajustar = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  ajustar();
  const observador = new ResizeObserver(ajustar);
  observador.observe(container);

  let ativo = true;
  const aCada = [];
  const relogio = new THREE.Clock();
  const quadro = () => {
    if (!ativo) return;
    const t = relogio.getElapsedTime();
    aCada.forEach((f) => f(t));
    renderer.render(cena, camera);
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);

  return {
    renderer, cena, camera, aCada,
    destruir() {
      ativo = false;
      observador.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function glifo3d(f, texto, { tamanho = 1, profundidade = 0.35, cor = 0xb0298f }) {
  const geo = new TextGeometry(texto, {
    font: f, size: tamanho, depth: profundidade, height: profundidade, curveSegments: 10,
    bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3,
  });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0.05 });
  return new THREE.Mesh(geo, mat);
}

// Um par de símbolos ({ }, [ ]...) girando devagar dos dois lados de um espaço vazio no centro,
// onde fica o QR code ou a pergunta.
export async function cenaPar(container, { abre = '{', fecha = '}', cor = 0xff4fa3, afastamento = 2.3, tamanho = 2.6 } = {}) {
  if (!webglDisponivel()) return null;
  let f;
  try { f = await fonte(); } catch (_) { return null; }
  const p = montarPalco(container);
  p.camera.position.set(0, 0, 10);
  const esquerda = glifo3d(f, abre, { tamanho, cor });
  const direita = glifo3d(f, fecha, { tamanho, cor });
  esquerda.position.x = -afastamento;
  direita.position.x = afastamento;
  p.cena.add(esquerda, direita);

  p.aCada.push((t) => {
    if (reduzido) return;
    esquerda.rotation.y = Math.sin(t * 0.6) * 0.35 + 0.25;
    direita.rotation.y = Math.sin(t * 0.6 + 1.3) * 0.35 - 0.25;
    esquerda.position.y = Math.sin(t * 0.9) * 0.12;
    direita.position.y = Math.cos(t * 0.9) * 0.12;
  });

  const api = {
    ...p,
    entrar() {
      if (!gsap || reduzido) return;
      gsap.fromTo([esquerda.position, direita.position], { z: -14 }, { z: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 });
      gsap.fromTo([esquerda.rotation, direita.rotation], { z: -1.2 }, { z: 0, duration: 1.4, ease: 'expo.out' });
    },
    trocar(novoAbre, novoFecha, novaCor) {
      const trocarUm = (mesh, texto) => {
        const novo = glifo3d(f, texto, { tamanho, cor: novaCor ?? cor });
        mesh.geometry.dispose();
        mesh.geometry = novo.geometry;
        mesh.material.color.set(novaCor ?? cor);
      };
      trocarUm(esquerda, novoAbre);
      trocarUm(direita, novoFecha);
      api.entrar();
    },
  };
  api.entrar();
  return api;
}

// Pódio: três blocos que sobem um de cada vez. rotulos(fn) recebe, a cada quadro, a posição
// na tela do topo de cada bloco, para o HTML colocar nome e pontos em cima.
export async function cenaPodio(container, quantos = 3) {
  if (!webglDisponivel()) return null;
  let f;
  try { f = await fonte(); } catch (_) { return null; }
  const p = montarPalco(container, { fov: 30 });
  p.camera.position.set(0, 3.6, 11.5);
  const alvo = new THREE.Vector3(0, 2.9, 0);
  p.camera.lookAt(alvo);

  const blocos = [
    { pos: 1, x: 0, altura: 3.4, cor: 0xffc31f, corNumero: 0x0b0d12 },
    { pos: 2, x: -2.7, altura: 2.4, cor: 0x3d8bff, corNumero: 0x0b0d12 },
    { pos: 3, x: 2.7, altura: 1.7, cor: 0xff4fa3, corNumero: 0x0b0d12 },
  ].filter((b) => b.pos <= quantos);

  for (const b of blocos) {
    const geo = new THREE.BoxGeometry(2.45, b.altura, 2.2);
    geo.translate(0, b.altura / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: b.cor, roughness: 0.6 }));
    mesh.position.x = b.x;
    mesh.scale.y = 0.001;
    const numero = glifo3d(f, String(b.pos), { tamanho: 1.1, profundidade: 0.12, cor: b.corNumero });
    numero.position.set(0, b.altura - 0.95, 1.12);
    mesh.add(numero);
    p.cena.add(mesh);
    b.mesh = mesh;
  }

  let rotulos = null;
  const v = new THREE.Vector3();
  p.aCada.push((t) => {
    if (!reduzido) {
      p.camera.position.x = Math.sin(t * 0.25) * 1.4;
      p.camera.lookAt(alvo);
    }
    if (rotulos) {
      const w = container.clientWidth;
      const h = container.clientHeight;
      rotulos(blocos.map((b) => {
        v.set(b.x, b.altura * b.mesh.scale.y + 0.25, -1.1).project(p.camera);
        return { pos: b.pos, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
      }));
    }
  });

  return {
    ...p,
    aoPosicionar(fn) { rotulos = fn; },
    subir(pos, duracao = 1.1) {
      const b = blocos.find((x) => x.pos === pos);
      if (!b) return;
      if (!gsap || reduzido) { b.mesh.scale.y = 1; return; }
      gsap.to(b.mesh.scale, { y: 1, duration: duracao, ease: 'back.out(1.6)' });
    },
    tudo() { blocos.forEach((b) => { b.mesh.scale.y = 1; }); },
  };
}
