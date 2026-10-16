/**
 * Web Vitals monitoring — logs core metrics for performance tracking.
 * In production, these could be sent to an analytics endpoint.
 */

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

const metricsLog: WebVitalMetric[] = [];

function rateMetric(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    FID: [100, 300],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
    INP: [200, 500],
  };
  const [good, poor] = thresholds[name] || [1000, 3000];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function logMetric(name: string, value: number) {
  const metric: WebVitalMetric = {
    name,
    value: Math.round(value * 100) / 100,
    rating: rateMetric(name, value),
    timestamp: Date.now(),
  };
  metricsLog.push(metric);

  const emoji = metric.rating === 'good' ? '🟢' : metric.rating === 'needs-improvement' ? '🟡' : '🔴';
  console.debug(`[WebVitals] ${emoji} ${name}: ${metric.value}ms (${metric.rating})`);
}

export function initWebVitals() {
  // Largest Contentful Paint
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) logMetric('LCP', last.startTime);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // First Input Delay / INP
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'first-input') {
            logMetric('FID', (entry as any).processingStart - entry.startTime);
          }
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });

      // Cumulative Layout Shift
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        logMetric('CLS', clsValue);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // PerformanceObserver not fully supported
    }
  }

  // First Contentful Paint & TTFB from Navigation Timing
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (nav) {
        logMetric('TTFB', nav.responseStart - nav.requestStart);
        
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
        if (fcp) logMetric('FCP', fcp.startTime);
      }
    }, 0);
  });
}
