import { useSwipeable, SwipeableHandlers } from 'react-swipeable';

interface SwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

interface SwipeNavigationResult {
  handlers: SwipeableHandlers;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
}: SwipeNavigationOptions): SwipeNavigationResult {
  const handlers = useSwipeable({
    onSwipedLeft: onSwipeLeft,
    onSwipedRight: onSwipeRight,
    delta: 50,
    preventScrollOnSwipe: true,
    trackTouch: true,
    trackMouse: false,
  });

  return { handlers };
}
