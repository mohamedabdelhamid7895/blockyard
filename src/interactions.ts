/* Interactions: trigger + animation preset, exported as CSS keyframes and a tiny runtime script. */
import type { Interaction, IxTrigger, Node } from './types';
import { uid } from './model';

export const TRIGGERS: { id: IxTrigger; label: string; hint: string }[] = [
  { id: 'scroll', label: 'Scroll into view', hint: 'Plays when the element scrolls into the viewport' },
  { id: 'load', label: 'Page load', hint: 'Plays as soon as the page loads' },
  { id: 'hover', label: 'Mouse hover', hint: 'Plays each time the pointer enters the element' },
  { id: 'click', label: 'Mouse click', hint: 'Plays each time the element is clicked' },
];

/** `entrance` animations start hidden, so the element waits invisibly until its trigger fires. */
export const ANIMS: { id: string; label: string; entrance: boolean; keyframes: string }[] = [
  { id: 'fade-in', label: 'Fade in', entrance: true, keyframes: 'from{opacity:0}to{opacity:1}' },
  { id: 'fade-up', label: 'Slide up', entrance: true, keyframes: 'from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}' },
  { id: 'fade-down', label: 'Slide down', entrance: true, keyframes: 'from{opacity:0;transform:translateY(-40px)}to{opacity:1;transform:none}' },
  { id: 'fade-left', label: 'Slide from right', entrance: true, keyframes: 'from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:none}' },
  { id: 'fade-right', label: 'Slide from left', entrance: true, keyframes: 'from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:none}' },
  { id: 'zoom-in', label: 'Grow in', entrance: true, keyframes: 'from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}' },
  { id: 'zoom-out', label: 'Shrink in', entrance: true, keyframes: 'from{opacity:0;transform:scale(1.15)}to{opacity:1;transform:none}' },
  { id: 'flip-up', label: 'Flip up', entrance: true, keyframes: 'from{opacity:0;transform:perspective(800px) rotateX(35deg)}to{opacity:1;transform:none}' },
  { id: 'bounce', label: 'Bounce', entrance: false, keyframes: '0%,100%{transform:none}30%{transform:translateY(-14px)}50%{transform:none}70%{transform:translateY(-6px)}' },
  { id: 'pulse', label: 'Pulse', entrance: false, keyframes: '0%,100%{transform:none}50%{transform:scale(1.06)}' },
  { id: 'shake', label: 'Shake', entrance: false, keyframes: '0%,100%{transform:none}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}' },
  { id: 'wobble', label: 'Wobble', entrance: false, keyframes: '0%,100%{transform:none}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}' },
  { id: 'spin', label: 'Spin', entrance: false, keyframes: 'from{transform:rotate(0)}to{transform:rotate(360deg)}' },
];

export const EASINGS: [string, string][] = [
  ['ease', 'Ease'], ['ease-out', 'Ease out'], ['ease-in', 'Ease in'], ['ease-in-out', 'Ease in-out'], ['linear', 'Linear'],
  ['cubic-bezier(.34,1.56,.64,1)', 'Back out'],
];

export const newInteraction = (trigger: IxTrigger = 'scroll'): Interaction => ({
  id: uid(), trigger, anim: trigger === 'hover' || trigger === 'click' ? 'pulse' : 'fade-up',
  duration: 700, delay: 0, easing: 'ease-out', once: true,
});

export const IX_KEYFRAMES = ANIMS.map((a) => `@keyframes by-${a.id}{${a.keyframes}}`).join('\n') + '\n';

export const IX_CSS = `/* Interactions */
${IX_KEYFRAMES}.ix-js [data-ix-wait] { opacity: 0; }
@media (prefers-reduced-motion: reduce) { [data-ix] { animation: none !important; } .ix-js [data-ix-wait] { opacity: 1; } }
`;

export const animationValue = (x: Interaction) => `by-${x.anim} ${x.duration}ms ${x.easing} ${x.delay}ms both`;

/** Starts hidden until a load/scroll trigger plays an entrance animation. */
export const waitsForEntrance = (ix: Interaction[]) =>
  ix.some((x) => (x.trigger === 'load' || x.trigger === 'scroll') && ANIMS.find((a) => a.id === x.anim)?.entrance);

/** Compact JSON stored on the element as data-ix. */
export const ixData = (ix: Interaction[]) =>
  JSON.stringify(ix.map((x) => ({ t: x.trigger, a: x.anim, d: x.duration, l: x.delay, e: x.easing, o: x.once ? 1 : 0 })));

export function treeHasIx(n: Node): boolean {
  return !!n.ix?.length || (n.children || []).some(treeHasIx);
}

export const IX_RUNTIME = `<script>
(function(){
  document.documentElement.classList.add('ix-js');
  function play(el,c){var s=el.style;s.animation='none';void el.offsetWidth;s.animation='by-'+c.a+' '+c.d+'ms '+c.e+' '+c.l+'ms both';el.removeAttribute('data-ix-wait');}
  function init(){document.querySelectorAll('[data-ix]').forEach(function(el){
    var list;try{list=JSON.parse(el.getAttribute('data-ix'))}catch(e){return}
    list.forEach(function(c){
      if(c.t==='load')play(el,c);
      else if(c.t==='scroll'){
        if(!('IntersectionObserver' in window)){play(el,c);return}
        var seen=false,io=new IntersectionObserver(function(es){es.forEach(function(e){
          if(e.isIntersecting&&!(c.o&&seen)){seen=true;play(el,c);if(c.o)io.disconnect();}
        })},{threshold:0.15});io.observe(el);
      }
      else if(c.t==='hover')el.addEventListener('mouseenter',function(){play(el,c)});
      else if(c.t==='click')el.addEventListener('click',function(){play(el,c)});
    });
  });}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
</script>
`;
