import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

export const ICON_NAMES = [
  'tefillin',
  'shema',
  'shacharit',
  'mincha',
  'maariv',
  'brachot',
  'candles',
  'havdalah',
  'omer',
  'custom',
  'hilula',
  'siddur',
  'prayers',
  'meals',
  'blessings',
  'night',
  'moon',
  'occasions',
  'sparkle',
  'check',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
export type IconVariant = 'outline' | 'duotone';

// The owner picks the style on the preview board; switching is this one line.
export const ICON_VARIANT: IconVariant = 'outline';

export function iconFor(icon: string): IconName {
  return (ICON_NAMES as readonly string[]).includes(icon) ? (icon as IconName) : 'custom';
}

type Drawing = { fill: string; sw: number };

// Geometry is shared by both variants; `fill` is 'none' in outline and the tint in duotone.
// Stroke colour, width, caps and joins come from the wrapping <G>.
const DRAWINGS: Record<IconName, (p: Drawing) => React.ReactElement> = {
  tefillin: ({ fill, sw }) => (
    <>
      <Rect x={8} y={4} width={8} height={8} rx={1.5} fill={fill} />
      <Rect x={10} y={6} width={4} height={4} strokeWidth={sw * 0.55} />
      <Line x1={6} y1={13} x2={18} y2={13} />
      <Path d="M9,13C9,17 7,17 7,21" />
      <Path d="M15,13C15,17 17,17 17,21" />
    </>
  ),
  shema: ({ fill }) => (
    <>
      <Rect x={6} y={5} width={12} height={14} fill={fill} stroke="none" />
      <Path d="M6,6.3V17.7" />
      <Path d="M18,6.3V17.7" />
      <Ellipse cx={12} cy={5} rx={8} ry={2} fill={fill} />
      <Ellipse cx={12} cy={19} rx={8} ry={2} fill={fill} />
      <Line x1={9.5} y1={10.5} x2={14.5} y2={10.5} />
      <Line x1={9.5} y1={14} x2={14.5} y2={14} />
    </>
  ),
  shacharit: ({ fill }) => (
    <>
      <Path d="M7.5,16A4.5,4.5 0 0 1 16.5,16Z" fill={fill} />
      <Line x1={3.5} y1={16} x2={20.5} y2={16} />
      <Line x1={7.5} y1={19.5} x2={16.5} y2={19.5} />
      <Line x1={12} y1={8.8} x2={12} y2={6.3} />
      <Line x1={6.91} y1={10.91} x2={5.14} y2={9.14} />
      <Line x1={17.09} y1={10.91} x2={18.86} y2={9.14} />
    </>
  ),
  mincha: ({ fill }) => (
    <>
      <Circle cx={12} cy={12} r={3.8} fill={fill} />
      <Line x1={18.4} y1={12} x2={21.2} y2={12} />
      <Line x1={16.53} y1={7.47} x2={18.51} y2={5.49} />
      <Line x1={12} y1={5.6} x2={12} y2={2.8} />
      <Line x1={7.47} y1={7.47} x2={5.49} y2={5.49} />
      <Line x1={5.6} y1={12} x2={2.8} y2={12} />
      <Line x1={7.47} y1={16.53} x2={5.49} y2={18.51} />
      <Line x1={12} y1={18.4} x2={12} y2={21.2} />
      <Line x1={16.53} y1={16.53} x2={18.51} y2={18.51} />
    </>
  ),
  maariv: ({ fill }) => (
    <>
      <Path d="M16.52,14.51A6.48,6.48 0 1 1 9.47,7.46A5.04,5.04 0 0 0 16.52,14.51Z" fill={fill} />
      <Path
        d="M15.8,3.1Q16.48,5.82 19.2,6.5Q16.48,7.18 15.8,9.9Q15.12,7.18 12.4,6.5Q15.12,5.82 15.8,3.1Z"
        fill={fill}
      />
      <Path
        d="M19.6,9.9Q19.98,11.42 21.5,11.8Q19.98,12.18 19.6,13.7Q19.22,12.18 17.7,11.8Q19.22,11.42 19.6,9.9Z"
        fill={fill}
      />
    </>
  ),
  brachot: ({ fill }) => (
    <>
      <Path d="M4.5,13H10.5V16Q10.5,20 7.5,20Q4.5,20 4.5,16Z" fill={fill} />
      <Line x1={4.5} y1={8.5} x2={4.5} y2={13} />
      <Line x1={7.5} y1={7} x2={7.5} y2={13} />
      <Line x1={10.5} y1={8.5} x2={10.5} y2={13} />
      <Path d="M19.5,13H13.5V16Q13.5,20 16.5,20Q19.5,20 19.5,16Z" fill={fill} />
      <Line x1={19.5} y1={8.5} x2={19.5} y2={13} />
      <Line x1={16.5} y1={7} x2={16.5} y2={13} />
      <Line x1={13.5} y1={8.5} x2={13.5} y2={13} />
    </>
  ),
  candles: ({ fill }) => (
    <>
      <Rect x={6} y={12.2} width={4} height={7.8} rx={0.8} fill={fill} />
      <Rect x={14} y={12.2} width={4} height={7.8} rx={0.8} fill={fill} />
      <Path d="M8,3.5C8,3.5 5.8,5.9 5.8,7.5A2.2,2.2 0 0 0 10.2,7.5C10.2,5.9 8,3.5 8,3.5Z" fill={fill} />
      <Path d="M16,3.5C16,3.5 13.8,5.9 13.8,7.5A2.2,2.2 0 0 0 18.2,7.5C18.2,5.9 16,3.5 16,3.5Z" fill={fill} />
    </>
  ),
  havdalah: ({ fill }) => (
    <>
      <Path d="M7.5,11Q9.5,13.3 7.5,15.6T7.5,20.2" />
      <Path d="M12,11Q14,13.3 12,15.6T12,20.2" />
      <Path d="M16.5,11Q18.5,13.3 16.5,15.6T16.5,20.2" />
      <Path d="M12,2.4C12,2.4 9.8,4.8 9.8,6.4A2.2,2.2 0 0 0 14.2,6.4C14.2,4.8 12,2.4 12,2.4Z" fill={fill} />
    </>
  ),
  omer: ({ fill }) => (
    <>
      <Line x1={12} y1={20} x2={12} y2={4.5} />
      <Path d="M12,18Q10.73,14.44 7,15Q8.27,18.56 12,18Z" fill={fill} />
      <Path d="M12,18Q15.73,18.56 17,15Q13.27,14.44 12,18Z" fill={fill} />
      <Path d="M12,13Q10.73,9.44 7,10Q8.27,13.56 12,13Z" fill={fill} />
      <Path d="M12,13Q15.73,13.56 17,10Q13.27,9.44 12,13Z" fill={fill} />
      <Path d="M12,8Q10.73,4.44 7,5Q8.27,8.56 12,8Z" fill={fill} />
      <Path d="M12,8Q15.73,8.56 17,5Q13.27,4.44 12,8Z" fill={fill} />
    </>
  ),
  custom: ({ fill }) => (
    <Path
      d="M12,3.3L14.53,9.32L21.04,9.86L16.09,14.13L17.58,20.49L12,17.1L6.42,20.49L7.91,14.13L2.96,9.86L9.47,9.32Z"
      fill={fill}
    />
  ),
  hilula: ({ fill }) => (
    <>
      <Path d="M5.5,9V13Q5.5,20.5 12,20.5Q18.5,20.5 18.5,13V9Z" fill={fill} stroke="none" />
      <Path d="M5.5,9V13Q5.5,20.5 12,20.5Q18.5,20.5 18.5,13V9" />
      <Path d="M12,4.8C12,4.8 9.7,7.2 9.7,8.8A2.3,2.3 0 0 0 14.3,8.8C14.3,7.2 12,4.8 12,4.8Z" fill={fill} />
    </>
  ),
  siddur: ({ fill }) => (
    <>
      <Path d="M12,6.5Q8.5,4.5 3.5,5.5V17.5Q8.5,16.5 12,19.5Z" fill={fill} />
      <Path d="M12,6.5Q15.5,4.5 20.5,5.5V17.5Q15.5,16.5 12,19.5Z" fill={fill} />
    </>
  ),
  prayers: (drawing) => DRAWINGS.siddur(drawing),
  meals: ({ fill }) => (
    <>
      <Circle cx={12.4} cy={12} r={4} fill={fill} />
      <Path d="M2.9,3.8V8Q2.9,10.3 4.3,10.3Q5.7,10.3 5.7,8V3.8" />
      <Line x1={4.3} y1={10.3} x2={4.3} y2={20.5} />
      <Path d="M19.6,3.8C21.6,5.2 21.6,9.6 19.6,11" />
      <Line x1={19.6} y1={11} x2={19.6} y2={20.5} />
    </>
  ),
  blessings: ({ fill }) => (
    <>
      <Path d="M9.5,7.5Q10.7,12.3 15.5,13.5Q10.7,14.7 9.5,19.5Q8.3,14.7 3.5,13.5Q8.3,12.3 9.5,7.5Z" fill={fill} />
      <Path d="M18,3.3Q18.64,5.86 21.2,6.5Q18.64,7.14 18,9.7Q17.36,7.14 14.8,6.5Q17.36,5.86 18,3.3Z" fill={fill} />
      <Path d="M18.5,15Q19,17 21,17.5Q19,18 18.5,20Q18,18 16,17.5Q18,17 18.5,15Z" fill={fill} />
    </>
  ),
  night: ({ fill }) => <Path d="M21.6,12.39A9,9 0 1 1 11.81,2.6A7,7 0 0 0 21.6,12.39Z" fill={fill} />,
  moon: ({ fill }) => <Path d="M7.5,3A9,9 0 0 1 7.5,21A12,12 0 0 0 7.5,3Z" fill={fill} />,
  occasions: ({ fill }) => (
    <>
      <Path d="M7,4H17V8.5Q17,13.5 12,13.5Q7,13.5 7,8.5Z" fill={fill} />
      <Line x1={12} y1={13.5} x2={12} y2={18.5} />
      <Line x1={8.5} y1={20.5} x2={15.5} y2={20.5} />
    </>
  ),
  sparkle: ({ fill }) => (
    <Path d="M12,2.8Q13.66,10.34 21.2,12Q13.66,13.66 12,21.2Q10.34,13.66 2.8,12Q10.34,10.34 12,2.8Z" fill={fill} />
  ),
  check: () => <Path d="M4.5,12.5L9.5,17.5L19.5,6.5" />,
};

type Props = {
  name: IconName;
  size?: number;
  color: string;
  tint?: string;
  variant?: IconVariant;
  strokeWidth?: number;
};

export function MitzvahIcon({ name, size = 22, color, tint, variant = ICON_VARIANT, strokeWidth }: Props) {
  const duotone = variant === 'duotone';
  const sw = strokeWidth ?? (duotone ? 1.5 : 1.8);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {DRAWINGS[name]({ fill: duotone ? (tint ?? 'transparent') : 'none', sw })}
      </G>
    </Svg>
  );
}
