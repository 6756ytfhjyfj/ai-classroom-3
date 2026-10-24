import {useEffect,useRef} from 'react';
/** Decorative only: transforms and opacity animate without handling input. */
export function WelcomeBackdrop(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const update=()=>{if(root.current)root.current.dataset.paused=String(document.hidden)};update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
 return <div ref={root} className="welcome-backdrop" aria-hidden="true"><div className="ambient-wash wash-blue"/><div className="ambient-wash wash-cyan"/><div className="ambient-wash wash-violet"/><div className="ambient-grid"/><div className="ambient-orbit orbit-one"><i/></div><div className="ambient-orbit orbit-two"><i/></div><span className="ambient-star star-one"/><span className="ambient-star star-two"/><span className="ambient-star star-three"/></div>
}
