/**
 * Throttle function that ensures a function is called at most once per specified delay
 */
export function throttle<Args extends unknown[]>(
  func: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  let lastCall = 0;
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Args | null = null;

  return (...args: Args) => {
    const now = Date.now();
    lastArgs = args;

    const timeSinceLastCall = now - lastCall;
    const shouldCallNow = timeSinceLastCall >= delay;

    if (shouldCallNow) {
      lastCall = now;
      func(...args);
    } else {
      // Schedule a call for the remaining time
      if (timeout) {
        clearTimeout(timeout);
      }
      
      const remaining = delay - timeSinceLastCall;
      timeout = setTimeout(() => {
        lastCall = Date.now();
        if (lastArgs) {
          func(...lastArgs);
        }
        timeout = null;
      }, remaining);
    }
  };
}