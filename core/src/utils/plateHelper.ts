interface CharResult {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  char: string;
}

function linearEquation(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const b = y1 - ((y2 - y1) * x1) / (x2 - x1);
  const a = (y1 - b) / x1;
  return [a, b];
}

function checkPointLinear(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const [a, b] = linearEquation(x1, y1, x2, y2);
  const yPred = a * x + b;
  return Math.abs(yPred - y) <= 3;
}

export function readPlate(chars: CharResult[]): string {
  if (chars.length === 0 || chars.length < 7 || chars.length > 10) {
    return 'unknown';
  }

  const centers: { x: number; y: number; char: string }[] = chars.map(c => ({
    x: (c.x1 + c.x2) / 2,
    y: (c.y1 + c.y2) / 2,
    char: c.char,
  }));

  let lPoint = centers[0];
  let rPoint = centers[0];
  for (const cp of centers) {
    if (cp.x < lPoint.x) lPoint = cp;
    if (cp.x > rPoint.x) rPoint = cp;
  }

  let lpType = '1';
  for (const ct of centers) {
    if (lPoint.x !== rPoint.x) {
      if (
        !checkPointLinear(ct.x, ct.y, lPoint.x, lPoint.y, rPoint.x, rPoint.y)
      ) {
        lpType = '2';
        break;
      }
    }
  }

  const yMean = centers.reduce((sum, c) => sum + c.y, 0) / centers.length;

  const line1: { x: number; char: string }[] = [];
  const line2: { x: number; char: string }[] = [];

  if (lpType === '2') {
    for (const c of centers) {
      if (c.y > yMean) {
        line2.push({ x: c.x, char: c.char });
      } else {
        line1.push({ x: c.x, char: c.char });
      }
    }
    const line1Str = line1.sort((a, b) => a.x - b.x).map(l => l.char).join('');
    const line2Str = line2.sort((a, b) => a.x - b.x).map(l => l.char).join('');
    return line1Str + '-' + line2Str;
  } else {
    return centers
      .sort((a, b) => a.x - b.x)
      .map(c => c.char)
      .join('');
  }
}
