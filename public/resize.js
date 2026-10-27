// Scale the whole object, keeping the opposite corner or edge fixed.
export function resizeObject(item, handle, width, height, dx, dy, zoom) {
  const start = Number.isFinite(item.scale) ? item.scale : 1;
  const horizontal = handle.includes('e') ? dx / zoom / width : handle.includes('w') ? -dx / zoom / width : 0;
  const vertical = handle.includes('s') ? dy / zoom / height : handle.includes('n') ? -dy / zoom / height : 0;
  const change = handle.length === 2 ? (horizontal + vertical) / 2 : horizontal || vertical;
  const scale = Math.max(.25, Math.min(4, start + change));
  const difference = start - scale;
  return {...item, scale, x: item.x + (handle.includes('w') ? width * difference : 0), y: item.y + (handle.includes('n') ? height * difference : 0)};
}
// Hit-test an eraser movement against the segments of one pencil stroke.
export function touchesStroke(points, from, to, radius) {
  const dist = (p, a, b) => {
    const dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  };
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const near=(a,b)=>{
    const c1=cross(from,to,a), c2=cross(from,to,b), c3=cross(a,b,from), c4=cross(a,b,to);
    const intersects=c1*c2<0&&c3*c4<0;
    return intersects||Math.min(dist(a,from,to),dist(b,from,to),dist(from,a,b),dist(to,a,b))<=radius;
  };
  for(let i=0;i<points.length;i++){
    const a={x:points[i][0],y:points[i][1]}, b=i?{x:points[i-1][0],y:points[i-1][1]}:a;
    if(near(a,b))return true;
  }
  return false;
}

export function pitchForStaffY(y) {
  const pitches=[77,76,74,72,71,69,67,65,64,62,60];
  const i=Math.round((y-24)/5);
  return i>=0&&i<pitches.length?pitches[i]:null;
}

export function transposeChord(chord, semitones) {
  const m=/^([A-G])([#b]?)(m|maj7|m7|7|dim|aug|sus2|sus4|6|9)?(?:\/([A-G])([#b]?))?$/.exec(chord);
  if(!m)return null;
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const bases={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const shift=(letter,accidental)=>names[((bases[letter]+(accidental==='#'?1:accidental==='b'?-1:0)+semitones)%12+12)%12];
  return shift(m[1],m[2])+(m[3]||'')+(m[4]?'/'+shift(m[4],m[5]):'');
}
