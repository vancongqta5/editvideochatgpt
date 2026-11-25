export type CaptionStyle = {
  fontSize: number;
  positionX: number;
  positionY: number;
  maxWidth: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  strokeWidth: number;
  strokeColor: string;
  effect: 'none' | 'fade' | 'pop' | 'slide';
};

export type Scene = Partial<CaptionStyle> & {
  id: string | number;
  start: number;
  end: number;
  text: string;
  [key: string]: unknown;
};

export const defaultStyle: CaptionStyle = {
  fontSize: 52, positionX: 50, positionY: 220, maxWidth: 87,
  fontFamily: 'Arial', fontWeight: 700, color: '#ffffff',
  backgroundColor: '#000000', backgroundOpacity: 0.55,
  strokeWidth: 0, strokeColor: '#000000', effect: 'none',
};

export const fonts = ['Arial', 'Tahoma', 'Verdana', 'Georgia', 'Times New Roman'];
export const styleOf = (scene: Scene): CaptionStyle => {
  const result = {...defaultStyle};
  for (const key of Object.keys(defaultStyle) as (keyof CaptionStyle)[]) {
    if (scene[key] !== undefined) Object.assign(result, {[key]: scene[key]});
  }
  return result;
};
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function sceneFrame(scene: Scene, fps: number) {
  return Math.round(scene.start * fps);
}

export function isActive(scene: Scene, frame: number, fps: number) {
  return frame >= sceneFrame(scene, fps) && frame < Math.round(scene.end * fps);
}
