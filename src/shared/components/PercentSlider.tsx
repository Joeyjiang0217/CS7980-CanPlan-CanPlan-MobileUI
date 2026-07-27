import { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { colors, radius, shadow } from '../theme/tokens';

const THUMB_SIZE = 26;

interface PercentSliderProps {
  /** Current value, 0–100. */
  value: number;
  onChange: (next: number) => void;
  accessibilityLabel: string;
}

/**
 * Lightweight, dependency-free 0–100 slider driven by touch on its track.
 * Filled portion uses the brand color; the thumb tracks the value.
 */
export default function PercentSlider({ value, onChange, accessibilityLabel }: PercentSliderProps) {
  const widthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const updateFromX = (x: number) => {
    const width = widthRef.current;
    if (width <= 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(width, x));
    onChangeRef.current(Math.round((clamped / width) * 100));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event: GestureResponderEvent) =>
        updateFromX(event.nativeEvent.locationX),
      onPanResponderMove: (event: GestureResponderEvent) =>
        updateFromX(event.nativeEvent.locationX),
    }),
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    widthRef.current = width;
    setTrackWidth(width);
  };

  const filledWidth = (value / 100) * trackWidth;
  const thumbLeft = filledWidth - THUMB_SIZE / 2;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={styles.touchArea}
      onLayout={handleLayout}
      {...responder.panHandlers}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: filledWidth }]} />
      </View>
      <View style={[styles.thumb, { left: thumbLeft }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.onPrimary,
    ...shadow.card,
  },
});
