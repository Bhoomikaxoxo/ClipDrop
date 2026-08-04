import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export function Ferrofluid(props) { return <FerrofluidBg {...props} />; }

export default function FerrofluidBg({
  enabled = true,
  colors = ["#060612", "#12082e", "#2d1370"],
  speed = 0.22,
  scale = 1.4,
  turbulence = 0.7,
  opacity = 0.32,
}) {
  const mountRef = useRef(null);
  const [ok, setOk] = useState(enabled);

  useEffect(() => {
    setOk(enabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [enabled]);

  useEffect(() => {
    if (!ok || !mountRef.current) return;
    const el = mountRef.current;
    let w = window.innerWidth, h = window.innerHeight;

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    el.appendChild(renderer.domElement);

    const mat = new THREE.ShaderMaterial({
      vertexShader: `void main(){gl_Position=vec4(position,1.);}`,
      fragmentShader: `
        uniform vec2 R; uniform float T;
        uniform vec3 C1,C2,C3;
        uniform float SPD,SCL,TRB,OPC;

        vec3 permute(vec3 x){return mod(((x*34.)+1.)*x,289.);}
        float sn(vec2 v){
          const vec4 C=vec4(.211324865,.366025403,-.577350269,.024390243);
          vec2 i=floor(v+dot(v,C.yy));
          vec2 x0=v-i+dot(i,C.xx);
          vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);
          vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
          i=mod(i,289.);
          vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
          vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
          m*=m; m*=m;
          vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5;
          vec3 a0=x-floor(x+.5);
          m*=1.79284291-.85373472*(a0*a0+h*h);
          vec3 g; g.x=a0.x*x0.x+h.x*x0.y;
          g.yz=a0.yz*x12.xz+h.yz*x12.yw;
          return 130.*dot(m,g);
        }

        void main(){
          vec2 st=gl_FragCoord.xy/R; st.x*=R.x/R.y;
          float t=T*SPD*.3;
          vec2 q=vec2(sn(st*SCL+vec2(t*.18,t*.22)), sn(st*SCL+vec2(t*.22,t*.14)));
          vec2 r=vec2(sn(st*SCL+q+vec2(t*.38,t*.28)), sn(st*SCL+q+vec2(t*.14,t*.46)));
          float f=sn(st*SCL+r*TRB);
          vec3 col=mix(C1,C2,clamp(f*f*3.,0.,1.));
          col=mix(col,C3,clamp(length(q)*.55,0.,1.));
          float shine=pow(clamp(1.-length(r),0.,1.),5.);
          col=mix(col*.25,col*.95,shine);
          gl_FragColor=vec4(col,OPC);
        }
      `,
      uniforms: {
        R:   { value: new THREE.Vector2(w, h) },
        T:   { value: 0 },
        C1:  { value: new THREE.Color(colors[0]) },
        C2:  { value: new THREE.Color(colors[1]) },
        C3:  { value: new THREE.Color(colors[2]) },
        SPD: { value: speed },
        SCL: { value: scale },
        TRB: { value: turbulence },
        OPC: { value: opacity },
      },
      transparent: true,
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    let id; const t0 = Date.now();
    const onResize = () => {
      w = window.innerWidth; h = window.innerHeight;
      renderer.setSize(w, h); mat.uniforms.R.value.set(w, h);
    };
    window.addEventListener('resize', onResize);
    const loop = () => {
      mat.uniforms.T.value = (Date.now() - t0) / 1000;
      renderer.render(scene, cam);
      id = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', onResize);
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      mat.dispose(); renderer.dispose();
    };
  }, [ok]);

  if (!ok) return <div className="fixed inset-0 bg-[#060612] pointer-events-none" />;
  return <div ref={mountRef} className="fixed inset-0 pointer-events-none z-0" />;
}
