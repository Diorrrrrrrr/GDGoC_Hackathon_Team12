import type { HealthSnapshot, Notification } from './types';

const bodyStates = ['normal', 'normal', 'normal', 'swing', 'normal', 'stroke', 'normal'] as const;
const faceStates = ['normal', 'pale', 'normal', 'normal', 'heatstroke', 'normal', 'normal'] as const;

export const weeklyHistory: HealthSnapshot[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (6 - i));
  return {
    timestamp: d.toISOString(),
    body: bodyStates[i],
    face: faceStates[i],
  };
});

export const mockNotifications: Notification[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    type: 'stroke',
    message: '뇌졸중(Stroke) 증상이 감지되었습니다. 즉시 확인이 필요합니다.',
    read: false,
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    type: 'heatstroke',
    message: '열사병(Heat Stroke) 위험 상태가 감지되었습니다.',
    read: false,
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    type: 'pale',
    message: '얼굴 창백(Pale) 상태가 감지되었습니다.',
    read: true,
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    type: 'swing',
    message: '비정상적인 신체 흔들림(Swing)이 감지되었습니다.',
    read: true,
  },
];
