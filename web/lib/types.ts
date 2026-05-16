export type BodyStatus = 'normal' | 'swing' | 'stroke';
export type FaceStatus = 'normal' | 'pale' | 'heatstroke';
export type StatusLevel = 'normal' | 'warning' | 'danger';

export interface HealthSnapshot {
  timestamp: string;
  body: BodyStatus;
  face: FaceStatus;
}

export interface Notification {
  id: string;
  timestamp: string;
  type: 'stroke' | 'heatstroke' | 'pale' | 'swing';
  message: string;
  read: boolean;
}

export function bodyLevel(s: BodyStatus): StatusLevel {
  if (s === 'stroke') return 'danger';
  if (s === 'swing') return 'warning';
  return 'normal';
}

export function faceLevel(s: FaceStatus): StatusLevel {
  if (s === 'heatstroke') return 'danger';
  if (s === 'pale') return 'warning';
  return 'normal';
}

export function isDangerous(body: BodyStatus, face: FaceStatus) {
  return body === 'stroke' || face === 'heatstroke';
}

export const BODY_LABEL: Record<BodyStatus, string> = {
  normal: 'Normal',
  swing: 'Swing',
  stroke: 'Stroke',
};

export const FACE_LABEL: Record<FaceStatus, string> = {
  normal: 'Normal',
  pale: 'Pale',
  heatstroke: 'Heat Stroke',
};
